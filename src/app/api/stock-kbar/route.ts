import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * 分K走勢 API — FinMind TaiwanStockKBar (Sponsor)
 *
 * GET /api/stock-kbar?codes=2330|0050&date=2026-05-06
 *
 * 回傳：
 * {
 *   date: "2026-05-06",
 *   bars: {
 *     "2330": [{ time:"09:01", open, high, low, close, volume }, ...],
 *     "0050": [...]
 *   }
 * }
 *
 * 注意：
 * - TaiwanStockKBar 每日 15:50 更新，盤中亦可即時取得（Sponsor 限定）
 * - minute 欄位原始格式為 "09:01:00"，此 API 自動截取成 "HH:MM"
 * - 並發最多 5 個請求，避免超出 FinMind 速率限制
 */

interface KBarPoint {
  time: string  // "HH:MM"
  open: number
  high: number
  low: number
  close: number
  volume: number
}

interface FinMindKBarRow {
  date: string
  minute: string
  stock_id: string
  open: number
  high: number
  low: number
  close: number
  volume: number
}

const FINMIND_BASE = 'https://api.finmindtrade.com/api/v4/data'

async function fetchKBar(code: string, date: string, token: string): Promise<KBarPoint[]> {
  try {
    const url = new URL(FINMIND_BASE)
    url.searchParams.set('dataset', 'TaiwanStockKBar')
    url.searchParams.set('data_id', code)
    url.searchParams.set('start_date', date)

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    })

    if (!res.ok) return []

    const json = await res.json() as { status?: number; data?: FinMindKBarRow[] }
    if (json.status !== 200 || !Array.isArray(json.data) || json.data.length === 0) return []

    return json.data
      .map((row) => ({
        // "09:01:00" → "09:01"  |  "09:01" → "09:01"
        time: String(row.minute ?? '').slice(0, 5),
        open: Number(row.open),
        high: Number(row.high),
        low: Number(row.low),
        close: Number(row.close),
        volume: Number(row.volume),
      }))
      .filter((p) => p.time.length === 5 && p.close > 0)
  } catch {
    return []
  }
}

async function withConcurrency(
  codes: string[],
  date: string,
  token: string,
  limit: number,
): Promise<Record<string, KBarPoint[]>> {
  const result: Record<string, KBarPoint[]> = {}
  let idx = 0

  async function worker() {
    while (idx < codes.length) {
      const i = idx++
      const bars = await fetchKBar(codes[i], date, token)
      if (bars.length > 0) result[codes[i]] = bars
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(limit, codes.length) }, () => worker()),
  )
  return result
}

// ──────────────────────────────────────────────────────────────────
// Route Handler
// ──────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const codesParam = searchParams.get('codes')
  const dateParam = searchParams.get('date') ?? new Date().toISOString().split('T')[0]

  if (!codesParam) {
    return NextResponse.json({ error: '缺少 codes 參數，格式：2330|0050' }, { status: 400 })
  }

  const token = process.env.FINMIND_API_TOKEN
  if (!token) {
    return NextResponse.json({ error: 'FINMIND_API_TOKEN 未設定' }, { status: 503 })
  }

  try {
    const codes = Array.from(
      new Set(
        codesParam.split('|').map((s) => s.trim().toUpperCase()).filter(Boolean),
      ),
    )

    // 並發最多 5 個請求
    const bars = await withConcurrency(codes, dateParam, token, 5)

    return NextResponse.json({ date: dateParam, bars })
  } catch (error) {
    const message = error instanceof Error ? error.message : '未知錯誤'
    return NextResponse.json({ error: `KBar 查詢失敗: ${message}` }, { status: 502 })
  }
}
