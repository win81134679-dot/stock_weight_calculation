'use client'

/**
 * UsMonthlyPnLChart.tsx
 * 美股每月損益統計長條圖 — 對齊台股 MonthlyPnLChart
 */

import React, { useMemo } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { UsPnLSnapshot } from '@/lib/us-types'
import { formatUsd } from '@/lib/us-calculator'

interface Props {
  snapshots: UsPnLSnapshot[]
}

interface MonthlyData {
  month: string
  pnlUsd: number
  count: number
}

export default function UsMonthlyPnLChart({ snapshots }: Props) {
  const monthlyData = useMemo(() => {
    if (snapshots.length === 0) return []

    const grouped = new Map<string, { totalPnlUsd: number; count: number }>()

    snapshots.forEach((snapshot) => {
      const monthKey = snapshot.date.slice(0, 7) // YYYY-MM
      const existing = grouped.get(monthKey)
      if (existing) {
        existing.totalPnlUsd += snapshot.combinedPnlUsd
        existing.count += 1
      } else {
        grouped.set(monthKey, { totalPnlUsd: snapshot.combinedPnlUsd, count: 1 })
      }
    })

    const result: MonthlyData[] = []
    grouped.forEach((value, month) => {
      result.push({
        month,
        pnlUsd: Math.round((value.totalPnlUsd / value.count) * 100) / 100,
        count: value.count,
      })
    })

    return result.sort((a, b) => a.month.localeCompare(b.month))
  }, [snapshots])

  if (monthlyData.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-400">
        尚無月度損益資料
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={monthlyData} margin={{ top: 10, right: 10, left: 10, bottom: 20 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis
          dataKey="month"
          tick={{ fontSize: 11, fill: '#64748b' }}
          tickFormatter={(value: string) => value.slice(5)} // MM
        />
        <YAxis
          tick={{ fontSize: 11, fill: '#64748b' }}
          tickFormatter={(value: number) => `$${formatUsd(value)}`}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: 'rgba(255, 255, 255, 0.95)',
            border: '1px solid #e2e8f0',
            borderRadius: 8,
            fontSize: 12,
          }}
          formatter={(value: number) => [`USD ${formatUsd(value)}`, '月均損益']}
          labelFormatter={(label: string) => `${label}（月）`}
        />
        <Bar dataKey="pnlUsd" radius={[4, 4, 0, 0]}>
          {monthlyData.map((entry, index) => (
            <Cell key={index} fill={entry.pnlUsd >= 0 ? '#10b981' : '#ef4444'} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
