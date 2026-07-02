import initDefault, * as jiebaNamespace from "jieba-wasm/web"

type JiebaModule = {
  default?: () => Promise<unknown>
  cut_for_search?: (text: string, hmm?: boolean | null) => string[]
}

const CJK_OR_LATIN_PATTERN =
  /[a-z0-9\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/iu

const PUNCTUATION_EDGE_PATTERN =
  /^[`~!@#$%^&*()+=[\]{}\\|;:'",.<>/?·！￥……（）——《》？：“”【】、；‘’，。]+|[`~!@#$%^&*()+=[\]{}\\|;:'",.<>/?·！￥……（）——《》？：“”【】、；‘’，。]+$/gu

let initPromise: Promise<void> | null = null

const enSegmenter =
  typeof Intl !== "undefined" && "Segmenter" in Intl
    ? new Intl.Segmenter("en", { granularity: "word" })
    : null

function getJiebaModule(): JiebaModule {
  if (typeof initDefault === "function") {
    return {
      ...(jiebaNamespace as unknown as JiebaModule),
      default: initDefault as () => Promise<unknown>
    }
  }

  return initDefault as unknown as JiebaModule
}

async function ensureJiebaReady(): Promise<void> {
  if (!initPromise) {
    const jieba = getJiebaModule()
    if (typeof jieba.default !== "function") {
      throw new Error("jieba-wasm init function is unavailable")
    }

    initPromise = jieba.default().then(() => undefined)
  }

  try {
    await initPromise
  } catch (error) {
    initPromise = null
    throw error
  }
}

function cutForSearch(input: string): string[] {
  const jieba = getJiebaModule()
  if (typeof jieba.cut_for_search !== "function") {
    throw new Error("jieba-wasm cut_for_search function is unavailable")
  }

  return jieba.cut_for_search(input, true)
}

function cleanToken(token: string): string {
  return token.toLowerCase().trim().replace(PUNCTUATION_EDGE_PATTERN, "")
}

function isUsefulToken(token: string): boolean {
  return CJK_OR_LATIN_PATTERN.test(token)
}

function splitEnglishWords(input: string): string[] {
  if (!enSegmenter) return []

  const tokens: string[] = []
  for (const segment of enSegmenter.segment(input)) {
    if (!segment.isWordLike) continue
    const token = cleanToken(segment.segment)
    if (token && isUsefulToken(token)) {
      tokens.push(token)
    }
  }

  return tokens
}

export async function splitWords(input: string): Promise<string[]> {
  if (!input.trim()) return []

  await ensureJiebaReady()

  const jiebaTokens = cutForSearch(input)
    .map(cleanToken)
    .filter((token) => token && isUsefulToken(token))

  return Array.from(new Set([...jiebaTokens, ...splitEnglishWords(input)]))
}
