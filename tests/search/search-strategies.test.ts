import "fake-indexeddb/auto"

import { afterEach, describe, expect, it } from "vitest"

import { createPastWithinDb, savePageWithIndexes } from "../../background/db"
import { fulltextSearchStrategy, searchPages, tokenSearchStrategy } from "../../background/search"
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

  it("keeps token and fulltext strategies behind a common availability contract", () => {
    expect(tokenSearchStrategy.mode).toBe("token")
    expect(fulltextSearchStrategy.mode).toBe("fulltext")
    expect(tokenSearchStrategy.isAvailable(defaultSettings)).toBe(true)
    expect(fulltextSearchStrategy.isAvailable(defaultSettings)).toBe(true)
    expect(fulltextSearchStrategy.isAvailable({ ...defaultSettings, saveContentEnabled: false })).toBe(false)
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

  it("finds exact continuous text and code fragments in fulltext mode", async () => {
    await seedSearchPages()

    const response = await searchPages({
      db: db!,
      settings: defaultSettings,
      splitWords: testSplitWords,
      request: {
        query: "Main.gd:328 total_len",
        mode: "fulltext",
        maxResults: 10
      }
    })

    expect(response.error).toBeUndefined()
    expect(response.results).toHaveLength(1)
    expect(response.results[0].title).toBe("路径规划课程笔记")
    expect(response.results[0].snippet).toContain("Main.gd:328 total_len")
    expect(response.results[0].highlights).toEqual(["Main.gd:328 total_len"])
  })

  it("allows short but distinctive fulltext queries", async () => {
    await seedSearchPages()

    const response = await searchPages({
      db: db!,
      settings: defaultSettings,
      splitWords: testSplitWords,
      request: {
        query: "R2",
        mode: "fulltext",
        maxResults: 10
      }
    })

    expect(response.error).toBeUndefined()
    expect(response.results[0].title).toBe("PyTorch 调试")
    expect(response.results[0].snippet).toContain("R2")
  })

  it("rejects fulltext search when saved content is disabled", async () => {
    await seedSearchPages()

    const response = await searchPages({
      db: db!,
      settings: {
        ...defaultSettings,
        saveContentEnabled: false
      },
      splitWords: testSplitWords,
      request: {
        query: "Main.gd:328 total_len",
        mode: "fulltext",
        maxResults: 10
      }
    })

    expect(response.results).toEqual([])
    expect(response.error).toMatch(/unavailable|disabled/i)
  })
})

