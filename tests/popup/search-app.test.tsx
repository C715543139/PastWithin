import "@testing-library/jest-dom/vitest"

import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

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
    expect(within(item).getByRole("link", { name: "路径规划课程笔记" })).toHaveAttribute("href", result.url)
    expect(within(item).getByText(result.url)).toBeInTheDocument()
    expect(within(item).getByText(new Date(VISIT_TIME).toLocaleString())).toBeInTheDocument()
    expect(within(item).getByLabelText("已收藏")).toBeInTheDocument()
    expect(within(item).getByText("路径规划")).toHaveTextContent("路径规划")
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
})

