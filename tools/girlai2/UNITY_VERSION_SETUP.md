# Installing Unity 2022.3.62f2 for Genies SDK

## Current Situation

- ✅ You have: Unity 6.3 LTS (6000.3.41f1)
- ❌ You need: Unity 2022.3.62f2 (LTS) for Genies Avatar SDK
- ✅ Good news: You can have **both versions installed**!

---

## Step 1: Install Unity 2022.3.62f2

### In Unity Hub:

1. **Click "Installs" tab** (left sidebar)
2. **Click "Install Editor"** (or the "+" button)
3. **Select Version**: 
   - Look for **2022.3.62f1** or **2022.3.62f2** (LTS)
   - If you see 2022.3.62f1, that's fine (very close version)
4. **Select Modules**:
   - ✅ **Unity Editor** (required)
   - ✅ **Documentation** (recommended)
   - ✅ **Standard Assets** (optional)
   - ✅ **iOS Build Support** (for your Flutter iOS app)
   - ✅ **Android Build Support** (if you plan Android later)
5. **Click "Install"**
6. **Wait for installation** (30-45 minutes)

---

## Step 2: Create Project with Correct Version

### After Installation:

1. **Click "Projects" tab** in Unity Hub
2. **Click "New Project"**
3. **Important**: Select **Unity 2022.3.62f2** from dropdown
   - Not Unity 6.3!
   - Make sure version dropdown shows 2022.3.62f2
4. **Select Template**: 
   - **"3D (URP)"** - Universal Render Pipeline
   - ⚠️ **Required**: Genies SDK only works with URP
5. **Project Name**: "GirlAI2Unity"
6. **Location**: `tools/girlai2/unity/` (or your choice)
7. **Click "Create"**
8. **Wait for project creation** (2-5 minutes)

---

## Step 3: Verify Correct Version

### When Project Opens:

1. **In Unity Editor**: `Help > About Unity`
2. **Check version**: Should show **2022.3.62f1** or **2022.3.62f2**
3. **Check Render Pipeline**: 
   - `Edit > Project Settings > Graphics`
   - Should show "Universal Render Pipeline"

---

## Why Two Versions?

### Unity 6.3 (Current):
- Latest features
- Use for other projects
- Keep installed

### Unity 2022.3.62f2 (For Genies):
- Required for Genies Avatar SDK
- Stable LTS version
- Use specifically for this project

**You can switch between versions** in Unity Hub when opening projects!

---

## Version Compatibility Note

### Genies SDK Requirements:
- **Unity Version**: 2022.3.62f2 (exact)
- **Render Pipeline**: URP only
- **Platform**: iOS/Android compatible

### If You See 2022.3.62f1:
- That's **very close** to 2022.3.62f2
- Should work fine (f1 vs f2 is minor patch)
- Try it first, if issues occur, get exact f2 version

---

## Quick Checklist

- [ ] Install Unity 2022.3.62f2 (or f1) from Installs tab
- [ ] Wait for installation to complete
- [ ] Create new project
- [ ] **Select 2022.3.62f2** in version dropdown (not 6.3!)
- [ ] Choose "3D (URP)" template
- [ ] Create project
- [ ] Double-click project to open
- [ ] Verify version in Unity Editor

---

## After Installation

Once Unity 2022.3.62f2 is installed and project opens:

1. ✅ **Download Genies SDK** via Package Manager
2. ✅ **Get Genies API key**
3. ✅ **Create preset avatars**
4. ✅ **Integrate with Flutter**

---

## Troubleshooting

### Issue: Can't find 2022.3.62f2 in list
**Fix**: 
- Look for 2022.3.62f1 (should work)
- Or search for "2022.3" in Unity Hub
- May need to add version manually

### Issue: Project opens with wrong version
**Fix**:
- Delete project
- Create new project
- **Make sure to select 2022.3.62f2** in dropdown

### Issue: Installation takes too long
**Fix**:
- Normal: 30-45 minutes
- Check internet connection
- Don't close Unity Hub during install

---

## Next Steps After Unity Opens

1. ✅ Unity 2022.3.62f2 project opens successfully
2. ✅ Go to `Window > Package Manager`
3. ✅ Download Genies Avatar SDK
4. ✅ Continue with integration

---

## Summary

**Action**: Install Unity 2022.3.62f2 alongside your Unity 6.3
**Time**: 30-45 minutes for installation
**Result**: Can use both versions for different projects

Good luck! Once 2022.3.62f2 is installed, create the project with that version selected.
