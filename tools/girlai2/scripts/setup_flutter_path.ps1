# Setup Flutter SDK Path for Windows
# This script helps configure Flutter SDK path in the current PowerShell session

$ErrorActionPreference = "Stop"

$flutterPath = "C:\Users\Owner\Documents\GitHub\Ailady\flutter\bin"

Write-Host "🔧 Setting up Flutter SDK path..." -ForegroundColor Cyan
Write-Host ""

# Check if Flutter exists at the specified path
if (-not (Test-Path "$flutterPath\flutter.bat")) {
    Write-Host "❌ Flutter not found at: $flutterPath" -ForegroundColor Red
    Write-Host ""
    Write-Host "Please:" -ForegroundColor Yellow
    Write-Host "1. Download Flutter SDK from: https://flutter.dev/docs/get-started/install/windows" -ForegroundColor Yellow
    Write-Host "2. Extract to: C:\Users\Owner\Documents\GitHub\Ailady\flutter" -ForegroundColor Yellow
    Write-Host "3. Run this script again" -ForegroundColor Yellow
    exit 1
}

# Add to current session PATH
if ($env:PATH -notlike "*$flutterPath*") {
    $env:PATH = "$flutterPath;$env:PATH"
    Write-Host "✅ Added Flutter to current session PATH" -ForegroundColor Green
} else {
    Write-Host "ℹ️  Flutter already in PATH" -ForegroundColor Gray
}

# Verify Flutter works
Write-Host ""
Write-Host "🔍 Verifying Flutter installation..." -ForegroundColor Cyan
try {
    $flutterVersion = & flutter --version 2>&1 | Select-Object -First 1
    Write-Host "✅ Flutter found: $flutterVersion" -ForegroundColor Green
} catch {
    Write-Host "❌ Flutter command failed" -ForegroundColor Red
    exit 1
}

# Run flutter doctor
Write-Host ""
Write-Host "🏥 Running Flutter doctor..." -ForegroundColor Cyan
flutter doctor

Write-Host ""
Write-Host "📝 To make this permanent, add to System PATH:" -ForegroundColor Yellow
Write-Host "   $flutterPath" -ForegroundColor Cyan
Write-Host ""
Write-Host "   Or run this script at the start of each PowerShell session" -ForegroundColor Gray
