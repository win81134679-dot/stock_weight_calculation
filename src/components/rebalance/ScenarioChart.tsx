'use client'

/**
 * ScenarioChart.tsx
 * 情境模擬圖：以昨收為基準，顯示整體投資組合在 -10% ~ +10% 各漲跌幅下的總市值變化。
 * 以折線圖呈現，並在圖上標記今日實際漲跌位置。
 */

import React, { useMemo } from 'react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from 'recharts'
import { Holding, PriceCache, TargetWeight } from '@/lib/types'
import { formatMoney } from '@/lib/calculator'

interface Props {
  holdings: Holding[]
  prices: Record<string, PriceCache>
  targetWeights: TargetWeight[]   // 用來取得代碼對應名稱（可為空）
}

// 以昨收計算每個持倉的總基準市值
function calcPrevCloseTotal(holdings: Holding[], prices: Record<string, PriceCache>): number {
  return holdings.reduce((sum, h) => {
    const p = prices[h.code]
    if (!p || h.shares <= 0) return sum
    return sum + h.shares * p.prevClose
  }, 0)
}

// 以現價計算今日實際總市值
function calcCurrentTotal(holdings: Holding[], prices: Record<string, PriceCache>): number {
  return holdings.reduce((sum, h) => {
    const p = prices[h.code]
    if (!p || h.shares <= 0) return sum
    return sum + h.shares * p.price
  }, 0)
}

// 取昨收為基準，計算在 pct% 漲跌下的各股模擬價與總市值
function calcScenario(holdings: Holding[], prices: Record<string, PriceCache>, pct: number) {
  return holdings.reduce((sum, h) => {
    const p = prices[h.code]
    if (!p || h.shares <= 0) return sum
    return sum + h.shares * p.prevClose * (1 + pct / 100)
  }, 0)
}

// 昨收到今日現價的實際加權漲跌幅
function calcTodayChangePct(holdings: Holding[], prices: Record<string, PriceCache>): number | null {
  const prevTotal = calcPrevCloseTotal(holdings, prices)
  const curTotal = calcCurrentTotal(holdings, prices)
  if (prevTotal === 0) return null
  return ((curTotal - prevTotal) / prevTotal) * 100
}

interface ChartPoint {
  pct: number          // -10 ~ +10
  label: string        // '-10%' etc.
  value: number        // 模擬總市值
  pnlVsPrev: number    // 相對昨收的損益
}

function CustomTooltip({ active, payload, label }: {
  active?: boolean
  payload?: Array<{ payload: ChartPoint }>
  label?: string
}) {
  if (!active || !payload || payload.length === 0) return null
  const d = payload[0]?.payload as ChartPoint | undefined
  if (!d) return null
  const isPos = d.pnlVsPrev >= 0
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-lg px-4 py-3 text-sm min-w-[160px]">
      <p className="font-bold text-slate-700 mb-1">{label}</p>
      <p className="text-slate-500">總市值 <span className="font-mono font-bold text-slate-800">${formatMoney(d.value)}</span></p>
      <p className={`font-mono font-bold ${isPos ? 'text-green-600' : 'text-red-500'}`}>
        {isPos ? '+' : ''}${formatMoney(d.pnlVsPrev)} vs 昨收
      </p>
    </div>
  )
}

