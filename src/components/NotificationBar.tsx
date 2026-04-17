'use client'

import React from 'react'
import { Notification } from '@/lib/types'

interface Props {
  notifications: Notification[]
  onDismiss: (id: string) => void
}

export default function NotificationBar({ notifications, onDismiss }: Props) {
  if (notifications.length === 0) return null

  return (
    <div className="fixed top-0 left-0 right-0 z-50 flex flex-col gap-2 p-3">
      {notifications.map((n) => {
        const bgClass =
          n.type === 'error'
            ? 'bg-red-50 border-red-300 text-red-800'
            : n.type === 'warning'
            ? 'bg-amber-50 border-amber-300 text-amber-800'
            : 'bg-blue-50 border-blue-300 text-blue-800'

        return (
          <div
            key={n.id}
            className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-3 shadow-md animate-slide-down ${bgClass}`}
          >
            <span className="text-sm font-medium">{n.message}</span>
            <button
              onClick={() => onDismiss(n.id)}
              className="shrink-0 rounded-full p-1 hover:bg-black/5 transition"
              aria-label="關閉通知"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )
      })}
    </div>
  )
}
