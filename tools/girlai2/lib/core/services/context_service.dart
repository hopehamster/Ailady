import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:geolocator/geolocator.dart';
import 'package:geocoding/geocoding.dart';
import 'package:dio/dio.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../models/user_environment_context.dart';

/// Key used to persist the user's opt-in decision across app restarts.
const _kLocationOptInKey = 'aria_location_opt_in';

/// How long a successful context snapshot is considered fresh.
const _kCacheDuration = Duration(minutes: 30);

/// WMO weather interpretation code → human description mapping (subset).
const _kWmoDescriptions = <int, String>{
  0: 'clear sky',
  1: 'mainly clear',
  2: 'partly cloudy',
  3: 'overcast',
  45: 'foggy',
  48: 'depositing rime fog',
  51: 'light drizzle',
  53: 'moderate drizzle',
  55: 'dense drizzle',
  61: 'slight rain',
  63: 'moderate rain',
  65: 'heavy rain',
  71: 'slight snow',
  73: 'moderate snow',
  75: 'heavy snow',
  77: 'snow grains',
  80: 'slight rain showers',
  81: 'moderate rain showers',
  82: 'violent rain showers',
  85: 'slight snow showers',
  86: 'heavy snow showers',
  95: 'thunderstorm',
  96: 'thunderstorm with slight hail',
  99: 'thunderstorm with heavy hail',
};

final _kPrecipitatingCodes = {
  51, 53, 55, 61, 63, 65, 71, 73, 75, 77, 80, 81, 82, 85, 86, 95, 96, 99,
};

/// Singleton that gathers approximate location, weather, and local-time data.
///
/// Results are cached for [_kCacheDuration] to avoid redundant network calls
/// and unnecessary battery drain. All location resolution uses city-level
/// accuracy only — latitude/longitude are never forwarded to the LLM or stored.
class ContextService {
  ContextService._();
  static final ContextService instance = ContextService._();

  final Dio _dio = Dio(BaseOptions(
    connectTimeout: const Duration(seconds: 6),
    receiveTimeout: const Duration(seconds: 8),
  ));

  UserEnvironmentContext? _cached;
  DateTime? _cachedAt;
  Future<UserEnvironmentContext?>? _refreshInFlight;

  // ── Opt-in preference ────────────────────────────────────────────────────

