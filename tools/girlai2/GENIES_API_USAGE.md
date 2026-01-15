# Genies API Usage Guide

## ⚠️ Important Clarification

The GitHub repo you linked (https://github.com/alexxx-db/databricks-genie-mcp) is for **Databricks Genie** - a completely different product (AI/BI assistant for Databricks). 

**We're using Genies Avatar SDK** - the 3D avatar platform. These are two different things!

---

## What We Have

✅ **Genies Avatar SDK Credentials**:
- **Client ID**: `client_01KEZDTFBTMCZTKT2ZYYEFRZ8D`
- **Client Secret**: `950cba732acd46c598c3f0d51454a2e7d0dfe6852a6a6d0921756187bb0cda37`
- **Location**: `lib/core/config/genies_config.dart`

**Note**: Genies uses **Client ID + Secret** (OAuth), not a single "API key"

---

## How to Create Avatars

### Option 1: Use Genies Unity SDK (Recommended)

Since you have Unity set up:

1. **In Unity Editor**:
   - Use Genies SDK to create avatars
   - Genies SDK provides avatar editor UI
   - Create 6-10 preset avatars
   - Export as GLB/GLTF
   - Get URLs

2. **Update Code**:
   - Add avatar URLs to `_preselectedAvatars` in `GeniesAvatarService`

### Option 2: Use Genies API (Programmatic)

I've implemented API methods in `GeniesAvatarService`:

```dart
// Authenticate and create avatar
final geniesService = GeniesAvatarService();
final avatar = await geniesService.createAvatar(
  name: 'Sophia',
  customization: {
    // Avatar customization options
  },
);
```

**However**: You need to check Genies API documentation for:
- Exact API endpoints
- Request/response format
- Available customization options

### Option 3: Use Genies Web Editor

1. **Open Genies Avatar Editor**:
   - Via `openAvatarCreator()` method in service
   - Or go to Genies website directly
   - Use your Client ID

2. **Create Avatars**:
   - Design 6-10 avatars
   - Save/export them
   - Get GLB/GLTF URLs

3. **Add URLs to Code**:
   - Update `_preselectedAvatars` list

---

## Genies API Documentation

Check these resources:

1. **Genies Tech Docs**: https://docs.genies.com/
2. **Genies API Reference**: https://docs.genies.com/docs/sdk-avatar/api-reference/
3. **Genies GitHub**: https://github.com/geniesinc
4. **Genies Support**: api@genies.com

---

## What I Can't Do

❌ **I cannot create avatars for you** - This requires:
- Access to Genies API/Editor
- Actual avatar design choices
- Genies platform access

✅ **What I can do**:
- Help you use the credentials
- Implement API integration code
- Guide you through the process
- Help troubleshoot

---

## Recommended Approach

### Step 1: Use Unity SDK (Easiest)

1. **In Unity**:
   - Open Genies SDK
   - Use Avatar Editor
   - Create 6-10 avatars
   - Export them

2. **Get URLs**:
   - Genies SDK will provide avatar URLs
   - Copy GLB/GLTF URLs

3. **Update Code**:
   - Add URLs to `GeniesAvatarService`

### Step 2: Test in Unity

1. Load avatars in Unity
2. Test emotion triggers
3. Verify everything works

### Step 3: Integrate with Flutter

1. Update Flutter service with avatar URLs
2. Test avatar selection
3. Test Unity-Flutter communication

---

## API Implementation Status

✅ **Implemented**:
- Authentication method (`_authenticateWithGenies`)
- Avatar creation method (`createAvatar`)
- Avatar listing method (`listAvatars`)

⚠️ **Needs Verification**:
- Actual Genies API endpoints
- Request/response format
- Check Genies documentation

---

## Next Steps

1. **Check Genies Docs**: https://docs.genies.com/
   - Find exact API endpoints
   - Verify request format
   - Update code if needed

2. **Use Unity SDK** (Easier):
   - Create avatars in Unity
   - Get URLs
   - Add to code

3. **Or Use Web Editor**:
   - Open Genies editor
   - Create avatars
   - Get URLs
   - Add to code

---

## Summary

- ✅ We have Genies credentials (Client ID + Secret)
- ✅ Code is ready to use them
- ⚠️ Need to create avatars via Unity SDK or API
- ⚠️ Need to verify exact Genies API endpoints
- ✅ Can help implement once we know API structure

**The Databricks Genie repo is unrelated** - that's for Databricks AI assistant, not avatars.

---

## Quick Test

Try this to test authentication:

```dart
final geniesService = GeniesAvatarService();
await geniesService.initialize();
final avatars = await geniesService.listAvatars();
print('Found ${avatars.length} avatars');
```

This will tell us if the API endpoints are correct!
