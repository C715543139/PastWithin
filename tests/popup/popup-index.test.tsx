import "@testing-library/jest-dom/vitest"

import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import PopupIndex from "../../popup/index"
import type { AppSettings } from "../../lib/types"

const settings: AppSettings = {
    autoSaveEnabled: true,
    saveBookmarkedOnly: false,
    saveContentEnabled: true,
    tempPageRetentionDays: 60,
    maxResults: 50,
    excludedUrlPatterns: []
}

interface RuntimeMock {
    sendMessage: ReturnType<typeof vi.fn>
    openOptionsPage?: ReturnType<typeof vi.fn>
    lastError?: { message: string } | null
}

let runtimeMock: RuntimeMock
const chromeMock: Record<string, unknown> = {}

function setRuntime(next: RuntimeMock) {
    runtimeMock = next
    chromeMock.runtime = {
        get sendMessage() {
            return runtimeMock.sendMessage
        },
        get openOptionsPage() {
            return runtimeMock.openOptionsPage
        },
        get lastError() {
            return runtimeMock.lastError ?? null
        }
    }
        ; (globalThis as { chrome: Record<string, unknown> }).chrome = chromeMock
}

describe("popup index", () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    afterEach(() => {
        delete (globalThis as { chrome?: unknown }).chrome
    })

    it("shows an error when chrome runtime is unavailable", () => {
        delete (globalThis as { chrome?: unknown }).chrome

        render(<PopupIndex />)

        expect(
            screen.getByText(/Chrome extension API 不可用/)
        ).toBeInTheDocument()
    })

    it("loads settings and renders the search app", async () => {
        setRuntime({
            sendMessage: vi.fn((message, cb) => {
                if (message.type === "getSettings") cb(settings)
            })
        })

        render(<PopupIndex />)

        await waitFor(() =>
            expect(screen.getByRole("searchbox", { name: /搜索/ })).toBeInTheDocument()
        )
        expect(screen.getByText("PastWithin")).toBeInTheDocument()
        expect(screen.getByRole("button", { name: "设置" })).toBeInTheDocument()
    })

    it("shows an init error when reading settings fails", async () => {
        setRuntime({
            sendMessage: vi.fn((_message, cb) => {
                runtimeMock.lastError = { message: "读取设置失败" }
                cb(undefined)
                runtimeMock.lastError = null
            })
        })

        render(<PopupIndex />)

        await waitFor(() =>
            expect(screen.getByText(/读取设置失败/)).toBeInTheDocument()
        )
    })

    it("opens the options page when the settings button is clicked", async () => {
        const openOptionsPage = vi.fn()
        setRuntime({
            sendMessage: vi.fn((message, cb) => {
                if (message.type === "getSettings") cb(settings)
            }),
            openOptionsPage
        })

        render(<PopupIndex />)

        await waitFor(() =>
            expect(screen.getByRole("button", { name: "设置" })).toBeInTheDocument()
        )
        await userEvent.click(screen.getByRole("button", { name: "设置" }))

        expect(openOptionsPage).toHaveBeenCalled()
    })

    it("forwards search requests through chrome.runtime.sendMessage", async () => {
        const sendMessage = vi.fn((message, cb) => {
            if (message.type === "getSettings") cb(settings)
            if (message.type === "search") cb({ results: [{ id: 1, url: "https://example.com", title: "标题", visitTime: 0, isBookmarked: false, snippet: "片段", highlights: [], score: 1 }] })
        })
        setRuntime({ sendMessage })

        render(<PopupIndex />)

        await waitFor(() =>
            expect(screen.getByRole("searchbox", { name: /搜索/ })).toBeInTheDocument()
        )
        await userEvent.type(screen.getByRole("searchbox", { name: /搜索/ }), "路径")
        await userEvent.click(screen.getByRole("button", { name: "搜索" }))

        await waitFor(() =>
            expect(sendMessage).toHaveBeenCalledWith(
                expect.objectContaining({ type: "search" }),
                expect.any(Function)
            )
        )
    })
})
