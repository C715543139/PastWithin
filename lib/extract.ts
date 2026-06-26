const NOISE_SELECTORS = ["nav", "script", "style", "header", "footer", "noscript"]

interface ExtractOptions {
  document: Document
  url: string
  now?: () => number
  minContentLength?: number
  maxContentLength?: number
}

interface PageSnapshot {
  title: string
  url: string
  content: string
  visitTime: number
}

function normalizeText(raw: string): string {
  return raw
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .join("\n")
    .trim()
}

function elementText(element: Element): string {
  return (element as HTMLElement).innerText || element.textContent || ""
}

function extractBodyText(doc: Document): string {
  const main = doc.querySelector("main") || doc.querySelector("article")
  if (main) {
    const text = elementText(main)
    if (text.trim()) {
      return text
    }
  }

  return doc.body ? elementText(doc.body) : ""
}

export function extractPageSnapshot(options: ExtractOptions): PageSnapshot | null {
  const {
    document: doc,
    url,
    now = Date.now,
    minContentLength = 0,
    maxContentLength = 1_048_576
  } = options

  const clone = doc.cloneNode(true) as Document
  NOISE_SELECTORS.forEach((selector) => {
    clone.querySelectorAll(selector).forEach((element) => element.remove())
  })

  const bodyText = normalizeText(extractBodyText(clone))

  if (minContentLength > 0 && bodyText.length < minContentLength) {
    return null
  }

  return {
    title: doc.title || "",
    url,
    content:
      maxContentLength > 0 && bodyText.length > maxContentLength
        ? bodyText.slice(0, maxContentLength)
        : bodyText,
    visitTime: now()
  }
}

