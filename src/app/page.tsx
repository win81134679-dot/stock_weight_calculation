'use client'

import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import StockInput from '@/components/StockInput'
import FeeSettings from '@/components/FeeSettings'
import ResultTable from '@/components/ResultTable'
import PortfolioChart from '@/components/PortfolioChart'
import TopUpCalculator from '@/components/TopUpCalculator'
import RebalancePage from '@/components/rebalance/RebalancePage'
import { calculatePortfolio, formatMoney, calcMinFund } from '@/lib/calculator'
import { PortfolioResult } from '@/lib/types'
import {
  DEFAULT_STOCKS,
  DEFAULT_DISCOUNT,
  DEFAULT_REBALANCE_DATE,
} from '@/lib/portfolio-config'

type TopTab = 'rebalance' | 'calculator'

export interface StockRow {
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

function buildInitialStocks(): StockRow[] {
  const rows: StockRow[] = DEFAULT_STOCKS.map((s) => ({
    code: s.code,
    name: '',
    price: 0,
    weight: s.weight,
    isETF: false,
    exchange: 'tse' as const,
    loading: false,
    error: '',
    hold: false,
  }))
  while (rows.length < 4) {
    rows.push({
      code: '', name: '', price: 0, weight: 0,
      isETF: false, exchange: 'tse', loading: false, error: '', hold: false,
    })
  }
  return rows.slice(0, 4)
}

export default function Home() {
  const [topTab, setTopTab] = useState<TopTab>('rebalance')

  return (
    <div className="min-h-screen bg-[#FAF9F6]">
      <div className="max-w-[1600px] mx-auto px-3 sm:px-6 lg:px-10 py-4 sm:py-6 space-y-4 sm:space-y-6">

        {/* Header */}
        <div className="bg-[#2C5F8A] rounded-2xl p-4 sm:p-6 shadow-lg">
          <div className="flex items-center gap-3 sm:gap-4">
            <div className="w-10 h-10 sm:w-14 sm:h-14 bg-white rounded-xl flex items-center justify-center shadow-inner shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.svg" alt="Logo" className="w-7 h-7 sm:w-10 sm:h-10" />
            </div>
            <div className="min-w-0">
              <h1 className="text-lg sm:text-2xl font-black text-white tracking-wide">台股持有權重計算器</h1>
              <p className="text-xs sm:text-sm text-white/70 mt-0.5 hidden sm:block">
                STOCK WEIGHT CALCULATOR — 即時股價 × 自訂權重 × 手續費試算
              </p>
            </div>
          </div>

          {/* Top-level tab selector */}
          <div className="flex gap-2 mt-4">
            <button
              onClick={() => setTopTab('rebalance')}
              className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${
                topTab === 'rebalance'
                  ? 'bg-white text-[#2C5F8A]'
                  : 'bg-white/20 text-white hover:bg-white/30'
              }`}
            >
              ⚖️ 季再平衡管理
            </button>
            <button
              onClick={() => setTopTab('calculator')}
              className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${
                topTab === 'calculator'
                  ? 'bg-white text-[#2C5F8A]'
                  : 'bg-white/20 text-white hover:bg-white/30'
              }`}
            >
              🧮 持倉計算
            </button>
          </div>
        </div>

        {topTab === 'rebalance' && <RebalancePage />}
        {topTab === 'calculator' && <PortfolioCalculatorPage />}

        {/* Footer */}
        <div className="text-center text-xs text-slate-400 py-4">
          股價來源：台灣證券交易所 TWSE 公開資訊（延遲約 20 秒）<br />
          本工具僅供參考，不構成投資建議
        </div>
      </div>
    </div>
  )
}

