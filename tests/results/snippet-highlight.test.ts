import { describe, expect, it } from "vitest"

import { buildSnippet, splitHighlightedText } from "../../lib/snippet"

describe("snippet and highlight helpers", () => {
  it("builds a compact context around an exact fulltext match", () => {
    const snippet = buildSnippet({
      content: "前文".repeat(50) + "Main.gd:328 total_len" + "后文".repeat(50),
      query: "Main.gd:328 total_len",
      radius: 8
    })

    expect(snippet.text).toContain("Main.gd:328 total_len")
    expect(snippet.text.startsWith("...")).toBe(true)
    expect(snippet.text.endsWith("...")).toBe(true)
    expect(snippet.highlights).toEqual(["Main.gd:328 total_len"])
  })

  it("builds a token snippet when only segmented keyword matches are available", () => {
    const snippet = buildSnippet({
      content: "人工智能课程讨论了路径规划、专家系统和知识图谱。",
      tokens: ["路径规划", "知识图谱"],
      radius: 10
    })

    expect(snippet.text).toContain("路径规划")
    expect(snippet.highlights).toEqual(expect.arrayContaining(["路径规划"]))
  })

  it("splits highlighted text into safe text parts instead of returning html", () => {
    const parts = splitHighlightedText("hello <script>alert(1)</script> world", ["<script>alert(1)</script>"])

    expect(parts).toEqual([
      { text: "hello ", highlighted: false },
      { text: "<script>alert(1)</script>", highlighted: true },
      { text: " world", highlighted: false }
    ])
  })
})

