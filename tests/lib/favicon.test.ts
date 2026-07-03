import { afterEach, describe, expect, it } from "vitest"

import { getFaviconUrl } from "../../lib/favicon"

function mockChromeRuntimeId(id: string) {
  ;(globalThis as { chrome?: unknown }).chrome = {
    runtime: { id }
  }
}

describe("favicon url helper", () => {
  afterEach(() => {
    delete (globalThis as { chrome?: unknown }).chrome
  })

  it("builds a Chrome extension favicon url for a page url", () => {
    mockChromeRuntimeId("extension-id")

    const faviconUrl = getFaviconUrl("https://example.com/path?q=1", 32)

    expect(faviconUrl).toBe(
      "chrome-extension://extension-id/_favicon/?pageUrl=https%3A%2F%2Fexample.com%2Fpath%3Fq%3D1&size=32"
    )
  })

  it("returns an empty string outside the extension runtime", () => {
    expect(getFaviconUrl("https://example.com")).toBe("")
  })
})
