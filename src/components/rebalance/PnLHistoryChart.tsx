'use client'

/**
 * PnLHistoryChart.tsx
 * v4: 三個 tab — 合併 / 分帳戶 / 今日
 *   「今日」 tab 讀取 sessionStorage 中由 TodayDashboard 累積的盤中 NavPoints，
 *   顯示折線圖 + 各時間點個股貢獻 % Tooltip + 最新貢獻分布列。
 */

import React, { useState, useEffect, useCallback } from 'react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts'
import { Account, PnLSnapshot } from '@/lib/types'
import { formatMoney } from '@/lib/calculator'
import type { TickerItem } from './HoldingTickerBoard'

// ── Account color map ────────────────────────────────────
const ACCOUNT_COLOR_HEX: Record<string, string> = {
  blue:   '#60A5FA',
  green:  '#34D399',
  yellow: '#FBBF24',
  purple: '#A78BFA',
  pink:   '#F472B6',
  orange: '#FB923C',
  teal:   '#2DD4BF',
}

// ── Intraday nav point（由 TodayDashboard 存入 sessionStorage）──
interface NavPoint {
  t: string                         // "HH:MM"
  v: number                         // 總 P&L delta
  s?: Record<string, number>        // code → 個股今日損益
}

// ── Props ──────────────────────────────────────────
interface Props {
  snapshots: PnLSnapshot[]
  accountId: string | null
  accounts?: Account[]
  onDeleteSnapshot?: (dateKey: string) => void
  tickerItems?: TickerItem[]
}

// ── Helpers ──────────────────────────────────────────
function formatDate(iso: string): string {
  const d = new Date(iso)
  return `${d.getMonth() + 1}/${d.getDate()}`
}

