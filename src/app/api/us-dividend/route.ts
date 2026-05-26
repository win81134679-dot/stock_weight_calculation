import { NextRequest, NextResponse } from 'next/server'
import { fetchUsDividends } from '@/lib/us-yahoo'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const symbol = (searchParams.get('symbol') ?? '').trim().toUpperCase()
  if (!symbol) {
    return NextResponse.json({ error: '缺少 symbol 參數' }, { status: 400 })
  }

  try {
    const records = await fetchUsDividends(symbol)
    return NextResponse.json({ symbol, records })
  } catch (error) {
    const message = error instanceof Error ? error.message : '未知錯誤'
    return NextResponse.json({ error: `無法取得股利資料: ${message}` }, { status: 502 })
  }
}
