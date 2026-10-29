# Configura interceptacao Locgram (Evolution -> aba Localizados).
# Nao manda Zap para Bira/Carlos/Maciel. Nao marca Sim/Nao.
$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $here

$envFile = Join-Path $here ".env"
if (-not (Test-Path $envFile)) {
  Copy-Item (Join-Path $here ".env.example") $envFile
  Write-Host "Criei .env a partir do exemplo. Abra e preencha:"
  Write-Host "  EVOLUTION_API_URL"
  Write-Host "  EVOLUTION_API_KEY"
  Write-Host "  EVOLUTION_INSTANCE"
  notepad $envFile
  Write-Host "Salve o .env e rode este script de novo."
  exit 0
}

$envText = Get-Content $envFile -Raw
if ($envText -notmatch '(?m)^EVOLUTION_API_KEY=.+' -or $envText -match '(?m)^EVOLUTION_API_KEY=\s*$' -or $envText -notmatch '(?m)^EVOLUTION_INSTANCE=.+' -or $envText -match '(?m)^EVOLUTION_INSTANCE=\s*$') {
  Write-Host "O .env ainda esta sem EVOLUTION_API_KEY / EVOLUTION_INSTANCE."
  Write-Host "Preencha e rode este script de novo. A Evolution precisa estar ligada neste PC."
  notepad $envFile
  exit 1
}

npm install
node src\find-locgram-jid.js
node src\setup-webhook.js
powershell -ExecutionPolicy Bypass -File .\install-autostart.ps1

Write-Host ""
Write-Host "Pronto. Suba o worker: .\start-locgram.cmd"
Write-Host "Webhook: http://127.0.0.1:8790/webhook"
Write-Host "So entra Nova ocorrencia. Posicao voce marca na aba Local."
