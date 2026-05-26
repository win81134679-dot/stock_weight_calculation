'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { UsPriceCache, UsStockPriceResponse } from '@/lib/us-types'

const PRICE_TTL_MS = 30_000
const POLL_INTERVAL_MS = 30_000

export function useUsCurrentPrices() {
  const [prices, setPrices] = useState<Record<string, UsPriceCache>>({})
  const [fxRate, setFxRate] = useState<number>(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [secondsUntilRefresh, setSecondsUntilRefresh] = useState(0)
  const cacheRef = useRef<Record<string, UsPriceCache>>({})
  const symbolsRef = useRef<string[]>([])
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchPrices = useCallback(async (symbols: string[]) => {
    const uniqueSymbols = Array.from(new Set(symbols.map((symbol) => symbol.trim().toUpperCase()).filter(Boolean)))
    if (uniqueSymbols.length === 0) return

    const now = Date.now()
    const staleSymbols = uniqueSymbols.filter((symbol) => !cacheRef.current[symbol] || now - cacheRef.current[symbol].fetchedAt > PRICE_TTL_MS)
    if (staleSymbols.length === 0) return

    setLoading(true)
    setError(null)

    try {
      const res = await fetch(`/api/us-stock-price?symbols=${encodeURIComponent(staleSymbols.join('|'))}`)
      const data = await res.json() as UsStockPriceResponse & { error?: string }
      if (!res.ok) {
        throw new Error(data.error ?? '無法取得美股報價')
      }

      const next = { ...cacheRef.current }
      const nextFxRate = data.fxRate
      if (!(nextFxRate > 0)) {
        throw new Error('無法取得 USD/TWD 匯率')
      }

      for (const quote of data.stocks ?? []) {
        next[quote.symbol] = {
          symbol: quote.symbol,
          name: quote.name,
          exchange: quote.exchange,
          priceUsd: quote.priceUsd,
          prevCloseUsd: quote.prevCloseUsd,
          priceTwd: Math.round(quote.priceUsd * nextFxRate),
          prevCloseTwd: Math.round(quote.prevCloseUsd * nextFxRate),
          currency: 'USD',
          isETF: quote.isETF,
          fetchedAt: now,
          isMarketOpen: quote.isMarketOpen,
          marketState: quote.marketState,
        }
      }

      cacheRef.current = next
      setPrices({ ...next })
      setFxRate(nextFxRate)
      setSecondsUntilRefresh(Math.round(PRICE_TTL_MS / 1000))

      const historyTargets = staleSymbols.filter((symbol) => !cacheRef.current[symbol]?.high52wUsd)
      if (historyTargets.length > 0) {
        void Promise.all(historyTargets.map(async (symbol) => {
          try {
            const historyRes = await fetch(`/api/us-stock-history?symbol=${encodeURIComponent(symbol)}`)
            if (!historyRes.ok) return
            const history = await historyRes.json() as { high52wUsd?: number; low52wUsd?: number }
            if (!history.high52wUsd || !history.low52wUsd || !cacheRef.current[symbol]) return
            cacheRef.current[symbol] = {
              ...cacheRef.current[symbol],
              high52wUsd: history.high52wUsd,
              low52wUsd: history.low52wUsd,
            }
            setPrices((prev) => ({
              ...prev,
              [symbol]: {
                ...prev[symbol],
                high52wUsd: history.high52wUsd,
                low52wUsd: history.low52wUsd,
              },
            }))
          } catch {
            // history is optional
          }
        }))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '無法取得美股報價')
    } finally {
      setLoading(false)
    }
  }, [])

  const refreshPrices = useCallback((symbols: string[]) => {
    const uniqueSymbols = Array.from(new Set(symbols.map((symbol) => symbol.trim().toUpperCase()).filter(Boolean)))
    uniqueSymbols.forEach((symbol) => {
      if (cacheRef.current[symbol]) {
        cacheRef.current[symbol] = { ...cacheRef.current[symbol], fetchedAt: 0 }
      }
    })
    return fetchPrices(uniqueSymbols)
  }, [fetchPrices])

  const startAutoRefresh = useCallback((symbols: string[]) => {
    symbolsRef.current = symbols
    if (pollTimerRef.current) clearInterval(pollTimerRef.current)
    if (countdownRef.current) clearInterval(countdownRef.current)

    countdownRef.current = setInterval(() => {
      setSecondsUntilRefresh((prev) => Math.max(0, prev - 1))
    }, 1000)

    pollTimerRef.current = setInterval(() => {
      refreshPrices(symbolsRef.current)
    }, POLL_INTERVAL_MS)
  }, [refreshPrices])

  const stopAutoRefresh = useCallback(() => {
    if (pollTimerRef.current) clearInterval(pollTimerRef.current)
    if (countdownRef.current) clearInterval(countdownRef.current)
    pollTimerRef.current = null
    countdownRef.current = null
  }, [])

  useEffect(() => {
    return () => stopAutoRefresh()
  }, [stopAutoRefresh])

  const isAnyMarketOpen = Object.values(prices).some((price) => price.isMarketOpen)

  return {
    prices,
    fxRate,
    loading,
    error,
    fetchPrices,
    refreshPrices,
    startAutoRefresh,
    stopAutoRefresh,
    secondsUntilRefresh,
    isMarketOpen: isAnyMarketOpen,
  }
}
