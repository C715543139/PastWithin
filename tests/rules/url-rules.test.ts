import { describe, expect, it } from "vitest"

import { isUrlExcluded } from "../../lib/urlRules"
import { defaultSettings } from "../fixtures/pages"

describe("url exclusion rules", () => {
  it.each([
    "chrome://settings",
    "edge://extensions",
    "about:blank",
    "file://C:/Users/example/private.html",
    "chrome-extension://extension-id/options.html",
    "https://mail.google.com/mail/u/0/#inbox",
    "https://portal.edu.cn/login"
  ])("excludes sensitive or unsupported url: %s", (url) => {
    expect(isUrlExcluded(url, defaultSettings.excludedUrlPatterns)).toBe(true)
  })

  it("allows ordinary http and https pages", () => {
    expect(isUrlExcluded("https://example.com/course/path-planning", defaultSettings.excludedUrlPatterns)).toBe(false)
    expect(isUrlExcluded("http://localhost:5173/debug", defaultSettings.excludedUrlPatterns)).toBe(false)
  })

  it("ignores invalid user regex rules instead of failing all capture checks", () => {
    expect(() =>
      isUrlExcluded("https://example.com/course", ["[invalid-regex", "^https://example\\.com/private"])
    ).not.toThrow()

    expect(isUrlExcluded("https://example.com/private/page", ["[invalid-regex", "^https://example\\.com/private"])).toBe(true)
  })
})

