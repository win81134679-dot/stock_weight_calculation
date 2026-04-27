'use client'

/**
 * DividendManager.tsx
 * ETF 配息紀錄管理。
 * - 每個帳戶+ETF 設定「進場日」，只抓取進場日之後的配息
 * - 自動同步：過濾 exDate < 進場日，已存在的紀錄不覆寫
 * - 手動補登
 * - 配息歷史
 */

import React, { useState, useMemo, useCallback } from 'react'
import { Account, Holding, Transaction, DividendRecord } from '@/lib/types'
import { formatMoney } from '@/lib/calculator'

interface Props {
  accounts: Account[]
  holdings: Holding[]
  transactions: Transaction[]
  dividends: DividendRecord[]
  dividendEntryDates: Record<string, string>  // key: `${accountId}_${code}`
  prices: Record<string, { price: number; avgCost?: number }>
  onAddDividend: (record: Omit<DividendRecord, 'id'>) => void
  onDeleteDividend: (id: string) => void
  onBulkUpsert: (records: Omit<DividendRecord, 'id'>[]) => void
  onSetDividendEntryDate: (accountId: string, code: string, date: string) => void
}

/** 計算某帳戶+ETF 的有效進場日（優先用自訂，其次取最早買入交易） */
function resolveEntryDate(
  accountId: string,
  code: string,
  transactions: Transaction[],
  dividendEntryDates: Record<string, string>
): string {
  const key = `${accountId}_${code}`
  if (dividendEntryDates[key]) return dividendEntryDates[key]

  const buyDates = transactions
    .filter((t) => t.accountId === accountId && t.code === code && t.type === 'buy')
    .map((t) => t.date)
    .sort()

  if (buyDates.length > 0) return buyDates[0]
  return new Date().toISOString().split('T')[0]
}

const ACCOUNT_DOT: Record<string, string> = {
  blue: 'bg-blue-400', green: 'bg-emerald-400', yellow: 'bg-yellow-400',
  purple: 'bg-violet-400', pink: 'bg-pink-400', orange: 'bg-orange-400', teal: 'bg-teal-400',
}

interface FetchState {
  status: 'idle' | 'loading' | 'done' | 'error'
  count: number
  skipped: number
}

