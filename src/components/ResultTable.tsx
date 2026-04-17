'use client'

import React from 'react'
import { PortfolioResult } from '@/lib/types'
import { formatMoney } from '@/lib/calculator'

interface Props {
  result: PortfolioResult | null
}

const COLORS = [
  { text: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-200' },
  { text: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200' },
  { text: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-200' },
  { text: 'text-rose-600', bg: 'bg-rose-50', border: 'border-rose-200' },
]

export default function ResultTable({ result }: Props) {
  if (!result) return null

  const validStocks = result.stocks.filter((s) => s.price > 0)
  if (validStocks.length === 0) return null

  return (
    <div className="space-y-4">
      {/* --- 桌面表格 --- */}
      <div className="hidden md:block overflow-x-auto">
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
              return (
                <tr
                  key={i}
                  className={`border-b border-slate-100 ${
                    s.insufficientFund ? 'bg-red-50/50' : 'hover:bg-slate-50'
                  } transition`}
                >
                  <td className="py-3 px-2">
                    <div className={`font-bold ${COLORS[i].text}`}>
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
                  <td className="text-right py-3 px-2 font-mono">${formatMoney(s.allocatedAmount)}</td>
                  <td className="text-right py-3 px-2">
                    {s.insufficientFund ? (
                      <span className="text-red-500 text-xs">資金不足</span>
                    ) : (
                      <span className="font-bold">{s.displayShares}</span>
                    )}
                  </td>
                  <td className="text-right py-3 px-2 font-mono text-slate-500">${formatMoney(s.buyFee)}</td>
                  <td className="text-right py-3 px-2 font-mono font-bold">${formatMoney(s.actualCost)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* --- 手機卡片 --- */}
      <div className="md:hidden space-y-3">
        {result.stocks.map((s, i) => {
          if (s.price <= 0 && !s.code) return null
          const c = COLORS[i]
          return (
            <div
              key={i}
              className={`rounded-xl border ${c.border} ${s.insufficientFund ? 'bg-red-50/50' : c.bg} p-3`}
            >
              {/* 名稱 + 代碼 */}
              <div className="flex items-center justify-between mb-2">
                <div>
                  <span className={`font-bold text-sm ${c.text}`}>{s.name || s.code || '-'}</span>
                  <span className="text-[11px] text-slate-400 ml-1.5">{s.code}{s.isETF ? ' • ETF' : ''}</span>
                  {s.hold && (
                    <span className="text-[10px] bg-violet-100 text-violet-600 px-1.5 py-0.5 rounded-full ml-1.5">
                      🔒 持倉
                    </span>
                  )}
                </div>
                <span className="font-mono text-sm">{s.weight}%</span>
              </div>
              {/* 明細 */}
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                <Row label="現價" value={s.price > 0 ? `$${s.price.toFixed(2)}` : '-'} />
                <Row label="分配金額" value={`$${formatMoney(s.allocatedAmount)}`} />
                <Row
                  label="可買"
                  value={s.insufficientFund ? '資金不足' : s.displayShares}
                  valueClass={s.insufficientFund ? 'text-red-500' : 'font-bold'}
                />
                <Row label="手續費" value={`$${formatMoney(s.buyFee)}`} />
              </div>
              {/* 實際花費 */}
              <div className="mt-2 pt-2 border-t border-slate-200/50 flex justify-between text-sm">
                <span className="text-slate-500">實際花費</span>
                <span className="font-mono font-bold">${formatMoney(s.actualCost)}</span>
              </div>
            </div>
          )
        })}
      </div>

      {/* 摘要統計 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
        <SummaryCard label="總投入" value={`$${formatMoney(result.totalInvested)}`} color="blue" />
        <SummaryCard label="總手續費" value={`$${formatMoney(result.totalBuyFee)}`} color="amber" />
        <SummaryCard label="預估賣出成本" value={`$${formatMoney(result.totalSellCost)}`} color="rose" />
        <SummaryCard label="剩餘現金" value={`$${formatMoney(result.remainingCash)}`} color="emerald" />
      </div>

      {/* 賣出成本明細 */}
      <div className="bg-slate-50 rounded-xl p-3 sm:p-4">
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
          換股賣出成本估算
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {result.stocks
            .filter((s) => s.buyableShares > 0)
            .map((s, i) => (
              <div
                key={i}
                className={`flex flex-col sm:flex-row sm:justify-between sm:items-center text-sm bg-white rounded-lg px-3 py-2 border border-slate-100 gap-1 ${s.hold ? 'opacity-50' : ''}`}
              >
                <span className="text-slate-600 font-medium">
                  {s.name}
                  {s.hold && <span className="text-[10px] text-violet-500 ml-1">🔒 持倉不賣</span>}
                </span>
                {s.hold ? (
                  <span className="font-mono text-slate-400 text-xs">$0</span>
                ) : (
                  <span className="font-mono text-slate-700 text-xs sm:text-sm">
                    手續費 ${formatMoney(s.sellFee)} + 稅 ${formatMoney(s.sellTax)} ={' '}
                    <span className="font-bold text-rose-600">${formatMoney(s.sellTotalCost)}</span>
                  </span>
                )}
              </div>
            ))}
        </div>
        {result.stocks.some((s) => s.hold && s.buyableShares > 0) && (
          <p className="text-[11px] text-slate-400 mt-2">
            🔒 標記為「持倉」的股票不計入賣出成本
          </p>
        )}
      </div>
    </div>
  )
}

function Row({ label, value, valueClass = '' }: { label: string; value: string; valueClass?: string }) {
  return (
    <>
      <span className="text-slate-500">{label}</span>
      <span className={`text-right font-mono ${valueClass}`}>{value}</span>
    </>
  )
}

function SummaryCard({
  label, value, color,
}: {
  label: string; value: string
  color: 'blue' | 'amber' | 'rose' | 'emerald'
}) {
  const colorMap = {
    blue: 'bg-blue-50 text-blue-700 border-blue-200',
    amber: 'bg-amber-50 text-amber-700 border-amber-200',
    rose: 'bg-rose-50 text-rose-700 border-rose-200',
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  }
  return (
    <div className={`rounded-xl border p-2.5 sm:p-3 ${colorMap[color]}`}>
      <div className="text-[11px] opacity-70 mb-0.5">{label}</div>
      <div className="text-xs sm:text-sm font-bold font-mono">{value}</div>
    </div>
  )
}
