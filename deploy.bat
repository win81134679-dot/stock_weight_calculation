@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

:: ============================================
::  台股持有權重計算器 — 換股快速部署工具
::  用法：雙擊執行，依提示操作即可
:: ============================================

set "PROJECT=C:\Users\User\Documents\股票持有權重計算\stock_weight_calculation"
set "CONFIG=%PROJECT%\src\lib\portfolio-config.ts"

cd /d "%PROJECT%" || (
    echo [錯誤] 找不到專案目錄：%PROJECT%
    pause
    exit /b 1
)

echo.
echo ╔══════════════════════════════════════════════╗
echo ║   台股持有權重計算器 — 換股部署工具          ║
echo ╠══════════════════════════════════════════════╣
echo ║  1. 編輯股票配置                            ║
echo ║  2. 直接部署（不修改配置）                  ║
echo ║  3. 查看目前配置                            ║
echo ║  4. 離開                                    ║
echo ╚══════════════════════════════════════════════╝
echo.

set /p CHOICE=請選擇操作 [1/2/3/4]：

if "%CHOICE%"=="1" goto EDIT
if "%CHOICE%"=="2" goto DEPLOY
if "%CHOICE%"=="3" goto VIEW
if "%CHOICE%"=="4" exit /b 0
echo [錯誤] 無效選項
pause
goto :eof

:: ── 查看目前配置 ──
:VIEW
echo.
echo ────────── 目前股票配置 ──────────
type "%CONFIG%"
echo.
echo ──────────────────────────────────
echo.
pause
goto :eof

:: ── 編輯配置 ──
:EDIT
echo.
echo [提示] 即將用 VS Code 開啟配置檔案...
echo [提示] 修改 DEFAULT_STOCKS 陣列中的 code 和 weight
echo [提示] 存檔後回到這裡按任意鍵繼續部署
echo.

:: 優先用 VS Code，否則用 notepad
where code >nul 2>&1
if %errorlevel%==0 (
    code "%CONFIG%" --wait
) else (
    notepad "%CONFIG%"
)

echo.
set /p CONFIRM=配置已修改完成？繼續部署？[Y/N]：
if /i not "%CONFIRM%"=="Y" (
    echo [取消] 部署已取消
    pause
    goto :eof
)

:: ── 部署流程 ──
:DEPLOY
echo.
echo ══════════════════════════════════
echo   Step 1/3：建置驗證...
echo ══════════════════════════════════
call npm run build
if %errorlevel% neq 0 (
    echo.
    echo [錯誤] 建置失敗！請修正錯誤後重試
    pause
    goto :eof
)

echo.
echo ══════════════════════════════════
echo   Step 2/3：Git 提交...
echo ══════════════════════════════════

:: 取得今天日期
for /f "tokens=2 delims==" %%I in ('wmic os get localdatetime /value') do set DT=%%I
set TODAY=%DT:~0,4%-%DT:~4,2%-%DT:~6,2%

set "MSG=chore: rebalance portfolio %TODAY%"
set /p CUSTOM_MSG=提交訊息（按 Enter 使用預設：%MSG%）：
if not "%CUSTOM_MSG%"=="" set "MSG=%CUSTOM_MSG%"

git add -A
git commit -m "%MSG%"
if %errorlevel% neq 0 (
    echo.
    echo [提示] 沒有偵測到任何變更，跳過提交
)

echo.
echo ══════════════════════════════════
echo   Step 3/3：推送至 GitHub...
echo ══════════════════════════════════
git push
if %errorlevel% neq 0 (
    echo.
    echo [錯誤] 推送失敗！請檢查網路或 Git 設定
    pause
    goto :eof
)

echo.
echo ╔══════════════════════════════════════════════╗
echo ║   部署完成！Vercel 將自動更新               ║
echo ║   https://stockweightcalculation.vercel.app ║
echo ╚══════════════════════════════════════════════╝
echo.
pause
