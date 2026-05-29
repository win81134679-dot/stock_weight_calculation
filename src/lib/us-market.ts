/**
 * us-market.ts
 * 美股市場工具：marketState 中文映射、美東時間 (ET) 換算、再平衡日計算、主要指數。
 */

import { UsExchange } from './us-types'

/** Yahoo marketState → 中文盤別標籤 */
export function marketStateLabel(state: string): string {
  switch ((state ?? '').toUpperCase()) {
    case 'PRE':
      return '盤前'
    case 'REGULAR':
      return '盤中'
    case 'POST':
    case 'POSTPOST':
      return '盤後'
    case 'PREPRE':
      return '盤前（早盤）'
    case 'CLOSED':
      return '已收盤'
    default:
      return '未開盤'
  }
}

/** 是否為盤中（用於自動刷新判斷） */
export function isRegularSession(state: string): boolean {
  return (state ?? '').toUpperCase() === 'REGULAR'
}

/** 主要美股指數（用於大盤卡） */
export const US_INDEX_SYMBOLS: { symbol: string; label: string }[] = [
  { symbol: '^GSPC', label: 'S&P 500' },
  { symbol: '^IXIC', label: 'Nasdaq' },
  { symbol: '^DJI', label: '道瓊' },
]

/** 交易所中文標籤 */
export function exchangeLabel(exchange: UsExchange): string {
  switch (exchange) {
    case 'nasdaq':
      return 'NASDAQ'
    case 'nyse':
      return 'NYSE'
    case 'arca':
      return 'NYSE Arca'
    case 'bats':
      return 'Cboe BZX'
    default:
      return '—'
  }
}

/**
 * 取得「現在」的美東日期（YYYY-MM-DD）。
 * 用 Intl 以 America/New_York 時區格式化，避免本地時區造成再平衡日偏移。
 */
export function nowEtDateString(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
  // en-CA 會輸出 YYYY-MM-DD
  return parts
}

/**
 * 以美東時區計算下次再平衡日（YYYY-MM-DD）。
 * 對齊台股 calcUsNextRebalanceDate，但基準日改用 ET 當日。
 */
export function calcEtNextRebalanceDate(intervalMonths: number, dayOfMonth: number): string {
  const etToday = nowEtDateString()
  const [year, month] = etToday.split('-').map((value) => parseInt(value, 10))
  // month 為 1-based；用 Date UTC 建構避免本地時區位移，只取日期部分
  const target = new Date(Date.UTC(year, month - 1 + intervalMonths, dayOfMonth))
  return target.toISOString().split('T')[0]
}

/** 距下次再平衡還有幾天（以 ET 當日為基準） */
export function daysUntilUsRebalance(nextDateStr: string): number {
  if (!nextDateStr) return Number.POSITIVE_INFINITY
  const etToday = nowEtDateString()
  const today = new Date(`${etToday}T00:00:00Z`).getTime()
  const next = new Date(`${nextDateStr}T00:00:00Z`).getTime()
  return Math.ceil((next - today) / (1000 * 60 * 60 * 24))
}
