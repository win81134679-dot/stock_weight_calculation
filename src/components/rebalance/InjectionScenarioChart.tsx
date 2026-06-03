'use client'

/**
 * InjectionScenarioChart.tsx
 * 資金投入情境模擬：
 * 輸入欲投入金額後，以昨收為基準，
 * 比較「目前持倉」vs「投入後」在 -10%~+10% 各漲跌幅下的總市值與損益。
 */

import React, { useState, useMemo } from 'react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import { Holding, PriceCache } from '@/lib/types'
import { formatMoney } from '@/lib/calculator'

interface Props {
  holdings: Holding[]
  prices: Record<string, PriceCache>
  /** 如果外部傳入金額，則隱藏輸入 UI，直接使用此值 */
  injectionAmount?: number
}

const PRESET_AMOUNTS = [10000, 20000, 30000, 50000, 100000, 200000, 500000]

interface ChartPoint {
  pct: number
  label: string
  current: number    // 目前持倉市值（昨收基準 × 漲跌）
  withInj: number    // 持倉 + 投入資金 × 漲跌
  injGain: number    // 投入資金的波動損益（withInj - current）
  currentGain: number // 持倉部分的損益（relative to prevClose base）
}

interface TooltipProps {
  active?: boolean
  payload?: Array<{ payload: ChartPoint }>
  label?: string
  effectiveInjection: number
  prevCloseTotal: number
}

