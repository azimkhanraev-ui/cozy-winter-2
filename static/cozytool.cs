// Cozy Winter 2 — разовые действия с Windows (собирается встроенным csc.exe при первом использовании).
//   cozytool.exe wallpaper-get          → путь к текущим обоям
//   cozytool.exe wallpaper-set <путь>   → установить обои (режим «Заполнение»)
using System;
using System.Runtime.InteropServices;
using System.Text;
using Microsoft.Win32;

public static class CozyTool {
  [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
  static extern bool SystemParametersInfo(uint action, uint param, StringBuilder vparam, uint init);
  [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
  static extern bool SystemParametersInfo(uint action, uint param, string vparam, uint init);

  const uint SPI_GETDESKWALLPAPER = 0x0073;
  const uint SPI_SETDESKWALLPAPER = 0x0014;
  const uint SPIF_UPDATEINIFILE = 0x01;
  const uint SPIF_SENDCHANGE = 0x02;

  public static int Main(string[] a) {
    Console.OutputEncoding = Encoding.UTF8;
    if (a.Length >= 1 && a[0] == "wallpaper-get") {
      var sb = new StringBuilder(1024);
      SystemParametersInfo(SPI_GETDESKWALLPAPER, (uint)sb.Capacity, sb, 0);
      Console.WriteLine(sb.ToString());
      return 0;
    }
    if (a.Length >= 2 && a[0] == "wallpaper-set") {
      // «Заполнение» (10) без мозаики — картинка покрывает экран без полос
      using (var k = Registry.CurrentUser.OpenSubKey(@"Control Panel\Desktop", true)) {
        if (k != null) {
          k.SetValue("WallpaperStyle", "10");
          k.SetValue("TileWallpaper", "0");
        }
      }
      bool ok = SystemParametersInfo(SPI_SETDESKWALLPAPER, 0, a[1], SPIF_UPDATEINIFILE | SPIF_SENDCHANGE);
      Console.WriteLine(ok ? "ok" : "error " + Marshal.GetLastWin32Error());
      return ok ? 0 : 1;
    }
    Console.WriteLine("usage: wallpaper-get | wallpaper-set <path>");
    return 2;
  }
}
