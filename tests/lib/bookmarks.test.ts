import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { isUrlBookmarked } from "../../lib/bookmarks"

const originalChrome = (globalThis as { chrome?: unknown }).chrome

function mockChrome(bookmarks: {
    search: (typeof chrome.bookmarks.search extends (...args: infer A) => infer R
        ? (...args: A) => R
        : never)
} | undefined) {
    const chromeMock: Record<string, unknown> = {}
    if (bookmarks) {
        chromeMock.bookmarks = bookmarks
    }
    ; (globalThis as { chrome: Record<string, unknown> }).chrome = chromeMock
}

afterEach(() => {
    if (originalChrome === undefined) {
        delete (globalThis as { chrome?: unknown }).chrome
    } else {
        ; (globalThis as { chrome?: unknown }).chrome = originalChrome
    }
})

describe("isUrlBookmarked", () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it("returns true when chrome.bookmarks.search finds matching bookmarks", async () => {
        const search = vi.fn().mockResolvedValue([{ id: "1", url: "https://example.com" }])
        mockChrome({ search })

        await expect(isUrlBookmarked("https://example.com")).resolves.toBe(true)
        expect(search).toHaveBeenCalledWith({ url: "https://example.com" })
    })

    it("returns false when chrome.bookmarks.search returns no matches", async () => {
        mockChrome({ search: vi.fn().mockResolvedValue([]) })

        await expect(isUrlBookmarked("https://example.com")).resolves.toBe(false)
    })

    it("returns false when chrome.bookmarks is unavailable", async () => {
        mockChrome(undefined)

        await expect(isUrlBookmarked("https://example.com")).resolves.toBe(false)
    })

    it("returns false when chrome is undefined", async () => {
        delete (globalThis as { chrome?: unknown }).chrome

        await expect(isUrlBookmarked("https://example.com")).resolves.toBe(false)
    })

    it("returns false when chrome.bookmarks.search throws", async () => {
        mockChrome({ search: vi.fn().mockRejectedValue(new Error("boom")) })

        await expect(isUrlBookmarked("https://example.com")).resolves.toBe(false)
    })
})
