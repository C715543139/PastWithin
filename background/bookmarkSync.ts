import type { PastWithinDb } from "./db"
import { syncBookmarkStatuses, updateBookmarkStatusByUrl } from "./db"
import { isUrlBookmarked } from "../lib/bookmarks"

function hasBookmarkApi(): boolean {
  return typeof chrome !== "undefined" && !!chrome.bookmarks
}

function collectUrlsFromTree(
  nodes: chrome.bookmarks.BookmarkTreeNode[]
): string[] {
  const urls: string[] = []
  for (const node of nodes) {
    if (node.url) {
      urls.push(node.url)
    }
    if (node.children) {
      urls.push(...collectUrlsFromTree(node.children))
    }
  }
  return urls
}

export async function collectBookmarkUrls(): Promise<string[]> {
  if (!hasBookmarkApi()) {
    return []
  }

  try {
    const tree = await chrome.bookmarks.getTree()
    const urls = collectUrlsFromTree(tree)
    return Array.from(new Set(urls))
  } catch (error) {
    throw new Error("Failed to collect bookmark URLs", { cause: error })
  }
}

export function registerBookmarkSync({
  db,
  isUrlBookmarked: isUrlBookmarkedFn = isUrlBookmarked
}: {
  db: PastWithinDb
  isUrlBookmarked?: (url: string) => Promise<boolean>
}): void {
  if (!hasBookmarkApi()) return

  try {
    chrome.bookmarks.onCreated.addListener((_id, bookmark) => {
      if (bookmark.url) {
        updateBookmarkStatusByUrl(db, bookmark.url, true).catch((error) => {
          console.warn(
            "Failed to update bookmark status onCreated:",
            error
          )
        })
      }
    })

    chrome.bookmarks.onRemoved.addListener((_id, removeInfo) => {
      const url = removeInfo.node?.url
      if (!url) return

      isUrlBookmarkedFn(url)
        .then((stillBookmarked) => {
          if (!stillBookmarked) {
            return updateBookmarkStatusByUrl(db, url, false)
          }
        })
        .catch((error) => {
          console.warn(
            "Failed to update bookmark status onRemoved:",
            error
          )
        })
    })
  } catch (error) {
    console.warn("Failed to register bookmark sync listeners:", error)
  }
}

export async function runBookmarkStatusSync({
  db
}: {
  db: PastWithinDb
}): Promise<{ checkedCount: number; updatedCount: number }> {
  if (!hasBookmarkApi()) {
    return { checkedCount: 0, updatedCount: 0 }
  }

  const urls = await collectBookmarkUrls()
  return syncBookmarkStatuses(db, urls)
}

export const BOOKMARK_STATUS_LAST_SYNC_KEY =
  "pastWithinLastBookmarkStatusSyncAt"
export const BOOKMARK_STATUS_LAST_ERROR_KEY =
  "pastWithinLastBookmarkStatusSyncError"

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

async function recordBookmarkSyncFailure(error: unknown): Promise<void> {
  try {
    await chrome.storage.local.set({
      [BOOKMARK_STATUS_LAST_ERROR_KEY]: {
        at: Date.now(),
        message: getErrorMessage(error)
      }
    })
  } catch (storageError) {
    console.warn("Failed to record bookmark status sync error:", storageError)
  }
}

export function scheduleBookmarkStatusSync({
  db,
  delayMs = 3000,
  throttleMs = 24 * 60 * 60 * 1000
}: {
  db: PastWithinDb
  delayMs?: number
  throttleMs?: number
}): void {
  setTimeout(async () => {
    try {
      const data = await chrome.storage.local.get(BOOKMARK_STATUS_LAST_SYNC_KEY)
      const lastSyncAt = data[BOOKMARK_STATUS_LAST_SYNC_KEY] as number | undefined

      if (lastSyncAt && Date.now() - lastSyncAt < throttleMs) {
        return
      }

      await runBookmarkStatusSync({ db })
      await chrome.storage.local.set({
        [BOOKMARK_STATUS_LAST_SYNC_KEY]: Date.now()
      })
    } catch (error) {
      console.warn("Bookmark status sync failed:", error)
      await recordBookmarkSyncFailure(error)
    }
  }, delayMs)
}
