import type { PastWithinDb } from "./db"
import type {
  AppSettings,
  PageContentRecord,
  PageRecord,
  SearchRequest,
  SearchResult
} from "../lib/types"

const SNIPPET_RADIUS = 80

interface SnippetData {
  text: string
  highlights: string[]
}

interface SearchStrategy {
  mode: SearchRequest["mode"]
  isAvailable(settings: AppSettings): boolean
}

function bookmarkScore(isBookmarked: boolean): number {
  return isBookmarked ? 5 : 0
}

function recencyScore(visitTime: number): number {
  return Math.log10(Math.max(visitTime / 1_000_000_000, 1))
}

function buildTokenSnippet(content: string, tokens: string[]): SnippetData {
  const lowerContent = content.toLowerCase()
  const matchedTokens = tokens.filter((token) =>
    lowerContent.includes(token.toLowerCase())
  )

  let firstPosition = content.length
  let firstToken = ""

  for (const token of matchedTokens) {
    const position = lowerContent.indexOf(token.toLowerCase())
    if (position >= 0 && position < firstPosition) {
      firstPosition = position
      firstToken = token
    }
  }

  if (!firstToken) {
    return { text: content.slice(0, 200), highlights: [] }
  }

  const start = Math.max(0, firstPosition - SNIPPET_RADIUS)
  const end = Math.min(
    content.length,
    firstPosition + firstToken.length + SNIPPET_RADIUS
  )

  let text = content.slice(start, end)
  if (start > 0) text = `...${text}`
  if (end < content.length) text = `${text}...`

  const lowerSnippet = text.toLowerCase()
  const highlights = matchedTokens.filter((token) =>
    lowerSnippet.includes(token.toLowerCase())
  )

  return { text, highlights }
}

function buildFulltextSnippet(content: string, query: string): SnippetData {
  const lowerContent = content.toLowerCase()
  const lowerQuery = query.toLowerCase()
  const position = lowerContent.indexOf(lowerQuery)

  if (position < 0) {
    return { text: content.slice(0, 200), highlights: [query] }
  }

  const start = Math.max(0, position - SNIPPET_RADIUS)
  const end = Math.min(content.length, position + query.length + SNIPPET_RADIUS)

  let text = content.slice(start, end)
  if (start > 0) text = `...${text}`
  if (end < content.length) text = `${text}...`

  return { text, highlights: [query] }
}

async function tokenSearch(
  db: PastWithinDb,
  request: SearchRequest,
  splitWords: (input: string) => string[],
  maxResults: number
): Promise<SearchResult[]> {
  const tokens = splitWords(request.query)
  if (tokens.length === 0) return []

  const hitMap = new Map<
    number,
    {
      titleHits: number
      contentHits: number
    }
  >()

  for (const token of tokens) {
    const titleMatches = await db.pageContents
      .where("titleWords")
      .equals(token)
      .toArray()

    for (const pageContent of titleMatches) {
      const entry = hitMap.get(pageContent.pageId) ?? {
        titleHits: 0,
        contentHits: 0
      }
      entry.titleHits += 1
      hitMap.set(pageContent.pageId, entry)
    }

    const contentMatches = await db.pageContents
      .where("contentWords")
      .equals(token)
      .toArray()

    for (const pageContent of contentMatches) {
      const entry = hitMap.get(pageContent.pageId) ?? {
        titleHits: 0,
        contentHits: 0
      }
      entry.contentHits += 1
      hitMap.set(pageContent.pageId, entry)
    }
  }

  if (hitMap.size === 0) return []

  const pageIds = [...hitMap.keys()]
  const pages = await db.pages.bulkGet(pageIds)
  const pageById = new Map<number, PageRecord>()

  for (const page of pages) {
    if (page?.id != null) {
      pageById.set(page.id, page)
    }
  }

  const scored = pageIds
    .map((pageId) => {
      const page = pageById.get(pageId)
      const hits = hitMap.get(pageId)
      if (!page || !hits) return null

      return {
        pageId,
        page,
        score:
          hits.titleHits * 8 +
          hits.contentHits * 2 +
          bookmarkScore(page.isBookmarked) +
          recencyScore(page.visitTime)
      }
    })
    .filter(
      (
        item
      ): item is {
        pageId: number
        page: PageRecord
        score: number
      } => item !== null
    )
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults)

  const contents = await db.pageContents.bulkGet(
    scored.map((item) => item.pageId)
  )
  const contentByPageId = new Map<number, PageContentRecord>()
  for (const content of contents) {
    if (content) {
      contentByPageId.set(content.pageId, content)
    }
  }

  return scored.map(({ pageId, page, score }) => {
    const pageContent = contentByPageId.get(pageId)
    const snippetData = pageContent?.content
      ? buildTokenSnippet(pageContent.content, tokens)
      : {
          text: page.title,
          highlights: tokens.filter((token) =>
            page.title.toLowerCase().includes(token.toLowerCase())
          )
        }

    return {
      id: page.id!,
      url: page.url,
      title: page.title,
      visitTime: page.visitTime,
      isBookmarked: page.isBookmarked,
      snippet: snippetData.text,
      highlights: snippetData.highlights,
      score
    }
  })
}