export default function ScenarioChart({ holdings, prices }: Props) {
  const hasData = holdings.length > 0 && Object.keys(prices).length > 0

  const { chartData, todayPct, prevCloseTotal, todayTotal, isMarketOpen } = useMemo(() => {
    if (!hasData) return { chartData: [], todayPct: null, prevCloseTotal: 0, todayTotal: 0, isMarketOpen: false }

    const prevTotal = calcPrevCloseTotal(holdings, prices)
    const curTotal = calcCurrentTotal(holdings, prices)
    const todayChange = calcTodayChangePct(holdings, prices)

    // Check if any price is from open market
    const anyOpen = holdings.some((h) => prices[h.code]?.isMarketOpen)

    // Build data points from -10% to +10% in 1% steps
    const points: ChartPoint[] = []
    for (let pct = -10; pct <= 10; pct++) {
      const simValue = calcScenario(holdings, prices, pct)
      points.push({
        pct,
        label: `${pct >= 0 ? '+' : ''}${pct}%`,
        value: Math.round(simValue),
        pnlVsPrev: Math.round(simValue - prevTotal),
      })
    }

    return {
      chartData: points,
      todayPct: todayChange,
      prevCloseTotal: Math.round(prevTotal),
      todayTotal: Math.round(curTotal),
      isMarketOpen: anyOpen,
    }
  }, [holdings, prices, hasData])

  if (!hasData) return null

  const todayPnl = todayTotal - prevCloseTotal
  const todayPct2 = prevCloseTotal > 0 ? (todayPnl / prevCloseTotal) * 100 : 0
  const isTodayPos = todayPnl >= 0

  // Y-axis domain: min/max of chart values with some padding
  const values = chartData.map((d) => d.value)
  const minVal = Math.min(...values)
  const maxVal = Math.max(...values)
  const pad = (maxVal - minVal) * 0.15 || 10000

  // Reference line X value: clamp today's actual % to the chart range
  const clampedTodayPct = todayPct !== null
    ? Math.max(-10, Math.min(10, Math.round(todayPct * 2) / 2) )  // round to 0.5
    : null

  return (
    <div className="mt-4 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">
            📈 漲跌情境模擬
          </p>
          <p className="text-xs text-slate-400">
            以昨收為基準，模擬整體投資組合在不同漲跌幅下的總市值
          </p>
        </div>

        {/* Today's actual badge */}
        {prevCloseTotal > 0 && (
          <div className={`rounded-xl px-3 py-2 text-right text-xs ${
            isTodayPos ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'
          }`}>
            <p className="text-slate-500 mb-0.5">
              {isMarketOpen ? '📊 今日損益（盤中）' : '📊 今日損益（收盤）'}
            </p>
            <p className={`font-mono font-bold text-sm ${isTodayPos ? 'text-green-600' : 'text-red-500'}`}>
              {isTodayPos ? '+' : ''}${formatMoney(todayPnl)}
            </p>
            <p className={`font-mono text-xs ${isTodayPos ? 'text-green-500' : 'text-red-400'}`}>
              ({isTodayPos ? '+' : ''}{todayPct2.toFixed(2)}%)
            </p>
            {!isMarketOpen && (
              <p className="text-slate-400 text-xs mt-0.5">盤後數據，現價 ≈ 昨收</p>
            )}
          </div>
        )}
      </div>

      {/* Chart */}
      <ResponsiveContainer width="100%" height={320}>
        <LineChart data={chartData} margin={{ top: 28, right: 16, left: 8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: '#94a3b8' }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            domain={[Math.floor(minVal - pad), Math.ceil(maxVal + pad)]}
            tickFormatter={(v: number) => `$${(v / 10000).toFixed(0)}萬`}
            tick={{ fontSize: 11, fill: '#94a3b8' }}
            tickLine={false}
            axisLine={false}
            width={60}
          />
          <Tooltip content={<CustomTooltip />} />

          {/* Zero change reference (昨收基準) */}
          <ReferenceLine
            x="+0%"
            stroke="#94a3b8"
            strokeDasharray="4 3"
            label={{ value: '昨收', position: 'top', fontSize: 10, fill: '#94a3b8' }}
          />

          {/* Today's actual position */}
          {clampedTodayPct !== null && isMarketOpen && (
            <ReferenceLine
              x={`${clampedTodayPct >= 0 ? '+' : ''}${clampedTodayPct}%`}
              stroke={isTodayPos ? '#22c55e' : '#ef4444'}
              strokeWidth={2}
              strokeDasharray="5 3"
              label={{ value: '今日', position: 'top', fontSize: 10, fill: isTodayPos ? '#22c55e' : '#ef4444' }}
            />
          )}

          <Line
            type="monotone"
            dataKey="value"
            stroke="#2C5F8A"
            strokeWidth={2.5}
            dot={false}
            activeDot={{ r: 5, fill: '#2C5F8A', strokeWidth: 0 }}
          />
        </LineChart>
      </ResponsiveContainer>

      {/* Colour hint */}
      <div className="flex gap-4 mt-2 text-xs text-slate-400 justify-end">
        <span className="flex items-center gap-1"><span className="inline-block w-3 h-0.5 bg-slate-400" style={{ borderTop: '2px dashed #94a3b8' }} /> 昨收基準（+0%）</span>
        {isMarketOpen && (
          <span className={`flex items-center gap-1 ${isTodayPos ? 'text-green-500' : 'text-red-400'}`}>
            <span className={`inline-block w-3 h-0.5 ${isTodayPos ? 'bg-green-500' : 'bg-red-400'}`} style={{ borderTop: `2px dashed` }} /> 今日現況
          </span>
        )}
      </div>
    </div>
  )
}
