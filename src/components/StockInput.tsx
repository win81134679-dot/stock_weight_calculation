'use client'

import React, { useCallback } from 'react'

interface StockRow {
  code: string
  name: string
  price: number
  weight: number
  isETF: boolean
  exchange: 'tse' | 'otc'
  loading: boolean
  error: string
  hold: boolean
}

interface Props {
  stocks: StockRow[]
  onStocksChange: (stocks: StockRow[]) => void
}

export default function StockInput({ stocks, onStocksChange }: Props) {
  const totalWeight = stocks.reduce((sum, s) => sum + s.weight, 0)
  const weightValid = totalWeight > 0 && totalWeight <= 100.01

  const updateStock = useCallback(
    (index: number, partial: Partial<StockRow>) => {
      const next = [...stocks]
      next[index] = { ...next[index], ...partial }
      onStocksChange(next)
    },
    [stocks, onStocksChange]
  )

  const fetchPrice = useCallback(
    async (index: number) => {
      const code = stocks[index].code.trim()
      if (!code) return

      updateStock(index, { loading: true, error: '' })

      try {
        const exchanges = ['tse', 'otc'] as const
        let found = false

        for (const ex of exchanges) {
          const param = `${ex}_${code}.tw`
          const res = await fetch(`/api/stock-price?codes=${encodeURIComponent(param)}`)
          const data = await res.json()

          if (data.msgArray && data.msgArray.length > 0) {
            const info = data.msgArray[0]
            const price = parseFloat(info.z)
            const fallbackPrice = parseFloat(info.y)
            const actualPrice = !isNaN(price) && price > 0 ? price : fallbackPrice

            if (!isNaN(actualPrice) && actualPrice > 0) {
              const isETF = code.startsWith('00') && code.length >= 4
              updateStock(index, {
                name: info.n?.trim() || code,
                price: actualPrice,
                isETF,
                exchange: ex,
                loading: false,
                error: '',
              })
              found = true
              break
            }
          }
        }

        if (!found) {
          updateStock(index, { name: '', price: 0, loading: false, error: '找不到此股票代碼' })
        }
      } catch {
        updateStock(index, { loading: false, error: '查詢失敗，請稍後再試' })
      }
    },
    [stocks, updateStock]
  )

  const handleCodeKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      fetchPrice(index)
    }
  }

  const COLORS = [
    'border-l-blue-500',
    'border-l-emerald-500',
    'border-l-amber-500',
    'border-l-rose-500',
  ]

  return (
    <div className="space-y-3">
      {/* 權重總計 */}
      <div className="flex items-center justify-between text-sm">
        <span className="text-slate-500">權重總計</span>
        <span className={`font-bold text-lg ${weightValid ? 'text-emerald-600' : 'text-red-500'}`}>
          {totalWeight.toFixed(1)}%
          {totalWeight > 100.01 && (
            <span className="text-xs font-normal ml-2">
              超過 {(totalWeight - 100).toFixed(1)}%
            </span>
          )}
          {totalWeight > 0 && totalWeight < 99.99 && (
            <span className="text-xs font-normal ml-2 text-emerald-500">
              預留 {(100 - totalWeight).toFixed(1)}% 資金
            </span>
          )}
        </span>
      </div>

      {/* 4 檔股票 */}
      {stocks.map((stock, i) => (
        <div
          key={i}
          className={`bg-white rounded-xl border border-slate-200 border-l-4 ${COLORS[i]} shadow-sm p-3 sm:p-4 transition-all hover:shadow-md`}
        >
          {/* 標題列 */}
          <div className="flex items-center gap-2 mb-2 sm:mb-3">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              股票 {i + 1}
            </span>
            {stock.isETF && stock.name && (
              <span className="text-[10px] bg-blue-100 text-blue-600 px-2 py-0.5 rounded-full font-medium">
                ETF 0.1%
              </span>
            )}
            {stock.name && !stock.isETF && (
              <span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full font-medium">
                一般股 0.3%
              </span>
            )}
            {stock.name && stock.price > 0 && (
              <span className="text-xs text-emerald-600 font-bold font-mono ml-auto">
                ${stock.price.toFixed(2)}
              </span>
            )}
            {stock.name && (
              <button
                type="button"
                onClick={() => updateStock(i, { hold: !stock.hold })}
                className={`text-[10px] px-2 py-0.5 rounded-full font-medium transition shrink-0 ${
                  stock.hold
                    ? 'bg-violet-100 text-violet-600 ring-1 ring-violet-300'
                    : 'bg-slate-50 text-slate-400 hover:bg-slate-100'
                }`}
              >
                {stock.hold ? '🔒 持倉' : '📤 換股'}
              </button>
            )}
          </div>

          {/* === 手機佈局：堆疊 === */}
          <div className="sm:hidden space-y-2">
            {/* 第一行：代碼 + 查詢 */}
            <div className="flex gap-2">
              <input
                type="text"
                value={stock.code}
                onChange={(e) => updateStock(i, { code: e.target.value })}
                onKeyDown={(e) => handleCodeKeyDown(i, e)}
                onBlur={() => { if (stock.code.trim() && !stock.name) fetchPrice(i) }}
                placeholder="股票代碼"
                className="flex-1 min-w-0 rounded-lg border border-slate-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400/50 focus:border-blue-400 transition"
              />
              <button
                onClick={() => fetchPrice(i)}
                disabled={!stock.code.trim() || stock.loading}
                className="shrink-0 min-h-[44px] px-4 rounded-lg bg-slate-700 text-white text-xs font-medium hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition"
              >
                {stock.loading ? <Spinner /> : '查詢'}
              </button>
            </div>
            {/* 第二行：名稱 + 權重 */}
            <div className="flex gap-2 items-center">
              <div className="flex-1 min-w-0">
                {stock.error ? (
                  <span className="text-xs text-red-500">{stock.error}</span>
                ) : stock.name ? (
                  <span className="text-sm font-medium text-slate-700 truncate block">{stock.name}</span>
                ) : (
                  <span className="text-xs text-slate-300">輸入代碼後查詢</span>
                )}
              </div>
              <div className="shrink-0 w-24">
                <div className="relative">
                  <input
                    type="number"
                    min={0} max={100} step={0.1}
                    value={stock.weight || ''}
                    onChange={(e) => updateStock(i, { weight: parseFloat(e.target.value) || 0 })}
                    placeholder="25"
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-right pr-7 focus:outline-none focus:ring-2 focus:ring-blue-400/50 focus:border-blue-400 transition"
                  />
                  <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400">%</span>
                </div>
              </div>
            </div>
          </div>

          {/* === 桌面佈局：grid 12 === */}
          <div className="hidden sm:grid grid-cols-12 gap-2 items-end">
            {/* 代碼 */}
            <div className="col-span-3">
              <label className="text-[11px] text-slate-400 block mb-1">代碼</label>
              <input
                type="text"
                value={stock.code}
                onChange={(e) => updateStock(i, { code: e.target.value })}
                onKeyDown={(e) => handleCodeKeyDown(i, e)}
                onBlur={() => { if (stock.code.trim() && !stock.name) fetchPrice(i) }}
                placeholder="如 2330"
                className="w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400/50 focus:border-blue-400 transition"
              />
            </div>

            {/* 查詢 */}
            <div className="col-span-2">
              <button
                onClick={() => fetchPrice(i)}
                disabled={!stock.code.trim() || stock.loading}
                className="w-full rounded-lg bg-slate-700 text-white text-xs font-medium py-2.5 hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition"
              >
                {stock.loading ? <Spinner /> : '查詢'}
              </button>
            </div>

            {/* 名稱 + 股價 */}
            <div className="col-span-4">
              <label className="text-[11px] text-slate-400 block mb-1">
                {stock.name || '股票名稱'}
              </label>
              {stock.error ? (
                <div className="text-xs text-red-500 py-2">{stock.error}</div>
              ) : stock.name ? (
                <div className="text-sm font-medium text-slate-700 py-2">{stock.name}</div>
              ) : (
                <div className="text-xs text-slate-300 py-2">輸入代碼後查詢</div>
              )}
            </div>

            {/* 權重 */}
            <div className="col-span-3">
              <label className="text-[11px] text-slate-400 block mb-1">權重 %</label>
              <input
                type="number"
                min={0} max={100} step={0.1}
                value={stock.weight || ''}
                onChange={(e) => updateStock(i, { weight: parseFloat(e.target.value) || 0 })}
                placeholder="25"
                className="w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-400/50 focus:border-blue-400 transition"
              />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

function Spinner() {
  return (
    <span className="inline-flex items-center gap-1">
      <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25" />
        <path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="4" strokeLinecap="round" className="opacity-75" />
      </svg>
      查詢中
    </span>
  )
}
