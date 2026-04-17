@echo off
cd /d "%~dp0"
powershell -ExecutionPolicy Bypass -NoProfile -File ".\deploy.ps1"
if %errorlevel% neq 0 pause
