@echo off
setlocal
cd /d "%~dp0"

rem Start the local Node server only when port 8080 is not already in use.
netstat -ano | findstr /r /c:":8080 .*LISTENING" >nul
if errorlevel 1 (
  echo Starting SmartMed server...
  start "SmartMed Server" /min cmd /c "cd /d ""%~dp0server"" ^&^& node --no-warnings server.mjs"
  timeout /t 2 /nobreak >nul
) else (
  echo SmartMed server is already running on port 8080.
)

echo Opening the connected M1 3D simulation...
start "" "http://localhost:8080/simulation/M1?key=demo-key-1"
endlocal
