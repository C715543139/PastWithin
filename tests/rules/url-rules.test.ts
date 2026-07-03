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
    expect(isUrlExcluded(url, defaultSettings.excludedUrlRules)).toBe(true)
  })

  it("allows ordinary http and https pages", () => {
    expect(isUrlExcluded("https://example.com/course/path-planning", defaultSettings.excludedUrlRules)).toBe(false)
    expect(isUrlExcluded("http://localhost:5173/debug", defaultSettings.excludedUrlRules)).toBe(false)
  })

  it("ignores invalid user regex rules instead of failing all capture checks", () => {
    expect(() =>
      isUrlExcluded("https://example.com/course", [
        { id: "bad", pattern: "[invalid-regex", enabled: true },
        { id: "private", pattern: "^https://example\\.com/private", enabled: true }
      ])
    ).not.toThrow()

    expect(isUrlExcluded("https://example.com/private/page", [
      { id: "bad", pattern: "[invalid-regex", enabled: true },
      { id: "private", pattern: "^https://example\\.com/private", enabled: true }
    ])).toBe(true)
  })

  it("ignores disabled rules", () => {
    expect(isUrlExcluded("https://example.com/private/page", [
      { id: "private", pattern: "^https://example\\.com/private", enabled: false }
    ])).toBe(false)
  })
})
