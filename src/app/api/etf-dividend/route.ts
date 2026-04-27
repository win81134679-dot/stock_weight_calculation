import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface DivRecord {
  exDate: string       // 'YYYY-MM-DD'
  cashPerShare: number
}

const cache = new Map<string, { records: DivRecord[]; expiry: number }>()
const CACHE_TTL_MS = 6 * 60 * 60 * 1000 // 6 hours

/**
 * Yahoo Finance chart API — 取得近 5 年配息紀錄
 * Endpoint: https://query2.finance.yahoo.com/v8/finance/chart/{code}.TW?events=dividends&range=5y&interval=1d
 * Response.chart.result[0].events.dividends: { [unixTs]: { amount, date } }
 */
async function fetchYahooDividends(code: string): Promise<DivRecord[]> {
  const symbol = encodeURIComponent(`${code}.TW`)
  const url = `https://query2.finance.yahoo.com/v8/finance/chart/${symbol}?events=dividends&range=5y&interval=1d`
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json',
      },
      cache: 'no-store',
    })
    if (!res.ok) return []

    const json = await res.json()
    const result = json?.chart?.result?.[0]
    if (!result) return []

    const dividends = result?.events?.dividends
    if (!dividends || typeof dividends !== 'object') return []

    const records: DivRecord[] = []
    for (const entry of Object.values(dividends) as Array<{ amount: number; date: number }>) {
      const cashPerShare = entry?.amount
      const ts = entry?.date
      if (!cashPerShare || !ts || isNaN(cashPerShare) || cashPerShare <= 0) continue
      const exDate = new Date(ts * 1000).toISOString().slice(0, 10)
      records.push({ exDate, cashPerShare })
    }
    return records
  } catch {
    return []
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const code = (searchParams.get('code') ?? '').trim().toUpperCase()

  if (!code) {
    return NextResponse.json({ error: '缺少 code 參數' }, { status: 400 })
  }

  // Cache hit
  const cached = cache.get(code)
  if (cached && Date.now() < cached.expiry) {
    return NextResponse.json({ code, records: cached.records, cached: true })
  }

  const records = await fetchYahooDividends(code)

  // Sort newest first
  records.sort((a, b) => b.exDate.localeCompare(a.exDate))

  cache.set(code, { records, expiry: Date.now() + CACHE_TTL_MS })

  return NextResponse.json({ code, records, cached: false })
}
