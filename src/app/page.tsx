'use client'

import Link from 'next/link'
import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import StockInput from '@/components/StockInput'
import FeeSettings from '@/components/FeeSettings'
import ResultTable from '@/components/ResultTable'
import PortfolioChart from '@/components/PortfolioChart'
import TopUpCalculator from '@/components/TopUpCalculator'
import RebalancePage from '@/components/rebalance/RebalancePage'
import { calculatePortfolio, formatMoney, calcMinFund } from '@/lib/calculator'
import { PortfolioResult } from '@/lib/types'
import { usePortfolioStore } from '@/hooks/usePortfolioStore'
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
          <div className="flex flex-wrap gap-2 mt-4">
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
            <Link
              href="/us"
              className="px-4 py-2 rounded-xl text-sm font-semibold transition-colors bg-white/10 text-white border border-white/20 hover:bg-white/20"
            >
              🇺🇸 美股系統
            </Link>
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
  const [selectedConfigId, setSelectedConfigId] = useState<string>('')
  const [applyFlash, setApplyFlash] = useState(false)
  const hasFetched = useRef(false)
  const { store } = usePortfolioStore()
  const allocationConfigs = store.allocationConfigs

  // --- 套用目標配置 ---
  const applyConfig = useCallback(
    async (configId: string) => {
      const config = allocationConfigs.find((c) => c.id === configId)
      if (!config) return

      const tw = config.targetWeights
      const rowCount = Math.max(tw.length, 4)
      const newStocks: StockRow[] = Array.from({ length: rowCount }, (_, i) => {
        const t = tw[i]
        if (t) {
          return {
            code: t.code,
            name: t.name ?? '',
            price: 0,
            weight: t.weight,
            isETF: t.isETF ?? false,
            exchange: t.exchange ?? 'tse',
            loading: true,
            error: '',
            hold: false,
          }
        }
        return { code: '', name: '', price: 0, weight: 0, isETF: false, exchange: 'tse', loading: false, error: '', hold: false }
      })
      setStocks(newStocks)
      setApplyFlash(true)
      setTimeout(() => setApplyFlash(false), 1200)

      // 批次查詢股價
      const indicesToFetch = newStocks
        .map((s, i) => (s.code.trim() ? i : -1))
        .filter((i) => i >= 0)

      const results = await Promise.all(
        indicesToFetch.map(async (i) => {
          const code = newStocks[i].code.trim()
          const knownExchange = newStocks[i].exchange
          // Route 內部自動處理 .TW → .TWO fallback
          void knownExchange // 保留參數但不需要手動切換
          try {
            const param = `tse_${code}.tw`
            const res = await fetch(`/api/stock-price?codes=${encodeURIComponent(param)}`)
            const data = await res.json()
            if (data.stocks && data.stocks.length > 0) {
              const s = data.stocks[0]
              return { i, partial: { name: s.name || code, price: s.price, isETF: code.startsWith('00') && code.length >= 4, exchange: s.exchange as 'tse' | 'otc', loading: false, error: '' } }
            }
          } catch { /* continue */ }
          return { i, partial: { loading: false, error: '查詢失敗' } }
        })
      )

      setStocks((prev) => {
        const next = [...prev]
        results.forEach(({ i, partial }) => {
          next[i] = { ...next[i], ...partial }
        })
        return next
      })
    },
    [allocationConfigs]
  )

  // --- 自動查詢 config 中有代碼的股票 ---
  const fetchStockPrice = useCallback(
    async (index: number, currentStocks: StockRow[]): Promise<Partial<StockRow>> => {
      const code = currentStocks[index].code.trim()
      if (!code) return {}

      try {
        // Route 內部自動處理 .TW → .TWO fallback，一次查詢即可
        const param = `tse_${code}.tw`
        const res = await fetch(`/api/stock-price?codes=${encodeURIComponent(param)}`)
        const data = await res.json()

        if (data.stocks && data.stocks.length > 0) {
          const s = data.stocks[0]
          const isETF = code.startsWith('00') && code.length >= 4
          return {
            name: s.name || code,
            price: s.price,
            isETF,
            exchange: s.exchange as 'tse' | 'otc',
            loading: false,
            error: '',
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
        {/* 快速套用目標配置 */}
        {allocationConfigs.length > 0 && (
          <div className={`mb-3 flex flex-wrap items-center gap-2 p-3 rounded-xl border transition-colors duration-500 ${applyFlash ? 'bg-emerald-50 border-emerald-300' : 'bg-slate-50 border-slate-200'}`}>
            <span className="text-xs font-semibold text-slate-500 shrink-0">🎯 套用目標配置</span>
            {allocationConfigs.length === 1 ? (
              <button
                onClick={() => applyConfig(allocationConfigs[0].id)}
                className="text-xs px-3 py-1.5 rounded-lg bg-[#2C5F8A] text-white font-medium hover:bg-[#1e4a6f] transition-colors"
              >
                {allocationConfigs[0].name} ({allocationConfigs[0].targetWeights.length} 支)
              </button>
            ) : (
              <>
                <select
                  value={selectedConfigId}
                  onChange={(e) => setSelectedConfigId(e.target.value)}
                  className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400/50"
                >
                  <option value="">選擇配置…</option>
                  {allocationConfigs.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.targetWeights.length} 支)
                    </option>
                  ))}
                </select>
                <button
                  disabled={!selectedConfigId}
                  onClick={() => { if (selectedConfigId) applyConfig(selectedConfigId) }}
                  className="text-xs px-3 py-1.5 rounded-lg bg-[#2C5F8A] text-white font-medium hover:bg-[#1e4a6f] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  套用
                </button>
              </>
            )}
            {applyFlash && (
              <span className="text-xs text-emerald-600 font-medium">✓ 已套用，查詢股價中…</span>
            )}
          </div>
        )}
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
