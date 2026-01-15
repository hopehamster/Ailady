using UnityEngine;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using Newtonsoft.Json;
// using Genies.Sdk; // Uncomment when Genies SDK is integrated

/// <summary>
/// Automated Avatar Batch Creator for Unity
/// Creates 6-10 preset avatars programmatically using Genies SDK
/// </summary>
public class AvatarBatchCreator : MonoBehaviour
{
    [Header("Genies Configuration")]
    [SerializeField] private string clientId = "client_01KEZDTFBTMCZTKT2ZYYEFRZ8D";
    [SerializeField] private string clientSecret = "950cba732acd46c598c3f0d51454a2e7d0dfe6852a6a6d0921756187bb0cda37";

    [Header("Avatar Configurations")]
    [SerializeField] private List<AvatarConfig> avatarConfigs = new List<AvatarConfig>
    {
        new AvatarConfig { name = "Sophia", personality = "warm", hairColor = "brown", hairStyle = "long_wavy", eyeColor = "hazel", skinTone = "medium", outfit = "casual_elegant" },
        new AvatarConfig { name = "Emma", personality = "playful", hairColor = "blonde", hairStyle = "short_bob", eyeColor = "blue", skinTone = "fair", outfit = "casual_cute" },
        new AvatarConfig { name = "Olivia", personality = "sophisticated", hairColor = "black", hairStyle = "long_straight", eyeColor = "brown", skinTone = "olive", outfit = "formal" },
        new AvatarConfig { name = "Ava", personality = "energetic", hairColor = "red", hairStyle = "medium_curly", eyeColor = "green", skinTone = "fair", outfit = "sporty" },
        new AvatarConfig { name = "Isabella", personality = "gentle", hairColor = "brown", hairStyle = "medium_wavy", eyeColor = "brown", skinTone = "medium", outfit = "bohemian" },
        new AvatarConfig { name = "Mia", personality = "confident", hairColor = "black", hairStyle = "short_pixie", eyeColor = "dark_brown", skinTone = "tan", outfit = "modern_chic" },
        new AvatarConfig { name = "Charlotte", personality = "creative", hairColor = "auburn", hairStyle = "long_braided", eyeColor = "hazel", skinTone = "medium", outfit = "artistic" },
        new AvatarConfig { name = "Amelia", personality = "adventurous", hairColor = "blonde", hairStyle = "medium_messy", eyeColor = "blue", skinTone = "fair", outfit = "outdoor" },
        new AvatarConfig { name = "Harper", personality = "mysterious", hairColor = "dark_brown", hairStyle = "long_straight", eyeColor = "brown", skinTone = "olive", outfit = "edgy" },
        new AvatarConfig { name = "Evelyn", personality = "elegant", hairColor = "silver", hairStyle = "short_bob", eyeColor = "gray", skinTone = "fair", outfit = "vintage" },
    };

    [Header("Output Settings")]
    [SerializeField] private string outputPath = "Assets/GeneratedAvatars/";
    [SerializeField] private bool autoCreateOnStart = false;

    private List<CreatedAvatar> createdAvatars = new List<CreatedAvatar>();

    [System.Serializable]
    public class AvatarConfig
    {
        public string name;
        public string personality;
        public string hairColor;
        public string hairStyle;
        public string eyeColor;
        public string skinTone;
        public string outfit;
    }

    [System.Serializable]
    public class CreatedAvatar
    {
        public string id;
        public string name;
        public string url;
        public string thumbnailUrl;
        public string personality;
        public Dictionary<string, object> metadata = new Dictionary<string, object>();
    }

    void Start()
    {
        if (autoCreateOnStart)
        {
            StartCoroutine(CreateAllAvatarsCoroutine());
        }
    }

    /// <summary>
    /// Create all avatars programmatically
    /// </summary>
    [ContextMenu("Create All Avatars")]
    public void CreateAllAvatars()
    {
        StartCoroutine(CreateAllAvatarsCoroutine());
    }

    private IEnumerator CreateAllAvatarsCoroutine()
    {
        Debug.Log("🎨 Starting automated avatar creation...");
        Debug.Log($"Creating {avatarConfigs.Count} avatars...\n");

        // Initialize Genies SDK
        // Uncomment when Genies SDK is integrated:
        // Genies.Sdk.AvatarSdk.Initialize(clientId, clientSecret);
        // yield return new WaitUntil(() => Genies.Sdk.AvatarSdk.IsInitialized);

        for (int i = 0; i < avatarConfigs.Count; i++)
        {
            var config = avatarConfigs[i];
            Debug.Log($"[{i + 1}/{avatarConfigs.Count}] Creating: {config.name}...");

            yield return StartCoroutine(CreateAvatarCoroutine(config));
        }

        // Save results
        SaveResults();

        Debug.Log("\n✅ Avatar creation complete!");
        Debug.Log($"Created {createdAvatars.Count} avatars");
        Debug.Log($"Results saved to: {outputPath}");
    }

