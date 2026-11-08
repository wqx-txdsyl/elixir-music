$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath (Split-Path -Parent $PSScriptRoot)
$env:PYTHONUTF8 = '1'
$providerData = (Join-Path (Get-Location).Path 'backend/providers/*.json') + ';backend/providers'
python -m PyInstaller --noconfirm --onedir --console --name MusicPlatformService --distpath resources/backend-build --workpath build/service --specpath build --paths . --collect-data certifi --collect-data opencc --collect-data ytmusicapi --add-data $providerData --hidden-import websocket --hidden-import uvicorn.logging --hidden-import uvicorn.loops.auto --hidden-import uvicorn.protocols.http.auto --hidden-import uvicorn.protocols.websockets.auto --hidden-import uvicorn.lifespan.on --exclude-module torch --exclude-module tensorflow --exclude-module PyQt5 --exclude-module PySide6 --exclude-module IPython --exclude-module pytest --exclude-module numpy --exclude-module pandas --exclude-module scipy --exclude-module matplotlib --exclude-module notebook --exclude-module jupyter_client backend/run.py
if ($LASTEXITCODE -ne 0) { throw 'Backend build failed' }
New-Item -ItemType Directory -Path resources/backend -Force | Out-Null
Copy-Item -Path resources/backend-build/MusicPlatformService/* -Destination resources/backend -Recurse -Force
Write-Output 'Desktop service is ready in resources/backend.'
