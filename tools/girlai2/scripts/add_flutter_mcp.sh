#!/bin/bash
# Script to add Flutter MCP to Cursor's MCP configuration

MCP_CONFIG="$HOME/.cursor/mcp.json"
BACKUP="$HOME/.cursor/mcp.json.backup"

echo "🔧 Adding Flutter MCP to Cursor configuration..."

# Backup existing config
if [ -f "$MCP_CONFIG" ]; then
  cp "$MCP_CONFIG" "$BACKUP"
  echo "✅ Backed up existing config to $BACKUP"
fi

# Check if flutter-docs already exists
if grep -q '"flutter-docs"' "$MCP_CONFIG" 2>/dev/null; then
  echo "⚠️  Flutter MCP already configured in $MCP_CONFIG"
  exit 0
fi

# Add flutter-docs entry using Python (more reliable than sed for JSON)
python3 << 'PYTHON_SCRIPT'
import json
import sys
import os

config_path = os.path.expanduser("~/.cursor/mcp.json")

try:
    with open(config_path, 'r') as f:
        config = json.load(f)
    
    # Add flutter-docs entry
    config["mcpServers"]["flutter-docs"] = {
        "command": "npx",
        "args": [
            "-y",
            "flutter-mcp"
        ],
        "env": {
            "PATH": "/Users/mikesm4/Documents/Mikes work/Github/Ailady/tools/flutter/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
        }
    }
    
    # Write back
    with open(config_path, 'w') as f:
        json.dump(config, f, indent=2)
    
    print("✅ Successfully added Flutter MCP to $config_path")
    print("")
    print("📝 Next steps:")
    print("   1. Restart Cursor to activate Flutter MCP")
    print("   2. Test by asking about a Flutter package (e.g., 'How do I use flutter_otp_kit?')")
    
except Exception as e:
    print(f"❌ Error: {e}")
    sys.exit(1)
PYTHON_SCRIPT
