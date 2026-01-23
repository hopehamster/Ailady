# MCP Tools and Automation

Complete guide to MCP tools and automation scripts in the AI Girlfriend App.

## MCP Tools

### Code Analysis Tools

#### dart-mcp
**Purpose**: Dart/Flutter code analysis, formatting, testing
**Usage**:
- Code analysis: `mcp_dart-mcp_dart-analyze`
- Code formatting: `mcp_dart-mcp_dart-format`
- Code compilation: `mcp_dart-mcp_dart-compile`
- Documentation: `mcp_dart-mcp_dart-doc`

**When to Use**:
- Code quality checks
- Formatting code
- Analyzing code structure
- Generating documentation

#### flutter-docs
**Purpose**: Real-time Flutter documentation
**Usage**: Access Flutter/Dart package documentation
**When to Use**:
- Looking up Flutter APIs
- Checking package documentation
- Understanding Flutter patterns

### Build & Deploy Tools

#### xcode-mcp
**Purpose**: Xcode build, test, device management
**Usage**:
- Build: `mcp_xcode_xcode-build`
- Test: `mcp_xcode_xcode-test`
- Archive: `mcp_xcode_xcode-archive`
- Code signing info: `mcp_xcode_xcode-codesign-info`
- List schemes: `mcp_xcode_xcode-list-schemes`
- Run on device: `mcp_xcode_run-on-device`

**When to Use**:
- Building iOS app
- Running tests
- Managing devices
- Code signing

#### ios-simulator-mcp
**Purpose**: iOS Simulator automation
**Usage**: Simulator interaction and automation
**When to Use**:
- Simulator testing
- Automated testing
- Device simulation

### Automation Tools

#### mac-commander
**Purpose**: macOS automation and UI interaction
**Usage**:
- Screenshots: `mcp_mac-commander_screenshot`
- Text extraction: `mcp_mac-commander_extract_text`
- Window management: `mcp_mac-commander_list_windows`
- UI interaction: `mcp_mac-commander_click`, `mcp_mac-commander_type_text`

**When to Use**:
- UI automation
- Screenshot capture
- Text extraction
- Window management

#### automac-mcp
**Purpose**: macOS automation
**Usage**: Additional macOS automation capabilities
**When to Use**:
- Advanced automation
- System interaction

### UI/UX Tools

#### ui-ux-pro-mcp
**Purpose**: UI/UX validation and design intelligence
**Usage**: UI/UX analysis and validation
**When to Use**:
- UI validation
- UX analysis
- Design review

### Memory Tools

#### memory-journal-mcp
**Purpose**: Persistent knowledge storage
**Usage**: Store and retrieve project knowledge
**When to Use**:
- Storing decisions
- Recording patterns
- Documenting issues
- Knowledge persistence

## Automation Scripts

### Build Scripts

#### build_and_run_simulator.sh
**Purpose**: Build and run on iOS Simulator with emulators
**Usage**: `./scripts/build_and_run_simulator.sh`
**Features**:
- Starts emulators if not running
- Sets environment variables
- Builds and runs app
- Configures emulator hosts

#### build_and_install_physical.sh
**Purpose**: Build and install on physical iPhone
**Usage**: `./scripts/build_and_install_physical.sh <device-udid>`
**Features**:
- Builds iOS app
- Installs on device
- Uses safe_run.sh for timeout

#### build_with_xcode.sh
**Purpose**: Build using xcodebuild directly
**Usage**: `./scripts/build_with_xcode.sh <device-udid>`
**Features**:
- Uses xcodebuild
- More robust code signing
- Uses safe_run.sh for timeout

### Development Scripts

#### run_with_emulators.sh
**Purpose**: Quick start with emulators
**Usage**: `./scripts/run_with_emulators.sh`
**Features**:
- Starts emulators
- Opens simulator
- Sets environment variables
- Runs app

