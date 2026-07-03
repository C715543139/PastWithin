import { useEffect, useState } from "react"

import { SearchApp } from "./SearchApp"
import type { AppSettings, SearchRequest, SearchResult } from "../lib/types"

import "./popup.css"

interface SearchResponse {
  results: SearchResult[]
  error?: string
}

function chromeAvailable(): boolean {
  try {
    return (
      typeof chrome !== "undefined" &&
      chrome.runtime != null &&
      typeof chrome.runtime.sendMessage === "function"
    )
  } catch {
    return false
  }
}

export default function PopupIndex() {
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [initError, setInitError] = useState<string | null>(null)

  useEffect(() => {
    if (!chromeAvailable()) {
      setInitError("Chrome extension API 不可用，请在扩展弹窗中打开此页面。")
      return
    }

    let cancelled = false

    chrome.runtime.sendMessage({ type: "getSettings" }, (response) => {
      if (cancelled) return
      if (chrome.runtime.lastError) {
        setInitError(chrome.runtime.lastError.message ?? "读取设置失败")
        return
      }
      setSettings((response as AppSettings) ?? null)
    })

    return () => {
      cancelled = true
    }
  }, [])

  const searchClient = async (
    params: Pick<SearchRequest, "query" | "mode" | "maxResults">
  ): Promise<{ results: SearchResult[] }> => {
    return new Promise((resolve, reject) => {
      if (!chromeAvailable()) {
        reject(new Error("Chrome extension API 不可用"))
        return
      }

      chrome.runtime.sendMessage({ type: "search", payload: params }, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message ?? "搜索请求失败"))
          return
        }

        const data = response as SearchResponse
        if (data.error) {
          reject(new Error(data.error))
          return
        }

        resolve({ results: data.results ?? [] })
      })
    })
  }

  const openSettings = () => {
    if (chromeAvailable() && chrome.runtime.openOptionsPage) {
      chrome.runtime.openOptionsPage()
    }
  }

  if (initError) {
    return (
      <div className="popup-container">
        <div className="popup-error">{initError}</div>
      </div>
    )
  }

  if (!settings) {
    return (
      <div className="popup-container">
        <p>加载中...</p>
      </div>
    )
  }

  return (
    <div className="popup-container">
      <header className="popup-header">
        <h1>PastWithin</h1>
        <div className="popup-header-actions">
          <button
            type="button"
            onClick={openSettings}
            className="settings-btn"
            aria-label="设置"
          >
            ⚙
          </button>
        </div>
      </header>
      <SearchApp settings={settings} searchClient={searchClient} />
    </div>
  )
}
