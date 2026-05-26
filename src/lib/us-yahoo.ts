import { getUsCachedOrFetch } from './us-cache'
import { UsExchange, UsYahooQuote } from './us-types'

const YAHOO_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Referer': 'https://finance.yahoo.com/',
  'Origin': 'https://finance.yahoo.com',
}

const QUOTE_TTL_MS = 30_000
const FX_TTL_MS = 60_000
const HISTORY_TTL_MS = 4 * 60 * 60 * 1000
const DIVIDEND_TTL_MS = 6 * 60 * 60 * 1000
const INTRADAY_TTL_MS = 60_000

function normalizeExchange(exchange?: string): UsExchange {
  const value = (exchange ?? '').toUpperCase()
  if (value.includes('NASDAQ') || value === 'NMS') return 'nasdaq'
  if (value.includes('NYSE') || value === 'NYQ') return 'nyse'
  if (value.includes('ARCA')) return 'arca'
  if (value.includes('BATS')) return 'bats'
  return 'unknown'
}

async function fetchYahooJson<T>(pathname: string, query: Record<string, string>): Promise<T> {
  const search = new URLSearchParams(query).toString()
  for (const host of ['query1', 'query2']) {
    const url = `https://${host}.finance.yahoo.com${pathname}?${search}`
    try {
      const res = await fetch(url, {
        headers: YAHOO_HEADERS,
        cache: 'no-store',
        signal: AbortSignal.timeout(8_000),
      })
      if (!res.ok) continue
      return await res.json() as T
    } catch {
      // try the next host
    }
  }

  throw new Error(`Yahoo request failed for ${pathname}`)
}

interface ChartMetaResponse {
  chart?: {
    result?: Array<{
      meta?: {
        regularMarketPrice?: number
        chartPreviousClose?: number
        shortName?: string
        exchangeName?: string
        fullExchangeName?: string
        marketState?: string
        instrumentType?: string
      }
    }>
  }
}

export async function fetchUsQuote(symbol: string): Promise<UsYahooQuote | null> {
  return getUsCachedOrFetch(`quote_${symbol}`, QUOTE_TTL_MS, async () => {
    const data = await fetchYahooJson<ChartMetaResponse>(
      `/v8/finance/chart/${encodeURIComponent(symbol)}`,
      { interval: '1d', range: '5d' },
    )
    const meta = data.chart?.result?.[0]?.meta
    if (!meta || !meta.regularMarketPrice) {
      return null
    }

    const instrumentType = (meta.instrumentType ?? '').toUpperCase()
    return {
      symbol: symbol.toUpperCase(),
      name: (meta.shortName ?? '').trim() || symbol.toUpperCase(),
      exchange: normalizeExchange(meta.fullExchangeName ?? meta.exchangeName),
      priceUsd: meta.regularMarketPrice,
      prevCloseUsd: meta.chartPreviousClose ?? 0,
      currency: 'USD',
      isMarketOpen: meta.marketState === 'REGULAR',
      marketState: meta.marketState ?? 'UNKNOWN',
      isETF: instrumentType === 'ETF' || instrumentType === 'MUTUALFUND',
    }
  })
}

export async function fetchUsdTwdRate(): Promise<number> {
  return getUsCachedOrFetch('fx_usdtwd', FX_TTL_MS, async () => {
    const data = await fetchYahooJson<ChartMetaResponse>(
      `/v8/finance/chart/${encodeURIComponent('USDTWD=X')}`,
      { interval: '1d', range: '5d' },
    )
    const meta = data.chart?.result?.[0]?.meta
    const rate = meta?.regularMarketPrice ?? 0
    if (!(rate > 0)) {
      throw new Error('無法取得 USD/TWD 匯率')
    }
    return rate
  })
}

interface HistoryResponse {
  chart?: {
    result?: Array<{
      timestamp?: number[]
      indicators?: {
        quote?: Array<{
          high?: Array<number | null>
          low?: Array<number | null>
          close?: Array<number | null>
        }>
      }
    }>
  }
}

