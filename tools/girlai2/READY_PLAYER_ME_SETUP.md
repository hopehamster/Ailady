# Ready Player Me Integration Guide

## Overview

Ready Player Me provides 3D avatars that can be integrated into Unity and displayed in your Flutter app. This guide covers both Unity integration and web widget approaches.

## Architecture

The integration uses a two-part system:
1. **Flutter Service** (`ReadyPlayerMeService`) - Manages avatar selection and URLs
2. **Unity Integration** - Loads and displays avatars in Unity, controlled from Flutter

## Setup Steps

### Step 1: Create Ready Player Me Account

1. Go to https://studio.readyplayer.me
2. Sign up for an account
3. Create a new project
4. Note your **Subdomain** (e.g., `girlai2`)

### Step 2: Configure Subdomain

Update the subdomain in `lib/features/avatar/services/ready_player_me_service.dart`:

```dart
static const String subdomain = 'girlai2'; // Change to your subdomain
```

### Step 3: Create Preselected Avatars (6-10 as per architecture)

You have two options:

#### Option A: Use Ready Player Me Studio
1. Go to https://studio.readyplayer.me
2. Create 6-10 avatar presets
3. Export their GLB/GLTF URLs
4. Update `_preselectedAvatars` list in `ReadyPlayerMeService`

#### Option B: Use Ready Player Me API
1. Use Ready Player Me API to generate avatars programmatically
2. Store avatar URLs in Firestore
3. Load them dynamically

### Step 4: Update Avatar URLs

In `lib/features/avatar/services/ready_player_me_service.dart`, replace placeholder URLs:

```dart
static final List<ReadyPlayerMeAvatar> _preselectedAvatars = [
  ReadyPlayerMeAvatar(
    id: 'avatar_1',
    url: 'https://models.readyplayer.me/YOUR_ACTUAL_AVATAR_1.glb', // Replace
    name: 'Sophia',
    thumbnailUrl: 'https://models.readyplayer.me/YOUR_ACTUAL_AVATAR_1.png', // Replace
  ),
  // ... add 5-9 more avatars
];
```

## Unity Integration (Recommended)

### Step 1: Install Ready Player Me Unity SDK

1. Open Unity Hub
2. Create new Unity project (2022.3 LTS or later)
3. Install Ready Player Me Unity SDK:
   - Go to Window > Package Manager
   - Click "+" > "Add package from git URL"
   - Enter: `https://github.com/readyplayerme/rpm-unity-sdk.git`

### Step 2: Set Up Avatar Loader in Unity

Create a C# script in Unity:

```csharp
using ReadyPlayerMe;
using UnityEngine;

public class AvatarLoader : MonoBehaviour
{
    private GameObject currentAvatar;
    
    public void LoadAvatar(string avatarUrl)
    {
        var avatarLoader = new AvatarObjectLoader();
        avatarLoader.OnCompleted += OnAvatarLoaded;
        avatarLoader.OnFailed += OnAvatarFailed;
        avatarLoader.LoadAvatar(avatarUrl);
    }
    
    private void OnAvatarLoaded(object sender, CompletionEventArgs args)
    {
        currentAvatar = args.Avatar;
        // Set up animator and emotion triggers
    }
    
    private void OnAvatarFailed(object sender, FailureEventArgs args)
    {
        Debug.LogError($"Failed to load avatar: {args.Message}");
    }
    
    public void TriggerEmotion(string emotion, string trigger)
    {
        if (currentAvatar != null)
        {
            var animator = currentAvatar.GetComponent<Animator>();
            if (animator != null)
            {
                animator.SetTrigger(trigger);
            }
        }
    }
}
```

### Step 3: Set Up Emotion Triggers in Unity Animator

1. Create Animator Controller for avatar
2. Add emotion trigger parameters:
   - `smile` (bool/trigger)
   - `blush` (bool/trigger)
   - `frown` (bool/trigger)
   - `idle` (bool/trigger)
   - `happy_idle` (bool/trigger)
   - `sad_idle` (bool/trigger)
   - `surprised` (bool/trigger)

3. Create animation states and transitions
4. Connect triggers to animations

### Step 4: Export Unity Module for Flutter

1. Install `flutter_unity_widget` package (already in pubspec.yaml)
2. Follow flutter_unity_widget setup guide
3. Export Unity build for iOS
4. Integrate with Flutter app

### Step 5: Connect Flutter to Unity

Update `lib/features/avatar/widgets/avatar_view.dart` to use actual Unity widget:

