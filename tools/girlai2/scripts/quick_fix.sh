#!/bin/bash
# Quick fix loop - fast iteration for small changes
# Runs only tests and analysis, skips build
# Usage: ./scripts/quick_fix.sh [--mcp|--flutter]
#
# Note: AI agents should use Dart MCP tools directly:
#   - dart-format: Format code
#   - dart-analyze: Analyze code
#   - dart-fix: Apply fixes
#   - dart-test: Run tests

set -e

cd "$(dirname "$0")/.."

FLUTTER_BIN="../flutter/bin/flutter"
USE_MCP=${1:-"--flutter"}

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${YELLOW}⚡ Quick Fix Mode${NC}"
if [ "$USE_MCP" = "--mcp" ]; then
    echo -e "${BLUE}   Mode: Dart MCP (AI agent should use MCP tools directly)${NC}"
else
    echo -e "${BLUE}   Mode: Flutter CLI${NC}"
fi
echo ""

if [ "$USE_MCP" = "--mcp" ]; then
    echo -e "${BLUE}ℹ️  Recommended Dart MCP tool usage:${NC}"
    echo ""
    echo -e "${GREEN}1. Format code:${NC}"
    echo -e "   dart-format({ paths: ['lib/', 'test/'], options: [] })"
    echo ""
    echo -e "${GREEN}2. Analyze code:${NC}"
    echo -e "   dart-analyze({ path: '.', options: [] })"
    echo ""
    echo -e "${GREEN}3. Apply fixes:${NC}"
    echo -e "   dart-fix({ path: '.', apply: true, options: [] })"
    echo ""
    echo -e "${GREEN}4. Run tests:${NC}"
    echo -e "   dart-test({ path: 'test/unit/', options: [] })"
    echo ""
    echo -e "${YELLOW}📋 Fallback: Running with Flutter CLI...${NC}"
    echo ""
fi

# Format
echo -e "${YELLOW}✨ Formatting code...${NC}"
$FLUTTER_BIN format .

# Analyze
echo -e "${YELLOW}🔍 Analyzing code...${NC}"
$FLUTTER_BIN analyze

# Test
echo -e "${YELLOW}🧪 Running unit tests...${NC}"
$FLUTTER_BIN test test/unit/

echo ""
echo -e "${GREEN}✅ Quick checks passed!${NC}"
