'use client'

/**
 * UsStockContributionChart.tsx
 * 美股個股損益貢獻圖 — 對齊台股 StockContributionChart
 * 堆疊長條圖顯示各標的對總損益的貢獻（正/負）
 */

import React, { useMemo } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'
import { formatUsd } from '@/lib/us-calculator'

interface ContributionData {
  symbol: string
  name: string
  pnlUsd: number
}

interface Props {
  data: ContributionData[]
}

export default function UsStockContributionChart({ data }: Props) {
  const chartData = useMemo(() => {
    if (data.length === 0) return []

    return data
      .map((item) => ({
        symbol: item.symbol,
        name: item.name,
        positive: item.pnlUsd > 0 ? item.pnlUsd : 0,
        negative: item.pnlUsd < 0 ? Math.abs(item.pnlUsd) : 0,
        total: item.pnlUsd,
      }))
      .sort((a, b) => b.total - a.total)
  }, [data])

  if (chartData.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-400">
        尚無個股損益資料
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={320} className="text-xs md:text-sm">
      <BarChart data={chartData} margin={{ top: 10, right: 10, left: 10, bottom: 30 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis
          dataKey="symbol"
          tick={{ fontSize: 10, fill: '#64748b' }}
          angle={-15}
          textAnchor="end"
          height={60}
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
          formatter={(value: number, name: string) => {
            const displayName = name === 'positive' ? '獲利' : '虧損'
            return [`USD ${formatUsd(value)}`, displayName]
          }}
          labelFormatter={(label: string) => {
            const item = chartData.find((d) => d.symbol === label)
            return item ? `${item.symbol} - ${item.name}` : label
          }}
        />
        <ReferenceLine y={0} stroke="#94a3b8" strokeWidth={1.5} />
        <Bar dataKey="positive" stackId="contribution" fill="#10b981" radius={[4, 4, 0, 0]} />
        <Bar dataKey="negative" stackId="contribution" fill="#ef4444" radius={[0, 0, 4, 4]} />
      </BarChart>
    </ResponsiveContainer>
  )
}
