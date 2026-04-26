'use client'

/**
 * useCurrentPrices.ts
 * Batch-fetch current prices for all tracked ETF codes.
 * Handles letter-suffix codes like 00988A, 00997A by trying both tse/otc.
 */

import { useState, useCallback, useRef } from 'react'
import { PriceCache } from '@/lib/types'
import { isETF } from '@/lib/etf-codes'

const PRICE_TTL_MS = 60_000 // 1 minute cache

export function useCurrentPrices() {
  const [prices, setPrices] = useState<Record<string, PriceCache>>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const cacheRef = useRef<Record<string, PriceCache>>({})

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

      // Build query params: try tse first, then otc for each code
      // TWSE API supports pipe-separated: tse_00927.tw|tse_00988A.tw|...
      // For codes with letter suffix (00988A) we need to try both exchanges.
      // We batch all as tse first, collect failures, then retry as otc.

      const tseParam = stale.map((c) => `tse_${c}.tw`).join('|')
      const res = await fetch(`/api/stock-price?codes=${encodeURIComponent(tseParam)}`)
      const data = await res.json()

      const foundCodes = new Set<string>()

      if (data.msgArray && Array.isArray(data.msgArray)) {
        for (const info of data.msgArray) {
          const code = (info.c ?? '').trim().toUpperCase()
          if (!code) continue

          const rawPrice = parseFloat(info.z)
          const fallback = parseFloat(info.y)
          const price = !isNaN(rawPrice) && rawPrice > 0 ? rawPrice : fallback

          if (!isNaN(price) && price > 0) {
            const cache: PriceCache = {
              code,
              name: (info.n ?? '').trim() || code,
              price,
              exchange: 'tse',
              isETF: isETF(code),
              fetchedAt: now,
            }
            results[code] = cache
            foundCodes.add(code)
          }
        }
      }

      // Retry not-found codes as otc
      const otcCodes = stale.filter((c) => !foundCodes.has(c))
      if (otcCodes.length > 0) {
        const otcParam = otcCodes.map((c) => `otc_${c}.tw`).join('|')
        const res2 = await fetch(`/api/stock-price?codes=${encodeURIComponent(otcParam)}`)
        const data2 = await res2.json()

        if (data2.msgArray && Array.isArray(data2.msgArray)) {
          for (const info of data2.msgArray) {
            const code = (info.c ?? '').trim().toUpperCase()
            if (!code) continue
            const rawPrice = parseFloat(info.z)
            const fallback = parseFloat(info.y)
            const price = !isNaN(rawPrice) && rawPrice > 0 ? rawPrice : fallback
            if (!isNaN(price) && price > 0) {
              results[code] = {
                code,
                name: (info.n ?? '').trim() || code,
                price,
                exchange: 'otc',
                isETF: isETF(code),
                fetchedAt: now,
              }
            }
          }
        }
      }

      cacheRef.current = results
      setPrices({ ...results })
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

  return { prices, loading, error, fetchPrices, refreshPrices }
}
