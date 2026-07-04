import "fake-indexeddb/auto"

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi
} from "vitest"

import {
  BOOKMARK_STATUS_LAST_ERROR_KEY,
  BOOKMARK_STATUS_LAST_SYNC_KEY,
  collectBookmarkUrls,
  registerBookmarkSync,
  runBookmarkStatusSync,
  scheduleBookmarkStatusSync
} from "../../background/bookmarkSync"
import {
  createPastWithinDb,
  getPageByNormalizedUrl,
  savePageWithIndexes,
  syncBookmarkStatuses,
  updateBookmarkStatusByUrl
} from "../../background/db"
import {
  bookmarkedCapturedArticle,
  defaultSettings,
  NORMALIZED_ARTICLE_URL,
  testSplitWords,
  uniqueDbName
} from "../fixtures/pages"

const originalChrome = (globalThis as { chrome?: unknown }).chrome

type BookmarkTreeNode = Omit<chrome.bookmarks.BookmarkTreeNode, "syncing" | "children"> & {
  syncing?: boolean
  children?: BookmarkTreeNode[]
}

type IsUrlBookmarkedMock = ReturnType<
  typeof vi.fn<(url: string) => Promise<boolean>>
>

interface BookmarkRemoveInfo {
  parentId: string
  index: number
  node: BookmarkTreeNode
}

type CreatedListener = (id: string, bookmark: BookmarkTreeNode) => void
type RemovedListener = (id: string, removeInfo: BookmarkRemoveInfo) => void

function createMockEvent() {
  const listeners: Array<(...args: any[]) => void> = []
  return {
    addListener: vi.fn((fn: (...args: any[]) => void) => {
      listeners.push(fn)
    }),
    removeListener: vi.fn(),
    hasListener: vi.fn(),
    _fire: (...args: any[]) => {
      for (const fn of listeners) {
        fn(...args)
      }
    }
  }
}

interface MockBookmarks {
  getTree: ReturnType<typeof vi.fn>
  onCreated: ReturnType<typeof createMockEvent>
  onRemoved: ReturnType<typeof createMockEvent>
}

interface MockChrome {
  bookmarks?: MockBookmarks
  storage?: {
    local: {
      get: ReturnType<typeof vi.fn>
      set: ReturnType<typeof vi.fn>
    }
  }
}

function setupChrome(partial: MockChrome) {
  ;(globalThis as { chrome: Record<string, unknown> }).chrome =
    partial as unknown as Record<string, unknown>
}

function restoreChrome() {
  if (originalChrome === undefined) {
    delete (globalThis as { chrome?: unknown }).chrome
  } else {
    ;(globalThis as { chrome?: unknown }).chrome = originalChrome
  }
}

function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

describe("collectBookmarkUrls", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    restoreChrome()
  })

  it("collects URLs from bookmark tree recursively and deduplicates", async () => {
    const tree: BookmarkTreeNode[] = [
      {
        id: "0",
        title: "",
        children: [
          {
            id: "1",
            title: "Bookmarks Bar",
            children: [
              { id: "2", title: "Example", url: "https://example.com" },
              { id: "3", title: "Example Dup", url: "https://example.com" }
            ]
          },
          {
            id: "4",
            title: "Other Bookmarks",
            children: [
              {
                id: "5",
                title: "Folder",
                children: [
                  {
                    id: "6",
                    title: "Nested",
                    url: "https://nested.com/page?q=1#frag"
                  }
                ]
              },
              { id: "7", title: "Test", url: "https://test.com" }
            ]
          }
        ]
      }
    ]

    setupChrome({
      bookmarks: {
        getTree: vi.fn().mockResolvedValue(tree),
        onCreated: createMockEvent(),
        onRemoved: createMockEvent()
      }
    })

    const urls = await collectBookmarkUrls()
    expect(urls).toHaveLength(3)
    expect(urls).toContain("https://example.com")
    expect(urls).toContain("https://nested.com/page?q=1#frag")
    expect(urls).toContain("https://test.com")
  })

  it("skips folder nodes without urls", async () => {
    const tree: BookmarkTreeNode[] = [
      {
        id: "0",
        title: "",
        children: [
          {
            id: "1",
            title: "Empty Folder",
            children: []
          }
        ]
      }
    ]

    setupChrome({
      bookmarks: {
        getTree: vi.fn().mockResolvedValue(tree),
        onCreated: createMockEvent(),
        onRemoved: createMockEvent()
      }
    })

    const urls = await collectBookmarkUrls()
    expect(urls).toHaveLength(0)
  })

  it("returns empty array when chrome.bookmarks is unavailable", async () => {
    setupChrome({})
    const urls = await collectBookmarkUrls()
    expect(urls).toEqual([])
  })

  it("rejects when getTree throws so callers can abort status sync", async () => {
    setupChrome({
      bookmarks: {
        getTree: vi.fn().mockRejectedValue(new Error("getTree failed")),
        onCreated: createMockEvent(),
        onRemoved: createMockEvent()
      }
    })

    await expect(collectBookmarkUrls()).rejects.toThrow(
      "Failed to collect bookmark URLs"
    )
  })
})

