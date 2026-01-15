#!/usr/bin/env python3
"""
Automated Genies Avatar Batch Creator
Creates multiple avatars programmatically using Genies API
"""

import requests
import json
import time
from typing import List, Dict, Optional

# Genies API Configuration
CLIENT_ID = 'client_01KEZDTFBTMCZTKT2ZYYEFRZ8D'
CLIENT_SECRET = '950cba732acd46c598c3f0d51454a2e7d0dfe6852a6a6d0921756187bb0cda37'
API_BASE_URL = 'https://api.genies.com'

# Avatar configurations with varied personalities and appearances
AVATAR_CONFIGS = [
    {
        'name': 'Sophia',
        'personality': 'warm',
        'description': 'A warm, caring personality with brown hair and hazel eyes',
        'traits': {
            'hair_color': 'brown',
            'hair_style': 'long_wavy',
            'eye_color': 'hazel',
            'skin_tone': 'medium',
            'outfit_style': 'casual_elegant',
        }
    },
    {
        'name': 'Emma',
        'personality': 'playful',
        'description': 'Playful and energetic with blonde hair and blue eyes',
        'traits': {
            'hair_color': 'blonde',
            'hair_style': 'short_bob',
            'eye_color': 'blue',
            'skin_tone': 'fair',
            'outfit_style': 'casual_cute',
        }
    },
    {
        'name': 'Olivia',
        'personality': 'sophisticated',
        'description': 'Sophisticated and elegant with black hair and brown eyes',
        'traits': {
            'hair_color': 'black',
            'hair_style': 'long_straight',
            'eye_color': 'brown',
            'skin_tone': 'olive',
            'outfit_style': 'formal',
        }
    },
    {
        'name': 'Ava',
        'personality': 'energetic',
        'description': 'Energetic and sporty with red hair and green eyes',
        'traits': {
            'hair_color': 'red',
            'hair_style': 'medium_curly',
            'eye_color': 'green',
            'skin_tone': 'fair',
            'outfit_style': 'sporty',
        }
    },
    {
        'name': 'Isabella',
        'personality': 'gentle',
        'description': 'Gentle and kind with brown hair and soft features',
        'traits': {
            'hair_color': 'brown',
            'hair_style': 'medium_wavy',
            'eye_color': 'brown',
            'skin_tone': 'medium',
            'outfit_style': 'bohemian',
        }
    },
    {
        'name': 'Mia',
        'personality': 'confident',
        'description': 'Confident and modern with black hair and dark eyes',
        'traits': {
            'hair_color': 'black',
            'hair_style': 'short_pixie',
            'eye_color': 'dark_brown',
            'skin_tone': 'tan',
            'outfit_style': 'modern_chic',
        }
    },
    {
        'name': 'Charlotte',
        'personality': 'creative',
        'description': 'Creative and artistic with auburn hair',
        'traits': {
            'hair_color': 'auburn',
            'hair_style': 'long_braided',
            'eye_color': 'hazel',
            'skin_tone': 'medium',
            'outfit_style': 'artistic',
        }
    },
    {
        'name': 'Amelia',
        'personality': 'adventurous',
        'description': 'Adventurous and outgoing with blonde hair',
        'traits': {
            'hair_color': 'blonde',
            'hair_style': 'medium_messy',
            'eye_color': 'blue',
            'skin_tone': 'fair',
            'outfit_style': 'outdoor',
        }
    },
    {
        'name': 'Harper',
        'personality': 'mysterious',
        'description': 'Mysterious and intriguing with dark features',
        'traits': {
            'hair_color': 'dark_brown',
            'hair_style': 'long_straight',
            'eye_color': 'brown',
            'skin_tone': 'olive',
            'outfit_style': 'edgy',
        }
    },
    {
        'name': 'Evelyn',
        'personality': 'elegant',
        'description': 'Elegant and refined with silver hair',
        'traits': {
            'hair_color': 'silver',
            'hair_style': 'short_bob',
            'eye_color': 'gray',
            'skin_tone': 'fair',
            'outfit_style': 'vintage',
        }
    },
]