  /// Returns true if the user has opted in to location/weather context.
  Future<bool> isOptedIn() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getBool(_kLocationOptInKey) ?? false;
  }

  /// Persist opt-in/out decision. Clears cache when toggling off.
  Future<void> setOptIn(bool value) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(_kLocationOptInKey, value);
    if (!value) {
      _cached = null;
      _cachedAt = null;
      _refreshInFlight = null;
    }
  }

  /// Starts a refresh in the background so the next chat turn can use a fresh
  /// location/time/weather snapshot without blocking the current UI action.
  Future<UserEnvironmentContext?> primeContext({
    bool forceRefresh = false,
  }) async {
    try {
      if (!await isOptedIn()) return null;
      if (!forceRefresh && _refreshInFlight != null) {
        return _refreshInFlight;
      }
      return _startRefresh();
    } catch (e) {
      debugPrint('[ContextService] primeContext error (suppressed): $e');
      return null;
    }
  }

  // ── Public API ───────────────────────────────────────────────────────────

  /// Returns the current environment context if the user is opted in,
  /// or null if they are not (or if gathering fails silently).
  ///
  /// This method NEVER throws — callers need not handle errors.
  Future<UserEnvironmentContext?> getContext() async {
    try {
      if (!await isOptedIn()) return null;

      // Return cached snapshot if still fresh.
      if (_cached != null && _cachedAt != null) {
        final age = DateTime.now().difference(_cachedAt!);
        if (age < _kCacheDuration) {
          return _cached;
        }

        // Stale-while-revalidate: keep turns responsive by returning the last
        // known snapshot immediately and refreshing it for the next turn.
        unawaited(_startRefresh());
        return _cached;
      }

      if (_refreshInFlight != null) {
        return await _refreshInFlight;
      }

      return await _startRefresh();
    } catch (e) {
      debugPrint('[ContextService] getContext error (suppressed): $e');
      return null;
    }
  }

  Future<UserEnvironmentContext?> _startRefresh() {
    final pending = _refreshInFlight;
    if (pending != null) {
      return pending;
    }

    final future = (() async {
      try {
        final value = await _gatherContext();
        _cached = value;
        _cachedAt = DateTime.now();
        return value;
      } catch (error) {
        debugPrint('[ContextService] refresh error (suppressed): $error');
        return _cached;
      } finally {
        _refreshInFlight = null;
      }
    })();

    _refreshInFlight = future;
    return future;
  }

  /// Force the user through the location permission flow.
  /// Returns true if permission was granted, false otherwise.
  Future<bool> requestPermission() async {
    if (!await Geolocator.isLocationServiceEnabled()) return false;

    var permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied) {
      permission = await Geolocator.requestPermission();
    }
    return permission == LocationPermission.whileInUse ||
        permission == LocationPermission.always;
  }

  // ── Internal ─────────────────────────────────────────────────────────────

  Future<UserEnvironmentContext> _gatherContext() async {
    final now = DateTime.now();

    // 1. Position — coarse accuracy is enough (city-level)
    Position? position;
    try {
      final hasPermission = await requestPermission();
      if (hasPermission) {
        position = await Geolocator.getLastKnownPosition();
        position ??= await Geolocator.getCurrentPosition(
          locationSettings: const LocationSettings(
            accuracy: LocationAccuracy.low,
            timeLimit: Duration(seconds: 6),
          ),
        );
      }
    } catch (e) {
      debugPrint('[ContextService] location error (suppressed): $e');
    }

    // 2. Reverse-geocode to city/region
    String? city;
    String? region;
    if (position != null) {
      try {
        final placemarks = await placemarkFromCoordinates(
          position.latitude,
          position.longitude,
        );
        if (placemarks.isNotEmpty) {
          final p = placemarks.first;
          city = p.locality?.isNotEmpty == true ? p.locality : p.subAdministrativeArea;
          region = [
            if (p.administrativeArea?.isNotEmpty == true) p.administrativeArea,
            if (p.isoCountryCode?.isNotEmpty == true) p.isoCountryCode,
          ].join(', ');
        }
      } catch (e) {
        debugPrint('[ContextService] geocoding error (suppressed): $e');
      }
    }

    // 3. Weather via Open-Meteo (free, no API key)
    double? tempC;
    int? weatherCode;
    String? weatherDesc;
    bool isPrecipitating = false;

    if (position != null) {
      try {
        final url =
            'https://api.open-meteo.com/v1/forecast'
            '?latitude=${position.latitude.toStringAsFixed(2)}'
            '&longitude=${position.longitude.toStringAsFixed(2)}'
            '&current=temperature_2m,weather_code'
            '&temperature_unit=celsius'
            '&forecast_days=1';

        final response = await _dio.get<String>(url);
        if (response.statusCode == 200 && response.data != null) {
          final json = jsonDecode(response.data!) as Map<String, dynamic>;
          final current = json['current'] as Map<String, dynamic>?;
          if (current != null) {
            tempC = (current['temperature_2m'] as num?)?.toDouble();
            weatherCode = (current['weather_code'] as num?)?.toInt();
            if (weatherCode != null) {
              weatherDesc = _kWmoDescriptions[weatherCode] ?? 'unknown';
              isPrecipitating = _kPrecipitatingCodes.contains(weatherCode);
            }
          }
        }
      } catch (e) {
        debugPrint('[ContextService] weather error (suppressed): $e');
      }
    }

    final isExtremeTemp =
        tempC != null && (tempC < 10.0 || tempC > 35.0);

    return UserEnvironmentContext(
      city: city,
      region: region,
      tempC: tempC,
      weatherDescription: weatherDesc,
      weatherCode: weatherCode,
      isPrecipitating: isPrecipitating,
      isExtremeTemp: isExtremeTemp,
      localTime: now,
    );
  }
}
