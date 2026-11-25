// Тестовый зонд: какое окно (процесс) получит клик в точке экрана. probe.exe x y [x y ...]
using System;
using System.Runtime.InteropServices;
public static class Probe {
  [StructLayout(LayoutKind.Sequential)] struct POINT { public int X, Y; }
  [DllImport("user32.dll")] static extern IntPtr WindowFromPoint(POINT p);
  [DllImport("user32.dll")] static extern IntPtr GetAncestor(IntPtr h, uint f);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] static extern bool SetProcessDPIAware();
  public static void Main(string[] a) {
    SetProcessDPIAware();
    for (int i = 0; i + 1 < a.Length; i += 2) {
      POINT p; p.X = int.Parse(a[i]); p.Y = int.Parse(a[i + 1]);
      IntPtr h = GetAncestor(WindowFromPoint(p), 2);
      uint pid; GetWindowThreadProcessId(h, out pid);
      Console.WriteLine(p.X + "," + p.Y + " " + pid);
    }
  }
}
