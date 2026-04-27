'use client'

/**
 * DividendManager.tsx
 * ETF 配息紀錄管理：自動從 TWSE API 抓取 + 手動補登。
 * 顯示累積領息、含息報酬率。
 */

import React, { useState, useMemo, useCallback } from 'react'
import { Account, Holding, DividendRecord } from '@/lib/types'
import { formatMoney } from '@/lib/calculator'

interface Props {
  accounts: Account[]
  holdings: Holding[]
  dividends: DividendRecord[]
  prices: Record<string, { price: number; avgCost?: number }>
  onAddDividend: (record: Omit<DividendRecord, 'id'>) => void
  onDeleteDividend: (id: string) => void
  onBulkUpsert: (records: Omit<DividendRecord, 'id'>[]) => void
}

const ACCOUNT_DOT: Record<string, string> = {
  blue: 'bg-blue-400', green: 'bg-emerald-400', yellow: 'bg-yellow-400',
  purple: 'bg-violet-400', pink: 'bg-pink-400', orange: 'bg-orange-400', teal: 'bg-teal-400',
}

interface AutoFetchState {
  code: string
  status: 'idle' | 'loading' | 'done' | 'error'
  count: number
}

export default function DividendManager({
  accounts,
  holdings,
  dividends,
  prices,
  onAddDividend,
  onDeleteDividend,
  onBulkUpsert,
}: Props) {
  // Form state
  const [formAccountId, setFormAccountId] = useState<string>(accounts[0]?.id ?? '')
  const [formCode, setFormCode] = useState<string>('')
  const [formExDate, setFormExDate] = useState<string>(new Date().toISOString().split('T')[0])
  const [formCashPerShare, setFormCashPerShare] = useState<string>('')
  const [formNote, setFormNote] = useState<string>('')

  // Auto-fetch state per code
  const [fetchStates, setFetchStates] = useState<Record<string, AutoFetchState>>({})

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

  /** 自動抓取單一 ETF 配息 */
  const autoFetch = useCallback(async (code: string) => {
    setFetchStates((prev) => ({ ...prev, [code]: { code, status: 'loading', count: 0 } }))
    try {
      const res = await fetch(`/api/etf-dividend?code=${encodeURIComponent(code)}`)
      const data = await res.json()

      if (!res.ok || !data.records || data.records.length === 0) {
        setFetchStates((prev) => ({ ...prev, [code]: { code, status: 'error', count: 0 } }))
        return
      }

      // Build records for each account that holds this code
      const records: Omit<DividendRecord, 'id'>[] = []
      for (const acct of accounts) {
        const holding = holdings.find((h) => h.accountId === acct.id && h.code === code)
        if (!holding) continue
        for (const r of data.records as { exDate: string; cashPerShare: number }[]) {
          records.push({
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

      if (records.length > 0) {
        onBulkUpsert(records)
      }

      setFetchStates((prev) => ({
        ...prev,
        [code]: { code, status: 'done', count: records.length },
      }))
    } catch {
      setFetchStates((prev) => ({ ...prev, [code]: { code, status: 'error', count: 0 } }))
    }
  }, [accounts, holdings, onBulkUpsert])

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

      {/* Auto Sync */}
      <div className="glass-card p-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
          <div>
            <p className="text-sm font-semibold text-[#1A1A2E]">自動同步配息</p>
            <p className="text-xs text-slate-400 mt-0.5">從 TWSE 自動抓取您持倉 ETF 的歷史配息資料</p>
          </div>
          <button
            onClick={autoFetchAll}
            className="shrink-0 px-4 py-2 bg-[#2C5F8A] text-white text-sm font-semibold rounded-xl hover:bg-[#245278] transition-colors"
          >
            一鍵同步所有 ETF
          </button>
        </div>

        {/* Per-code sync status */}
        {uniqueCodes.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {uniqueCodes.map((code) => {
              const st = fetchStates[code]
              return (
                <div key={code} className="flex items-center gap-1.5 bg-slate-50 border border-slate-100 rounded-lg px-3 py-1.5">
                  <span className="font-mono text-xs font-semibold text-[#1A1A2E]">{code}</span>
                  {!st || st.status === 'idle' ? (
                    <button
                      onClick={() => autoFetch(code)}
                      className="text-[10px] text-blue-500 underline"
                    >
                      同步
                    </button>
                  ) : st.status === 'loading' ? (
                    <span className="text-[10px] text-slate-400 animate-pulse">同步中...</span>
                  ) : st.status === 'done' ? (
                    <span className="text-[10px] text-emerald-600">✓ {st.count} 筆</span>
                  ) : (
                    <span className="text-[10px] text-amber-500">暫無資料</span>
                  )}
                </div>
              )
            })}
          </div>
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
          <p className="text-xs mt-1">點擊「一鍵同步」從 TWSE 自動抓取，或手動補登</p>
        </div>
      )}
    </div>
  )
}
