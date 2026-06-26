const CJK_PATTERN = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/
const LATIN_TOKEN_PATTERN = /[a-z0-9_]/i

function isCjk(char: string): boolean {
  return CJK_PATTERN.test(char)
}

function pushCjkRun(tokens: string[], run: string): void {
  if (!run) return

  tokens.push(run)

  for (const char of run) {
    tokens.push(char)
  }

  for (let i = 0; i < run.length - 1; i += 1) {
    tokens.push(run.slice(i, i + 2))
  }
}

export function splitWords(input: string): string[] {
  if (!input) return []

  const tokens: string[] = []
  let latinBuffer = ""
  let cjkBuffer = ""

  function flushLatin() {
    if (latinBuffer) {
      tokens.push(latinBuffer)
      latinBuffer = ""
    }
  }

  function flushCjk() {
    if (cjkBuffer) {
      pushCjkRun(tokens, cjkBuffer)
      cjkBuffer = ""
    }
  }

  for (const char of input.toLowerCase()) {
    if (isCjk(char)) {
      flushLatin()
      cjkBuffer += char
    } else if (LATIN_TOKEN_PATTERN.test(char)) {
      flushCjk()
      latinBuffer += char
    } else {
      flushLatin()
      flushCjk()
    }
  }

  flushLatin()
  flushCjk()

  return Array.from(new Set(tokens.filter(Boolean)))
}

