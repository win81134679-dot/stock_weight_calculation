import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** 每批最多同時請求的數量，避免 Yahoo Finance rate limit */
const BATCH_SIZE = 5
/** 每批之間的延遲 (ms) */
const BATCH_DELAY_MS = 350

interface YahooQuoteResult {
  code: string
  name: string
  price: number
  prevClose: number
  exchange: 'tse' | 'otc'
  isMarketOpen: boolean
}

/**
 * 從 codes 字串（如 "tse_2330.tw|otc_6488.tw"）中提取純代碼
 * 支援：tse_XXX.tw、otc_XXX.tw、或直接裸代碼
 */
function extractCode(raw: string): string {
  return raw.replace(/^(?:tse|otc)_/i, '').replace(/\.tw$/i, '').trim().toUpperCase()
}

async function fetchYahooQuote(
  symbol: string
): Promise<{ meta: Record<string, unknown> } | null> {
  const url = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
      },
      cache: 'no-store',
    })
    if (!res.ok) return null
    const data = await res.json() as { chart?: { result?: Array<{ meta: Record<string, unknown> }> } }
    return data?.chart?.result?.[0] ?? null
  } catch {
    return null
  }
}

/**
 * 批次查詢，每 BATCH_SIZE 個為一組，組間延遲 BATCH_DELAY_MS
 * 回傳 symbol → result 的 Map
 */
async function fetchBatch(
  symbols: string[]
): Promise<Map<string, { meta: Record<string, unknown> }>> {
  const resultMap = new Map<string, { meta: Record<string, unknown> }>()
  for (let i = 0; i < symbols.length; i += BATCH_SIZE) {
    if (i > 0) {
      await new Promise((r) => setTimeout(r, BATCH_DELAY_MS))
    }
    const chunk = symbols.slice(i, i + BATCH_SIZE)
    const settled = await Promise.allSettled(chunk.map((sym) => fetchYahooQuote(sym)))
    settled.forEach((r, idx) => {
      if (r.status === 'fulfilled' && r.value) {
        resultMap.set(chunk[idx], r.value)
      }
    })
  }
  return resultMap
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
    const codes = rawList.map(extractCode)
    const unique = Array.from(new Set(codes))

    // 第一輪：全部試 .TW（上市、含字母代碼如 00988A 均適用）
    const twSymbols = unique.map((c) => `${c}.TW`)
    const twResults = await fetchBatch(twSymbols)

    const stocks: YahooQuoteResult[] = []
    const notFound: string[] = []

    for (const code of unique) {
      const hit = twResults.get(`${code}.TW`)
      if (hit) {
        const meta = hit.meta
        const rawPrice = meta.regularMarketPrice as number | undefined
        const prevClose = meta.previousClose as number | undefined
        if (rawPrice && rawPrice > 0) {
          stocks.push({
            code,
            name: ((meta.shortName as string) ?? '').trim() || code,
            price: rawPrice,
            prevClose: prevClose && prevClose > 0 ? prevClose : rawPrice,
            exchange: 'tse',
            isMarketOpen: (meta.marketState as string) === 'REGULAR',
          })
          continue
        }
      }
      notFound.push(code)
    }

    // 第二輪：.TW 找不到的改試 .TWO（上櫃）
    if (notFound.length > 0) {
      const twoSymbols = notFound.map((c) => `${c}.TWO`)
      const twoResults = await fetchBatch(twoSymbols)

      for (const code of notFound) {
        const hit = twoResults.get(`${code}.TWO`)
        if (!hit) continue
        const meta = hit.meta
        const rawPrice = meta.regularMarketPrice as number | undefined
        const prevClose = meta.previousClose as number | undefined
        if (rawPrice && rawPrice > 0) {
          stocks.push({
            code,
            name: ((meta.shortName as string) ?? '').trim() || code,
            price: rawPrice,
            prevClose: prevClose && prevClose > 0 ? prevClose : rawPrice,
            exchange: 'otc',
            isMarketOpen: (meta.marketState as string) === 'REGULAR',
          })
        }
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