    private IEnumerator CreateAvatarCoroutine(AvatarConfig config)
    {
        // Method 1: Use Genies SDK Avatar Editor programmatically
        // This opens the editor, applies customization, and saves
        
        // Uncomment when Genies SDK is integrated:
        /*
        // Create a new ManagedAvatar
        var avatar = Genies.Sdk.AvatarSdk.CreateAvatar();
        
        // Open editor with customization
        await Genies.Sdk.AvatarSdk.OpenAvatarEditorAsync(avatar);
        
        // Apply customization programmatically
        // Note: Actual API may differ - check Genies SDK docs
        avatar.SetHairColor(config.hairColor);
        avatar.SetHairStyle(config.hairStyle);
        avatar.SetEyeColor(config.eyeColor);
        avatar.SetSkinTone(config.skinTone);
        avatar.SetOutfit(config.outfit);
        
        // Save avatar
        await Genies.Sdk.AvatarSdk.SetEditorSaveRemotelyAndExitAsync();
        
        // Get avatar URL
        string avatarUrl = avatar.GetGlbUrl();
        string thumbnailUrl = avatar.GetThumbnailUrl();
        */

        // For now, create placeholder structure
        // Replace with actual Genies SDK calls above
        var createdAvatar = new CreatedAvatar
        {
            id = $"avatar_{config.name.ToLower()}",
            name = config.name,
            url = $"PLACEHOLDER_URL_{config.name}", // Replace with actual URL
            thumbnailUrl = $"PLACEHOLDER_THUMBNAIL_{config.name}", // Replace with actual URL
            personality = config.personality,
            metadata = new Dictionary<string, object>
            {
                { "hairColor", config.hairColor },
                { "hairStyle", config.hairStyle },
                { "eyeColor", config.eyeColor },
                { "skinTone", config.skinTone },
                { "outfit", config.outfit },
            }
        };

        createdAvatars.Add(createdAvatar);
        Debug.Log($"  ✅ {config.name} created (placeholder - update with actual Genies SDK)");

        yield return null;
    }

    /// <summary>
    /// Save created avatars to JSON and generate Dart code
    /// </summary>
    private void SaveResults()
    {
        // Ensure output directory exists
        if (!Directory.Exists(outputPath))
        {
            Directory.CreateDirectory(outputPath);
        }

        // Save JSON
        string jsonPath = Path.Combine(outputPath, "generated_avatars.json");
        string json = JsonConvert.SerializeObject(createdAvatars, Formatting.Indented);
        File.WriteAllText(jsonPath, json);
        Debug.Log($"💾 Saved JSON: {jsonPath}");

        // Generate Dart code
        string dartCode = GenerateDartCode();
        string dartPath = Path.Combine(outputPath, "generated_avatars.dart");
        File.WriteAllText(dartPath, dartCode);
        Debug.Log($"💾 Saved Dart: {dartPath}");
    }

    private string GenerateDartCode()
    {
        var code = new System.Text.StringBuilder();
        code.AppendLine("// Auto-generated avatar configurations");
        code.AppendLine($"// Generated: {System.DateTime.Now:yyyy-MM-dd HH:mm:ss}");
        code.AppendLine("");
        code.AppendLine("import 'genies_avatar_service.dart';");
        code.AppendLine("");
        code.AppendLine("final List<GeniesAvatar> generatedPreselectedAvatars = [");

        foreach (var avatar in createdAvatars)
        {
            code.AppendLine("  GeniesAvatar(");
            code.AppendLine($"    id: '{avatar.id}',");
            code.AppendLine($"    url: '{avatar.url}',");
            code.AppendLine($"    name: '{avatar.name}',");
            if (!string.IsNullOrEmpty(avatar.thumbnailUrl))
            {
                code.AppendLine($"    thumbnailUrl: '{avatar.thumbnailUrl}',");
            }
            if (!string.IsNullOrEmpty(avatar.personality))
            {
                code.AppendLine($"    metadata: {{'personality': '{avatar.personality}'}},");
            }
            code.AppendLine("  ),");
        }

        code.AppendLine("];");
        return code.ToString();
    }

    /// <summary>
    /// Test creating a single avatar
    /// </summary>
    [ContextMenu("Test Create Single Avatar")]
    public void TestCreateSingle()
    {
        if (avatarConfigs.Count > 0)
        {
            StartCoroutine(CreateAvatarCoroutine(avatarConfigs[0]));
        }
    }
}
