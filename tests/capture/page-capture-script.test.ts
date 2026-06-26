import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { defaultSettings } from "../fixtures/pages"

const extractPageSnapshotMock = vi.fn().mockReturnValue({
    title: "t",
    url: "https://example.com",
    content: "content long enough",
    visitTime: 1
})
const getSettingsMock = vi.fn().mockResolvedValue(defaultSettings)
const isUrlExcludedMock = vi.fn().mockReturnValue(false)

vi.mock("../../lib/extract", () => ({
    extractPageSnapshot: extractPageSnapshotMock
}))
vi.mock("../../lib/settings", () => ({
    getSettings: getSettingsMock
}))
vi.mock("../../lib/urlRules", () => ({
    isUrlExcluded: isUrlExcludedMock
}))

interface RuntimeMock {
    sendMessage: ReturnType<typeof vi.fn>
}

let sendMessageMock: ReturnType<typeof vi.fn>
let originalAddEventListener: typeof window.addEventListener
let originalReadyState: Document["readyState"]
let originalLocation: Location

const chromeMock: Record<string, unknown> = {}

function setupChromeRuntime() {
    sendMessageMock = vi.fn()
    chromeMock.runtime = { sendMessage: sendMessageMock }
        ; (globalThis as { chrome: Record<string, unknown> }).chrome = chromeMock
}

describe("pageCapture content script", () => {
    beforeEach(() => {
        vi.clearAllMocks()
        setupChromeRuntime()
        originalAddEventListener = window.addEventListener
        originalReadyState = document.readyState
        originalLocation = window.location
        Object.defineProperty(document, "readyState", {
            configurable: true,
            value: "complete"
        })
        Object.defineProperty(window, "location", {
            configurable: true,
            value: { href: "https://example.com/article" }
        })
    })

    afterEach(() => {
        window.addEventListener = originalAddEventListener
        Object.defineProperty(document, "readyState", {
            configurable: true,
            value: originalReadyState
        })
        Object.defineProperty(window, "location", {
            configurable: true,
            value: originalLocation
        })
    })

    it("sends a capturePage message when the page loads and auto-save is enabled", async () => {
        await import("../../contents/pageCapture")
        await vi.waitFor(() => expect(sendMessageMock).toHaveBeenCalledTimes(1))

        expect(getSettingsMock).toHaveBeenCalled()
        expect(isUrlExcludedMock).toHaveBeenCalledWith(
            "https://example.com/article",
            defaultSettings.excludedUrlPatterns
        )
        expect(extractPageSnapshotMock).toHaveBeenCalled()
        expect(sendMessageMock).toHaveBeenCalledWith({
            type: "capturePage",
            payload: expect.objectContaining({ url: "https://example.com" })
        })
    })

    it("skips capture when auto-save is disabled", async () => {
        getSettingsMock.mockResolvedValueOnce({ ...defaultSettings, autoSaveEnabled: false })

        vi.resetModules()
        await import("../../contents/pageCapture")
        await vi.waitFor(() => expect(getSettingsMock).toHaveBeenCalled())

        expect(sendMessageMock).not.toHaveBeenCalled()
    })

    it("skips capture when the url is excluded", async () => {
        isUrlExcludedMock.mockReturnValueOnce(true)

        vi.resetModules()
        await import("../../contents/pageCapture")
        await vi.waitFor(() => expect(isUrlExcludedMock).toHaveBeenCalled())

        expect(extractPageSnapshotMock).not.toHaveBeenCalled()
        expect(sendMessageMock).not.toHaveBeenCalled()
    })

    it("skips capture when extractPageSnapshot returns null", async () => {
        extractPageSnapshotMock.mockReturnValueOnce(null)

        vi.resetModules()
        await import("../../contents/pageCapture")
        await vi.waitFor(() => expect(extractPageSnapshotMock).toHaveBeenCalled())

        expect(sendMessageMock).not.toHaveBeenCalled()
    })
})
