@echo off
cd /d "%~dp0"
title GPS BA Radar Telegram
echo Radar GPS BA — Feira de Santana
echo Se o PC desligar, no proximo ligar ele puxa o que perdeu no Telegram.
echo Se o processo cair, sobe sozinho em 60s.
echo.
:loop
node src\index.js
echo.
echo Radar parou. Nova tentativa em 60s (Ctrl+C para sair).
timeout /t 60 /nobreak >nul
if errorlevel 1 goto fim
goto loop
:fim
