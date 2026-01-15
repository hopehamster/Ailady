/// Automated Avatar Generation Script
/// 
/// This script programmatically creates 6-10 preset avatars
/// using Genies API with varied configurations
import 'dart:convert';
import 'dart:io';
import 'package:dio/dio.dart';

// Import Genies config (adjust path as needed)
// For now, we'll use direct values
const String clientId = 'client_01KEZDTFBTMCZTKT2ZYYEFRZ8D';
const String clientSecret = '950cba732acd46c598c3f0d51454a2e7d0dfe6852a6a6d0921756187bb0cda37';
const String apiBaseUrl = 'https://api.genies.com';

/// Avatar name and personality configurations
final List<Map<String, dynamic>> avatarConfigs = [
  {
    'name': 'Sophia',
    'personality': 'warm',
    'hairColor': 'brown',
    'hairStyle': 'long_wavy',
    'eyeColor': 'hazel',
    'skinTone': 'medium',
    'outfit': 'casual_elegant',
  },
  {
    'name': 'Emma',
    'personality': 'playful',
    'hairColor': 'blonde',
    'hairStyle': 'short_bob',
    'eyeColor': 'blue',
    'skinTone': 'fair',
    'outfit': 'casual_cute',
  },
  {
    'name': 'Olivia',
    'personality': 'sophisticated',
    'hairColor': 'black',
    'hairStyle': 'long_straight',
    'eyeColor': 'brown',
    'skinTone': 'olive',
    'outfit': 'formal',
  },
  {
    'name': 'Ava',
    'personality': 'energetic',
    'hairColor': 'red',
    'hairStyle': 'medium_curly',
    'eyeColor': 'green',
    'skinTone': 'fair',
    'outfit': 'sporty',
  },
  {
    'name': 'Isabella',
    'personality': 'gentle',
    'hairColor': 'brown',
    'hairStyle': 'medium_wavy',
    'eyeColor': 'brown',
    'skinTone': 'medium',
    'outfit': 'bohemian',
  },
  {
    'name': 'Mia',
    'personality': 'confident',
    'hairColor': 'black',
    'hairStyle': 'short_pixie',
    'eyeColor': 'dark_brown',
    'skinTone': 'tan',
    'outfit': 'modern_chic',
  },
  {
    'name': 'Charlotte',
    'personality': 'creative',
    'hairColor': 'auburn',
    'hairStyle': 'long_braided',
    'eyeColor': 'hazel',
    'skinTone': 'medium',
    'outfit': 'artistic',
  },
  {
    'name': 'Amelia',
    'personality': 'adventurous',
    'hairColor': 'blonde',
    'hairStyle': 'medium_messy',
    'eyeColor': 'blue',
    'skinTone': 'fair',
    'outfit': 'outdoor',
  },
  {
    'name': 'Harper',
    'personality': 'mysterious',
    'hairColor': 'dark_brown',
    'hairStyle': 'long_straight',
    'eyeColor': 'brown',
    'skinTone': 'olive',
    'outfit': 'edgy',
  },
  {
    'name': 'Evelyn',
    'personality': 'elegant',
    'hairColor': 'silver',
    'hairStyle': 'short_bob',
    'eyeColor': 'gray',
    'skinTone': 'fair',
    'outfit': 'vintage',
  },
];

