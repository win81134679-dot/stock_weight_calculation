'use client'

/**
 * RebalanceSettings.tsx
 * Settings panel: target weights, rebalance schedule, Discord webhook, fees, import/export.
 */

import React, { useState } from 'react'
import { RebalanceSettings } from '@/lib/types'
import { sendTestNotification } from '@/lib/discord-webhook'
import { uploadCombinedSync, downloadCombinedSync } from '@/lib/combined-sync'

interface Props {
  settings: RebalanceSettings
  onUpdateSettings: (patch: Partial<RebalanceSettings>) => void
  onExportJSON: () => string
  onImportJSON: (json: string) => boolean
}

export default function RebalanceSettingsPanel({
  settings,
  onUpdateSettings,
  onExportJSON,
  onImportJSON,
}: Props) {
  const [webhookStatus, setWebhookStatus] = useState<'idle' | 'testing' | 'ok' | 'fail'>('idle')
  const [importError, setImportError] = useState<string | null>(null)
  const [importSuccess, setImportSuccess] = useState(false)

  // Cloud sync
  const [syncPassphrase, setSyncPassphrase] = useState('')
  const [syncStatus, setSyncStatus] = useState<'idle' | 'uploading' | 'downloading' | 'ok' | 'fail'>('idle')
  const [syncMessage, setSyncMessage] = useState<string | null>(null)

  async function handleTestWebhook() {
    setWebhookStatus('testing')
    const ok = await sendTestNotification(settings.discordWebhookUrl)
    setWebhookStatus(ok ? 'ok' : 'fail')
    setTimeout(() => setWebhookStatus('idle'), 4000)
  }

  function handleExport() {
    const json = onExportJSON()
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `portfolio-backup-${new Date().toISOString().split('T')[0]}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const text = ev.target?.result as string
      const ok = onImportJSON(text)
      if (ok) {
        setImportSuccess(true)
        setImportError(null)
        setTimeout(() => setImportSuccess(false), 3000)
      } else {
        setImportError('檔案格式錯誤，請匯入正確的備份 JSON')
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  async function handleCloudUpload() {
    if (!syncPassphrase.trim()) {
      setSyncMessage('請輸入同步密碼')
      setSyncStatus('fail')
      return
    }
    setSyncStatus('uploading')
    setSyncMessage(null)
    // 合併同步：台股 + 美股一起上傳
    const result = await uploadCombinedSync(syncPassphrase.trim())
    if (result.ok) {
      setSyncStatus('ok')
      setSyncMessage('✅ 上傳成功（含台股+美股）！在其他裝置輸入相同密碼即可下載')
    } else {
      setSyncStatus('fail')
      setSyncMessage(`❌ ${result.error ?? '上傳失敗'}`)
    }
    setTimeout(() => { setSyncStatus('idle'); setSyncMessage(null) }, 6000)
  }

  async function handleCloudDownload() {
    if (!syncPassphrase.trim()) {
      setSyncMessage('請輸入同步密碼')
      setSyncStatus('fail')
      return
    }
    setSyncStatus('downloading')
    setSyncMessage(null)
    // 合併同步：下載後直接寫回 localStorage（台股 + 美股），需重新整理生效
    const result = await downloadCombinedSync(syncPassphrase.trim())
    if (result.ok) {
      setSyncStatus('ok')
      const parts: string[] = []
      if (result.applied?.twOk) parts.push('台股')
      if (result.applied?.usOk) parts.push('美股')
      setSyncMessage(`✅ 下載同步成功（${parts.join(' + ') || '資料'}）！3 秒後自動重新整理`)
      setTimeout(() => { if (typeof window !== 'undefined') window.location.reload() }, 3000)
      return
    }
    setSyncStatus('fail')
    setSyncMessage(`❌ ${result.error ?? '下載失敗'}`)
    setTimeout(() => { setSyncStatus('idle'); setSyncMessage(null) }, 6000)
  }

  const feeRate = (0.001425 * (settings.discount / 10) * 100).toFixed(4)

  return (
    <div className="space-y-6">
      {/* Hint for allocation configs */}
      <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-700">
        🎯 目標配置權重與再平衡排程已移至「持倉管理 &gt; 配置管理」頁籤管理。
      </div>

      {/* Discord webhook */}
      <div>
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Discord Webhook 通知</p>
        <div className="space-y-2">
          <div className="flex gap-2">
            <input
              type="url"
              className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white font-mono"
              value={settings.discordWebhookUrl}
              onChange={(e) => onUpdateSettings({ discordWebhookUrl: e.target.value })}
              placeholder="https://discord.com/api/webhooks/..."
            />
            <button
              onClick={handleTestWebhook}
              disabled={!settings.discordWebhookUrl || webhookStatus === 'testing'}
              className="px-3 py-2 border border-[#4A90C4] text-[#4A90C4] text-sm rounded-lg disabled:opacity-40 whitespace-nowrap"
            >
              {webhookStatus === 'testing' ? '測試中…' :
               webhookStatus === 'ok' ? '✅ 成功' :
               webhookStatus === 'fail' ? '❌ 失敗' :
               '測試'}
            </button>
          </div>
          <p className="text-xs text-slate-400">
            開啟網頁時若在通知天數內，自動推播再平衡提醒。每天最多推播一次。
          </p>
        </div>
      </div>

      {/* Fee discount */}
      <div>
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">手續費折扣</p>
        <div className="flex items-center gap-3">
          <input
            type="range"
            min="1"
            max="10"
            step="1"
            className="flex-1 accent-[#2C5F8A]"
            value={settings.discount}
            onChange={(e) => onUpdateSettings({ discount: parseInt(e.target.value) })}
          />
          <span className="font-mono font-bold text-[#2C5F8A] w-12 text-center">
            {settings.discount === 10 ? '不折扣' : `${settings.discount}折`}
          </span>
        </div>
        <p className="text-xs text-slate-400 mt-1">實際費率：{feeRate}%（最低 $20）</p>
      </div>

      {/* Import / Export */}
      <div>
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">資料備份</p>
        <div className="flex gap-3 flex-wrap">
          <button
            onClick={handleExport}
            className="px-4 py-2 bg-slate-100 text-slate-700 text-sm rounded-lg border border-slate-200 hover:bg-slate-200"
          >
            ↓ 匯出 JSON
          </button>
          <label className="px-4 py-2 bg-slate-100 text-slate-700 text-sm rounded-lg border border-slate-200 hover:bg-slate-200 cursor-pointer">
            ↑ 匯入 JSON
            <input type="file" accept=".json" className="hidden" onChange={handleImportFile} />
          </label>
        </div>
        {importError && <p className="text-xs text-red-500 mt-2">{importError}</p>}
        {importSuccess && <p className="text-xs text-green-600 mt-2">✅ 匯入成功！</p>}
      </div>

      {/* Cloud Sync */}
      <div>
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">☁️ 雲端跨裝置同步</p>
        <p className="text-xs text-slate-400 mb-3">
          設定一組同步密碼，在所有裝置輸入相同密碼即可同步資料。<br />
          密碼請自行記住，遺失無法找回。資料儲存 1 年後自動刪除。
        </p>
        <input
          type="text"
          placeholder="輸入自訂同步密碼（英數字/中文，最多64字元）"
          value={syncPassphrase}
          onChange={(e) => setSyncPassphrase(e.target.value)}
          className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-blue-300"
        />
        <div className="flex gap-3 flex-wrap">
          <button
            onClick={handleCloudUpload}
            disabled={syncStatus === 'uploading' || syncStatus === 'downloading'}
            className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {syncStatus === 'uploading' ? '⏳ 上傳中…' : '⬆️ 上傳同步'}
          </button>
          <button
            onClick={handleCloudDownload}
            disabled={syncStatus === 'uploading' || syncStatus === 'downloading'}
            className="px-4 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {syncStatus === 'downloading' ? '⏳ 下載中…' : '⬇️ 下載同步'}
          </button>
        </div>
        {syncMessage && (
          <p className={`text-xs mt-2 ${syncStatus === 'ok' ? 'text-green-600' : 'text-red-500'}`}>
            {syncMessage}
          </p>
        )}
      </div>
    </div>
  )
}
