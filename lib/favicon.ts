export function getFaviconUrl(pageUrl: string, size = 32): string {
  try {
    if (typeof chrome !== "undefined" && chrome.runtime?.id) {
      const encodedPageUrl = encodeURIComponent(pageUrl)
      return `chrome-extension://${chrome.runtime.id}/_favicon/?pageUrl=${encodedPageUrl}&size=${size}`
    }
  } catch {
    return ""
  }

  return ""
}
