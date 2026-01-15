# Automated Avatar Generation

## Overview

We've created automated scripts to generate 6-10 preset avatars programmatically using the Genies API. This leverages automation to speed up development.

## Scripts Available

### 1. Python Script (Recommended)
**File**: `scripts/avatar_batch_creator.py`

**Usage**:
```bash
cd tools/girlai2/scripts
python3 avatar_batch_creator.py
```

**What it does**:
- Authenticates with Genies API using your credentials
- Creates 10 avatars with varied personalities and appearances
- Generates JSON and Dart code files
- Handles errors and fallbacks gracefully

### 2. Dart Script
**File**: `scripts/generate_avatars.dart`

**Usage**:
```bash
cd tools/girlai2
dart run scripts/generate_avatars.dart
```

**What it does**:
- Same functionality as Python script
- Written in Dart for consistency with Flutter codebase

## Avatar Configurations

The scripts create 10 diverse avatars:

1. **Sophia** - Warm, caring (brown hair, hazel eyes)
2. **Emma** - Playful, energetic (blonde, blue eyes)
3. **Olivia** - Sophisticated, elegant (black hair, brown eyes)
4. **Ava** - Energetic, sporty (red hair, green eyes)
5. **Isabella** - Gentle, kind (brown hair, soft features)
6. **Mia** - Confident, modern (black hair, dark eyes)
7. **Charlotte** - Creative, artistic (auburn hair)
8. **Amelia** - Adventurous, outgoing (blonde hair)
9. **Harper** - Mysterious, intriguing (dark features)
10. **Evelyn** - Elegant, refined (silver hair)

## Output Files

After running the scripts, you'll get:

1. **`generated_avatars.json`** - JSON data with all avatar info
2. **`generated_avatars.dart`** - Ready-to-use Dart code

## Integration Steps

### Step 1: Run the Script

```bash
cd tools/girlai2/scripts
python3 avatar_batch_creator.py
```

### Step 2: Review Results

Check `generated_avatars.json` to see:
- Which avatars were created successfully
- Which need manual URL entry
- Avatar IDs and URLs

### Step 3: Handle Placeholders

If any avatars have `PLACEHOLDER_URL`:
- Check Genies API documentation for correct endpoints
- Or create avatars manually in Genies editor
- Update URLs in the generated files

### Step 4: Import into Service

Copy the generated code into `GeniesAvatarService`:

```dart
// In lib/features/avatar/services/genies_avatar_service.dart
import 'generated_avatars.dart';

// Replace _preselectedAvatars with:
static final List<GeniesAvatar> _preselectedAvatars = generatedPreselectedAvatars;
```

## Alternative: Browser Automation

If API endpoints don't work, we can:

1. **Use browser automation** to access Genies web editor
2. **Automate avatar creation** via web interface
3. **Extract avatar URLs** programmatically

## Troubleshooting

### Authentication Fails
- Verify credentials in `genies_config.dart`
- Check Genies API documentation for auth endpoint
- Try different authentication methods

### API Endpoints Not Found
- Check Genies API docs: https://docs.genies.com/
- Try Unity SDK instead of API
- Use web editor as fallback

### No Avatar URLs Returned
- Genies may require manual creation
- Use Unity SDK avatar editor
- Or use web browser automation

## Next Steps

1. ✅ Run the script
2. ✅ Review generated avatars
3. ✅ Fix any placeholders
4. ✅ Import into service
5. ✅ Test in Unity

## Creative Solutions

If Genies API doesn't support programmatic creation:

1. **Unity SDK Automation**: Use Unity SDK to create avatars programmatically
2. **Browser Automation**: Automate web editor using Selenium/Playwright
3. **Template System**: Create avatar templates and customize programmatically
4. **Hybrid Approach**: Combine API + manual creation for best results

Let's leverage automation to move fast! 🚀
