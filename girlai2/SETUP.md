# GirlAI2 Setup Guide

## Project Information
- **Project Name**: girlai2
- **Firebase Project**: girlai2 (already created)
- **Account**: michael@sifter.cc

## Required Tools & Links
- Firebase CLI: https://firebaseopensource.com/projects/firebase/firebase-tools
- FlutterFire CLI: https://firebase.flutter.dev/docs/cli/
- Google Cloud SDK: https://docs.cloud.google.com/sdk/docs/install-sdk

## Setup Steps

### 1. Firebase Authentication
First, authenticate with Firebase CLI:
```bash
firebase login
```
Use credentials:
- Email: michael@sifter.cc
- Password: Vanburen2vegas6682

### 2. Configure Firebase in Flutter Project
After authentication, run:
```bash
cd girlai2
export PATH="$PWD/../tools/flutter/bin:$HOME/.pub-cache/bin:$PATH"
flutterfire configure --project=girlai2
```

Select the platforms you want to configure (iOS, Android, Web, etc.)

### 3. Install Google Cloud SDK (if needed)
Follow instructions at: https://docs.cloud.google.com/sdk/docs/install-sdk

## Next Steps
- Integrate AI/LLM service (OpenAI, Anthropic, etc.)
- Integrate Voice/TTS service (ElevenLabs, etc.)
- Set up Firebase services (Auth, Firestore, Storage)
