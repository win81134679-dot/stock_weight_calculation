import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * 股價 API — 雙層資料源架構
 *
 * 主要：TWSE 台灣證券交易所官方即時 API
 *   - 不需認證、不被 Vercel 伺服器 IP 封鎖
 *   - 同時支援上市 (tse) 和上櫃 (otc)
 *   - 提供昨收 (y 欄位) 和即時成交 (z 欄位)
 *
 * 備用：Yahoo Finance v8/finance/chart（逐支查詢）
 *   - 當 TWSE 找不到某代碼時啟用
 *   - 使用正確的 chartPreviousClose 欄位
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

// ──────────────────────────────────────────────────────────────────
// 主要資料源：TWSE 官方 API
// ──────────────────────────────────────────────────────────────────

interface TWSEItem {
  c: string   // 代號
  n: string   // 名稱
  ex: string  // 'tse' | 'otc'
  z: string   // 成交價（休市時為 '-'）
  y: string   // 昨收
}

/**
 * 批次向 TWSE 查詢即時報價。
 * 每個代碼同時嘗試 tse_ 與 otc_ 前綴，API 只回傳有效者。
 */
async function fetchTWSEQuotes(codes: string[]): Promise<Map<string, QuoteResult>> {
  const result = new Map<string, QuoteResult>()
  if (codes.length === 0) return result

  // 每個代碼都嘗試兩個交易所前綴，讓 TWSE 自動過濾無效者
  const exChList = codes.flatMap((c) => [
    `tse_${c.toLowerCase()}.tw`,
    `otc_${c.toLowerCase()}.tw`,
  ])

  const CHUNK = 60 // TWSE 建議每次查詢不超過此數量
  for (let i = 0; i < exChList.length; i += CHUNK) {
    const chunk = exChList.slice(i, i + CHUNK)
    const exCh = chunk.join('|')
    const url = `https://mis.twse.com.tw/stock/api/getStockInfo.jsp?ex_ch=${exCh}&json=1&delay=0`

    try {
      const res = await fetch(url, {
        headers: {
          'Accept': 'application/json, text/plain, */*',
          'Referer': 'https://mis.twse.com.tw/',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
        cache: 'no-store',
        signal: AbortSignal.timeout(8000),
      })
      if (!res.ok) continue

      const data = await res.json() as { msgArray?: TWSEItem[] }
      for (const item of (data?.msgArray ?? [])) {
        const code = (item.c ?? '').trim().toUpperCase()
        if (!code || result.has(code)) continue

        const prevClose = parseFloat(item.y)
        const isOpen = item.z !== '-' && item.z !== '' && !isNaN(parseFloat(item.z))
        const price = isOpen ? parseFloat(item.z) : prevClose

        if (price > 0) {
          result.set(code, {
            code,
            name: (item.n ?? '').trim() || code,
            price,
            prevClose: isOpen && prevClose > 0 ? prevClose : 0,
            exchange: item.ex === 'otc' ? 'otc' : 'tse',
            isMarketOpen: isOpen,
          })
        }
      }
    } catch { /* 忽略單批次錯誤，繼續下一批 */ }
  }

  return result
}

// ──────────────────────────────────────────────────────────────────
// 備用資料源：Yahoo Finance v8/chart（單支查詢）
// ──────────────────────────────────────────────────────────────────

async function fetchYahooFallback(symbol: string): Promise<QuoteResult | null> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=2d`
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'application/json',
        'Referer': 'https://finance.yahoo.com/',
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(6000),
    })
    if (!res.ok) return null

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
      }
    }

    const meta = data?.chart?.result?.[0]?.meta
    if (!meta) return null

    const price = meta.regularMarketPrice ?? 0
    if (price <= 0) return null

    const isTWO = symbol.toUpperCase().endsWith('.TWO')
    const code = symbol.replace(/\.(TW|TWO)$/i, '').toUpperCase()

    return {
      code,
      name: (meta.shortName ?? '').trim() || code,
      price,
      prevClose: (meta.chartPreviousClose ?? 0) > 0 ? (meta.chartPreviousClose as number) : 0,
      exchange: isTWO ? 'otc' : 'tse',
      isMarketOpen: meta.marketState === 'REGULAR',
    }
  } catch {
    return null
  }
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

    // 第一輪：TWSE 官方 API（主要，不被 Vercel IP 封鎖）
    const twseResult = await fetchTWSEQuotes(codes)

    const stocks: QuoteResult[] = []
    const notFound: string[] = []

    for (const code of codes) {
      const hit = twseResult.get(code)
      if (hit) {
        stocks.push(hit)
      } else {
        notFound.push(code)
      }
    }

    // 第二輪：TWSE 找不到的改用 Yahoo Finance v8/chart（備用）
    if (notFound.length > 0) {
      const fallbackTasks = notFound.flatMap((code) => [
        fetchYahooFallback(`${code}.TW`),
        fetchYahooFallback(`${code}.TWO`),
      ])
      const settled = await Promise.allSettled(fallbackTasks)
      const seen = new Set<string>()
      for (const r of settled) {
        if (r.status === 'fulfilled' && r.value && !seen.has(r.value.code)) {
          seen.add(r.value.code)
          stocks.push(r.value)
        }
      }
    }

    return NextResponse.json({ stocks })
  } catch (error) {
    const message = error instanceof Error ? error.message : '未知錯誤'
    return NextResponse.json(
      { error: `無法取得股價: ${message}` },
      { status: 502 }
    )
  }
}
