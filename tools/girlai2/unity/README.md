# Unity Project Setup for Ready Player Me

## Project Structure

This directory will contain the Unity project for 3D avatar integration.

## Setup Instructions

### 1. Create Unity Project

1. Open Unity Hub
2. Create new 3D project
3. Name: `GirlAI2Unity`
4. Version: 2022.3 LTS or later
5. Location: `tools/girlai2/unity/`

### 2. Install Ready Player Me SDK

1. In Unity, go to Window > Package Manager
2. Click "+" > "Add package from git URL"
3. Enter: `https://github.com/readyplayerme/rpm-unity-sdk.git`
4. Click "Add"

### 3. Install Flutter Unity Widget

Follow flutter_unity_widget integration guide:
https://github.com/juicycleff/flutter-unity-view-widget

### 4. Create Avatar Loader Script

Create `Assets/Scripts/AvatarLoader.cs`:

```csharp
using ReadyPlayerMe;
using UnityEngine;
using System;

public class AvatarLoader : MonoBehaviour
{
    public static AvatarLoader Instance { get; private set; }
    
    private GameObject currentAvatar;
    private Animator avatarAnimator;
    
    void Awake()
    {
        if (Instance == null)
        {
            Instance = this;
            DontDestroyOnLoad(gameObject);
        }
        else
        {
            Destroy(gameObject);
        }
    }
    
    public void LoadAvatar(string avatarUrl)
    {
        if (currentAvatar != null)
        {
            Destroy(currentAvatar);
        }
        
        var avatarLoader = new AvatarObjectLoader();
        avatarLoader.OnCompleted += OnAvatarLoaded;
        avatarLoader.OnFailed += OnAvatarFailed;
        avatarLoader.LoadAvatar(avatarUrl);
    }
    
    private void OnAvatarLoaded(object sender, CompletionEventArgs args)
    {
        currentAvatar = args.Avatar;
        currentAvatar.transform.SetParent(transform);
        currentAvatar.transform.localPosition = Vector3.zero;
        currentAvatar.transform.localRotation = Quaternion.identity;
        
        avatarAnimator = currentAvatar.GetComponent<Animator>();
        if (avatarAnimator == null)
        {
            avatarAnimator = currentAvatar.AddComponent<Animator>();
        }
        
        // Set up default idle animation
        TriggerEmotion("idle", "idle");
        
        Debug.Log("Avatar loaded successfully");
    }
    
    private void OnAvatarFailed(object sender, FailureEventArgs args)
    {
        Debug.LogError($"Failed to load avatar: {args.Message}");
    }
    
    public void TriggerEmotion(string emotion, string trigger)
    {
        if (avatarAnimator != null)
        {
            // Reset all triggers first
            avatarAnimator.ResetTrigger("smile");
            avatarAnimator.ResetTrigger("blush");
            avatarAnimator.ResetTrigger("frown");
            avatarAnimator.ResetTrigger("idle");
            avatarAnimator.ResetTrigger("happy_idle");
            avatarAnimator.ResetTrigger("sad_idle");
            avatarAnimator.ResetTrigger("surprised");
            
            // Set the requested trigger
            avatarAnimator.SetTrigger(trigger);
            
            Debug.Log($"Triggered emotion: {emotion} -> {trigger}");
        }
    }
}
```

### 5. Create Animator Controller

1. Create new Animator Controller: `Assets/Animators/AvatarAnimator.controller`
2. Add parameters:
   - `smile` (Trigger)
   - `blush` (Trigger)
   - `frown` (Trigger)
   - `idle` (Trigger)
   - `happy_idle` (Trigger)
   - `sad_idle` (Trigger)
   - `surprised` (Trigger)

3. Create animation states and transitions
4. Connect triggers to appropriate animations

### 6. Set Up Scene

1. Create empty GameObject: "AvatarManager"
2. Add `AvatarLoader` component
3. Set up lighting and camera
4. Configure for Flutter integration

### 7. Export for Flutter

Follow flutter_unity_widget export instructions for iOS.

## Emotion Triggers Reference

| Emotion | Trigger | Use Case |
|---------|--------|----------|
| Happy | `smile` | Positive responses |
| Love/Romantic | `blush` | Romantic interactions |
| Sad | `frown` | Negative responses |
| Neutral | `idle` | Default state |
| Happy Idle | `happy_idle` | Continuous happy state |
| Sad Idle | `sad_idle` | Continuous sad state |
| Surprised | `surprised` | Unexpected responses |

## Communication with Flutter

Unity receives messages from Flutter via `UnityWidget.postMessage()`:

```dart
// From Flutter
UnityWidget.postMessage('AvatarLoader', '{"action": "loadAvatar", "url": "https://..."}');
UnityWidget.postMessage('EmotionTrigger', '{"emotion": "happy", "trigger": "smile"}');
```

Unity sends messages to Flutter via `Application.ExternalCall()`:

```csharp
// From Unity
Application.ExternalCall("onUnityMessage", "avatarLoaded", avatarUrl);
```

## Build Settings

- Platform: iOS
- Target minimum: iOS 12.0+
- Architecture: ARM64
- Scripting Backend: IL2CPP
- API Compatibility: .NET Standard 2.1

## Notes

- Unity project should be kept separate from Flutter project
- Export Unity build to `ios/UnityLibrary/` or similar
- Follow flutter_unity_widget integration guide for exact setup
