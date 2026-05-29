'use client'

import React from 'react'
import { Treemap, ResponsiveContainer, Tooltip } from 'recharts'

interface TreemapDatum {
  name: string
  size: number
  symbol: string
}

interface Props {
  data: TreemapDatum[]
  /** 數值前綴，例如 NT$ 或 USD */
  unitPrefix?: string
}

const COLORS = ['#0F2E4E', '#2C5F8A', '#4A90C4', '#7FB3D5', '#5DADE2', '#85C1E9', '#AED6F1']

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomContent(props: any) {
  const { x, y, width, height, index, name, size } = props
  const color = COLORS[index % COLORS.length]
  if (width < 1 || height < 1) return null
  return (
    <g>
      <rect x={x} y={y} width={width} height={height} fill={color} stroke="#fff" strokeWidth={2} rx={4} />
      {width > 50 && height > 30 && (
        <>
          <text x={x + 8} y={y + 20} fill="#fff" fontSize={13} fontWeight={700}>
            {name}
          </text>
          <text x={x + 8} y={y + 38} fill="#fff" fontSize={11} opacity={0.85}>
            {(size ?? 0).toLocaleString()}
          </text>
        </>
      )}
    </g>
  )
}

export default function UsTreemapChart({ data, unitPrefix = '' }: Props) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-sm text-slate-400">
        尚無資料
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={260}>
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      <Treemap data={data as any[]} dataKey="size" stroke="#fff" content={<CustomContent />}>
        <Tooltip formatter={(value) => [`${unitPrefix}${Number(value).toLocaleString()}`, '市值']} />
      </Treemap>
    </ResponsiveContainer>
  )
}
