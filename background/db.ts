import Dexie, { type EntityTable } from "dexie"

import { normalizeUrl } from "../lib/normalize"
import type {
  AppSettings,
  CapturedPage,
  PageContentRecord,
  PageRecord,
  StorageStats
} from "../lib/types"

export interface PastWithinDb extends Dexie {
  pages: EntityTable<PageRecord, "id">
  pageContents: EntityTable<PageContentRecord, "pageId">
}

export function createPastWithinDb(dbName: string): PastWithinDb {
  const db = new Dexie(dbName) as PastWithinDb

  db.version(1).stores({
    pages: "++id,&pageKey,&normalizedUrl,visitTime,isBookmarked",
    pageContents: "&pageId,*titleWords,*contentWords"
  })

  return db
}

function uniqueWords(words: string[]): string[] {
  return Array.from(new Set(words))
}

export async function savePageWithIndexes(
  capturedPage: CapturedPage,
  {
    db,
    settings,
    splitWords
  }: {
    db: PastWithinDb
    settings: AppSettings
    splitWords: (input: string) => Promise<string[]>
  }
): Promise<void> {
  const normalizedUrl = normalizeUrl(capturedPage.url)
  const pageKey = normalizedUrl
  const now = Date.now()
  const titleWords = uniqueWords(await splitWords(capturedPage.title))
  const contentWords = uniqueWords(await splitWords(capturedPage.content))

  await db.transaction("rw", db.pages, db.pageContents, async () => {
    const existing = await db.pages
      .where("normalizedUrl")
      .equals(normalizedUrl)
      .first()

    const pageRecord: PageRecord = {
      id: existing?.id,
      pageKey,
      url: capturedPage.url,
      normalizedUrl,
      title: capturedPage.title,
      visitTime: capturedPage.visitTime,
      updatedAt: now,
      isBookmarked: capturedPage.isBookmarked ?? false,
      contentLength: capturedPage.content.length
    }

    const pageId = await db.pages.put(pageRecord)

    const existingContent = pageId
      ? await db.pageContents.where("pageId").equals(pageId).first()
      : undefined

    await db.pageContents.put({
      pageId,
      content: settings.saveContentEnabled
        ? capturedPage.content
        : existingContent?.content,
      titleWords,
      contentWords
    })
  })
}

export async function getPageByNormalizedUrl(
  db: PastWithinDb,
  normalizedUrl: string
): Promise<PageRecord | undefined> {
  return db.pages.where("normalizedUrl").equals(normalizedUrl).first()
}

export async function getPageContent(
  db: PastWithinDb,
  pageId: number
): Promise<PageContentRecord | undefined> {
  return db.pageContents.where("pageId").equals(pageId).first()
}

export async function clearAllData(db: PastWithinDb): Promise<void> {
  await db.transaction("rw", db.pages, db.pageContents, async () => {
    await db.pages.clear()
    await db.pageContents.clear()
  })
}

export async function clearSavedContent(db: PastWithinDb): Promise<void> {
  await db.transaction("rw", db.pageContents, async () => {
    const records = await db.pageContents.toArray()
    await Promise.all(
      records.map((record) =>
        db.pageContents.update(record.pageId, { content: undefined })
      )
    )
  })
}

export async function updateBookmarkStatusByUrl(
  db: PastWithinDb,
  url: string,
  isBookmarked: boolean
): Promise<boolean> {
  const normalizedUrl = normalizeUrl(url)
  const page = await db.pages
    .where("normalizedUrl")
    .equals(normalizedUrl)
    .first()

  if (!page) return false

  if (page.isBookmarked === isBookmarked) return true

  await db.pages.update(page.id!, { isBookmarked, updatedAt: Date.now() })
  return true
}

export async function syncBookmarkStatuses(
  db: PastWithinDb,
  bookmarkedUrls: string[]
): Promise<{ checkedCount: number; updatedCount: number }> {
  const normalizedBookmarked = new Set(
    bookmarkedUrls.map((u) => normalizeUrl(u))
  )

  const pages = await db.pages.toArray()
  let updatedCount = 0

  for (const page of pages) {
    const shouldBeBookmarked = normalizedBookmarked.has(page.normalizedUrl)
    if (page.isBookmarked !== shouldBeBookmarked) {
      await db.pages.update(page.id!, {
        isBookmarked: shouldBeBookmarked,
        updatedAt: Date.now()
      })
      updatedCount++
    }
  }

  return { checkedCount: pages.length, updatedCount }
}

export async function getStorageStats(db: PastWithinDb): Promise<StorageStats> {
  const estimate =
    (await navigator.storage?.estimate?.()) ?? ({} as StorageEstimate)
  const pageCount = await db.pages.count()
  const contentCount = await db.pageContents
    .filter((record) => !!record.content)
    .count()

  return {
    usageBytes: estimate.usage ?? 0,
    quotaBytes: estimate.quota ?? 0,
    pageCount,
    contentCount
  }
}
