'use client'

import React, { useState, useMemo, useCallback } from 'react'
import StockInput from '@/components/StockInput'
import FeeSettings from '@/components/FeeSettings'
import ResultTable from '@/components/ResultTable'
import PortfolioChart from '@/components/PortfolioChart'
import NotificationBar from '@/components/NotificationBar'
import { calculatePortfolio, formatMoney } from '@/lib/calculator'
import { Notification, PortfolioResult } from '@/lib/types'

interface StockRow {
  code: string
  name: string
  price: number
  weight: number
  isETF: boolean
  exchange: 'tse' | 'otc'
  loading: boolean
  error: string
}

const defaultStocks: StockRow[] = [
  { code: '', name: '', price: 0, weight: 25, isETF: false, exchange: 'tse', loading: false, error: '' },
  { code: '', name: '', price: 0, weight: 25, isETF: false, exchange: 'tse', loading: false, error: '' },
  { code: '', name: '', price: 0, weight: 25, isETF: false, exchange: 'tse', loading: false, error: '' },
  { code: '', name: '', price: 0, weight: 25, isETF: false, exchange: 'tse', loading: false, error: '' },
]

export default function Home() {
  const [stocks, setStocks] = useState<StockRow[]>(defaultStocks)
  const [totalFund, setTotalFund] = useState<number>(0)
  const [discount, setDiscount] = useState<number>(10)
  const [rebalanceDate, setRebalanceDate] = useState<string>('')
  const [notifications, setNotifications] = useState<Notification[]>([])

  const dismissNotification = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id))
  }, [])

  const result: PortfolioResult | null = useMemo(() => {
    const tw = stocks.reduce((s, st) => s + st.weight, 0)
    const hasValid = stocks.some((s) => s.price > 0 && s.weight > 0)
    if (!hasValid || totalFund <= 0 || Math.abs(tw - 100) > 0.01) return null

    const entries = stocks.map((s) => ({
      code: s.code, name: s.name, price: s.price,
      weight: s.weight, isETF: s.isETF, exchange: s.exchange,
    }))
    const res = calculatePortfolio(entries, totalFund, discount)

    const nots: Notification[] = []
    res.stocks.forEach((sr) => {
      if (sr.insufficientFund && sr.code) {
        nots.push({
          id: `ins-${sr.code}`,
          type: 'warning',
          message: `⚠️ ${sr.name || sr.code}（${sr.code}）權重 ${sr.weight}% 分配 $${formatMoney(sr.allocatedAmount)}，最低需要 $${formatMoney(sr.minRequired)} 元才能買入 1 股`,
        })
      }
    })
    setNotifications(nots)
    return res
  }, [stocks, totalFund, discount])

  const totalWeight = stocks.reduce((s, st) => s + st.weight, 0)

  return (
    <div className="min-h-screen bg-[#FAF9F6]">
      <NotificationBar notifications={notifications} onDismiss={dismissNotification} />
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">

        {/* Header */}
        <div className="bg-[#2C5F8A] rounded-2xl p-6 shadow-lg">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-white rounded-xl flex items-center justify-center shadow-inner shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.svg" alt="Logo" className="w-10 h-10" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-white tracking-wide">台股持有權重計算器</h1>
              <p className="text-sm text-white/70 mt-0.5">
                STOCK WEIGHT CALCULATOR — 即時股價 × 自訂權重 × 手續費試算
              </p>
            </div>
          </div>
        </div>

        {/* 設定區 */}
        <Section title="基本設定">
          <FeeSettings
            totalFund={totalFund} onTotalFundChange={setTotalFund}
            discount={discount} onDiscountChange={setDiscount}
            rebalanceDate={rebalanceDate} onRebalanceDateChange={setRebalanceDate}
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
          {Math.abs(totalWeight - 100) > 0.01 && totalWeight > 0 && (
            <div className="mt-3 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5 text-sm text-red-600">
              權重合計 {totalWeight.toFixed(1)}%，需調整為 100% 才能計算
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

        {/* Footer */}
        <div className="text-center text-xs text-slate-400 py-4">
          股價來源：台灣證券交易所 TWSE 公開資訊（延遲約 20 秒）<br />
          本工具僅供參考，不構成投資建議
        </div>
      </div>
    </div>
  )
}

function Section({ title, right, children }: {
  title: string
  right?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
      <div className="flex items-center justify-between mb-4">
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
