# Physical Device Setup Guide

## Current Status

### Code Signing Configuration
- **Signing Style**: Automatic (configured)
- **Development Team**: N2F7QQ9KRH (set for Release/Profile, needs to be set for Debug)
- **Bundle ID**: com.mikeyb.girlai2
- **Certificates**: 2 valid Apple Development certificates available
- **Provisioning Profiles**: Need to be created via Xcode

### Required Actions

1. **Open Xcode:**
   ```bash
   open ios/Runner.xcworkspace
   ```

2. **Configure Signing:**
   - Select "Runner" target in project navigator
   - Go to "Signing & Capabilities" tab
   - Check "Automatically manage signing"
   - Select development team from dropdown (should show team N2F7QQ9KRH)
   - Xcode will automatically create provisioning profile

3. **Verify Configuration:**
   - Check that "Signing Certificate" shows a valid certificate
   - Check that "Provisioning Profile" is created and valid
   - Verify Bundle Identifier matches: `com.mikeyb.girlai2`

4. **Build and Install:**
   ```bash
   # Using Xcode MCP tool:
   # mcp_xcode_xcode-build with physical device destination
   
   # Or using Flutter:
   flutter build ios --debug
   flutter install -d 49AE2C6D-F5C4-5BF2-8A5A-8D8CE79A31E8
   ```

## Troubleshooting

### Build Fails with Code Signing Error
- **Solution**: Complete Xcode signing configuration as described above
- **Check**: Verify team is selected for Debug configuration
- **Verify**: Run `mcp_xcode_xcode-codesign-info` to check status

### Provisioning Profile Not Found
- **Solution**: Xcode should auto-create when team is selected
- **Manual**: If needed, go to Xcode → Preferences → Accounts → Download Manual Profiles

### Device Not Trusted
- **Solution**: On iPhone, go to Settings → General → VPN & Device Management
- **Trust**: Tap on developer certificate and trust it

## Next Steps After Setup

1. Build succeeds
2. Install app on device
3. Test login flow with production Firebase
4. Verify SMS code delivery
5. Test complete authentication flow
