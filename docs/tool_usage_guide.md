# Tool Usage Guide for AI Agents

This document serves as a comprehensive guide for using the installed tools: **AutoMac MCP**, **SweetPad**, **Xcode Pal**, and debugging libraries.

## 1. AutoMac MCP
A Model Context Protocol (MCP) server for macOS UI automation.

### Capabilities
- **Screen Inspection**:
  - `get_screen_text()`: OCR-based text extraction. Best for finding text on screen.
  - `get_screen_layout()`: Accessibility-based layout. Good for finding window bounds/titles.
  - `get_available_apps()`: Lists running applications.
- **Interaction**:
  - `mouse_move(x, y)`: Move cursor.
  - `mouse_single_click(x, y)`: Click.
  - `type_text(text)`: Types literal strings. **Warning**: Does not parse modifiers. Use `keyboard_shortcut_*` tools or `osascript` for shortcuts.
  - `focus_app(app_name)`: Brings app to front. **Critical**: Always call this before interacting.

### Best Practices
- **Focus First**: Always call `focus_app("Xcode")` or `focus_app("Cursor")` before sending keys.
- **Keyboard Shortcuts**: Use `keyboard_shortcut_*` tools where available. For complex shortcuts (e.g., `Cmd+.`), use `run_terminal_cmd` with `osascript`:
  ```bash
  osascript -e 'tell application "System Events" to keystroke "." using {command down}'
  ```

## 2. SweetPad (Cursor Extension)
Integrates Xcode build system into Cursor.

### Setup
- **Requirement**: `xcode-build-server` must be installed and configured.
- **Installation**: `brew install xcode-build-server`
- **Configuration**: Run in project root:
  ```bash
  xcode-build-server config -project path/to/Project.xcodeproj -scheme SchemeName
  ```
  This generates `buildServer.json`.

### Usage
- Allows building, running, and debugging directly from Cursor sidebar.
- Provides better log visibility than raw `flutter run` in some cases.

## 3. Xcode Pal (Cursor Extension)
Controls Xcode from Cursor via AppleScript.

### Shortcuts (Focus Cursor first)
- `Ctrl+Alt+R`: Run Project in Xcode.
- `Ctrl+Alt+B`: Build Project in Xcode.
- `Ctrl+Alt+S`: Stop Project in Xcode.

## 4. In-App Debugging Tools
Native libraries added to `Podfile` for runtime inspection.

### Libraries
- **DebugSwift**: Performance, Network, Console, Crash reports overlay.
- **FLEX**: View hierarchy inspector, network history, database browser.

### Integration
1.  **Podfile**:
    ```ruby
    target 'Runner' do
      pod 'DebugSwift', :configurations => ['Debug']
      pod 'FLEX', :configurations => ['Debug']
    end
    ```
2.  **AppDelegate.swift**:
    ```swift
    import Flutter
    import UIKit
    #if DEBUG
    import FLEX
    import DebugSwift
    #endif

    @main
    @objc class AppDelegate: FlutterAppDelegate {
      override func application(...) -> Bool {
        #if DEBUG
        DebugSwift.setup()
        FLEXManager.shared.showExplorer()
        #endif
        // ...
      }
    }
    ```

## 5. Command-Line Tools
- **ios-deploy**: `brew install ios-deploy`. Required for debugging on physical devices.
- **xcode-build-server**: `brew install xcode-build-server`. Bridges Xcode and LSP/Cursor.
