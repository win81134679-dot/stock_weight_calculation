'use client'

/**
 * useCurrentPrices.ts
 * Batch-fetch current prices for all tracked ETF codes.
 * Handles letter-suffix codes like 00988A, 00997A by trying both tse/otc.
 * v2: adds secondsUntilRefresh countdown + isMarketHours + auto-polling.
 */

import { useState, useCallback, useRef, useEffect } from 'react'
import { PriceCache } from '@/lib/types'
import { isETF } from '@/lib/etf-codes'

const PRICE_TTL_MS = 30_000 // 30 秒快取（配合輪詢間隔）
const POLL_INTERVAL_MS = 30_000 // 盤中每 30 秒刷新（Yahoo v8/chart 安全閾值）

/** 判斷現在是否在台股交易時段（週一~五 09:00~13:30 台灣時間） */
function isMarketHours(): boolean {
  const now = new Date()
  // Convert to Asia/Taipei (+08:00)
  const tpe = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Taipei' }))
  const day = tpe.getDay() // 0=Sun, 6=Sat
  if (day === 0 || day === 6) return false
  const h = tpe.getHours()
  const m = tpe.getMinutes()
  const minutes = h * 60 + m
  return minutes >= 9 * 60 && minutes <= 13 * 60 + 30
}

export function useCurrentPrices() {
  const [prices, setPrices] = useState<Record<string, PriceCache>>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [secondsUntilRefresh, setSecondsUntilRefresh] = useState<number>(0)
  const cacheRef = useRef<Record<string, PriceCache>>({})
  const lastFetchRef = useRef<number>(0)
  const codesRef = useRef<string[]>([])
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchPrices = useCallback(async (codes: string[]) => {
    const unique = Array.from(new Set(codes.map((c) => c.trim().toUpperCase()).filter(Boolean)))
    if (unique.length === 0) return

    // Filter out fresh cache hits
    const now = Date.now()
    const stale = unique.filter(
      (c) => !cacheRef.current[c] || now - cacheRef.current[c].fetchedAt > PRICE_TTL_MS
    )
    if (stale.length === 0) return

    setLoading(true)
    setError(null)

    try {
      const results: Record<string, PriceCache> = { ...cacheRef.current }

      // Route 內部已自動處理 .TW → .TWO fallback，一次呼叫即可取得上市與上櫃
      const tseParam = stale.map((c) => `tse_${c}.tw`).join('|')
      const res = await fetch(`/api/stock-price?codes=${encodeURIComponent(tseParam)}`)
      const data = await res.json()

      const foundCodes = new Set<string>()

      if (data.stocks && Array.isArray(data.stocks)) {
        for (const s of data.stocks) {
          const code = (s.code ?? '').trim().toUpperCase()
          if (!code || !(s.price > 0)) continue
          const cache: PriceCache = {
            code,
            name: (s.name ?? '').trim() || code,
            price: s.price,
            prevClose: s.prevClose > 0 ? s.prevClose : 0,
            exchange: s.exchange as 'tse' | 'otc',
            isETF: isETF(code),
            fetchedAt: now,
            isMarketOpen: s.isMarketOpen,
          }
          results[code] = cache
          foundCodes.add(code)
        }
      }

      // 安全備援：第一輪仍未找到的代碼（理論上 route 內已處理，此層保留作 failsafe）
      const otcCodes = stale.filter((c) => !foundCodes.has(c))
      if (otcCodes.length > 0) {
        const otcParam = otcCodes.map((c) => `otc_${c}.tw`).join('|')
        const res2 = await fetch(`/api/stock-price?codes=${encodeURIComponent(otcParam)}`)
        const data2 = await res2.json()

        if (data2.stocks && Array.isArray(data2.stocks)) {
          for (const s of data2.stocks) {
            const code = (s.code ?? '').trim().toUpperCase()
            if (!code || !(s.price > 0)) continue
            results[code] = {
              code,
              name: (s.name ?? '').trim() || code,
              price: s.price,
              prevClose: s.prevClose > 0 ? s.prevClose : 0,
              exchange: s.exchange as 'tse' | 'otc',
              isETF: isETF(code),
              fetchedAt: now,
              isMarketOpen: s.isMarketOpen,
            }
          }
        }
      }

      cacheRef.current = results
      setPrices({ ...results })
      lastFetchRef.current = now
      setSecondsUntilRefresh(Math.round(PRICE_TTL_MS / 1000))

      // Background: fetch 52-week H/L for codes that don't have it yet
      const codesNeedingHistory = stale.filter(
        (c) => !cacheRef.current[c]?.high52w
      )
      if (codesNeedingHistory.length > 0) {
        // Non-blocking background fetch — no await
        void (async () => {
          for (const c of codesNeedingHistory) {
            try {
              const exchange = cacheRef.current[c]?.exchange ?? 'tse'
              const r = await fetch(`/api/stock-history?code=${encodeURIComponent(c)}&exchange=${exchange}`)
              if (!r.ok) continue
              const d = await r.json()
              if (d.high52w && d.low52w && cacheRef.current[c]) {
                cacheRef.current[c] = { ...cacheRef.current[c], high52w: d.high52w, low52w: d.low52w }
                setPrices((prev) => ({
                  ...prev,
                  [c]: { ...prev[c], high52w: d.high52w, low52w: d.low52w },
                }))
              }
            } catch {
              // ignore — 52w data is optional
            }
          }
        })()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '股價查詢失敗')
    } finally {
      setLoading(false)
    }
  }, [])

  const refreshPrices = useCallback((codes: string[]) => {
    // Force invalidate cache and re-fetch
    const unique = Array.from(new Set(codes.map((c) => c.trim().toUpperCase()).filter(Boolean)))
    for (const c of unique) {
      if (cacheRef.current[c]) {
        cacheRef.current[c] = { ...cacheRef.current[c], fetchedAt: 0 }
      }
    }
    return fetchPrices(codes)
  }, [fetchPrices])

  /** 啟動自動輪詢（盤中每 60s 刷新，盤後不輪詢）＋ 倒數計時器 */
  const startAutoRefresh = useCallback((codes: string[]) => {
    codesRef.current = codes

    // 清除舊計時器
    if (pollTimerRef.current) clearInterval(pollTimerRef.current)
    if (countdownRef.current) clearInterval(countdownRef.current)

    // 倒數每秒 -1
    countdownRef.current = setInterval(() => {
      setSecondsUntilRefresh((prev) => {
        if (prev <= 1) return 0
        return prev - 1
      })
    }, 1000)

    // 盤中自動輪詢
    if (isMarketHours()) {
      pollTimerRef.current = setInterval(() => {
        refreshPrices(codesRef.current)
      }, POLL_INTERVAL_MS)
    }
  }, [refreshPrices])

  const stopAutoRefresh = useCallback(() => {
    if (pollTimerRef.current) { clearInterval(pollTimerRef.current); pollTimerRef.current = null }
    if (countdownRef.current) { clearInterval(countdownRef.current); countdownRef.current = null }
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => stopAutoRefresh()
  }, [stopAutoRefresh])

  return {
    prices,
    loading,
    error,
    fetchPrices,
    refreshPrices,
    startAutoRefresh,
    stopAutoRefresh,
    secondsUntilRefresh,
    isMarketHours: isMarketHours(),
  }
}

