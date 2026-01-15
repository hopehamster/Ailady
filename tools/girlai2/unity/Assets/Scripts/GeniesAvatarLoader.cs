using UnityEngine;
using System.Collections;

/// <summary>
/// Genies Avatar Loader for Unity
/// Loads Genies avatars using the Genies Unity SDK
/// </summary>
public class GeniesAvatarLoader : MonoBehaviour
{
    public static GeniesAvatarLoader Instance { get; private set; }
    
    private GameObject currentAvatar;
    private Animator avatarAnimator;
    
    // Genies SDK references (update with actual Genies SDK classes)
    // private GeniesSDK geniesSDK;
    
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
    
    void Start()
    {
        // Initialize Genies SDK
        // geniesSDK = new GeniesSDK();
        // geniesSDK.Initialize(clientId, clientSecret);
    }
    
    /// <summary>
    /// Load Genies avatar from URL or avatar ID
    /// </summary>
    public void LoadAvatar(string avatarUrlOrId)
    {
        if (currentAvatar != null)
        {
            Destroy(currentAvatar);
        }
        
        // Use Genies SDK to load avatar
        // Example (update with actual Genies SDK API):
        // geniesSDK.LoadAvatar(avatarUrlOrId, OnAvatarLoaded, OnAvatarFailed);
        
        // For now, placeholder implementation
        StartCoroutine(LoadAvatarCoroutine(avatarUrlOrId));
    }
    
    private IEnumerator LoadAvatarCoroutine(string avatarUrl)
    {
        // TODO: Replace with actual Genies SDK avatar loading
        // This is a placeholder - update with Genies SDK methods
        
        // Example Genies SDK usage:
        // var request = geniesSDK.CreateAvatarRequest(avatarUrl);
        // yield return request.Send();
        // 
        // if (request.isDone && request.error == null)
        // {
        //     OnAvatarLoaded(request.avatarGameObject);
        // }
        // else
        // {
        //     OnAvatarFailed(request.error);
        // }
        
        Debug.Log($"Loading Genies avatar: {avatarUrl}");
        yield return null;
    }
    
    private void OnAvatarLoaded(GameObject avatar)
    {
        currentAvatar = avatar;
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
        
        Debug.Log("Genies avatar loaded successfully");
    }
    
    private void OnAvatarFailed(string error)
    {
        Debug.LogError($"Failed to load Genies avatar: {error}");
    }
    
    /// <summary>
    /// Trigger emotion animation on avatar
    /// </summary>
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
    
    /// <summary>
    /// Receive message from Flutter
    /// </summary>
    public void OnFlutterMessage(string method, string message)
    {
        if (method == "loadAvatar")
        {
            // Parse message: {"action": "loadAvatar", "url": "..."}
            var data = JsonUtility.FromJson<AvatarLoadData>(message);
            LoadAvatar(data.url);
        }
        else if (method == "triggerEmotion")
        {
            // Parse message: {"emotion": "happy", "trigger": "smile"}
            var data = JsonUtility.FromJson<EmotionTriggerData>(message);
            TriggerEmotion(data.emotion, data.trigger);
        }
    }
    
    [System.Serializable]
    private class AvatarLoadData
    {
        public string action;
        public string url;
    }
    
    [System.Serializable]
    private class EmotionTriggerData
    {
        public string emotion;
        public string trigger;
    }
}