function CustomTooltip({ active, payload, label, effectiveInjection, prevCloseTotal }: TooltipProps) {
  if (!active || !payload || payload.length === 0) return null

  // Read pre-computed values directly from ChartPoint (avoids name-matching bugs)
  const point = payload[0]?.payload
  if (!point) return null

  const currentVal = point.current
  const withInjVal = point.withInj
  const currentGain = point.currentGain
  const injGain = point.injGain
  const totalGain = withInjVal - (prevCloseTotal + effectiveInjection)

  const isCurrentPos = currentGain >= 0
  const isTotalPos = totalGain >= 0

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-lg px-4 py-3 text-xs min-w-[200px]">
      <p className="font-bold text-slate-700 mb-2 text-sm">{label}</p>
      <div className="space-y-1.5">
        <div className="flex justify-between gap-4">
          <span className="text-slate-400">目前持倉市值</span>
          <span className="font-mono font-bold text-slate-800">${formatMoney(currentVal)}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className={isCurrentPos ? 'text-green-600' : 'text-red-500'}>持倉損益</span>
          <span className={`font-mono font-bold ${isCurrentPos ? 'text-green-600' : 'text-red-500'}`}>
            {isCurrentPos ? '+' : ''}${formatMoney(currentGain)}
          </span>
        </div>
        {effectiveInjection > 0 && (
          <>
            <div className="border-t border-slate-100 my-1" />
            <div className="flex justify-between gap-4">
              <span className="text-slate-400">投入後合計市值</span>
              <span className="font-mono font-bold text-green-700">${formatMoney(withInjVal)}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-slate-400">投入資金波動</span>
              <span className={`font-mono font-bold ${injGain >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                {injGain >= 0 ? '+' : ''}${formatMoney(injGain)}
              </span>
            </div>
            <div className="flex justify-between gap-4">
              <span className={isTotalPos ? 'text-green-600' : 'text-red-500'}>整體損益</span>
              <span className={`font-mono font-bold ${isTotalPos ? 'text-green-600' : 'text-red-500'}`}>
                {isTotalPos ? '+' : ''}${formatMoney(totalGain)}
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default function InjectionScenarioChart({ holdings, prices, injectionAmount }: Props) {
  const isControlled = injectionAmount !== undefined
  const [injection, setInjection] = useState<number>(0)
  const [inputVal, setInputVal] = useState<string>('')

  // When controlled, use external amount
  const effectiveInjection = isControlled ? injectionAmount : injection

  const hasData = holdings.length > 0 && Object.keys(prices).length > 0

  const { chartData, prevCloseTotal } = useMemo(() => {
    if (!hasData) return { chartData: [] as ChartPoint[], prevCloseTotal: 0 }

    const prevTotal = holdings.reduce((sum, h) => {
      const p = prices[h.code]
      if (!p || h.shares <= 0) return sum
      return sum + h.shares * p.prevClose
    }, 0)

    const points: ChartPoint[] = []
    for (let pct = -10; pct <= 10; pct++) {
      const factor = 1 + pct / 100
      const currentVal = Math.round(prevTotal * factor)
      const withInjVal = Math.round((prevTotal + effectiveInjection) * factor)
      points.push({
        pct,
        label: `${pct >= 0 ? '+' : ''}${pct}%`,
        current: currentVal,
        withInj: withInjVal,
        injGain: withInjVal - currentVal,
        currentGain: currentVal - Math.round(prevTotal),
      })
    }

    return { chartData: points, prevCloseTotal: Math.round(prevTotal) }
  }, [holdings, prices, effectiveInjection, hasData])

  if (!hasData) return null

  const allValues = chartData.flatMap((d) =>
    effectiveInjection > 0 ? [d.current, d.withInj] : [d.current]
  )
  const minVal = Math.min(...allValues)
  const maxVal = Math.max(...allValues)
  const pad = (maxVal - minVal) * 0.15 || 10000

  const handleInput = (v: string) => {
    setInputVal(v)
    const n = parseFloat(v)
    setInjection(isNaN(n) || n < 0 ? 0 : Math.round(n * 10000))
  }

  const handlePreset = (amt: number) => {
    setInjection(amt)
    const label = amt % 10000 === 0 ? String(amt / 10000) : (amt / 10000).toFixed(1)
    setInputVal(label)
  }

  const injLabel =
    effectiveInjection >= 10000
      ? `${effectiveInjection % 10000 === 0 ? (effectiveInjection / 10000).toFixed(0) : (effectiveInjection / 10000).toFixed(1)} 萬`
      : `${effectiveInjection.toLocaleString()}`

  // Table: full -10% to +10%
  const tableRows = chartData

  return (
    <div className="mt-4 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
      {/* Header */}
      <div className="mb-4">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">
          💰 資金投入情境模擬
        </p>
        <p className="text-xs text-slate-400">
          輸入欲投入金額，查看加入後整體組合在 -10%~+10% 各漲跌幅下的市值與損益波動
        </p>
      </div>

      {/* Input row — only shown in standalone mode */}
      {!isControlled && (
        <div className="flex flex-wrap gap-2 mb-4 items-center">
          <div className="flex items-center gap-2 border border-slate-200 rounded-lg px-3 py-2 bg-slate-50 min-w-[160px]">
            <span className="text-slate-400 text-sm">$</span>
            <input
              type="number"
              min="0"
              step="0.1"
              value={inputVal}
              onChange={(e) => handleInput(e.target.value)}
              placeholder="0.0"
              className="w-20 bg-transparent text-sm outline-none"
            />
            <span className="text-slate-400 text-xs">萬</span>
          </div>
          {PRESET_AMOUNTS.map((amt) => {
            const label =
              amt % 10000 === 0 ? `${amt / 10000}萬` : `${(amt / 10000).toFixed(1)}萬`
            const active = injection === amt
            return (
              <button
                key={amt}
                onClick={() => handlePreset(amt)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                  active
                    ? 'bg-[#2C5F8A] text-white border-[#2C5F8A]'
                    : 'bg-white border-slate-200 text-slate-600 hover:border-[#4A90C4]'
                }`}
              >
                {label}
              </button>
            )
          })}
          {injection > 0 && (
            <button
              onClick={() => { setInjection(0); setInputVal('') }}
              className="px-2 py-1.5 rounded-lg text-xs text-slate-400 hover:text-red-500"
            >
              清除
            </button>
          )}
        </div>
      )}

      {/* Summary bar */}
      {effectiveInjection > 0 && (
        <div className="flex flex-wrap gap-3 mb-4 text-xs">
          <div className="bg-slate-50 rounded-lg px-3 py-2 border border-slate-100">
            <span className="text-slate-400">目前持倉（昨收）</span>
            <span className="font-mono font-bold text-slate-700 ml-2">
              ${formatMoney(prevCloseTotal)}
            </span>
          </div>
          <div className="bg-blue-50 rounded-lg px-3 py-2 border border-blue-100">
            <span className="text-slate-400">投入金額</span>
            <span className="font-mono font-bold text-[#2C5F8A] ml-2">${formatMoney(effectiveInjection)}</span>
          </div>
          <div className="bg-green-50 rounded-lg px-3 py-2 border border-green-100">
            <span className="text-slate-400">投入後合計（昨收）</span>
            <span className="font-mono font-bold text-green-700 ml-2">
              ${formatMoney(prevCloseTotal + effectiveInjection)}
            </span>
          </div>
        </div>
      )}

      {/* Chart */}
      <ResponsiveContainer width="100%" height={300} className="text-xs md:text-sm">
        <LineChart data={chartData} margin={{ top: 20, right: 10, left: 8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 10, fill: '#94a3b8' }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            domain={[Math.floor(minVal - pad), Math.ceil(maxVal + pad)]}
            tickFormatter={(v: number) => `$${(v / 10000).toFixed(0)}萬`}
            tick={{ fontSize: 10, fill: '#94a3b8' }}
            tickLine={false}
            axisLine={false}
            width={56}
          />
          <Tooltip
            content={(props) => (
              <CustomTooltip
                active={props.active}
                payload={props.payload as unknown as Array<{ payload: ChartPoint }> | undefined}
                label={props.label as string | undefined}
                effectiveInjection={effectiveInjection}
                prevCloseTotal={prevCloseTotal}
              />
            )}
          />
          {effectiveInjection > 0 && <Legend verticalAlign="top" height={28} />}
          <ReferenceLine x="+0%" stroke="#94a3b8" strokeDasharray="4 3" strokeWidth={1} />
          <Line
            type="monotone"
            dataKey="current"
            name="目前持倉"
            stroke="#4A90C4"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
          />
          {effectiveInjection > 0 && (
            <Line
              type="monotone"
              dataKey="withInj"
              name={`投入 ${injLabel} 後`}
              stroke="#22c55e"
              strokeWidth={2.5}
              dot={false}
              activeDot={{ r: 5 }}
            />
          )}
        </LineChart>
      </ResponsiveContainer>

      {/* Detail table */}
      {effectiveInjection > 0 && (
        <div className="mt-5">
          <p className="text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wide">
            各情境損益明細
          </p>
          <div className="overflow-x-auto rounded-xl border border-slate-100">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-50 text-slate-400 uppercase tracking-wide">
                  <th className="px-3 py-2 text-center">漲跌幅</th>
                  <th className="px-3 py-2 text-right">持倉市值</th>
                  <th className="px-3 py-2 text-right">持倉損益</th>
                  <th className="px-3 py-2 text-right">投入後市值</th>
                  <th className="px-3 py-2 text-right">投入金波動</th>
                  <th className="px-3 py-2 text-right">整體損益</th>
                </tr>
              </thead>
              <tbody>
                {tableRows.map((d) => {
                  const isPos = d.pct > 0
                  const isZero = d.pct === 0
                  const totalGain = d.withInj - (prevCloseTotal + effectiveInjection)
                  return (
                    <tr
                      key={d.pct}
                      className={`border-t border-slate-100 ${
                        isZero ? 'bg-slate-50' : ''
                      }`}
                    >
                      <td className={`px-3 py-1.5 text-center font-mono font-bold ${
                        isPos ? 'text-green-600' : isZero ? 'text-slate-400' : 'text-red-500'
                      }`}>
                        {d.label}
                      </td>
                      <td className="px-3 py-1.5 text-right font-mono text-slate-700">
                        ${formatMoney(d.current)}
                      </td>
                      <td className={`px-3 py-1.5 text-right font-mono font-bold ${
                        d.currentGain > 0 ? 'text-green-600' : d.currentGain < 0 ? 'text-red-500' : 'text-slate-400'
                      }`}>
                        {d.currentGain > 0 ? '+' : ''}${formatMoney(d.currentGain)}
                      </td>
                      <td className="px-3 py-1.5 text-right font-mono font-bold text-green-700">
                        ${formatMoney(d.withInj)}
                      </td>
                      <td className={`px-3 py-1.5 text-right font-mono ${
                        d.injGain > 0 ? 'text-green-600' : d.injGain < 0 ? 'text-red-500' : 'text-slate-400'
                      }`}>
                        {d.injGain > 0 ? '+' : ''}${formatMoney(d.injGain)}
                      </td>
                      <td className={`px-3 py-1.5 text-right font-mono font-bold ${
                        totalGain > 0 ? 'text-green-600' : totalGain < 0 ? 'text-red-500' : 'text-slate-400'
                      }`}>
                        {totalGain > 0 ? '+' : ''}${formatMoney(totalGain)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
