export interface CapturedPage {
  url: string
  title: string
  content: string
  visitTime: number
  isBookmarked?: boolean
}

export interface PageRecord {
  id?: number
  pageKey: string
  url: string
  normalizedUrl: string
  title: string
  visitTime: number
  updatedAt: number
  isBookmarked: boolean
  contentLength: number
}

export interface PageContentRecord {
  pageId: number
  content?: string
  titleWords: string[]
  contentWords: string[]
}

export interface AppSettings {
  autoSaveEnabled: boolean
  saveBookmarkedOnly: boolean
  saveContentEnabled: boolean
  tempPageRetentionDays: number
  maxResults: number
  excludedUrlPatterns: string[]
}

export interface SearchRequest {
  query: string
  mode: "token" | "fulltext"
  onlyBookmarked?: boolean
  maxResults?: number
}

export interface SearchResult {
  id: number
  url: string
  title: string
  visitTime: number
  isBookmarked: boolean
  snippet: string
  highlights: string[]
  score: number
}

export interface StorageStats {
  usageBytes: number
  quotaBytes: number
  pageCount: number
  contentCount: number
}

