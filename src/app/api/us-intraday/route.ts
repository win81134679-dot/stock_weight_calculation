import { NextRequest, NextResponse } from 'next/server'
import { fetchUsIntraday } from '@/lib/us-yahoo'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const symbolsParam = searchParams.get('symbols')
  if (!symbolsParam) {
    return NextResponse.json({ error: '缺少 symbols 參數，格式：AAPL|MSFT|VOO' }, { status: 400 })
  }

  try {
    const symbols = Array.from(
      new Set(symbolsParam.split('|').map((symbol) => symbol.trim().toUpperCase()).filter(Boolean)),
    )
    const entries = await Promise.all(
      symbols.map(async (symbol) => [symbol, await fetchUsIntraday(symbol)] as const),
    )
    return NextResponse.json({
      asOf: new Date().toISOString(),
      bars: Object.fromEntries(entries),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : '未知錯誤'
    return NextResponse.json({ error: `無法取得盤中走勢: ${message}` }, { status: 502 })
  }
}