function PortfolioCalculatorPage() {
  const [stocks, setStocks] = useState<StockRow[]>(buildInitialStocks)
  const [totalFund, setTotalFund] = useState<number>(0)
  const [discount, setDiscount] = useState<number>(DEFAULT_DISCOUNT)
  const [rebalanceDate, setRebalanceDate] = useState<string>(DEFAULT_REBALANCE_DATE)
  const hasFetched = useRef(false)

  // --- 自動查詢 config 中有代碼的股票 ---
  const fetchStockPrice = useCallback(
    async (index: number, currentStocks: StockRow[]): Promise<Partial<StockRow>> => {
      const code = currentStocks[index].code.trim()
      if (!code) return {}

      try {
        const exchanges = ['tse', 'otc'] as const
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
              return {
                name: info.n?.trim() || code,
                price: actualPrice,
                isETF,
                exchange: ex,
                loading: false,
                error: '',
              }
            }
          }
        }
        return { name: '', price: 0, loading: false, error: '找不到此股票代碼' }
      } catch {
        return { loading: false, error: '查詢失敗，請稍後再試' }
      }
    },
    []
  )

  useEffect(() => {
    if (hasFetched.current) return
    hasFetched.current = true

    const initial = buildInitialStocks()
    const indicesToFetch = initial
      .map((s, i) => (s.code.trim() ? i : -1))
      .filter((i) => i >= 0)

    if (indicesToFetch.length === 0) return

    // 標記為 loading
    const loading = initial.map((s, i) =>
      indicesToFetch.includes(i) ? { ...s, loading: true } : s
    )
    setStocks(loading)

    // 批次查詢
    Promise.all(
      indicesToFetch.map((i) => fetchStockPrice(i, initial))
    ).then((results) => {
      setStocks((prev) => {
        const next = [...prev]
        indicesToFetch.forEach((stockIdx, resultIdx) => {
          next[stockIdx] = { ...next[stockIdx], ...results[resultIdx] }
        })
        return next
      })
    })
  }, [fetchStockPrice])

  // --- 最低資金即時計算（不依賴 totalFund） ---
  const minFund = useMemo(() => {
    return calcMinFund(stocks, discount)
  }, [stocks, discount])

  // --- 投資組合計算結果 ---
  const result: PortfolioResult | null = useMemo(() => {
    const tw = stocks.reduce((s, st) => s + st.weight, 0)
    const hasValid = stocks.some((s) => s.price > 0 && s.weight > 0)
    if (!hasValid || totalFund <= 0 || tw <= 0 || tw > 100.01) return null

    const entries = stocks.map((s) => ({
      code: s.code, name: s.name, price: s.price,
      weight: s.weight, isETF: s.isETF, exchange: s.exchange, hold: s.hold,
    }))
    return calculatePortfolio(entries, totalFund, discount)
  }, [stocks, totalFund, discount])

  const totalWeight = stocks.reduce((s, st) => s + st.weight, 0)

  return (
    <div className="space-y-4 sm:space-y-6">

      {/* 設定區 */}
      <Section title="基本設定">
        <FeeSettings
          totalFund={totalFund} onTotalFundChange={setTotalFund}
          discount={discount} onDiscountChange={setDiscount}
          rebalanceDate={rebalanceDate} onRebalanceDateChange={setRebalanceDate}
          minFund={minFund}
        />
      </Section>

      {/* 股票輸入 */}
      <Section title="股票配置" right={
        totalFund > 0 ? (
          <span className="text-xs text-slate-400">
            總資金 <span className="font-mono font-bold text-slate-600">${formatMoney(totalFund)}</span>
          </span>
        ) : undefined
      }>
        <StockInput stocks={stocks} onStocksChange={setStocks} />
        {totalWeight > 100.01 && (
          <div className="mt-3 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5 text-sm text-red-600">
            權重合計 {totalWeight.toFixed(1)}%，超過 100%，請調整
          </div>
        )}
        {totalWeight > 0 && totalWeight < 99.99 && (
          <div className="mt-3 bg-blue-50 border border-blue-200 rounded-xl px-4 py-2.5 text-sm text-blue-600">
            已配置 {totalWeight.toFixed(1)}%，預留 {(100 - totalWeight).toFixed(1)}% 資金
          </div>
        )}
        {totalFund <= 0 && (
          <div className="mt-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5 text-sm text-amber-600">
            請先輸入總資金金額
          </div>
        )}
      </Section>

      {/* 計算結果 */}
      {result && (
        <>
          <Section title="計算結果">
            <ResultTable result={result} />
          </Section>
          <Section title="圖表分析">
            <PortfolioChart result={result} />
          </Section>
        </>
      )}

      {/* 等比例加碼計算 — 只要有股價就顯示 */}
      {stocks.some((s) => s.price > 0 && s.weight > 0) && (
        <Section title="等比例加碼試算">
          <TopUpCalculator stocks={stocks} discount={discount} />
        </Section>
      )}
    </div>
  )
}

function Section({ title, right, children }: {
  title: string
  right?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-5">
      <div className="flex items-center justify-between mb-3 sm:mb-4">
        <div className="flex items-center gap-2">
          <div className="w-1 h-4 bg-[#4A90C4] rounded-full" />
          <h2 className="text-xs font-bold text-[#4A90C4] uppercase tracking-widest">{title}</h2>
        </div>
        {right}
      </div>
      {children}
    </div>
  )
}