#### start_emulators.sh
**Purpose**: Start Firebase emulators
**Usage**: `./scripts/start_emulators.sh`
**Features**:
- Starts Auth emulator
- Starts Firestore emulator
- Starts Functions emulator
- Starts UI

#### dev_loop.sh
**Purpose**: Autonomous development loop
**Usage**: `./scripts/dev_loop.sh`
**Features**:
- Continuous development
- Automated testing
- Error detection

#### dev_loop_with_emulators.sh
**Purpose**: Dev loop with emulators
**Usage**: `./scripts/dev_loop_with_emulators.sh`
**Features**:
- Dev loop with emulator support
- Automated testing
- Error detection

### Testing Scripts

#### full_test_suite.sh
**Purpose**: Run all tests
**Usage**: `./scripts/full_test_suite.sh`
**Features**:
- Runs Flutter tests
- Runs native iOS tests
- Comprehensive coverage

#### mcp_flutter_test.sh
**Purpose**: Flutter tests via MCP
**Usage**: `./scripts/mcp_flutter_test.sh`
**Features**:
- Uses MCP tools
- Automated testing
- Results reporting

#### test_with_emulators.sh
**Purpose**: Tests with emulator setup
**Usage**: `./scripts/test_with_emulators.sh`
**Features**:
- Sets up emulators
- Runs tests
- Cleans up

### Debug Scripts

#### mcp_debug.sh
**Purpose**: Debug using MCP tools
**Usage**: `./scripts/mcp_debug.sh`
**Features**:
- Uses MCP tools
- Automated debugging
- Error detection

#### auto_debug.sh
**Purpose**: Autonomous debugging
**Usage**: `./scripts/auto_debug.sh`
**Features**:
- Automated debugging
- Error detection
- Fix suggestions

#### quick_debug.sh
**Purpose**: Quick debugging
**Usage**: `./scripts/quick_debug.sh`
**Features**:
- Fast debugging
- Common issues
- Quick fixes

#### capture_device_logs.sh
**Purpose**: Capture device logs
**Usage**: `./scripts/capture_device_logs.sh`
**Features**:
- Captures logs
- Saves to file
- Analysis ready

#### get_app_logs.sh
**Purpose**: Get app logs
**Usage**: `./scripts/get_app_logs.sh`
**Features**:
- Retrieves logs
- Filters logs
- Analysis ready

### Utility Scripts

#### safe_run.sh
**Purpose**: Command runner with timeout
**Usage**: `./scripts/safe_run.sh <timeout> <command>`
**Features**:
- Prevents hangs
- Timeout protection
- Error handling
- Works on macOS and Linux

#### validate_project.sh
**Purpose**: Project structure validation
**Usage**: `./scripts/validate_project.sh`
**Features**:
- Validates structure
- Checks dependencies
- Verifies configuration

#### monitor_emulators.sh
**Purpose**: Monitor emulator status
**Usage**: `./scripts/monitor_emulators.sh`
**Features**:
- Checks emulator status
- Reports issues
- Health monitoring

## Script Usage Patterns

### Build Pattern
```bash
# Build with timeout
./scripts/safe_run.sh 900 "flutter build ios --debug --no-codesign"
```

### Test Pattern
```bash
# Run tests
./scripts/full_test_suite.sh
```

### Debug Pattern
```bash
# Debug with MCP
./scripts/mcp_debug.sh
```

## Best Practices

### Using MCP Tools
- Use appropriate tool for task
- Check tool availability
- Handle tool errors
- Document tool usage

### Using Scripts
- Use scripts for consistency
- Add timeout to prevent hangs
- Log script output
- Handle errors appropriately

### Automation
- Automate repetitive tasks
- Use scripts for consistency
- Monitor automation
- Update scripts regularly

## Checklist

### MCP Tools
- [ ] Tools configured
- [ ] Tools tested
- [ ] Usage documented
- [ ] Errors handled

### Scripts
- [ ] Scripts tested
- [ ] Scripts documented
- [ ] Timeouts configured
- [ ] Errors handled
