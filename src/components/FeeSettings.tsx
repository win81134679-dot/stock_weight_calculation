'use client'

import React from 'react'
import { getActualFeeRate, formatPercent, formatMoney } from '@/lib/calculator'

interface Props {
  totalFund: number
  onTotalFundChange: (v: number) => void
  discount: number
  onDiscountChange: (v: number) => void
  rebalanceDate: string
  onRebalanceDateChange: (v: string) => void
  minFund: number
}

export default function FeeSettings({
  totalFund,
  onTotalFundChange,
  discount,
  onDiscountChange,
  rebalanceDate,
  onRebalanceDateChange,
  minFund,
}: Props) {
  const actualRate = getActualFeeRate(discount)
  const isInsufficient = totalFund > 0 && minFund > 0 && totalFund < minFund

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
      {/* 總資金 */}
      <div>
        <label className="text-[11px] text-slate-400 block mb-1.5 font-medium tracking-wide">
          總資金（台幣）
        </label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">$</span>
          <input
            type="number"
            min={0}
            step={1000}
            value={totalFund || ''}
            onChange={(e) => onTotalFundChange(parseFloat(e.target.value) || 0)}
            placeholder="例如 1000000"
            className="w-full rounded-xl border border-slate-200 pl-7 pr-3 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-400/50 focus:border-blue-400 transition"
          />
        </div>
        {/* 最低資金提示 */}
        {minFund > 0 && (
          <p className={`mt-1.5 text-xs ${isInsufficient ? 'text-amber-600' : 'text-slate-400'}`}>
            {isInsufficient ? '⚠️ ' : ''}此投資組合最低需要 <span className="font-mono font-semibold">${formatMoney(minFund)}</span> 元
          </p>
        )}
      </div>

      {/* 手續費折扣 */}
      <div>
        <label className="text-[11px] text-slate-400 block mb-1.5 font-medium tracking-wide">
          手續費折扣
        </label>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={1}
            max={10}
            step={0.5}
            value={discount}
            onChange={(e) => {
              const v = parseFloat(e.target.value)
              if (v >= 1 && v <= 10) onDiscountChange(v)
            }}
            className="w-20 rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-center font-mono focus:outline-none focus:ring-2 focus:ring-blue-400/50 focus:border-blue-400 transition"
          />
          <span className="text-sm text-slate-500">折</span>
          <span className="text-[11px] text-slate-400 ml-auto">
            實際費率 {formatPercent(actualRate)}
          </span>
        </div>
      </div>

      {/* 換股日期 */}
      <div>
        <label className="text-[11px] text-slate-400 block mb-1.5 font-medium tracking-wide">
          預計換股日期
        </label>
        <input
          type="date"
          value={rebalanceDate}
          onChange={(e) => onRebalanceDateChange(e.target.value)}
          className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400/50 focus:border-blue-400 transition"
        />
      </div>
    </div>
  )
}
