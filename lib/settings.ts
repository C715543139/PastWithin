import type { AppSettings, UrlRule } from "./types"

const STORAGE_KEY = "pastWithinSettings"

const DEFAULT_URL_PATTERNS = [
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

export const defaultSettings: AppSettings = {
  autoSaveEnabled: true,
  saveBookmarkedOnly: false,
  saveContentEnabled: true,
  tempPageRetentionDays: 60,
  maxResults: 50,
  excludedUrlRules: DEFAULT_URL_PATTERNS.map((pattern, index) =>
    createUrlRule(pattern, `default-${index + 1}`)
  )
}

function createUrlRule(pattern: string, id: string): UrlRule {
  return {
    id,
    pattern,
    enabled: true
  }
}

function normalizeUrlRules(value: unknown): UrlRule[] | null {
  if (!Array.isArray(value)) return null
  if (value.length === 0) return []

  const rules: UrlRule[] = []
  value.forEach((item, index) => {
    if (item && typeof item === "object") {
      const candidate = item as Partial<UrlRule>
      const pattern = typeof candidate.pattern === "string" ? candidate.pattern.trim() : ""
      if (!pattern) return
      try {
        new RegExp(pattern)
      } catch {
        return
      }

      rules.push({
        id:
          typeof candidate.id === "string" && candidate.id.trim()
            ? candidate.id
            : `rule-${index + 1}`,
        pattern,
        enabled: candidate.enabled !== false,
        createdAt:
          typeof candidate.createdAt === "number" ? candidate.createdAt : undefined,
        updatedAt:
          typeof candidate.updatedAt === "number" ? candidate.updatedAt : undefined
      })
    }
  })

  return rules.length > 0 ? rules : null
}

function normalizeSettings(value: unknown): AppSettings {
  const stored = value && typeof value === "object" ? (value as Partial<AppSettings> & {
    excludedUrlRules?: unknown
  }) : {}

  return {
    ...defaultSettings,
    ...stored,
    excludedUrlRules:
      normalizeUrlRules(stored.excludedUrlRules) ??
      defaultSettings.excludedUrlRules
  }
}

export async function getSettings(): Promise<AppSettings> {
  try {
    if (typeof chrome === "undefined" || !chrome.storage?.local) {
      return { ...defaultSettings }
    }

    const result = await chrome.storage.local.get(STORAGE_KEY)
    return normalizeSettings(result[STORAGE_KEY])
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
