# Средняя загрузка CPU приложением: главный electron.exe этого проекта + все его дочерние процессы
# (рендереры и GPU в песочнице не показывают Path, поэтому идём по дереву ParentProcessId).
param([int]$Seconds = 15)
$root = (Resolve-Path "$PSScriptRoot\..").Path
function Get-Snap {
  $all = Get-CimInstance Win32_Process
  $main = $all | Where-Object { $_.Name -eq 'electron.exe' -and $_.ExecutablePath -like "$root*" -and -not ($_.CommandLine -match '--type=') }
  $ids = New-Object System.Collections.Generic.HashSet[string]
  foreach ($m in $main) { [void]$ids.Add([string]$m.ProcessId) }
  do {
    $added = $false
    foreach ($p in $all) { if ($ids.Contains([string]$p.ParentProcessId) -and $ids.Add([string]$p.ProcessId)) { $added = $true } }
  } while ($added)
  $h = @{}
  foreach ($id in $ids) {
    $g = Get-Process -Id ([int]$id) -ErrorAction SilentlyContinue
    if ($g) { $h[$id] = $g.TotalProcessorTime.TotalSeconds }
  }
  return $h
}
$a = Get-Snap
Start-Sleep -Seconds $Seconds
$b = Get-Snap
$d = 0.0; $n = 0
foreach ($k in @($a.Keys)) { if ($b.ContainsKey($k)) { $d += $b[$k] - $a[$k]; $n++ } }
$cores = [Environment]::ProcessorCount
"processes=$n cores=$cores cpu=" + [math]::Round(100 * $d / $Seconds / $cores, 2) + "% of machine (" + [math]::Round(100 * $d / $Seconds, 1) + "% of one core)"
