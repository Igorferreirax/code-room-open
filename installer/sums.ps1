# Gera dist\SHA256SUMS.txt com o SHA-256 do zip e do Setup.exe que estiverem na pasta.
# Roda no fim do build e de novo depois da assinatura (assinar muda o arquivo, então o hash muda).
param([string]$OutDir = 'dist')
$ErrorActionPreference = 'Stop'
$out = if ([IO.Path]::IsPathRooted($OutDir)) { $OutDir } else { Join-Path (Split-Path $PSScriptRoot -Parent) $OutDir }
$files = Get-ChildItem -LiteralPath $out -File | Where-Object { $_.Name -match '^Code-Room-.*(portatil-win-x64\.zip|Setup\.exe)$' }
$lines = foreach ($f in $files) { '{0}  {1}' -f (Get-FileHash -LiteralPath $f.FullName -Algorithm SHA256).Hash.ToLower(), $f.Name }
$lines | Out-File -LiteralPath (Join-Path $out 'SHA256SUMS.txt') -Encoding ascii
$lines | ForEach-Object { Write-Host $_ }
