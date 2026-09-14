@echo off
cd /d "%~dp0"
title GPS BA Locgram Evolution
echo Locgram — coleta placas do WhatsApp (Evolution)
echo Nao manda mensagem para Bira/Carlos/Maciel.
echo Se o processo cair, sobe sozinho em 10s.
echo.
:loop
node src\index.js
echo.
echo Worker parou. Nova tentativa em 10s (Ctrl+C para sair).
timeout /t 10 /nobreak >nul
if errorlevel 1 goto fim
goto loop
:fim
