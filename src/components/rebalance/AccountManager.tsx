'use client'

/**
 * AccountManager.tsx
 * CRUD UI for managing broker accounts.
 */

import React, { useState } from 'react'
import { Account } from '@/lib/types'

const COLOR_MAP: Record<string, { bg: string; border: string; text: string; dot: string }> = {
  blue:   { bg: 'bg-blue-50',   border: 'border-blue-200',   text: 'text-blue-700',   dot: 'bg-blue-400' },
  green:  { bg: 'bg-green-50',  border: 'border-green-200',  text: 'text-green-700',  dot: 'bg-green-400' },
  yellow: { bg: 'bg-yellow-50', border: 'border-yellow-200', text: 'text-yellow-700', dot: 'bg-yellow-400' },
  purple: { bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-700', dot: 'bg-purple-400' },
  pink:   { bg: 'bg-pink-50',   border: 'border-pink-200',   text: 'text-pink-700',   dot: 'bg-pink-400' },
  orange: { bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-700', dot: 'bg-orange-400' },
  teal:   { bg: 'bg-teal-50',   border: 'border-teal-200',   text: 'text-teal-700',   dot: 'bg-teal-400' },
}

export function accountColorStyle(color: string) {
  return COLOR_MAP[color] ?? COLOR_MAP.blue
}

interface Props {
  accounts: Account[]
  onAdd: (name: string, broker?: string) => void
  onUpdate: (id: string, patch: Partial<Omit<Account, 'id'>>) => void
  onDelete: (id: string) => void
}

export default function AccountManager({ accounts, onAdd, onUpdate, onDelete }: Props) {
  const [newName, setNewName] = useState('')
  const [newBroker, setNewBroker] = useState('')
  const [editId, setEditId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editBroker, setEditBroker] = useState('')

  function handleAdd() {
    const name = newName.trim()
    if (!name) return
    onAdd(name, newBroker.trim() || undefined)
    setNewName('')
    setNewBroker('')
  }

  function startEdit(acc: Account) {
    setEditId(acc.id)
    setEditName(acc.name)
    setEditBroker(acc.broker ?? '')
  }

  function commitEdit() {
    if (!editId) return
    onUpdate(editId, { name: editName.trim() || '帳戶', broker: editBroker.trim() || undefined })
    setEditId(null)
  }

  return (
    <div className="space-y-4">
      {/* Existing accounts */}
      {accounts.length === 0 && (
        <div className="text-center py-8 text-slate-400 text-sm">
          尚未建立帳戶，請在下方新增
        </div>
      )}

      <div className="space-y-2">
        {accounts.map((acc) => {
          const style = accountColorStyle(acc.color)
          if (editId === acc.id) {
            return (
              <div key={acc.id} className={`rounded-xl border p-3 ${style.bg} ${style.border}`}>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    className="flex-1 border border-slate-200 rounded-lg px-3 py-1.5 text-sm bg-white"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    placeholder="帳戶名稱"
                    onKeyDown={(e) => e.key === 'Enter' && commitEdit()}
                  />
                  <input
                    className="flex-1 border border-slate-200 rounded-lg px-3 py-1.5 text-sm bg-white"
                    value={editBroker}
                    onChange={(e) => setEditBroker(e.target.value)}
                    placeholder="券商名稱（選填）"
                    onKeyDown={(e) => e.key === 'Enter' && commitEdit()}
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={commitEdit}
                      className="px-3 py-1.5 bg-[#2C5F8A] text-white text-sm rounded-lg"
                    >
                      儲存
                    </button>
                    <button
                      onClick={() => setEditId(null)}
                      className="px-3 py-1.5 bg-slate-100 text-slate-600 text-sm rounded-lg"
                    >
                      取消
                    </button>
                  </div>
                </div>
              </div>
            )
          }

          return (
            <div key={acc.id} className={`flex items-center justify-between rounded-xl border p-3 ${style.bg} ${style.border}`}>
              <div className="flex items-center gap-3">
                <div className={`w-3 h-3 rounded-full ${style.dot}`} />
                <div>
                  <span className={`font-semibold text-sm ${style.text}`}>{acc.name}</span>
                  {acc.broker && (
                    <span className="ml-2 text-xs text-slate-400">{acc.broker}</span>
                  )}
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => startEdit(acc)}
                  className="text-xs text-slate-500 hover:text-[#2C5F8A] px-2 py-1"
                >
                  編輯
                </button>
                <button
                  onClick={() => {
                    if (confirm(`確定刪除「${acc.name}」？此帳戶的所有持倉與交易記錄也會一併刪除。`)) {
                      onDelete(acc.id)
                    }
                  }}
                  className="text-xs text-red-400 hover:text-red-600 px-2 py-1"
                >
                  刪除
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {/* Add new account */}
      <div className="border border-dashed border-slate-300 rounded-xl p-3 space-y-2">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">新增帳戶</p>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="帳戶名稱（必填）"
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          />
          <input
            className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm"
            value={newBroker}
            onChange={(e) => setNewBroker(e.target.value)}
            placeholder="券商名稱（選填）"
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          />
          <button
            onClick={handleAdd}
            disabled={!newName.trim()}
            className="px-4 py-2 bg-[#2C5F8A] text-white text-sm rounded-lg disabled:opacity-40 whitespace-nowrap"
          >
            + 新增
          </button>
        </div>
      </div>
    </div>
  )
}
