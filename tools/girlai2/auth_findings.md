# Findings & Decisions: Firebase Auth Keychain Error

## Requirements
- Fix OTP verification errors during phone authentication
- User reports: test number and real number both fail with "error occurred"
- Need to identify root cause and implement fix

## Research Findings
- **Error Code:** `keychain-error` (not `invalid-verification-code`)
- **Error Message:** "An error occurred when accessing the keychain"
- **Root Cause:** Keychain access requires entitlements, but entitlements don't embed when `CODE_SIGNING_ALLOWED=NO`
- **Specific Error:** `SecItemCopyMatching (-34018) A required entitlement isn't present.`
- **Solution 1 (Failed):** Add `keychain-access-groups` entitlement - doesn't work with unsigned builds
- **Solution 2 (Active):** Use Firebase Auth Emulator - bypasses keychain entirely, works with any 6-digit code
- **OTP Verification:** Actually works - the code is valid, but token storage fails due to keychain access

## Technical Decisions
| Decision | Rationale |
|----------|-----------|
| Enhanced error logging | Need to see actual Firebase error codes, not generic "error occurred" |
| Reset simulator keychain | Standard fix for keychain-access errors on simulators |
| Updated error handler | Added user-friendly message for keychain-error code |
| Restart simulator | Ensures keychain reset takes effect |

## Issues Encountered
| Issue | Resolution |
|-------|------------|
| Generic error messages | Added detailed logging: verification ID, SMS code length, Firebase error codes |
| Keychain access failure | Reset keychain using `xcrun simctl keychain <device-id> reset` |
| No visibility into actual errors | Enhanced AuthService.signInWithOTP() with debugPrint statements |
| Entitlement not working with AppIdentifierPrefix | Trying format without AppIdentifierPrefix for simulator compatibility |
| Entitlement may not embed with CODE_SIGNING_ALLOWED=NO | Clean DerivedData and rebuild |

## Resources
- Firebase Auth iOS keychain documentation
- iOS Simulator keychain management: `xcrun simctl keychain`
- Error codes: `keychain-error` is a Firebase Auth iOS-specific error

## Visual/Browser Findings
- Logs show: `❌ AuthService: Error code: keychain-error`
- Logs show: `❌ AuthService: Error message: An error occurred when accessing the keychain`
- Verification ID is present and valid (268 characters)
- SMS code length is correct (6 digits)
- Credential creation succeeds, but signInWithCredential fails at keychain access
