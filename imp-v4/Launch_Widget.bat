@echo off
title IMP Music Player - Widget Launcher
setlocal enabledelayedexpansion

:: Get the directory of this script
set "DIR=%~dp0"
set "HTML=%DIR%index.html"

:: Widget size (change these to resize)
set WIDTH=380
set HEIGHT=660

echo.
echo  =============================================
echo   IMP Interactive Music Player - Widget Mode
echo  =============================================
echo.

:: Try Chrome first
set CHROME=""
for %%P in (
  "%ProgramFiles%\Google\Chrome\Application\chrome.exe"
  "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
  "%LocalAppData%\Google\Chrome\Application\chrome.exe"
) do (
  if exist %%P set CHROME=%%P
)

:: Try Edge if Chrome not found
set EDGE=""
for %%P in (
  "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
  "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
  "%LocalAppData%\Microsoft\Edge\Application\msedge.exe"
) do (
  if exist %%P set EDGE=%%P
)

if not !CHROME!=="" (
  echo  Launching with Google Chrome...
  start "" !CHROME! ^
    --app="file:///%HTML:\=/%"  ^
    --window-size=%WIDTH%,%HEIGHT% ^
    --window-position=50,50 ^
    --no-first-run ^
    --disable-features=TranslateUI ^
    --disable-extensions ^
    --user-data-dir="%DIR%chrome_profile"
  goto :done
)

if not !EDGE!=="" (
  echo  Launching with Microsoft Edge...
  start "" !EDGE! ^
    --app="file:///%HTML:\=/%"  ^
    --window-size=%WIDTH%,%HEIGHT% ^
    --window-position=50,50 ^
    --no-first-run ^
    --disable-features=TranslateUI ^
    --user-data-dir="%DIR%edge_profile"
  goto :done
)

:: Fallback - open in default browser
echo  Chrome/Edge not found. Opening in default browser...
echo  (For best widget experience, install Chrome or Edge)
start "" "%HTML%"

:done
echo  Widget launched! 
echo.
echo  Tip: Right-click the taskbar button to pin or always-on-top.
echo.
