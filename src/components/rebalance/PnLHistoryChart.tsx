'use client'

/**
 * PnLHistoryChart.tsx
 * Line chart of PnL snapshots over time using Recharts.
 */

import React, { useMemo } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts'
import { PnLSnapshot } from '@/lib/types'
import { formatMoney } from '@/lib/calculator'

interface Props {
  snapshots: PnLSnapshot[]
  accountId: string | null  // null = combined
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return `${d.getMonth() + 1}/${d.getDate()}`
}

export default function PnLHistoryChart({ snapshots, accountId }: Props) {
  const data = useMemo(() => {
    return snapshots
      .slice()
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((s) => {
        if (!accountId) {
          return {
            date: formatDate(s.date),
            pnl: s.combinedPnl,
            pct: s.combinedPnlPct,
          }
        }
        const acc = s.accounts.find((a) => a.accountId === accountId)
        return {
          date: formatDate(s.date),
          pnl: acc?.totalPnl ?? 0,
          pct: acc?.pnlPct ?? 0,
        }
      })
  }, [snapshots, accountId])

  if (data.length < 2) return null

  const minPnl = Math.min(...data.map((d) => d.pnl))
  const hasNeg = minPnl < 0

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="h-48 sm:h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 11, fill: '#94a3b8' }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              tick={{ fontSize: 11, fill: '#94a3b8' }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => `${v >= 0 ? '' : '-'}$${formatMoney(Math.abs(v))}`}
              width={72}
            />
            {hasNeg && <ReferenceLine y={0} stroke="#cbd5e1" strokeDasharray="4 2" />}
            <Tooltip
              formatter={(value, name) => {
                const v = typeof value === 'number' ? value : 0
                if (name === 'pnl') return [`${v >= 0 ? '+' : ''}$${formatMoney(Math.abs(v))}`, '損益']
                return [`${v >= 0 ? '+' : ''}${v.toFixed(2)}%`, '損益%']
              }}
              contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}
            />
            <Line
              type="monotone"
              dataKey="pnl"
              stroke="#4A90C4"
              strokeWidth={2}
              dot={data.length <= 30}
              activeDot={{ r: 4, fill: '#2C5F8A' }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
