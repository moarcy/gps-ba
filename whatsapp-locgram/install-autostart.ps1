# Coloca a coleta Locgram (Evolution) na inicializacao do Windows.
$ErrorActionPreference = "Stop"
$workerDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$node = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $node) {
  throw "Node.js nao encontrado no PATH. Instale em https://nodejs.org e abra um terminal novo."
}

$startup = [Environment]::GetFolderPath("Startup")
$lnkPath = Join-Path $startup "GPS BA Locgram Evolution.lnk"

$wsh = New-Object -ComObject WScript.Shell
$lnk = $wsh.CreateShortcut($lnkPath)
$cmd = Join-Path $workerDir "start-locgram.cmd"
$lnk.TargetPath = $cmd
$lnk.Arguments = ""
$lnk.WorkingDirectory = $workerDir
$lnk.WindowStyle = 7
$lnk.Description = "Coleta Locgram via Evolution e joga na aba Localizados"
$lnk.Save()

Write-Host "Autostart criado:"
Write-Host "  $lnkPath"
Write-Host ""
Write-Host "No proximo login do Windows o worker sobe minimizado."
Write-Host "Na Evolution, webhook: http://127.0.0.1:8790/webhook  evento messages.upsert"
Write-Host "Para testar agora, rode start-locgram.cmd"
Write-Host "Para remover: .\uninstall-autostart.ps1"