export interface UsHistoryPoint {
  date: string
  high: number
  low: number
  close: number
}

export interface UsHistoryPayload {
  symbol: string
  high52wUsd: number
  low52wUsd: number
  points: UsHistoryPoint[]
}

export async function fetchUsHistory(symbol: string): Promise<UsHistoryPayload> {
  return getUsCachedOrFetch(`history_${symbol}`, HISTORY_TTL_MS, async () => {
    const data = await fetchYahooJson<HistoryResponse>(
      `/v8/finance/chart/${encodeURIComponent(symbol)}`,
      { interval: '1d', range: '1y' },
    )
    const result = data.chart?.result?.[0]
    const timestamps = result?.timestamp ?? []
    const quote = result?.indicators?.quote?.[0]
    const highs = quote?.high ?? []
    const lows = quote?.low ?? []
    const closes = quote?.close ?? []

    const points: UsHistoryPoint[] = timestamps.map((timestamp, index) => ({
      date: new Date(timestamp * 1000).toISOString().slice(0, 10),
      high: Number(highs[index] ?? 0),
      low: Number(lows[index] ?? 0),
      close: Number(closes[index] ?? 0),
    })).filter((point) => point.high > 0 && point.low > 0)

    if (points.length === 0) {
      throw new Error(`無法取得 ${symbol} 歷史資料`)
    }

    return {
      symbol: symbol.toUpperCase(),
      high52wUsd: Math.max(...points.map((point) => point.high)),
      low52wUsd: Math.min(...points.map((point) => point.low)),
      points,
    }
  })
}

interface DividendResponse {
  chart?: {
    result?: Array<{
      events?: {
        dividends?: Record<string, { amount?: number; date?: number }>
      }
    }>
  }
}

export interface UsDividendEvent {
  exDate: string
  cashPerShareUsd: number
}

export async function fetchUsDividends(symbol: string): Promise<UsDividendEvent[]> {
  return getUsCachedOrFetch(`dividend_${symbol}`, DIVIDEND_TTL_MS, async () => {
    const data = await fetchYahooJson<DividendResponse>(
      `/v8/finance/chart/${encodeURIComponent(symbol)}`,
      { interval: '1d', range: '5y', events: 'dividends' },
    )
    const dividends = data.chart?.result?.[0]?.events?.dividends ?? {}
    return Object.values(dividends)
      .map((item) => ({
        exDate: item.date ? new Date(item.date * 1000).toISOString().slice(0, 10) : '',
        cashPerShareUsd: Number(item.amount ?? 0),
      }))
      .filter((item) => item.exDate && item.cashPerShareUsd > 0)
      .sort((a, b) => b.exDate.localeCompare(a.exDate))
  })
}

interface IntradayResponse {
  chart?: {
    result?: Array<{
      timestamp?: number[]
      indicators?: {
        quote?: Array<{
          close?: Array<number | null>
        }>
      }
    }>
  }
}

export interface UsIntradayPoint {
  time: string
  close: number
}

export async function fetchUsIntraday(symbol: string): Promise<UsIntradayPoint[]> {
  return getUsCachedOrFetch(`intraday_${symbol}`, INTRADAY_TTL_MS, async () => {
    const data = await fetchYahooJson<IntradayResponse>(
      `/v8/finance/chart/${encodeURIComponent(symbol)}`,
      { interval: '5m', range: '1d', includePrePost: 'false' },
    )
    const result = data.chart?.result?.[0]
    const timestamps = result?.timestamp ?? []
    const closes = result?.indicators?.quote?.[0]?.close ?? []

    return timestamps.map((timestamp, index) => ({
      time: new Date(timestamp * 1000).toISOString().slice(11, 16),
      close: Number(closes[index] ?? 0),
    })).filter((item) => item.close > 0)
  })
}
