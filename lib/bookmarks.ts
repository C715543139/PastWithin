export async function isUrlBookmarked(url: string): Promise<boolean> {
  try {
    if (typeof chrome === "undefined" || !chrome.bookmarks) {
      return false
    }

    const results = await chrome.bookmarks.search({ url })
    return results.length > 0
  } catch {
    return false
  }
}

