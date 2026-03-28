# Start Firebase Emulators for local development (Windows PowerShell)

$ErrorActionPreference = "Stop"

# Change to project root
$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location (Join-Path $scriptPath "..")

Write-Host "🔥 Starting Firebase Emulators..." -ForegroundColor Cyan
Write-Host ""

# Check if Firebase CLI is installed
if (-not (Get-Command firebase -ErrorAction SilentlyContinue)) {
    Write-Host "❌ Firebase CLI not found. Install with: npm install -g firebase-tools" -ForegroundColor Red
    exit 1
}

# Check if Java is available (required for Firebase emulators)
$javaVersion = java -version 2>&1 | Select-Object -First 1
if ($LASTEXITCODE -eq 0) {
    Write-Host "ℹ️  Java: $javaVersion" -ForegroundColor Gray
} else {
    Write-Host "⚠️  Java not found. Firebase emulators require Java 11+." -ForegroundColor Yellow
    Write-Host "   Install Java from: https://adoptium.net/" -ForegroundColor Yellow
}

# Check if emulators are installed
$emulatorPath = "$env:USERPROFILE\.cache\firebase\emulators"
if (-not (Test-Path $emulatorPath)) {
    Write-Host "📦 Installing Firebase emulators..." -ForegroundColor Yellow
    firebase setup:emulators:firestore
    firebase setup:emulators:auth
    firebase setup:emulators:ui
    # Functions emulator is installed automatically when starting
}

# Set test OpenAI API key (use a mock or test key)
if (-not $env:OPENAI_API_KEY) {
    $env:OPENAI_API_KEY = "test-key-for-emulator"
}

Write-Host "🚀 Starting emulators..." -ForegroundColor Green
Write-Host "📱 Firestore: http://localhost:8080" -ForegroundColor Cyan
Write-Host "⚡ Functions: http://localhost:5001" -ForegroundColor Cyan
Write-Host "🔐 Auth: http://localhost:9099" -ForegroundColor Cyan
Write-Host "🖥️  UI: http://localhost:4000" -ForegroundColor Cyan
Write-Host ""

firebase emulators:start