async function fulltextSearch(
  db: PastWithinDb,
  request: SearchRequest,
  maxResults: number
): Promise<SearchResult[]> {
  const query = request.query.trim()
  if (!query) return []

  const lowerQuery = query.toLowerCase()
  const matchedContents = await db.pageContents
    .filter(
      (pageContent) =>
        !!pageContent.content &&
        pageContent.content.toLowerCase().includes(lowerQuery)
    )
    .toArray()

  if (matchedContents.length === 0) return []

  const pages = await db.pages.bulkGet(
    matchedContents.map((content) => content.pageId)
  )
  const pageById = new Map<number, PageRecord>()
  for (const page of pages) {
    if (page?.id != null) {
      pageById.set(page.id, page)
    }
  }

  return matchedContents
    .map((pageContent) => {
      const page = pageById.get(pageContent.pageId)
      if (!page || !pageContent.content) return null

      const titleMatch = page.title.toLowerCase().includes(lowerQuery) ? 8 : 0
      const score =
        titleMatch +
        bookmarkScore(page.isBookmarked) +
        recencyScore(page.visitTime)
      const snippetData = buildFulltextSnippet(pageContent.content, query)

      return {
        id: page.id!,
        url: page.url,
        title: page.title,
        visitTime: page.visitTime,
        isBookmarked: page.isBookmarked,
        snippet: snippetData.text,
        highlights: snippetData.highlights,
        score
      }
    })
    .filter((result): result is SearchResult => result !== null)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults)
}

export const tokenSearchStrategy: SearchStrategy = {
  mode: "token",
  isAvailable: () => true
}

export const fulltextSearchStrategy: SearchStrategy = {
  mode: "fulltext",
  isAvailable: (settings) => settings.saveContentEnabled
}

export async function searchPages(params: {
  db: PastWithinDb
  settings: AppSettings
  splitWords: (input: string) => string[]
  request: SearchRequest
}): Promise<{ results: SearchResult[]; error?: string }> {
  const { db, settings, splitWords, request } = params

  if (request.mode === "fulltext" && !fulltextSearchStrategy.isAvailable(settings)) {
    return {
      results: [],
      error: "Fulltext search unavailable: saveContentEnabled is disabled"
    }
  }

  if (!request.query.trim()) {
    return { results: [] }
  }

  const maxResults = request.maxResults ?? settings.maxResults
  const results =
    request.mode === "token"
      ? await tokenSearch(db, request, splitWords, maxResults)
      : await fulltextSearch(db, request, maxResults)

  return {
    results: request.onlyBookmarked
      ? results.filter((result) => result.isBookmarked)
      : results
  }
}

