import { describe, expect, it } from "vitest"

import { extractPageSnapshot } from "../../lib/extract"
import {
  ARTICLE_HTML,
  ARTICLE_URL,
  SIMPLE_PAGE_HTML,
  VISIT_TIME
} from "../fixtures/pages"

function parseHtml(html: string): Document {
  return new DOMParser().parseFromString(html, "text/html")
}

describe("page capture", () => {
  it("extracts title, url, readable body content, and visit time from a normal page", () => {
    const snapshot = extractPageSnapshot({
      document: parseHtml(ARTICLE_HTML),
      url: ARTICLE_URL,
      now: () => VISIT_TIME
    })

    expect(snapshot).toMatchObject({
      title: "路径规划课程笔记",
      url: ARTICLE_URL,
      visitTime: VISIT_TIME
    })
    expect(snapshot?.content).toContain("人工智能课程讨论了路径规划")
    expect(snapshot?.content).toContain("Main.gd:328 total_len")
    expect(snapshot?.content).not.toContain("首页 目录 登录")
  })

  it("falls back to body innerText when readability-style extraction is not available", () => {
    const snapshot = extractPageSnapshot({
      document: parseHtml(SIMPLE_PAGE_HTML),
      url: "https://example.com/debug",
      now: () => VISIT_TIME
    })

    expect(snapshot?.title).toBe("调试记录")
    expect(snapshot?.content).toContain("torch.randint")
    expect(snapshot?.content).toContain("R2")
    expect(snapshot?.content).toContain("Z轴")
  })

  it("skips pages whose extracted body is shorter than the minimum content length", () => {
    const snapshot = extractPageSnapshot({
      document: parseHtml("<html><head><title>x</title></head><body>short</body></html>"),
      url: "https://example.com/short",
      now: () => VISIT_TIME,
      minContentLength: 20
    })

    expect(snapshot).toBeNull()
  })

  it("truncates abnormal pages to the configured maximum content length", () => {
    const longText = "路径规划".repeat(2_000)
    const snapshot = extractPageSnapshot({
      document: parseHtml(`<html><head><title>long</title></head><body>${longText}</body></html>`),
      url: "https://example.com/long",
      now: () => VISIT_TIME,
      maxContentLength: 100
    })

    expect(snapshot?.content.length).toBeLessThanOrEqual(100)
  })
})
