$lnkPath = Join-Path ([Environment]::GetFolderPath("Startup")) "GPS BA Radar Telegram.lnk"
if (Test-Path $lnkPath) {
  Remove-Item $lnkPath -Force
  Write-Host "Autostart removido: $lnkPath"
} else {
  Write-Host "Nao havia atalho de inicializacao."
}
