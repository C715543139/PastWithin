import type { PlasmoContentScript } from "plasmo"

import { extractPageSnapshot } from "../lib/extract"
import { getSettings } from "../lib/settings"
import { isUrlExcluded } from "../lib/urlRules"

export const config: PlasmoContentScript = {
  matches: ["http://*/*", "https://*/*"],
  all_frames: false
}

function captureCurrentPage(): void {
  getSettings()
    .then((settings) => {
      if (!settings.autoSaveEnabled) return

      const url = window.location.href
      if (isUrlExcluded(url, settings.excludedUrlPatterns)) return

      const snapshot = extractPageSnapshot({
        document,
        url,
        minContentLength: 20,
        maxContentLength: 1_048_576
      })

      if (!snapshot) return

      chrome.runtime.sendMessage({
        type: "capturePage",
        payload: snapshot
      })
    })
    .catch(() => {
      // Capture is best-effort; skip pages when extension APIs are unavailable.
    })
}

if (document.readyState === "complete") {
  captureCurrentPage()
} else {
  window.addEventListener("load", captureCurrentPage, { once: true })
}
