'use client'

/**
 * RebalanceSettings.tsx
 * Settings panel: target weights, rebalance schedule, Discord webhook, fees, import/export.
 */

import React, { useState } from 'react'
import { RebalanceSettings, TargetWeight } from '@/lib/types'
import { sendTestNotification } from '@/lib/discord-webhook'

interface Props {
  settings: RebalanceSettings
  onUpdateSettings: (patch: Partial<RebalanceSettings>) => void
  onAddTargetWeight: (tw: TargetWeight) => void
  onRemoveTargetWeight: (code: string) => void
  onExportJSON: () => string
  onImportJSON: (json: string) => boolean
}

export default function RebalanceSettingsPanel({
  settings,
  onUpdateSettings,
  onAddTargetWeight,
  onRemoveTargetWeight,
  onExportJSON,
  onImportJSON,
}: Props) {
  const [newCode, setNewCode] = useState('')
  const [newName, setNewName] = useState('')
  const [newWeight, setNewWeight] = useState('')
  const [newExchange, setNewExchange] = useState<'tse' | 'otc'>('tse')

  const [webhookStatus, setWebhookStatus] = useState<'idle' | 'testing' | 'ok' | 'fail'>('idle')
  const [importError, setImportError] = useState<string | null>(null)
  const [importSuccess, setImportSuccess] = useState(false)

  // Cloud sync
  const [syncPassphrase, setSyncPassphrase] = useState('')
  const [syncStatus, setSyncStatus] = useState<'idle' | 'uploading' | 'downloading' | 'ok' | 'fail'>('idle')
  const [syncMessage, setSyncMessage] = useState<string | null>(null)

  const totalTargetWeight = settings.targetWeights.reduce((s, t) => s + t.weight, 0)

  function handleAddTarget() {
    const code = newCode.trim().toUpperCase()
    const name = newName.trim()
    const weight = parseFloat(newWeight)
    if (!code || !name || isNaN(weight) || weight <= 0) return

    onAddTargetWeight({
      code,
      name,
      exchange: newExchange,
      isETF: code.startsWith('00') && code.length >= 4,
      weight,
    })
    setNewCode('')
    setNewName('')
    setNewWeight('')
  }

  function updateWeight(code: string, w: number) {
    const tw = settings.targetWeights.find((t) => t.code === code)
    if (!tw) return
    onAddTargetWeight({ ...tw, weight: w })
  }

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
    try {
      const data = onExportJSON()
      const res = await fetch('/api/kv-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'upload', passphrase: syncPassphrase.trim(), data }),
      })
      const json = await res.json()
      if (res.ok) {
        setSyncStatus('ok')
        setSyncMessage('✅ 上傳成功！在其他裝置輸入相同密碼即可下載')
      } else {
        setSyncStatus('fail')
        setSyncMessage(`❌ ${json.error ?? '上傳失敗'}`)
      }
    } catch {
      setSyncStatus('fail')
      setSyncMessage('❌ 網路錯誤，請稍後重試')
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
    try {
      const res = await fetch('/api/kv-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'download', passphrase: syncPassphrase.trim() }),
      })
      const json = await res.json()
      if (res.ok && json.data) {
        const ok = onImportJSON(json.data)
        if (ok) {
          setSyncStatus('ok')
          setSyncMessage('✅ 下載同步成功！資料已更新')
        } else {
          setSyncStatus('fail')
          setSyncMessage('❌ 資料格式錯誤，可能是密碼錯誤或資料損壞')
        }
      } else {
        setSyncStatus('fail')
        setSyncMessage(`❌ ${json.error ?? '下載失敗'}`)
      }
    } catch {
      setSyncStatus('fail')
      setSyncMessage('❌ 網路錯誤，請稍後重試')
    }
    setTimeout(() => { setSyncStatus('idle'); setSyncMessage(null) }, 6000)
  }

  const feeRate = (0.001425 * (settings.discount / 10) * 100).toFixed(4)

  return (
    <div className="space-y-6">

      {/* Target weights */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">目標配置權重</p>
          <span className={`text-xs font-mono font-bold ${
            Math.abs(totalTargetWeight - 100) < 0.1 ? 'text-green-600' : 'text-orange-500'
          }`}>
            合計 {totalTargetWeight.toFixed(1)}% {Math.abs(totalTargetWeight - 100) < 0.1 ? '✓' : '（需等於 100%）'}
          </span>
        </div>

        <div className="space-y-2 mb-3">
          {settings.targetWeights.map((tw) => (
            <div key={tw.code} className="flex items-center gap-2 bg-slate-50 rounded-xl border border-slate-200 px-3 py-2">
              <span className="font-mono font-bold text-sm w-20">{tw.code}</span>
              <span className="text-sm text-slate-600 flex-1 truncate">{tw.name}</span>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min="1"
                  max="100"
                  step="1"
                  className="w-16 border border-slate-200 rounded-lg px-2 py-1 text-sm text-center font-mono bg-white"
                  value={tw.weight}
                  onChange={(e) => updateWeight(tw.code, parseFloat(e.target.value) || 0)}
                />
                <span className="text-sm text-slate-400">%</span>
              </div>
              <button
                onClick={() => onRemoveTargetWeight(tw.code)}
                className="text-xs text-red-400 hover:text-red-600 ml-1"
              >
                ✕
              </button>
            </div>
          ))}
        </div>

        {/* Add new target */}
        <div className="border border-dashed border-slate-300 rounded-xl p-3 space-y-2">
          <p className="text-xs text-slate-400">新增標的</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <input
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm uppercase bg-white"
              value={newCode}
              onChange={(e) => setNewCode(e.target.value.toUpperCase())}
              placeholder="代碼（如 00927）"
            />
            <input
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="名稱"
            />
            <div className="flex gap-1">
              <input
                type="number"
                min="1"
                max="100"
                className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white"
                value={newWeight}
                onChange={(e) => setNewWeight(e.target.value)}
                placeholder="比重%"
              />
              <select
                className="border border-slate-200 rounded-lg px-2 py-2 text-xs bg-white"
                value={newExchange}
                onChange={(e) => setNewExchange(e.target.value as 'tse' | 'otc')}
              >
                <option value="tse">上市</option>
                <option value="otc">上櫃</option>
              </select>
            </div>
            <button
              onClick={handleAddTarget}
              disabled={!newCode.trim() || !newName.trim() || !newWeight}
              className="px-3 py-2 bg-[#2C5F8A] text-white text-sm rounded-lg disabled:opacity-40"
            >
              + 新增
            </button>
          </div>
        </div>
      </div>

      {/* Rebalance schedule */}
      <div>
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">再平衡排程</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-slate-500 mb-1 block">每隔幾個月</label>
            <div className="flex gap-2 items-center">
              <input
                type="number"
                min="1"
                max="12"
                className="w-20 border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white text-center"
                value={settings.rebalanceIntervalMonths}
                onChange={(e) => onUpdateSettings({ rebalanceIntervalMonths: parseInt(e.target.value) || 3 })}
              />
              <span className="text-sm text-slate-500">個月一次</span>
            </div>
          </div>
          <div>
            <label className="text-xs text-slate-500 mb-1 block">每月幾號執行</label>
            <div className="flex gap-2 items-center">
              <input
                type="number"
                min="1"
                max="28"
                className="w-20 border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white text-center"
                value={settings.rebalanceDayOfMonth}
                onChange={(e) => onUpdateSettings({ rebalanceDayOfMonth: parseInt(e.target.value) || 1 })}
              />
              <span className="text-sm text-slate-500">號</span>
            </div>
          </div>
          <div>
            <label className="text-xs text-slate-500 mb-1 block">下次再平衡日期</label>
            <input
              type="date"
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white"
              value={settings.nextRebalanceDate}
              onChange={(e) => onUpdateSettings({ nextRebalanceDate: e.target.value })}
            />
          </div>
          <div>
            <label className="text-xs text-slate-500 mb-1 block">提前幾天通知（Discord）</label>
            <div className="flex gap-2 items-center">
              <input
                type="number"
                min="1"
                max="30"
                className="w-20 border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white text-center"
                value={settings.discordNotifyDaysBefore}
                onChange={(e) => onUpdateSettings({ discordNotifyDaysBefore: parseInt(e.target.value) || 7 })}
              />
              <span className="text-sm text-slate-500">天前</span>
            </div>
          </div>
        </div>
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
