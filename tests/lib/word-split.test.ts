import { beforeEach, describe, expect, it, vi } from "vitest"

const initMock = vi.fn(async () => undefined)
const cutForSearchMock = vi.fn((input: string) => {
  if (input.includes("人工智能")) {
    return ["人工", "智能", "人工智能", "课程", "路径", "规划", "路径规划"]
  }
  if (input.includes("毛刺")) {
    return ["图片", "边缘", "毛刺", "重影"]
  }
  if (input.includes("路径 路径")) {
    return ["路径", "路径"]
  }
  return []
})

vi.mock("jieba-wasm/web", () => ({
  default: initMock,
  cut_for_search: cutForSearchMock
}))

const { splitWords } = await import("../../lib/wordSplit")

describe("wordSplit", () => {
  beforeEach(() => {
    initMock.mockClear()
    cutForSearchMock.mockClear()
  })

  it("returns an empty array for empty input without initializing wasm", async () => {
    expect(await splitWords("")).toEqual([])
    expect(await splitWords("   ")).toEqual([])
    expect(initMock).not.toHaveBeenCalled()
  })

  it("uses jieba search-mode tokens for Chinese words", async () => {
    const tokens = await splitWords("人工智能课程讨论了路径规划")

    expect(cutForSearchMock).toHaveBeenCalledWith("人工智能课程讨论了路径规划", true)
    expect(tokens).toEqual(expect.arrayContaining(["人工智能", "课程", "路径规划"]))
    expect(tokens).not.toContain("径规")
  })

  it("uses Intl.Segmenter for English and code-like words", async () => {
    const tokens = await splitWords("Main.gd:328 total_len Date.now() tempPageExpireTime")

    expect(tokens).toEqual(
      expect.arrayContaining(["main.gd", "328", "total_len", "date.now", "temppageexpiretime"])
    )
  })

  it("combines Chinese and English tokens without fallback bigrams", async () => {
    const tokens = await splitWords("图片边缘也不会有毛刺和重影 PyTorch")

    expect(tokens).toEqual(expect.arrayContaining(["图片", "边缘", "毛刺", "重影", "pytorch"]))
    expect(tokens).not.toContain("毛刺和")
  })

  it("deduplicates tokens from all segmenters", async () => {
    const tokens = await splitWords("路径 路径")
    const occurrences = tokens.filter((token) => token === "路径").length

    expect(occurrences).toBe(1)
  })
})
