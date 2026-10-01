param([string]$BindAddress='127.0.0.1',[int]$Port=4317)
$ErrorActionPreference='Stop'
$projectRoot=$PSScriptRoot
$nodePath=(Get-Command node -ErrorAction Stop).Source
try {
 $health=Invoke-RestMethod -Uri "http://127.0.0.1:$Port/api/health" -TimeoutSec 2
 if($health.ok){Write-Host "Ung dung dang chay: http://localhost:$Port"; return}
} catch {}
$dataPath=Join-Path $projectRoot 'data'
New-Item -ItemType Directory -Path $dataPath -Force | Out-Null
$oldPort=$env:PORT
$oldHost=$env:HOST
try {
 $env:PORT=[string]$Port
 $env:HOST=$BindAddress
 $serverProcess=Start-Process -FilePath $nodePath -ArgumentList 'server/index.mjs' -WorkingDirectory $projectRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $dataPath 'server.log') -RedirectStandardError (Join-Path $dataPath 'server-error.log') -PassThru
 @{pid=$serverProcess.Id;started=$serverProcess.StartTime.ToUniversalTime().ToString('o');port=$Port} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $dataPath 'server-process.json')
} finally {$env:PORT=$oldPort;$env:HOST=$oldHost}
for($attempt=0;$attempt -lt 30;$attempt++){
 try{$health=Invoke-RestMethod -Uri "http://127.0.0.1:$Port/api/health" -TimeoutSec 1;if($health.ok){Write-Host "San sang: http://localhost:$Port";return}}catch{}
 Start-Sleep -Milliseconds 200
}
throw 'Khong khoi dong duoc. Xem data/server-error.log.'
