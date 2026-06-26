interface SnippetOptions {
  content: string
  query?: string
  tokens?: string[]
  radius?: number
}

interface SnippetResult {
  text: string
  highlights: string[]
}

interface HighlightedTextPart {
  text: string
  highlighted: boolean
}

function buildFulltextSnippet(
  content: string,
  query: string,
  radius: number
): SnippetResult {
  const position = content.indexOf(query)
  if (position === -1) {
    return { text: "", highlights: [] }
  }

  const start = Math.max(0, position - radius)
  const end = Math.min(content.length, position + query.length + radius)

  let text = content.slice(start, end)
  if (start > 0) text = `...${text}`
  if (end < content.length) text = `${text}...`

  return { text, highlights: [query] }
}

function buildTokenSnippet(
  content: string,
  tokens: string[],
  radius: number
): SnippetResult {
  const highlights: string[] = []
  let bestPosition = -1

  for (const token of tokens) {
    const position = content.indexOf(token)
    if (position !== -1) {
      highlights.push(token)
      if (bestPosition === -1 || position < bestPosition) {
        bestPosition = position
      }
    }
  }

  if (bestPosition === -1) {
    return { text: content.slice(0, radius * 2), highlights: [] }
  }

  const start = Math.max(0, bestPosition - radius)
  const end = Math.min(content.length, bestPosition + radius)

  let text = content.slice(start, end)
  if (start > 0) text = `...${text}`
  if (end < content.length) text = `${text}...`

  return { text, highlights }
}

export function buildSnippet(options: SnippetOptions): SnippetResult {
  const { content, query, tokens, radius = 60 } = options

  if (query) {
    return buildFulltextSnippet(content, query, radius)
  }

  if (tokens && tokens.length > 0) {
    return buildTokenSnippet(content, tokens, radius)
  }

  return { text: content.slice(0, radius * 2), highlights: [] }
}

export function splitHighlightedText(
  text: string,
  highlights: string[]
): HighlightedTextPart[] {
  const escapedHighlights = highlights
    .filter((highlight) => highlight.length > 0)
    .map((highlight) => highlight.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))

  if (!text || escapedHighlights.length === 0) {
    return [{ text, highlighted: false }]
  }

  const regex = new RegExp(escapedHighlights.join("|"), "g")
  const parts: HighlightedTextPart[] = []
  let lastIndex = 0

  for (const match of text.matchAll(regex)) {
    if (match.index === undefined) continue

    if (match.index > lastIndex) {
      parts.push({
        text: text.slice(lastIndex, match.index),
        highlighted: false
      })
    }

    parts.push({ text: match[0], highlighted: true })
    lastIndex = match.index + match[0].length
  }

  if (lastIndex < text.length) {
    parts.push({ text: text.slice(lastIndex), highlighted: false })
  }

  return parts.length > 0 ? parts : [{ text, highlighted: false }]
}

