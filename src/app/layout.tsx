import type { Metadata, Viewport } from "next";
import { Noto_Sans_TC } from "next/font/google";
import InstallBanner from "@/components/InstallBanner";
import "./globals.css";

const noto = Noto_Sans_TC({
  subsets: ["latin"],
  weight: ["400", "500", "700", "900"],
  display: "swap",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#2C5F8A",
};

export const metadata: Metadata = {
  metadataBase: new URL("https://stockweightcalculation.vercel.app"),
  title: "台股持有權重計算器",
  description: "即時抓取台股股價，依自訂權重計算每檔可買張數與手續費，支援 PWA 安裝",
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
  openGraph: {
    title: "台股持有權重計算器",
    description: "即時股價 · 自訂權重 · 手續費試算，支援 PWA 安裝到手機主畫面",
    type: "website",
    url: "https://stockweightcalculation.vercel.app",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "台股持有權重計算器",
      },
    ],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "股票權重計算",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-TW">
      <body className={`${noto.className} antialiased`}>
        {children}
        <InstallBanner />
      </body>
    </html>
  );
}