class GeniesAvatarCreator:
    def __init__(self):
        self.access_token: Optional[str] = None
        self.token_expiry: Optional[float] = None
        self.session = requests.Session()

    def authenticate(self) -> bool:
        """Authenticate with Genies API and get access token"""
        print("🔐 Authenticating with Genies API...")
        
        try:
            response = self.session.post(
                f'{API_BASE_URL}/oauth/token',
                json={
                    'grant_type': 'client_credentials',
                    'client_id': CLIENT_ID,
                    'client_secret': CLIENT_SECRET,
                },
                headers={'Content-Type': 'application/json'},
                timeout=10
            )
            
            if response.status_code == 200:
                data = response.json()
                self.access_token = data.get('access_token')
                expires_in = data.get('expires_in', 3600)
                self.token_expiry = time.time() + expires_in - 60  # Refresh 1 min early
                print("✅ Authentication successful!")
                return True
            else:
                print(f"❌ Authentication failed: {response.status_code}")
                print(f"Response: {response.text}")
                return False
                
        except Exception as e:
            print(f"❌ Authentication error: {e}")
            return False

    def create_avatar(self, config: Dict) -> Optional[Dict]:
        """Create a single avatar using Genies API"""
        if not self.access_token or (self.token_expiry and time.time() >= self.token_expiry):
            if not self.authenticate():
                return None

        print(f"🎨 Creating avatar: {config['name']}...")

        # Try multiple possible API endpoints
        endpoints = [
            f'{API_BASE_URL}/v1/avatars',
            f'{API_BASE_URL}/api/v1/avatars',
            f'{API_BASE_URL}/avatars/create',
            f'{API_BASE_URL}/api/avatars',
            f'{API_BASE_URL}/v1/avatar/create',
        ]

        for endpoint in endpoints:
            try:
                payload = {
                    'name': config['name'],
                    'description': config.get('description', ''),
                    'personality': config.get('personality', 'friendly'),
                    'customization': config.get('traits', {}),
                }

                response = self.session.post(
                    endpoint,
                    json=payload,
                    headers={
                        'Authorization': f'Bearer {self.access_token}',
                        'Content-Type': 'application/json',
                    },
                    timeout=30
                )

                if response.status_code in [200, 201]:
                    avatar_data = response.json()
                    return {
                        'id': avatar_data.get('id', f"avatar_{config['name'].lower()}"),
                        'name': config['name'],
                        'url': (
                            avatar_data.get('glb_url') or
                            avatar_data.get('url') or
                            avatar_data.get('model_url') or
                            avatar_data.get('avatar_url') or
                            avatar_data.get('gltf_url') or
                            ''
                        ),
                        'thumbnailUrl': (
                            avatar_data.get('thumbnail_url') or
                            avatar_data.get('preview_url') or
                            avatar_data.get('image_url') or
                            avatar_data.get('preview') or
                            ''
                        ),
                        'personality': config.get('personality'),
                        'metadata': avatar_data,
                    }
                elif response.status_code == 404:
                    # Endpoint doesn't exist, try next
                    continue
                else:
                    print(f"  ⚠️  Endpoint {endpoint} returned {response.status_code}")
                    print(f"  Response: {response.text[:200]}")
                    continue

            except requests.exceptions.RequestException as e:
                print(f"  ⚠️  Error with {endpoint}: {e}")
                continue

        # If all endpoints failed, return placeholder
        print(f"  ⚠️  Could not create via API, using placeholder")
        return {
            'id': f"avatar_{config['name'].lower()}",
            'name': config['name'],
            'url': f"PLACEHOLDER_URL_{config['name']}",
            'thumbnailUrl': f"PLACEHOLDER_THUMBNAIL_{config['name']}",
            'personality': config.get('personality'),
            'needsManualEntry': True,
        }

    def create_batch(self, configs: List[Dict]) -> List[Dict]:
        """Create multiple avatars in batch"""
        if not self.authenticate():
            print("❌ Cannot proceed without authentication")
            return []

        print(f"\n🎨 Creating {len(configs)} avatars...\n")
        created_avatars = []

        for i, config in enumerate(configs, 1):
            print(f"[{i}/{len(configs)}] Processing {config['name']}...")
            avatar = self.create_avatar(config)
            if avatar:
                created_avatars.append(avatar)
                if avatar.get('needsManualEntry'):
                    print(f"  ⚠️  {config['name']} needs manual URL entry")
                else:
                    print(f"  ✅ {config['name']} created successfully!")
            time.sleep(1)  # Rate limiting

        return created_avatars


def generate_dart_code(avatars: List[Dict]) -> str:
    """Generate Dart code for avatar list"""
    lines = [
        "// Auto-generated avatar configurations",
        f"// Generated: {time.strftime('%Y-%m-%d %H:%M:%S')}",
        "",
        "import 'genies_avatar_service.dart';",
        "",
        "final List<GeniesAvatar> generatedPreselectedAvatars = [",
    ]

    for avatar in avatars:
        lines.append("  GeniesAvatar(")
        lines.append(f"    id: '{avatar['id']}',")
        lines.append(f"    url: '{avatar['url']}',")
        lines.append(f"    name: '{avatar['name']}',")
        if avatar.get('thumbnailUrl'):
            lines.append(f"    thumbnailUrl: '{avatar['thumbnailUrl']}',")
        if avatar.get('personality'):
            lines.append(f"    metadata: {{'personality': '{avatar['personality']}'}},")
        lines.append("  ),")

    lines.append("];")
    return "\n".join(lines)


def main():
    print("=" * 60)
    print("Genies Avatar Batch Creator")
    print("=" * 60)
    print()

    creator = GeniesAvatarCreator()
    created_avatars = creator.create_batch(AVATAR_CONFIGS)

    # Save results
    print("\n💾 Saving results...")
    
    # Save JSON
    with open('generated_avatars.json', 'w') as f:
        json.dump(created_avatars, f, indent=2)
    print("✅ Saved: generated_avatars.json")

    # Save Dart code
    dart_code = generate_dart_code(created_avatars)
    with open('generated_avatars.dart', 'w') as f:
        f.write(dart_code)
    print("✅ Saved: generated_avatars.dart")

    # Summary
    print("\n" + "=" * 60)
    print("Summary")
    print("=" * 60)
    print(f"Total avatars: {len(created_avatars)}")
    manual_needed = sum(1 for a in created_avatars if a.get('needsManualEntry'))
    if manual_needed > 0:
        print(f"⚠️  Manual entry needed: {manual_needed}")
        print("\nNext steps:")
        print("1. Check Genies API documentation for correct endpoints")
        print("2. Create avatars manually in Genies editor if needed")
        print("3. Update URLs in generated_avatars.dart")
    else:
        print("✅ All avatars created successfully!")
    print("=" * 60)


if __name__ == '__main__':
    main()
