import "@testing-library/jest-dom/vitest"

import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { AppSettings, StorageStats } from "../../lib/types"
import OptionsIndex from "../../options/index"

const defaultAppSettings: AppSettings = {
    autoSaveEnabled: true,
    saveBookmarkedOnly: false,
    saveContentEnabled: true,
    tempPageRetentionDays: 60,
    maxResults: 50,
    excludedUrlPatterns: ["^chrome://"]
}

const stats: StorageStats = {
    usageBytes: 1024 * 1024 * 2,
    quotaBytes: 1024 * 1024 * 100,
    pageCount: 5,
    contentCount: 3
}

interface RuntimeMock {
    sendMessage: ReturnType<typeof vi.fn>
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
        get lastError() {
            return runtimeMock.lastError ?? null
        }
    }
        ; (globalThis as { chrome: Record<string, unknown> }).chrome = chromeMock
}

function createRuntime(responses: Partial<Record<string, unknown>> = {}) {
    const sendMessage = vi.fn((message, cb) => {
        const key =
            message.type === "saveSettings" ? "saveSettings" : message.type
        const response = responses[key] ?? defaultResponse(message)
        if (message.type === "saveSettings") {
            cb({ success: true })
            return
        }
        cb(response)
    })
    setRuntime({ sendMessage })
    return sendMessage
}

function defaultResponse(message: { type: string }): unknown {
    switch (message.type) {
        case "getSettings":
            return defaultAppSettings
        case "getStats":
            return stats
        case "clearData":
        case "clearSavedContent":
            return { success: true }
        default:
            return undefined
    }
}

describe("options index", () => {
    beforeEach(() => {
        vi.clearAllMocks()
        document.title = ""
    })

    afterEach(() => {
        delete (globalThis as { chrome?: unknown }).chrome
    })

    it("shows an unavailable notice when chrome runtime is missing", () => {
        delete (globalThis as { chrome?: unknown }).chrome

        render(<OptionsIndex />)

        expect(document.title).toBe("PastWithin 扩展设置")
        expect(screen.getByText(/Chrome extension API 不可用/)).toBeInTheDocument()
    })

    it("loads settings and stats, then renders the settings form", async () => {
        createRuntime()

        render(<OptionsIndex />)

        await waitFor(() =>
            expect(screen.getByRole("heading", { name: "PastWithin 扩展设置" })).toBeInTheDocument()
        )
        expect(document.title).toBe("PastWithin 扩展设置")
        expect(screen.getByLabelText("自动保存访问页面")).toBeChecked()
        expect(screen.getByLabelText("保存正文")).toBeChecked()
        expect(screen.getByText(/已保存页面数：5/)).toBeInTheDocument()
        expect(screen.getByText(/已保存正文数：3/)).toBeInTheDocument()
        expect(screen.getByText(/2.00 MB/)).toBeInTheDocument()
    })

    it("saves settings via saveSettings message when the save button is clicked", async () => {
        const sendMessage = createRuntime()
        const user = userEvent.setup()

        render(<OptionsIndex />)

        await waitFor(() =>
            expect(screen.getByLabelText("自动保存访问页面")).toBeInTheDocument()
        )
        await user.click(screen.getByRole("button", { name: "保存设置" }))

        await waitFor(() =>
            expect(screen.getByText("设置已保存")).toBeInTheDocument()
        )
        expect(
            sendMessage.mock.calls.some(([m]) => m.type === "saveSettings")
        ).toBe(true)
    })

    it("clears all data after confirming the dangerous action", async () => {
        const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true)
        const sendMessage = createRuntime()
        const user = userEvent.setup()

        render(<OptionsIndex />)

        await waitFor(() =>
            expect(screen.getByRole("button", { name: "清空所有数据" })).toBeInTheDocument()
        )
        await user.click(screen.getByRole("button", { name: "清空所有数据" }))

        await waitFor(() =>
            expect(screen.getByText("所有数据已清空")).toBeInTheDocument()
        )
        expect(confirmSpy).toHaveBeenCalled()
        expect(
            sendMessage.mock.calls.some(([m]) => m.type === "clearData")
        ).toBe(true)
    })

    it("does not clear data when the user cancels the confirmation", async () => {
        const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false)
        const sendMessage = createRuntime()
        const user = userEvent.setup()

        render(<OptionsIndex />)

        await waitFor(() =>
            expect(screen.getByRole("button", { name: "清空所有数据" })).toBeInTheDocument()
        )
        await user.click(screen.getByRole("button", { name: "清空所有数据" }))

        expect(confirmSpy).toHaveBeenCalled()
        expect(
            sendMessage.mock.calls.some(([m]) => m.type === "clearData")
        ).toBe(false)
    })

    it("clears saved content after confirming", async () => {
        const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true)
        const sendMessage = createRuntime()
        const user = userEvent.setup()

        render(<OptionsIndex />)

        await waitFor(() =>
            expect(screen.getByRole("button", { name: "清空已保存正文" })).toBeInTheDocument()
        )
        await user.click(screen.getByRole("button", { name: "清空已保存正文" }))

        await waitFor(() =>
            expect(screen.getByText("已保存正文已清空")).toBeInTheDocument()
        )
        expect(confirmSpy).toHaveBeenCalled()
        expect(
            sendMessage.mock.calls.some(([m]) => m.type === "clearSavedContent")
        ).toBe(true)
    })

    it("updates excluded url patterns when editing the textarea", async () => {
        createRuntime()
        const user = userEvent.setup()

        render(<OptionsIndex />)

        await waitFor(() =>
            expect(screen.getByRole("heading", { name: "URL 排除规则" })).toBeInTheDocument()
        )
        const textarea = screen.getByRole("textbox") as HTMLTextAreaElement
        await user.clear(textarea)
        await user.type(textarea, "^https://private\\\\.example")

        expect(textarea.value).toContain("^https://private")
    })

    it("shows an error banner when loading settings fails", async () => {
        setRuntime({
            sendMessage: vi.fn((_message, cb) => {
                runtimeMock.lastError = { message: "加载失败" }
                cb(undefined)
                runtimeMock.lastError = null
            })
        })

        render(<OptionsIndex />)

        await waitFor(() =>
            expect(screen.getByRole("alert")).toHaveTextContent("加载失败")
        )
    })
})
