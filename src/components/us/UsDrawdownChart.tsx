'use client'

/**
 * UsDrawdownChart.tsx
 * 美股回撤（drawdown）水位圖 — 由 snapshots 的組合市值序列計算自高點回落 %。
 */

import React, { useMemo } from 'react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import { UsPnLSnapshot } from '@/lib/us-types'

interface Props {
  snapshots: UsPnLSnapshot[]
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return `${d.getMonth() + 1}/${d.getDate()}`
}

export default function UsDrawdownChart({ snapshots }: Props) {
  const data = useMemo(() => {
    const sorted = snapshots.slice().sort((a, b) => a.date.localeCompare(b.date))
    let peak = 0
    return sorted.map((snapshot) => {
      const value = snapshot.combinedValueUsd
      if (value > peak) peak = value
      const drawdown = peak > 0 ? ((value - peak) / peak) * 100 : 0
      return { date: formatDate(snapshot.date), drawdown: Math.round(drawdown * 100) / 100 }
    })
  }, [snapshots])

  if (snapshots.length < 2) {
    return (
      <div className="flex items-center justify-center h-40 text-sm text-slate-400">
        需要至少兩日快照才能計算回撤
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={200}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
        <defs>
          <linearGradient id="usDrawdownFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#ef4444" stopOpacity={0.35} />
            <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
        <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#94a3b8' }} />
        <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} width={48} tickFormatter={(v: number) => `${v}%`} />
        <Tooltip formatter={(value) => [`${Number(value).toFixed(2)}%`, '回撤']} />
        <Area type="monotone" dataKey="drawdown" stroke="#ef4444" strokeWidth={2} fill="url(#usDrawdownFill)" />
      </AreaChart>
    </ResponsiveContainer>
  )
}
