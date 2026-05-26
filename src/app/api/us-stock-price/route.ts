import { NextRequest, NextResponse } from 'next/server'
import { fetchUsdTwdRate, fetchUsQuote } from '@/lib/us-yahoo'

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

    const [fxRate, quotes] = await Promise.all([
      fetchUsdTwdRate(),
      Promise.all(symbols.map((symbol) => fetchUsQuote(symbol))),
    ])

    return NextResponse.json({
      stocks: quotes.filter(Boolean),
      fxRate,
      fxSymbol: 'USDTWD=X',
      fetchedAt: Date.now(),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : '未知錯誤'
    return NextResponse.json({ error: `無法取得美股報價: ${message}` }, { status: 502 })
  }
}
