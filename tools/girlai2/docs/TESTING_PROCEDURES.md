# Testing Procedures

## Simulator Testing with Firebase Emulators

### Prerequisites
1. Firebase emulators must be running
2. iOS Simulator must be booted
3. Environment variables must be set

### Steps

1. **Start Firebase Emulators:**
   ```bash
   cd tools/girlai2
   ./scripts/start_emulators.sh
   # Or manually:
   firebase emulators:start --only auth,functions,firestore
   ```

2. **Boot iOS Simulator:**
   ```bash
   open -a Simulator
   # Or use specific simulator:
   xcrun simctl boot 38D52BED-4C50-4D4F-B052-5A1E0F78EEE5
   ```

3. **Run App with Emulators:**
   ```bash
   export FIRESTORE_EMULATOR_HOST="127.0.0.1:8080"
   export FIREBASE_AUTH_EMULATOR_HOST="127.0.0.1:9099"
   export FIREBASE_FUNCTIONS_EMULATOR_HOST="127.0.0.1:5001"
   flutter run -d 38D52BED-4C50-4D4F-B052-5A1E0F78EEE5
   ```

4. **Test Login Flow:**
   - Enter any phone number (e.g., +15551234567)
   - Wait for codeSent callback (should be immediate with emulator)
   - Enter any 6-digit code (emulator accepts any code)
   - Verify navigation to OnboardingScreen or ChatScreen

### Expected Results
- ✅ Phone verification should complete immediately
- ✅ Any 6-digit code should work
- ✅ Navigation should work correctly
- ✅ No network errors

## Physical Device Testing with Production Firebase

### Prerequisites
1. Code signing must be configured in Xcode
2. Physical iPhone must be connected and trusted
3. Production Firebase must be configured
4. Phone Auth must be enabled in Firebase Console

### Steps

1. **Configure Code Signing in Xcode:**
   - Open: `open ios/Runner.xcworkspace`
   - Select Runner target → Signing & Capabilities
   - Enable "Automatically manage signing"
   - Select development team
   - Xcode will create provisioning profile automatically

2. **Build and Install:**
   ```bash
   flutter build ios --debug
   flutter install -d 00008110-001865642E07801E
   ```

3. **Test Login Flow:**
   - Enter real phone number
   - Wait for SMS code (real SMS will be sent)
   - Enter received 6-digit code
   - Verify navigation to OnboardingScreen or ChatScreen

### Expected Results
- ✅ Real SMS code should arrive
- ✅ Only correct code should work
- ✅ Navigation should work correctly
- ✅ App should connect to production Firebase

## Troubleshooting

### Simulator Issues
- **Code not arriving**: Check emulator is running and environment variables are set
- **Connection errors**: Verify emulator host is 127.0.0.1 (not localhost)
- **White screen**: Check Firebase initialization logs

### Physical Device Issues
- **Code signing errors**: Configure signing in Xcode
- **Build failures**: Check provisioning profile is created
- **SMS not arriving**: Verify Phone Auth is enabled in Firebase Console
- **White screen**: Check Firebase configuration and logs
