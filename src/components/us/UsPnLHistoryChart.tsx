'use client'

/**
 * UsPnLHistoryChart.tsx
 * 美股歷史損益折線圖 — 讀取 store.snapshots（每日快照）。
 * 可切換 USD / TWD 檢視。對齊台股 PnLHistoryChart 的版型（簡化版，無分帳戶 tab）。
 */

import React, { useMemo, useState } from 'react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts'
import { UsPnLSnapshot } from '@/lib/us-types'

interface Props {
  snapshots: UsPnLSnapshot[]
  onDeleteSnapshot?: (dateKey: string) => void
}

type Currency = 'usd' | 'twd'

function formatDate(iso: string): string {
  const d = new Date(iso)
  return `${d.getMonth() + 1}/${d.getDate()}`
}

export default function UsPnLHistoryChart({ snapshots, onDeleteSnapshot }: Props) {
  const [currency, setCurrency] = useState<Currency>('usd')

  const chartData = useMemo(() => {
    return snapshots
      .slice()
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((snapshot) => ({
        date: formatDate(snapshot.date),
        dateKey: snapshot.date.split('T')[0],
        pnl: currency === 'usd' ? snapshot.combinedPnlUsd : snapshot.combinedPnlTwd,
        pnlPct: snapshot.combinedPnlPct,
      }))
  }, [snapshots, currency])

  if (snapshots.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-sm text-slate-400 text-center px-4">
        尚無歷史快照。開啟總覽並有持倉資料後，系統會每日自動記錄一筆。
      </div>
    )
  }

  const prefix = currency === 'usd' ? 'USD ' : 'NT$'

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-end gap-1">
        {(['usd', 'twd'] as Currency[]).map((c) => (
          <button
            key={c}
            onClick={() => setCurrency(c)}
            className={`px-2.5 py-1 rounded-md text-xs font-medium ${
              currency === c ? 'bg-[#0F2E4E] text-white' : 'bg-slate-100 text-slate-500'
            }`}
          >
            {c === 'usd' ? 'USD' : 'TWD'}
          </button>
        ))}
      </div>
      <ResponsiveContainer width="100%" height={240}>
        <AreaChart data={chartData} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
          <defs>
            <linearGradient id="usPnlFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#2C5F8A" stopOpacity={0.4} />
              <stop offset="95%" stopColor="#2C5F8A" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
          <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#94a3b8' }} />
          <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} width={64} tickFormatter={(v: number) => `${prefix}${Math.round(v).toLocaleString()}`} />
          <ReferenceLine y={0} stroke="#cbd5e1" />
          <Tooltip
            formatter={(value) => [`${prefix}${Math.round(Number(value)).toLocaleString()}`, '組合損益']}
          />
          <Area type="monotone" dataKey="pnl" stroke="#2C5F8A" strokeWidth={2} fill="url(#usPnlFill)" />
        </AreaChart>
      </ResponsiveContainer>
      {onDeleteSnapshot && chartData.length > 0 && (
        <div className="text-right">
          <button
            onClick={() => onDeleteSnapshot(chartData[chartData.length - 1].dateKey)}
            className="text-[11px] text-slate-400 hover:text-red-500"
          >
            刪除最新一筆快照（{chartData[chartData.length - 1].dateKey}）
          </button>
        </div>
      )}
    </div>
  )
}
