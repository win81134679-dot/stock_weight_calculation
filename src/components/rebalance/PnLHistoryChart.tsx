'use client'

/**
 * PnLHistoryChart.tsx
 * Area chart of PnL snapshots over time using Recharts.
 * v3: multi-account overlay mode + toggle pill.
 */

import React, { useMemo, useState } from 'react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts'
import { Account, PnLSnapshot } from '@/lib/types'
import { formatMoney } from '@/lib/calculator'

// Account color hex map (matches AccountManager tailwind colors)
const ACCOUNT_COLOR_HEX: Record<string, string> = {
  blue:   '#60A5FA',
  green:  '#34D399',
  yellow: '#FBBF24',
  purple: '#A78BFA',
  pink:   '#F472B6',
  orange: '#FB923C',
  teal:   '#2DD4BF',
}

interface Props {
  snapshots: PnLSnapshot[]
  accountId: string | null  // null = combined
  accounts?: Account[]      // needed for per-account mode
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return `${d.getMonth() + 1}/${d.getDate()}`
}

export default function PnLHistoryChart({ snapshots, accountId, accounts = [] }: Props) {
  const [mode, setMode] = useState<'combined' | 'per-account'>('combined')

  // Combined mode data (existing behavior)
  const combinedData = useMemo(() => {
    return snapshots
      .slice()
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((s) => {
        if (!accountId) {
          return { date: formatDate(s.date), pnl: s.combinedPnl }
        }
        const acc = s.accounts.find((a) => a.accountId === accountId)
        return { date: formatDate(s.date), pnl: acc?.totalPnl ?? 0 }
      })
  }, [snapshots, accountId])

  // Per-account mode data: one key per account
  const perAccountData = useMemo(() => {
    const sorted = snapshots.slice().sort((a, b) => a.date.localeCompare(b.date))
    return sorted.map((s) => {
      const row: Record<string, number | string> = { date: formatDate(s.date) }
      for (const acct of accounts) {
        const snap = s.accounts.find((a) => a.accountId === acct.id)
        row[acct.id] = snap?.totalPnl ?? 0
      }
      return row
    })
  }, [snapshots, accounts])

  const hasMultiAccounts = accounts.length > 1
  const showToggle = hasMultiAccounts && accountId === null

  if (combinedData.length < 2) return null

  // Combined mode rendering
  if (mode === 'combined' || !showToggle) {
    const minPnl = Math.min(...combinedData.map((d) => d.pnl))
    const maxPnl = Math.max(...combinedData.map((d) => d.pnl))
    const hasNeg = minPnl < 0
    const areaColor = minPnl >= 0 ? '#4A90C4' : (maxPnl < 0 ? '#ef4444' : '#4A90C4')

    return (
      <div>
        {showToggle && (
          <div className="flex gap-1 mb-3">
            <button
              onClick={() => setMode('combined')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${
                mode === 'combined' ? 'bg-[#2C5F8A] text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
              }`}
            >
              合併
            </button>
            <button
              onClick={() => setMode('per-account')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${
                mode === 'per-account' ? 'bg-[#2C5F8A] text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
              }`}
            >
              分帳戶
            </button>
          </div>
        )}
        <div className="h-52 sm:h-64">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={combinedData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="pnlGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={areaColor} stopOpacity={0.25} />
                  <stop offset="95%" stopColor={areaColor} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
              <YAxis
                tick={{ fontSize: 10, fill: '#94a3b8' }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => `${v >= 0 ? '' : '-'}$${formatMoney(Math.abs(v))}`}
                width={68}
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

  // Per-account mode
  const allValues = perAccountData.flatMap((row) =>
    accounts.map((a) => (row[a.id] as number) ?? 0)
  )
  const hasNegPA = Math.min(...allValues) < 0

  return (
    <div>
      <div className="flex gap-1 mb-3">
        <button
          onClick={() => setMode('combined')}
          className="px-3 py-1 rounded-lg text-xs font-semibold bg-slate-100 text-slate-500 hover:bg-slate-200 transition-colors"
        >
          合併
        </button>
        <button
          onClick={() => setMode('per-account')}
          className="px-3 py-1 rounded-lg text-xs font-semibold bg-[#2C5F8A] text-white transition-colors"
        >
          分帳戶
        </button>
      </div>

      {/* Per-account legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 mb-2">
        {accounts.map((acct) => {
          const color = ACCOUNT_COLOR_HEX[acct.color] ?? '#60A5FA'
          return (
            <div key={acct.id} className="flex items-center gap-1.5">
              <span className="w-3 h-0.5 rounded-full inline-block" style={{ background: color }} />
              <span className="text-[11px] text-slate-500">{acct.name}{acct.broker ? ` (${acct.broker})` : ''}</span>
            </div>
          )
        })}
      </div>

      <div className="h-52 sm:h-64">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={perAccountData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
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
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
            <YAxis
              tick={{ fontSize: 10, fill: '#94a3b8' }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => `${v >= 0 ? '' : '-'}$${formatMoney(Math.abs(v))}`}
              width={68}
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


