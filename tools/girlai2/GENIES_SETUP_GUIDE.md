# Genies Avatar SDK - Download & Setup Guide

## Where to Download

### Option 1: Official Genies Developer Portal (Recommended)

1. **Go to Genies Developer Portal**
   - Website: https://genies.com/developers
   - Or: https://docs.genies.com/

2. **Sign Up / Log In**
   - Create a developer account (free)
   - Verify your email

3. **Access SDK Downloads**
   - Navigate to SDK section
   - Look for "Unity SDK" or "Avatar SDK"
   - Download the Unity package

### Option 2: Unity Asset Store (If Available)

1. **Open Unity Hub**
2. **Go to Asset Store**
3. **Search**: "Genies Avatar SDK"
4. **Download** (if available)

### Option 3: GitHub Repository (If Open Source)

1. **Check GitHub**
   - Search: "genies avatar sdk unity"
   - Look for official Genies repository
   - Clone or download

---

## Installation Steps

### Step 1: Download SDK

1. Go to https://genies.com/developers
2. Sign up for developer account
3. Navigate to Downloads/SDK section
4. Download Unity SDK package (.unitypackage file)

### Step 2: Install in Unity

1. **Open Unity Project**
   - Open your Unity project (or create new one)
   - Location: `tools/girlai2/unity/` (when you create it)

2. **Import Package**
   - In Unity: `Assets > Import Package > Custom Package...`
   - Select the downloaded `.unitypackage` file
   - Click "Import"

3. **Verify Installation**
   - Check `Assets` folder for Genies SDK files
   - Look for Genies scripts/plugins

### Step 3: Get API Key

1. **Developer Dashboard**
   - Log into Genies developer portal
   - Go to API Keys section
   - Generate new API key
   - Copy the key

2. **Add to Code**
   - Update `lib/features/avatar/services/genies_avatar_service.dart`
   - Add API key constant

---

## Alternative: Direct Links (If Available)

### Official Links to Check:

1. **Genies Developer Portal**
   - https://genies.com/developers
   - https://developer.genies.com/

2. **Genies Documentation**
   - https://docs.genies.com/
   - Look for "Getting Started" or "Installation"

3. **Unity Integration Docs**
   - https://docs.genies.com/docs/sdk-avatar/frameworks/unity

---

## If SDK Not Publicly Available

### Contact Genies Support

1. **Email**: Check their website for developer contact
2. **Request Access**: Ask for Unity SDK access
3. **Join Waitlist**: If they have a waitlist

### Alternative: Use Genies API

If SDK not available, you can:
1. Use Genies REST API
2. Create avatars via API
3. Download GLB/GLTF files
4. Load in Unity manually

---

## Quick Start Checklist

- [ ] Sign up at genies.com/developers
- [ ] Download Unity SDK
- [ ] Import into Unity project
- [ ] Get API key from dashboard
- [ ] Test avatar creation
- [ ] Verify GLB/GLTF export

---

## Troubleshooting

### Can't Find SDK?
- Check if it's in beta/private access
- Contact Genies support
- Check Unity Asset Store
- Look for GitHub releases

### Installation Issues?
- Make sure Unity version is compatible
- Check Unity package manager
- Verify .unitypackage file integrity

### Need Help?
- Genies Documentation: https://docs.genies.com/
- Genies Support: Check developer portal
- Unity Forums: Search for Genies

---

## Next Steps After Download

1. ✅ Install SDK in Unity
2. ✅ Get API key
3. ✅ Create test avatar
4. ✅ Export as GLB/GLTF
5. ✅ Test loading in Unity
6. ✅ Update Flutter service code

---

## Important Notes

- **Free Tier**: Genies SDK should be free for developers
- **API Limits**: Check if there are rate limits
- **Terms**: Review terms of service
- **Support**: Verify support channels

---

## Backup Plan

If Genies SDK is not available:
1. Use **Avatars SDK** (ItSeez3D) - REST API approach
2. Use **in3D** - If they have Unity SDK
3. Create **custom avatar system** - Store GLB files in Firebase
