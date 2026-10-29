@echo off
cd /d "%~dp0"
title GPS BA Radar Telegram
echo Radar GPS BA — Feira de Santana
echo Se o PC desligar, no proximo ligar ele puxa o que perdeu no Telegram.
echo Se o processo cair, sobe sozinho em 10s.
echo.
:loop
node src\index.js
echo.
echo Radar parou. Nova tentativa em 10s (Ctrl+C para sair).
timeout /t 10 /nobreak >nul
if errorlevel 1 goto fim
goto loop
:fim
