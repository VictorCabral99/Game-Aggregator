@echo off
title Game Center — Electron (develop)
cd /d "%~dp0.."
if not exist "packages\core\dist\index.js" (
  call npm run build -w @gagg/core
)
call npm run build -w @gagg/providers-meta 2>nul
npm run dev -w @gagg/desktop
