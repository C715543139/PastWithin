interface CapturedPage {
  url: string
  title: string
  content: string
  visitTime: number
}

interface PipelineSettings {
  saveBookmarkedOnly: boolean
  [key: string]: unknown
}

interface SavePageData {
  url: string
  title: string
  content: string
  visitTime: number
  isBookmarked: boolean
}

interface SavePageOptions {
  settings: PipelineSettings
  splitWords: (input: string) => string[]
}

interface PipelineDeps {
  captured: CapturedPage
  settings: PipelineSettings
  isBookmarkedUrl: (url: string) => Promise<boolean>
  savePageWithIndexes: (
    pageData: SavePageData,
    options: SavePageOptions
  ) => Promise<unknown>
  splitWords: (input: string) => string[]
}

export async function handleCapturedPageMessage(deps: PipelineDeps): Promise<void> {
  const { captured, settings, isBookmarkedUrl, savePageWithIndexes, splitWords } =
    deps

  const isBookmarked = await isBookmarkedUrl(captured.url)

  if (settings.saveBookmarkedOnly && !isBookmarked) {
    return
  }

  await savePageWithIndexes(
    {
      url: captured.url,
      title: captured.title,
      content: captured.content,
      visitTime: captured.visitTime,
      isBookmarked
    },
    {
      settings,
      splitWords
    }
  )
}

