'use client'

import React from 'react'
import {
  PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip,
} from 'recharts'

interface WeightDatum {
  name: string
  value: number
  symbol: string
}

interface Props {
  data: WeightDatum[]
}

const COLORS = ['#0F2E4E', '#2C5F8A', '#4A90C4', '#7FB3D5', '#A9CCE3', '#5DADE2', '#85C1E9']

export default function UsRadialWeightChart({ data }: Props) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-sm text-slate-400">
        尚無資料
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={240}>
      <PieChart>
        <Pie
          data={data}
          dataKey="value"
          nameKey="name"
          cx="50%"
          cy="50%"
          innerRadius={50}
          outerRadius={90}
          paddingAngle={2}
        >
          {data.map((entry, index) => (
            <Cell key={entry.symbol} fill={COLORS[index % COLORS.length]} />
          ))}
        </Pie>
        <Tooltip formatter={(value) => [`${Number(value).toFixed(1)}%`, '權重']} />
        <Legend />
      </PieChart>
    </ResponsiveContainer>
  )
}
