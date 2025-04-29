@echo off
setlocal

:: Verifica si Node.js está instalado
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo Node.js no está instalado. Descargándolo ahora...
    powershell -Command "Invoke-WebRequest -Uri https://nodejs.org/dist/v20.11.1/node-v20.11.1-x64.msi -OutFile node-v20.11.1-x64.msi"
    echo Instalando Node.js...
    msiexec /i node-v20.11.1-x64.msi /quiet /norestart
    echo Instalación de Node.js completada. Reinicia tu PC si es necesario.
)

:: Instalar dependencias si hay package.json
if exist package.json (
    echo Instalando dependencias del proyecto...
    call npm install
    echo Instalación completada.
) else (
    echo No se encontró package.json. Asegúrate de estar en la carpeta correcta del proyecto.
)

pause
