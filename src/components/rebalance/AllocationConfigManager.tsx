'use client'

/**
 * AllocationConfigManager.tsx
 * 目標配置管理介面：建立、複製、編輯、刪除配置，並顯示各帳戶的使用狀況。
 */

import React, { useState, useCallback } from 'react'
import { AllocationConfig, Account, TargetWeight } from '@/lib/types'
import { calcNextRebalanceDate } from '@/lib/rebalance-calculator'

interface Props {
  configs: AllocationConfig[]
  accounts: Account[]
  onAdd: (config: Omit<AllocationConfig, 'id'>) => void
  onUpdate: (id: string, patch: Partial<Omit<AllocationConfig, 'id'>>) => void
  onDelete: (id: string) => boolean
  onDuplicate: (id: string) => void
}

// ─── 股票名稱自動帶入 ─────────────────────────────────────────────────────────

/**
 * 透過 /api/stock-price proxy 查詢股票名稱。
 * 支援 tse + otc 兩個交易所，處理盤後（z='-'）仍能取名稱。
 * 查不到時回傳 null，讓呼叫端決定是否 fallback。
 */
async function fetchStockName(code: string): Promise<{ name: string; exchange: 'tse' | 'otc'; isETF: boolean } | null> {
  const upper = code.trim().toUpperCase()
  // 同時查 tse + otc
  const paramTse = `tse_${upper}.tw`
  const paramOtc = `otc_${upper}.tw`
  try {
    const res = await fetch(`/api/stock-price?codes=${encodeURIComponent(`${paramTse}|${paramOtc}`)}`)
    if (!res.ok) return null
    const data = await res.json()
    const msgArray: { c?: string; n?: string; ex_ch?: string }[] = data?.msgArray ?? []
    for (const info of msgArray) {
      const name = (info.n ?? '').trim()
      if (!name || name === '-') continue
      const exchange = (info.ex_ch ?? '').startsWith('otc') ? 'otc' : 'tse'
      return {
        name,
        exchange,
        isETF: upper.startsWith('00') && upper.length >= 4,
      }
    }
    return null
  } catch {
    return null
  }
}

// ─── inline 配置編輯器 ────────────────────────────────────────────────────────

interface EditorState {
  name: string
  description: string
  rebalanceIntervalMonths: number
  rebalanceDayOfMonth: number
  targetWeights: TargetWeight[]
}

