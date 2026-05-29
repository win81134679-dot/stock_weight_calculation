'use client'

/**
 * UsIndexCard.tsx
 * 美股大盤指數卡（S&P 500 / Nasdaq / 道瓊）— 取代台股加權指數卡。
 * 透過既有 /api/us-stock-price 抓取（指數符號 ^GSPC 等走同一 Yahoo chart 端點）。
 */

import React, { useEffect, useState } from 'react'
import { US_INDEX_SYMBOLS, marketStateLabel } from '@/lib/us-market'

interface IndexQuote {
  symbol: string
  label: string
  priceUsd: number
  prevCloseUsd: number
  marketState: string
}

export default function UsIndexCard() {
  const [quotes, setQuotes] = useState<IndexQuote[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const symbols = US_INDEX_SYMBOLS.map((item) => item.symbol).join('|')
        const res = await fetch(`/api/us-stock-price?symbols=${encodeURIComponent(symbols)}`)
        const data = await res.json() as { stocks?: Array<{ symbol: string; priceUsd: number; prevCloseUsd: number; marketState: string }> }
        if (cancelled) return
        const mapped: IndexQuote[] = US_INDEX_SYMBOLS.map((item) => {
          const quote = data.stocks?.find((stock) => stock.symbol === item.symbol)
          return {
            symbol: item.symbol,
            label: item.label,
            priceUsd: quote?.priceUsd ?? 0,
            prevCloseUsd: quote?.prevCloseUsd ?? 0,
            marketState: quote?.marketState ?? 'CLOSED',
          }
        })
        setQuotes(mapped)
      } catch {
        // 指數卡為輔助資訊，失敗時靜默
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    const timer = setInterval(load, 60_000)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [])

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <div className="font-semibold text-[#1A1A2E]">美股大盤</div>
        <div className="text-xs text-slate-400">
          {quotes[0] ? marketStateLabel(quotes[0].marketState) : (loading ? '載入中…' : '—')}
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        {quotes.map((quote) => {
          const change = quote.prevCloseUsd > 0 ? quote.priceUsd - quote.prevCloseUsd : 0
          const changePct = quote.prevCloseUsd > 0 ? (change / quote.prevCloseUsd) * 100 : 0
          const up = change >= 0
          return (
            <div key={quote.symbol} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
              <div className="text-[11px] text-slate-400">{quote.label}</div>
              <div className="mt-1 font-mono font-bold text-sm text-[#1A1A2E]">
                {quote.priceUsd > 0 ? quote.priceUsd.toLocaleString('en-US', { maximumFractionDigits: 2 }) : '—'}
              </div>
              <div className={`text-[11px] font-mono ${up ? 'text-emerald-600' : 'text-red-500'}`}>
                {quote.priceUsd > 0 ? `${up ? '+' : ''}${changePct.toFixed(2)}%` : ''}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
