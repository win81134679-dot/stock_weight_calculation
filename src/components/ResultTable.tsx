'use client'

import React from 'react'
import { PortfolioResult } from '@/lib/types'
import { formatMoney } from '@/lib/calculator'

interface Props {
  result: PortfolioResult | null
}

export default function ResultTable({ result }: Props) {
  if (!result) return null

  const validStocks = result.stocks.filter((s) => s.price > 0)
  if (validStocks.length === 0) return null

  return (
    <div className="space-y-4">
      {/* 計算結果表格 */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[11px] text-slate-400 uppercase tracking-wider border-b border-slate-200">
              <th className="text-left py-2 px-2">股票</th>
              <th className="text-right py-2 px-2">現價</th>
              <th className="text-right py-2 px-2">權重</th>
              <th className="text-right py-2 px-2">分配金額</th>
              <th className="text-right py-2 px-2">可買張/股</th>
              <th className="text-right py-2 px-2">買入手續費</th>
              <th className="text-right py-2 px-2">實際花費</th>
            </tr>
          </thead>
          <tbody>
            {result.stocks.map((s, i) => {
              if (s.price <= 0 && !s.code) return null
              const COLORS = ['text-blue-600', 'text-emerald-600', 'text-amber-600', 'text-rose-600']
              return (
                <tr
                  key={i}
                  className={`border-b border-slate-100 ${
                    s.insufficientFund ? 'bg-red-50/50' : 'hover:bg-slate-50'
                  } transition`}
                >
                  <td className="py-3 px-2">
                    <div className={`font-bold ${COLORS[i]}`}>
                      {s.name || s.code || '-'}
                    </div>
                    <div className="text-[11px] text-slate-400">
                      {s.code} {s.isETF ? '• ETF' : ''}
                    </div>
                  </td>
                  <td className="text-right py-3 px-2 font-mono">
                    {s.price > 0 ? `$${s.price.toFixed(2)}` : '-'}
                  </td>
                  <td className="text-right py-3 px-2">{s.weight}%</td>
                  <td className="text-right py-3 px-2 font-mono">
                    ${formatMoney(s.allocatedAmount)}
                  </td>
                  <td className="text-right py-3 px-2">
                    {s.insufficientFund ? (
                      <span className="text-red-500 text-xs">資金不足</span>
                    ) : (
                      <span className="font-bold">{s.displayShares}</span>
                    )}
                  </td>
                  <td className="text-right py-3 px-2 font-mono text-slate-500">
                    ${formatMoney(s.buyFee)}
                  </td>
                  <td className="text-right py-3 px-2 font-mono font-bold">
                    ${formatMoney(s.actualCost)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* 摘要統計 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <SummaryCard label="總投入" value={`$${formatMoney(result.totalInvested)}`} color="blue" />
        <SummaryCard label="總手續費" value={`$${formatMoney(result.totalBuyFee)}`} color="amber" />
        <SummaryCard label="預估賣出成本" value={`$${formatMoney(result.totalSellCost)}`} color="rose" />
        <SummaryCard label="剩餘現金" value={`$${formatMoney(result.remainingCash)}`} color="emerald" />
      </div>

      {/* 賣出成本明細 */}
      <div className="bg-slate-50 rounded-xl p-4">
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
          換股賣出成本估算
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {result.stocks
            .filter((s) => s.buyableShares > 0)
            .map((s, i) => (
              <div
                key={i}
                className="flex justify-between items-center text-sm bg-white rounded-lg px-3 py-2 border border-slate-100"
              >
                <span className="text-slate-600">{s.name}</span>
                <span className="font-mono text-slate-700">
                  手續費 ${formatMoney(s.sellFee)} + 證交稅 ${formatMoney(s.sellTax)} ={' '}
                  <span className="font-bold text-rose-600">${formatMoney(s.sellTotalCost)}</span>
                </span>
              </div>
            ))}
        </div>
      </div>
    </div>
  )
}

function SummaryCard({
  label,
  value,
  color,
}: {
  label: string
  value: string
  color: 'blue' | 'amber' | 'rose' | 'emerald'
}) {
  const colorMap = {
    blue: 'bg-blue-50 text-blue-700 border-blue-200',
    amber: 'bg-amber-50 text-amber-700 border-amber-200',
    rose: 'bg-rose-50 text-rose-700 border-rose-200',
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  }
  return (
    <div className={`rounded-xl border p-3 ${colorMap[color]}`}>
      <div className="text-[11px] opacity-70 mb-1">{label}</div>
      <div className="text-sm font-bold font-mono">{value}</div>
    </div>
  )
}
