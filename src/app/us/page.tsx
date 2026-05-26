'use client'

import Link from 'next/link'
import React, { useState } from 'react'
import UsCalculatorTab from '@/components/us/UsCalculatorTab'
import UsRebalanceTab from '@/components/us/UsRebalanceTab'

type TopTab = 'rebalance' | 'calculator'

export default function UsPage() {
  const [topTab, setTopTab] = useState<TopTab>('rebalance')

  return (
    <div className="min-h-screen bg-[#F5F7FB]">
      <div className="max-w-[1600px] mx-auto px-3 sm:px-6 lg:px-10 py-4 sm:py-6 space-y-4 sm:space-y-6">
        <div className="bg-[#0F2E4E] rounded-2xl p-4 sm:p-6 shadow-lg">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3 sm:gap-4">
              <div className="w-10 h-10 sm:w-14 sm:h-14 bg-white rounded-xl flex items-center justify-center shadow-inner shrink-0">
                <span className="text-lg sm:text-2xl font-black text-[#0F2E4E]">US</span>
              </div>
              <div className="min-w-0">
                <h1 className="text-lg sm:text-2xl font-black text-white tracking-wide">美股資金權重計算器</h1>
                <p className="text-xs sm:text-sm text-white/70 mt-0.5 hidden sm:block">
                  YAHOO FINANCE × KGI FEE PROFILE × TWD / USD 試算
                </p>
              </div>
            </div>
            <Link
              href="/"
              className="inline-flex items-center justify-center px-4 py-2 rounded-xl bg-white/15 text-white text-sm font-semibold hover:bg-white/25 transition-colors"
            >
              回台股系統
            </Link>
          </div>

          <div className="flex gap-2 mt-4">
            <button
              onClick={() => setTopTab('rebalance')}
              className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${
                topTab === 'rebalance' ? 'bg-white text-[#0F2E4E]' : 'bg-white/15 text-white hover:bg-white/25'
              }`}
            >
              📊 再平衡管理
            </button>
            <button
              onClick={() => setTopTab('calculator')}
              className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${
                topTab === 'calculator' ? 'bg-white text-[#0F2E4E]' : 'bg-white/15 text-white hover:bg-white/25'
              }`}
            >
              🧮 持倉計算
            </button>
          </div>
        </div>

        {topTab === 'rebalance' && <UsRebalanceTab />}
        {topTab === 'calculator' && <UsCalculatorTab />}

        <div className="text-center text-xs text-slate-400 py-4">
          股價來源：Yahoo Finance 即時資料與歷史資料<br />
          本工具僅供參考，不構成投資建議
        </div>
      </div>
    </div>
  )
}