export default function DividendManager({
  accounts,
  holdings,
  transactions,
  dividends,
  dividendEntryDates,
  prices,
  onAddDividend,
  onDeleteDividend,
  onBulkUpsert,
  onSetDividendEntryDate,
}: Props) {
  // Form state
  const [formAccountId, setFormAccountId] = useState<string>(accounts[0]?.id ?? '')
  const [formCode, setFormCode] = useState<string>('')
  const [formExDate, setFormExDate] = useState<string>(new Date().toISOString().split('T')[0])
  const [formCashPerShare, setFormCashPerShare] = useState<string>('')
  const [formNote, setFormNote] = useState<string>('')

  // Auto-fetch state per code
  const [fetchStates, setFetchStates] = useState<Record<string, FetchState>>({})

  // 進場日編輯暫存（尚未儲存的狀態）
  const [editingEntryDate, setEditingEntryDate] = useState<Record<string, string>>({})

  // Unique ETF codes from holdings
  const uniqueCodes = useMemo(() => {
    return Array.from(new Set(holdings.map((h) => h.code)))
  }, [holdings])

  // Find shares for auto-total calculation
  const selectedHolding = useMemo(() => {
    return holdings.find((h) => h.accountId === formAccountId && h.code === formCode.trim().toUpperCase())
  }, [holdings, formAccountId, formCode])

  const formShares = selectedHolding?.shares ?? 0
  const formTotalCash = formShares > 0 && formCashPerShare
    ? Math.round(formShares * parseFloat(formCashPerShare) * 100) / 100
    : 0

  // ── 進場日 helpers ──────────────────────────────────────────────

  const getDisplayEntryDate = useCallback(
    (accountId: string, code: string): string => {
      const key = `${accountId}_${code}`
      if (editingEntryDate[key] !== undefined) return editingEntryDate[key]
      return resolveEntryDate(accountId, code, transactions, dividendEntryDates)
    },
    [editingEntryDate, transactions, dividendEntryDates]
  )

  const getEntryDateSource = useCallback(
    (accountId: string, code: string): string => {
      if (dividendEntryDates[`${accountId}_${code}`]) return '自訂'
      const hasTx = transactions.some(
        (t) => t.accountId === accountId && t.code === code && t.type === 'buy'
      )
      return hasTx ? '推算自交易' : '預設'
    },
    [dividendEntryDates, transactions]
  )

  const handleEntryDateChange = (accountId: string, code: string, value: string) => {
    const key = `${accountId}_${code}`
    setEditingEntryDate((prev) => ({ ...prev, [key]: value }))
  }

  const handleEntryDateSave = (accountId: string, code: string) => {
    const key = `${accountId}_${code}`
    const date = editingEntryDate[key]
    if (date) {
      onSetDividendEntryDate(accountId, code, date)
      setEditingEntryDate((prev) => { const n = { ...prev }; delete n[key]; return n })
    }
  }

  const handleEntryDateReset = (accountId: string, code: string) => {
    onSetDividendEntryDate(accountId, code, '')
    const key = `${accountId}_${code}`
    setEditingEntryDate((prev) => { const n = { ...prev }; delete n[key]; return n })
  }

  /** 自動抓取單一 ETF 配息（進場日之後才算） */
  const autoFetch = useCallback(async (code: string) => {
    setFetchStates((prev) => ({ ...prev, [code]: { status: 'loading', count: 0, skipped: 0 } }))
    try {
      const res = await fetch(`/api/etf-dividend?code=${encodeURIComponent(code)}`)
      const data = await res.json()

      if (!res.ok || !data.records || data.records.length === 0) {
        setFetchStates((prev) => ({ ...prev, [code]: { status: 'error', count: 0, skipped: 0 } }))
        return
      }

      const toUpsert: Omit<DividendRecord, 'id'>[] = []
      let totalSkipped = 0

      for (const acct of accounts) {
        const holding = holdings.find((h) => h.accountId === acct.id && h.code === code)
        if (!holding) continue

        const entryDate = resolveEntryDate(acct.id, code, transactions, dividendEntryDates)

        for (const r of data.records as { exDate: string; cashPerShare: number }[]) {
          if (r.exDate < entryDate) {
            totalSkipped++
            continue
          }
          toUpsert.push({
            accountId: acct.id,
            code,
            exDate: r.exDate,
            cashPerShare: r.cashPerShare,
            shares: holding.shares,
            totalCash: Math.round(holding.shares * r.cashPerShare * 100) / 100,
            source: 'auto',
          })
        }
      }

      if (toUpsert.length > 0) {
        onBulkUpsert(toUpsert)
      }

      setFetchStates((prev) => ({
        ...prev,
        [code]: { status: 'done', count: toUpsert.length, skipped: totalSkipped },
      }))
    } catch {
      setFetchStates((prev) => ({ ...prev, [code]: { status: 'error', count: 0, skipped: 0 } }))
    }
  }, [accounts, holdings, transactions, dividendEntryDates, onBulkUpsert])

  /** 全部 ETF 一鍵同步 */
  const autoFetchAll = useCallback(async () => {
    for (const code of uniqueCodes) {
      await autoFetch(code)
    }
  }, [uniqueCodes, autoFetch])

  // Summary: per code
  const summary = useMemo(() => {
    return uniqueCodes.map((code) => {
      const holding = holdings.find((h) => h.code === code)
      const codeDivs = dividends.filter((d) => d.code === code)
      const totalCash = codeDivs.reduce((s, d) => s + d.totalCash, 0)
      const cost = holding ? holding.avgCost * holding.shares : 0
      const price = prices[code]?.price ?? 0
      const marketValue = holding ? price * holding.shares : 0
      const unrealizedPnl = marketValue - cost
      const totalReturn = cost > 0 ? ((unrealizedPnl + totalCash) / cost) * 100 : 0
      return {
        code,
        name: holding?.name ?? code,
        totalCash,
        unrealizedPnl,
        totalReturn,
        cost,
        divCount: codeDivs.length,
      }
    })
  }, [uniqueCodes, dividends, holdings, prices])

  const handleManualAdd = () => {
    const code = formCode.trim().toUpperCase()
    const cashPerShare = parseFloat(formCashPerShare)
    if (!formAccountId || !code || !formExDate || isNaN(cashPerShare) || cashPerShare <= 0) return

    onAddDividend({
      accountId: formAccountId,
      code,
      exDate: formExDate,
      cashPerShare,
      shares: formShares,
      totalCash: formTotalCash || cashPerShare,
      source: 'manual',
      note: formNote.trim() || undefined,
    })

    setFormCode('')
    setFormCashPerShare('')
    setFormNote('')
  }

  // Sort dividends newest first
  const sortedDividends = useMemo(
    () => [...dividends].sort((a, b) => b.exDate.localeCompare(a.exDate)),
    [dividends]
  )

  return (
    <div className="space-y-5">

      {/* Summary Cards */}
      {summary.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">含息損益總覽</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {summary.map((s) => (
              <div key={s.code} className="glass-card p-4 animate-fade-up">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <span className="font-mono font-bold text-sm text-[#1A1A2E]">{s.code}</span>
                    <span className="text-xs text-slate-400 ml-1.5">{s.name}</span>
                  </div>
                  {s.divCount > 0 && (
                    <span className="text-[10px] bg-blue-50 text-blue-600 border border-blue-100 px-1.5 py-0.5 rounded font-semibold">
                      {s.divCount} 筆
                    </span>
                  )}
                </div>
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-slate-400">累積配息</span>
                    <span className="text-xs font-mono font-semibold text-blue-600">
                      {s.totalCash > 0 ? `+$${formatMoney(s.totalCash)}` : '—'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-slate-400">含息總報酬</span>
                    <span className={`text-xs font-mono font-bold ${s.totalReturn >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                      {s.totalReturn >= 0 ? '+' : ''}{s.totalReturn.toFixed(2)}%
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-slate-400">未實現損益</span>
                    <span className={`text-xs font-mono ${s.unrealizedPnl >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                      {s.unrealizedPnl >= 0 ? '+' : ''}{s.cost > 0 ? ((s.unrealizedPnl / s.cost) * 100).toFixed(2) : '0.00'}%
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 進場日設定 */}
      {holdings.length > 0 && (
        <div className="glass-card p-4">
          <div className="mb-3">
            <p className="text-sm font-semibold text-[#1A1A2E]">📅 進場日設定</p>
            <p className="text-xs text-slate-400 mt-0.5">
              系統只抓取「進場日」之後的配息，避免計算未持有期間的配息。預設自動推算自最早的買入交易。
            </p>
          </div>
          <div className="space-y-2">
            {holdings.map((h) => {
              const key = `${h.accountId}_${h.code}`
              const acct = accounts.find((a) => a.id === h.accountId)
              const dotColors: Record<string, string> = {
                blue: 'bg-blue-400', green: 'bg-emerald-400', yellow: 'bg-yellow-400',
                purple: 'bg-violet-400', pink: 'bg-pink-400', orange: 'bg-orange-400', teal: 'bg-teal-400',
              }
              const dotClass = acct ? (dotColors[acct.color] ?? 'bg-slate-300') : 'bg-slate-300'
              const displayDate = getDisplayEntryDate(h.accountId, h.code)
              const source = getEntryDateSource(h.accountId, h.code)
              const isCustomized = !!dividendEntryDates[key]
              const isEditing = editingEntryDate[key] !== undefined

              return (
                <div key={key} className="flex flex-wrap items-center gap-2 px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-100">
                  <div className="flex items-center gap-1.5 min-w-[60px]">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${dotClass}`} />
                    <span className="text-xs text-slate-600 font-medium">{acct?.name ?? h.accountId}</span>
                  </div>
                  <span className="font-mono text-xs font-bold text-[#1A1A2E] min-w-[56px]">{h.code}</span>
                  <input
                    type="date"
                    value={displayDate}
                    onChange={(e) => handleEntryDateChange(h.accountId, h.code, e.target.value)}
                    className="text-xs border border-slate-200 rounded-lg px-2 py-1 bg-white focus:outline-none focus:border-[#4A90C4] font-mono"
                  />
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${
                    isCustomized
                      ? 'bg-violet-50 text-violet-600 border border-violet-100'
                      : 'bg-slate-100 text-slate-400'
                  }`}>
                    {source}
                  </span>
                  {isEditing && (
                    <button
                      onClick={() => handleEntryDateSave(h.accountId, h.code)}
                      className="text-[10px] px-2 py-1 rounded-lg bg-emerald-500 text-white font-semibold hover:bg-emerald-600 transition-colors"
                    >
                      儲存
                    </button>
                  )}
                  {isCustomized && !isEditing && (
                    <button
                      onClick={() => handleEntryDateReset(h.accountId, h.code)}
                      className="text-[10px] text-slate-400 hover:text-red-400 transition-colors"
                      title="重設為自動推算"
                    >
                      重設
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Auto Sync */}
      <div className="glass-card p-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
          <div>
            <p className="text-sm font-semibold text-[#1A1A2E]">🔄 自動同步配息</p>
            <p className="text-xs text-slate-400 mt-0.5">
              從 Yahoo Finance 抓取配息紀錄，只計算進場日之後的配息。已存在的紀錄不會重複或複寫。
            </p>
          </div>
          {uniqueCodes.length > 0 && (
            <button
              onClick={autoFetchAll}
              className="shrink-0 px-4 py-2 bg-[#2C5F8A] text-white text-sm font-semibold rounded-xl hover:bg-[#245278] transition-colors"
            >
              一鍵同步所有 ETF
            </button>
          )}
        </div>

        {uniqueCodes.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {uniqueCodes.map((code) => {
              const st = fetchStates[code]
              return (
                <div key={code} className="flex items-center gap-1.5 bg-slate-50 border border-slate-100 rounded-lg px-3 py-1.5">
                  <span className="font-mono text-xs font-semibold text-[#1A1A2E]">{code}</span>
                  {!st || st.status === 'idle' ? (
                    <button onClick={() => autoFetch(code)} className="text-[10px] text-blue-500 underline">同步</button>
                  ) : st.status === 'loading' ? (
                    <span className="text-[10px] text-slate-400 animate-pulse">同步中…</span>
                  ) : st.status === 'done' ? (
                    <span className="text-[10px] text-emerald-600">
                      ✓ 新增 {st.count} 筆
                      {st.skipped > 0 && <span className="text-slate-400 ml-1">（過濾 {st.skipped} 筆進場前）</span>}
                    </span>
                  ) : (
                    <span className="text-[10px] text-amber-500">暫無資料</span>
                  )}
                </div>
              )
            })}
          </div>
        ) : (
          <p className="text-xs text-slate-400">請先在「持倉管理」新增持倉，再來同步配息。</p>
        )}
      </div>

      {/* Manual Add Form */}
      <div className="glass-card p-4">
        <p className="text-sm font-semibold text-[#1A1A2E] mb-3">手動補登配息</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div className="col-span-2 sm:col-span-1">
            <label className="block text-[11px] text-slate-400 mb-1">帳戶</label>
            <select
              value={formAccountId}
              onChange={(e) => setFormAccountId(e.target.value)}
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-[#4A90C4]"
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>{a.name}{a.broker ? ` (${a.broker})` : ''}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[11px] text-slate-400 mb-1">ETF 代碼</label>
            <input
              type="text"
              placeholder="e.g. 0050"
              value={formCode}
              onChange={(e) => setFormCode(e.target.value.toUpperCase())}
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-[#4A90C4] font-mono"
            />
          </div>
          <div>
            <label className="block text-[11px] text-slate-400 mb-1">除息日期</label>
            <input
              type="date"
              value={formExDate}
              onChange={(e) => setFormExDate(e.target.value)}
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-[#4A90C4]"
            />
          </div>
          <div>
            <label className="block text-[11px] text-slate-400 mb-1">每股配息 (元)</label>
            <input
              type="number"
              step="0.0001"
              min="0"
              placeholder="0.35"
              value={formCashPerShare}
              onChange={(e) => setFormCashPerShare(e.target.value)}
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-[#4A90C4] font-mono"
            />
          </div>
          {formShares > 0 && parseFloat(formCashPerShare) > 0 && (
            <div>
              <label className="block text-[11px] text-slate-400 mb-1">預計領息（自動）</label>
              <div className="text-sm font-mono font-semibold text-emerald-600 px-3 py-2 bg-emerald-50 border border-emerald-100 rounded-lg">
                ${formatMoney(formTotalCash)}
              </div>
            </div>
          )}
          <div className="col-span-2 sm:col-span-3">
            <label className="block text-[11px] text-slate-400 mb-1">備注（選填）</label>
            <input
              type="text"
              placeholder="備注說明"
              value={formNote}
              onChange={(e) => setFormNote(e.target.value)}
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-[#4A90C4]"
            />
          </div>
        </div>
        <div className="flex justify-end mt-3">
          <button
            onClick={handleManualAdd}
            disabled={!formAccountId || !formCode || !formExDate || !formCashPerShare}
            className="px-4 py-2 bg-[#2C5F8A] text-white text-sm font-semibold rounded-xl hover:bg-[#245278] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            新增配息紀錄
          </button>
        </div>
      </div>

      {/* Dividend History Table */}
      {sortedDividends.length > 0 ? (
        <div className="glass-card overflow-hidden">
          <div className="p-4 pb-2">
            <p className="text-sm font-semibold text-[#1A1A2E]">配息歷史</p>
            <p className="text-xs text-slate-400 mt-0.5">共 {sortedDividends.length} 筆，合計 ${formatMoney(dividends.reduce((s, d) => s + d.totalCash, 0))}</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-[11px] text-slate-400 uppercase tracking-wide">
                  <th className="px-4 py-2 text-left">帳戶</th>
                  <th className="px-4 py-2 text-left">代碼</th>
                  <th className="px-4 py-2 text-left">除息日</th>
                  <th className="px-4 py-2 text-right">每股配息</th>
                  <th className="px-4 py-2 text-right">總領息</th>
                  <th className="px-4 py-2 text-center">來源</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {sortedDividends.map((d) => {
                  const acct = accounts.find((a) => a.id === d.accountId)
                  const dotClass = acct ? (ACCOUNT_DOT[acct.color] ?? 'bg-slate-300') : 'bg-slate-300'
                  return (
                    <tr key={d.id} className="border-t border-slate-100 hover:bg-slate-50/50 transition-colors">
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-1.5">
                          <span className={`w-2 h-2 rounded-full ${dotClass}`} />
                          <span className="text-xs text-slate-600">{acct?.name ?? d.accountId}</span>
                        </div>
                      </td>
                      <td className="px-4 py-2 font-mono font-semibold text-xs text-[#1A1A2E]">{d.code}</td>
                      <td className="px-4 py-2 text-xs text-slate-500">{d.exDate}</td>
                      <td className="px-4 py-2 text-right text-xs font-mono text-slate-600">${d.cashPerShare.toFixed(4)}</td>
                      <td className="px-4 py-2 text-right text-xs font-mono font-semibold text-emerald-600">+${formatMoney(d.totalCash)}</td>
                      <td className="px-4 py-2 text-center">
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                          d.source === 'auto'
                            ? 'bg-blue-50 text-blue-600'
                            : 'bg-slate-50 text-slate-500'
                        }`}>
                          {d.source === 'auto' ? '自動' : '手動'}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-right">
                        <button
                          onClick={() => onDeleteDividend(d.id)}
                          className="text-slate-300 hover:text-red-400 transition-colors text-xs px-1"
                          title="刪除"
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="text-center py-10 text-slate-400">
          <div className="text-3xl mb-2">💰</div>
          <p className="text-sm">尚無配息紀錄</p>
          <p className="text-xs mt-1">確認進場日設定後，點擊「一鍵同步」從外部自動抓取，或手動補登</p>
        </div>
      )}
    </div>
  )
}
