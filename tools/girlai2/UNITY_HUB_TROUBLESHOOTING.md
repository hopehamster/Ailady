# Unity Hub - Project Won't Open Troubleshooting

## Issue: Project Created But Won't Open

If Unity Hub creates a project but doesn't open it, try these solutions:

---

## Solution 1: Check Unity Installation

### Verify Unity is Installed
1. **Open Unity Hub**
2. **Go to "Installs" tab** (left sidebar)
3. **Check if Unity 2022.3.62f2 is installed**
   - If not installed: Click "Install" button
   - Select version: 2022.3.62f2
   - Wait for installation to complete

### If Unity Not Installed:
1. Click "Installs" in Unity Hub
2. Click "Install Editor"
3. Select version: **2022.3.62f2** (LTS)
4. **Important**: Check "Universal Windows Platform Build Support" (if needed)
5. Click "Install"
6. Wait for download and installation (this takes time)

---

## Solution 2: Manually Open Project

### Method A: Double-Click Project
1. **In Unity Hub Projects tab**
2. **Find your project** in the list
3. **Double-click the project name**
4. Should open Unity Editor

### Method B: Right-Click Open
1. **Right-click on project** in Unity Hub
2. **Select "Open"** or "Open in Unity Editor"
3. Should launch Unity Editor

### Method C: Open from Unity Editor
1. **Open Unity Editor directly** (if installed)
2. **File > Open Project**
3. **Navigate to project folder**
4. **Select project folder**

---

## Solution 3: Check Project Location

### Find Project Folder
1. **In Unity Hub**: Right-click project → "Show in Finder" (Mac) or "Show in Explorer" (Windows)
2. **Note the folder path**
3. **Check if folder exists** and has files

### If Project Folder Missing:
- Project creation may have failed
- Try creating project again
- Check disk space
- Check write permissions

---

## Solution 4: Unity Hub Settings

### Check Hub Settings
1. **Unity Hub → Settings/Preferences**
2. **Check "General" settings:**
   - "Editor Version" should be set
   - "Default Project Location" should be valid
3. **Check "Projects" settings:**
   - "Open projects in Unity Editor" should be enabled

### Reset Unity Hub
1. **Quit Unity Hub completely**
2. **Restart Unity Hub**
3. **Try opening project again**

---

## Solution 5: Unity Editor Not Installed

### If You See "No Editor Installed":
1. **Go to "Installs" tab** in Unity Hub
2. **Click "Install Editor"**
3. **Select Unity 2022.3.62f2 LTS**
4. **Choose modules** (at minimum):
   - ✅ Unity Editor
   - ✅ Documentation
   - ✅ Standard Assets (optional)
5. **Click "Install"**
6. **Wait for installation** (can take 30+ minutes)

---

## Solution 6: Check System Requirements

### macOS Requirements:
- **macOS 10.15 or later**
- **8GB RAM minimum** (16GB recommended)
- **Sufficient disk space** (10GB+ for Unity + project)

### Check Your System:
1. **About This Mac** → Check macOS version
2. **Activity Monitor** → Check available RAM
3. **Disk Utility** → Check available space

---

## Solution 7: Create Project with Specific Template

### When Creating Project:
1. **Click "New Project"** in Unity Hub
2. **Select Template**: "3D (URP)" or "3D"
3. **Select Unity Version**: 2022.3.62f2
4. **Project Name**: "GirlAI2Unity" (or your choice)
5. **Location**: Choose folder (e.g., `tools/girlai2/unity/`)
6. **Click "Create"**
7. **Wait for project creation** (may take a few minutes)

### Important Notes:
- **First time**: Unity downloads and installs if needed
- **Project creation**: Can take 2-5 minutes
- **Don't close Unity Hub** during creation

---

## Solution 8: Check Console/Logs for Errors

### macOS Console:
1. **Open Console.app** (Applications > Utilities)
2. **Search for "Unity"**
3. **Look for error messages**
4. **Note any errors** and search for solutions

### Unity Hub Logs:
1. **Unity Hub → Help → Show Logs**
2. **Check for errors**
3. **Look for installation or project creation issues**

---

## Solution 9: Reinstall Unity Hub

### If Nothing Works:
1. **Uninstall Unity Hub**
   - macOS: Drag to Trash from Applications
   - Or use uninstaller if available
2. **Download fresh Unity Hub**
   - https://unity.com/download
   - Download for macOS
3. **Install Unity Hub**
4. **Install Unity Editor** (2022.3.62f2)
5. **Create new project**

---

## Solution 10: Manual Project Opening

### If Unity Editor is Installed:
1. **Open Terminal** (macOS)
2. **Navigate to Unity Editor**:
   ```bash
   cd /Applications/Unity/Hub/Editor/[VERSION]/Unity.app/Contents/MacOS
   ```
3. **Or find Unity.app** in Applications
4. **Double-click Unity.app** to open
5. **File > Open Project**
6. **Select your project folder**

---

## Quick Diagnostic Checklist

- [ ] Unity Editor installed? (Check "Installs" tab)
- [ ] Correct version? (2022.3.62f2)
- [ ] Project folder exists? (Check location)
- [ ] Enough disk space? (10GB+ free)
- [ ] Unity Hub updated? (Latest version)
- [ ] Tried double-clicking project?
- [ ] Tried right-click → Open?
- [ ] Checked Console for errors?
- [ ] Restarted Unity Hub?

---

## Step-by-Step: Fresh Start

### 1. Install Unity Editor
```
Unity Hub → Installs → Install Editor → 2022.3.62f2 LTS → Install
```

### 2. Wait for Installation
- Download: 10-30 minutes
- Installation: 5-10 minutes
- Total: ~30-45 minutes

### 3. Create Project
```
Unity Hub → Projects → New → 3D (URP) → 2022.3.62f2 → Create
```

### 4. Open Project
```
Double-click project name in Unity Hub
```

---

## Common Issues & Fixes

### Issue: "No Editor Installed"
**Fix**: Install Unity 2022.3.62f2 from Installs tab

### Issue: "Project Creation Failed"
**Fix**: Check disk space, permissions, try different location

### Issue: "Unity Editor Won't Launch"
**Fix**: Check system requirements, reinstall Unity

### Issue: "Project Opens But Crashes"
**Fix**: Check Unity version compatibility, update graphics drivers

---

## Alternative: Skip Unity for Now

If Unity continues to have issues, you can:
1. **Use Avatars SDK** (REST API - no Unity needed initially)
2. **Create avatars via web** and download GLB files
3. **Store in Firebase Storage**
4. **Load in Unity later** when it's working

---

## Next Steps

1. ✅ **Check if Unity Editor is installed**
2. ✅ **If not, install Unity 2022.3.62f2**
3. ✅ **Create project with URP template**
4. ✅ **Double-click project to open**
5. ✅ **Then download Genies SDK via Package Manager**

---

## Need More Help?

- **Unity Forums**: https://forum.unity.com/
- **Unity Support**: support.unity.com
- **Unity Hub Issues**: Check Unity Hub release notes

---

## Quick Test

Try this to verify Unity works:
1. Open Unity Hub
2. Go to "Installs" tab
3. If you see Unity 2022.3.62f2 → Good!
4. If you see "Install Editor" → Click it and install
5. After installation, create new project
6. Double-click project to open

If project still won't open after Unity is installed, there may be a deeper issue with Unity Hub or your system.
