param([switch]$SkipBackend, [switch]$Sign, [Alias('WithLegacySpotifyEngine')][switch]$WithSpotifyPremium)
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath (Split-Path -Parent $PSScriptRoot)
python scripts/prepare_ecs.py
if ($LASTEXITCODE -ne 0) {throw 'Playback runtime verification failed'}
if ($WithSpotifyPremium) {
  python scripts/prepare_librespot.py
  if ($LASTEXITCODE -ne 0) {throw 'Spotify Premium player preparation failed'}
}
if (!$SkipBackend) {& $PSScriptRoot/build_service.ps1}
npm run build
if ($LASTEXITCODE -ne 0) {throw 'Frontend build failed'}
if ($WithSpotifyPremium) {
  New-Item -ItemType Directory -Path resources/backend/librespot -Force | Out-Null
  Copy-Item -Path .cache/librespot/runtime/* -Destination resources/backend/librespot -Force
}
& node_modules/.bin/electron-builder.cmd --win dir --config.directories.output=release/elixir-candidate --config.electronDist=.cache/ecs-44.1.0/runtime
if ($LASTEXITCODE -ne 0) {throw 'Desktop package failed'}
$packagePath=Join-Path (Get-Location).Path 'release/elixir-candidate/win-unpacked'
$originalSignature=Join-Path $packagePath 'electron.exe.sig'
if (Test-Path -LiteralPath $originalSignature) {Copy-Item -LiteralPath $originalSignature -Destination (Join-Path $packagePath 'Elixir.exe.sig') -Force}
if ($Sign) {
  # Requires an explicitly authorized EVS account; no signup or force-sign here.
  python scripts/sign_desktop.py
  if ($LASTEXITCODE -ne 0) {throw 'Production media signing did not pass'}
  & node_modules/.bin/electron-builder.cmd --win portable --prepackaged $packagePath --config.directories.output=release/elixir
  if ($LASTEXITCODE -ne 0) {throw 'Portable package failed'}
} else {Write-Output 'Candidate built. Production media signing and real music playback verification remain pending.'}
