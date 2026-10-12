param([string]$BindAddress='127.0.0.1',[int]$Port=4317)
$ErrorActionPreference='Stop'
$projectRoot=$PSScriptRoot
$nodePath=(Get-Command node -ErrorAction Stop).Source
$nodeMajor=[int]((& $nodePath --version).TrimStart('v').Split('.')[0])
if($nodeMajor -lt 24){
 $bundledNode=Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
 if(Test-Path -LiteralPath $bundledNode){$nodePath=$bundledNode}
 else{throw 'Ứng dụng cần Node.js 24 trở lên. Hãy cài Node.js 24 hoặc đặt NODE24_PATH.'}
}
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
 $serverArgs=@('--env-file-if-exists=.env','server/index.mjs')
 $serverProcess=Start-Process -FilePath $nodePath -ArgumentList $serverArgs -WorkingDirectory $projectRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $dataPath 'server.log') -RedirectStandardError (Join-Path $dataPath 'server-error.log') -PassThru
 @{pid=$serverProcess.Id;started=$serverProcess.StartTime.ToUniversalTime().ToString('o');port=$Port} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $dataPath 'server-process.json')
} finally {$env:PORT=$oldPort;$env:HOST=$oldHost}
for($attempt=0;$attempt -lt 30;$attempt++){
 try{$health=Invoke-RestMethod -Uri "http://127.0.0.1:$Port/api/health" -TimeoutSec 1;if($health.ok){Write-Host "San sang: http://localhost:$Port";return}}catch{}
 Start-Sleep -Milliseconds 200
}
throw 'Khong khoi dong duoc. Xem data/server-error.log.'
