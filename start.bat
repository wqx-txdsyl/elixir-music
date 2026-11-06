@echo off
setlocal
cd /d "%~dp0"
set ELECTRON_RUN_AS_NODE=
if exist "D:\Programs\Elixir Music\Elixir.exe" (
  start "" "D:\Programs\Elixir Music\Elixir.exe"
  exit /b 0
)
if not exist "node_modules\.bin\electron.cmd" (
  echo Dependencies are missing. Run npm ci first.
  exit /b 1
)
if not exist "dist\web\index.html" (
  call npm run build
  if errorlevel 1 exit /b 1
)
call npm start
