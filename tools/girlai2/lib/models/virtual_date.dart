enum VirtualDateActivity {
  movieNight,
  cooking,
  workout,
  stargazing,
  gameNight,
  beachWalk,
}

extension VirtualDateActivityX on VirtualDateActivity {
  String get serverValue {
    switch (this) {
      case VirtualDateActivity.movieNight:  return 'movie_night';
      case VirtualDateActivity.cooking:     return 'cooking';
      case VirtualDateActivity.workout:     return 'workout';
      case VirtualDateActivity.stargazing:  return 'stargazing';
      case VirtualDateActivity.gameNight:   return 'game_night';
      case VirtualDateActivity.beachWalk:   return 'beach_walk';
    }
  }

  String get label {
    switch (this) {
      case VirtualDateActivity.movieNight:  return 'Movie Night';
      case VirtualDateActivity.cooking:     return 'Cooking Together';
      case VirtualDateActivity.workout:     return 'Workout Session';
      case VirtualDateActivity.stargazing:  return 'Stargazing';
      case VirtualDateActivity.gameNight:   return 'Game Night';
      case VirtualDateActivity.beachWalk:   return 'Beach Walk';
    }
  }

  String get emoji {
    switch (this) {
      case VirtualDateActivity.movieNight:  return '🎬';
      case VirtualDateActivity.cooking:     return '🍳';
      case VirtualDateActivity.workout:     return '💪';
      case VirtualDateActivity.stargazing:  return '🌠';
      case VirtualDateActivity.gameNight:   return '🎮';
      case VirtualDateActivity.beachWalk:   return '🏖️';
    }
  }

  int get colorValue {
    switch (this) {
      case VirtualDateActivity.movieNight:  return 0xFF1A1A2E;
      case VirtualDateActivity.cooking:     return 0xFFFF6B35;
      case VirtualDateActivity.workout:     return 0xFF2D6A4F;
      case VirtualDateActivity.stargazing:  return 0xFF0D0D2B;
      case VirtualDateActivity.gameNight:   return 0xFF7B2FBE;
      case VirtualDateActivity.beachWalk:   return 0xFF0077B6;
    }
  }

  static VirtualDateActivity fromServerValue(String s) {
    switch (s) {
      case 'cooking':     return VirtualDateActivity.cooking;
      case 'workout':     return VirtualDateActivity.workout;
      case 'stargazing':  return VirtualDateActivity.stargazing;
      case 'game_night':  return VirtualDateActivity.gameNight;
      case 'beach_walk':  return VirtualDateActivity.beachWalk;
      default:            return VirtualDateActivity.movieNight;
    }
  }
}

class VirtualDateSession {
  final VirtualDateActivity activity;
  final bool active;

  const VirtualDateSession({required this.activity, required this.active});
}
