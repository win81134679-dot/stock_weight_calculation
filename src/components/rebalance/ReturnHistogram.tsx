'use client'

/**
 * ReturnHistogram.tsx
 * 日報酬率分布直方圖（Phase 3）
 * X = 日報酬率區間，Y = 天數（快照 Δ%）
 * 附常態分布曲線疊加
 */

import React, { useMemo } from 'react'
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine, Cell,
} from 'recharts'
import { PnLSnapshot } from '@/lib/types'

interface Props {
  snapshots: PnLSnapshot[]
  accountId: string | null
  bucketWidth?: number // 每個 bucket 的寬度（%），預設 0.5
}

interface Bucket {
  label: string
  rangeMin: number
  rangeMax: number
  count: number
  normalY?: number
}

// 常態分布 PDF
function normalPdf(x: number, mean: number, std: number): number {
  if (std === 0) return 0
  return (1 / (std * Math.sqrt(2 * Math.PI))) * Math.exp(-0.5 * ((x - mean) / std) ** 2)
}

export default function ReturnHistogram({ snapshots, accountId, bucketWidth = 0.5 }: Props) {
  const { buckets, mean, std, n } = useMemo(() => {
    if (snapshots.length < 3) return { buckets: [], mean: 0, std: 0, n: 0 }

    const sorted = [...snapshots].sort((a, b) => a.date.localeCompare(b.date))
    const getVal = (s: PnLSnapshot) =>
      accountId
        ? (s.accounts.find((a) => a.accountId === accountId)?.totalValue ?? 0)
        : s.combinedValue

    const dailyReturns: number[] = []
    for (let i = 1; i < sorted.length; i++) {
      const prev = getVal(sorted[i - 1])
      const cur = getVal(sorted[i])
      if (prev > 0) dailyReturns.push(((cur - prev) / prev) * 100)
    }

    if (dailyReturns.length === 0) return { buckets: [], mean: 0, std: 0, n: 0 }

    const mean = dailyReturns.reduce((s, r) => s + r, 0) / dailyReturns.length
    const variance = dailyReturns.reduce((s, r) => s + (r - mean) ** 2, 0) / dailyReturns.length
    const std = Math.sqrt(variance)

    // Build buckets
    const minR = Math.min(...dailyReturns)
    const maxR = Math.max(...dailyReturns)
    const bucketMin = Math.floor(minR / bucketWidth) * bucketWidth
    const bucketMax = Math.ceil(maxR / bucketWidth) * bucketWidth

    const bucketsArr: Bucket[] = []
    for (let lo = bucketMin; lo < bucketMax; lo = +(lo + bucketWidth).toFixed(6)) {
      const hi = +(lo + bucketWidth).toFixed(6)
      const count = dailyReturns.filter((r) => r >= lo && r < hi).length
      const midpoint = (lo + hi) / 2
      bucketsArr.push({
        label: `${lo >= 0 ? '+' : ''}${lo.toFixed(1)}%`,
        rangeMin: lo,
        rangeMax: hi,
        count,
        normalY: normalPdf(midpoint, mean, std) * bucketWidth * dailyReturns.length,
      })
    }

    return { buckets: bucketsArr, mean, std, n: dailyReturns.length }
  }, [snapshots, accountId, bucketWidth])

  if (buckets.length === 0) {
    return (
      <div className="h-40 flex items-center justify-center text-slate-300 text-sm">
        需要 ≥3 個快照計算日報酬分布
      </div>
    )
  }

  return (
    <div>
      {/* stats row */}
      <div className="flex gap-4 mb-2">
        <div>
          <p className="text-[10px] text-slate-400 uppercase tracking-wider">平均日報酬</p>
          <p className={`text-sm font-mono font-bold ${mean >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
            {mean >= 0 ? '+' : ''}{mean.toFixed(3)}%
          </p>
        </div>
        <div>
          <p className="text-[10px] text-slate-400 uppercase tracking-wider">標準差 (σ)</p>
          <p className="text-sm font-mono font-bold text-slate-600">{std.toFixed(3)}%</p>
        </div>
        <div>
          <p className="text-[10px] text-slate-400 uppercase tracking-wider">樣本數</p>
          <p className="text-sm font-mono font-bold text-slate-600">{n} 天</p>
        </div>
        <div>
          <p className="text-[10px] text-slate-400 uppercase tracking-wider">年化波動率</p>
          <p className="text-sm font-mono font-bold text-slate-600">{(std * Math.sqrt(252)).toFixed(1)}%</p>
        </div>
      </div>

      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={buckets} margin={{ top: 6, right: 8, left: 0, bottom: 0 }} barSize={16}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 9, fill: '#94a3b8' }}
              tickLine={false}
              axisLine={false}
              interval={1}
            />
            <YAxis
              tick={{ fontSize: 10, fill: '#94a3b8' }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => `${v}天`}
              width={40}
            />
            <ReferenceLine x={`${mean >= 0 ? '+' : ''}${(Math.round(mean / bucketWidth) * bucketWidth).toFixed(1)}%`}
              stroke="#2C5F8A" strokeDasharray="3 2" strokeWidth={1.5}
              label={{ value: 'μ', fill: '#2C5F8A', fontSize: 10, position: 'insideTopRight' }}
            />
            <Tooltip
              formatter={(value, name) => [
                name === 'count' ? `${value} 天` : typeof value === 'number' ? value.toFixed(2) : value,
                name === 'count' ? '天數' : '常態曲線',
              ]}
              contentStyle={{ fontSize: 11, borderRadius: 10, border: '1px solid #e2e8f0', boxShadow: '0 4px 16px rgba(0,0,0,0.08)' }}
            />
            <Bar dataKey="count" radius={[3, 3, 0, 0]}>
              {buckets.map((b, idx) => (
                <Cell
                  key={idx}
                  fill={b.rangeMin >= 0 ? '#34D399' : '#F87171'}
                  fillOpacity={0.85}
                />
              ))}
            </Bar>
            {/* 常態分布曲線 */}
            <Line
              type="monotone"
              dataKey="normalY"
              stroke="#2C5F8A"
              strokeWidth={2}
              dot={false}
              strokeDasharray="4 2"
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      {n < 30 && (
        <p className="text-[10px] text-slate-300 mt-1">
          ⚠ 樣本數 {n} 筆（建議 ≥30 筆才具統計意義）
        </p>
      )}
    </div>
  )
}