describe("registerBookmarkSync", () => {
  let onCreated: ReturnType<typeof createMockEvent>
  let onRemoved: ReturnType<typeof createMockEvent>
  let isUrlBookmarkedMock: IsUrlBookmarkedMock
  let db: ReturnType<typeof createPastWithinDb>

  beforeEach(async () => {
    vi.clearAllMocks()
    onCreated = createMockEvent()
    onRemoved = createMockEvent()
    isUrlBookmarkedMock = vi.fn<(url: string) => Promise<boolean>>()
    db = createPastWithinDb(uniqueDbName("reg-sync"))
  })

  afterEach(async () => {
    restoreChrome()
    if (db) {
      await db.delete()
      db = undefined as unknown as ReturnType<typeof createPastWithinDb>
    }
  })

  it("registers onCreated and onRemoved listeners when chrome.bookmarks is available", () => {
    setupChrome({
      bookmarks: {
        getTree: vi.fn(),
        onCreated,
        onRemoved
      }
    })

    registerBookmarkSync({ db, isUrlBookmarked: isUrlBookmarkedMock })

    expect(onCreated.addListener).toHaveBeenCalledOnce()
    expect(onRemoved.addListener).toHaveBeenCalledOnce()
  })

  it("does not throw when chrome.bookmarks is unavailable", () => {
    setupChrome({})

    expect(() => {
      registerBookmarkSync({ db, isUrlBookmarked: isUrlBookmarkedMock })
    }).not.toThrow()
  })

  it("updates bookmark status to true when a bookmark is created", async () => {
    setupChrome({
      bookmarks: {
        getTree: vi.fn(),
        onCreated,
        onRemoved
      }
    })

    await savePageWithIndexes(
      { ...bookmarkedCapturedArticle, isBookmarked: false },
      { db, settings: defaultSettings, splitWords: testSplitWords }
    )

    registerBookmarkSync({ db, isUrlBookmarked: isUrlBookmarkedMock })

    onCreated._fire("bm-1", {
      id: "bm-1",
      title: "New Bookmark",
      url: bookmarkedCapturedArticle.url
    })

    await flushMicrotasks()

    const page = await getPageByNormalizedUrl(db, NORMALIZED_ARTICLE_URL)
    expect(page?.isBookmarked).toBe(true)
  })

  it("skips onCreated when bookmark node has no url (folder)", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})

    setupChrome({
      bookmarks: {
        getTree: vi.fn(),
        onCreated,
        onRemoved
      }
    })

    await savePageWithIndexes(
      { ...bookmarkedCapturedArticle, isBookmarked: false },
      { db, settings: defaultSettings, splitWords: testSplitWords }
    )

    registerBookmarkSync({ db, isUrlBookmarked: isUrlBookmarkedMock })

    onCreated._fire("bm-folder", {
      id: "bm-folder",
      title: "New Folder",
      children: []
    })

    await flushMicrotasks()

    const result = await syncBookmarkStatuses(db, [])
    expect(warnSpy).not.toHaveBeenCalled()

    warnSpy.mockRestore()
  })

  it("sets isBookmarked to false when bookmark is removed and no other bookmark has same url", async () => {
    setupChrome({
      bookmarks: {
        getTree: vi.fn(),
        onCreated,
        onRemoved
      }
    })

    isUrlBookmarkedMock.mockResolvedValue(false)

    await savePageWithIndexes(bookmarkedCapturedArticle, {
      db,
      settings: defaultSettings,
      splitWords: testSplitWords
    })

    registerBookmarkSync({ db, isUrlBookmarked: isUrlBookmarkedMock })

    onRemoved._fire("bm-1", {
      parentId: "parent",
      index: 0,
      node: {
        id: "bm-1",
        title: "Old Bookmark",
        url: bookmarkedCapturedArticle.url
      }
    })

    await flushMicrotasks()

    const pageRemoved = await getPageByNormalizedUrl(db, NORMALIZED_ARTICLE_URL)
    expect(pageRemoved?.isBookmarked).toBe(false)
  })

  it("keeps isBookmarked=true when bookmark is removed but another bookmark still has same url", async () => {
    setupChrome({
      bookmarks: {
        getTree: vi.fn(),
        onCreated,
        onRemoved
      }
    })

    isUrlBookmarkedMock.mockResolvedValue(true)

    await savePageWithIndexes(bookmarkedCapturedArticle, {
      db,
      settings: defaultSettings,
      splitWords: testSplitWords
    })

    registerBookmarkSync({ db, isUrlBookmarked: isUrlBookmarkedMock })

    onRemoved._fire("bm-1", {
      parentId: "parent",
      index: 0,
      node: {
        id: "bm-1",
        title: "Old Bookmark",
        url: bookmarkedCapturedArticle.url
      }
    })

    await flushMicrotasks()

    const pageKept = await getPageByNormalizedUrl(db, NORMALIZED_ARTICLE_URL)
    expect(pageKept?.isBookmarked).toBe(true)
  })

  it("skips onRemoved when removed node has no url (folder)", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})

    setupChrome({
      bookmarks: {
        getTree: vi.fn(),
        onCreated,
        onRemoved
      }
    })

    registerBookmarkSync({ db, isUrlBookmarked: isUrlBookmarkedMock })

    onRemoved._fire("bm-folder", {
      parentId: "parent",
      index: 0,
      node: {
        id: "bm-folder",
        title: "Folder",
        children: []
      }
    })

    await flushMicrotasks()

    expect(isUrlBookmarkedMock).not.toHaveBeenCalled()
    expect(warnSpy).not.toHaveBeenCalled()

    warnSpy.mockRestore()
  })

  it("does not console.warn when onCreated URL does not match any saved page", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})

    setupChrome({
      bookmarks: {
        getTree: vi.fn(),
        onCreated,
        onRemoved
      }
    })

    registerBookmarkSync({ db, isUrlBookmarked: isUrlBookmarkedMock })

    onCreated._fire("bm-1", {
      id: "bm-1",
      title: "New Bookmark",
      url: "https://nonexistent-url.com/page"
    })

    await flushMicrotasks()

    expect(warnSpy).not.toHaveBeenCalledWith(
      expect.stringContaining("Failed to update bookmark status onCreated:")
    )

    warnSpy.mockRestore()
  })
})

