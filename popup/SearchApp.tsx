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
const SHORT_FULLTEXT_QUERY_MAX_LENGTH = 2

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

function getUrlHost(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return url
  }
}

export function SearchApp({ settings, searchClient }: SearchAppProps) {
  const [query, setQuery] = useState("")
  const [mode, setMode] = useState<SearchRequest["mode"]>("token")
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hasSearched, setHasSearched] = useState(false)
  const [isComposing, setIsComposing] = useState(false)
  const [pendingShortQuery, setPendingShortQuery] = useState<string | null>(null)
  const [confirmedShortQuery, setConfirmedShortQuery] = useState<string | null>(null)
  const requestIdRef = useRef(0)

  const fulltextDisabled = !settings.saveContentEnabled

  function updateQuery(nextQuery: string) {
    setQuery(nextQuery)
    setPendingShortQuery(null)
    setConfirmedShortQuery(null)
  }

  function updateMode(nextMode: SearchRequest["mode"]) {
    setMode(nextMode)
    setPendingShortQuery(null)
    setConfirmedShortQuery(null)
  }

  function shouldConfirmShortFulltextQuery(
    trimmedQuery: string,
    requestedMode: SearchRequest["mode"]
  ): boolean {
    return (
      requestedMode === "fulltext" &&
      !fulltextDisabled &&
      trimmedQuery.length > 0 &&
      trimmedQuery.length <= SHORT_FULLTEXT_QUERY_MAX_LENGTH &&
      confirmedShortQuery !== trimmedQuery
    )
  }

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
    const trimmedQuery = query.trim()
    if (shouldConfirmShortFulltextQuery(trimmedQuery, mode)) {
      setPendingShortQuery(trimmedQuery)
      return
    }

    void runSearch(query, mode)
  }

  function handleConfirmShortQuery() {
    if (!pendingShortQuery) return

    setConfirmedShortQuery(pendingShortQuery)
    setPendingShortQuery(null)
    void runSearch(pendingShortQuery, "fulltext")
  }

  function handleCancelShortQuery() {
    setPendingShortQuery(null)
  }

  return (
    <div className="search-app">
      <form onSubmit={handleSubmit} className="search-form">
        <div className="search-controls">
          <input
            className="search-input"
            role="searchbox"
            aria-label="搜索"
            type="text"
            value={query}
            onChange={(event) => updateQuery(event.target.value)}
            onCompositionStart={() => setIsComposing(true)}
            onCompositionEnd={(event) => {
              setIsComposing(false)
              updateQuery(event.currentTarget.value)
            }}
          />

          <div className="search-mode-wrapper">
            <select
              className="search-mode-select"
              aria-label="搜索方式"
              value={fulltextDisabled ? "token" : mode}
              onChange={(event) =>
                updateMode(event.target.value as SearchRequest["mode"])
              }
            >
              <option value="token">分词</option>
              <option value="fulltext" disabled={fulltextDisabled}>
                全文
              </option>
            </select>
          </div>

          <button type="submit" className="popup-btn popup-btn-primary">
            搜索
          </button>
        </div>

        {fulltextDisabled && <p>保存正文关闭，全文查询不可用</p>}
        {!fulltextDisabled && mode === "fulltext" && (
          <p>请按 Enter 或点击搜索</p>
        )}
      </form>

      <div className="search-results">
        {pendingShortQuery && (
          <div role="alert" className="short-query-confirm">
            <p>全文查询词较短，可能命中大量页面并花费更久。</p>
            <div className="short-query-actions">
              <button
                type="button"
                onClick={handleConfirmShortQuery}
                className="popup-btn popup-btn-primary"
              >
                继续全文搜索
              </button>
              <button
                type="button"
                onClick={handleCancelShortQuery}
                className="popup-btn popup-btn-secondary"
              >
                取消
              </button>
            </div>
          </div>
        )}

        {error && <p role="alert">搜索出错: {error}</p>}
        {loading && <p>搜索中...</p>}
        {hasSearched && !loading && !error && results.length === 0 && (
          <p>暂无搜索结果</p>
        )}

        {results.map((result) => (
          <article key={result.id} aria-label={result.title} className="result-item">
            <div className="result-title-row">
              {result.isBookmarked && (
                <span className="bookmark-badge">已收藏</span>
              )}
              <a href={result.url} target="_blank" rel="noopener noreferrer">
                {renderHighlightedText(result.title, result.highlights)}
              </a>
            </div>
            <div className="result-meta-row">
              <div className="result-url" title={result.url}>
                {getUrlHost(result.url)}
              </div>
              <span className="result-meta-separator">·</span>
              <div className="result-meta">
                {new Date(result.visitTime).toLocaleString()}
              </div>
            </div>
            <div className="result-snippet">
              {renderHighlightedText(result.snippet, result.highlights)}
            </div>
          </article>
        ))}
      </div>
    </div>
  )
}
