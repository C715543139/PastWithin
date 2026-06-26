export function isUrlExcluded(url: string, patterns: string[]): boolean {
  for (const pattern of patterns) {
    try {
      if (new RegExp(pattern).test(url)) {
        return true
      }
    } catch {
      // User-provided exclusion rules are best-effort; ignore invalid regexes.
    }
  }

  return false
}

