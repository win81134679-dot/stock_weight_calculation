import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * 股價 API — Yahoo Finance v8/finance/chart
 *
 * ‼ 關鍵：v8/chart 的昨收欄位是 chartPreviousClose，不是 previousClose
 *   v7/quote 的昨收欄位才是 regularMarketPreviousClose
 *   但 v7/quote 在 Vercel 伺服器 IP 被封鎖 → 必須使用 v8/chart
 *
 * 策略：
 * - 同時向 query1 / query2 雙主機嘗試，以防其中一個被封鎖
 * - 並發最多 8 個請求，兼顧速度與不過量
 * - 每個代碼先試 .TW（上市），再試 .TWO（上櫃）
 */

interface QuoteResult {
  code: string
  name: string
  price: number
  prevClose: number
  exchange: 'tse' | 'otc'
  isMarketOpen: boolean
}

function extractCode(raw: string): string {
  return raw.replace(/^(?:tse|otc)_/i, '').replace(/\.tw$/i, '').trim().toUpperCase()
}

const YAHOO_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Referer': 'https://finance.yahoo.com/',
  'Origin': 'https://finance.yahoo.com',
}

const FINMIND_BASE = 'https://api.finmindtrade.com/api/v4/data'

/**
 * FinMind taiwan_stock_tick_snapshot (Sponsor)
 * 備援：當 Yahoo 雙主機皆失敗時使用
 * close = 現價, change_price = 今日漲跌額 → prevClose = close - change_price
 */
async function fetchFinMindSnapshot(code: string): Promise<QuoteResult | null> {
  const token = process.env.FINMIND_API_TOKEN
  if (!token) return null

  try {
    const url = new URL(FINMIND_BASE)
    url.searchParams.set('dataset', 'taiwan_stock_tick_snapshot')
    url.searchParams.set('data_id', code)

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(8_000),
    })

    if (!res.ok) return null

    const json = await res.json() as {
      status?: number
      data?: Array<{
        stock_id: string
        close: number
        change_price: number
      }>
    }

    if (json.status !== 200 || !Array.isArray(json.data) || json.data.length === 0) return null

    const row = json.data[0]
    const price = Number(row.close)
    if (price <= 0) return null

    const changePrice = Number(row.change_price)
    const prevClose = price - changePrice

    return {
      code,
      name: code,        // snapshot 不含股名，以代號代替
      price,
      prevClose: prevClose > 0 ? prevClose : price,
      exchange: 'tse',   // snapshot 無交易所欄位，預設上市
      isMarketOpen: true, // 取到即時資料，視為開盤中
    }
  } catch {
    return null
  }
}

/**
 * 向 Yahoo Finance v8/chart 查詢單一 symbol。
 * 同時嘗試 query1 與 query2 兩個主機，以防其中一個被封鎖。
 * 昨收使用 chartPreviousClose（v8/chart 的正確欄位）。
 */
async function fetchYahooChart(symbol: string): Promise<QuoteResult | null> {
  for (const host of ['query1', 'query2']) {
    const url = `https://${host}.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=2d`
    try {
      const res = await fetch(url, {
        headers: YAHOO_HEADERS,
        cache: 'no-store',
        signal: AbortSignal.timeout(7000),
      })
      if (!res.ok) continue

      const data = await res.json() as {
        chart?: {
          result?: Array<{
            meta: {
              regularMarketPrice?: number
              chartPreviousClose?: number
              shortName?: string
              marketState?: string
            }
          }>
          error?: { code: string }
        }
      }

      if (data?.chart?.error) continue
      const meta = data?.chart?.result?.[0]?.meta
      if (!meta) continue

      const price = meta.regularMarketPrice ?? 0
      if (price <= 0) continue

      const isTWO = symbol.toUpperCase().endsWith('.TWO')
      const code = symbol.replace(/\.(TW|TWO)$/i, '').toUpperCase()

      return {
        code,
        name: (meta.shortName ?? '').trim() || code,
        price,
        // ‼ 正確欄位：chartPreviousClose（不是 previousClose）
        prevClose: (meta.chartPreviousClose ?? 0) > 0 ? (meta.chartPreviousClose as number) : 0,
        exchange: isTWO ? 'otc' : 'tse',
        isMarketOpen: meta.marketState === 'REGULAR',
      }
    } catch { /* 換下一個主機 */ }
  }
  return null
}

/**
 * 查詢單一代碼：Yahoo .TW → Yahoo .TWO → FinMind Snapshot 三段備援
 */
async function fetchCode(code: string): Promise<QuoteResult | null> {
  const tw = await fetchYahooChart(`${code}.TW`)
  if (tw) return tw
  const two = await fetchYahooChart(`${code}.TWO`)
  if (two) return two
  // Yahoo 雙主機皆失敗 → 使用 FinMind 即時快照備援
  return fetchFinMindSnapshot(code)
}

/**
 * 並發限制執行器：同時最多 limit 個請求，確保速度又不過量
 */
async function withConcurrency(
  codes: string[],
  limit: number
): Promise<QuoteResult[]> {
  const results: QuoteResult[] = []
  let idx = 0

  async function worker() {
    while (idx < codes.length) {
      const i = idx++
      const r = await fetchCode(codes[i])
      if (r) results.push(r)
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(limit, codes.length) }, () => worker())
  )
  return results
}

// ──────────────────────────────────────────────────────────────────
// Route Handler
// ──────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const codesParam = searchParams.get('codes')

  if (!codesParam) {
    return NextResponse.json(
      { error: '缺少 codes 參數，格式：tse_2330.tw|tse_0050.tw' },
      { status: 400 }
    )
  }

  try {
    const rawList = codesParam.split('|').map((s) => s.trim()).filter(Boolean)
    const codes = Array.from(new Set(rawList.map(extractCode)))

    // 並發 8 個請求同時查詢，兼顧速度與禮貌
    const stocks = await withConcurrency(codes, 8)

    return NextResponse.json({ stocks })
  } catch (error) {
    const message = error instanceof Error ? error.message : '未知錯誤'
    return NextResponse.json(
      { error: `無法取得股價: ${message}` },
      { status: 502 }
    )
  }
}
