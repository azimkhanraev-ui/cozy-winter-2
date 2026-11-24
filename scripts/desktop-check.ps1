# Проверка оверлея на реальном рабочем столе:
#  1) снимок всего экрана (видно, прозрачное ли окно или чёрное);
#  2) какое окно получает клик в нескольких точках (WindowFromPoint) — если не Cozy Winter, клики проходят насквозь.
param([string]$Out = "tests/shots/desktop.png")

Add-Type -AssemblyName System.Drawing, System.Windows.Forms
Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class W32 {
  [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X; public int Y; }
  [DllImport("user32.dll")] public static extern IntPtr WindowFromPoint(POINT p);
  [DllImport("user32.dll")] public static extern IntPtr GetAncestor(IntPtr h, uint flags);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetClassName(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] public static extern IntPtr GetDC(IntPtr h);
  [DllImport("user32.dll")] public static extern int ReleaseDC(IntPtr h, IntPtr dc);
  [DllImport("gdi32.dll")] public static extern bool BitBlt(IntPtr d, int x, int y, int w, int h, IntPtr s, int sx, int sy, uint op);
}
"@
[W32]::SetProcessDPIAware() | Out-Null

$vs = [System.Windows.Forms.SystemInformation]::VirtualScreen
$bmp = New-Object System.Drawing.Bitmap $vs.Width, $vs.Height
$g = [System.Drawing.Graphics]::FromImage($bmp)
# BitBlt с CAPTUREBLT: иначе прозрачные (layered) окна, в т.ч. оверлей, не попадают в снимок
$sdc = [W32]::GetDC([IntPtr]::Zero)
$hdc = $g.GetHdc()
[W32]::BitBlt($hdc, 0, 0, $vs.Width, $vs.Height, $sdc, $vs.Left, $vs.Top, 0x40CC0020) | Out-Null
$g.ReleaseHdc($hdc)
[W32]::ReleaseDC([IntPtr]::Zero, $sdc) | Out-Null
$dir = Split-Path $Out -Parent
if ($dir) { New-Item -ItemType Directory -Force $dir | Out-Null }
$bmp.Save((Resolve-Path -LiteralPath $dir).Path + "\" + (Split-Path $Out -Leaf), [System.Drawing.Imaging.ImageFormat]::Png)
Write-Output "screenshot: $Out ($($vs.Width)x$($vs.Height))"

$scr = [System.Windows.Forms.Screen]::PrimaryScreen
$wa = $scr.WorkingArea
$pts = @(
  @{ X = [int]($wa.Left + $wa.Width / 2); Y = [int]($wa.Top + $wa.Height / 2) },
  @{ X = [int]($wa.Left + 200); Y = [int]($wa.Bottom - 10) },
  @{ X = [int]($wa.Right - 200); Y = [int]($wa.Top + 100) }
)
foreach ($p in $pts) {
  $pt = New-Object W32+POINT
  $pt.X = $p.X; $pt.Y = $p.Y
  $h = [W32]::GetAncestor([W32]::WindowFromPoint($pt), 2)
  $procId = 0
  [W32]::GetWindowThreadProcessId($h, [ref]$procId) | Out-Null
  $t = New-Object System.Text.StringBuilder 256
  $c = New-Object System.Text.StringBuilder 256
  [W32]::GetWindowText($h, $t, 256) | Out-Null
  [W32]::GetClassName($h, $c, 256) | Out-Null
  $pn = (Get-Process -Id $procId -ErrorAction SilentlyContinue).ProcessName
  Write-Output ("point ({0},{1}) -> process={2} class={3} title='{4}'" -f $p.X, $p.Y, $pn, $c, $t)
}
