# ============================================
#  台股持有權重計算器 — 換股快速部署工具
#  用法：雙擊 deploy.bat 即可
# ============================================

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

$PROJECT = 'C:\Users\User\Documents\股票持有權重計算\stock_weight_calculation'
$CONFIG  = Join-Path $PROJECT 'src\lib\portfolio-config.ts'

Set-Location $PROJECT

function Show-Menu {
    Write-Host ''
    Write-Host '╔══════════════════════════════════════════════╗' -ForegroundColor Cyan
    Write-Host '║   台股持有權重計算器 — 換股部署工具          ║' -ForegroundColor Cyan
    Write-Host '╠══════════════════════════════════════════════╣' -ForegroundColor Cyan
    Write-Host '║  1. 編輯股票配置                            ║' -ForegroundColor Cyan
    Write-Host '║  2. 直接部署（不修改配置）                  ║' -ForegroundColor Cyan
    Write-Host '║  3. 查看目前配置                            ║' -ForegroundColor Cyan
    Write-Host '║  4. 離開                                    ║' -ForegroundColor Cyan
    Write-Host '╚══════════════════════════════════════════════╝' -ForegroundColor Cyan
    Write-Host ''
}

function View-Config {
    Write-Host ''
    Write-Host '────────── 目前股票配置 ──────────' -ForegroundColor Yellow
    Get-Content $CONFIG -Encoding UTF8
    Write-Host '──────────────────────────────────' -ForegroundColor Yellow
    Write-Host ''
    Read-Host '按 Enter 返回'
}

function Edit-Config {
    Write-Host ''
    Write-Host '[提示] 即將用 VS Code 開啟配置檔案...' -ForegroundColor Green
    Write-Host '[提示] 修改 DEFAULT_STOCKS 陣列中的 code 和 weight' -ForegroundColor Green
    Write-Host '[提示] 存檔後回到這裡繼續部署' -ForegroundColor Green
    Write-Host ''

    if (Get-Command code -ErrorAction SilentlyContinue) {
        code $CONFIG --wait
    } else {
        notepad $CONFIG | Out-Null
    }

    $confirm = Read-Host '配置已修改完成？繼續部署？[Y/N]'
    if ($confirm -ne 'Y' -and $confirm -ne 'y') {
        Write-Host '[取消] 部署已取消' -ForegroundColor Yellow
        return
    }
    Deploy
}

function Deploy {
    # Step 1: 建置
    Write-Host ''
    Write-Host '══════════════════════════════════' -ForegroundColor Magenta
    Write-Host '  Step 1/3：建置驗證...' -ForegroundColor Magenta
    Write-Host '══════════════════════════════════' -ForegroundColor Magenta

    npm run build
    if ($LASTEXITCODE -ne 0) {
        Write-Host ''
        Write-Host '[錯誤] 建置失敗！請修正錯誤後重試' -ForegroundColor Red
        Read-Host '按 Enter 返回'
        return
    }

    # Step 2: Git 提交
    Write-Host ''
    Write-Host '══════════════════════════════════' -ForegroundColor Magenta
    Write-Host '  Step 2/3：Git 提交...' -ForegroundColor Magenta
    Write-Host '══════════════════════════════════' -ForegroundColor Magenta

    $today = Get-Date -Format 'yyyy-MM-dd'
    $defaultMsg = "chore: rebalance portfolio $today"
    $customMsg = Read-Host "提交訊息（按 Enter 使用預設：$defaultMsg）"
    if ([string]::IsNullOrWhiteSpace($customMsg)) { $customMsg = $defaultMsg }

    git add -A
    git commit -m $customMsg
    if ($LASTEXITCODE -ne 0) {
        Write-Host '[提示] 沒有偵測到任何變更，跳過提交' -ForegroundColor Yellow
    }

    # Step 3: 推送
    Write-Host ''
    Write-Host '══════════════════════════════════' -ForegroundColor Magenta
    Write-Host '  Step 3/3：推送至 GitHub...' -ForegroundColor Magenta
    Write-Host '══════════════════════════════════' -ForegroundColor Magenta

    git push
    if ($LASTEXITCODE -ne 0) {
        Write-Host ''
        Write-Host '[錯誤] 推送失敗！請檢查網路或 Git 設定' -ForegroundColor Red
        Read-Host '按 Enter 返回'
        return
    }

    Write-Host ''
    Write-Host '╔══════════════════════════════════════════════╗' -ForegroundColor Green
    Write-Host '║   部署完成！Vercel 將自動更新               ║' -ForegroundColor Green
    Write-Host '║   https://stockweightcalculation.vercel.app ║' -ForegroundColor Green
    Write-Host '╚══════════════════════════════════════════════╝' -ForegroundColor Green
    Write-Host ''
    Read-Host '按 Enter 結束'
}

# ── 主迴圈 ──
do {
    Show-Menu
    $choice = Read-Host '請選擇操作 [1/2/3/4]'
    switch ($choice) {
        '1' { Edit-Config }
        '2' { Deploy }
        '3' { View-Config }
        '4' { exit 0 }
        default { Write-Host '[錯誤] 無效選項' -ForegroundColor Red }
    }
} while ($true)
