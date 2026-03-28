import 'package:flutter/material.dart';

/// Type of ambient particle effect rendered in a room scene.
enum RoomParticleType {
  none,
  dustMotes,
  rainDrops,
  sparkles,
  bokeh,
  stars,
  circles,
  fogWisps,
  constellations,
}

/// Describes the visual atmosphere for a single mood state.
class RoomScene {
  final String id;

  /// GL clear color sent to native renderer (base room color).
  final Color glClearColor;

  /// Gradient overlay rendered in Flutter on top of the native view.
  /// From top to bottom. Use transparent alpha to let the GL color show.
  final List<Color> gradientColors;
  final List<double> gradientStops;

  /// Particle effect type and opacity.
  final RoomParticleType particleType;
  final double particleOpacity;

  /// Accent color used to tint particles.
  final Color particleColor;

  const RoomScene({
    required this.id,
    required this.glClearColor,
    required this.gradientColors,
    required this.gradientStops,
    this.particleType = RoomParticleType.none,
    this.particleOpacity = 0.3,
    this.particleColor = Colors.white,
  });
}

/// Maps a smoothed mood string to a room scene.
const Map<String, RoomScene> roomScenes = {
  'calm': RoomScene(
    id: 'calm',
    glClearColor:
        Color(0xFF2A2A4E), // Brighter navy so calm isn't mistaken for black
    gradientColors: [Colors.transparent, Colors.transparent],
    gradientStops: [0.0, 1.0],
    particleType: RoomParticleType.dustMotes,
    particleOpacity: 0.12,
    particleColor: Color(0xFFE0D8C8),
  ),
  'happy': RoomScene(
    id: 'happy',
    glClearColor: Color(0xFF2A1A0A),
    gradientColors: [
      Color(0x00FFB300),
      Color(0x18FFB300),
      Color(0x30FFB300),
    ],
    gradientStops: [0.0, 0.5, 1.0],
    particleType: RoomParticleType.dustMotes,
    particleOpacity: 0.28,
    particleColor: Color(0xFFFFD54F),
  ),
  'sad': RoomScene(
    id: 'sad',
    glClearColor: Color(0xFF0A1220),
    gradientColors: [
      Color(0x001565C0),
      Color(0x141565C0),
      Color(0x281565C0),
    ],
    gradientStops: [0.0, 0.4, 1.0],
    particleType: RoomParticleType.rainDrops,
    particleOpacity: 0.22,
    particleColor: Color(0xFF90CAF9),
  ),
  'excited': RoomScene(
    id: 'excited',
    glClearColor: Color(0xFF2A0A18),
    gradientColors: [
      Color(0x00E91E63),
      Color(0x14E91E63),
      Color(0x28E91E63),
    ],
    gradientStops: [0.0, 0.5, 1.0],
    particleType: RoomParticleType.sparkles,
    particleOpacity: 0.32,
    particleColor: Color(0xFFF48FB1),
  ),
  'romantic': RoomScene(
    id: 'romantic',
    glClearColor: Color(0xFF240A16),
    gradientColors: [
      Color(0x00F06292),
      Color(0x0CF06292),
      Color(0x24F06292),
    ],
    gradientStops: [0.0, 0.6, 1.0],
    particleType: RoomParticleType.bokeh,
    particleOpacity: 0.26,
    particleColor: Color(0xFFF48FB1),
  ),
  'thoughtful': RoomScene(
    id: 'thoughtful',
    glClearColor: Color(0xFF0E0A24),
    gradientColors: [
      Color(0x003949AB),
      Color(0x103949AB),
      Color(0x203949AB),
    ],
    gradientStops: [0.0, 0.5, 1.0],
    particleType: RoomParticleType.stars,
    particleOpacity: 0.20,
    particleColor: Color(0xFFC5CAE9),
  ),
  'playful': RoomScene(
    id: 'playful',
    glClearColor: Color(0xFF1A0A24),
    gradientColors: [
      Color(0x009C27B0),
      Color(0x109C27B0),
      Color(0x209C27B0),
    ],
    gradientStops: [0.0, 0.5, 1.0],
    particleType: RoomParticleType.circles,
    particleOpacity: 0.24,
    particleColor: Color(0xFFCE93D8),
  ),
  'curious': RoomScene(
    id: 'curious',
    glClearColor: Color(0xFF0A1818),
    gradientColors: [
      Color(0x0000897B),
      Color(0x1000897B),
      Color(0x2000897B),
    ],
    gradientStops: [0.0, 0.5, 1.0],
    particleType: RoomParticleType.constellations,
    particleOpacity: 0.22,
    particleColor: Color(0xFF80CBC4),
  ),
  'anxious': RoomScene(
    id: 'anxious',
    glClearColor: Color(0xFF141618),
    gradientColors: [
      Color(0x00455A64),
      Color(0x14455A64),
      Color(0x28455A64),
    ],
    gradientStops: [0.0, 0.5, 1.0],
    particleType: RoomParticleType.fogWisps,
    particleOpacity: 0.18,
    particleColor: Color(0xFFB0BEC5),
  ),
  'shy': RoomScene(
    id: 'shy',
    glClearColor: Color(0xFF1E0A12),
    gradientColors: [
      Color(0x00EC407A),
      Color(0x0CEC407A),
      Color(0x1CEC407A),
    ],
    gradientStops: [0.0, 0.6, 1.0],
    particleType: RoomParticleType.bokeh,
    particleOpacity: 0.20,
    particleColor: Color(0xFFF8BBD0),
  ),
  'tender': RoomScene(
    id: 'tender',
    glClearColor: Color(0xFF180A20),
    gradientColors: [
      Color(0x007B1FA2),
      Color(0x0C7B1FA2),
      Color(0x1C7B1FA2),
    ],
    gradientStops: [0.0, 0.5, 1.0],
    particleType: RoomParticleType.dustMotes,
    particleOpacity: 0.18,
    particleColor: Color(0xFFD1C4E9),
  ),
};

/// Maps fine-grained emotion strings from ChatService to room mood keys.
String emotionToRoomMood(String emotion) {
  switch (emotion.toLowerCase().trim()) {
    case 'happy':
    case 'joyful':
    case 'cheerful':
      return 'happy';
    case 'excited':
    case 'elated':
      return 'excited';
    case 'romantic':
    case 'loving':
    case 'affectionate':
      return 'romantic';
    case 'playful':
    case 'flirty':
      return 'playful';
    case 'sad':
    case 'melancholy':
    case 'upset':
      return 'sad';
    case 'thoughtful':
    case 'pensive':
    case 'reflective':
      return 'thoughtful';
    case 'shy':
    case 'bashful':
      return 'shy';
    case 'curious':
    case 'intrigued':
      return 'curious';
    case 'anxious':
    case 'nervous':
      return 'anxious';
    case 'tender':
    case 'gentle':
      return 'tender';
    case 'passionate':
    case 'intense':
      return 'excited';
    case 'proud':
    case 'caring':
    case 'comforting':
      return 'happy';
    default:
      return 'calm';
  }
}

/// Look up the room scene for a mood key, defaulting to 'calm'.
RoomScene getRoomScene(String roomMood) {
  return roomScenes[roomMood] ?? roomScenes['calm']!;
}
