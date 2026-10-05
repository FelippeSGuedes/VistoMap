# Otimiza os pins de torre do app (torre-claro-app.png / torre-vivo-app.png).
#
# POR QUE: os PNG vieram em 1254x1254 com ~1 MB cada, para desenhar um pin de
# ~50 px no mapa. Isso é peso de download e de memória (1254² em RGBA = 6,3 MB
# de bitmap descomprimido POR imagem na WebView) sem nenhum ganho visível.
#
# O QUE FAZ: recorta a margem transparente (o bbox do alfa) e reduz pra
# LARGURA_ALVO, sobrescrevendo o arquivo. O recorte importa além do tamanho:
# o sprite é ancorado em "bottom" no Mapbox, então margem transparente embaixo
# empurraria o bico do pin pra cima do ponto real da torre.
#
# ATENÇÃO: o script SOBRESCREVE o arquivo em public/. Guarde o original fora
# do repositório antes de rodar — já houve perda por rodar direto sobre uma
# imagem recém-trocada (2026-10-05). O backup abaixo é uma rede de segurança,
# não substituto disso: ele só guarda a versão imediatamente anterior.
#
# Uso: powershell -NoProfile -File scripts/otimizar-torres-png.ps1

Add-Type -AssemblyName System.Drawing

$BACKUP = Join-Path (Get-Location) 'scripts\dados\originais'
New-Item -ItemType Directory -Force -Path $BACKUP | Out-Null

# 256 px cobre um pin de ~50 px mesmo em tela 3x, com folga pra zoom.
$LARGURA_ALVO = 256

foreach ($nome in @('torre-claro-app.png', 'torre-vivo-app.png')) {
  $caminho = Join-Path (Join-Path (Get-Location) 'public') $nome
  if (-not (Test-Path $caminho)) { Write-Host "pulando $nome (ausente)"; continue }

  $orig = [System.Drawing.Bitmap]::FromFile($caminho)
  $bytesAntes = (Get-Item $caminho).Length

  # Idempotência: rodar duas vezes reamostraria uma imagem já reduzida,
  # perdendo qualidade sem ganho nenhum de tamanho.
  if ($orig.Width -le $LARGURA_ALVO) {
    Write-Host "pulando $nome (já está em $($orig.Width) px)"
    $orig.Dispose()
    continue
  }
  $orig.Dispose()
  Copy-Item $caminho (Join-Path $BACKUP $nome) -Force
  $orig = [System.Drawing.Bitmap]::FromFile($caminho)

  # bbox do alfa via LockBits — GetPixel em 1,5 milhão de pixels é lento demais
  $rect = New-Object System.Drawing.Rectangle 0, 0, $orig.Width, $orig.Height
  $dados = $orig.LockBits($rect, [System.Drawing.Imaging.ImageLockMode]::ReadOnly,
                          [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $total = $dados.Stride * $orig.Height
  $buf = New-Object byte[] $total
  [System.Runtime.InteropServices.Marshal]::Copy($dados.Scan0, $buf, 0, $total)
  $orig.UnlockBits($dados)

  $minX = $orig.Width; $minY = $orig.Height; $maxX = -1; $maxY = -1
  for ($y = 0; $y -lt $orig.Height; $y++) {
    $linha = $y * $dados.Stride
    for ($x = 0; $x -lt $orig.Width; $x++) {
      # BGRA little-endian: alfa é o 4º byte
      if ($buf[$linha + $x * 4 + 3] -gt 8) {
        if ($x -lt $minX) { $minX = $x }
        if ($x -gt $maxX) { $maxX = $x }
        if ($y -lt $minY) { $minY = $y }
        if ($y -gt $maxY) { $maxY = $y }
      }
    }
  }
  if ($maxX -lt 0) { Write-Host "pulando $nome (imagem toda transparente)"; $orig.Dispose(); continue }

  $lc = $maxX - $minX + 1
  $ac = $maxY - $minY + 1
  $novaAltura = [int][Math]::Round($ac * ($LARGURA_ALVO / $lc))

  $saida = New-Object System.Drawing.Bitmap $LARGURA_ALVO, $novaAltura
  $g = [System.Drawing.Graphics]::FromImage($saida)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
  $destino = New-Object System.Drawing.Rectangle 0, 0, $LARGURA_ALVO, $novaAltura
  $origem = New-Object System.Drawing.Rectangle $minX, $minY, $lc, $ac
  $g.DrawImage($orig, $destino, $origem, [System.Drawing.GraphicsUnit]::Pixel)
  $g.Dispose()
  $orig.Dispose()

  $saida.Save($caminho, [System.Drawing.Imaging.ImageFormat]::Png)
  $saida.Dispose()

  $bytesDepois = (Get-Item $caminho).Length
  '{0}: recorte {1}x{2} -> {3}x{4} | {5:N0} B -> {6:N0} B ({7:N0}%)' -f `
    $nome, $lc, $ac, $LARGURA_ALVO, $novaAltura, $bytesAntes, $bytesDepois,
    (100 - 100 * $bytesDepois / $bytesAntes)
}
