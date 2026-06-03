'use client'

/**
 * UsHoldingRankChart.tsx
 * 美股持股市值排行圖 — 對齊台股 HoldingRankChart
 * 水平長條圖顯示各標的市值佔比
 */

import React from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { formatUsd } from '@/lib/us-calculator'

interface RankData {
  symbol: string
  name: string
  valueUsd: number
  weightPct: number
}

interface Props {
  data: RankData[]
}

const COLORS = ['#2C5F8A', '#4A90C4', '#60A5FA', '#34D399', '#F59E0B', '#F87171', '#A78BFA', '#FB923C']

export default function UsHoldingRankChart({ data }: Props) {
  if (data.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-400">
        尚無持股資料
      </div>
    )
  }

  const sorted = [...data].sort((a, b) => b.valueUsd - a.valueUsd).slice(0, 10)

  return (
    <ResponsiveContainer width="100%" height={Math.max(sorted.length * 50 + 40, 280)} className="text-xs md:text-sm">
      <BarChart
        data={sorted}
        layout="vertical"
        margin={{ top: 10, right: 10, left: 5, bottom: 10 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis
          type="number"
          tick={{ fontSize: 11, fill: '#64748b' }}
          tickFormatter={(value: number) => `$${formatUsd(value)}`}
        />
        <YAxis
          type="category"
          dataKey="symbol"
          tick={{ fontSize: 11, fill: '#64748b' }}
          width={60}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: 'rgba(255, 255, 255, 0.95)',
            border: '1px solid #e2e8f0',
            borderRadius: 8,
            fontSize: 12,
          }}
          formatter={(value) => {
            const v = typeof value === 'number' ? value : 0
            return [`USD ${formatUsd(v)}`, '市值']
          }}
          labelFormatter={(label) => {
            const item = sorted.find((d) => d.symbol === String(label))
            return item ? `${item.symbol} - ${item.name}` : String(label)
          }}
        />
        <Bar dataKey="valueUsd" radius={[0, 4, 4, 0]}>
          {sorted.map((entry, index) => (
            <Cell key={index} fill={COLORS[index % COLORS.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
