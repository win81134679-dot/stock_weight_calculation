'use client'

/**
 * UsReturnDistributionChart.tsx
 * 美股報酬率分佈直方圖 — 對齊台股 ReturnDistributionChart
 */

import React, { useMemo } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { UsPnLSnapshot } from '@/lib/us-types'

interface Props {
  snapshots: UsPnLSnapshot[]
}

interface BucketData {
  range: string
  count: number
}

export default function UsReturnDistributionChart({ snapshots }: Props) {
  const buckets = useMemo(() => {
    if (snapshots.length === 0) return []

    const returns = snapshots.map((snapshot) => snapshot.combinedPnlPct).filter((pct) => !isNaN(pct))
    if (returns.length === 0) return []

    const bucketSize = 5 // 每 5% 一個區間
    const bucketMap = new Map<string, number>()

    returns.forEach((pct) => {
      const bucketIndex = Math.floor(pct / bucketSize)
      const rangeStart = bucketIndex * bucketSize
      const rangeEnd = rangeStart + bucketSize
      const key = `${rangeStart >= 0 ? '+' : ''}${rangeStart}% ~ ${rangeEnd >= 0 ? '+' : ''}${rangeEnd}%`
      bucketMap.set(key, (bucketMap.get(key) ?? 0) + 1)
    })

    const result: BucketData[] = []
    bucketMap.forEach((count, range) => {
      result.push({ range, count })
    })

    return result.sort((a, b) => {
      const aStart = parseInt(a.range.split('%')[0].replace('+', ''), 10)
      const bStart = parseInt(b.range.split('%')[0].replace('+', ''), 10)
      return aStart - bStart
    })
  }, [snapshots])

  if (buckets.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-400">
        尚無報酬率分佈資料
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={280} className="text-xs md:text-sm">
      <BarChart data={buckets} margin={{ top: 10, right: 5, left: 0, bottom: 30 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis
          dataKey="range"
          tick={{ fontSize: 10, fill: '#64748b' }}
          angle={-15}
          textAnchor="end"
          height={60}
        />
        <YAxis tick={{ fontSize: 11, fill: '#64748b' }} />
        <Tooltip
          contentStyle={{
            backgroundColor: 'rgba(255, 255, 255, 0.95)',
            border: '1px solid #e2e8f0',
            borderRadius: 8,
            fontSize: 12,
          }}
          formatter={(value: number) => [`${value} 天`, '落在此區間']}
        />
        <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}
