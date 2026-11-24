# Запустить оверлей с временным профилем и замерить CPU по типам процессов.
# Пример: powershell -File scripts\cpu-breakdown.ps1 -Fps 60 -Extra "--canvas-desync"
param([int]$Fps = 60, [int]$Seconds = 15, [string]$Extra = "", [int]$Intensity = -1)
Set-Location (Resolve-Path "$PSScriptRoot\..").Path
$prof = "tests\tmp-cpu"
Remove-Item -Recurse -Force $prof -ErrorAction SilentlyContinue
New-Item -ItemType Directory $prof | Out-Null
$snow = if ($Intensity -ge 0) { ", ""snow"": {""intensity"": $Intensity}" } else { "" }
Set-Content -Encoding ascii "$prof\settings.json" ("{""fpsLimit"": $Fps$snow}")
$args2 = @(".", "--overlay", "--user-data=tests/tmp-cpu") + ($Extra -split ' ' | Where-Object { $_ })
$p = Start-Process -PassThru -FilePath "node_modules\electron\dist\electron.exe" -ArgumentList $args2
Start-Sleep 10
function Snap { Get-CimInstance Win32_Process -Filter "Name='electron.exe'" | Where-Object { $_.CommandLine -like '*tmp-cpu*' -or $_.ProcessId -eq $p.Id } | ForEach-Object { $t = if ($_.CommandLine -match '--type=(\S+)') { $matches[1] } else { 'main' }; [pscustomobject]@{ Id = $_.ProcessId; Type = $t; Cpu = (Get-Process -Id $_.ProcessId).TotalProcessorTime.TotalSeconds } } }
$a = Snap; Start-Sleep $Seconds; $b = Snap
$total = 0.0
$parts = foreach ($x in $a) { $y = $b | Where-Object Id -eq $x.Id; if ($y) { $v = 100 * ($y.Cpu - $x.Cpu) / $Seconds; $total += $v; "{0}={1:N1}" -f $x.Type, $v } }
Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue
Start-Sleep 2
$cores = [Environment]::ProcessorCount
"fps=$Fps intensity=$Intensity extra='$Extra' :: " + ($parts -join ' ') + (" :: total {0:N1}% of one core = {1:N2}% of machine" -f $total, ($total / $cores))
