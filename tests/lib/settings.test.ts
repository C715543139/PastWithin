import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
    contentSizeOptions,
    defaultSettings,
    getSettings,
    saveSettings
} from "../../lib/settings"
import type { AppSettings } from "../../lib/types"

const STORAGE_KEY = "pastWithinSettings"

interface StorageShape {
    local: {
        get: (keys: string[]) => Promise<Record<string, unknown>>
        set: (items: Record<string, unknown>) => Promise<void>
    }
}

function mockChromeStorage(storage: StorageShape | undefined) {
    const chromeMock: Record<string, unknown> = {}
    if (storage) {
        chromeMock.storage = storage
    }
    ; (globalThis as { chrome: Record<string, unknown> }).chrome = chromeMock
}

const originalChrome = (globalThis as { chrome?: unknown }).chrome

afterEach(() => {
    if (originalChrome === undefined) {
        delete (globalThis as { chrome?: unknown }).chrome
    } else {
        ; (globalThis as { chrome?: unknown }).chrome = originalChrome
    }
})

describe("settings", () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it("exposes default settings with the expected first-version fields", () => {
        expect(defaultSettings.autoSaveEnabled).toBe(true)
        expect(defaultSettings.saveBookmarkedOnly).toBe(false)
        expect(defaultSettings.saveContentEnabled).toBe(true)
        expect(defaultSettings.maxContentLength).toBe(1 * 1024 * 1024)
        expect(contentSizeOptions.map((option) => option.value)).toEqual([
            512 * 1024,
            1 * 1024 * 1024,
            2 * 1024 * 1024,
            5 * 1024 * 1024
        ])
        expect(defaultSettings.tempPageRetentionDays).toBe(60)
        expect(defaultSettings.maxResults).toBe(50)
        expect(defaultSettings.excludedUrlRules).toContainEqual(
            expect.objectContaining({ pattern: "^chrome://", enabled: true })
        )
    })

    it("getSettings merges stored values over defaults", async () => {
        const stored: Partial<AppSettings> = { maxResults: 100, saveContentEnabled: false }
        const get = vi.fn().mockResolvedValue({ [STORAGE_KEY]: stored })
        mockChromeStorage({ local: { get, set: vi.fn().mockResolvedValue(undefined) } })

        const settings = await getSettings()

        expect(get).toHaveBeenCalledWith(STORAGE_KEY)
        expect(settings.maxResults).toBe(100)
        expect(settings.saveContentEnabled).toBe(false)
        expect(settings.autoSaveEnabled).toBe(true)
    })

    it("normalizes unsupported content size limits to the default", async () => {
        const get = vi.fn().mockResolvedValue({
            [STORAGE_KEY]: { maxContentLength: 12345 }
        })
        mockChromeStorage({ local: { get, set: vi.fn().mockResolvedValue(undefined) } })

        const settings = await getSettings()

        expect(settings.maxContentLength).toBe(defaultSettings.maxContentLength)
    })

    it("normalizes stored url rules and ignores empty rule objects", async () => {
        const stored = {
            excludedUrlRules: [
                { id: "mail", pattern: " ^https://mail\\.google\\.com/ ", enabled: true },
                { id: "empty", pattern: " " },
                { id: "invalid", pattern: "[invalid" }
            ]
        }
        const get = vi.fn().mockResolvedValue({ [STORAGE_KEY]: stored })
        mockChromeStorage({ local: { get, set: vi.fn().mockResolvedValue(undefined) } })

        const settings = await getSettings()

        expect(settings.excludedUrlRules).toEqual([
            expect.objectContaining({
                id: "mail",
                pattern: "^https://mail\\.google\\.com/",
                enabled: true
            })
        ])
    })

    it("falls back to default url rules when stored rules are not in the new shape", async () => {
        const get = vi.fn().mockResolvedValue({
            [STORAGE_KEY]: { excludedUrlRules: ["^chrome://"] }
        })
        mockChromeStorage({ local: { get, set: vi.fn().mockResolvedValue(undefined) } })

        const settings = await getSettings()

        expect(settings.excludedUrlRules).toEqual(defaultSettings.excludedUrlRules)
    })

    it("getSettings returns defaults when storage is empty", async () => {
        mockChromeStorage({
            local: { get: vi.fn().mockResolvedValue({}), set: vi.fn().mockResolvedValue(undefined) }
        })

        const settings = await getSettings()

        expect(settings).toEqual(defaultSettings)
    })

    it("getSettings returns defaults when chrome.storage is unavailable", async () => {
        mockChromeStorage(undefined)

        const settings = await getSettings()

        expect(settings).toEqual(defaultSettings)
    })

    it("getSettings returns defaults when chrome is undefined", async () => {
        delete (globalThis as { chrome?: unknown }).chrome

        const settings = await getSettings()

        expect(settings).toEqual(defaultSettings)
    })

    it("getSettings swallows storage errors and returns defaults", async () => {
        mockChromeStorage({
            local: { get: vi.fn().mockRejectedValue(new Error("denied")), set: vi.fn().mockResolvedValue(undefined) }
        })

        const settings = await getSettings()

        expect(settings).toEqual(defaultSettings)
    })

    it("saveSettings writes the payload to chrome.storage.local", async () => {
        const set = vi.fn().mockResolvedValue(undefined)
        mockChromeStorage({ local: { get: vi.fn().mockResolvedValue({}), set } })

        const payload: AppSettings = { ...defaultSettings, maxResults: 25 }
        await saveSettings(payload)

        expect(set).toHaveBeenCalledWith({ [STORAGE_KEY]: payload })
    })

    it("saveSettings is a no-op when chrome.storage is unavailable", async () => {
        mockChromeStorage(undefined)

        await expect(saveSettings(defaultSettings)).resolves.toBeUndefined()
    })

    it("saveSettings swallows storage errors", async () => {
        mockChromeStorage({
            local: {
                get: vi.fn().mockResolvedValue({}),
                set: vi.fn().mockRejectedValue(new Error("denied"))
            }
        })

        await expect(saveSettings(defaultSettings)).resolves.toBeUndefined()
    })
})
