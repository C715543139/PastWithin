import type { UrlRule } from "./types"

export function isUrlExcluded(url: string, rules: UrlRule[]): boolean {
  for (const rule of rules) {
    if (!rule.enabled) continue

    try {
      if (new RegExp(rule.pattern).test(url)) {
        return true
      }
    } catch {
      // User-provided exclusion rules are best-effort; ignore invalid regexes.
    }
  }

  return false
}
