# Вырезать область PNG (и/или подложить тёмный фон под прозрачный снимок), с увеличением.
param([string]$In, [string]$Out, [int]$X = 0, [int]$Y = 0, [int]$W = 0, [int]$H = 0, [string]$Bg = "", [double]$Zoom = 1)
Add-Type -AssemblyName System.Drawing
$src = [System.Drawing.Image]::FromFile((Resolve-Path $In).Path)
if ($W -le 0) { $W = $src.Width - $X }
if ($H -le 0) { $H = $src.Height - $Y }
$ow = [int]($W * $Zoom); $oh = [int]($H * $Zoom)
$bmp = New-Object System.Drawing.Bitmap $ow, $oh
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
if ($Bg) { $g.Clear([System.Drawing.ColorTranslator]::FromHtml($Bg)) }
$g.DrawImage($src, (New-Object System.Drawing.Rectangle 0, 0, $ow, $oh), (New-Object System.Drawing.Rectangle $X, $Y, $W, $H), [System.Drawing.GraphicsUnit]::Pixel)
$src.Dispose()
$bmp.Save($Out, [System.Drawing.Imaging.ImageFormat]::Png)
Write-Output "$Out ${ow}x${oh}"
