'use client'

/**
 * DrawdownChart.tsx
 * 回撤水位圖 — 面積圖，Y 軸恆 ≤ 0，填充紅色
 * 公式：drawdown[i] = (value[i] - runningPeak) / runningPeak * 100
 */

import React, { useMemo } from 'react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts'
import { PnLSnapshot } from '@/lib/types'
import { formatMoney } from '@/lib/calculator'

interface Props {
  snapshots: PnLSnapshot[]
  accountId: string | null
}

export default function DrawdownChart({ snapshots, accountId }: Props) {
  const data = useMemo(() => {
    if (snapshots.length < 2) return []
    const sorted = [...snapshots].sort((a, b) => a.date.localeCompare(b.date))

    const getVal = (s: PnLSnapshot) =>
      accountId
        ? (s.accounts.find((a) => a.accountId === accountId)?.totalValue ?? 0)
        : s.combinedValue

    let peak = 0
    return sorted.map((s) => {
      const v = getVal(s)
      if (v > peak) peak = v
      const dd = peak > 0 ? ((v - peak) / peak) * 100 : 0
      const d = new Date(s.date)
      const label = `${d.getMonth() + 1}/${d.getDate()}`
      return { label, dd, value: v, peak }
    })
  }, [snapshots, accountId])

  if (data.length < 2) {
    return (
      <div className="h-40 flex items-center justify-center text-slate-300 text-sm">
        需要 ≥2 個快照才能計算回撤
      </div>
    )
  }

  const minDD = Math.min(...data.map((d) => d.dd))
  const currentDD = data[data.length - 1].dd

  return (
    <div>
      {/* 摘要 */}
      <div className="flex gap-4 mb-2">
        <div>
          <p className="text-[10px] text-slate-400 uppercase tracking-wider">當前回撤</p>
          <p className={`text-sm font-mono font-bold ${currentDD < -5 ? 'text-red-500' : currentDD < -2 ? 'text-amber-500' : 'text-emerald-600'}`}>
            {currentDD.toFixed(2)}%
          </p>
        </div>
        <div>
          <p className="text-[10px] text-slate-400 uppercase tracking-wider">最大回撤 (MDD)</p>
          <p className={`text-sm font-mono font-bold ${minDD < -10 ? 'text-red-500' : minDD < -5 ? 'text-amber-500' : 'text-slate-600'}`}>
            {minDD.toFixed(2)}%
          </p>
        </div>
        <div>
          <p className="text-[10px] text-slate-400 uppercase tracking-wider">歷史高點</p>
          <p className="text-sm font-mono font-bold text-slate-600">
            ${formatMoney(Math.max(...data.map((d) => d.peak)))}
          </p>
        </div>
      </div>

      <div className="h-44">
        <ResponsiveContainer width="100%" height="100%" className="text-xs md:text-sm">
          <AreaChart data={data} margin={{ top: 6, right: 4, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="ddGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#ef4444" stopOpacity={0.30} />
                <stop offset="95%" stopColor="#ef4444" stopOpacity={0.04} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 9, fill: '#94a3b8' }}
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fontSize: 9, fill: '#94a3b8' }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => `${v.toFixed(0)}%`}
              domain={[Math.min(minDD * 1.2, -0.5), 0.5]}
              width={44}
            />
            <ReferenceLine y={0} stroke="#cbd5e1" strokeWidth={1.5} />
            {minDD < -5 && (
              <ReferenceLine
                y={-5}
                stroke="#fbbf24"
                strokeDasharray="4 2"
                strokeWidth={1}
                label={{ value: '-5%', fill: '#f59e0b', fontSize: 9, position: 'insideTopRight' }}
              />
            )}
            {minDD < -10 && (
              <ReferenceLine
                y={-10}
                stroke="#ef4444"
                strokeDasharray="4 2"
                strokeWidth={1}
                label={{ value: '-10%', fill: '#dc2626', fontSize: 9, position: 'insideTopRight' }}
              />
            )}
            <Tooltip
              formatter={(v) => {
                const val = typeof v === 'number' ? v : 0
                return [`${val.toFixed(2)}%`, '回撤幅度']
              }}
              contentStyle={{ fontSize: 12, borderRadius: 10, border: '1px solid #e2e8f0', boxShadow: '0 4px 16px rgba(0,0,0,0.08)' }}
              cursor={{ stroke: '#ef4444', strokeWidth: 1, strokeDasharray: '3 3' }}
            />
            <Area
              type="monotone"
              dataKey="dd"
              stroke="#ef4444"
              strokeWidth={2}
              fill="url(#ddGrad)"
              dot={false}
              activeDot={{ r: 4, fill: '#dc2626', strokeWidth: 0 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
