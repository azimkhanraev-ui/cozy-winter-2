# Cozy Winter 2 — помощник для Windows API (без нативных модулей Node).
# Раз в ~0.5 с печатает JSON-строку:
#   fullscreen — запущено полноэкранное приложение/игра/презентация (SHQueryUserNotificationState + проверка активного окна)
#   windows    — видимые окна верхнего уровня (физические пиксели) и не перекрытые отрезки их верхних кромок
# Завершается сам, когда умирает родительский процесс.
param([int]$ParentPid = 0, [int]$IntervalMs = 500, [string]$Cache = '')
$ErrorActionPreference = 'Stop'
$code = @"
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;

public static class CozyWin {
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L, T, R, B; }
  [StructLayout(LayoutKind.Sequential)] public struct MONITORINFO { public int cbSize; public RECT rcMonitor; public RECT rcWork; public int dwFlags; }
  delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc cb, IntPtr l);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] static extern int GetWindowLong(IntPtr h, int i);
  [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetClassName(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] static extern IntPtr MonitorFromWindow(IntPtr h, uint f);
  [DllImport("user32.dll")] static extern bool GetMonitorInfo(IntPtr m, ref MONITORINFO mi);
  [DllImport("user32.dll")] static extern IntPtr GetAncestor(IntPtr h, uint f);
  [DllImport("user32.dll")] static extern bool SetProcessDpiAwarenessContext(IntPtr v);
  [DllImport("user32.dll")] static extern bool SetProcessDPIAware();
  [DllImport("dwmapi.dll")] static extern int DwmGetWindowAttribute(IntPtr h, int a, out RECT r, int s);
  [DllImport("dwmapi.dll")] static extern int DwmGetWindowAttribute(IntPtr h, int a, out int v, int s);
  [DllImport("shell32.dll")] static extern int SHQueryUserNotificationState(out int s);

  public static void InitDpi() {
    try { if (SetProcessDpiAwarenessContext(new IntPtr(-4))) return; } catch {}
    try { SetProcessDPIAware(); } catch {}
  }

  static readonly HashSet<string> SkipClass = new HashSet<string> {
    "Progman", "WorkerW", "Shell_TrayWnd", "Shell_SecondaryTrayWnd", "NotifyIconOverflowWindow",
    "Windows.UI.Core.CoreWindow", "ForegroundStaging", "MultitaskingViewFrame", "XamlExplorerHostIslandWindow"
  };

  static RECT Bounds(IntPtr h) {
    RECT r;
    if (DwmGetWindowAttribute(h, 9, out r, Marshal.SizeOf(typeof(RECT))) == 0) return r; // DWMWA_EXTENDED_FRAME_BOUNDS
    GetWindowRect(h, out r);
    return r;
  }

  static string Cls(IntPtr h) { var c = new StringBuilder(256); GetClassName(h, c, 256); return c.ToString(); }

  public static bool Fullscreen(out int quns) {
    quns = 0;
    try { SHQueryUserNotificationState(out quns); } catch {}
    // 3 = D3D полноэкранный, 4 = режим презентации
    if (quns == 3 || quns == 4) return true;
    IntPtr fg = GetForegroundWindow();
    if (fg == IntPtr.Zero) return false;
    string c = Cls(fg);
    if (SkipClass.Contains(c)) return false;
    RECT r = Bounds(fg);
    var mi = new MONITORINFO(); mi.cbSize = Marshal.SizeOf(typeof(MONITORINFO));
    if (!GetMonitorInfo(MonitorFromWindow(fg, 2), ref mi)) return false;
    return r.L <= mi.rcMonitor.L && r.T <= mi.rcMonitor.T && r.R >= mi.rcMonitor.R && r.B >= mi.rcMonitor.B;
  }

  public static string Windows(uint skipPid) {
    var list = new List<RECT>();
    var ids = new List<long>();
    EnumWindows((h, l) => {
      if (list.Count >= 40) return false;
      if (!IsWindowVisible(h) || IsIconic(h)) return true;
      int ex = GetWindowLong(h, -20);
      if ((ex & 0x80) != 0) return true;               // WS_EX_TOOLWINDOW
      int cloaked; if (DwmGetWindowAttribute(h, 14, out cloaked, 4) == 0 && cloaked != 0) return true;
      uint pid; GetWindowThreadProcessId(h, out pid);
      if (pid == skipPid) return true;
      if (GetAncestor(h, 1) != IntPtr.Zero && GetAncestor(h, 1) != h && GetAncestor(h, 2) != h) return true;
      string c = Cls(h);
      if (SkipClass.Contains(c)) return true;
      var t = new StringBuilder(8); if (GetWindowText(h, t, 8) == 0) return true;
      RECT r = Bounds(h);
      if (r.R - r.L < 120 || r.B - r.T < 60) return true;
      list.Add(r); ids.Add(h.ToInt64());
      return true;
    }, IntPtr.Zero);
    // Окна идут сверху вниз по z-порядку: верхняя кромка видна там, где её не перекрывают окна выше.
    var sb = new StringBuilder("[");
    for (int i = 0; i < list.Count; i++) {
      RECT r = list[i];
      var segs = new List<int[]> { new int[] { r.L, r.R } };
      for (int j = 0; j < i && segs.Count > 0; j++) {
        RECT o = list[j];
        if (r.T < o.T - 1 || r.T >= o.B) continue;
        var next = new List<int[]>();
        foreach (var s in segs) {
          if (o.R <= s[0] || o.L >= s[1]) { next.Add(s); continue; }
          if (o.L > s[0]) next.Add(new int[] { s[0], o.L });
          if (o.R < s[1]) next.Add(new int[] { o.R, s[1] });
        }
        segs = next;
      }
      if (i > 0) sb.Append(',');
      sb.Append("{\"id\":\"").Append(ids[i]).Append("\",\"x\":").Append(r.L).Append(",\"y\":").Append(r.T)
        .Append(",\"w\":").Append(r.R - r.L).Append(",\"h\":").Append(r.B - r.T).Append(",\"top\":[");
      for (int k = 0; k < segs.Count; k++) {
        if (k > 0) sb.Append(',');
        sb.Append('[').Append(segs[k][0]).Append(',').Append(segs[k][1]).Append(']');
      }
      sb.Append("]}");
    }
    return sb.Append(']').ToString();
  }
}
"@
# Компиляция C# занимает до ~20 с, поэтому сборка кэшируется в DLL (имя содержит версию кода).
if ($Cache -and (Test-Path -LiteralPath $Cache)) {
  try { Add-Type -Path $Cache } catch { Add-Type -TypeDefinition $code }
} elseif ($Cache) {
  try { Add-Type -TypeDefinition $code -OutputAssembly $Cache; Add-Type -Path $Cache } catch { Add-Type -TypeDefinition $code }
} else {
  Add-Type -TypeDefinition $code
}
[CozyWin]::InitDpi()
[Console]::Out.WriteLine('{"ready":true}')
[Console]::Out.Flush()
while ($true) {
  if ($ParentPid -gt 0 -and -not (Get-Process -Id $ParentPid -ErrorAction SilentlyContinue)) { exit 0 }
  try {
    $q = 0
    $fs = [CozyWin]::Fullscreen([ref]$q)
    $w = [CozyWin]::Windows([uint32]$ParentPid)
    [Console]::Out.WriteLine('{"fullscreen":' + $fs.ToString().ToLower() + ',"quns":' + $q + ',"windows":' + $w + '}')
    [Console]::Out.Flush()
  } catch {
    [Console]::Out.WriteLine('{"error":' + (ConvertTo-Json ([string]$_)) + '}')
    [Console]::Out.Flush()
  }
  Start-Sleep -Milliseconds $IntervalMs
}
