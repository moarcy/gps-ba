# Coloca o radar na inicializacao do Windows (pasta Startup).
# Nao precisa de /start no Telegram: o grupo ja esta no .env.

$ErrorActionPreference = "Stop"
$radarDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$node = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $node) {
  throw "Node.js nao encontrado no PATH. Instale em https://nodejs.org e abra um terminal novo."
}

$startup = [Environment]::GetFolderPath("Startup")
$lnkPath = Join-Path $startup "GPS BA Radar Telegram.lnk"

$wsh = New-Object -ComObject WScript.Shell
$lnk = $wsh.CreateShortcut($lnkPath)
$cmd = Join-Path $radarDir "start-radar.cmd"
$lnk.TargetPath = $cmd
$lnk.Arguments = ""
$lnk.WorkingDirectory = $radarDir
$lnk.WindowStyle = 7
$lnk.Description = "Radar Telegram Feira de Santana (catch-up + restart)"
$lnk.Save()

Write-Host "Autostart criado:"
Write-Host "  $lnkPath"
Write-Host ""
Write-Host "No proximo login do Windows o radar sobe minimizado."
Write-Host "Se o PC desligar, ao ligar ele puxa os alertas que ficaram no Telegram."
Write-Host "Para testar agora, rode start-radar.cmd ou reinicie o PC."
Write-Host "Para remover: .\uninstall-autostart.ps1"
