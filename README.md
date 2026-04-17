# 台股持有權重計算器 Stock Weight Calculator

即時抓取台灣證交所股價，依自訂權重計算每檔可買張數（1000 股 = 1 張）與手續費，支援 PWA 安裝到桌面。

## 功能

- 🔍 **即時股價查詢** — 串接 TWSE 公開 API，支援上市（tse）/ 上櫃（otc）
- ⚖️ **自訂權重分配** — 4 檔股票自由設定持有百分比
- 🧮 **精確費用計算** — 手續費 0.1425%（可打折）+ 證交稅（ETF 0.1% / 一般股 0.3%）
- 📊 **視覺化圖表** — 圓餅圖（權重分佈）+ 長條圖（金額分配）
- ⚠️ **資金不足提醒** — 自動偵測並通知最低所需金額
- 📱 **PWA 可安裝** — 加到手機/桌面主畫面使用

## 技術棧

- **框架**: Next.js 14 (App Router)
- **語言**: TypeScript
- **樣式**: Tailwind CSS
- **圖表**: Recharts
- **部署**: Vercel

## 開發

```bash
npm install
npm run dev
```

## 部署

Push 到 GitHub 後連接 Vercel 即可自動部署。

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
