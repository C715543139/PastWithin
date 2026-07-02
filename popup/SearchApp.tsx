import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type SyntheticEvent
} from "react"

import type { AppSettings, SearchRequest, SearchResult } from "../lib/types"

type SearchClient = (
  params: Pick<SearchRequest, "query" | "mode" | "maxResults">
) => Promise<{ results: SearchResult[] }>

const TOKEN_SEARCH_DEBOUNCE_MS = 300

interface SearchAppProps {
  settings: AppSettings
  searchClient: SearchClient
}

function renderHighlightedText(
  text: string,
  highlights: string[]
): ReactNode {
  if (!highlights.length || !text) return text

  const parts: ReactNode[] = []
  let cursor = 0
  const lowerText = text.toLowerCase()
  const normalizedHighlights = highlights
    .map((highlight) => highlight.toLowerCase())
    .filter((highlight) => highlight.length > 0)

  while (cursor < text.length) {
    const next = normalizedHighlights
      .map((highlight) => ({
        highlight,
        index: lowerText.indexOf(highlight, cursor)
      }))
      .filter((item) => item.highlight.length > 0 && item.index >= 0)
      .sort((a, b) => a.index - b.index)[0]

    if (!next) {
      parts.push(text.slice(cursor))
      break
    }

    if (next.index > cursor) {
      parts.push(text.slice(cursor, next.index))
    }

    const end = next.index + next.highlight.length
    parts.push(<mark key={`${next.highlight}-${next.index}`}>{text.slice(next.index, end)}</mark>)
    cursor = end
  }

  return parts.length > 0 ? parts : text
}

export function SearchApp({ settings, searchClient }: SearchAppProps) {
  const [query, setQuery] = useState("")
  const [mode, setMode] = useState<SearchRequest["mode"]>("token")
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hasSearched, setHasSearched] = useState(false)
  const [isComposing, setIsComposing] = useState(false)
  const requestIdRef = useRef(0)

  const fulltextDisabled = !settings.saveContentEnabled

  const clearSearch = useCallback(() => {
    requestIdRef.current += 1
    setResults([])
    setError(null)
    setLoading(false)
    setHasSearched(false)
  }, [])

  const runSearch = useCallback(
    async (rawQuery: string, requestedMode: SearchRequest["mode"]) => {
      const trimmedQuery = rawQuery.trim()
      if (!trimmedQuery) {
        clearSearch()
        return
      }

      const requestId = requestIdRef.current + 1
      requestIdRef.current = requestId

      setLoading(true)
      setError(null)
      try {
        const response = await searchClient({
          query: trimmedQuery,
          mode: fulltextDisabled ? "token" : requestedMode,
          maxResults: settings.maxResults
        })

        if (requestIdRef.current !== requestId) return

        setResults(response.results)
        setHasSearched(true)
      } catch (err) {
        if (requestIdRef.current !== requestId) return

        setError(err instanceof Error ? err.message : "搜索失败")
        setResults([])
        setHasSearched(true)
      } finally {
        if (requestIdRef.current === requestId) {
          setLoading(false)
        }
      }
    },
    [clearSearch, fulltextDisabled, searchClient, settings.maxResults]
  )

  useEffect(() => {
    if (mode !== "token" || isComposing) return

    const trimmedQuery = query.trim()
    if (!trimmedQuery) {
      clearSearch()
      return
    }

    const timerId = window.setTimeout(() => {
      void runSearch(trimmedQuery, "token")
    }, TOKEN_SEARCH_DEBOUNCE_MS)

    return () => window.clearTimeout(timerId)
  }, [clearSearch, isComposing, mode, query, runSearch])

  function handleSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault()
    void runSearch(query, mode)
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
          onCompositionStart={() => setIsComposing(true)}
          onCompositionEnd={(event) => {
            setIsComposing(false)
            setQuery(event.currentTarget.value)
          }}
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
        {!fulltextDisabled && mode === "fulltext" && (
          <p>请按 Enter 或点击全文搜索。</p>
        )}

        <button type="submit">搜索</button>
      </form>

      {error && <p role="alert">搜索出错: {error}</p>}
      {loading && <p>搜索中...</p>}
      {hasSearched && !loading && !error && results.length === 0 && (
        <p>暂无搜索结果</p>
      )}

      {results.map((result) => (
        <article key={result.id} aria-label={result.title}>
          <a href={result.url} target="_blank" rel="noopener noreferrer">
            {renderHighlightedText(result.title, result.highlights)}
          </a>
          <div>{result.url}</div>
          <div>{new Date(result.visitTime).toLocaleString()}</div>
          {result.isBookmarked && <span aria-label="已收藏">★</span>}
          <div>{renderHighlightedText(result.snippet, result.highlights)}</div>
        </article>
      ))}
    </div>
  )
}
