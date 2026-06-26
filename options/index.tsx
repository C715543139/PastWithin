import { useEffect, useState } from "react"

import type { AppSettings, StorageStats } from "../lib/types"
import { defaultSettings } from "../lib/settings"

import "./options.css"

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

function sendMessage<T>(message: unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message ?? "通信失败"))
        return
      }
      resolve(response as T)
    })
  })
}

export default function OptionsIndex() {
  const [settings, setSettings] = useState<AppSettings>(defaultSettings)
  const [stats, setStats] = useState<StorageStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [apiUnavailable, setApiUnavailable] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [statusMessage, setStatusMessage] = useState<{
    type: "error" | "success"
    text: string
  } | null>(null)

  async function refreshStats() {
    const nextStats = await sendMessage<StorageStats>({ type: "getStats" })
    setStats(nextStats)
  }

  useEffect(() => {
    if (!chromeAvailable()) {
      setApiUnavailable(true)
      setLoading(false)
      return
    }

    let cancelled = false

    async function load() {
      try {
        const [loadedSettings, loadedStats] = await Promise.all([
          sendMessage<AppSettings>({ type: "getSettings" }),
          sendMessage<StorageStats>({ type: "getStats" })
        ])

        if (cancelled) return
        setSettings(loadedSettings)
        setStats(loadedStats)
      } catch (error) {
        if (cancelled) return
        setStatusMessage({
          type: "error",
          text: error instanceof Error ? error.message : "加载设置失败"
        })
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()

    return () => {
      cancelled = true
    }
  }, [])

  function updateSetting<K extends keyof AppSettings>(
    key: K,
    value: AppSettings[K]
  ) {
    setSettings((current) => ({ ...current, [key]: value }))
  }

  async function handleSave() {
    setStatusMessage(null)
    try {
      await sendMessage({ type: "saveSettings", payload: settings })
      setStatusMessage({ type: "success", text: "设置已保存" })
    } catch (error) {
      setStatusMessage({
        type: "error",
        text: error instanceof Error ? error.message : "保存设置失败"
      })
    }
  }

  async function handleClearData() {
    if (!window.confirm("确定要清空所有本地数据吗？此操作不可撤销。")) return

    setClearing(true)
    setStatusMessage(null)
    try {
      await sendMessage({ type: "clearData" })
      await refreshStats()
      setStatusMessage({ type: "success", text: "所有数据已清空" })
    } catch (error) {
      setStatusMessage({
        type: "error",
        text: error instanceof Error ? error.message : "清空数据失败"
      })
    } finally {
      setClearing(false)
    }
  }

  async function handleClearContent() {
    if (!window.confirm("确定要清空所有已保存的正文吗？清空后全文查询将不可用。")) {
      return
    }

    setClearing(true)
    setStatusMessage(null)
    try {
      await sendMessage({ type: "clearSavedContent" })
      await refreshStats()
      setStatusMessage({ type: "success", text: "已保存正文已清空" })
    } catch (error) {
      setStatusMessage({
        type: "error",
        text: error instanceof Error ? error.message : "清空正文失败"
      })
    } finally {
      setClearing(false)
    }
  }

  if (loading) {
    return (
      <div className="options-container">
        <p>加载中...</p>
      </div>
    )
  }

  if (apiUnavailable) {
    return (
      <div className="options-container">
        <h1>PastWithin 设置</h1>
        <div className="options-error">
          Chrome extension API 不可用。请在扩展选项中打开此页面。
        </div>
      </div>
    )
  }

  const patternsText = settings.excludedUrlPatterns.join("\n")

  return (
    <div className="options-container">
      <h1>PastWithin 设置</h1>

      {statusMessage && (
        <div
          className={
            statusMessage.type === "error" ? "options-error" : "options-success"
          }
          role="alert"
        >
          {statusMessage.text}
        </div>
      )}

      <section className="options-section">
        <h2>采集设置</h2>
        <label className="options-checkbox">
          <input
            type="checkbox"
            checked={settings.autoSaveEnabled}
            onChange={(event) =>
              updateSetting("autoSaveEnabled", event.target.checked)
            }
          />
          自动保存访问页面
        </label>
        <label className="options-checkbox">
          <input
            type="checkbox"
            checked={settings.saveBookmarkedOnly}
            onChange={(event) =>
              updateSetting("saveBookmarkedOnly", event.target.checked)
            }
          />
          只保存书签页面
        </label>
        <label className="options-checkbox">
          <input
            type="checkbox"
            checked={settings.saveContentEnabled}
            onChange={(event) =>
              updateSetting("saveContentEnabled", event.target.checked)
            }
          />
          保存正文
        </label>
        <label className="options-field">
          <span>非书签页面保存天数</span>
          <input
            type="number"
            min={1}
            max={365}
            value={settings.tempPageRetentionDays}
            onChange={(event) =>
              updateSetting(
                "tempPageRetentionDays",
                Number(event.target.value) || 60
              )
            }
          />
        </label>
      </section>

      <section className="options-section">
        <h2>搜索设置</h2>
        <label className="options-field">
          <span>最大搜索结果数</span>
          <input
            type="number"
            min={5}
            max={200}
            value={settings.maxResults}
            onChange={(event) =>
              updateSetting("maxResults", Number(event.target.value) || 50)
            }
          />
        </label>
      </section>

      <section className="options-section">
        <h2>URL 排除规则</h2>
        <p className="options-hint">每行一个正则表达式，匹配的 URL 不会被保存。</p>
        <textarea
          rows={8}
          value={patternsText}
          onChange={(event) =>
            updateSetting(
              "excludedUrlPatterns",
              event.target.value
                .split("\n")
                .map((pattern) => pattern.trim())
                .filter(Boolean)
            )
          }
        />
      </section>

      <section className="options-section">
        <button type="button" onClick={handleSave} className="options-btn-primary">
          保存设置
        </button>
      </section>

      {stats && (
        <section className="options-section">
          <h2>存储统计</h2>
          <ul className="options-stats">
            <li>已保存页面数：{stats.pageCount}</li>
            <li>已保存正文数：{stats.contentCount}</li>
            <li>
              已用空间：
              {stats.usageBytes > 0
                ? `${(stats.usageBytes / 1024 / 1024).toFixed(2)} MB`
                : "未知"}
            </li>
            <li>
              存储配额：
              {stats.quotaBytes > 0
                ? `${(stats.quotaBytes / 1024 / 1024).toFixed(2)} MB`
                : "未知"}
            </li>
          </ul>
        </section>
      )}

      <section className="options-section">
        <h2>数据管理</h2>
        <div className="options-actions">
          <button
            type="button"
            onClick={handleClearContent}
            disabled={clearing}
            className="options-btn-secondary"
          >
            清空已保存正文
          </button>
          <button
            type="button"
            onClick={handleClearData}
            disabled={clearing}
            className="options-btn-danger"
          >
            清空所有数据
          </button>
        </div>
      </section>
    </div>
  )
}

