/// Snapshot of the user's physical environment at the time of a chat turn.
///
/// Populated by [ContextService] and injected into every LLM request so Aria
/// can make naturally grounded references to time, place, and weather without
/// feeling like she is surveilling the user.
class UserEnvironmentContext {
  /// Approximate city name (never exact coordinates).
  final String? city;

  /// State / region / country suffix — e.g. "TN, US".
  final String? region;

  /// Current temperature in Celsius.
  final double? tempC;

  /// Human-readable weather description — e.g. "partly cloudy".
  final String? weatherDescription;

  /// WMO weather interpretation code (0–99).
  final int? weatherCode;

  /// True when the weather is precipitation of any kind.
  final bool isPrecipitating;

  /// True when temperature is below 10 °C or above 35 °C.
  final bool isExtremeTemp;

  /// Device local time at the moment of capture.
  final DateTime localTime;

  const UserEnvironmentContext({
    this.city,
    this.region,
    this.tempC,
    this.weatherDescription,
    this.weatherCode,
    required this.isPrecipitating,
    required this.isExtremeTemp,
    required this.localTime,
  });

  /// Serialised form sent to the Cloud Function.
  Map<String, dynamic> toMap() => {
        if (city != null) 'city': city,
        if (region != null) 'region': region,
        if (tempC != null) 'tempC': tempC,
        if (weatherDescription != null) 'weatherDesc': weatherDescription,
        'isPrecipitating': isPrecipitating,
        'isExtremeTemp': isExtremeTemp,
        'localTimeIso': localTime.toIso8601String(),
        'localHour': localTime.hour,
        'localDayOfWeek': _dayName(localTime.weekday),
      };

  static String _dayName(int weekday) => const [
        '',
        'Monday',
        'Tuesday',
        'Wednesday',
        'Thursday',
        'Friday',
        'Saturday',
        'Sunday',
      ][weekday];

  /// Friendly temperature string — e.g. "18 °C / 64 °F".
  String get tempFormatted {
    if (tempC == null) return 'unknown';
    final f = tempC! * 9 / 5 + 32;
    return '${tempC!.round()} \u00b0C / ${f.round()} \u00b0F';
  }
}
