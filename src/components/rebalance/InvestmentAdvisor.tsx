'use client'

/**
 * InvestmentAdvisor.tsx
 * 資金投入 - 兩種模式切換：
 * 1. 加減碼調倉：輸入加減碼金額（正/負/零）
 * 2. 目標總市值配置：輸入目標總市值 + 已實現損益
 */

import React, { useState } from 'react'
import { Account, Holding, PriceCache, AllocationConfig } from '@/lib/types'
import HybridRebalanceTab from './HybridRebalanceTab'
import TargetValueAdvisor from './TargetValueAdvisor'

interface Props {
  accounts: Account[]
  holdings: Holding[]
  prices: Record<string, PriceCache>
  allocationConfigs: AllocationConfig[]
  discount: number
}

type TabType = 'hybrid' | 'target'

export default function InvestmentAdvisor({
  accounts,
  holdings,
  prices,
  allocationConfigs,
  discount,
}: Props) {
  const [activeTab, setActiveTab] = useState<TabType>('hybrid')

  return (
    <div className="space-y-4">
      {/* Tab switcher */}
      <div className="border-b border-slate-200">
        <div className="flex gap-2">
          <button
            onClick={() => setActiveTab('hybrid')}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 ${
              activeTab === 'hybrid'
                ? 'border-[#2C5F8A] text-[#2C5F8A]'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            加減碼調倉
          </button>
          <button
            onClick={() => setActiveTab('target')}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 ${
              activeTab === 'target'
                ? 'border-[#2C5F8A] text-[#2C5F8A]'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            目標總市值配置
          </button>
        </div>
      </div>

      {/* Tab content */}
      {activeTab === 'hybrid' && (
        <HybridRebalanceTab
          accounts={accounts}
          holdings={holdings}
          prices={prices}
          allocationConfigs={allocationConfigs}
          discount={discount}
        />
      )}
      {activeTab === 'target' && (
        <TargetValueAdvisor
          accounts={accounts}
          holdings={holdings}
          prices={prices}
          allocationConfigs={allocationConfigs}
          discount={discount}
        />
      )}
    </div>
  )
}