function formatFullDate(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`
}

function todayStorageKey(): string {
  return `intraday_nav_${new Date().toISOString().split('T')[0]}`
}

// ── Intraday Tooltip（顯示各股貢獻 %）───────────────────────
interface IntradayTooltipProps {
  active?: boolean
  payload?: Array<{ payload: NavPoint }>
  label?: string
  tickerItems?: TickerItem[]
}

function IntradayTooltip({ active, payload, label, tickerItems }: IntradayTooltipProps) {
  if (!active || !payload?.length) return null
  const pt = payload[0].payload
  const v = pt.v
  const entries = Object.entries(pt.s ?? {})
    .filter(([, d]) => d !== 0)
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
  const totalAbs = entries.reduce((s, [, d]) => s + Math.abs(d), 0)

  return (
    <div className="bg-white border border-slate-200 rounded-xl px-3 py-2.5 shadow-lg text-xs min-w-[180px] max-w-[220px]">
      <p className="text-slate-400 mb-1 font-mono">{label}</p>
      <p className={`font-mono font-bold mb-2 text-sm ${v >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
        {v >= 0 ? '+' : ''}${formatMoney(Math.abs(v))}
      </p>
      {entries.length > 0 && (
        <div className="border-t border-slate-100 pt-1.5 space-y-1">
          {entries.slice(0, 7).map(([code, delta]) => {
            const pct = totalAbs > 0 ? (Math.abs(delta) / totalAbs * 100).toFixed(0) : '0'
            const name = tickerItems?.find((i) => i.code === code)?.name ?? ''
            const isUp = delta >= 0
            return (
              <div key={code} className="flex items-center justify-between gap-2">
                <span className="text-slate-400 font-mono text-[10px] shrink-0">
                  {code}{name ? ` ${name.slice(0, 4)}` : ''}
                </span>
                <span className={`font-semibold font-mono text-[10px] ${isUp ? 'text-emerald-600' : 'text-red-500'}`}>
                  {isUp ? '+' : ''}${formatMoney(Math.abs(delta))}
                  <span className="text-slate-300 font-normal ml-0.5">({pct}%)</span>
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Tab pill ──────────────────────────────────────────
function TabPill({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${
        active ? 'bg-[#2C5F8A] text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
      }`}
    >
      {label}
    </button>
  )
}

// ════════════════════════════════════════════════════════════════
export default function PnLHistoryChart({
  snapshots, accountId, accounts = [], onDeleteSnapshot, tickerItems = [],
}: Props) {

  const hasHistory = snapshots.length >= 2
  const hasMultiAccounts = accounts.length > 1
  const showAccountTabs = hasMultiAccounts && accountId === null

  // 今日盤中資料（從 sessionStorage 讀）
  const [intradayData, setIntradayData] = useState<NavPoint[]>([])
  const loadIntraday = useCallback(() => {
    try {
      const raw = sessionStorage.getItem(todayStorageKey())
      setIntradayData(raw ? (JSON.parse(raw) as NavPoint[]) : [])
    } catch { /* ignore */ }
  }, [])
  useEffect(() => { loadIntraday() }, [loadIntraday])

  const hasToday = intradayData.length > 0

  const [mode, setMode] = useState<'combined' | 'per-account' | 'today'>(
    hasHistory ? 'combined' : 'today'
  )
  const [managing, setManaging] = useState(false)

  if (!hasHistory && !hasToday) return null

  // ── Combined 歷史資料 ─────────────────────────────────
  const combinedData = snapshots
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((s) => {
      if (!accountId) return { date: formatDate(s.date), pnl: s.combinedPnl }
      const acc = s.accounts.find((a) => a.accountId === accountId)
      return { date: formatDate(s.date), pnl: acc?.totalPnl ?? 0 }
    })

  // ── Per-account 歷史資料 ───────────────────────────────
  const perAccountData = snapshots
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((s) => {
      const row: Record<string, number | string> = { date: formatDate(s.date) }
      for (const acct of accounts) {
        const snap = s.accounts.find((a) => a.accountId === acct.id)
        row[acct.id] = snap?.totalPnl ?? 0
      }
      return row
    })

  // ── 今日最新貢獻分布（最後一筆 NavPoint 的 s 欄位）─────────────
  const latestNavPoint = intradayData[intradayData.length - 1]
  const contribEntries = Object.entries(latestNavPoint?.s ?? {})
    .filter(([, d]) => d !== 0)
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
  const totalAbsDelta = contribEntries.reduce((s, [, d]) => s + Math.abs(d), 0)

  // ── 管理快照面板 ────────────────────────────────────────
  if (managing && onDeleteSnapshot) {
    const sorted = [...snapshots].sort((a, b) => b.date.localeCompare(a.date))
    return (
      <div>
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-semibold text-slate-500">管理快照（共 {snapshots.length} 筆）</p>
          <button onClick={() => setManaging(false)} className="text-xs text-[#2C5F8A] hover:underline">
            ← 返回圖表
          </button>
        </div>
        <div className="max-h-64 overflow-y-auto space-y-1 pr-1">
          {sorted.map((s) => {
            const dateKey = s.date.split('T')[0]
            const pnl = accountId
              ? (s.accounts.find((a) => a.accountId === accountId)?.totalPnl ?? 0)
              : s.combinedPnl
            const isPos = pnl >= 0
            return (
              <div key={dateKey} className="flex items-center justify-between rounded-lg px-3 py-2 bg-slate-50 hover:bg-slate-100 transition-colors">
                <div className="flex items-center gap-3">
                  <span className="text-xs text-slate-500 font-mono">{formatFullDate(s.date)}</span>
                  <span className={`text-xs font-mono font-semibold ${isPos ? 'text-emerald-600' : 'text-red-500'}`}>
                    {isPos ? '+' : ''}{formatMoney(pnl)}
                  </span>
                </div>
                <button
                  onClick={() => onDeleteSnapshot(dateKey)}
                  className="w-6 h-6 flex items-center justify-center rounded-md text-slate-400 hover:bg-red-50 hover:text-red-500 transition-colors text-base leading-none"
                >×</button>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  // ── Tab row（共用）─────────────────────────────────────────
  function TabRow() {
    return (
      <div className="flex items-center justify-between mb-3">
        <div className="flex gap-1">
          {hasHistory && (
            <TabPill label="合併" active={mode === 'combined'} onClick={() => setMode('combined')} />
          )}
          {hasHistory && showAccountTabs && (
            <TabPill label="分帳戶" active={mode === 'per-account'} onClick={() => setMode('per-account')} />
          )}
          <TabPill
            label="今日"
            active={mode === 'today'}
            onClick={() => { loadIntraday(); setMode('today') }}
          />
        </div>
        {onDeleteSnapshot && mode !== 'today' && (
          <button
            onClick={() => setManaging(true)}
            className="text-xs text-slate-400 hover:text-slate-600 transition-colors flex items-center gap-1"
          >
            <span>🗑</span><span className="hidden sm:inline">管理快照</span>
          </button>
        )}
        {mode === 'today' && hasToday && (
          <button
            onClick={() => {
              try { sessionStorage.removeItem(todayStorageKey()) } catch { /* */ }
              setIntradayData([])
            }}
            className="text-[10px] text-slate-300 hover:text-slate-500 transition-colors px-2 py-1 rounded border border-slate-100 hover:border-slate-300"
          >清除今日</button>
        )}
      </div>
    )
  }

  // ════════════════════════════════════════════════════════════════
  // ① 今日 tab
  // ════════════════════════════════════════════════════════════════
  if (mode === 'today') {
    const isUp = (latestNavPoint?.v ?? 0) >= 0
    const minV = intradayData.length ? Math.min(...intradayData.map((d) => d.v)) : 0
    const hasNegIntraday = minV < 0

    return (
      <div>
        <TabRow />
        {intradayData.length < 2 ? (
          <div className="h-40 flex flex-col items-center justify-center gap-1.5 text-slate-300 text-sm">
            <span>{intradayData.length === 0 ? '等待第一次報價載入…' : '已記錄 1 筆，再等 30 秒即可顯示折線'}</span>
            <span className="text-[11px] text-slate-200">每 30 秒自動記錄一筆盤中損益</span>
          </div>
        ) : (
          <>
            {/* 折線圖 */}
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%" className="text-xs md:text-sm">
                <AreaChart data={intradayData} margin={{ top: 6, right: 4, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="intradayGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor={isUp ? '#10b981' : '#ef4444'} stopOpacity={0.22} />
                      <stop offset="95%" stopColor={isUp ? '#10b981' : '#ef4444'} stopOpacity={0.01} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis
                    dataKey="t"
                    tick={{ fontSize: 9, fill: '#94a3b8' }}
                    tickLine={false}
                    axisLine={false}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    tick={{ fontSize: 9, fill: '#94a3b8' }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v) => `${v >= 0 ? '' : '-'}$${formatMoney(Math.abs(v))}`}
                    width={60}
                  />
                  {hasNegIntraday && (
                    <ReferenceLine y={0} stroke="#cbd5e1" strokeDasharray="4 2" strokeWidth={1.5}
                      label={{ value: '0', fill: '#94a3b8', fontSize: 10 }}
                    />
                  )}
                  <Tooltip
                    content={<IntradayTooltip tickerItems={tickerItems} />}
                    cursor={{ stroke: isUp ? '#10b981' : '#ef4444', strokeWidth: 1, strokeDasharray: '3 3' }}
                  />
                  <Area
                    type="monotone"
                    dataKey="v"
                    stroke={isUp ? '#10b981' : '#ef4444'}
                    strokeWidth={2.5}
                    fill="url(#intradayGrad)"
                    dot={false}
                    activeDot={{ r: 5, fill: isUp ? '#059669' : '#dc2626', strokeWidth: 0 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* 個股今日貢獻分布 */}
            {contribEntries.length > 0 && (
              <div className="mt-4 border-t border-slate-100 pt-3">
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2">
                  最新個股貢獻占比
                  <span className="ml-1 font-normal normal-case text-slate-300">
                    （{latestNavPoint?.t} 截圖·共 {contribEntries.length} 檔）
                  </span>
                </p>
                <div className="space-y-1.5">
                  {contribEntries.slice(0, 10).map(([code, delta]) => {
                    const pct = totalAbsDelta > 0
                      ? (Math.abs(delta) / totalAbsDelta * 100)
                      : 0
                    const isStockUp = delta >= 0
                    const name = tickerItems.find((i) => i.code === code)?.name ?? ''
                    return (
                      <div key={code} className="flex items-center gap-2">
                        <span className="font-mono text-[10px] text-slate-600 w-24 shrink-0 truncate">
                          {code}{name ? ` ${name.slice(0, 5)}` : ''}
                        </span>
                        <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${
                              isStockUp ? 'bg-emerald-400' : 'bg-red-400'
                            }`}
                            style={{ width: `${pct.toFixed(1)}%` }}
                          />
                        </div>
                        <span className={`font-mono text-[10px] w-9 text-right shrink-0 font-semibold ${
                          isStockUp ? 'text-emerald-600' : 'text-red-500'
                        }`}>
                          {pct.toFixed(0)}%
                        </span>
                        <span className={`font-mono text-[10px] w-20 text-right shrink-0 ${
                          isStockUp ? 'text-emerald-600' : 'text-red-500'
                        }`}>
                          {isStockUp ? '+' : ''}${formatMoney(Math.abs(delta))}
                        </span>
                      </div>
                    )
                  })}
                </div>
                {contribEntries.length > 10 && (
                  <p className="text-[10px] text-slate-300 mt-1.5">…還有 {contribEntries.length - 10} 檔未顯示</p>
                )}
              </div>
            )}
          </>
        )}
      </div>
    )
  }

  // ════════════════════════════════════════════════════════════════
  // ② Combined 合併歷史
  // ════════════════════════════════════════════════════════════════
  if (mode === 'combined' || !showAccountTabs) {
    const minPnl = Math.min(...combinedData.map((d) => d.pnl))
    const maxPnl = Math.max(...combinedData.map((d) => d.pnl))
    const hasNeg = minPnl < 0
    const areaColor = minPnl >= 0 ? '#4A90C4' : (maxPnl < 0 ? '#ef4444' : '#4A90C4')

    return (
      <div>
        <TabRow />
        <div className="h-52 sm:h-64">
          <ResponsiveContainer width="100%" height="100%" className="text-xs md:text-sm">
            <AreaChart data={combinedData} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="pnlGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={areaColor} stopOpacity={0.25} />
                  <stop offset="95%" stopColor={areaColor} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 9, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
              <YAxis
                tick={{ fontSize: 9, fill: '#94a3b8' }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => `${v >= 0 ? '' : '-'}$${formatMoney(Math.abs(v))}`}
                width={60}
              />
              {hasNeg && (
                <ReferenceLine y={0} stroke="#cbd5e1" strokeDasharray="4 2" strokeWidth={1.5}
                  label={{ value: '0', fill: '#94a3b8', fontSize: 10 }}
                />
              )}
              <Tooltip
                formatter={(value) => {
                  const v = typeof value === 'number' ? value : 0
                  return [`${v >= 0 ? '+' : '-'}$${formatMoney(Math.abs(v))}`, '損益']
                }}
                contentStyle={{ fontSize: 12, borderRadius: 10, border: '1px solid #e2e8f0', boxShadow: '0 4px 16px rgba(0,0,0,0.08)' }}
                cursor={{ stroke: '#4A90C4', strokeWidth: 1, strokeDasharray: '3 3' }}
              />
              <Area type="monotone" dataKey="pnl" stroke={areaColor} strokeWidth={2.5}
                fill="url(#pnlGradient)" dot={false}
                activeDot={{ r: 5, fill: '#2C5F8A', strokeWidth: 0 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    )
  }

  // ════════════════════════════════════════════════════════════════
  // ③ Per-account 分帳戶歷史
  // ════════════════════════════════════════════════════════════════
  const allValues = perAccountData.flatMap((row) =>
    accounts.map((a) => (row[a.id] as number) ?? 0)
  )
  const hasNegPA = Math.min(...allValues) < 0

  return (
    <div>
      <TabRow />
      <div className="flex flex-wrap gap-x-4 gap-y-1 mb-2">
        {accounts.map((acct) => {
          const color = ACCOUNT_COLOR_HEX[acct.color] ?? '#60A5FA'
          return (
            <div key={acct.id} className="flex items-center gap-1.5">
              <span className="w-3 h-0.5 rounded-full inline-block" style={{ background: color }} />
              <span className="text-[11px] text-slate-500">
                {acct.name}{acct.broker ? ` (${acct.broker})` : ''}
              </span>
            </div>
          )
        })}
      </div>
      <div className="h-52 sm:h-64">
        <ResponsiveContainer width="100%" height="100%" className="text-xs md:text-sm">
          <AreaChart data={perAccountData} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
            <defs>
              {accounts.map((acct) => {
                const color = ACCOUNT_COLOR_HEX[acct.color] ?? '#60A5FA'
                return (
                  <linearGradient key={acct.id} id={`grad_${acct.id}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={color} stopOpacity={0.2} />
                    <stop offset="95%" stopColor={color} stopOpacity={0.02} />
                  </linearGradient>
                )
              })}
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
            <XAxis dataKey="date" tick={{ fontSize: 9, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
            <YAxis
              tick={{ fontSize: 9, fill: '#94a3b8' }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => `${v >= 0 ? '' : '-'}$${formatMoney(Math.abs(v))}`}
              width={60}
            />
            {hasNegPA && (
              <ReferenceLine y={0} stroke="#cbd5e1" strokeDasharray="4 2" strokeWidth={1.5}
                label={{ value: '0', fill: '#94a3b8', fontSize: 10 }}
              />
            )}
            <Tooltip
              formatter={(value, name) => {
                const v = typeof value === 'number' ? value : 0
                const acct = accounts.find((a) => a.id === name)
                const label = acct ? `${acct.name} 損益` : String(name)
                return [`${v >= 0 ? '+' : '-'}$${formatMoney(Math.abs(v))}`, label]
              }}
              contentStyle={{ fontSize: 12, borderRadius: 10, border: '1px solid #e2e8f0', boxShadow: '0 4px 16px rgba(0,0,0,0.08)' }}
              cursor={{ stroke: '#94a3b8', strokeWidth: 1, strokeDasharray: '3 3' }}
            />
            {accounts.map((acct) => {
              const color = ACCOUNT_COLOR_HEX[acct.color] ?? '#60A5FA'
              return (
                <Area
                  key={acct.id}
                  type="monotone"
                  dataKey={acct.id}
                  stroke={color}
                  strokeWidth={2}
                  fill={`url(#grad_${acct.id})`}
                  dot={false}
                  activeDot={{ r: 4, fill: color, strokeWidth: 0 }}
                />
              )
            })}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
