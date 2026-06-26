import { describe, expect, it, vi } from "vitest"

import { handleCapturedPageMessage } from "../../background/capturePipeline"
import { capturedArticle, defaultSettings, testSplitWords } from "../fixtures/pages"

describe("capture pipeline", () => {
  it("resolves bookmark status before persisting a captured page", async () => {
    const isBookmarkedUrl = vi.fn().mockResolvedValue(true)
    const savePageWithIndexes = vi.fn().mockResolvedValue({ id: 1 })

    await handleCapturedPageMessage({
      captured: capturedArticle,
      settings: defaultSettings,
      isBookmarkedUrl,
      savePageWithIndexes,
      splitWords: testSplitWords
    })

    expect(isBookmarkedUrl).toHaveBeenCalledWith(capturedArticle.url)
    expect(savePageWithIndexes).toHaveBeenCalledWith(
      expect.objectContaining({
        url: capturedArticle.url,
        title: capturedArticle.title,
        content: capturedArticle.content,
        visitTime: capturedArticle.visitTime,
        isBookmarked: true
      }),
      expect.objectContaining({
        settings: defaultSettings,
        splitWords: testSplitWords
      })
    )
  })

  it("does not persist non-bookmarked pages when saveBookmarkedOnly is enabled", async () => {
    const isBookmarkedUrl = vi.fn().mockResolvedValue(false)
    const savePageWithIndexes = vi.fn()

    await handleCapturedPageMessage({
      captured: capturedArticle,
      settings: {
        ...defaultSettings,
        saveBookmarkedOnly: true
      },
      isBookmarkedUrl,
      savePageWithIndexes,
      splitWords: testSplitWords
    })

    expect(savePageWithIndexes).not.toHaveBeenCalled()
  })
})

