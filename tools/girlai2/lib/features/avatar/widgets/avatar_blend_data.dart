/// Live2D blend-shape parameter ranges for idle vs speaking poses.
///
/// Extracted from avatar_view.dart as L11 quick-win (`melodic-fluttering-flame.md`
/// L11 item #6). The full widget split (L9) will extract the remaining pose +
/// viseme + gesture logic; this file is the first step.
///
/// Range values are per-parameter MAX amplitudes used by the idle animation
/// system. Higher = more movement of that parameter during random idle pose
/// updates. Parameter names match the Live2D model's parameter IDs.
library;

const Map<String, double> kAvatarIdlePoseRange = <String, double>{
  'Param28': 0.54, // Arm 1
  'Param29': 0.50, // Arm 2
  'Param42': 0.20, // Body 1
  'Param43': 0.20, // Body 2
  'Param23': 0.09, // Cloth X1
  'Param24': 0.08, // Cloth X2
  'Param25': 0.08, // Cloth X3
  'Param26': 0.09, // Cloth Y1
  'Param27': 0.08, // Cloth Y2
  'Param11': 0.08, // Front Hair X1
  'Param12': 0.08, // Front Hair X2
  'Param13': 0.08, // Front Hair X3
  'Param14': 0.06, // Front Hair Y1
  'Param15': 0.06, // Front Hair Y2
  'Param16': 0.08, // Side Hair X1
  'Param17': 0.08, // Side Hair X2
  'Param18': 0.08, // Side Hair X3
  'Param19': 0.06, // Side Hair Y1
  'Param20': 0.06, // Side Hair Y2
  'Param34': 0.10, // Ear rotation / accessory accent
  'HandLeftAngleX': 0.34,
  'HandRightAngleX': 0.34,
  'HandLeftAngleZ': 0.30,
  'HandRightAngleZ': 0.30,
  'HandLeftOpen': 0.20,
  'HandRightOpen': 0.20,
  'ParamAngleZ': 1.8,
  'ParamBodyAngleY': 1.15,
  'ParamBodyAngleZ': 1.15,
};

const Map<String, double> kAvatarSpeakingPoseRange = <String, double>{
  'Param28': 0.92,
  'Param29': 0.86,
  'Param42': 0.34,
  'Param43': 0.34,
  'Param23': 0.10,
  'Param24': 0.10,
  'Param25': 0.10,
  'Param26': 0.10,
  'Param27': 0.10,
  'Param11': 0.12,
  'Param12': 0.12,
  'Param13': 0.12,
  'Param14': 0.09,
  'Param15': 0.09,
  'Param16': 0.11,
  'Param17': 0.11,
  'Param18': 0.11,
  'Param19': 0.08,
  'Param20': 0.08,
  'Param34': 0.14,
  'HandLeftAngleX': 0.52,
  'HandRightAngleX': 0.52,
  'HandLeftAngleZ': 0.44,
  'HandRightAngleZ': 0.44,
  'HandLeftOpen': 0.36,
  'HandRightOpen': 0.36,
  'ParamAngleZ': 1.3,
  'ParamBodyAngleY': 0.95,
  'ParamBodyAngleZ': 0.95,
};
