import { describe, expect, it } from "vitest"

import { splitWords } from "../../lib/wordSplit"

describe("wordSplit", () => {
    it("returns an empty array for empty input", () => {
        expect(splitWords("")).toEqual([])
        expect(splitWords("   ")).toEqual([])
    })

    it("splits a chinese run into the full run, single chars, and bigrams", () => {
        const tokens = splitWords("路径规划")
        expect(tokens).toContain("路径规划")
        expect(tokens).toContain("路")
        expect(tokens).toContain("径")
        expect(tokens).toContain("规划")
        expect(tokens).toContain("路径")
        expect(tokens).toContain("径规")
        expect(tokens).toContain("划")
    })

    it("keeps latin/digit/underscore tokens together and lowercases them", () => {
        const tokens = splitWords("Main.gd:328 total_len")
        expect(tokens).toContain("main")
        expect(tokens).toContain("gd")
        expect(tokens).toContain("328")
        expect(tokens).toContain("total_len")
    })

    it("handles mixed cjk and latin runs by flushing both buffers", () => {
        const tokens = splitWords("路径规划DWA")
        expect(tokens).toContain("路径规划")
        expect(tokens).toContain("dwa")
        expect(tokens).toContain("路")
        expect(tokens).toContain("规划")
    })

    it("ignores punctuation and whitespace as token boundaries", () => {
        const tokens = splitWords("R2, Z轴！")
        expect(tokens).toContain("r2")
        expect(tokens).toContain("z")
        expect(tokens).toContain("轴")
    })

    it("deduplicates tokens", () => {
        const tokens = splitWords("路径 路径")
        const occurrences = tokens.filter((t) => t === "路径").length
        expect(occurrences).toBe(1)
    })

    it("handles code-style tokens with dots and colons as separators", () => {
        const tokens = splitWords("torch.randint")
        expect(tokens).toContain("torch")
        expect(tokens).toContain("randint")
    })
})
