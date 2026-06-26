import { useState, type FormEvent, type ReactNode } from "react"

import type { AppSettings, SearchRequest, SearchResult } from "../lib/types"

type SearchClient = (
  params: Pick<SearchRequest, "query" | "mode" | "maxResults">
) => Promise<{ results: SearchResult[] }>

interface SearchAppProps {
  settings: AppSettings
  searchClient: SearchClient
}

function renderHighlightedSnippet(
  snippet: string,
  highlights: string[]
): ReactNode {
  if (!highlights.length || !snippet) return snippet

  const parts: ReactNode[] = []
  let cursor = 0

  while (cursor < snippet.length) {
    const next = highlights
      .map((highlight) => ({
        highlight,
        index: snippet.indexOf(highlight, cursor)
      }))
      .filter((item) => item.highlight.length > 0 && item.index >= 0)
      .sort((a, b) => a.index - b.index)[0]

    if (!next) {
      parts.push(snippet.slice(cursor))
      break
    }

    if (next.index > cursor) {
      parts.push(snippet.slice(cursor, next.index))
    }

    parts.push(<mark key={`${next.highlight}-${next.index}`}>{next.highlight}</mark>)
    cursor = next.index + next.highlight.length
  }

  return parts.length > 0 ? parts : snippet
}

export function SearchApp({ settings, searchClient }: SearchAppProps) {
  const [query, setQuery] = useState("")
  const [mode, setMode] = useState<SearchRequest["mode"]>("token")
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)

  const fulltextDisabled = !settings.saveContentEnabled

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const trimmedQuery = query.trim()
    if (!trimmedQuery) return

    setLoading(true)
    try {
      const response = await searchClient({
        query: trimmedQuery,
        mode: fulltextDisabled ? "token" : mode,
        maxResults: settings.maxResults
      })
      setResults(response.results)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <form onSubmit={handleSubmit}>
        <input
          role="searchbox"
          aria-label="搜索"
          type="text"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />

        <fieldset>
          <legend>搜索模式</legend>
          <label>
            <input
              type="radio"
              name="searchMode"
              checked={mode === "token"}
              onChange={() => setMode("token")}
            />
            分词查询
          </label>
          <label>
            <input
              type="radio"
              name="searchMode"
              checked={mode === "fulltext"}
              onChange={() => setMode("fulltext")}
              disabled={fulltextDisabled}
            />
            全文查询
          </label>
        </fieldset>

        {fulltextDisabled && <p>保存正文关闭，全文查询不可用</p>}

        <button type="submit">搜索</button>
      </form>

      {loading && <p>搜索中...</p>}

      {results.map((result) => (
        <article key={result.id} aria-label={result.title}>
          <a href={result.url}>{result.title}</a>
          <div>{result.url}</div>
          <div>{new Date(result.visitTime).toLocaleString()}</div>
          {result.isBookmarked && <span aria-label="已收藏">★</span>}
          <div>{renderHighlightedSnippet(result.snippet, result.highlights)}</div>
        </article>
      ))}
    </div>
  )
}

