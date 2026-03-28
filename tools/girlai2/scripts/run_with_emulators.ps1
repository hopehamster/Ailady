# Run Flutter app with Firebase Emulators (Windows PowerShell)

$ErrorActionPreference = "Stop"

# Change to project root
$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location (Join-Path $scriptPath "..")

Write-Host "🚀 Running Flutter app with Firebase Emulators..." -ForegroundColor Cyan
Write-Host ""

# Check if Flutter is available
if (-not (Get-Command flutter -ErrorAction SilentlyContinue)) {
    Write-Host "❌ Flutter not found in PATH." -ForegroundColor Red
    Write-Host "   Add Flutter to PATH or use full path:" -ForegroundColor Yellow
    Write-Host "   C:\Users\Owner\Documents\GitHub\Ailady\flutter\bin" -ForegroundColor Yellow
    exit 1
}

# Set emulator environment variables
# Use 127.0.0.1 instead of localhost for Android Emulator compatibility
$env:FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080"
$env:FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099"
$env:FIREBASE_FUNCTIONS_EMULATOR_HOST = "127.0.0.1:5001"

Write-Host "🔧 Environment variables set:" -ForegroundColor Green
Write-Host "   FIRESTORE_EMULATOR_HOST=$env:FIRESTORE_EMULATOR_HOST" -ForegroundColor Gray
Write-Host "   FIREBASE_AUTH_EMULATOR_HOST=$env:FIREBASE_AUTH_EMULATOR_HOST" -ForegroundColor Gray
Write-Host "   FIREBASE_FUNCTIONS_EMULATOR_HOST=$env:FIREBASE_FUNCTIONS_EMULATOR_HOST" -ForegroundColor Gray
Write-Host ""

# Check if emulators are running
Write-Host "⚠️  Make sure Firebase emulators are running in another terminal:" -ForegroundColor Yellow
Write-Host "   .\scripts\start_emulators.ps1" -ForegroundColor Cyan
Write-Host ""
Write-Host "Press any key to continue or Ctrl+C to cancel..." -ForegroundColor Yellow
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")

# List available devices
Write-Host "📱 Available devices:" -ForegroundColor Cyan
flutter devices
Write-Host ""

# Run the app
Write-Host "🚀 Starting Flutter app..." -ForegroundColor Green
flutter run
