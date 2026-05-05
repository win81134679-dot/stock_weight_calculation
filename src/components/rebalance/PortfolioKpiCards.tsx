'use client'

/**
 * PortfolioKpiCards.tsx
 * 5 KPI 摘要卡片：總資產 / 今日損益 / 年化報酬率 / 最大回撤 / 勝率
 * 每卡含 mini sparkline（Recharts LineChart）
 */

import React, { useMemo } from 'react'
import { LineChart, Line, ResponsiveContainer, Tooltip } from 'recharts'
import { PnLSnapshot } from '@/lib/types'
import { formatMoney } from '@/lib/calculator'
import type { TickerItem } from './HoldingTickerBoard'

interface Props {
  snapshots: PnLSnapshot[]
  tickerItems: TickerItem[]
  accountId: string | null   // null = 合併
}

function Sparkline({ data, color }: { data: number[]; color: string }) {
  const chartData = data.map((v, i) => ({ i, v }))
  return (
    <ResponsiveContainer width="100%" height={36}>
      <LineChart data={chartData}>
        <Line
          type="monotone"
          dataKey="v"
          stroke={color}
          strokeWidth={1.8}
          dot={false}
          isAnimationActive={false}
        />
        <Tooltip
          formatter={(v) => [`$${formatMoney(Number(v))}`, '']}
          contentStyle={{ fontSize: 10, borderRadius: 8, border: '1px solid #e2e8f0', padding: '2px 6px' }}
          itemStyle={{ color }}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}

function KpiCard({
  label,
  value,
  sub,
  isPositive,
  sparkData,
  sparkColor,
  note,
}: {
  label: string
  value: string
  sub?: string
  isPositive?: boolean
  sparkData?: number[]
  sparkColor?: string
  note?: string
}) {
  const subColor =
    isPositive === undefined
      ? 'text-slate-400'
      : isPositive
      ? 'text-emerald-600'
      : 'text-red-500'

  return (
    <div className="glass-card p-4 animate-fade-up flex flex-col gap-1">
      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">{label}</p>
      <p className="text-xl font-black font-mono text-[#1A1A2E] leading-tight">{value}</p>
      {sub && <p className={`text-xs font-semibold ${subColor}`}>{sub}</p>}
      {note && <p className="text-[10px] text-slate-300">{note}</p>}
      {sparkData && sparkData.length >= 2 && sparkColor && (
        <div className="mt-1 -mx-1">
          <Sparkline data={sparkData} color={sparkColor} />
        </div>
      )}
    </div>
  )
}

// 計算年化報酬率：(endVal/startVal)^(365/days) - 1
function calcAnnualizedReturn(startValue: number, endValue: number, days: number): number | null {
  if (startValue <= 0 || days < 7) return null
  return (Math.pow(endValue / startValue, 365 / days) - 1) * 100
}

// 計算最大回撤 (MDD) from a series of values
function calcMDD(values: number[]): number {
  if (values.length < 2) return 0
  let peak = values[0]
  let mdd = 0
  for (const v of values) {
    if (v > peak) peak = v
    const dd = peak > 0 ? (v - peak) / peak : 0
    if (dd < mdd) mdd = dd
  }
  return mdd * 100 // 返回負百分比
}

export default function PortfolioKpiCards({ snapshots, tickerItems, accountId }: Props) {
  const sorted = useMemo(
    () => [...snapshots].sort((a, b) => a.date.localeCompare(b.date)),
    [snapshots]
  )

  const getValue = (s: PnLSnapshot): number => {
    if (!accountId) return s.combinedValue
    return s.accounts.find((a) => a.accountId === accountId)?.totalValue ?? 0
  }

  const values = useMemo(() => sorted.map(getValue), [sorted, accountId])

  // 今日損益（來自 tickerItems）
  const todayTotal = tickerItems.reduce((s, i) => s + i.todayChange, 0)
  const isTodayUp = todayTotal >= 0

  // 年化報酬率
  const annReturn = useMemo(() => {
    if (sorted.length < 2) return null
    const first = sorted[0]
    const last = sorted[sorted.length - 1]
    const days = Math.round(
      (new Date(last.date).getTime() - new Date(first.date).getTime()) / 86_400_000
    )
    return calcAnnualizedReturn(getValue(first), getValue(last), days)
  }, [sorted, accountId])

  // MDD
  const mdd = useMemo(() => calcMDD(values), [values])

  // 勝率：快照數日漲天數 / (總快照數 - 1)
  const winRate = useMemo(() => {
    if (values.length < 2) return null
    let wins = 0
    for (let i = 1; i < values.length; i++) {
      if (values[i] >= values[i - 1]) wins++
    }
    return (wins / (values.length - 1)) * 100
  }, [values])

  // Sharpe ratio（以日為單位，無風險利率 0）
  const sharpe = useMemo(() => {
    if (values.length < 10) return null
    const dailyReturns: number[] = []
    for (let i = 1; i < values.length; i++) {
      if (values[i - 1] > 0) {
        dailyReturns.push((values[i] - values[i - 1]) / values[i - 1])
      }
    }
    if (dailyReturns.length < 5) return null
    const mean = dailyReturns.reduce((s, r) => s + r, 0) / dailyReturns.length
    const variance = dailyReturns.reduce((s, r) => s + (r - mean) ** 2, 0) / dailyReturns.length
    const std = Math.sqrt(variance)
    if (std === 0) return null
    return (mean / std) * Math.sqrt(252)
  }, [values])

  const hasHistory = sorted.length >= 2
  const latest = sorted[sorted.length - 1]
  const latestVal = latest ? getValue(latest) : 0

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      {/* 1. 總資產淨值 */}
      <KpiCard
        label="總資產淨值"
        value={`$${formatMoney(latestVal)}`}
        sub={hasHistory ? `共 ${sorted.length} 個快照` : '尚無歷史快照'}
        sparkData={values}
        sparkColor="#2C5F8A"
      />

      {/* 2. 今日損益 */}
      <KpiCard
        label="今日損益"
        value={`${isTodayUp ? '+' : ''}$${formatMoney(Math.abs(todayTotal))}`}
        sub={
          tickerItems.length > 0
            ? `${tickerItems.filter((i) => i.todayChange > 0).length}漲 ${tickerItems.filter((i) => i.todayChange < 0).length}跌`
            : '無持倉'
        }
        isPositive={isTodayUp}
        sparkData={values.slice(-10)}
        sparkColor={isTodayUp ? '#10b981' : '#ef4444'}
      />

      {/* 3. 年化報酬率 */}
      <KpiCard
        label="年化報酬率"
        value={
          annReturn !== null
            ? `${annReturn >= 0 ? '+' : ''}${annReturn.toFixed(1)}%`
            : '—'
        }
        sub={
          annReturn !== null
            ? `${sorted.length < 30 ? '（快照數少，僅供參考）' : '歷史估算'}`
            : sorted.length < 2 ? '需要 ≥2 個快照' : '計算中'
        }
        isPositive={annReturn !== null ? annReturn >= 0 : undefined}
        note={sorted.length < 30 ? `僅 ${sorted.length} 筆，精準度有限` : undefined}
      />

      {/* 4. 最大回撤 MDD */}
      <KpiCard
        label="最大回撤 (MDD)"
        value={hasHistory ? `${mdd.toFixed(1)}%` : '—'}
        sub={hasHistory ? (mdd < -5 ? '注意風險' : mdd < -2 ? '輕微回撤' : '健康') : '需要快照'}
        isPositive={mdd >= -5}
        sparkData={
          hasHistory
            ? (() => {
                let peak = values[0]
                return values.map((v) => {
                  if (v > peak) peak = v
                  return peak > 0 ? ((v - peak) / peak) * 100 : 0
                })
              })()
            : undefined
        }
        sparkColor="#ef4444"
      />

      {/* 5. 勝率 + Sharpe */}
      <KpiCard
        label="勝率"
        value={winRate !== null ? `${winRate.toFixed(0)}%` : '—'}
        sub={
          sharpe !== null
            ? `Sharpe ${sharpe.toFixed(2)}`
            : winRate !== null
            ? `${values.length - 1} 個交易日`
            : '需要快照'
        }
        isPositive={winRate !== null ? winRate >= 50 : undefined}
        note={sharpe === null && values.length >= 2 ? `（Sharpe 需 ≥10 筆快照）` : undefined}
      />
    </div>
  )
}
