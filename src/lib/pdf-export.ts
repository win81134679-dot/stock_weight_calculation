/**
 * pdf-export.ts
 * 匯出台股目標總市值配置計畫為 PDF（A4 格式）
 */

import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { TargetValueRebalancePlan } from './types'
import { formatMoney } from './calculator'

// 註冊中文字體（使用內建字體，實際專案中可能需要引入中文字體）
// 這裡使用英文字體 + Unicode，實際渲染時會有限制
// 如需完整中文支援，需引入 NotoSansTC 等字體

const displayShares = (shares: number) => {
  const lots = Math.floor(shares / 1000)
  const remaining = shares % 1000
  if (lots === 0 && remaining === 0) return '0 shares'
  if (lots === 0) return `${remaining} shares`
  if (remaining === 0) return `${lots} lots`
  return `${lots} lots ${remaining} shares`
}

export function exportTargetValuePlanToPDF(
  plan: TargetValueRebalancePlan,
  accountName: string
) {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  })

  const pageWidth = 210  // A4 width
  const pageHeight = 297 // A4 height
  const margin = 15
  let yPos = margin

  // Title
  doc.setFontSize(18)
  doc.setFont('helvetica', 'bold')
  doc.text('Target Value Rebalance Plan', margin, yPos)
  yPos += 10

  // Account & Date
  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.text(`Account: ${accountName}`, margin, yPos)
  yPos += 5
  doc.text(`Generated: ${new Date().toLocaleString('zh-TW')}`, margin, yPos)
  yPos += 10

  // Summary Section
  doc.setFontSize(12)
  doc.setFont('helvetica', 'bold')
  doc.text('Summary', margin, yPos)
  yPos += 7

  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')

  const summaryData = [
    ['Current Total Value', `$${formatMoney(plan.currentTotalValue)}`],
    ['Target Total Value', `$${formatMoney(plan.targetTotalValue)}`],
    ['Sell Proceeds', `$${formatMoney(plan.totalSellProceeds)}`],
    ['External Fund', `$${formatMoney(plan.externalFund)}`],
    ['Available Fund', `$${formatMoney(plan.availableFund)}`],
    ['Protected Fund (Slippage ' + (plan.slippageRate * 100).toFixed(1) + '%)', `$${formatMoney(plan.protectedFund)}`],
  ]

  autoTable(doc, {
    startY: yPos,
    head: [],
    body: summaryData,
    theme: 'grid',
    styles: { fontSize: 9, cellPadding: 2 },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 80 },
      1: { halign: 'right', cellWidth: 50 }
    },
    margin: { left: margin }
  })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  yPos = (doc as any).lastAutoTable.finalY + 10

  // Sell Entries Section
  if (plan.sellEntries.length > 0) {
    doc.setFontSize(12)
    doc.setFont('helvetica', 'bold')
    doc.text('Sell Entries', margin, yPos)
    yPos += 7

    const sellTableData = plan.sellEntries.map(e => [
      e.code,
      displayShares(e.shares),
      `$${formatMoney(e.actualProceeds)}`,
      e.estimatedProceeds ? `$${formatMoney(e.estimatedProceeds)}` : '-'
    ])

    autoTable(doc, {
      startY: yPos,
      head: [['Code', 'Shares', 'Actual Proceeds', 'Estimated']],
      body: sellTableData,
      theme: 'striped',
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [220, 53, 69], textColor: 255 },
      margin: { left: margin }
    })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    yPos = (doc as any).lastAutoTable.finalY + 10
  }

  // Check if we need a new page
  if (yPos > pageHeight - 80) {
    doc.addPage()
    yPos = margin
  }

  // Buy Actions Section
  doc.setFontSize(12)
  doc.setFont('helvetica', 'bold')
  doc.text('Buy Actions', margin, yPos)
  yPos += 7

  const buyActions = plan.actions.filter(a => a.action === 'buy')
  if (buyActions.length > 0) {
    const buyTableData = buyActions.map(a => [
      a.code,
      a.name,
      `$${a.price.toFixed(2)}`,
      displayShares(a.currentShares),
      displayShares(a.sharesChange),
      `$${formatMoney(a.estimatedAmount)}`,
      `$${a.fee}`,
      displayShares(a.newShares)
    ])

    autoTable(doc, {
      startY: yPos,
      head: [['Code', 'Name', 'Price', 'Current', 'Change', 'Amount', 'Fee', 'After']],
      body: buyTableData,
      theme: 'striped',
      styles: { fontSize: 7, cellPadding: 1.5 },
      headStyles: { fillColor: [40, 167, 69], textColor: 255 },
      columnStyles: {
        2: { halign: 'right' },
        3: { halign: 'right' },
        4: { halign: 'right' },
        5: { halign: 'right' },
        6: { halign: 'right' },
        7: { halign: 'right' }
      },
      margin: { left: margin }
    })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    yPos = (doc as any).lastAutoTable.finalY + 10
  } else {
    doc.setFontSize(9)
    doc.setFont('helvetica', 'italic')
    doc.text('No buy actions', margin, yPos)
    yPos += 10
  }

  // Check if we need a new page
  if (yPos > pageHeight - 60) {
    doc.addPage()
    yPos = margin
  }

  // Settlement Summary
  doc.setFontSize(12)
  doc.setFont('helvetica', 'bold')
  doc.text('Settlement (T+2)', margin, yPos)
  yPos += 7

  const settlementData = [
    ['Payable (Buy)', `$${formatMoney(plan.totalBuyCost)}`],
    ['Receivable (Sell)', `$${formatMoney(plan.totalSellReturn)}`],
    ['Net Cash Flow', `${plan.netCashFlow > 0 ? '+' : ''}$${formatMoney(plan.netCashFlow)}`],
  ]

  autoTable(doc, {
    startY: yPos,
    head: [],
    body: settlementData,
    theme: 'grid',
    styles: { fontSize: 9, cellPadding: 2 },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 80 },
      1: { halign: 'right', cellWidth: 50 }
    },
    margin: { left: margin }
  })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  yPos = (doc as any).lastAutoTable.finalY + 10

  // After Adjustment
  doc.setFontSize(12)
  doc.setFont('helvetica', 'bold')
  doc.text('After Adjustment', margin, yPos)
  yPos += 7

  const afterData = [
    ['Total Cost', `$${formatMoney(plan.afterTotalCost)}`],
    ['Total Value', `$${formatMoney(plan.afterTotalValue)}`],
    ['Unrealized P&L', `${plan.afterUnrealizedPnL > 0 ? '+' : ''}$${formatMoney(plan.afterUnrealizedPnL)}`],
    ['P&L %', plan.afterTotalCost > 0 ? `${((plan.afterUnrealizedPnL / plan.afterTotalCost) * 100).toFixed(2)}%` : '-'],
  ]

  autoTable(doc, {
    startY: yPos,
    head: [],
    body: afterData,
    theme: 'grid',
    styles: { fontSize: 9, cellPadding: 2 },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 80 },
      1: { halign: 'right', cellWidth: 50 }
    },
    margin: { left: margin }
  })

  // Warnings (if any)
  if (plan.warnings.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    yPos = (doc as any).lastAutoTable.finalY + 10

    if (yPos > pageHeight - 40) {
      doc.addPage()
      yPos = margin
    }

    doc.setFontSize(12)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(255, 0, 0)
    doc.text('Warnings', margin, yPos)
    yPos += 7

    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(0, 0, 0)
    plan.warnings.forEach((w, i) => {
      const lines = doc.splitTextToSize(`${i + 1}. ${w}`, pageWidth - 2 * margin)
      doc.text(lines, margin, yPos)
      yPos += lines.length * 5
    })
  }

  // Footer
  const totalPages = doc.getNumberOfPages()
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i)
    doc.setFontSize(8)
    doc.setFont('helvetica', 'italic')
    doc.setTextColor(128, 128, 128)
    doc.text(
      `Page ${i} of ${totalPages}`,
      pageWidth / 2,
      pageHeight - 10,
      { align: 'center' }
    )
  }

  // Save
  const filename = `target-value-plan-${accountName}-${new Date().toISOString().split('T')[0]}.pdf`
  doc.save(filename)
}
