import {
  clearAllData,
  clearSavedContent,
  createPastWithinDb,
  getStorageStats,
  savePageWithIndexes
} from "./background/db"
import {
  registerBookmarkSync,
  scheduleBookmarkStatusSync
} from "./background/bookmarkSync"
import { handleCapturedPageMessage } from "./background/capturePipeline"
import { searchPages, streamFulltextSearch } from "./background/search"
import { isUrlBookmarked } from "./lib/bookmarks"
import {
  FULLTEXT_SEARCH_STREAM_PORT,
  type FulltextSearchStreamRequest,
  type FulltextSearchStreamResponse,
  type RuntimeMessage,
  type RuntimeResponse
} from "./lib/messages"
import { getSettings, saveSettings } from "./lib/settings"
import { splitWords } from "./lib/wordSplit"

const db = createPastWithinDb("PastWithinDB")
registerBookmarkSync({ db, isUrlBookmarked })
scheduleBookmarkStatusSync({ db })

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  handleMessage(message as RuntimeMessage)
    .then(sendResponse)
    .catch((error) => sendResponse({ error: String(error) }))

  return true
})

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== FULLTEXT_SEARCH_STREAM_PORT) return

  let stopped = false
  let running = false
  let connected = true

  function postMessage(message: FulltextSearchStreamResponse): void {
    if (!connected) return

    try {
      port.postMessage(message)
    } catch {
      connected = false
      stopped = true
    }
  }

  port.onDisconnect.addListener(() => {
    connected = false
    stopped = true
  })

  port.onMessage.addListener((message: FulltextSearchStreamRequest) => {
    if (message.type === "stop") {
      stopped = true
      return
    }

    if (message.type !== "start" || running) return

    running = true
    void (async () => {
      try {
        const settings = await getSettings()
        const result = await streamFulltextSearch({
          db,
          settings,
          request: message.payload,
          isStopped: () => stopped || !connected,
          onProgress: (progress) =>
            postMessage({ type: "progress", ...progress })
        })

        postMessage({
          type: result.state,
          scannedCount: result.scannedCount,
          totalCount: result.totalCount,
          matchedCount: result.matchedCount,
          results: result.results
        })
      } catch (error) {
        postMessage({
          type: "error",
          error: error instanceof Error ? error.message : "全文搜索失败"
        })
      } finally {
        running = false
      }
    })()
  })
})

async function handleMessage(message: RuntimeMessage): Promise<RuntimeResponse> {
  switch (message.type) {
    case "capturePage": {
      const settings = await getSettings()
      await handleCapturedPageMessage({
        captured: message.payload,
        settings: settings as unknown as {
          saveBookmarkedOnly: boolean
          [key: string]: unknown
        },
        isBookmarkedUrl: isUrlBookmarked,
        savePageWithIndexes: (pageData, options) =>
          savePageWithIndexes(pageData, {
            db,
            settings: options.settings as unknown as typeof settings,
            splitWords: options.splitWords
          }),
        splitWords
      })
      return { success: true }
    }

    case "search": {
      const settings = await getSettings()
      return searchPages({ db, settings, splitWords, request: message.payload })
    }

    case "clearData":
      await clearAllData(db)
      return { success: true }

    case "clearSavedContent":
      await clearSavedContent(db)
      return { success: true }

    case "getStats":
      return getStorageStats(db)

    case "getSettings":
      return getSettings()

    case "saveSettings":
      await saveSettings(message.payload)
      return { success: true }

    default:
      return { error: `Unknown message type: ${(message as RuntimeMessage).type}` }
  }
}
