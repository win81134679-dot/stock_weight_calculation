'use client'

/**
 * HoldingEditor.tsx
 * Manage holdings per account — two modes:
 * 1. Quick mode: enter total shares + avg cost directly
 * 2. Transaction mode: log each buy/sell, auto-calc avg cost
 */

import React, { useState } from 'react'
import { Account, Holding, Transaction, TargetWeight, PriceCache } from '@/lib/types'
import { accountColorStyle } from './AccountManager'
import { formatMoney } from '@/lib/calculator'

interface Props {
  accounts: Account[]
  holdings: Holding[]
  transactions: Transaction[]
  prices: Record<string, PriceCache>
  targetWeights: TargetWeight[]
  onUpsertHolding: (h: Holding) => void
  onDeleteHolding: (accountId: string, code: string) => void
  onAddTransaction: (tx: Omit<Transaction, 'id'>) => void
  onDeleteTransaction: (txId: string) => void
}


export default function HoldingEditor({
  accounts,
  holdings,
  transactions,
  prices,
  targetWeights,
  onUpsertHolding,
  onDeleteHolding,
  onAddTransaction,
  onDeleteTransaction,
}: Props) {
  const [selectedAccountId, setSelectedAccountId] = useState<string>(accounts[0]?.id ?? '')

  // Quick mode form
  const [qCode, setQCode] = useState('')
  const [qShares, setQShares] = useState('')
  const [qAvgCost, setQAvgCost] = useState('')

  // Transaction mode form
  const [txCode, setTxCode] = useState('')
  const [txDate, setTxDate] = useState(new Date().toISOString().split('T')[0])
  const [txType, setTxType] = useState<'buy' | 'sell'>('buy')
  const [txShares, setTxShares] = useState('')
  const [txPrice, setTxPrice] = useState('')
  const [txFee, setTxFee] = useState('')
  const [txNote, setTxNote] = useState('')

  const account = accounts.find((a) => a.id === selectedAccountId)
  const acctHoldings = holdings.filter((h) => h.accountId === selectedAccountId)
  const acctTxs = transactions.filter((t) => t.accountId === selectedAccountId)

  function handleQuickSave() {
    const code = qCode.trim().toUpperCase()
    const shares = parseFloat(qShares)
    const avgCost = parseFloat(qAvgCost)
    if (!code || isNaN(shares) || shares < 0 || isNaN(avgCost) || avgCost < 0) return

    const tw = targetWeights.find((t) => t.code === code)
    const p = prices[code]
    onUpsertHolding({
      accountId: selectedAccountId,
      code,
      name: tw?.name ?? p?.name ?? code,
      exchange: tw?.exchange ?? p?.exchange ?? 'tse',
      isETF: tw?.isETF ?? p?.isETF ?? true,
      shares,
      avgCost,
    })
    setQCode('')
    setQShares('')
    setQAvgCost('')
  }

  function handleAddTx() {
    const code = txCode.trim().toUpperCase()
    const shares = parseFloat(txShares)
    const price = parseFloat(txPrice)
    const fee = parseFloat(txFee) || 0
    if (!code || isNaN(shares) || shares <= 0 || isNaN(price) || price <= 0) return

    const tw = targetWeights.find((t) => t.code === code)
    const p = prices[code]

    // Auto-populate holding name if first transaction
    const existingHolding = holdings.find(
      (h) => h.accountId === selectedAccountId && h.code === code
    )
    if (!existingHolding) {
      onUpsertHolding({
        accountId: selectedAccountId,
        code,
        name: tw?.name ?? p?.name ?? code,
        exchange: tw?.exchange ?? p?.exchange ?? 'tse',
        isETF: tw?.isETF ?? p?.isETF ?? true,
        shares: 0,
        avgCost: 0,
      })
    }

    onAddTransaction({
      accountId: selectedAccountId,
      code,
      date: txDate,
      type: txType,
      shares,
      price,
      fee,
      note: txNote.trim() || undefined,
    })

    setTxCode('')
    setTxShares('')
    setTxPrice('')
    setTxFee('')
    setTxNote('')
  }

  if (accounts.length === 0) {
    return (
      <div className="text-center py-10 text-slate-400 text-sm">
        請先至「帳戶管理」建立帳戶
      </div>
    )
  }

  const style = account ? accountColorStyle(account.color) : accountColorStyle('blue')

  return (
    <div className="space-y-4">
      {/* Account selector */}
      <div className="flex gap-2 flex-wrap">
        {accounts.map((acc) => {
          const s = accountColorStyle(acc.color)
          const active = acc.id === selectedAccountId
          return (
            <button
              key={acc.id}
              onClick={() => setSelectedAccountId(acc.id)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                active
                  ? `${s.bg} ${s.border} ${s.text}`
                  : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'
              }`}
            >
              {acc.name}
            </button>
          )
        })}
      </div>

      {/* Quick input — always visible */}
      <div className={`rounded-xl border p-4 ${style.bg} ${style.border}`}>
          <p className="text-xs font-semibold text-slate-500 mb-3">新增 / 更新持倉（{account?.name}）</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <div>
              <label className="text-xs text-slate-500 mb-1 block">ETF 代碼</label>
              <input
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white uppercase"
                value={qCode}
                onChange={(e) => setQCode(e.target.value.toUpperCase())}
                placeholder="如 00927"
                onKeyDown={(e) => e.key === 'Enter' && handleQuickSave()}
              />
            </div>
            <div>
              <label className="text-xs text-slate-500 mb-1 block">持有股數</label>
              <input
                type="number"
                min="0"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white"
                value={qShares}
                onChange={(e) => setQShares(e.target.value)}
                placeholder="0"
              />
            </div>
            <div>
              <label className="text-xs text-slate-500 mb-1 block">均價（每股元）</label>
              <div className="flex gap-2">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white"
                  value={qAvgCost}
                  onChange={(e) => setQAvgCost(e.target.value)}
                  placeholder="0.00"
                />
                <button
                  onClick={handleQuickSave}
                  disabled={!qCode.trim() || !qShares || !qAvgCost}
                  className="px-3 py-2 bg-[#2C5F8A] text-white text-sm rounded-lg disabled:opacity-40"
                >
                  儲存
                </button>
              </div>
            </div>
          </div>
      </div>

      {/* Add transaction — always visible */}
      <div className={`rounded-xl border p-4 ${style.bg} ${style.border}`}>
          <p className="text-xs font-semibold text-slate-500 mb-3">新增交易紀錄（{account?.name}）</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <div>
              <label className="text-xs text-slate-500 mb-1 block">ETF 代碼</label>
              <input
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white uppercase"
                value={txCode}
                onChange={(e) => setTxCode(e.target.value.toUpperCase())}
                placeholder="如 00927"
              />
            </div>
            <div>
              <label className="text-xs text-slate-500 mb-1 block">日期</label>
              <input
                type="date"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white"
                value={txDate}
                onChange={(e) => setTxDate(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs text-slate-500 mb-1 block">類型</label>
              <div className="flex gap-1">
                {(['buy', 'sell'] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setTxType(t)}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                      txType === t
                        ? t === 'buy'
                          ? 'bg-green-100 border-green-300 text-green-700'
                          : 'bg-red-100 border-red-300 text-red-700'
                        : 'bg-white border-slate-200 text-slate-500'
                    }`}
                  >
                    {t === 'buy' ? '買入' : '賣出'}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs text-slate-500 mb-1 block">股數</label>
              <input
                type="number" min="1"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white"
                value={txShares}
                onChange={(e) => setTxShares(e.target.value)}
                placeholder="0"
              />
            </div>
            <div>
              <label className="text-xs text-slate-500 mb-1 block">成交價（元/股）</label>
              <input
                type="number" min="0" step="0.01"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white"
                value={txPrice}
                onChange={(e) => setTxPrice(e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div>
              <label className="text-xs text-slate-500 mb-1 block">手續費（元）</label>
              <input
                type="number" min="0"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white"
                value={txFee}
                onChange={(e) => setTxFee(e.target.value)}
                placeholder="0"
              />
            </div>
            <div className="col-span-2 sm:col-span-2">
              <label className="text-xs text-slate-500 mb-1 block">備註（選填）</label>
              <input
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white"
                value={txNote}
                onChange={(e) => setTxNote(e.target.value)}
                placeholder=""
              />
            </div>
            <div className="flex items-end">
              <button
                onClick={handleAddTx}
                disabled={!txCode.trim() || !txShares || !txPrice}
                className="w-full py-2 bg-[#2C5F8A] text-white text-sm rounded-lg disabled:opacity-40"
              >
                新增紀錄
              </button>
            </div>
          </div>
      </div>

      {/* Holdings table */}
      {acctHoldings.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
            {account?.name} — 目前持倉
          </p>
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-xs text-slate-500 uppercase tracking-wide">
                  <th className="px-3 py-2 text-left">代碼</th>
                  <th className="px-3 py-2 text-right">股數</th>
                  <th className="px-3 py-2 text-right">均價</th>
                  <th className="px-3 py-2 text-right">現價</th>
                  <th className="px-3 py-2 text-right">市值</th>
                  <th className="px-3 py-2 text-right">損益</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {acctHoldings.map((h) => {
                  const price = prices[h.code]?.price ?? 0
                  const value = h.shares * price
                  const cost = h.shares * h.avgCost
                  const pnl = price > 0 ? value - cost : 0
                  const pnlPct = cost > 0 && price > 0 ? (pnl / cost) * 100 : 0
                  return (
                    <tr key={h.code} className="border-t border-slate-100 hover:bg-slate-50">
                      <td className="px-3 py-2 font-mono font-medium">{h.code}</td>
                      <td className="px-3 py-2 text-right">{h.shares.toLocaleString()}</td>
                      <td className="px-3 py-2 text-right">${h.avgCost.toFixed(2)}</td>
                      <td className="px-3 py-2 text-right">
                        {price > 0 ? `$${price.toFixed(2)}` : '—'}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {price > 0 ? `$${formatMoney(value)}` : '—'}
                      </td>
                      <td className={`px-3 py-2 text-right font-medium ${
                        pnl > 0 ? 'text-green-600' : pnl < 0 ? 'text-red-500' : 'text-slate-400'
                      }`}>
                        {price > 0
                          ? `${pnl >= 0 ? '+' : ''}$${formatMoney(Math.abs(pnl))} (${pnl >= 0 ? '+' : ''}${pnlPct.toFixed(1)}%)`
                          : '—'}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <button
                          onClick={() => {
                            if (confirm(`確定刪除 ${h.code} 持倉？`)) onDeleteHolding(selectedAccountId, h.code)
                          }}
                          className="text-xs text-red-400 hover:text-red-600"
                        >
                          刪除
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Transaction history — always visible when data exists */}
      {acctTxs.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
            {account?.name} — 交易紀錄
          </p>
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-xs text-slate-500 uppercase tracking-wide">
                  <th className="px-3 py-2 text-left">日期</th>
                  <th className="px-3 py-2 text-left">代碼</th>
                  <th className="px-3 py-2 text-center">類型</th>
                  <th className="px-3 py-2 text-right">股數</th>
                  <th className="px-3 py-2 text-right">價格</th>
                  <th className="px-3 py-2 text-right">手續費</th>
                  <th className="px-3 py-2 text-left">備註</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {acctTxs
                  .slice()
                  .sort((a, b) => b.date.localeCompare(a.date))
                  .map((tx) => (
                    <tr key={tx.id} className="border-t border-slate-100 hover:bg-slate-50">
                      <td className="px-3 py-2 text-slate-500">{tx.date}</td>
                      <td className="px-3 py-2 font-mono font-medium">{tx.code}</td>
                      <td className="px-3 py-2 text-center">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                          tx.type === 'buy' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                        }`}>
                          {tx.type === 'buy' ? '買入' : '賣出'}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right">{tx.shares.toLocaleString()}</td>
                      <td className="px-3 py-2 text-right">${tx.price.toFixed(2)}</td>
                      <td className="px-3 py-2 text-right">${tx.fee.toFixed(0)}</td>
                      <td className="px-3 py-2 text-slate-400 text-xs">{tx.note ?? ''}</td>
                      <td className="px-3 py-2 text-right">
                        <button
                          onClick={() => {
                            if (confirm('確定刪除此筆交易紀錄？均價將自動重新計算。')) {
                              onDeleteTransaction(tx.id)
                            }
                          }}
                          className="text-xs text-red-400 hover:text-red-600"
                        >
                          刪除
                        </button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
