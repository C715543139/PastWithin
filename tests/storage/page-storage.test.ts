import "fake-indexeddb/auto"

import { afterEach, describe, expect, it } from "vitest"

import {
  clearAllData,
  createPastWithinDb,
  getPageByNormalizedUrl,
  getPageContent,
  savePageWithIndexes
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

    const content = await getPageContent(db, page!.id)
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
})

