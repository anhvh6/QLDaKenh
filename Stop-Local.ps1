$ErrorActionPreference='Stop'
$processFile=Join-Path $PSScriptRoot 'data/server-process.json'
if(!(Test-Path -LiteralPath $processFile)){Write-Host 'Không có tiến trình nền do Start-Local.ps1 quản lý.';return}
$saved=Get-Content -LiteralPath $processFile -Raw | ConvertFrom-Json
$serverProcess=Get-Process -Id $saved.pid -ErrorAction SilentlyContinue
if($serverProcess -and $serverProcess.ProcessName -eq 'node' -and $serverProcess.StartTime.ToUniversalTime().Ticks -eq ([datetime]$saved.started).ToUniversalTime().Ticks){Stop-Process -Id $serverProcess.Id;Write-Host 'Đã dừng máy chủ localhost.'}
else {Write-Host 'Tiến trình không còn khớp. Không dừng tiến trình khác.'}