/// Generate avatars using Genies API
Future<void> generateAvatars() async {
  final dio = Dio();
  String? accessToken;

  // Step 1: Authenticate
  print('🔐 Authenticating with Genies API...');
  try {
    final authResponse = await dio.post(
      '$apiBaseUrl/oauth/token',
      options: Options(
        headers: {
          'Content-Type': 'application/json',
        },
      ),
      data: {
        'grant_type': 'client_credentials',
        'client_id': clientId,
        'client_secret': clientSecret,
      },
    );

    if (authResponse.statusCode == 200) {
      accessToken = authResponse.data['access_token'];
      print('✅ Authentication successful!');
    } else {
      print('❌ Authentication failed: ${authResponse.statusCode}');
      return;
    }
  } catch (e) {
    print('❌ Authentication error: $e');
    print('💡 Trying alternative authentication methods...');
    // Try alternative auth if needed
    return;
  }

  // Step 2: Create avatars
  print('\n🎨 Creating ${avatarConfigs.length} avatars...\n');
  
  final List<Map<String, dynamic>> createdAvatars = [];

  for (int i = 0; i < avatarConfigs.length; i++) {
    final config = avatarConfigs[i];
    print('Creating avatar ${i + 1}/${avatarConfigs.length}: ${config['name']}...');

    try {
      // Try multiple API endpoint variations
      final endpoints = [
        '$apiBaseUrl/v1/avatars',
        '$apiBaseUrl/api/v1/avatars',
        '$apiBaseUrl/avatars/create',
        '$apiBaseUrl/api/avatars',
      ];

      bool success = false;
      for (final endpoint in endpoints) {
        try {
          final response = await dio.post(
            endpoint,
            options: Options(
              headers: {
                'Authorization': 'Bearer $accessToken',
                'Content-Type': 'application/json',
              },
            ),
            data: {
              'name': config['name'],
              'personality': config['personality'],
              'customization': {
                'hair': {
                  'color': config['hairColor'],
                  'style': config['hairStyle'],
                },
                'eyes': {
                  'color': config['eyeColor'],
                },
                'skin': {
                  'tone': config['skinTone'],
                },
                'outfit': config['outfit'],
              },
            },
          );

          if (response.statusCode == 200 || response.statusCode == 201) {
            final avatarData = response.data;
            createdAvatars.add({
              'id': avatarData['id'] ?? 'avatar_${i + 1}',
              'name': config['name'],
              'url': avatarData['glb_url'] ?? 
                     avatarData['url'] ?? 
                     avatarData['model_url'] ?? 
                     avatarData['avatar_url'] ?? '',
              'thumbnailUrl': avatarData['thumbnail_url'] ?? 
                             avatarData['preview_url'] ?? 
                             avatarData['image_url'] ?? '',
              'personality': config['personality'],
            });
            print('  ✅ ${config['name']} created successfully!');
            success = true;
            break;
          }
        } catch (e) {
          // Try next endpoint
          continue;
        }
      }

      if (!success) {
        print('  ⚠️  ${config['name']} - API endpoint not found, using placeholder');
        // Create placeholder for manual entry
        createdAvatars.add({
          'id': 'avatar_${i + 1}',
          'name': config['name'],
          'url': 'PLACEHOLDER_URL_${i + 1}',
          'thumbnailUrl': 'PLACEHOLDER_THUMBNAIL_${i + 1}',
          'personality': config['personality'],
          'needsManualEntry': true,
        });
      }
    } catch (e) {
      print('  ❌ Error creating ${config['name']}: $e');
    }
  }

  // Step 3: Save results
  print('\n💾 Saving avatar configurations...');
  final outputFile = File('lib/features/avatar/services/generated_avatars.json');
  await outputFile.create(recursive: true);
  await outputFile.writeAsString(
    JsonEncoder.withIndent('  ').convert(createdAvatars),
  );

  // Step 4: Generate Dart code
  print('📝 Generating Dart code...');
  final dartCode = generateDartCode(createdAvatars);
  final dartFile = File('lib/features/avatar/services/generated_avatars.dart');
  await dartFile.writeAsString(dartCode);

  print('\n✅ Avatar generation complete!');
  print('📁 Results saved to:');
  print('   - generated_avatars.json');
  print('   - generated_avatars.dart');
  print('\n📋 Next steps:');
  print('   1. Review generated_avatars.json');
  print('   2. If any avatars have PLACEHOLDER_URL, create them manually in Genies');
  print('   3. Update URLs in generated_avatars.dart');
  print('   4. Import into GeniesAvatarService');
}

/// Generate Dart code for avatar list
String generateDartCode(List<Map<String, dynamic>> avatars) {
  final buffer = StringBuffer();
  buffer.writeln('// Auto-generated avatar configurations');
  buffer.writeln('// Generated: ${DateTime.now().toIso8601String()}');
  buffer.writeln('');
  buffer.writeln('import \'genies_avatar_service.dart\';');
  buffer.writeln('');
  buffer.writeln('final List<GeniesAvatar> generatedPreselectedAvatars = [');
  
  for (final avatar in avatars) {
    buffer.writeln('  GeniesAvatar(');
    buffer.writeln('    id: \'${avatar['id']}\',');
    buffer.writeln('    url: \'${avatar['url']}\',');
    buffer.writeln('    name: \'${avatar['name']}\',');
    if (avatar['thumbnailUrl'] != null) {
      buffer.writeln('    thumbnailUrl: \'${avatar['thumbnailUrl']}\',');
    }
    if (avatar['personality'] != null) {
      buffer.writeln('    metadata: {\'personality\': \'${avatar['personality']}\'},');
    }
    buffer.writeln('  ),');
  }
  
  buffer.writeln('];');
  return buffer.toString();
}

/// Main entry point
void main() async {
  await generateAvatars();
}
