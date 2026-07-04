import { useEffect, useState } from "react"

import type { AppSettings, StorageStats, UrlRule } from "../lib/types"
import { contentSizeOptions, defaultSettings } from "../lib/settings"

import "./options.css"

const OPTIONS_PAGE_TITLE = "PastWithin 扩展设置"

interface UrlRuleRow extends UrlRule {
  savedPattern: string
  isNew?: boolean
  error?: string
}

function toUrlRuleRow(rule: UrlRule): UrlRuleRow {
  return {
    ...rule,
    savedPattern: rule.pattern
  }
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
  const [tempRetentionInput, setTempRetentionInput] = useState(
    String(defaultSettings.tempPageRetentionDays)
  )
  const [maxResultsInput, setMaxResultsInput] = useState(
    String(defaultSettings.maxResults)
  )
  const [urlRuleRows, setUrlRuleRows] = useState<UrlRuleRow[]>(
    defaultSettings.excludedUrlRules.map(toUrlRuleRow)
  )
  const [stats, setStats] = useState<StorageStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [apiUnavailable, setApiUnavailable] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const [toastLeaving, setToastLeaving] = useState(false)

  useEffect(() => {
    document.title = OPTIONS_PAGE_TITLE
  }, [])

  async function refreshStats() {
    const nextStats = await sendMessage<StorageStats>({ type: "getStats" })
    setStats(nextStats)
  }

  function showToast(message: string) {
    setToastMessage(message)
    setToastLeaving(false)
  }

  useEffect(() => {
    if (!toastMessage) return

    const leaveTimerId = window.setTimeout(() => {
      setToastLeaving(true)
    }, 1800)
    const removeTimerId = window.setTimeout(() => {
      setToastMessage(null)
      setToastLeaving(false)
    }, 2200)

    return () => {
      window.clearTimeout(leaveTimerId)
      window.clearTimeout(removeTimerId)
    }
  }, [toastMessage])

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
        setTempRetentionInput(String(loadedSettings.tempPageRetentionDays))
        setMaxResultsInput(String(loadedSettings.maxResults))
        setUrlRuleRows(loadedSettings.excludedUrlRules.map(toUrlRuleRow))
        setStats(loadedStats)
      } catch (error) {
        if (cancelled) return
        setErrorMessage(error instanceof Error ? error.message : "加载设置失败")
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()

    return () => {
      cancelled = true
    }
  }, [])

  function toSavedMessage(): string {
    return `自动保存于 ${new Date().toLocaleTimeString()}`
  }

  async function persistSettings(nextSettings: AppSettings) {
    setErrorMessage(null)
    setSettings(nextSettings)
    try {
      await sendMessage({ type: "saveSettings", payload: nextSettings })
      showToast(toSavedMessage())
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "保存设置失败")
    }
  }

  function updateSetting<K extends keyof AppSettings>(
    key: K,
    value: AppSettings[K]
  ) {
    void persistSettings({ ...settings, [key]: value })
  }

  function parsePositiveInteger(value: string): number | null {
    if (!/^[1-9]\d*$/.test(value.trim())) return null
    return Number(value)
  }

  function saveNumberSetting<K extends "tempPageRetentionDays" | "maxResults">(
    key: K,
    value: string,
    resetInput: (value: string) => void
  ) {
    const parsed = parsePositiveInteger(value)
    if (parsed == null) {
      setErrorMessage("请输入正整数")
      return
    }

    resetInput(String(parsed))
    void persistSettings({ ...settings, [key]: parsed })
  }

  function validateUrlRulePattern(
    pattern: string,
    currentRuleId: string
  ): string | null {
    const trimmed = pattern.trim()
    if (!trimmed) return "规则不能为空"

    try {
      new RegExp(trimmed)
    } catch {
      return "正则表达式无效，请检查括号、转义字符或特殊符号。"
    }

    const duplicate = settings.excludedUrlRules.some(
      (rule) => rule.id !== currentRuleId && rule.pattern === trimmed
    )
    if (duplicate) return "该规则已存在"

    return null
  }

  function updateUrlRuleRow(id: string, patch: Partial<UrlRuleRow>) {
    setUrlRuleRows((current) =>
      current.map((row) => (row.id === id ? { ...row, ...patch } : row))
    )
  }

  function handleAddUrlRule() {
    const now = Date.now()
    setUrlRuleRows((current) => [
      ...current,
      {
        id: `draft-${now}`,
        pattern: "",
        savedPattern: "",
        enabled: true,
        createdAt: now,
        updatedAt: now,
        isNew: true
      }
    ])
  }

  async function handleSaveUrlRule(row: UrlRuleRow) {
    const trimmed = row.pattern.trim()
    const error = validateUrlRulePattern(trimmed, row.id)
    if (error) {
      updateUrlRuleRow(row.id, { error })
      return
    }

    const now = Date.now()
    const savedRule: UrlRule = {
      id: row.isNew ? `rule-${now}` : row.id,
      pattern: trimmed,
      enabled: row.enabled,
      createdAt: row.createdAt ?? now,
      updatedAt: now
    }
    const nextRules = row.isNew
      ? [...settings.excludedUrlRules, savedRule]
      : settings.excludedUrlRules.map((rule) =>
          rule.id === row.id ? savedRule : rule
        )
    const nextSettings = { ...settings, excludedUrlRules: nextRules }

    await persistSettings(nextSettings)
    setUrlRuleRows((current) =>
      current.map((currentRow) =>
        currentRow.id === row.id
          ? {
              ...savedRule,
              savedPattern: savedRule.pattern,
              error: undefined
            }
          : currentRow
      )
    )
  }

  async function handleToggleUrlRule(row: UrlRuleRow, enabled: boolean) {
    if (row.isNew) {
      updateUrlRuleRow(row.id, { enabled })
      return
    }

    updateUrlRuleRow(row.id, { enabled })
    const nextRules = settings.excludedUrlRules.map((rule) =>
      rule.id === row.id ? { ...rule, enabled, updatedAt: Date.now() } : rule
    )
    await persistSettings({ ...settings, excludedUrlRules: nextRules })
  }

  async function handleDeleteUrlRule(row: UrlRuleRow) {
    if (row.isNew) {
      setUrlRuleRows((current) => current.filter((item) => item.id !== row.id))
      return
    }

    const nextRules = settings.excludedUrlRules.filter((rule) => rule.id !== row.id)
    await persistSettings({ ...settings, excludedUrlRules: nextRules })
    setUrlRuleRows((current) => current.filter((item) => item.id !== row.id))
  }

  async function handleClearData() {
    if (!window.confirm("确定要清空所有本地数据吗？此操作不可撤销。")) return

    setClearing(true)
    setErrorMessage(null)
    try {
      await sendMessage({ type: "clearData" })
      await refreshStats()
      showToast("所有数据已清空")
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "清空数据失败")
    } finally {
      setClearing(false)
    }
  }

  async function handleClearContent() {
    if (!window.confirm("确定要清空所有已保存的全文吗？清空后全文查询将不可用。")) {
      return
    }

    setClearing(true)
    setErrorMessage(null)
    try {
      await sendMessage({ type: "clearSavedContent" })
      await refreshStats()
      showToast("已保存全文已清空")
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "清空全文失败")
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
        <h1>{OPTIONS_PAGE_TITLE}</h1>
        <div className="options-error">
          Chrome extension API 不可用。请在扩展选项中打开此页面。
        </div>
      </div>
    )
  }

  return (
    <div className="options-container">
      <h1>{OPTIONS_PAGE_TITLE}</h1>

      {toastMessage && (
        <div
          className={`options-toast${toastLeaving ? " options-toast-leaving" : ""}`}
          role="status"
        >
          {toastMessage}
        </div>
      )}

      {errorMessage && (
        <div className="options-error" role="alert">
          {errorMessage}
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
          保存全文
        </label>
        <label className="options-field">
          <span>单页全文大小上限</span>
          <select
            aria-label="单页全文大小上限"
            value={settings.maxContentLength}
            onChange={(event) =>
              updateSetting("maxContentLength", Number(event.target.value))
            }
          >
            {contentSizeOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <p className="options-hint">
          用于限制单个页面保存的全文长度，避免异常页面过度占用本地空间。
        </p>
        <label className="options-field">
          <span>非书签页面保存天数</span>
          <input
            type="number"
            min={1}
            value={tempRetentionInput}
            onChange={(event) => setTempRetentionInput(event.target.value)}
            onBlur={() =>
              saveNumberSetting(
                "tempPageRetentionDays",
                tempRetentionInput,
                setTempRetentionInput
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
            min={1}
            value={maxResultsInput}
            onChange={(event) => setMaxResultsInput(event.target.value)}
            onBlur={() =>
              saveNumberSetting("maxResults", maxResultsInput, setMaxResultsInput)
            }
          />
        </label>
      </section>

      <section className="options-section">
        <h2>URL 排除规则</h2>
        <p className="options-hint">
          匹配以下规则的页面不会被保存。每条规则使用正则表达式。
        </p>
        <div className="url-rule-list">
          {urlRuleRows.map((row) => {
            const dirty = !row.isNew && row.pattern.trim() !== row.savedPattern
            return (
              <div key={row.id} className="url-rule-item">
                <div className="url-rule-row">
                  <input
                    type="checkbox"
                    aria-label="启用规则"
                    checked={row.enabled}
                    onChange={(event) =>
                      void handleToggleUrlRule(row, event.target.checked)
                    }
                  />
                  <input
                    type="text"
                    aria-label="URL 排除规则"
                    value={row.pattern}
                    placeholder="输入正则表达式，例如 ^https://example\\.com/"
                    onChange={(event) =>
                      updateUrlRuleRow(row.id, {
                        pattern: event.target.value,
                        error: undefined
                      })
                    }
                  />
                  <button
                    type="button"
                    onClick={() => void handleSaveUrlRule(row)}
                    className={
                      dirty || row.isNew
                        ? "options-btn-primary"
                        : "options-btn-secondary"
                    }
                    disabled={!row.isNew && !dirty}
                  >
                    保存
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDeleteUrlRule(row)}
                    className="options-btn-secondary"
                  >
                    {row.isNew ? "取消" : "删除"}
                  </button>
                </div>
                {row.error && <div className="url-rule-error">{row.error}</div>}
              </div>
            )
          })}
        </div>
        <button
          type="button"
          onClick={handleAddUrlRule}
          className="options-btn-secondary"
        >
          添加规则
        </button>
      </section>

      {stats && (
        <section className="options-section">
          <h2>存储统计</h2>
          <ul className="options-stats">
            <li>已保存页面数：{stats.pageCount}</li>
            <li>已保存全文数：{stats.contentCount}</li>
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
            清空已保存全文
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
