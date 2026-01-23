#!/bin/bash
# Project validation script using xcode-mcp-server
# Usage: ./scripts/validate_project.sh [--mcp|--manual]
#
# This script validates the Xcode project structure and configuration.
# AI agents should use xcode-mcp-server tools directly when available.

set -e

cd "$(dirname "$0")/.."

USE_MCP=${1:-"--mcp"}

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}🔍 Project Validation${NC}"
if [ "$USE_MCP" = "--mcp" ]; then
    echo -e "${BLUE}   Mode: xcode-mcp-server (AI agent should use MCP tools directly)${NC}"
else
    echo -e "${BLUE}   Mode: Manual validation${NC}"
fi
echo ""

VALIDATION_FAILED=false

# Manual validation checks
validate_manually() {
    echo -e "${YELLOW}📋 Running manual validation checks...${NC}"
    echo ""
    
    # Check 1: GoogleService-Info.plist exists
    echo -e "${YELLOW}1. Checking GoogleService-Info.plist...${NC}"
    if [ -f "ios/GoogleService-Info.plist" ] && [ -f "ios/Runner/GoogleService-Info.plist" ]; then
        echo -e "${GREEN}   ✅ GoogleService-Info.plist found in both locations${NC}"
    else
        echo -e "${RED}   ❌ GoogleService-Info.plist missing${NC}"
        VALIDATION_FAILED=true
    fi
    
    # Check 2: SceneDelegate.swift exists
    echo -e "${YELLOW}2. Checking SceneDelegate.swift...${NC}"
    if [ -f "ios/Runner/SceneDelegate.swift" ]; then
        echo -e "${GREEN}   ✅ SceneDelegate.swift exists${NC}"
    else
        echo -e "${YELLOW}   ⚠️  SceneDelegate.swift not found (optional for iOS 13+)${NC}"
    fi
    
    # Check 3: AppDelegate.swift exists
    echo -e "${YELLOW}3. Checking AppDelegate.swift...${NC}"
    if [ -f "ios/Runner/AppDelegate.swift" ]; then
        echo -e "${GREEN}   ✅ AppDelegate.swift exists${NC}"
    else
        echo -e "${RED}   ❌ AppDelegate.swift missing${NC}"
        VALIDATION_FAILED=true
    fi
    
    # Check 4: Info.plist exists
    echo -e "${YELLOW}4. Checking Info.plist...${NC}"
    if [ -f "ios/Runner/Info.plist" ]; then
        echo -e "${GREEN}   ✅ Info.plist exists${NC}"
    else
        echo -e "${RED}   ❌ Info.plist missing${NC}"
        VALIDATION_FAILED=true
    fi
    
    # Check 5: Xcode workspace exists
    echo -e "${YELLOW}5. Checking Xcode workspace...${NC}"
    if [ -d "ios/Runner.xcworkspace" ]; then
        echo -e "${GREEN}   ✅ Runner.xcworkspace exists${NC}"
    else
        echo -e "${RED}   ❌ Runner.xcworkspace missing${NC}"
        VALIDATION_FAILED=true
    fi
    
    # Check 6: Test target exists
    echo -e "${YELLOW}6. Checking test target...${NC}"
    if [ -d "ios/RunnerTests" ]; then
        echo -e "${GREEN}   ✅ RunnerTests directory exists${NC}"
        if [ -f "ios/RunnerTests/FirebaseInitTests.swift" ]; then
            echo -e "${GREEN}   ✅ FirebaseInitTests.swift exists${NC}"
        fi
        if [ -f "ios/RunnerTests/AppDelegateTests.swift" ]; then
            echo -e "${GREEN}   ✅ AppDelegateTests.swift exists${NC}"
        fi
        if [ -f "ios/RunnerTests/SceneDelegateTests.swift" ]; then
            echo -e "${GREEN}   ✅ SceneDelegateTests.swift exists${NC}"
        fi
    else
        echo -e "${YELLOW}   ⚠️  RunnerTests directory not found${NC}"
    fi
    
    echo ""
}

if [ "$USE_MCP" = "--mcp" ]; then
    echo -e "${BLUE}ℹ️  Recommended xcode-mcp-server Usage:${NC}"
    echo ""
    echo -e "${GREEN}1. Validate project structure:${NC}"
    echo -e "   // Use xcode-mcp-server tools to:"
    echo -e "   // - Verify SceneDelegate.swift is in build target"
    echo -e "   // - Verify GoogleService-Info.plist is in Copy Bundle Resources"
    echo -e "   // - Check file linking"
    echo -e "   // - Validate Info.plist configuration"
    echo ""
    echo -e "${GREEN}2. Validate build settings:${NC}"
    echo -e "   // Use xcode-mcp-server to check:"
    echo -e "   // - Deployment target"
    echo -e "   // - Code signing settings"
    echo -e "   // - Framework search paths"
    echo ""
    echo -e "${YELLOW}📋 Note: Verify actual xcode-mcp-server tools after installation${NC}"
    echo -e "${YELLOW}📋 Running manual validation as fallback...${NC}"
    echo ""
fi

# Always run manual validation as fallback
validate_manually

# Use XcodeBuildMCP for additional validation
if command -v xcodebuild &> /dev/null; then
    echo -e "${YELLOW}7. Checking project configuration with xcodebuild...${NC}"
    if xcodebuild -workspace ios/Runner.xcworkspace -scheme Runner -showBuildSettings > /dev/null 2>&1; then
        echo -e "${GREEN}   ✅ Project configuration is valid${NC}"
    else
        echo -e "${RED}   ❌ Project configuration has issues${NC}"
        VALIDATION_FAILED=true
    fi
    echo ""
fi

if [ "$VALIDATION_FAILED" = true ]; then
    echo -e "${RED}❌ Project validation failed${NC}"
    echo -e "${YELLOW}💡 Use xcode-mcp-server or XcodeBuildMCP tools to fix issues${NC}"
    exit 1
else
    echo -e "${GREEN}✅ Project validation passed!${NC}"
    echo ""
    echo -e "${BLUE}ℹ️  For deeper validation, use:${NC}"
    echo -e "${BLUE}   - xcode-mcp-server: Project structure and file linking${NC}"
    echo -e "${BLUE}   - XcodeBuildMCP xcode-project-info: Project configuration${NC}"
    exit 0
fi
