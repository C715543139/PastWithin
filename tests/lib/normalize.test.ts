import { describe, expect, it } from "vitest"

import { normalizeUrl } from "../../lib/normalize"

describe("normalizeUrl", () => {
    it("strips the hash fragment from a url while preserving query", () => {
        expect(
            normalizeUrl("https://example.com/course/path-planning?week=3#section")
        ).toBe("https://example.com/course/path-planning?week=3")
    })

    it("returns the url unchanged when there is no hash", () => {
        expect(normalizeUrl("https://example.com/page")).toBe("https://example.com/page")
    })

    it("preserves query parameters", () => {
        expect(normalizeUrl("https://example.com/search?q=ai&page=2#top")).toBe(
            "https://example.com/search?q=ai&page=2"
        )
    })

    it("falls back to splitting on # for invalid urls", () => {
        expect(normalizeUrl("not-a-url#frag")).toBe("not-a-url")
    })

    it("returns the original url when it has no hash and is invalid", () => {
        expect(normalizeUrl("not-a-url")).toBe("not-a-url")
    })
})
