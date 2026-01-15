# Ready Player Me Quick Start

## What's Been Set Up

✅ **Flutter Service** - `ReadyPlayerMeService` for avatar management
✅ **Avatar Selector Widget** - UI for selecting from preset avatars
✅ **Unity Integration** - Service ready to communicate with Unity
✅ **Onboarding Integration** - Avatar selection in onboarding flow

## Quick Setup (5 Steps)

### 1. Get Ready Player Me Account
- Go to https://studio.readyplayer.me
- Sign up and create project
- Note your subdomain

### 2. Update Subdomain
Edit `lib/features/avatar/services/ready_player_me_service.dart`:
```dart
static const String subdomain = 'your-subdomain'; // Change this
```

### 3. Create 6-10 Preset Avatars
- Use Ready Player Me Studio to create avatars
- Get their GLB URLs
- Update `_preselectedAvatars` list in `ReadyPlayerMeService`

### 4. Set Up Unity (When Ready)
- Create Unity project
- Install Ready Player Me Unity SDK
- Follow `unity/README.md` guide
- Export for Flutter

### 5. Test
- Run app
- Go through onboarding
- Select avatar
- Verify it loads (placeholder until Unity is ready)

## Current Status

- ✅ Flutter code ready
- ✅ Service structure complete
- ✅ UI components created
- ⏳ Need Ready Player Me account
- ⏳ Need to create preset avatars
- ⏳ Need Unity project setup

## Files Created

1. `lib/features/avatar/services/ready_player_me_service.dart` - Main service
2. `lib/features/avatar/widgets/ready_player_me_avatar_selector.dart` - Selection UI
3. `unity/README.md` - Unity setup guide
4. `READY_PLAYER_ME_SETUP.md` - Complete integration guide

## Next Actions

1. Create Ready Player Me account
2. Get subdomain
3. Create 6-10 avatars
4. Update avatar URLs in code
5. Set up Unity project (when ready)
