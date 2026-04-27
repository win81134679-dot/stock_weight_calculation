import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Server-side cache: code -> { high52w, low52w, expiry }
const cache = new Map<string, { high52w: number; low52w: number; expiry: number }>()
const CACHE_TTL_MS = 4 * 60 * 60 * 1000 // 4 hours

/**
 * 產生最近 N 個月的 YYYYMM01 日期字串（TWSE STOCK_DAY 用第一天即可）
 */
function recentMonthDates(count: number): string[] {
  const dates: string[] = []
  const now = new Date()
  for (let i = 0; i < count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const yyyy = d.getFullYear()
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    dates.push(`${yyyy}${mm}01`)
  }
  return dates
}

/**
 * 呼叫 TWSE 月報 API，回傳當月的高低價清單
 * STOCK_DAY 欄位: 日期, 成交股數, 成交金額, 開盤價, 最高價, 最低價, 收盤價, ...
 * index: 0=日期, 3=開盤, 4=最高, 5=最低, 6=收盤
 */
async function fetchMonthHighLow(
  stockNo: string,
  dateStr: string,
  exchange: string
): Promise<{ high: number; low: number } | null> {
  try {
    let url: string
    if (exchange === 'otc') {
      // TPEX 上市 OTC 月報
      // ROC year (民國): yyyy - 1911
      const year = parseInt(dateStr.substring(0, 4)) - 1911
      const month = dateStr.substring(4, 6)
      url = `https://www.tpex.org.tw/web/stock/aftertrading/daily_trading_info/st43_result.php?l=zh-tw&d=${year}/${month}&stkno=${stockNo}&_=${Date.now()}`
    } else {
      url = `https://www.twse.com.tw/rwd/zh/afterTrading/STOCK_DAY?response=json&date=${dateStr}&stockNo=${stockNo}&_=${Date.now()}`
    }

    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json, text/html',
        'Referer': exchange === 'otc' ? 'https://www.tpex.org.tw/' : 'https://www.twse.com.tw/',
      },
      cache: 'no-store',
    })

    if (!res.ok) return null

    const json = await res.json()

    let rows: string[][] = []
    if (exchange === 'otc') {
      // TPEX response: { aaData: [[...], ...] }
      rows = json.aaData ?? []
    } else {
      // TWSE response: { stat: 'OK', data: [[...], ...] }
      if (json.stat !== 'OK' && json.stat !== 'ok') return null
      rows = json.data ?? []
    }

    if (rows.length === 0) return null

    let high = -Infinity
    let low = Infinity

    for (const row of rows) {
      // TSE: index 4 = 最高, 5 = 最低
      // OTC: similar layout (open=3, high=4, low=5, close=6)
      const h = parseFloat((row[4] ?? '').replace(/,/g, ''))
      const l = parseFloat((row[5] ?? '').replace(/,/g, ''))
      if (!isNaN(h) && h > 0) high = Math.max(high, h)
      if (!isNaN(l) && l > 0) low = Math.min(low, l)
    }

    if (high === -Infinity || low === Infinity) return null
    return { high, low }
  } catch {
    return null
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const code = (searchParams.get('code') ?? '').trim().toUpperCase()
  const exchange = searchParams.get('exchange') ?? 'tse'

  if (!code) {
    return NextResponse.json({ error: '缺少 code 參數' }, { status: 400 })
  }

  // Check cache
  const cached = cache.get(code)
  if (cached && Date.now() < cached.expiry) {
    return NextResponse.json({ code, high52w: cached.high52w, low52w: cached.low52w, cached: true })
  }

  // Fetch 12 months in parallel
  const dates = recentMonthDates(12)
  const results = await Promise.all(
    dates.map((d) => fetchMonthHighLow(code, d, exchange))
  )

  const validResults = results.filter(Boolean) as { high: number; low: number }[]
  if (validResults.length === 0) {
    return NextResponse.json({ error: `無法取得 ${code} 的歷史資料` }, { status: 404 })
  }

  const high52w = Math.max(...validResults.map((r) => r.high))
  const low52w = Math.min(...validResults.map((r) => r.low))

  // Store in cache
  cache.set(code, { high52w, low52w, expiry: Date.now() + CACHE_TTL_MS })

  return NextResponse.json({ code, high52w, low52w, cached: false })
}
