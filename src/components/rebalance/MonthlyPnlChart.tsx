'use client'

/**
 * MonthlyPnlChart.tsx
 * 月度損益 bar chart：X=月份，Y=本月末 vs 月初 combinedValue Δ
 * 正值綠、負值紅
 */

import React, { useMemo } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Cell,
} from 'recharts'
import { PnLSnapshot } from '@/lib/types'
import { formatMoney } from '@/lib/calculator'

interface Props {
  snapshots: PnLSnapshot[]
  accountId: string | null
}

function getYYYYMM(isoDate: string): string {
  return isoDate.slice(0, 7) // 'YYYY-MM'
}

function formatMonth(yyyymm: string): string {
  const m = yyyymm.split('-')[1]
  return `${m}月`
}

interface MonthBar {
  label: string
  yyyymm: string
  delta: number
  startVal: number
  endVal: number
}

export default function MonthlyPnlChart({ snapshots, accountId }: Props) {
  const data = useMemo((): MonthBar[] => {
    if (snapshots.length < 2) return []

    const sorted = [...snapshots].sort((a, b) => a.date.localeCompare(b.date))

    const getVal = (s: PnLSnapshot) =>
      accountId
        ? (s.accounts.find((a) => a.accountId === accountId)?.totalValue ?? 0)
        : s.combinedValue

    // Group by YYYY-MM, keep first and last snapshot of each month
    const byMonth = new Map<string, { first: PnLSnapshot; last: PnLSnapshot }>()
    for (const s of sorted) {
      const key = getYYYYMM(s.date)
      const entry = byMonth.get(key)
      if (!entry) {
        byMonth.set(key, { first: s, last: s })
      } else {
        byMonth.set(key, { first: entry.first, last: s })
      }
    }

    const months = Array.from(byMonth.entries()).sort((a, b) => a[0].localeCompare(b[0]))

    // Calculate month-over-month delta:
    // For each month, compare end of month vs end of previous month (or start of first month)
    const monthEnds = months.map(([yyyymm, { last }]) => ({
      yyyymm,
      endVal: getVal(last),
    }))

    return monthEnds.slice(1).map((cur, idx) => {
      const prev = monthEnds[idx]
      return {
        label: formatMonth(cur.yyyymm),
        yyyymm: cur.yyyymm,
        delta: cur.endVal - prev.endVal,
        startVal: prev.endVal,
        endVal: cur.endVal,
      }
    })
  }, [snapshots, accountId])

  if (data.length === 0) {
    return (
      <div className="h-40 flex items-center justify-center text-slate-300 text-sm">
        需要至少跨月的 2 個快照
      </div>
    )
  }

  const maxAbs = Math.max(...data.map((d) => Math.abs(d.delta)), 1)

  return (
    <div className="h-48 sm:h-56">
      <ResponsiveContainer width="100%" height="100%" className="text-xs md:text-sm">
        <BarChart data={data} margin={{ top: 6, right: 4, left: 0, bottom: 0 }} barSize={20}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 10, fill: '#94a3b8' }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            tick={{ fontSize: 9, fill: '#94a3b8' }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v) => `${v >= 0 ? '' : '-'}$${formatMoney(Math.abs(v))}`}
            domain={[-maxAbs * 1.2, maxAbs * 1.2]}
            width={60}
          />
          <ReferenceLine y={0} stroke="#cbd5e1" strokeWidth={1.5} />
          <Tooltip
            formatter={(value) => {
              const v = typeof value === 'number' ? value : 0
              return [`${v >= 0 ? '+' : '-'}$${formatMoney(Math.abs(v))}`, '月度損益']
            }}
            labelFormatter={(label) => `${label}`}
            contentStyle={{ fontSize: 12, borderRadius: 10, border: '1px solid #e2e8f0', boxShadow: '0 4px 16px rgba(0,0,0,0.08)' }}
          />
          <Bar dataKey="delta" radius={[4, 4, 0, 0]}>
            {data.map((d, idx) => (
              <Cell key={idx} fill={d.delta >= 0 ? '#34D399' : '#F87171'} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
