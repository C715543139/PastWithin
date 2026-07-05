import "fake-indexeddb/auto"

import { afterEach, describe, expect, it, vi } from "vitest"

import { createPastWithinDb, savePageWithIndexes } from "../../background/db"
import {
  searchPages,
  streamFulltextSearch,
  tokenSearchStrategy
} from "../../background/search"
import {
  bookmarkedCapturedArticle,
  defaultSettings,
  testSplitWords,
  uniqueDbName
} from "../fixtures/pages"

describe("search strategies", () => {
  let db: ReturnType<typeof createPastWithinDb> | undefined

  afterEach(async () => {
    if (db) {
      await db.delete()
      db = undefined
    }
  })

  async function seedSearchPages() {
    db = createPastWithinDb(uniqueDbName("search"))
    await savePageWithIndexes(bookmarkedCapturedArticle, {
      db,
      settings: defaultSettings,
      splitWords: testSplitWords
    })
    await savePageWithIndexes(
      {
        url: "https://example.com/pytorch",
        title: "PyTorch 调试",
        content: "torch.randint 报错发生在 PyTorch 张量生成逻辑中。另一个短关键词是 R2 和 Z轴。",
        visitTime: bookmarkedCapturedArticle.visitTime - 10_000,
        isBookmarked: false
      },
      {
        db,
        settings: defaultSettings,
        splitWords: testSplitWords
      }
    )
  }

  it("keeps token search behind the one-shot search contract", () => {
    expect(tokenSearchStrategy.mode).toBe("token")
    expect(tokenSearchStrategy.isAvailable(defaultSettings)).toBe(true)
  })

  it("finds pages by segmented Chinese keywords in token mode", async () => {
    await seedSearchPages()

    const response = await searchPages({
      db: db!,
      settings: defaultSettings,
      splitWords: testSplitWords,
      request: {
        query: "人工智能 路径规划",
        mode: "token",
        maxResults: 10
      }
    })

    expect(response.error).toBeUndefined()
    expect(response.results[0]).toMatchObject({
      title: "路径规划课程笔记",
      url: bookmarkedCapturedArticle.url,
      isBookmarked: true
    })
    expect(response.results[0].snippet).toContain("人工智能")
    expect(response.results[0].highlights).toEqual(expect.arrayContaining(["人工智能", "路径规划"]))
  })

  it("streams exact continuous text and code fragment matches in fulltext mode", async () => {
    await seedSearchPages()
    const onProgress = vi.fn()

    const response = await streamFulltextSearch({
      db: db!,
      settings: defaultSettings,
      request: {
        query: "Main.gd:328 total_len",
        maxResults: 10
      },
      batchSize: 1,
      isStopped: () => false,
      onProgress
    })

    expect(response.state).toBe("done")
    expect(response.totalCount).toBe(2)
    expect(response.scannedCount).toBe(2)
    expect(response.results).toHaveLength(1)
    expect(response.results[0].title).toBe("路径规划课程笔记")
    expect(response.results[0].snippet).toContain("Main.gd:328 total_len")
    expect(response.results[0].highlights).toEqual(["Main.gd:328 total_len"])
    expect(onProgress).toHaveBeenCalledWith({
      scannedCount: 0,
      totalCount: 2,
      matchedCount: 0
    })
    expect(onProgress).toHaveBeenLastCalledWith({
      scannedCount: 2,
      totalCount: 2,
      matchedCount: 1
    })
  })

  it("falls back to the title snippet when token search only matches the title", async () => {
    db = createPastWithinDb(uniqueDbName("title-only-search"))
    await savePageWithIndexes(
      {
        url: "https://example.com/title-only",
        title: "PyTorch 调试",
        content: "这里记录一个没有相关分词命中的普通全文。",
        visitTime: bookmarkedCapturedArticle.visitTime,
        isBookmarked: false
      },
      {
        db,
        settings: defaultSettings,
        splitWords: testSplitWords
      }
    )

    const response = await searchPages({
      db,
      settings: defaultSettings,
      splitWords: testSplitWords,
      request: {
        query: "pytorch",
        mode: "token",
        maxResults: 10
      }
    })

    expect(response.results).toHaveLength(1)
    expect(response.results[0]).toMatchObject({
      title: "PyTorch 调试",
      snippet: "PyTorch 调试"
    })
    expect(response.results[0].highlights).toEqual(expect.arrayContaining(["pytorch"]))
  })

  it("allows short but distinctive fulltext queries in the stream", async () => {
    await seedSearchPages()

    const response = await streamFulltextSearch({
      db: db!,
      settings: defaultSettings,
      request: {
        query: "R2",
        maxResults: 10
      },
      isStopped: () => false,
      onProgress: vi.fn()
    })

    expect(response.results[0].title).toBe("PyTorch 调试")
    expect(response.results[0].snippet).toContain("R2")
  })

  it("stops fulltext streaming and returns partial results", async () => {
    await seedSearchPages()
    let stopped = false

    const response = await streamFulltextSearch({
      db: db!,
      settings: defaultSettings,
      request: {
        query: "路径规划",
        maxResults: 10
      },
      batchSize: 1,
      isStopped: () => stopped,
      onProgress: ({ scannedCount }) => {
        if (scannedCount >= 1) stopped = true
      }
    })

    expect(response.state).toBe("stopped")
    expect(response.scannedCount).toBe(1)
    expect(response.totalCount).toBe(2)
    expect(response.results[0].title).toBe("路径规划课程笔记")
  })

  it("rejects fulltext stream when saved content is disabled", async () => {
    await seedSearchPages()

    await expect(streamFulltextSearch({
      db: db!,
      settings: {
        ...defaultSettings,
        saveContentEnabled: false
      },
      request: {
        query: "Main.gd:328 total_len",
        maxResults: 10
      },
      isStopped: () => false,
      onProgress: vi.fn()
    })).rejects.toThrow(/unavailable|disabled/i)
  })
})
