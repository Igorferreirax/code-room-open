# Gera SHA256SUMS.txt somente para os pacotes da versão atual.
# Roda no fim do build e de novo depois da assinatura (assinar muda o arquivo, então o hash muda).
param([string]$OutDir = 'dist', [string]$Version = '')
$ErrorActionPreference = 'Stop'
$repo = Split-Path $PSScriptRoot -Parent
if (-not $Version) { $Version = (Get-Content -LiteralPath (Join-Path $repo 'package.json') -Raw | ConvertFrom-Json).version }
if ($Version -notmatch '^\d+\.\d+\.\d+$') { throw 'Versão inválida para SHA256SUMS.txt.' }
$out = if ([IO.Path]::IsPathRooted($OutDir)) { $OutDir } else { Join-Path (Split-Path $PSScriptRoot -Parent) $OutDir }
$zipName = "Code-Room-$Version-portatil-win-x64.zip"
$setupName = "Code-Room-$Version-Setup.exe"
$files = @(Get-ChildItem -LiteralPath $out -File | Where-Object { $_.Name -eq $zipName -or $_.Name -eq $setupName } | Sort-Object Name)
if (-not ($files | Where-Object Name -EQ $zipName)) { throw "ZIP da versão $Version não encontrado." }
$lines = foreach ($f in $files) { '{0}  {1}' -f (Get-FileHash -LiteralPath $f.FullName -Algorithm SHA256).Hash.ToLower(), $f.Name }
$lines | Out-File -LiteralPath (Join-Path $out 'SHA256SUMS.txt') -Encoding ascii
$lines | ForEach-Object { Write-Host $_ }
