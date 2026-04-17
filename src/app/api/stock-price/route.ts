import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const codes = searchParams.get('codes')

  if (!codes) {
    return NextResponse.json(
      { error: '缺少 codes 參數，格式：tse_2330.tw|tse_0050.tw' },
      { status: 400 }
    )
  }

  try {
    const url = `https://mis.twse.com.tw/stock/api/getStockInfo.jsp?ex_ch=${encodeURIComponent(codes)}&_=${Date.now()}`

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
        'Referer': 'https://mis.twse.com.tw/stock/fibest.jsp',
      },
      cache: 'no-store',
    })

    if (!response.ok) {
      return NextResponse.json(
        { error: `TWSE API 回應錯誤: ${response.status}` },
        { status: 502 }
      )
    }

    const data = await response.json()
    return NextResponse.json(data)
  } catch (error) {
    const message = error instanceof Error ? error.message : '未知錯誤'
    return NextResponse.json(
      { error: `無法連線至 TWSE: ${message}` },
      { status: 502 }
    )
  }
}
