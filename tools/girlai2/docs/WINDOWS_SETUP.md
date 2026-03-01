# Windows Setup Guide

This guide will help you set up the Flutter development environment on Windows for Android development.

## Prerequisites

1. **Windows 10/11** (64-bit)
2. **Git for Windows** - https://git-scm.com/download/win
3. **PowerShell 5.1+** (included with Windows 10/11)

## Step 1: Install Flutter SDK

### Option A: Use Existing Flutter Installation

If Flutter is already at `C:\Users\Owner\Documents\GitHub\Ailady\flutter`:

1. Verify Flutter installation:
   ```powershell
   C:\Users\Owner\Documents\GitHub\Ailady\flutter\bin\flutter.bat doctor
   ```

2. Add Flutter to PATH:
   - Open "Environment Variables" (search in Start menu)
   - Edit "Path" under "User variables"
   - Add: `C:\Users\Owner\Documents\GitHub\Ailady\flutter\bin`
   - Click OK and restart PowerShell

3. Verify installation:
   ```powershell
   flutter doctor
   ```

### Option B: Install Flutter SDK

1. Download Flutter SDK:
   - Visit: https://flutter.dev/docs/get-started/install/windows
   - Download the latest stable release ZIP file

2. Extract Flutter:
   - Extract to: `C:\Users\Owner\Documents\GitHub\Ailady\flutter`
   - **Important**: Do NOT extract to `C:\Program Files\` (requires admin permissions)

3. Add Flutter to PATH:
   - Open "Environment Variables" (search in Start menu)
   - Edit "Path" under "User variables"
   - Add: `C:\Users\Owner\Documents\GitHub\Ailady\flutter\bin`
   - Click OK and restart PowerShell

4. Verify installation:
   ```powershell
   flutter doctor
   ```

## Step 2: Install Android Studio

1. Download Android Studio:
   - Visit: https://developer.android.com/studio
   - Download and install Android Studio

2. During installation:
   - Install Android SDK
   - Install Android SDK Platform-Tools
   - Install Android Emulator

3. Configure Android SDK:
   - Open Android Studio
   - Go to: File → Settings → Appearance & Behavior → System Settings → Android SDK
   - Install Android SDK Platform (API 33 or higher recommended)
   - Install Android SDK Build-Tools

4. Accept Android Licenses:
   ```powershell
   flutter doctor --android-licenses
   ```
   - Press `y` to accept all licenses

## Step 3: Set Up Android Emulator

1. Open Android Studio
2. Go to: Tools → Device Manager
3. Click "Create Device"
4. Select a device (e.g., Pixel 5)
5. Download a system image (e.g., API 33)
6. Finish setup

7. Verify emulator:
   ```powershell
   flutter emulators
   ```

## Step 4: Install Firebase CLI

1. Install Node.js (if not already installed):
   - Download from: https://nodejs.org/
   - Install LTS version

2. Install Firebase CLI:
   ```powershell
   npm install -g firebase-tools
   ```

3. Verify installation:
   ```powershell
   firebase --version
   ```

4. Login to Firebase:
   ```powershell
   firebase login
   ```

## Step 5: Install Java (for Firebase Emulators)

Firebase emulators require Java 11 or higher.

1. Download Java:
   - Visit: https://adoptium.net/
   - Download OpenJDK 11 or higher (Windows x64)
   - Install

2. Verify installation:
   ```powershell
   java -version
   ```

## Step 6: Configure Project

1. Navigate to project:
   ```powershell
   cd C:\Users\Owner\Documents\GitHub\Ailady\tools\girlai2
   ```

2. Install Flutter dependencies:
   ```powershell
   flutter pub get
   ```

3. Create Android folder (if it doesn't exist):
   ```powershell
   flutter create --platforms=android .
   ```

4. Configure Firebase:
   - Download `google-services.json` from Firebase Console
   - Place it in: `android/app/google-services.json`

## Step 7: Verify Setup

Run Flutter doctor to check everything:
```powershell
flutter doctor -v
```

You should see:
- ✅ Flutter (channel stable, version 3.x.x)
- ✅ Android toolchain (Android SDK)
- ✅ Android Studio
- ✅ VS Code or Android Studio (for editing)
- ✅ Connected device (if emulator is running)

## Step 8: Run the App

1. Start Android Emulator:
   - Open Android Studio → Device Manager
   - Click play button on an emulator

2. Start Firebase Emulators (in one terminal):
   ```powershell
   cd C:\Users\Owner\Documents\GitHub\Ailady\tools\girlai2
   .\scripts\start_emulators.ps1
   ```

3. Run the app (in another terminal):
   ```powershell
   cd C:\Users\Owner\Documents\GitHub\Ailady\tools\girlai2
   .\scripts\run_with_emulators.ps1
   ```

Or run directly:
```powershell
flutter run
```

## Troubleshooting

### Flutter not found

If `flutter` command is not found:
1. Verify Flutter is in PATH: `$env:PATH -split ';' | Select-String flutter`
2. Restart PowerShell after adding to PATH
3. Use full path: `C:\Users\Owner\Documents\GitHub\Ailady\flutter\bin\flutter.bat`

### Android licenses not accepted

```powershell
flutter doctor --android-licenses
```

### Emulator not starting

1. Check Android Studio → Device Manager
2. Verify HAXM is installed (for Intel processors)
3. Enable virtualization in BIOS if needed

### Firebase emulators not working

1. Verify Java is installed: `java -version`
2. Check Firebase CLI: `firebase --version`
3. Install emulators: `firebase setup:emulators:firestore`

## Next Steps

- See [README.md](../README.md) for development workflow
- See [FIREBASE_EMULATOR_SETUP.md](FIREBASE_EMULATOR_SETUP.md) for emulator details
- See [TESTING_WORKFLOW.md](../TESTING_WORKFLOW.md) for testing guide
