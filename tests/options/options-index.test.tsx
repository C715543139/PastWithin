import "@testing-library/jest-dom/vitest"

import {
    fireEvent,
    render,
    screen,
    waitFor,
    waitForElementToBeRemoved,
    within
} from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { AppSettings, StorageStats } from "../../lib/types"
import OptionsIndex from "../../options/index"

const defaultAppSettings: AppSettings = {
    autoSaveEnabled: true,
    saveBookmarkedOnly: false,
    saveContentEnabled: true,
    maxContentLength: 1 * 1024 * 1024,
    tempPageRetentionDays: 60,
    maxResults: 50,
    excludedUrlRules: [
        { id: "chrome", pattern: "^chrome://", enabled: true }
    ]
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
        vi.useRealTimers()
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
        expect(screen.getByLabelText("保存全文")).toBeChecked()
        expect(screen.getByLabelText("单页全文大小上限")).toHaveValue(
            String(1 * 1024 * 1024)
        )
        expect(screen.getByText(/已保存页面数：5/)).toBeInTheDocument()
        expect(screen.getByText(/已保存全文数：3/)).toBeInTheDocument()
        expect(screen.getByText(/2.00 MB/)).toBeInTheDocument()
    })

    it("saves checkbox settings immediately when changed", async () => {
        const sendMessage = createRuntime()
        const user = userEvent.setup()

        render(<OptionsIndex />)

        await waitFor(() =>
            expect(screen.getByLabelText("自动保存访问页面")).toBeInTheDocument()
        )
        await user.click(screen.getByLabelText("自动保存访问页面"))

        await waitFor(() =>
            expect(screen.getByRole("status")).toHaveTextContent(/自动保存于/)
        )
        expect(sendMessage).toHaveBeenCalledWith(
            expect.objectContaining({
                type: "saveSettings",
                payload: expect.objectContaining({ autoSaveEnabled: false })
            }),
            expect.any(Function)
        )

        await waitForElementToBeRemoved(() => screen.queryByRole("status"), {
            timeout: 3000
        })
    })

    it("saves valid number settings on blur and rejects invalid values", async () => {
        const sendMessage = createRuntime()
        const user = userEvent.setup()

        render(<OptionsIndex />)

        const maxResults = await screen.findByLabelText("最大搜索结果数")
        await user.clear(maxResults)
        await user.type(maxResults, "25")
        await user.tab()

        await waitFor(() =>
            expect(sendMessage).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: "saveSettings",
                    payload: expect.objectContaining({ maxResults: 25 })
                }),
                expect.any(Function)
            )
        )

        const retentionDays = screen.getByLabelText("非书签页面保存天数")
        await user.clear(retentionDays)
        await user.type(retentionDays, "0")
        await user.tab()

        expect(screen.getByText("请输入正整数")).toBeInTheDocument()
        expect(
            sendMessage.mock.calls.some(
                ([m]) => m.type === "saveSettings" && m.payload?.tempPageRetentionDays === 0
            )
        ).toBe(false)
    })

    it("saves the single-page fulltext size limit immediately", async () => {
        const sendMessage = createRuntime()
        const user = userEvent.setup()

        render(<OptionsIndex />)

        const limitSelect = await screen.findByLabelText("单页全文大小上限")
        await user.selectOptions(limitSelect, String(2 * 1024 * 1024))

        await waitFor(() =>
            expect(sendMessage).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: "saveSettings",
                    payload: expect.objectContaining({
                        maxContentLength: 2 * 1024 * 1024
                    })
                }),
                expect.any(Function)
            )
        )
        expect(screen.getByText(/避免异常页面过度占用本地空间/)).toBeInTheDocument()
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
            expect(screen.getByRole("button", { name: "清空已保存全文" })).toBeInTheDocument()
        )
        await user.click(screen.getByRole("button", { name: "清空已保存全文" }))

        await waitFor(() =>
            expect(screen.getByText("已保存全文已清空")).toBeInTheDocument()
        )
        expect(confirmSpy).toHaveBeenCalled()
        expect(
            sendMessage.mock.calls.some(([m]) => m.type === "clearSavedContent")
        ).toBe(true)
    })

    it("adds a url rule after validating the new row", async () => {
        const sendMessage = createRuntime()
        const user = userEvent.setup()

        render(<OptionsIndex />)

        await waitFor(() =>
            expect(screen.getByRole("heading", { name: "URL 排除规则" })).toBeInTheDocument()
        )
        await user.click(screen.getByRole("button", { name: "添加规则" }))

        const ruleInputs = screen.getAllByLabelText("URL 排除规则")
        const draftInput = ruleInputs[ruleInputs.length - 1]
        fireEvent.change(draftInput, { target: { value: "[invalid" } })
        await user.click(within(draftInput.closest(".url-rule-item") as HTMLElement).getByRole("button", { name: "保存" }))

        expect(screen.getByText(/正则表达式无效/)).toBeInTheDocument()

        fireEvent.change(draftInput, {
            target: { value: "^https://private\\.example" }
        })
        await user.click(within(draftInput.closest(".url-rule-item") as HTMLElement).getByRole("button", { name: "保存" }))

        await waitFor(() =>
            expect(sendMessage).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: "saveSettings",
                    payload: expect.objectContaining({
                        excludedUrlRules: expect.arrayContaining([
                            expect.objectContaining({
                                pattern: "^https://private\\.example",
                                enabled: true
                            })
                        ])
                    })
                }),
                expect.any(Function)
            )
        )
    })

    it("edits, disables, and deletes existing url rules", async () => {
        const sendMessage = createRuntime()
        const user = userEvent.setup()

        render(<OptionsIndex />)

        const ruleInput = await screen.findByDisplayValue("^chrome://")
        await user.clear(ruleInput)
        await user.type(ruleInput, "^edge://")
        const ruleItem = ruleInput.closest(".url-rule-item") as HTMLElement
        await user.click(within(ruleItem).getByRole("button", { name: "保存" }))

        await waitFor(() =>
            expect(sendMessage).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: "saveSettings",
                    payload: expect.objectContaining({
                        excludedUrlRules: [
                            expect.objectContaining({ pattern: "^edge://", enabled: true })
                        ]
                    })
                }),
                expect.any(Function)
            )
        )

        await user.click(within(ruleItem).getByLabelText("启用规则"))
        await waitFor(() =>
            expect(sendMessage).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: "saveSettings",
                    payload: expect.objectContaining({
                        excludedUrlRules: [
                            expect.objectContaining({ pattern: "^edge://", enabled: false })
                        ]
                    })
                }),
                expect.any(Function)
            )
        )

        await user.click(within(ruleItem).getByRole("button", { name: "删除" }))
        await waitFor(() =>
            expect(sendMessage).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: "saveSettings",
                    payload: expect.objectContaining({ excludedUrlRules: [] })
                }),
                expect.any(Function)
            )
        )

        expect(screen.queryByDisplayValue("^edge://")).not.toBeInTheDocument()
    })

    it("rejects duplicate url rules", async () => {
        createRuntime()
        const user = userEvent.setup()

        render(<OptionsIndex />)

        await screen.findByRole("heading", { name: "URL 排除规则" })
        await user.click(screen.getByRole("button", { name: "添加规则" }))

        const ruleInputs = screen.getAllByLabelText("URL 排除规则")
        const draftInput = ruleInputs[ruleInputs.length - 1]
        fireEvent.change(draftInput, { target: { value: "^chrome://" } })
        await user.click(within(draftInput.closest(".url-rule-item") as HTMLElement).getByRole("button", { name: "保存" }))

        expect(screen.getByText("该规则已存在")).toBeInTheDocument()
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
