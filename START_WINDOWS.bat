@echo off
chcp 65001 >nul
title Wedding Halls ERP
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js غير مثبت. ثبته من https://nodejs.org/ ثم أعد المحاولة.
  pause
  exit /b 1
)
if not exist .env copy .env.example .env >nul
if not exist node_modules (
  echo جاري تثبيت الحزم لأول مرة...
  call npm install
  if errorlevel 1 (
    echo فشل تثبيت الحزم. تحقق من اتصال الإنترنت ثم أعد المحاولة.
    pause
    exit /b 1
  )
)
echo جاري تشغيل Wedding Halls ERP على الشبكة الداخلية...
echo لمعرفة عنوان الجهاز افتح نافذة أخرى ونفّذ ipconfig ثم استخدم IPv4 على الأجهزة الأخرى.
call npm start
pause
