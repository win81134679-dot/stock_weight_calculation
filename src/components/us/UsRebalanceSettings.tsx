'use client'

/**
 * UsRebalanceSettings.tsx
 * 美股系統設定面板：費率模板、自訂費率、法定規費、股利預扣稅、Discord 通知、
 * 雲端同步（合併包，預設保留接口）、JSON 匯入匯出。
 */

import React, { useState } from 'react'
import { UsCustomFeeSettings, UsFeeProfileId, UsRegulatoryFees, UsSettings } from '@/lib/us-types'
import { sendUsTestNotification } from '@/lib/us-discord-webhook'
import { uploadCombinedSync, downloadCombinedSync } from '@/lib/combined-sync'

/** 同步 UI 是否對外開放。功能完成驗收後改為 true 即上線。 */
const SYNC_UI_ENABLED = true

interface Props {
  settings: UsSettings
  onUpdateSettings: (patch: Partial<UsSettings>) => void
  onExportJSON: () => string
  onImportJSON: (json: string) => boolean
}

export default function UsRebalanceSettings({
  settings,
  onUpdateSettings,
  onExportJSON,
  onImportJSON,
}: Props) {
  const [webhookStatus, setWebhookStatus] = useState<'idle' | 'testing' | 'ok' | 'fail'>('idle')
  const [importError, setImportError] = useState<string | null>(null)
  const [importSuccess, setImportSuccess] = useState(false)
  const [syncPassphrase, setSyncPassphrase] = useState('')
  const [syncStatus, setSyncStatus] = useState<'idle' | 'uploading' | 'downloading'>('idle')
  const [syncMessage, setSyncMessage] = useState<string | null>(null)
  const [importExportJson, setImportExportJson] = useState('')

  const setCustomFee = (patch: Partial<UsCustomFeeSettings>) => {
    onUpdateSettings({ customFees: { ...settings.customFees, ...patch } })
  }
  const setRegFee = (patch: Partial<UsRegulatoryFees>) => {
    onUpdateSettings({ regulatoryFees: { ...settings.regulatoryFees, ...patch } })
  }

  async function handleTestWebhook() {
    setWebhookStatus('testing')
    const ok = await sendUsTestNotification(settings.discordWebhookUrl)
    setWebhookStatus(ok ? 'ok' : 'fail')
    setTimeout(() => setWebhookStatus('idle'), 4000)
  }

  function handleExportFile() {
    const json = onExportJSON()
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `us-portfolio-backup-${new Date().toISOString().split('T')[0]}.json`
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

  async function handleUpload() {
    setSyncStatus('uploading')
    setSyncMessage(null)
    const result = await uploadCombinedSync(syncPassphrase)
    setSyncMessage(result.ok ? '✅ 上傳成功（含台股+美股）！在其他裝置輸入相同密碼即可下載' : `❌ ${result.error}`)
    setSyncStatus('idle')
    setTimeout(() => setSyncMessage(null), 6000)
  }

  async function handleDownload() {
    setSyncStatus('downloading')
    setSyncMessage(null)
    const result = await downloadCombinedSync(syncPassphrase)
    if (result.ok) {
      const parts: string[] = []
      if (result.applied?.twOk) parts.push('台股')
      if (result.applied?.usOk) parts.push('美股')
      setSyncMessage(`✅ 下載同步成功（${parts.join(' + ') || '資料'}）！3 秒後自動重新整理`)
      setSyncStatus('idle')
      setTimeout(() => { if (typeof window !== 'undefined') window.location.reload() }, 3000)
      return
    }
    setSyncMessage(`❌ ${result.error}`)
    setSyncStatus('idle')
    setTimeout(() => setSyncMessage(null), 6000)
  }

  const withholdingPct = Math.round(settings.dividendWithholdingRate * 100)

  return (
    <div className="space-y-6">
      {/* 費率模板 */}
      <Field title="券商費率模板">
        <select
          value={settings.profileId}
          onChange={(e) => onUpdateSettings({ profileId: e.target.value as UsFeeProfileId })}
          className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
        >
          <option value="standard">凱基一般單筆</option>
          <option value="promo_no_min">凱基優惠無低消</option>
          <option value="dca">凱基定期定額</option>
          <option value="custom">自訂</option>
        </select>
        <div className="grid grid-cols-2 gap-3 mt-3">
          <NumberInput label="買入費率" step={0.0001} value={settings.customFees.buyRate} onChange={(v) => setCustomFee({ buyRate: v })} />
          <NumberInput label="買入最低 USD" step={0.01} value={settings.customFees.buyMinUsd} onChange={(v) => setCustomFee({ buyMinUsd: v })} />
          <NumberInput label="賣出費率" step={0.0001} value={settings.customFees.sellRate} onChange={(v) => setCustomFee({ sellRate: v })} />
          <NumberInput label="賣出最低 USD" step={0.01} value={settings.customFees.sellMinUsd} onChange={(v) => setCustomFee({ sellMinUsd: v })} />
        </div>
        <p className="text-[11px] text-slate-400 mt-2">自訂欄位僅在選「自訂」模板時生效。</p>
      </Field>

      {/* 美股法定規費 */}
      <Field title="美股法定規費（賣出時收取）">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={settings.regulatoryFees.enabled}
            onChange={(e) => setRegFee({ enabled: e.target.checked })}
            className="accent-[#0F2E4E]"
          />
          計入 SEC 規費 + FINRA TAF（符合台灣複委託實況，預設開啟）
        </label>
        {settings.regulatoryFees.enabled && (
          <div className="grid grid-cols-3 gap-3 mt-3">
            <NumberInput label="SEC 費率" step={0.0000001} value={settings.regulatoryFees.secFeeRate} onChange={(v) => setRegFee({ secFeeRate: v })} />
            <NumberInput label="TAF/股 USD" step={0.000001} value={settings.regulatoryFees.finraTafPerShare} onChange={(v) => setRegFee({ finraTafPerShare: v })} />
            <NumberInput label="TAF 上限 USD" step={0.01} value={settings.regulatoryFees.finraTafMaxUsd} onChange={(v) => setRegFee({ finraTafMaxUsd: v })} />
          </div>
        )}
        <p className="text-[11px] text-slate-400 mt-2">金額極小，僅在賣出/再平衡賣出時計入。</p>
      </Field>

      {/* 股利預扣稅 */}
      <Field title="股利預扣稅率">
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={0}
            max={40}
            step={1}
            value={withholdingPct}
            onChange={(e) => onUpdateSettings({ dividendWithholdingRate: parseInt(e.target.value, 10) / 100 })}
            className="flex-1 accent-[#0F2E4E]"
          />
          <span className="font-mono font-bold text-[#0F2E4E] w-14 text-center">{withholdingPct}%</span>
        </div>
        <p className="text-[11px] text-slate-400 mt-1">
          美國對台灣投資人股利預設預扣 30%。配息「稅後實領」＝ 稅前 ×（1 − 此率）。調整後僅影響「新加入」的配息紀錄。
        </p>
      </Field>

      {/* Discord 通知 */}
      <Field title="Discord Webhook 通知">
        <div className="flex gap-2">
          <input
            type="url"
            value={settings.discordWebhookUrl}
            onChange={(e) => onUpdateSettings({ discordWebhookUrl: e.target.value })}
            placeholder="https://discord.com/api/webhooks/..."
            className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono"
          />
          <button
            onClick={handleTestWebhook}
            disabled={!settings.discordWebhookUrl || webhookStatus === 'testing'}
            className="px-3 py-2 border border-[#0F2E4E] text-[#0F2E4E] text-sm rounded-lg disabled:opacity-40 whitespace-nowrap"
          >
            {webhookStatus === 'testing' ? '測試中…' : webhookStatus === 'ok' ? '✅' : webhookStatus === 'fail' ? '❌' : '測試'}
          </button>
        </div>
        <div className="flex items-center gap-2 mt-2">
          <span className="text-xs text-slate-500">提前</span>
          <input
            type="number"
            min={0}
            max={60}
            value={settings.discordNotifyDaysBefore}
            onChange={(e) => onUpdateSettings({ discordNotifyDaysBefore: parseInt(e.target.value, 10) || 0 })}
            className="w-16 rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
          />
          <span className="text-xs text-slate-500">天通知（以美東時間計算）</span>
        </div>
      </Field>

      {/* 匯入 / 匯出 */}
      <Field title="資料備份">
        <div className="flex gap-3 flex-wrap">
          <button onClick={handleExportFile} className="px-4 py-2 bg-slate-100 text-slate-700 text-sm rounded-lg border border-slate-200">↓ 匯出 JSON 檔</button>
          <label className="px-4 py-2 bg-slate-100 text-slate-700 text-sm rounded-lg border border-slate-200 cursor-pointer">
            ↑ 匯入 JSON 檔
            <input type="file" accept=".json" className="hidden" onChange={handleImportFile} />
          </label>
          <button onClick={() => setImportExportJson(onExportJSON())} className="px-4 py-2 bg-slate-100 text-slate-700 text-sm rounded-lg border border-slate-200">複製到文字框</button>
          <button
            onClick={() => { if (importExportJson.trim()) { const ok = onImportJSON(importExportJson); setImportSuccess(ok); setImportError(ok ? null : '貼上的 JSON 格式錯誤') } }}
            className="px-4 py-2 bg-slate-100 text-slate-700 text-sm rounded-lg border border-slate-200"
          >
            從文字框匯入
          </button>
        </div>
        <textarea
          value={importExportJson}
          onChange={(e) => setImportExportJson(e.target.value)}
          placeholder="匯出後的 JSON 或欲匯入資料"
          className="w-full min-h-[140px] rounded-xl border border-slate-200 px-3 py-2.5 text-xs font-mono mt-3"
        />
        {importError && <p className="text-xs text-red-500 mt-2">{importError}</p>}
        {importSuccess && <p className="text-xs text-green-600 mt-2">✅ 匯入成功！</p>}
      </Field>

      {/* 雲端同步（合併包，預設保留接口） */}
      <Field title="☁️ 雲端跨裝置同步（台股 + 美股）">
        {SYNC_UI_ENABLED ? (
          <>
            <p className="text-xs text-slate-400 mb-3">
              設定一組同步密碼，在所有裝置輸入相同密碼即可同步「台股 + 美股」全部資料。<br />
              密碼請自行記住，遺失無法找回。資料儲存 1 年後自動刪除。
            </p>
            <input
              type="text"
              placeholder="輸入自訂同步密碼（英數字/中文，最多 64 字元）"
              value={syncPassphrase}
              onChange={(e) => setSyncPassphrase(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm mb-3"
            />
            <div className="flex gap-3 flex-wrap">
              <button onClick={handleUpload} disabled={syncStatus !== 'idle'} className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg disabled:opacity-50">
                {syncStatus === 'uploading' ? '⏳ 上傳中…' : '⬆️ 上傳同步'}
              </button>
              <button onClick={handleDownload} disabled={syncStatus !== 'idle'} className="px-4 py-2 bg-green-600 text-white text-sm rounded-lg disabled:opacity-50">
                {syncStatus === 'downloading' ? '⏳ 下載中…' : '⬇️ 下載同步'}
              </button>
            </div>
            {syncMessage && <p className={`text-xs mt-2 ${syncMessage.startsWith('✅') ? 'text-green-600' : 'text-red-500'}`}>{syncMessage}</p>}
          </>
        ) : (
          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center">
            <div className="text-sm font-semibold text-slate-500">☁️ 即將推出</div>
            <p className="text-xs text-slate-400 mt-1">
              合併同步（台股 + 美股）功能已完成後端與接口，待整體驗收後開放。<br />
              目前請先使用上方「匯出 / 匯入 JSON」備份美股資料。
            </p>
          </div>
        )}
      </Field>
    </div>
  )
}

function Field({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">{title}</p>
      {children}
    </div>
  )
}

function NumberInput({ label, value, step, onChange }: { label: string; value: number; step: number; onChange: (v: number) => void }) {
  return (
    <div>
      <label className="text-[11px] text-slate-400 block mb-1.5">{label}</label>
      <input
        type="number"
        min={0}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-mono"
      />
    </div>
  )
}
