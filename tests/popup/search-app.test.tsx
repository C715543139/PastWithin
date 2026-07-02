import "@testing-library/jest-dom/vitest"

import { act, fireEvent, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"

import { SearchApp } from "../../popup/SearchApp"
import { defaultSettings, VISIT_TIME } from "../fixtures/pages"

const result = {
  id: 1,
  url: "https://example.com/course/path-planning?week=3#section",
  title: "路径规划课程笔记",
  visitTime: VISIT_TIME,
  isBookmarked: true,
  snippet: "人工智能课程讨论了路径规划、专家系统和知识图谱。",
  highlights: ["路径规划"],
  score: 12
}

describe("popup search app", () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it("provides the popup search entry with query input and search mode controls", () => {
    render(
      <SearchApp
        settings={defaultSettings}
        searchClient={vi.fn().mockResolvedValue({ results: [] })}
      />
    )

    expect(screen.getByRole("searchbox", { name: /搜索/ })).toBeInTheDocument()
    expect(screen.getByRole("radio", { name: "分词查询" })).toBeChecked()
    expect(screen.getByRole("radio", { name: "全文查询" })).toBeEnabled()
  })

  it("sends token search requests and renders title, url, visit time, bookmark mark, and snippet", async () => {
    const user = userEvent.setup()
    const searchClient = vi.fn().mockResolvedValue({ results: [result] })

    render(<SearchApp settings={defaultSettings} searchClient={searchClient} />)

    await user.type(screen.getByRole("searchbox", { name: /搜索/ }), "路径规划")
    await user.click(screen.getByRole("button", { name: "搜索" }))

    expect(searchClient).toHaveBeenCalledWith(
      expect.objectContaining({
        query: "路径规划",
        mode: "token"
      })
    )

    const item = await screen.findByRole("article", { name: "路径规划课程笔记" })
    const titleLink = within(item).getByRole("link", { name: "路径规划课程笔记" })
    expect(titleLink).toHaveAttribute("href", result.url)
    expect(within(titleLink).getByText("路径规划").tagName).toBe("MARK")
    expect(within(item).getByText(result.url)).toBeInTheDocument()
    expect(within(item).getByText(new Date(VISIT_TIME).toLocaleString())).toBeInTheDocument()
    expect(within(item).getByLabelText("已收藏")).toBeInTheDocument()
    expect(within(item).getAllByText("路径规划")).toHaveLength(2)
  })

  it("sends fulltext search requests when the user selects fulltext mode", async () => {
    const user = userEvent.setup()
    const searchClient = vi.fn().mockResolvedValue({ results: [result] })

    render(<SearchApp settings={defaultSettings} searchClient={searchClient} />)

    await user.click(screen.getByRole("radio", { name: "全文查询" }))
    await user.type(screen.getByRole("searchbox", { name: /搜索/ }), "Main.gd:328 total_len")
    await user.click(screen.getByRole("button", { name: "搜索" }))

    expect(searchClient).toHaveBeenCalledWith(
      expect.objectContaining({
        query: "Main.gd:328 total_len",
        mode: "fulltext"
      })
    )
  })

  it("highlights result titles case-insensitively", async () => {
    const user = userEvent.setup()
    const searchClient = vi.fn().mockResolvedValue({
      results: [
        {
          ...result,
          title: "PyTorch 调试",
          snippet: "torch.randint 报错",
          highlights: ["pytorch"]
        }
      ]
    })

    render(<SearchApp settings={defaultSettings} searchClient={searchClient} />)

    await user.type(screen.getByRole("searchbox", { name: /搜索/ }), "pytorch")
    await user.click(screen.getByRole("button", { name: "搜索" }))

    const item = await screen.findByRole("article", { name: "PyTorch 调试" })
    const titleLink = within(item).getByRole("link", { name: "PyTorch 调试" })
    expect(within(titleLink).getByText("PyTorch").tagName).toBe("MARK")
  })

  it("disables fulltext mode when saving raw content is disabled", async () => {
    const user = userEvent.setup()
    const searchClient = vi.fn().mockResolvedValue({ results: [] })

    render(
      <SearchApp
        settings={{
          ...defaultSettings,
          saveContentEnabled: false
        }}
        searchClient={searchClient}
      />
    )

    expect(screen.getByRole("radio", { name: "全文查询" })).toBeDisabled()
    expect(screen.getByText(/保存正文关闭/)).toBeInTheDocument()

    await user.type(screen.getByRole("searchbox", { name: /搜索/ }), "Main.gd:328 total_len")
    await user.click(screen.getByRole("button", { name: "搜索" }))

    expect(searchClient).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "token"
      })
    )
  })

  it("runs token search 300ms after the user stops typing", async () => {
    vi.useFakeTimers()
    const searchClient = vi.fn().mockResolvedValue({ results: [result] })

    render(<SearchApp settings={defaultSettings} searchClient={searchClient} />)

    fireEvent.change(screen.getByRole("searchbox", { name: /搜索/ }), {
      target: { value: "路径规划" }
    })

    expect(searchClient).not.toHaveBeenCalled()

    await act(async () => {
      vi.advanceTimersByTime(299)
    })
    expect(searchClient).not.toHaveBeenCalled()

    await act(async () => {
      vi.advanceTimersByTime(1)
    })

    expect(searchClient).toHaveBeenCalledWith(
      expect.objectContaining({
        query: "路径规划",
        mode: "token"
      })
    )
  })

  it("debounces token search and only sends the latest typed query", async () => {
    vi.useFakeTimers()
    const searchClient = vi.fn().mockResolvedValue({ results: [] })

    render(<SearchApp settings={defaultSettings} searchClient={searchClient} />)

    const searchbox = screen.getByRole("searchbox", { name: /搜索/ })
    fireEvent.change(searchbox, { target: { value: "路径" } })

    await act(async () => {
      vi.advanceTimersByTime(150)
    })
    fireEvent.change(searchbox, { target: { value: "路径规划" } })

    await act(async () => {
      vi.advanceTimersByTime(300)
    })

    expect(searchClient).toHaveBeenCalledTimes(1)
    expect(searchClient).toHaveBeenCalledWith(
      expect.objectContaining({
        query: "路径规划",
        mode: "token"
      })
    )
  })

  it("does not run fulltext search while typing and asks users to submit manually", async () => {
    vi.useFakeTimers()
    const searchClient = vi.fn().mockResolvedValue({ results: [result] })

    render(<SearchApp settings={defaultSettings} searchClient={searchClient} />)

    fireEvent.click(screen.getByRole("radio", { name: "全文查询" }))
    expect(screen.getByText(/按 Enter 或点击全文搜索/)).toBeInTheDocument()

    fireEvent.change(screen.getByRole("searchbox", { name: /搜索/ }), {
      target: { value: "Main.gd:328 total_len" }
    })

    await act(async () => {
      vi.advanceTimersByTime(1000)
    })
    expect(searchClient).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole("button", { name: "搜索" }))

    expect(searchClient).toHaveBeenCalledWith(
      expect.objectContaining({
        query: "Main.gd:328 total_len",
        mode: "fulltext"
      })
    )
  })

  it("waits until Chinese composition ends before running realtime token search", async () => {
    vi.useFakeTimers()
    const searchClient = vi.fn().mockResolvedValue({ results: [] })

    render(<SearchApp settings={defaultSettings} searchClient={searchClient} />)

    const searchbox = screen.getByRole("searchbox", { name: /搜索/ })
    fireEvent.compositionStart(searchbox)
    fireEvent.change(searchbox, { target: { value: "maoci" } })

    await act(async () => {
      vi.advanceTimersByTime(300)
    })
    expect(searchClient).not.toHaveBeenCalled()

    fireEvent.change(searchbox, { target: { value: "毛刺" } })
    fireEvent.compositionEnd(searchbox)

    await act(async () => {
      vi.advanceTimersByTime(300)
    })

    expect(searchClient).toHaveBeenCalledWith(
      expect.objectContaining({
        query: "毛刺",
        mode: "token"
      })
    )
  })

  it("keeps stale search responses from replacing newer results", async () => {
    const user = userEvent.setup()
    const olderResult = { ...result, id: 1, title: "旧结果" }
    const newerResult = { ...result, id: 2, title: "新结果" }
    let resolveOlderSearch: (value: { results: (typeof result)[] }) => void = () => {}

    const searchClient = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<{ results: (typeof result)[] }>((resolve) => {
            resolveOlderSearch = resolve
          })
      )
      .mockResolvedValueOnce({ results: [newerResult] })

    render(<SearchApp settings={defaultSettings} searchClient={searchClient} />)

    const searchbox = screen.getByRole("searchbox", { name: /搜索/ })
    await user.type(searchbox, "旧")
    await user.click(screen.getByRole("button", { name: "搜索" }))

    await user.clear(searchbox)
    await user.type(searchbox, "新")
    await user.click(screen.getByRole("button", { name: "搜索" }))

    expect(await screen.findByRole("article", { name: "新结果" })).toBeInTheDocument()

    await act(async () => {
      resolveOlderSearch({ results: [olderResult] })
    })

    expect(screen.getByRole("article", { name: "新结果" })).toBeInTheDocument()
    expect(screen.queryByRole("article", { name: "旧结果" })).not.toBeInTheDocument()
  })
})