describe("scheduleBookmarkStatusSync throttle", () => {
  let storageData: Record<string, unknown>
  let storageGet: ReturnType<typeof vi.fn>
  let storageSet: ReturnType<typeof vi.fn>
  let db: ReturnType<typeof createPastWithinDb>

  beforeEach(async () => {
    vi.clearAllMocks()
    storageData = {}
    storageGet = vi.fn((keys: string | string[] | Record<string, unknown>) => {
      const keyList = Array.isArray(keys)
        ? keys
        : typeof keys === "string"
          ? [keys]
          : Object.keys(keys)
      const result: Record<string, unknown> = {}
      for (const key of keyList) {
        if (key in storageData) {
          result[key] = storageData[key]
        }
      }
      return Promise.resolve(result)
    })
    storageSet = vi.fn((items: Record<string, unknown>) => {
      Object.assign(storageData, items)
      return Promise.resolve()
    })
    db = createPastWithinDb(uniqueDbName("throttle"))
  })

  afterEach(async () => {
    restoreChrome()
    vi.useRealTimers()
    if (db) {
      await db.delete()
      db = undefined as unknown as ReturnType<typeof createPastWithinDb>
    }
  })

  it("skips sync when lastSyncAt is within throttle window", async () => {
    vi.useFakeTimers()

    storageData[BOOKMARK_STATUS_LAST_SYNC_KEY] = Date.now() - 1000

    setupChrome({
      storage: { local: { get: storageGet, set: storageSet } },
      bookmarks: {
        getTree: vi.fn().mockResolvedValue([]),
        onCreated: createMockEvent(),
        onRemoved: createMockEvent()
      }
    })

    scheduleBookmarkStatusSync({ db, delayMs: 0, throttleMs: 3600_000 })

    await vi.runAllTimersAsync()

    expect(storageSet).not.toHaveBeenCalled()
  })

  it("runs sync when lastSyncAt is past throttle window", async () => {
    vi.useFakeTimers()

    storageData[BOOKMARK_STATUS_LAST_SYNC_KEY] =
      Date.now() - 25 * 60 * 60 * 1000

    setupChrome({
      storage: { local: { get: storageGet, set: storageSet } },
      bookmarks: {
        getTree: vi.fn().mockResolvedValue([]),
        onCreated: createMockEvent(),
        onRemoved: createMockEvent()
      }
    })

    scheduleBookmarkStatusSync({ db, delayMs: 0, throttleMs: 3600_000 })

    await vi.runAllTimersAsync()

    expect(storageSet).toHaveBeenCalledWith(
      expect.objectContaining({
        [BOOKMARK_STATUS_LAST_SYNC_KEY]: expect.any(Number)
      })
    )
  })

  it("runs sync when no prior sync time exists", async () => {
    vi.useFakeTimers()

    setupChrome({
      storage: { local: { get: storageGet, set: storageSet } },
      bookmarks: {
        getTree: vi.fn().mockResolvedValue([]),
        onCreated: createMockEvent(),
        onRemoved: createMockEvent()
      }
    })

    scheduleBookmarkStatusSync({ db, delayMs: 0, throttleMs: 3600_000 })

    await vi.runAllTimersAsync()

    expect(storageSet).toHaveBeenCalled()
  })

  it("console.warns, records failure, and does not write last sync time on failure", async () => {
    vi.useFakeTimers()
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})

    setupChrome({
      storage: { local: { get: storageGet, set: storageSet } },
      bookmarks: {
        getTree: vi.fn().mockRejectedValue(new Error("tree error")),
        onCreated: createMockEvent(),
        onRemoved: createMockEvent()
      }
    })

    scheduleBookmarkStatusSync({ db, delayMs: 0, throttleMs: 3600_000 })

    await vi.runAllTimersAsync()

    expect(warnSpy).toHaveBeenCalledWith(
      "Bookmark status sync failed:",
      expect.any(Error)
    )
    expect(storageSet).toHaveBeenCalledWith(
      expect.objectContaining({
        [BOOKMARK_STATUS_LAST_ERROR_KEY]: expect.objectContaining({
          at: expect.any(Number),
          message: "Failed to collect bookmark URLs"
        })
      })
    )
    expect(storageData[BOOKMARK_STATUS_LAST_SYNC_KEY]).toBeUndefined()

    warnSpy.mockRestore()
  })
})

