@echo off
setlocal
cd /d "%~dp0"

echo Starting TawanVaScan...
echo.
echo open web here ctl+left click : http://localhost:5173
echo.
call npm.cmd run dev

endlocal
