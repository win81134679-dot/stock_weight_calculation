'use client';

import { useEffect, useState, useCallback } from 'react';

// ── Banner 模式 ──
// safari:  iOS Safari → 「點分享 → 加入主畫面」
// line:    LINE in-app → 「點 ··· → 用瀏覽器開啟」
// inapp:   FB/IG 等 in-app → 「請用 Safari / Chrome 開啟」
// android: Android Chrome → beforeinstallprompt 自訂安裝按鈕
type BannerMode = 'safari' | 'line' | 'inapp' | 'android';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export default function InstallBanner() {
  const [mode, setMode] = useState<BannerMode | null>(null);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // 已經是 standalone 模式 → 已安裝，不顯示
    if (window.matchMedia('(display-mode: standalone)').matches) return;
    const isIosStandalone = ('standalone' in navigator) && (navigator as { standalone?: boolean }).standalone;
    if (isIosStandalone) return;

    // 已關閉過 → 不顯示
    if (sessionStorage.getItem('install-banner-dismissed')) return;

    const ua = navigator.userAgent;
    const isIos = /iphone|ipad|ipod/i.test(ua);

    if (isIos) {
      const isLine = /line\//i.test(ua);
      const isOtherInApp = /fbav|fban|instagram/i.test(ua);
      if (isLine) setMode('line');
      else if (isOtherInApp) setMode('inapp');
      else setMode('safari');
      return;
    }

    // Android / Desktop: 監聽 beforeinstallprompt
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setMode('android');
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  // 所有模式都 5 秒後自動消失
  useEffect(() => {
    if (!mode) return;
    const timer = setTimeout(() => {
      setMode(null);
      sessionStorage.setItem('install-banner-dismissed', '1');
    }, 5000);
    return () => clearTimeout(timer);
  }, [mode]);

  const dismiss = useCallback(() => {
    setMode(null);
    sessionStorage.setItem('install-banner-dismissed', '1');
  }, []);

  const handleInstall = useCallback(async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    dismiss();
  }, [deferredPrompt, dismiss]);

  if (!mode) return null;

  // ── 共用外框樣式 ──
  const wrapperClass = `
    fixed bottom-6 left-1/2 -translate-x-1/2 z-50
    flex items-start gap-3
    px-4 py-3.5
    rounded-2xl
    bg-zinc-900/90 text-white
    text-[13px] font-medium leading-snug
    shadow-xl shadow-black/20
    backdrop-blur-md
    max-w-[340px] w-[calc(100%-2rem)]
    animate-[slideUp_0.3s_ease-out]
  `;

  // ── Android Chrome ──
  if (mode === 'android') {
    return (
      <div role="status" aria-live="polite" aria-label="安裝應用程式提示" className={wrapperClass}>
        <DownloadIcon />
        <span className="flex-1">安裝到主畫面，享受完整 APP 體驗</span>
        <button
          onClick={handleInstall}
          className="shrink-0 px-3 py-1 rounded-lg bg-white/20 hover:bg-white/30 text-xs font-bold transition-colors"
        >
          安裝
        </button>
        <CloseButton onClick={dismiss} />
      </div>
    );
  }

  // ── LINE in-app browser ──
  if (mode === 'line') {
    return (
      <div role="status" aria-live="polite" aria-label="LINE 瀏覽器安裝提示" className={wrapperClass}>
        <DotsIcon />
        <span>
          點右下角「<strong>···</strong>」→「<strong>用瀏覽器開啟</strong>」，即可安裝為 APP
        </span>
        <CloseButton onClick={dismiss} />
      </div>
    );
  }

  // ── FB / IG 等 in-app browser ──
  if (mode === 'inapp') {
    return (
      <div role="status" aria-live="polite" aria-label="In-App 瀏覽器安裝提示" className={wrapperClass}>
        <ExternalIcon />
        <span>請用 <strong>Safari</strong> 開啟此頁面，即可安裝為 APP</span>
        <CloseButton onClick={dismiss} />
      </div>
    );
  }

  // ── iOS Safari ──
  return (
    <div role="status" aria-live="polite" aria-label="iOS 安裝提示" className={wrapperClass} onClick={dismiss}>
      <ShareIcon />
      <span>點「<strong>分享</strong>」→「<strong>加入主畫面</strong>」可安裝為 APP</span>
    </div>
  );
}

// ── 小型 SVG Icons ──

function CloseButton({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} aria-label="關閉提示" className="shrink-0 ml-auto opacity-60 hover:opacity-100 transition-opacity">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
        <path d="M18 6 6 18M6 6l12 12" />
      </svg>
    </button>
  );
}

function ShareIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 opacity-80 mt-0.5">
      <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
      <polyline points="16 6 12 2 8 6" />
      <line x1="12" y1="2" x2="12" y2="15" />
    </svg>
  );
}

function DotsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 opacity-80 mt-0.5">
      <circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /><circle cx="5" cy="12" r="1" />
    </svg>
  );
}

function ExternalIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 opacity-80 mt-0.5">
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 opacity-80 mt-0.5">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}
