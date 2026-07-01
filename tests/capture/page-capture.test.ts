import { describe, expect, it } from "vitest"

import { extractPageSnapshot } from "../../lib/extract"
import {
  ARTICLE_HTML,
  ARTICLE_URL,
  BIGJPG_HTML,
  SIMPLE_PAGE_HTML,
  VISIT_TIME
} from "../fixtures/pages"

function parseHtml(html: string): Document {
  return new DOMParser().parseFromString(html, "text/html")
}

describe("page capture", () => {
  it("extracts title, url, full body content, and visit time from a normal page", () => {
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
    expect(snapshot?.content).toContain("首页 目录 登录")
  })

  it("extracts all visible text from body when no main or article wrapper exists", () => {
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

  it("captures FAQ text outside main/article area (Bigjpg-style page)", () => {
    const snapshot = extractPageSnapshot({
      document: parseHtml(BIGJPG_HTML),
      url: "https://bigjpg.com/faq",
      now: () => VISIT_TIME
    })

    expect(snapshot?.content).toContain("毛刺")
    expect(snapshot?.content).toContain("图片边缘也不会有毛刺和重影")
    expect(snapshot?.content).toContain("深度学习")
    expect(snapshot?.content).toContain("支持 PNG")
    expect(snapshot?.content).toContain("版权所有")
  })

  it("excludes script, style, template, svg, and canvas content", () => {
    const snapshot = extractPageSnapshot({
      document: parseHtml(BIGJPG_HTML),
      url: "https://bigjpg.com/faq",
      now: () => VISIT_TIME
    })

    expect(snapshot?.content).not.toContain("console.log")
    expect(snapshot?.content).not.toContain("template content should not appear")
    expect(snapshot?.content).not.toContain("svg text should be removed")
  })

  it("excludes hidden content (hidden attribute, display:none, aria-hidden)", () => {
    const html = `
      <html><head><title>hidden test</title></head><body>
        <p>可见文本 A</p>
        <p hidden>这段不应该出现</p>
        <p style="display:none">这段也不应该出现</p>
        <p aria-hidden="true">aria-hidden 隐藏内容</p>
        <div style="visibility:hidden">visibility hidden 内容</div>
        <p>可见文本 B</p>
      </body></html>
    `
    const snapshot = extractPageSnapshot({
      document: parseHtml(html),
      url: "https://example.com/hidden"
    })

    expect(snapshot?.content).toContain("可见文本 A")
    expect(snapshot?.content).toContain("可见文本 B")
    expect(snapshot?.content).not.toContain("这段不应该出现")
    expect(snapshot?.content).not.toContain("这段也不应该出现")
    expect(snapshot?.content).not.toContain("aria-hidden 隐藏内容")
    expect(snapshot?.content).not.toContain("visibility hidden 内容")
  })

  it("collects visible semantics from input, textarea, and img alt", () => {
    const html = `
      <html><head><title>form test</title></head><body>
        <form>
          <label>搜索：</label>
          <input type="text" value="关键词" placeholder="请输入" />
          <textarea>评论区内容</textarea>
          <img src="logo.png" alt="公司 Logo" />
          <input type="hidden" value="secret" />
        </form>
      </body></html>
    `
    const snapshot = extractPageSnapshot({
      document: parseHtml(html),
      url: "https://example.com/form"
    })

    expect(snapshot?.content).toContain("关键词")
    expect(snapshot?.content).toContain("评论区内容")
    expect(snapshot?.content).toContain("公司 Logo")
    expect(snapshot?.content).not.toContain("secret")
  })

  it("collects placeholder when input has no value", () => {
    const html = `
      <html><head><title>placeholder</title></head><body>
        <input type="text" placeholder="请输入邮箱" />
        <textarea placeholder="请填写备注"></textarea>
      </body></html>
    `
    const snapshot = extractPageSnapshot({
      document: parseHtml(html),
      url: "https://example.com/placeholder"
    })

    expect(snapshot?.content).toContain("请输入邮箱")
    expect(snapshot?.content).toContain("请填写备注")
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

  it("keeps nav, header, footer, aside content for full-text recall", () => {
    const html = `
      <html><head><title>layout test</title></head><body>
        <nav>导航链接</nav>
        <header>页面标题区</header>
        <main>主要内容区</main>
        <aside>侧边栏推荐</aside>
        <footer>页脚版权信息</footer>
      </body></html>
    `
    const snapshot = extractPageSnapshot({
      document: parseHtml(html),
      url: "https://example.com/layout"
    })

    expect(snapshot?.content).toContain("导航链接")
    expect(snapshot?.content).toContain("页面标题区")
    expect(snapshot?.content).toContain("主要内容区")
    expect(snapshot?.content).toContain("侧边栏推荐")
    expect(snapshot?.content).toContain("页脚版权信息")
  })

  it("removes consecutive duplicate lines but preserves distinct content", () => {
    const html = `
      <html><head><title>dedup</title></head><body>
        <div>重复行</div>
        <div>重复行</div>
        <div>唯一行</div>
        <div>重复行</div>
      </body></html>
    `
    const snapshot = extractPageSnapshot({
      document: parseHtml(html),
      url: "https://example.com/dedup"
    })

    expect(snapshot?.content).toContain("唯一行")
    expect(snapshot?.content.match(/重复行/g)?.length).toBeGreaterThanOrEqual(2)
  })
})
