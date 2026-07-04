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
import { searchPages } from "./background/search"
import { isUrlBookmarked } from "./lib/bookmarks"
import type { RuntimeMessage, RuntimeResponse } from "./lib/messages"
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

