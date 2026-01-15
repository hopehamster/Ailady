# Genies Avatar SDK Migration Plan

## Overview

Migrating from Ready Player Me to Genies Avatar SDK for the AI Girlfriend app.

## Why Genies?

- ✅ **FREE** - No cost
- ✅ **Native Unity SDK** - Perfect integration
- ✅ **Easy Migration** - Similar to RPM
- ✅ **Unity Partnership** - Long-term support
- ✅ **High Customization** - Avatar Editor included

---

## Step 1: Sign Up & Setup

1. **Create Genies Account**
   - Go to https://genies.com/
   - Sign up for developer account
   - Get API key/credentials

2. **Install Unity SDK**
   - Download Genies Unity SDK
   - Follow: https://docs.genies.com/docs/sdk-avatar/frameworks/unity
   - Install in Unity project

---

## Step 2: Create Preset Avatars

1. **Use Genies Avatar Editor**
   - Create 6-10 starter avatars
   - Customize: face, body, hair, outfits
   - Export as GLB/GLTF format

2. **Store Avatar URLs**
   - Get avatar URLs from Genies
   - Store in Firestore or Firebase Storage
   - Update `_preselectedAvatars` list

---

## Step 3: Code Migration

### Update Service File

**File**: `lib/features/avatar/services/ready_player_me_service.dart`

**Rename to**: `lib/features/avatar/services/genies_avatar_service.dart`

**Changes**:
```dart
class GeniesAvatarService extends ChangeNotifier {
  // Genies configuration
  static const String apiKey = 'YOUR_GENIES_API_KEY';
  
  // Preselected avatars (from Genies)
  static final List<Avatar> _preselectedAvatars = [
    Avatar(
      id: 'avatar_1',
      url: 'https://genies.com/avatars/YOUR_AVATAR_1.glb',
      name: 'Sophia',
      thumbnailUrl: 'https://genies.com/avatars/YOUR_AVATAR_1.png',
    ),
    // ... add 5-9 more
  ];
  
  // Rest of service stays similar
}
```

### Update Unity Integration

**File**: `unity/README.md` and Unity scripts

**Changes**:
1. Install Genies Unity SDK
2. Update `AvatarLoader.cs` to use Genies SDK
3. Load avatars via Genies API
4. Keep emotion trigger system (same)

---

## Step 4: Update Widgets

**File**: `lib/features/avatar/widgets/ready_player_me_avatar_selector.dart`

**Changes**:
- Update imports to use `GeniesAvatarService`
- Update service references
- Keep UI the same (just change backend)

---

## Step 5: Update Onboarding

**File**: `lib/features/onboarding/screens/onboarding_screen.dart`

**Changes**:
- Update service reference
- Keep UI flow the same

---

## Step 6: Unity Script Updates

**File**: `unity/Assets/Scripts/AvatarLoader.cs`

**Changes**:
```csharp
using Genies.SDK; // Instead of ReadyPlayerMe

public class AvatarLoader : MonoBehaviour
{
    public void LoadAvatar(string avatarUrl)
    {
        // Use Genies SDK instead of RPM
        var geniesLoader = new GeniesAvatarLoader();
        geniesLoader.LoadAvatar(avatarUrl, OnAvatarLoaded);
    }
    
    // Rest stays the same
}
```

---

## Step 7: Testing Checklist

- [ ] Genies SDK installed in Unity
- [ ] Preset avatars created (6-10)
- [ ] Avatars load in Unity
- [ ] Emotion triggers work
- [ ] Avatar selection in onboarding
- [ ] Avatar displays in chat
- [ ] GLB/GLTF format works
- [ ] Performance is good

---

## Timeline

- **Week 1**: Sign up, install SDK, create presets
- **Week 2**: Code migration, update services
- **Week 3**: Unity integration, testing
- **Week 4**: Final testing, deployment

**Total**: ~4 weeks before RPM shutdown

---

## Backup Plan

If Genies doesn't work:
1. Try **Avatars SDK** (selfie-to-3D option)
2. Try **in3D** (real-time option)
3. Fall back to **custom avatar system** (Firebase Storage)

---

## Resources

- Genies Docs: https://docs.genies.com/
- Genies Unity SDK: https://docs.genies.com/docs/sdk-avatar/frameworks/unity
- Genies Developer Portal: https://genies.com/developers

---

## Support

- Genies Developer Support
- Unity Forums
- Your development team

---

## Notes

- Keep RPM code as backup until migration complete
- Test thoroughly before removing RPM
- Have rollback plan ready
- Document any issues for future reference
