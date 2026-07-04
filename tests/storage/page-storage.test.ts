import "fake-indexeddb/auto"

import { afterEach, describe, expect, it } from "vitest"

import {
  clearAllData,
  createPastWithinDb,
  getPageByNormalizedUrl,
  getPageContent,
  savePageWithIndexes,
  syncBookmarkStatuses,
  updateBookmarkStatusByUrl
} from "../../background/db"
import {
  NORMALIZED_ARTICLE_URL,
  bookmarkedCapturedArticle,
  defaultSettings,
  testSplitWords,
  uniqueDbName
} from "../fixtures/pages"

describe("IndexedDB page storage", () => {
  let db: ReturnType<typeof createPastWithinDb> | undefined

  afterEach(async () => {
    if (db) {
      await db.delete()
      db = undefined
    }
  })

  it("saves page metadata, content, bookmark status, and token indexes", async () => {
    db = createPastWithinDb(uniqueDbName("page-storage"))

    await savePageWithIndexes(bookmarkedCapturedArticle, {
      db,
      settings: defaultSettings,
      splitWords: testSplitWords
    })

    const page = await getPageByNormalizedUrl(db, NORMALIZED_ARTICLE_URL)
    expect(page).toMatchObject({
      url: bookmarkedCapturedArticle.url,
      normalizedUrl: NORMALIZED_ARTICLE_URL,
      title: bookmarkedCapturedArticle.title,
      visitTime: bookmarkedCapturedArticle.visitTime,
      isBookmarked: true
    })
    expect(page?.contentLength).toBe(bookmarkedCapturedArticle.content.length)
    expect(page?.id).toBeDefined()

    const content = await getPageContent(db, page!.id!)
    expect(content?.content).toContain("老师发的基础换道控制器")
    expect(content?.titleWords).toEqual(expect.arrayContaining(["路径规划"]))
    expect(content?.contentWords).toEqual(expect.arrayContaining(["人工智能", "dwa", "cbs"]))
  })

  it("updates an existing normalized url instead of creating duplicates", async () => {
    db = createPastWithinDb(uniqueDbName("page-upsert"))

    await savePageWithIndexes(bookmarkedCapturedArticle, {
      db,
      settings: defaultSettings,
      splitWords: testSplitWords
    })
    await savePageWithIndexes(
      {
        ...bookmarkedCapturedArticle,
        url: `${NORMALIZED_ARTICLE_URL}#another-section`,
        title: "路径规划课程笔记更新",
        visitTime: bookmarkedCapturedArticle.visitTime + 1_000
      },
      {
        db,
        settings: defaultSettings,
        splitWords: testSplitWords
      }
    )

    expect(await db.pages.count()).toBe(1)
    const page = await getPageByNormalizedUrl(db, NORMALIZED_ARTICLE_URL)
    expect(page?.title).toBe("路径规划课程笔记更新")
    expect(page?.visitTime).toBe(bookmarkedCapturedArticle.visitTime + 1_000)
  })

  it("keeps previously saved fulltext content when fulltext saving is disabled", async () => {
    db = createPastWithinDb(uniqueDbName("keep-existing-content"))

    await savePageWithIndexes(bookmarkedCapturedArticle, {
      db,
      settings: defaultSettings,
      splitWords: testSplitWords
    })

    await savePageWithIndexes(
      {
        ...bookmarkedCapturedArticle,
        title: "PyTorch 调试记录",
        content: "torch.randint 报错发生在 PyTorch 张量生成逻辑中。",
        visitTime: bookmarkedCapturedArticle.visitTime + 1_000
      },
      {
        db,
        settings: { ...defaultSettings, saveContentEnabled: false },
        splitWords: testSplitWords
      }
    )

    const page = await getPageByNormalizedUrl(db, NORMALIZED_ARTICLE_URL)
    const content = await getPageContent(db, page!.id!)

    expect(content?.content).toContain("老师发的基础换道控制器")
    expect(content?.contentWords).toEqual(expect.arrayContaining(["torch", "randint"]))
  })

  it("can clear all local page data", async () => {
    db = createPastWithinDb(uniqueDbName("clear-data"))

    await savePageWithIndexes(bookmarkedCapturedArticle, {
      db,
      settings: defaultSettings,
      splitWords: testSplitWords
    })

    await clearAllData(db)

    expect(await db.pages.count()).toBe(0)
    expect(await db.pageContents.count()).toBe(0)
  })

  describe("updateBookmarkStatusByUrl", () => {
    it("updates isBookmarked from false to true for an existing page", async () => {
      db = createPastWithinDb(uniqueDbName("bm-update-true"))

      await savePageWithIndexes(
        { ...bookmarkedCapturedArticle, isBookmarked: false },
        { db, settings: defaultSettings, splitWords: testSplitWords }
      )

      const result = await updateBookmarkStatusByUrl(
        db,
        bookmarkedCapturedArticle.url,
        true
      )

      expect(result).toBe(true)

      const page = await getPageByNormalizedUrl(db, NORMALIZED_ARTICLE_URL)
      expect(page?.isBookmarked).toBe(true)
    })

    it("updates isBookmarked from true to false for an existing page", async () => {
      db = createPastWithinDb(uniqueDbName("bm-update-false"))

      await savePageWithIndexes(bookmarkedCapturedArticle, {
        db,
        settings: defaultSettings,
        splitWords: testSplitWords
      })

      const result = await updateBookmarkStatusByUrl(
        db,
        bookmarkedCapturedArticle.url,
        false
      )

      expect(result).toBe(true)

      const page = await getPageByNormalizedUrl(db, NORMALIZED_ARTICLE_URL)
      expect(page?.isBookmarked).toBe(false)
    })

    it("returns false when the URL does not match any page", async () => {
      db = createPastWithinDb(uniqueDbName("bm-update-missing"))

      const result = await updateBookmarkStatusByUrl(
        db,
        "https://not-saved.com/page",
        true
      )

      expect(result).toBe(false)
      expect(await db.pages.count()).toBe(0)
    })

    it("does not write when status is already the same", async () => {
      db = createPastWithinDb(uniqueDbName("bm-update-noop"))

      await savePageWithIndexes(bookmarkedCapturedArticle, {
        db,
        settings: defaultSettings,
        splitWords: testSplitWords
      })

      const pageBefore = await getPageByNormalizedUrl(
        db,
        NORMALIZED_ARTICLE_URL
      )
      const updatedAtBefore = pageBefore!.updatedAt

      const result = await updateBookmarkStatusByUrl(
        db,
        bookmarkedCapturedArticle.url,
        true
      )

      expect(result).toBe(true)

      const pageAfter = await getPageByNormalizedUrl(db, NORMALIZED_ARTICLE_URL)
      expect(pageAfter?.updatedAt).toBe(updatedAtBefore)
    })

    it("matches by normalizedUrl even when input URL has a hash", async () => {
      db = createPastWithinDb(uniqueDbName("bm-update-hash"))

      await savePageWithIndexes(
        { ...bookmarkedCapturedArticle, isBookmarked: false },
        { db, settings: defaultSettings, splitWords: testSplitWords }
      )

      const result = await updateBookmarkStatusByUrl(
        db,
        `${NORMALIZED_ARTICLE_URL}#some-section`,
        true
      )

      expect(result).toBe(true)

      const page = await getPageByNormalizedUrl(db, NORMALIZED_ARTICLE_URL)
      expect(page?.isBookmarked).toBe(true)
    })

    it("does not modify visitTime", async () => {
      db = createPastWithinDb(uniqueDbName("bm-update-visittime"))

      await savePageWithIndexes(
        { ...bookmarkedCapturedArticle, isBookmarked: false },
        { db, settings: defaultSettings, splitWords: testSplitWords }
      )

      const pageBefore = await getPageByNormalizedUrl(
        db,
        NORMALIZED_ARTICLE_URL
      )
      const visitTimeBefore = pageBefore!.visitTime

      await updateBookmarkStatusByUrl(db, bookmarkedCapturedArticle.url, true)

      const pageAfter = await getPageByNormalizedUrl(db, NORMALIZED_ARTICLE_URL)
      expect(pageAfter?.visitTime).toBe(visitTimeBefore)
    })
  })

  describe("syncBookmarkStatuses", () => {
    it("updates pages whose isBookmarked differs from the bookmarked set", async () => {
      db = createPastWithinDb(uniqueDbName("sync-diff"))

      await savePageWithIndexes(
        { ...bookmarkedCapturedArticle, isBookmarked: false },
        { db, settings: defaultSettings, splitWords: testSplitWords }
      )

      const result = await syncBookmarkStatuses(db, [
        bookmarkedCapturedArticle.url
      ])

      expect(result.checkedCount).toBe(1)
      expect(result.updatedCount).toBe(1)

      const page = await getPageByNormalizedUrl(db, NORMALIZED_ARTICLE_URL)
      expect(page?.isBookmarked).toBe(true)
    })

    it("returns updatedCount=0 when all statuses already match", async () => {
      db = createPastWithinDb(uniqueDbName("sync-nodiff"))

      await savePageWithIndexes(bookmarkedCapturedArticle, {
        db,
        settings: defaultSettings,
        splitWords: testSplitWords
      })

      const result = await syncBookmarkStatuses(db, [
        bookmarkedCapturedArticle.url
      ])

      expect(result.checkedCount).toBe(1)
      expect(result.updatedCount).toBe(0)

      const page = await getPageByNormalizedUrl(db, NORMALIZED_ARTICLE_URL)
      expect(page?.isBookmarked).toBe(true)
    })

    it("sets isBookmarked to false when URL is not in the bookmarked set", async () => {
      db = createPastWithinDb(uniqueDbName("sync-unmark"))

      await savePageWithIndexes(bookmarkedCapturedArticle, {
        db,
        settings: defaultSettings,
        splitWords: testSplitWords
      })

      const result = await syncBookmarkStatuses(db, [])

      expect(result.checkedCount).toBe(1)
      expect(result.updatedCount).toBe(1)

      const page = await getPageByNormalizedUrl(db, NORMALIZED_ARTICLE_URL)
      expect(page?.isBookmarked).toBe(false)
    })

    it("matches by normalizedUrl (hash differences are ignored)", async () => {
      db = createPastWithinDb(uniqueDbName("sync-hash"))

      await savePageWithIndexes(
        { ...bookmarkedCapturedArticle, isBookmarked: false },
        { db, settings: defaultSettings, splitWords: testSplitWords }
      )

      const result = await syncBookmarkStatuses(db, [
        `${NORMALIZED_ARTICLE_URL}#different-section`
      ])

      expect(result.checkedCount).toBe(1)
      expect(result.updatedCount).toBe(1)

      const page = await getPageByNormalizedUrl(db, NORMALIZED_ARTICLE_URL)
      expect(page?.isBookmarked).toBe(true)
    })

    it("only updates pages with status changes", async () => {
      db = createPastWithinDb(uniqueDbName("sync-partial"))

      const url2 = "https://other-site.com/page"

      await savePageWithIndexes(bookmarkedCapturedArticle, {
        db,
        settings: defaultSettings,
        splitWords: testSplitWords
      })

      await savePageWithIndexes(
        {
          ...bookmarkedCapturedArticle,
          url: url2,
          isBookmarked: false
        },
        { db, settings: defaultSettings, splitWords: testSplitWords }
      )

      const result = await syncBookmarkStatuses(db, [
        bookmarkedCapturedArticle.url,
        url2
      ])

      expect(result.checkedCount).toBe(2)
      expect(result.updatedCount).toBe(1)
    })

    it("does not modify visitTime", async () => {
      db = createPastWithinDb(uniqueDbName("sync-visittime"))

      await savePageWithIndexes(
        { ...bookmarkedCapturedArticle, isBookmarked: false },
        { db, settings: defaultSettings, splitWords: testSplitWords }
      )

      const pageBefore = await getPageByNormalizedUrl(
        db,
        NORMALIZED_ARTICLE_URL
      )

      await syncBookmarkStatuses(db, [bookmarkedCapturedArticle.url])

      const pageAfter = await getPageByNormalizedUrl(db, NORMALIZED_ARTICLE_URL)
      expect(pageAfter?.visitTime).toBe(pageBefore!.visitTime)
    })
  })
})