function ConfigEditor({
  initial,
  onSave,
  onCancel,
}: {
  initial: EditorState
  onSave: (state: EditorState) => void
  onCancel: () => void
}) {
  const [state, setState] = useState<EditorState>(initial)
  const [newCode, setNewCode] = useState('')
  const [newWeight, setNewWeight] = useState('')
  const [fetchingName, setFetchingName] = useState(false)
  const [nameError, setNameError] = useState<string | null>(null)

  const totalWeight = state.targetWeights.reduce((s, t) => s + t.weight, 0)
  const previewNextDate = calcNextRebalanceDate(state.rebalanceIntervalMonths, state.rebalanceDayOfMonth)

  function updateField<K extends keyof EditorState>(key: K, value: EditorState[K]) {
    setState((prev) => ({ ...prev, [key]: value }))
  }

  function updateTW(code: string, weight: number) {
    setState((prev) => ({
      ...prev,
      targetWeights: prev.targetWeights.map((t) => (t.code === code ? { ...t, weight } : t)),
    }))
  }

  function removeTW(code: string) {
    setState((prev) => ({
      ...prev,
      targetWeights: prev.targetWeights.filter((t) => t.code !== code),
    }))
  }

  const handleAddTW = useCallback(async () => {
    const code = newCode.trim().toUpperCase()
    const weight = parseFloat(newWeight)
    if (!code || isNaN(weight) || weight <= 0) return
    if (state.targetWeights.some((t) => t.code === code)) return

    setFetchingName(true)
    setNameError(null)
    const info = await fetchStockName(code)
    setFetchingName(false)

    // 查不到名稱時仍允許新增（以代碼作為名稱），並顯示提示
    const resolvedName = info?.name ?? code
    const resolvedExchange = info?.exchange ?? 'tse'
    const resolvedIsETF = info?.isETF ?? (code.startsWith('00') && code.length >= 4)

    if (!info) {
      setNameError(`無法自動帶入 ${code} 名稱，已以代碼代替，可手動修改`)
    }

    setState((prev) => ({
      ...prev,
      targetWeights: [
        ...prev.targetWeights,
        { code, name: resolvedName, exchange: resolvedExchange, isETF: resolvedIsETF, weight },
      ],
    }))
    setNewCode('')
    setNewWeight('')
  }, [newCode, newWeight, state.targetWeights])

  function handleSave() {
    if (!state.name.trim()) return
    onSave(state)
  }

  return (
    <div className="mt-3 space-y-4 border-t border-slate-200 pt-4">
      {/* 名稱 + 描述 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-semibold text-slate-500 mb-1 block">配置名稱*</label>
          <input
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
            value={state.name}
            onChange={(e) => updateField('name', e.target.value)}
            placeholder="如：積極成長型"
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-500 mb-1 block">備註（選填）</label>
          <input
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
            value={state.description}
            onChange={(e) => updateField('description', e.target.value)}
            placeholder="簡短說明此配置用途"
          />
        </div>
      </div>

      {/* 再平衡排程 */}
      <div>
        <label className="text-xs font-semibold text-slate-500 mb-2 block">再平衡排程</label>
        <div className="flex flex-wrap gap-3 items-center">
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-500">每</span>
            <input
              type="number"
              min="1"
              max="24"
              className="w-16 border border-slate-200 rounded-lg px-2 py-1.5 text-sm text-center"
              value={state.rebalanceIntervalMonths}
              onChange={(e) => updateField('rebalanceIntervalMonths', Math.max(1, parseInt(e.target.value) || 1))}
            />
            <span className="text-sm text-slate-500">個月，每月第</span>
            <input
              type="number"
              min="1"
              max="28"
              className="w-16 border border-slate-200 rounded-lg px-2 py-1.5 text-sm text-center"
              value={state.rebalanceDayOfMonth}
              onChange={(e) => updateField('rebalanceDayOfMonth', Math.max(1, Math.min(28, parseInt(e.target.value) || 1)))}
            />
            <span className="text-sm text-slate-500">日</span>
          </div>
          <div className="text-xs text-slate-400 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200">
            下次預計：<span className="font-medium text-slate-600">{previewNextDate}</span>
          </div>
        </div>
      </div>

      {/* 標的清單 */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs font-semibold text-slate-500">標的配置</label>
          <span className={`text-xs font-mono px-2 py-0.5 rounded ${
            Math.abs(totalWeight - 100) < 0.01
              ? 'bg-green-100 text-green-700'
              : totalWeight > 100
              ? 'bg-red-100 text-red-700'
              : 'bg-amber-100 text-amber-700'
          }`}>
            合計 {totalWeight.toFixed(1)}%
            {Math.abs(totalWeight - 100) < 0.01 ? ' ✓' : totalWeight > 100 ? ' 超過 100%' : ' 未達 100%'}
          </span>
        </div>

        <div className="space-y-2 mb-3">
          {state.targetWeights.map((tw) => (
            <div key={tw.code} className="flex items-center gap-2">
              <div className="flex-1 flex items-center gap-2 bg-slate-50 rounded-lg px-3 py-2 border border-slate-200">
                <span className="font-mono font-bold text-sm text-[#2C5F8A] w-20 shrink-0">{tw.code}</span>
                <span className="text-sm text-slate-500 flex-1 truncate">{tw.name}</span>
              </div>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="1"
                  className="w-16 border border-slate-200 rounded-lg px-2 py-2 text-sm text-center"
                  value={tw.weight}
                  onChange={(e) => updateTW(tw.code, parseFloat(e.target.value) || 0)}
                />
                <span className="text-xs text-slate-400">%</span>
              </div>
              <button
                onClick={() => removeTW(tw.code)}
                className="text-red-400 hover:text-red-600 px-1 text-sm"
                title="移除"
              >
                ✕
              </button>
            </div>
          ))}
        </div>

        {/* 新增標的 */}
        <div className="flex gap-2 items-start">
          <div className="flex-1 flex gap-2">
            <input
              className="w-28 border border-slate-200 rounded-lg px-3 py-2 text-sm uppercase"
              value={newCode}
              onChange={(e) => { setNewCode(e.target.value.toUpperCase()); setNameError(null) }}
              placeholder="代碼"
              onKeyDown={(e) => e.key === 'Enter' && handleAddTW()}
            />
            <input
              type="number"
              min="0"
              max="100"
              className="w-20 border border-slate-200 rounded-lg px-3 py-2 text-sm text-center"
              value={newWeight}
              onChange={(e) => setNewWeight(e.target.value)}
              placeholder="%"
              onKeyDown={(e) => e.key === 'Enter' && handleAddTW()}
            />
          </div>
          <button
            onClick={handleAddTW}
            disabled={fetchingName || !newCode.trim() || !newWeight}
            className="px-3 py-2 bg-slate-700 text-white text-sm rounded-lg disabled:opacity-40 whitespace-nowrap"
          >
            {fetchingName ? '查詢…' : '+ 加入'}
          </button>
        </div>
        {nameError && <p className="text-xs text-amber-500 mt-1">⚠ {nameError}</p>}
      </div>

      {/* Actions */}
      <div className="flex gap-2 justify-end pt-2 border-t border-slate-100">
        <button
          onClick={onCancel}
          className="px-4 py-2 text-sm rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200"
        >
          取消
        </button>
        <button
          onClick={handleSave}
          disabled={!state.name.trim() || Math.abs(totalWeight - 100) >= 0.5}
          className="px-4 py-2 text-sm rounded-lg bg-[#2C5F8A] text-white hover:bg-[#4A90C4] disabled:opacity-40"
        >
          儲存配置
        </button>
      </div>
    </div>
  )
}

// ─── 主元件 ────────────────────────────────────────────────────────────────────

export default function AllocationConfigManager({ configs, accounts, onAdd, onUpdate, onDelete, onDuplicate }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  function handleSaveExisting(id: string, state: EditorState) {
    onUpdate(id, {
      name: state.name,
      description: state.description || undefined,
      rebalanceIntervalMonths: state.rebalanceIntervalMonths,
      rebalanceDayOfMonth: state.rebalanceDayOfMonth,
      nextRebalanceDate: calcNextRebalanceDate(state.rebalanceIntervalMonths, state.rebalanceDayOfMonth),
      targetWeights: state.targetWeights,
    })
    setEditingId(null)
  }

  function handleSaveNew(state: EditorState) {
    onAdd({
      name: state.name,
      description: state.description || undefined,
      rebalanceIntervalMonths: state.rebalanceIntervalMonths,
      rebalanceDayOfMonth: state.rebalanceDayOfMonth,
      nextRebalanceDate: calcNextRebalanceDate(state.rebalanceIntervalMonths, state.rebalanceDayOfMonth),
      targetWeights: state.targetWeights,
    })
    setCreating(false)
  }

  function handleDelete(id: string, name: string) {
    setDeleteError(null)
    // Check if last config
    if (configs.length <= 1) {
      setDeleteError('無法刪除最後一個配置')
      return
    }
    // Check if in use
    const usingAccounts = accounts.filter((a) => a.allocationConfigId === id)
    if (usingAccounts.length > 0) {
      setDeleteError(`「${name}」正在被 ${usingAccounts.map((a) => a.name).join('、')} 使用，無法刪除`)
      return
    }
    if (!confirm(`確定刪除「${name}」？`)) return
    const ok = onDelete(id)
    if (!ok) setDeleteError('刪除失敗，請再試一次')
  }

  return (
    <div className="space-y-4">
      {deleteError && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700 flex items-center justify-between">
          <span>{deleteError}</span>
          <button onClick={() => setDeleteError(null)} className="text-red-400 hover:text-red-600 ml-4">✕</button>
        </div>
      )}

      {/* Config cards */}
      <div className="space-y-3">
        {configs.map((cfg) => {
          const usingAccounts = accounts.filter((a) => a.allocationConfigId === cfg.id)
          const defaultAccounts = accounts.filter((a) => !a.allocationConfigId)
          const isDefault = cfg.id === configs[0].id
          const displayAccounts = isDefault ? [...defaultAccounts, ...usingAccounts] : usingAccounts
          const totalW = cfg.targetWeights.reduce((s, t) => s + t.weight, 0)
          const isEditing = editingId === cfg.id

          return (
            <div key={cfg.id} className="bg-white rounded-xl border border-slate-200 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-slate-800">{cfg.name}</span>
                    {isDefault && (
                      <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full">預設</span>
                    )}
                    {displayAccounts.length > 0 && (
                      <div className="flex gap-1 flex-wrap">
                        {displayAccounts.map((a) => (
                          <span key={a.id} className="text-xs px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full">
                            {a.name}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  {cfg.description && (
                    <p className="text-xs text-slate-400 mt-0.5">{cfg.description}</p>
                  )}
                  <div className="flex gap-4 mt-2 text-xs text-slate-500">
                    <span>
                      {cfg.targetWeights.length} 支標的
                      <span className={`ml-1 ${Math.abs(totalW - 100) < 0.5 ? 'text-green-600' : 'text-red-500'}`}>
                        ({totalW.toFixed(0)}%)
                      </span>
                    </span>
                    <span>每 {cfg.rebalanceIntervalMonths} 個月 / {cfg.rebalanceDayOfMonth} 日</span>
                    <span>下次：{cfg.nextRebalanceDate}</span>
                  </div>
                  {/* Weight pills */}
                  {!isEditing && (
                    <div className="flex gap-1.5 mt-2 flex-wrap">
                      {cfg.targetWeights.map((tw) => (
                        <span key={tw.code} className="text-xs px-2 py-0.5 bg-slate-100 rounded-lg font-mono">
                          {tw.code} {tw.weight}%
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Action buttons */}
                {!isEditing && (
                  <div className="flex gap-1 shrink-0">
                    <button
                      onClick={() => { setEditingId(cfg.id); setCreating(false) }}
                      className="text-xs text-slate-500 hover:text-[#2C5F8A] px-2 py-1 rounded"
                    >
                      編輯
                    </button>
                    <button
                      onClick={() => { onDuplicate(cfg.id); setCreating(false) }}
                      className="text-xs text-slate-500 hover:text-[#2C5F8A] px-2 py-1 rounded"
                      title="複製此配置"
                    >
                      複製
                    </button>
                    <button
                      onClick={() => handleDelete(cfg.id, cfg.name)}
                      disabled={configs.length <= 1}
                      className="text-xs text-red-400 hover:text-red-600 px-2 py-1 rounded disabled:opacity-30 disabled:cursor-not-allowed"
                      title={configs.length <= 1 ? '至少需保留一個配置' : undefined}
                    >
                      刪除
                    </button>
                  </div>
                )}
              </div>

              {/* Inline editor */}
              {isEditing && (
                <ConfigEditor
                  initial={{
                    name: cfg.name,
                    description: cfg.description ?? '',
                    rebalanceIntervalMonths: cfg.rebalanceIntervalMonths,
                    rebalanceDayOfMonth: cfg.rebalanceDayOfMonth,
                    targetWeights: cfg.targetWeights,
                  }}
                  onSave={(state) => handleSaveExisting(cfg.id, state)}
                  onCancel={() => setEditingId(null)}
                />
              )}
            </div>
          )
        })}
      </div>

      {/* New config form */}
      {creating ? (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
          <p className="text-sm font-semibold text-blue-800 mb-2">新增配置</p>
          <ConfigEditor
            initial={{
              name: '',
              description: '',
              rebalanceIntervalMonths: 3,
              rebalanceDayOfMonth: 1,
              targetWeights: [],
            }}
            onSave={handleSaveNew}
            onCancel={() => setCreating(false)}
          />
        </div>
      ) : (
        <button
          onClick={() => { setCreating(true); setEditingId(null) }}
          className="w-full border border-dashed border-slate-300 rounded-xl py-3 text-sm text-slate-500 hover:border-[#2C5F8A] hover:text-[#2C5F8A] transition-colors"
        >
          + 新增配置
        </button>
      )}
    </div>
  )
}