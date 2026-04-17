'use client'

import React, { useState, useMemo } from 'react'
import { calcTopUp, formatMoney } from '@/lib/calculator'
import { TopUpResult } from '@/lib/types'

interface StockInfo {
  code: string
  name: string
  price: number
  weight: number
  isETF: boolean
}

interface Props {
  stocks: StockInfo[]
  discount: number
}

const COLORS = [
  { text: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-200' },
  { text: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200' },
  { text: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-200' },
  { text: 'text-rose-600', bg: 'bg-rose-50', border: 'border-rose-200' },
]

export default function TopUpCalculator({ stocks, discount }: Props) {
  const [topUpAmount, setTopUpAmount] = useState<number>(0)

  const result: TopUpResult | null = useMemo(() => {
    if (topUpAmount <= 0) return null
    const valid = stocks.filter((s) => s.price > 0 && s.weight > 0)
    if (valid.length === 0) return null
    return calcTopUp(valid, topUpAmount, discount)
  }, [stocks, topUpAmount, discount])

  return (
    <div className="space-y-4">
      {/* 加碼金額輸入 */}
      <div className="flex flex-col sm:flex-row sm:items-end gap-3">
        <div className="flex-1">
          <label className="text-[11px] text-slate-400 block mb-1">加碼金額</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">$</span>
            <input
              type="number"
              min={0}
              value={topUpAmount || ''}
              onChange={(e) => setTopUpAmount(parseInt(e.target.value) || 0)}
              placeholder="輸入想加碼的金額"
              className="w-full rounded-lg border border-slate-200 pl-7 pr-3 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-400/50 focus:border-blue-400 transition"
            />
          </div>
          <p className="text-[11px] text-slate-400 mt-1">
            按現有權重等比例分配到各檔股票
          </p>
        </div>
        {/* 快捷按鈕 */}
        <div className="flex gap-2 shrink-0">
          {[50000, 100000, 200000, 500000].map((amt) => (
            <button
              key={amt}
              onClick={() => setTopUpAmount(amt)}
              className={`text-xs px-3 py-2 rounded-lg border transition ${
                topUpAmount === amt
                  ? 'bg-blue-50 border-blue-300 text-blue-600'
                  : 'border-slate-200 text-slate-500 hover:bg-slate-50'
              }`}
            >
              {amt >= 10000 ? `${amt / 10000}萬` : formatMoney(amt)}
            </button>
          ))}
        </div>
      </div>

      {/* 結果 */}
      {result && result.stocks.length > 0 && (
        <>
          {/* 桌面表格 */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] text-slate-400 uppercase tracking-wider border-b border-slate-200">
                  <th className="text-left py-2 px-2">股票</th>
                  <th className="text-right py-2 px-2">現價</th>
                  <th className="text-right py-2 px-2">原權重</th>
                  <th className="text-right py-2 px-2">實際佔比</th>
                  <th className="text-right py-2 px-2">分配金額</th>
                  <th className="text-right py-2 px-2">可買張/股</th>
                  <th className="text-right py-2 px-2">手續費</th>
                  <th className="text-right py-2 px-2">實際花費</th>
                </tr>
              </thead>
              <tbody>
                {result.stocks.map((s, i) => (
                  <tr key={i} className="border-b border-slate-100 hover:bg-slate-50 transition">
                    <td className="py-3 px-2">
                      <div className={`font-bold ${COLORS[i % COLORS.length].text}`}>
                        {s.name || s.code}
                      </div>
                      <div className="text-[11px] text-slate-400">{s.code}</div>
                    </td>
                    <td className="text-right py-3 px-2 font-mono">${s.price.toFixed(2)}</td>
                    <td className="text-right py-3 px-2">{s.weight}%</td>
                    <td className="text-right py-3 px-2 font-bold">{(s.ratio * 100).toFixed(1)}%</td>
                    <td className="text-right py-3 px-2 font-mono">${formatMoney(s.allocatedAmount)}</td>
                    <td className="text-right py-3 px-2 font-bold">{s.displayShares}</td>
                    <td className="text-right py-3 px-2 font-mono text-slate-500">${formatMoney(s.buyFee)}</td>
                    <td className="text-right py-3 px-2 font-mono font-bold">${formatMoney(s.actualCost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* 手機卡片 */}
          <div className="md:hidden space-y-3">
            {result.stocks.map((s, i) => {
              const c = COLORS[i % COLORS.length]
              return (
                <div key={i} className={`rounded-xl border ${c.border} ${c.bg} p-3`}>
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <span className={`font-bold text-sm ${c.text}`}>{s.name || s.code}</span>
                      <span className="text-[11px] text-slate-400 ml-1.5">{s.code}</span>
                    </div>
                    <span className="font-mono text-sm font-bold">{(s.ratio * 100).toFixed(1)}%</span>
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                    <span className="text-slate-500">現價</span>
                    <span className="text-right font-mono">${s.price.toFixed(2)}</span>
                    <span className="text-slate-500">分配金額</span>
                    <span className="text-right font-mono">${formatMoney(s.allocatedAmount)}</span>
                    <span className="text-slate-500">可買</span>
                    <span className="text-right font-bold">{s.displayShares}</span>
                    <span className="text-slate-500">手續費</span>
                    <span className="text-right font-mono">${formatMoney(s.buyFee)}</span>
                  </div>
                  <div className="mt-2 pt-2 border-t border-slate-200/50 flex justify-between text-sm">
                    <span className="text-slate-500">實際花費</span>
                    <span className="font-mono font-bold">${formatMoney(s.actualCost)}</span>
                  </div>
                </div>
              )
            })}
          </div>

          {/* 摘要 */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3">
            <SummaryCard label="加碼金額" value={`$${formatMoney(result.topUpAmount)}`} color="blue" />
            <SummaryCard label="實際投入" value={`$${formatMoney(result.totalCost)}`} color="amber" />
            <SummaryCard label="剩餘未分配" value={`$${formatMoney(result.remainingCash)}`} color="emerald" />
          </div>
        </>
      )}
    </div>
  )
}

function SummaryCard({
  label, value, color,
}: {
  label: string; value: string
  color: 'blue' | 'amber' | 'emerald'
}) {
  const colorMap = {
    blue: 'bg-blue-50 text-blue-700 border-blue-200',
    amber: 'bg-amber-50 text-amber-700 border-amber-200',
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  }
  return (
    <div className={`rounded-xl border p-2.5 sm:p-3 ${colorMap[color]}`}>
      <div className="text-[11px] opacity-70 mb-0.5">{label}</div>
      <div className="text-xs sm:text-sm font-bold font-mono">{value}</div>
    </div>
  )
}
