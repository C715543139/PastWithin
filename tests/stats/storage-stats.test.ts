import "fake-indexeddb/auto"

import { afterEach, describe, expect, it, vi } from "vitest"

import {
  clearSavedContent,
  createPastWithinDb,
  getStorageStats,
  savePageWithIndexes
} from "../../background/db"
import {
  bookmarkedCapturedArticle,
  defaultSettings,
  testSplitWords,
  uniqueDbName
} from "../fixtures/pages"

describe("storage stats", () => {
  let db: ReturnType<typeof createPastWithinDb> | undefined

  afterEach(async () => {
    vi.unstubAllGlobals()
    if (db) {
      await db.delete()
      db = undefined
    }
  })

  it("returns browser storage estimates and local record counts", async () => {
    db = createPastWithinDb(uniqueDbName("stats"))
    vi.stubGlobal("navigator", {
      storage: {
        estimate: vi.fn().mockResolvedValue({
          usage: 12_345,
          quota: 987_654
        })
      }
    })

    await savePageWithIndexes(bookmarkedCapturedArticle, {
      db,
      settings: defaultSettings,
      splitWords: testSplitWords
    })

    const stats = await getStorageStats(db)

    expect(stats).toEqual({
      usageBytes: 12_345,
      quotaBytes: 987_654,
      pageCount: 1,
      contentCount: 1
    })
  })

  it("can clear saved raw content without deleting page metadata or token indexes", async () => {
    db = createPastWithinDb(uniqueDbName("clear-content"))

    await savePageWithIndexes(bookmarkedCapturedArticle, {
      db,
      settings: defaultSettings,
      splitWords: testSplitWords
    })

    await clearSavedContent(db)
    const stats = await getStorageStats(db)
    const content = await db.pageContents.toCollection().first()

    expect(stats.pageCount).toBe(1)
    expect(stats.contentCount).toBe(0)
    expect(content?.content ?? "").toBe("")
    expect(content?.contentWords).toEqual(expect.arrayContaining(["人工智能", "路径规划"]))
  })
})

