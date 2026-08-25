$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$source = Join-Path $root 'assets\logo.png'
$outDir = Join-Path $root 'build'
$output = Join-Path $outDir 'windows-icon.png'

if (-not (Test-Path $source)) {
  throw "Source icon not found: $source"
}

New-Item -ItemType Directory -Force -Path $outDir | Out-Null

$image = [System.Drawing.Image]::FromFile($source)
try {
  $size = 512
  $bitmap = New-Object System.Drawing.Bitmap $size, $size
  try {
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    try {
      $graphics.Clear([System.Drawing.Color]::Transparent)
      $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
      $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
      $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

      $scale = [Math]::Min($size / $image.Width, $size / $image.Height)
      $width = [Math]::Max(1, [int][Math]::Round($image.Width * $scale))
      $height = [Math]::Max(1, [int][Math]::Round($image.Height * $scale))
      $x = [int](($size - $width) / 2)
      $y = [int](($size - $height) / 2)
      $graphics.DrawImage($image, $x, $y, $width, $height)
    }
    finally {
      $graphics.Dispose()
    }

    $bitmap.Save($output, [System.Drawing.Imaging.ImageFormat]::Png)
  }
  finally {
    $bitmap.Dispose()
  }
}
finally {
  $image.Dispose()
}

if (-not (Test-Path $output) -or (Get-Item $output).Length -le 0) {
  throw "Windows icon generation failed: $output"
}

Write-Host "Prepared Windows icon: $output"
