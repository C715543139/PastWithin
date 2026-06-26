import type {
  AppSettings,
  CapturedPage,
  SearchRequest,
  SearchResult,
  StorageStats
} from "./types"

export type RuntimeMessage =
  | { type: "capturePage"; payload: CapturedPage }
  | { type: "search"; payload: SearchRequest }
  | { type: "clearData" }
  | { type: "clearSavedContent" }
  | { type: "getStats" }
  | { type: "getSettings" }
  | { type: "saveSettings"; payload: AppSettings }

export type RuntimeResponse =
  | { success: true }
  | { results: SearchResult[]; error?: string }
  | { error: string }
  | AppSettings
  | StorageStats

