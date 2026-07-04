import "fake-indexeddb/auto"

import { beforeEach, describe, expect, it, vi } from "vitest"

import type { AppSettings, SearchRequest, SearchResult, StorageStats } from "../../lib/types"

const capturePipelineMock = vi.fn().mockResolvedValue(undefined)
const searchPagesMock = vi.fn().mockResolvedValue({ results: [] })
const clearAllDataMock = vi.fn().mockResolvedValue(undefined)
const clearSavedContentMock = vi.fn().mockResolvedValue(undefined)
const defaultStorageStats: StorageStats = {
    usageBytes: 0,
    quotaBytes: 0,
    pageCount: 0,
    contentCount: 0
}
const getStorageStatsMock = vi.fn().mockResolvedValue(defaultStorageStats)
const isUrlBookmarkedMock = vi.fn().mockResolvedValue(false)
const defaultAppSettings: AppSettings = {
    autoSaveEnabled: true,
    saveBookmarkedOnly: false,
    saveContentEnabled: true,
    maxContentLength: 1 * 1024 * 1024,
    tempPageRetentionDays: 60,
    maxResults: 50,
    excludedUrlRules: []
}
const getSettingsMock = vi.fn().mockResolvedValue(defaultAppSettings)
const saveSettingsMock = vi.fn().mockResolvedValue(undefined)
const splitWordsMock = vi.fn().mockResolvedValue([])

vi.mock("../../background/capturePipeline", () => ({
    handleCapturedPageMessage: capturePipelineMock
}))
vi.mock("../../background/search", () => ({
    searchPages: searchPagesMock
}))
vi.mock("../../background/db", () => ({
    createPastWithinDb: vi.fn(() => ({})),
    savePageWithIndexes: vi.fn(),
    clearAllData: clearAllDataMock,
    clearSavedContent: clearSavedContentMock,
    getStorageStats: getStorageStatsMock
}))
vi.mock("../../lib/bookmarks", () => ({
    isUrlBookmarked: isUrlBookmarkedMock
}))
vi.mock("../../lib/settings", () => ({
    getSettings: getSettingsMock,
    saveSettings: saveSettingsMock
}))
vi.mock("../../lib/wordSplit", () => ({
    splitWords: splitWordsMock
}))

type MessageListener = (
    message: unknown,
    sender: unknown,
    sendResponse: (response: unknown) => void
) => boolean | undefined

interface ChromeRuntimeMock {
    onMessage: { addListener: (listener: MessageListener) => void }
}

let registeredListener: MessageListener | undefined

const chromeMock: Record<string, unknown> = {
    runtime: {
        onMessage: {
            addListener: (listener: MessageListener) => {
                registeredListener = listener
            }
        }
    }
}
    ; (globalThis as { chrome: Record<string, unknown> }).chrome = chromeMock

await import("../../background")

function sendMessage(message: unknown): Promise<unknown> {
    return new Promise((resolve) => {
        if (!registeredListener) {
            throw new Error("listener not registered")
        }
        registeredListener(message, {}, resolve)
    })
}

describe("background message dispatcher", () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it("registers a runtime onMessage listener that keeps the channel open", () => {
        expect(registeredListener).toBeDefined()
        expect(registeredListener?.({}, {}, vi.fn())).toBe(true)
    })

    it("handles capturePage by resolving bookmark status and persisting", async () => {
        const response = await sendMessage({
            type: "capturePage",
            payload: { url: "https://example.com", title: "t", content: "c", visitTime: 1 }
        })

        expect(getSettingsMock).toHaveBeenCalled()
        expect(capturePipelineMock).toHaveBeenCalled()
        expect(response).toEqual({ success: true })
    })

    it("handles search by delegating to searchPages with settings and splitWords", async () => {
        const request: SearchRequest = { query: "路径", mode: "token" }
        searchPagesMock.mockResolvedValue({ results: [{ id: 1 } as SearchResult] })

        const response = await sendMessage({ type: "search", payload: request })

        expect(searchPagesMock).toHaveBeenCalledWith(
            expect.objectContaining({ request })
        )
        expect(response).toEqual({ results: [{ id: 1 }] })
    })

    it("handles clearData by calling clearAllData", async () => {
        const response = await sendMessage({ type: "clearData" })

        expect(clearAllDataMock).toHaveBeenCalled()
        expect(response).toEqual({ success: true })
    })

    it("handles clearSavedContent by calling clearSavedContent", async () => {
        const response = await sendMessage({ type: "clearSavedContent" })

        expect(clearSavedContentMock).toHaveBeenCalled()
        expect(response).toEqual({ success: true })
    })

    it("handles getStats by returning storage stats", async () => {
        const stats: StorageStats = {
            usageBytes: 1024,
            quotaBytes: 2048,
            pageCount: 3,
            contentCount: 2
        }
        getStorageStatsMock.mockResolvedValue(stats)

        const response = await sendMessage({ type: "getStats" })

        expect(getStorageStatsMock).toHaveBeenCalled()
        expect(response).toEqual(stats)
    })

    it("handles getSettings by returning settings", async () => {
        const response = await sendMessage({ type: "getSettings" })

        expect(getSettingsMock).toHaveBeenCalled()
        expect(response).toEqual(await getSettingsMock.mock.results[0]?.value)
    })

    it("handles saveSettings by persisting the payload", async () => {
        const payload: AppSettings = {
            autoSaveEnabled: false,
            saveBookmarkedOnly: true,
            saveContentEnabled: true,
            maxContentLength: 1 * 1024 * 1024,
            tempPageRetentionDays: 30,
            maxResults: 20,
            excludedUrlRules: [
                { id: "chrome", pattern: "^chrome://", enabled: true }
            ]
        }

        const response = await sendMessage({ type: "saveSettings", payload })

        expect(saveSettingsMock).toHaveBeenCalledWith(payload)
        expect(response).toEqual({ success: true })
    })

    it("returns an error for unknown message types", async () => {
        const response = await sendMessage({ type: "unknown" })

        expect(response).toEqual({ error: expect.stringContaining("Unknown message type") })
    })
})
