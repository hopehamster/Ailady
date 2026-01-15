# Genies Avatar SDK - Download Troubleshooting

## Issue: Asset Store Link Not Working

If clicking the Genies Avatar SDK in Unity Asset Store does nothing, try these solutions:

---

## Solution 1: Open Unity Editor First

1. **Open Unity Hub**
2. **Open or Create Unity Project**
   - Create new project (Unity 2022.3.62f2 or compatible)
   - Or open existing project
3. **In Unity Editor:**
   - Go to `Window > Asset Store`
   - Search for "Genies Avatar SDK"
   - Click "Open in Browser" or download directly

---

## Solution 2: Check Unity Hub Settings

1. **Unity Hub Settings**
   - Open Unity Hub
   - Go to Settings/Preferences
   - Check "Asset Store" settings
   - Ensure "Open Asset Store in Unity Editor" is enabled

2. **Browser Settings**
   - Check if browser is blocking Unity Hub
   - Allow Unity Hub to open links
   - Try different browser (Chrome, Firefox, Safari)

---

## Solution 3: Direct Download via Unity Editor

1. **Open Unity Project**
   - Unity version: 2022.3.62f2 (required)
   - Or compatible URP version

2. **Access Asset Store in Editor**
   - `Window > Asset Store` (in Unity Editor)
   - Search: "Genies Avatar SDK"
   - Click "Add to My Assets" (if logged in)
   - Click "Open in Unity" or "Download"

3. **Import Package**
   - Once downloaded, click "Import"
   - Or: `Assets > Import Package > Custom Package...`

---

## Solution 4: Manual Download Steps

### Step 1: Log Into Unity Account
1. Go to https://assetstore.unity.com/
2. Log in with your Unity account
3. Search for "Genies Avatar SDK"
4. Click "Add to My Assets" (free)

### Step 2: Download via Unity Editor
1. Open Unity Editor
2. Go to `Window > Package Manager`
3. Click dropdown: "My Assets"
4. Find "Genies Avatar SDK"
5. Click "Download" then "Import"

---

## Solution 5: Check Unity Version Compatibility

**Required Unity Version**: 2022.3.62f2

**Render Pipeline**: URP (Universal Render Pipeline) only
- ✅ URP: Compatible
- ❌ Built-in: Not compatible
- ❌ HDRP: Not compatible

**If you have wrong version:**
1. Download Unity 2022.3.62f2 from Unity Hub
2. Create new project with URP template
3. Then download Genies SDK

---

## Solution 6: Alternative Download Methods

### Method A: Unity Package Manager (Recommended)
1. Open Unity Editor
2. `Window > Package Manager`
3. Click "+" button (top left)
4. Select "Add package from git URL"
5. Enter Genies SDK git URL (if available)
   - Or check Genies docs for git URL

### Method B: Direct .unitypackage File
1. Contact Genies support: api@genies.com
2. Request direct download link
3. Download .unitypackage file
4. Import: `Assets > Import Package > Custom Package...`

### Method C: GitHub Repository
1. Check if Genies has public GitHub repo
2. Search: "genies avatar sdk unity github"
3. Clone or download repository
4. Import into Unity

---

## Solution 7: Browser Troubleshooting

### Chrome/Edge:
1. Check if Unity Hub protocol is registered
2. Type in address bar: `unityhub://` (should open Unity Hub)
3. If not, reinstall Unity Hub

### Safari:
1. Safari may block Unity Hub links
2. Try Chrome or Firefox instead
3. Or download directly in Unity Editor

### Firefox:
1. Usually works best with Unity Hub
2. Check if Unity Hub extension is installed

---

## Solution 8: Unity Hub Reinstall

If nothing works:
1. **Uninstall Unity Hub**
2. **Download fresh Unity Hub** from unity.com
3. **Reinstall**
4. **Link Unity account**
5. **Try Asset Store again**

---

## Quick Checklist

- [ ] Unity Hub installed and running
- [ ] Unity Editor installed (2022.3.62f2)
- [ ] Logged into Unity account
- [ ] Browser allows Unity Hub protocol
- [ ] Unity project open in Editor
- [ ] Tried Package Manager method
- [ ] Tried different browser

---

## Recommended Approach

**Best Method: Use Unity Editor Package Manager**

1. ✅ Open Unity Editor (2022.3.62f2)
2. ✅ Go to `Window > Package Manager`
3. ✅ Click dropdown: "My Assets"
4. ✅ Find "Genies Avatar SDK"
5. ✅ Click "Download" → "Import"

This bypasses browser issues entirely!

---

## If Still Not Working

### Contact Support:
1. **Genies Support**: api@genies.com
   - Ask for direct download link
   - Request .unitypackage file

2. **Unity Support**: support.unity.com
   - Report Asset Store issue
   - Get help with Unity Hub

3. **Alternative**: Use Avatars SDK (ItSeez3D)
   - No Asset Store needed
   - REST API integration
   - Can start immediately

---

## Next Steps After Download

Once you get the SDK:
1. Import into Unity project
2. Get API key from Genies
3. Test avatar creation
4. Export GLB/GLTF files
5. Update Flutter service code

---

## File Size Note

The Genies Avatar SDK is **304.7 MB**, so:
- Ensure good internet connection
- May take time to download
- Check available disk space