```dart
import 'package:flutter_unity_widget/flutter_unity_widget.dart';

UnityWidget(
  onUnityCreated: (controller) {
    _unityController = controller;
    // Load avatar when Unity is ready
    if (widget.avatarId != null) {
      unityService.loadAvatar(widget.avatarId!);
    }
  },
  fullscreen: widget.fullscreen,
)
```

## Web Widget Integration (Alternative)

If you want to allow users to create custom avatars without Unity:

### Step 1: Add WebView Package

Add to `pubspec.yaml`:
```yaml
webview_flutter: ^4.4.2
```

### Step 2: Create WebView Widget

Create `lib/features/avatar/widgets/ready_player_me_webview.dart`:

```dart
import 'package:flutter/material.dart';
import 'package:webview_flutter/webview_flutter.dart';

class ReadyPlayerMeWebView extends StatefulWidget {
  final Function(String avatarUrl)? onAvatarCreated;
  
  const ReadyPlayerMeWebView({super.key, this.onAvatarCreated});

  @override
  State<ReadyPlayerMeWebView> createState() => _ReadyPlayerMeWebViewState();
}

class _ReadyPlayerMeWebViewState extends State<ReadyPlayerMeWebView> {
  late final WebViewController _controller;

  @override
  void initState() {
    super.initState();
    _controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setNavigationDelegate(
        NavigationDelegate(
          onPageFinished: (String url) {
            // Listen for postMessage from Ready Player Me
            _controller.runJavaScript('''
              window.addEventListener('message', function(event) {
                if (event.data.type === 'vrm' || event.data.type === 'glb') {
                  window.flutter_inappwebview.callHandler('avatarCreated', event.data.url);
                }
              });
            ''');
          },
        ),
      )
      ..loadRequest(Uri.parse('https://girlai2.readyplayer.me/avatar?frameApi'));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Create Avatar')),
      body: WebViewWidget(controller: _controller),
    );
  }
}
```

## Avatar Storage

Avatars are stored in Firestore:

```dart
// User profile
{
  'selectedAvatarId': 'avatar_1',
  'avatarUrl': 'https://models.readyplayer.me/avatar.glb',
  'avatarThumbnailUrl': 'https://models.readyplayer.me/avatar.png',
}
```

## Emotion Trigger System

Emotions are triggered from chat responses:

1. **Sentiment Analysis** → Detects emotion from AI response
2. **Emotion Mapping** → Maps to Unity trigger
3. **Unity Communication** → Sends trigger to Unity
4. **Animation Playback** → Unity plays appropriate animation

Example flow:
```
AI Response: "I'm so happy to see you!" 
→ Sentiment: "happy"
→ Trigger: "smile"
→ Unity: Plays smile animation
```

## Preselected Avatars Setup

To set up the 6-10 preselected avatars:

1. **Option 1: Use Ready Player Me Studio**
   - Create avatars in studio
   - Export GLB URLs
   - Add to `_preselectedAvatars` list

2. **Option 2: Use Ready Player Me API**
   - Generate avatars via API
   - Store in Firestore
   - Load dynamically

3. **Option 3: Pre-configured Avatars**
   - Use Ready Player Me's sample avatars
   - Customize them
   - Store URLs

## Testing

### Test Avatar Selection
```dart
final rpmService = ReadyPlayerMeService();
final avatars = rpmService.getPreselectedAvatars();
rpmService.selectAvatar(avatars[0]);
```

### Test Unity Integration
1. Build Unity project
2. Run Flutter app
3. Select avatar in onboarding
4. Verify avatar loads in Unity view
5. Send chat message
6. Verify emotion triggers work

## Troubleshooting

### Avatar not loading in Unity
- Check avatar URL is valid GLB/GLTF
- Verify Unity SDK is installed
- Check Unity console for errors
- Verify network connectivity

### Emotion triggers not working
- Check Unity Animator has trigger parameters
- Verify postMessage is working
- Check Unity console for messages
- Test triggers manually in Unity

### Web widget not opening
- Check subdomain is correct
- Verify URL launcher permissions
- Check internet connection
- Try opening URL in browser first

## Resources

- Ready Player Me Docs: https://docs.readyplayer.me
- Ready Player Me Studio: https://studio.readyplayer.me
- Unity SDK: https://github.com/readyplayerme/rpm-unity-sdk
- Flutter Unity Widget: https://pub.dev/packages/flutter_unity_widget

## Next Steps

1. ✅ Create Ready Player Me account
2. ✅ Set subdomain in code
3. ⏳ Create 6-10 preselected avatars
4. ⏳ Set up Unity project with RPM SDK
5. ⏳ Configure emotion triggers in Unity
6. ⏳ Export Unity module
7. ⏳ Integrate with Flutter
8. ⏳ Test avatar loading and emotions
