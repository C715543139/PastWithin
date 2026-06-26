import type { AppSettings } from "./types"

const STORAGE_KEY = "pastWithinSettings"

export const defaultSettings: AppSettings = {
  autoSaveEnabled: true,
  saveBookmarkedOnly: false,
  saveContentEnabled: true,
  tempPageRetentionDays: 60,
  maxResults: 50,
  excludedUrlPatterns: [
    "^chrome://",
    "^edge://",
    "^about:",
    "^file://",
    "^chrome-extension://",
    "^https://mail\\.google\\.com/",
    "^https://outlook\\.live\\.com/",
    "^https://.*\\.bank",
    "^https://.*\\.edu.*/(login|auth|jw|jiaowu)"
  ]
}

export async function getSettings(): Promise<AppSettings> {
  try {
    if (typeof chrome === "undefined" || !chrome.storage?.local) {
      return { ...defaultSettings }
    }

    const result = await chrome.storage.local.get(STORAGE_KEY)
    return { ...defaultSettings, ...(result[STORAGE_KEY] ?? {}) }
  } catch {
    return { ...defaultSettings }
  }
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  try {
    if (typeof chrome === "undefined" || !chrome.storage?.local) {
      return
    }

    await chrome.storage.local.set({ [STORAGE_KEY]: settings })
  } catch {
    // Settings are best-effort in non-extension or restricted contexts.
  }
}