describe("runBookmarkStatusSync", () => {
  let db: ReturnType<typeof createPastWithinDb>

  beforeEach(async () => {
    vi.clearAllMocks()
    db = createPastWithinDb(uniqueDbName("run-sync"))
  })

  afterEach(async () => {
    restoreChrome()
    if (db) {
      await db.delete()
      db = undefined as unknown as ReturnType<typeof createPastWithinDb>
    }
  })

  it("collects bookmarks and syncs statuses for existing pages", async () => {
    const tree: BookmarkTreeNode[] = [
      {
        id: "0",
        title: "",
        children: [
          {
            id: "1",
            title: "Bookmarks Bar",
            children: [
              { id: "2", title: "Example", url: bookmarkedCapturedArticle.url }
            ]
          }
        ]
      }
    ]

    setupChrome({
      bookmarks: {
        getTree: vi.fn().mockResolvedValue(tree),
        onCreated: createMockEvent(),
        onRemoved: createMockEvent()
      }
    })

    await savePageWithIndexes(
      { ...bookmarkedCapturedArticle, isBookmarked: false },
      { db, settings: defaultSettings, splitWords: testSplitWords }
    )

    const result = await runBookmarkStatusSync({ db })

    expect(result.checkedCount).toBe(1)
    expect(result.updatedCount).toBe(1)
  })

  it("returns zero updatedCount when all bookmarks already match", async () => {
    const tree: BookmarkTreeNode[] = [
      {
        id: "0",
        title: "",
        children: [
          {
            id: "1",
            title: "Bookmarks Bar",
            children: [
              { id: "2", title: "Example", url: bookmarkedCapturedArticle.url }
            ]
          }
        ]
      }
    ]

    setupChrome({
      bookmarks: {
        getTree: vi.fn().mockResolvedValue(tree),
        onCreated: createMockEvent(),
        onRemoved: createMockEvent()
      }
    })

    await savePageWithIndexes(bookmarkedCapturedArticle, {
      db,
      settings: defaultSettings,
      splitWords: testSplitWords
    })

    const result = await runBookmarkStatusSync({ db })

    expect(result.checkedCount).toBe(1)
    expect(result.updatedCount).toBe(0)
  })

  it("sets isBookmarked to false for pages not in bookmark tree", async () => {
    setupChrome({
      bookmarks: {
        getTree: vi.fn().mockResolvedValue([]),
        onCreated: createMockEvent(),
        onRemoved: createMockEvent()
      }
    })

    await savePageWithIndexes(bookmarkedCapturedArticle, {
      db,
      settings: defaultSettings,
      splitWords: testSplitWords
    })

    const result = await runBookmarkStatusSync({ db })

    expect(result.checkedCount).toBe(1)
    expect(result.updatedCount).toBe(1)
  })

  it("skips database updates when chrome.bookmarks is unavailable", async () => {
    setupChrome({})

    await savePageWithIndexes(bookmarkedCapturedArticle, {
      db,
      settings: defaultSettings,
      splitWords: testSplitWords
    })

    const result = await runBookmarkStatusSync({ db })

    expect(result.checkedCount).toBe(0)
    expect(result.updatedCount).toBe(0)

    const page = await getPageByNormalizedUrl(db, NORMALIZED_ARTICLE_URL)
    expect(page?.isBookmarked).toBe(true)
  })
})
