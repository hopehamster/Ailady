# Task Plan: Fix Firebase Phone Auth OTP Verification

## Goal
Resolve the `keychain-error` preventing OTP verification from completing successfully on iOS simulator.

## Current Phase
Phase 2: Testing & Verification

## Phases

### Phase 1: Diagnosis ✅
- [x] Identify actual error (keychain-error, not invalid OTP)
- [x] Add enhanced error logging to capture Firebase error codes
- [x] Document error in findings.md
- **Status:** complete

### Phase 2: Testing & Verification
- [ ] Test login after keychain reset
- [ ] Verify if keychain reset resolved the issue
- [ ] Document test results
- **Status:** in_progress

### Phase 3: Use Firebase Auth Emulator (Bypass Keychain)
- [x] Identify missing entitlement: `keychain-access-groups`
- [x] Add keychain-access-groups to Runner.entitlements
- [x] Test - keychain error persists (entitlements don't work with CODE_SIGNING_ALLOWED=NO)
- [x] Switch to Firebase Auth Emulator approach
- [x] Auth emulator confirmed running on port 9099
- [x] Run app with `flutter run` to pass environment variables
- [ ] Verify app connects to Auth emulator
- [ ] Test OTP verification with emulator (any code should work)
- **Status:** in_progress

## Key Questions
1. ✅ What is the actual error? → `keychain-error` (Firebase Auth can't access iOS keychain)
2. ✅ Is the OTP code valid? → Yes, verification works, but keychain access fails
3. ⏳ Does keychain reset fix it? → Testing now
4. ⏳ Is this simulator-specific? → TBD

## Decisions Made
| Decision | Rationale |
|----------|-----------|
| Reset simulator keychain | Common fix for keychain-access errors on simulators |
| Enhanced error logging | Need to see actual Firebase error codes, not generic messages |
| Updated error handler | User-friendly message for keychain-error |

## Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|
| keychain-error | 1 | Reset simulator keychain using `xcrun simctl keychain reset` |
| Generic "error occurred" message | 1 | Added detailed logging in AuthService.signInWithOTP() |

## Notes
- Keychain errors are common on iOS simulators
- The OTP verification itself works - the issue is storing auth tokens
- If keychain reset doesn't work, may need to check entitlements or test on physical device
