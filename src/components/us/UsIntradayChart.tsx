'use client'

/**
 * UsIntradayChart.tsx
 * 當日開盤資金時間線 — 接 /api/us-intraday（5 分 K 收盤序列），
 * 以「各持倉 5 分收盤價 × 股數」加總出整體投資組合的盤中資產曲線，
 * 並換算成相對昨收的「今日資金變化」（USD / TWD 可切）。
 *
 * 對齊台股 TodayDashboard 的盤中淨值走勢，但資料直接取自 Yahoo 當日 5 分 K，
 * 不需 sessionStorage 累積，重新整理也能立即看到完整今日曲線。
 */

import React, { useEffect, useMemo, useState } from 'react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts'

interface IntradayPoint {
  time: string
  close: number
}

interface HoldingInput {
  symbol: string
  shares: number
  prevCloseUsd: number
}

interface Props {
  /** 目前選定範圍內的持倉（跨帳戶合併後 symbol→shares、昨收） */
  holdings: HoldingInput[]
  fxRate: number
}

type Currency = 'usd' | 'twd'

export default function UsIntradayChart({ holdings, fxRate }: Props) {
  const [bars, setBars] = useState<Record<string, IntradayPoint[]>>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [currency, setCurrency] = useState<Currency>('usd')

  const symbolsKey = useMemo(
    () => holdings.map((h) => h.symbol).filter(Boolean).sort().join('|'),
    [holdings],
  )

  useEffect(() => {
    if (!symbolsKey) {
      setBars({})
      return
    }
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch(`/api/us-intraday?symbols=${encodeURIComponent(symbolsKey)}`)
        const data = await res.json() as { bars?: Record<string, IntradayPoint[]>; error?: string }
        if (cancelled) return
        if (!res.ok) throw new Error(data.error ?? '無法取得盤中走勢')
        setBars(data.bars ?? {})
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : '無法取得盤中走勢')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    const timer = setInterval(load, 60_000)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [symbolsKey])

  // 以時間軸對齊：收集所有出現過的時間點，對每個持倉用「該時刻或之前最後一筆收盤」估值
  const chartData = useMemo(() => {
    const symbols = holdings.map((h) => h.symbol).filter((s) => bars[s]?.length)
    if (symbols.length === 0) return []

    // 昨收基準資產（USD）
    const baseValueUsd = holdings.reduce((sum, h) => sum + h.shares * h.prevCloseUsd, 0)

    // 所有時間點（聯集、排序）
    const timeSet = new Set<string>()
    symbols.forEach((s) => bars[s].forEach((p) => timeSet.add(p.time)))
    const times = Array.from(timeSet).sort()

    // 每檔建立 time→close 的前向填值
    const lastCloseAt: Record<string, Record<string, number>> = {}
    symbols.forEach((s) => {
      const map: Record<string, number> = {}
      let last = 0
      const series = bars[s]
      let idx = 0
      times.forEach((t) => {
        while (idx < series.length && series[idx].time <= t) {
          last = series[idx].close
          idx += 1
        }
        map[t] = last
      })
      lastCloseAt[s] = map
    })

    return times.map((t) => {
      const valueUsd = holdings.reduce((sum, h) => {
        const close = lastCloseAt[h.symbol]?.[t] ?? 0
        return sum + (close > 0 ? close * h.shares : h.shares * h.prevCloseUsd)
      }, 0)
      const deltaUsd = valueUsd - baseValueUsd
      return {
        time: t,
        deltaUsd: Math.round(deltaUsd * 100) / 100,
        deltaTwd: Math.round(deltaUsd * fxRate),
      }
    })
  }, [bars, holdings, fxRate])

  if (holdings.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-sm text-slate-400">
        此帳戶尚無持倉
      </div>
    )
  }

  if (loading && chartData.length === 0) {
    return <div className="flex items-center justify-center h-48 text-sm text-slate-400">載入盤中資料中…</div>
  }

  if (chartData.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-sm text-slate-400 text-center px-4">
        {error ? `盤中資料暫不可用：${error}` : '目前無當日盤中資料（可能尚未開盤或為休市日）'}
      </div>
    )
  }

  const prefix = currency === 'usd' ? 'USD ' : 'NT$'
  const dataKey = currency === 'usd' ? 'deltaUsd' : 'deltaTwd'
  const latest = chartData[chartData.length - 1]
  const latestVal = currency === 'usd' ? latest.deltaUsd : latest.deltaTwd
  const up = latestVal >= 0

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className={`text-sm font-bold font-mono ${up ? 'text-emerald-600' : 'text-red-500'}`}>
          今日資金變化 {up ? '+' : '-'}{prefix}{Math.abs(Math.round(latestVal)).toLocaleString()}
        </div>
        <div className="flex items-center gap-1">
          {(['usd', 'twd'] as Currency[]).map((c) => (
            <button
              key={c}
              onClick={() => setCurrency(c)}
              className={`px-2.5 py-1 rounded-md text-xs font-medium ${
                currency === c ? 'bg-[#0F2E4E] text-white' : 'bg-slate-100 text-slate-500'
              }`}
            >
              {c === 'usd' ? 'USD' : 'TWD'}
            </button>
          ))}
        </div>
      </div>
      <ResponsiveContainer width="100%" height={220}>
        <AreaChart data={chartData} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
          <defs>
            <linearGradient id="usIntradayUp" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={up ? '#10b981' : '#ef4444'} stopOpacity={0.35} />
              <stop offset="95%" stopColor={up ? '#10b981' : '#ef4444'} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
          <XAxis dataKey="time" tick={{ fontSize: 11, fill: '#94a3b8' }} minTickGap={40} />
          <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} width={64} tickFormatter={(v: number) => `${prefix}${Math.round(v).toLocaleString()}`} />
          <ReferenceLine y={0} stroke="#cbd5e1" />
          <Tooltip formatter={(value) => [`${prefix}${Math.round(Number(value)).toLocaleString()}`, '今日變化']} />
          <Area type="monotone" dataKey={dataKey} stroke={up ? '#10b981' : '#ef4444'} strokeWidth={2} fill="url(#usIntradayUp)" />
        </AreaChart>
      </ResponsiveContainer>
      <p className="text-[11px] text-slate-400">
        資料源：Yahoo 當日 5 分 K（僅一般交易時段），相對昨收的整體持倉資產變化。每 60 秒刷新。
      </p>
    </div>
  )
}
