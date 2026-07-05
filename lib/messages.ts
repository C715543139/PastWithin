import type {
  AppSettings,
  CapturedPage,
  FulltextSearchStreamPayload,
  SearchRequest,
  SearchResult,
  StorageStats
} from "./types"

export const FULLTEXT_SEARCH_STREAM_PORT = "fulltextSearchStream"

export type RuntimeMessage =
  | { type: "capturePage"; payload: CapturedPage }
  | { type: "search"; payload: SearchRequest }
  | { type: "clearData" }
  | { type: "clearSavedContent" }
  | { type: "getStats" }
  | { type: "getSettings" }
  | { type: "saveSettings"; payload: AppSettings }

export type FulltextSearchStreamRequest =
  | { type: "start"; payload: FulltextSearchStreamPayload }
  | { type: "stop" }

interface FulltextSearchStreamStats {
  scannedCount: number
  totalCount: number
  matchedCount: number
}

export type FulltextSearchStreamResponse =
  | ({ type: "progress" } & FulltextSearchStreamStats)
  | ({ type: "done"; results: SearchResult[] } & FulltextSearchStreamStats)
  | ({ type: "stopped"; results: SearchResult[] } & FulltextSearchStreamStats)
  | { type: "error"; error: string }

export type RuntimeResponse =
  | { success: true }
  | { results: SearchResult[]; error?: string }
  | { error: string }
  | AppSettings
  | StorageStats
