import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Yahoo Finance v7/quote 批次 API — 防限流五大策略：
 * 1. 批次請求：一次最多 40 symbol，大幅減少 HTTP 請求總數
 * 2. 瀏覽器標頭：模擬真實瀏覽器，降低被偵測為 bot 的機率
 * 3. 指數退避重試：遇到 429 Too Many Requests 自動等待後重試
 * 4. 批次間保護延遲：每批次間隔 200ms，避免爆量送出
 * 5. 正確 prevClose 欄位：v7 的 regularMarketPreviousClose 永遠準確
 */
const BATCH_SIZE = 40
const RETRY_DELAYS = [0, 800, 2000] as const

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

/** 模擬正常瀏覽器標頭，降低被限流機率 */
const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7',
  'Referer': 'https://finance.yahoo.com/',
  'sec-fetch-dest': 'empty',
  'sec-fetch-mode': 'cors',
  'sec-fetch-site': 'same-site',
} as const

/** 帶退避重試的 fetch：遇到 429 自動等待後重試最多 3 次 */
async function fetchWithRetry(url: string): Promise<Response | null> {
  for (let attempt = 0; attempt < RETRY_DELAYS.length; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, RETRY_DELAYS[attempt]))
    try {
      const res = await fetch(url, { headers: BROWSER_HEADERS, cache: 'no-store' })
      if (res.status === 429) continue // rate limited → retry
      if (!res.ok) return null
      return res
    } catch {
      if (attempt === RETRY_DELAYS.length - 1) return null
    }
  }
  return null
}

/**
 * v7/finance/quote 批次 API —— 一次請求取得所有股票即時報價
 * 比 v8/chart 快：不需 N 次串接請求，一個批次即完成
 */
async function batchFetchQuotes(symbols: string[]): Promise<Map<string, QuoteResult>> {
  const result = new Map<string, QuoteResult>()
  if (symbols.length === 0) return result

  for (let i = 0; i < symbols.length; i += BATCH_SIZE) {
    if (i > 0) await new Promise((r) => setTimeout(r, 200)) // 批次間保護延遲
    const chunk = symbols.slice(i, i + BATCH_SIZE)
    const url = `https://query2.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(chunk.join(','))}&fields=regularMarketPrice,regularMarketPreviousClose,shortName,marketState&lang=zh-TW&region=TW&formatted=false`

    const res = await fetchWithRetry(url)
    if (!res) continue

    try {
      const data = await res.json() as {
        quoteResponse?: {
          result?: Array<{
            symbol: string
            regularMarketPrice?: number
            regularMarketPreviousClose?: number
            shortName?: string
            marketState?: string
          }>
        }
      }
      for (const q of (data?.quoteResponse?.result ?? [])) {
        const sym = (q.symbol ?? '').toUpperCase()
        const isTWO = sym.endsWith('.TWO')
        const code = sym.replace(/\.(TW|TWO)$/, '')
        const price = q.regularMarketPrice ?? 0
        const prevClose = q.regularMarketPreviousClose ?? 0
        if (price > 0) {
          result.set(code, {
            code,
            name: (q.shortName ?? '').trim() || code,
            price,
            prevClose: prevClose > 0 ? prevClose : 0,
            exchange: isTWO ? 'otc' : 'tse',
            isMarketOpen: q.marketState === 'REGULAR',
          })
        }
      }
    } catch { /* ignore parse errors */ }
  }
  return result
}

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

    // 第一輪：全部試 .TW（上市、含字母代碼如 00988A 均適用）
    const twResults = await batchFetchQuotes(codes.map((c) => `${c}.TW`))

    const stocks: QuoteResult[] = []
    const notFound: string[] = []

    for (const code of codes) {
      const hit = twResults.get(code)
      if (hit) {
        stocks.push(hit)
      } else {
        notFound.push(code)
      }
    }

    // 第二輪：.TW 找不到的改試 .TWO（上櫃）
    if (notFound.length > 0) {
      const twoResults = await batchFetchQuotes(notFound.map((c) => `${c}.TWO`))
      for (const code of notFound) {
        const hit = twoResults.get(code)
        if (hit) stocks.push(hit)
      }
    }

    return NextResponse.json({ stocks })
  } catch (error) {
    const message = error instanceof Error ? error.message : '未知錯誤'
    return NextResponse.json(
      { error: `無法連線至 Yahoo Finance: ${message}` },
      { status: 502 }
    )
  }
}
