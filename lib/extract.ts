const NOISE_TAGS = new Set(["script", "style", "noscript", "template", "svg", "canvas"])

const BLOCK_TAGS = new Set([
  "address", "article", "aside", "blockquote", "dd", "details",
  "dialog", "div", "dl", "dt", "fieldset", "figcaption", "figure",
  "footer", "form", "h1", "h2", "h3", "h4", "h5", "h6", "header",
  "hr", "li", "main", "nav", "ol", "p", "pre", "section",
  "summary", "table", "ul"
])

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
    .filter((line) => line.length > 0)
    .join("\n")
    .trim()
}

function isElementHidden(el: Element, computedStyle: typeof getComputedStyle): boolean {
  if (el.hasAttribute("hidden")) return true
  if (el.getAttribute("aria-hidden") === "true") return true

  try {
    const style = computedStyle(el)
    return style.display === "none" || style.visibility === "hidden"
  } catch {
    return false
  }
}

function isBlockElement(el: Element): boolean {
  return BLOCK_TAGS.has(el.tagName.toLowerCase())
}

function getSemanticText(el: Element): string | null {
  const tag = el.tagName.toLowerCase()

  if (tag === "input") {
    const input = el as HTMLInputElement
    if (input.type === "hidden") return null
    const value = input.value || input.getAttribute("placeholder") || ""
    return value.trim() || null
  }

  if (tag === "textarea") {
    const textarea = el as HTMLTextAreaElement
    const value = textarea.value || textarea.getAttribute("placeholder") || ""
    return value.trim() || null
  }

  if (tag === "img") {
    const alt = el.getAttribute("alt") || ""
    return alt.trim() || null
  }

  if (tag === "button") {
    const button = el as HTMLButtonElement
    const value =
      button.value || button.getAttribute("aria-label") || button.getAttribute("title") || ""
    return value.trim() || null
  }

  if (el.hasAttribute("aria-label") && tag !== "button") {
    return el.getAttribute("aria-label")!.trim() || null
  }

  if (el.hasAttribute("title") && tag !== "button" && !el.hasAttribute("aria-label")) {
    return el.getAttribute("title")!.trim() || null
  }

  return null
}

function shouldSkipChildren(el: Element): boolean {
  const tag = el.tagName.toLowerCase()
  if (tag === "input" || tag === "img" || tag === "textarea") return true

  if (tag === "button") {
    const hasChildText = [...el.childNodes].some(
      (child) => child.nodeType === Node.TEXT_NODE && (child.textContent || "").trim()
    )
    return !hasChildText
  }

  return false
}

function collectFullText(root: Element, computedStyle: typeof getComputedStyle): string {
  const segments: string[] = []
  let lastAddedNewline = false

  function appendSpace(): void {
    if (segments.length === 0 || lastAddedNewline) return

    const last = segments[segments.length - 1]
    if (!last.endsWith("\n") && !last.endsWith(" ")) {
      segments.push(" ")
    }
  }

  function walk(node: Node): void {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent || ""
      if (text.trim()) {
        segments.push(text)
        lastAddedNewline = false
      } else if (text.length > 0) {
        appendSpace()
      }
      return
    }

    if (node.nodeType !== Node.ELEMENT_NODE) return

    const el = node as Element
    const tag = el.tagName.toLowerCase()

    if (NOISE_TAGS.has(tag) || isElementHidden(el, computedStyle)) return

    if (tag === "br" || tag === "hr") {
      segments.push("\n")
      lastAddedNewline = true
      return
    }

    const semantic = getSemanticText(el)
    if (semantic) {
      appendSpace()
      segments.push(semantic)
      lastAddedNewline = false

      if (shouldSkipChildren(el)) return
    }

    const isBlock = isBlockElement(el)
    if (isBlock && segments.length > 0 && !lastAddedNewline) {
      segments.push("\n")
      lastAddedNewline = true
    }

    for (const child of el.childNodes) {
      walk(child)
    }

    if (isBlock && !lastAddedNewline) {
      segments.push("\n")
      lastAddedNewline = true
    }
  }

  for (const child of root.childNodes) {
    walk(child)
  }

  return segments.join("")
}

export function extractPageSnapshot(options: ExtractOptions): PageSnapshot | null {
  const {
    document: doc,
    url,
    now = Date.now,
    minContentLength = 0,
    maxContentLength = 1_048_576
  } = options

  const win = doc.defaultView || (typeof window !== "undefined" ? window : null)
  if (!win) return null

  const root = doc.body || doc.documentElement
  if (!root) return null

  const computedStyle = win.getComputedStyle.bind(win) as typeof getComputedStyle
  const normalized = normalizeText(collectFullText(root, computedStyle))

  if (minContentLength > 0 && normalized.length < minContentLength) {
    return null
  }

  return {
    title: doc.title || "",
    url,
    content:
      maxContentLength > 0 && normalized.length > maxContentLength
        ? normalized.slice(0, maxContentLength)
        : normalized,
    visitTime: now()
  }
}
