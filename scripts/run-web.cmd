@echo off
title Game Aggregator — Web (main)
cd /d "%~dp0.."
if "%GAGG_WEB_PORT%"=="" set GAGG_WEB_PORT=3000
npm run dev -- --port %GAGG_WEB_PORT%
