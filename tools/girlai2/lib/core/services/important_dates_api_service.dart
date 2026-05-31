/// Important Dates API surface.
///
/// Extracted from firebase_service.dart as L10 phase 2 (the firebase_service
/// God Object decomposition). Owns the three callables that read/write the
/// user's important-dates collection:
///
///   - saveUserImportantDate       (create or update an entry; returns the ID)
///   - deleteUserImportantDate     (delete by ID)
///   - getUserImportantDates       (list, with optional upcoming-only window)
///
/// FirebaseService keeps the same-named public methods and delegates to this
/// service so the 16 consumer files keep importing FirebaseService unchanged.
///
/// Singleton — there is exactly one FirebaseFunctions instance per region and
/// one auth state per app, so this service follows the same singleton shape
/// as FirebaseService itself.
library;

import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_auth/firebase_auth.dart';

import '../exceptions/chat_exception.dart';

class ImportantDatesApiService {
  ImportantDatesApiService({
    FirebaseFunctions? functions,
    FirebaseAuth? auth,
  })  : _functionsOverride = functions,
        _authOverride = auth;

  static final ImportantDatesApiService _instance =
      ImportantDatesApiService._internal();

  factory ImportantDatesApiService.instance() => _instance;

  ImportantDatesApiService._internal()
      : _functionsOverride = null,
        _authOverride = null;

  final FirebaseFunctions? _functionsOverride;
  final FirebaseAuth? _authOverride;

  FirebaseFunctions get _functions =>
      _functionsOverride ?? FirebaseFunctions.instanceFor(region: 'us-central1');

  FirebaseAuth get _auth => _authOverride ?? FirebaseAuth.instance;

  /// Save (create or update) an important date for the current user.
  /// Returns the document ID of the saved date.
  Future<String> saveUserImportantDate({
    required String label,
    required String date,
    required String category,
    required bool recurs,
    String? id,
  }) async {
    final user = _auth.currentUser;
    if (user == null) throw ChatException('Please sign in to continue.');

    final callable = _functions.httpsCallable('saveUserImportantDate');
    final result = await callable.call(<String, dynamic>{
      'label': label,
      'date': date,
      'category': category,
      'recurs': recurs,
      if (id != null) 'id': id,
    });
    final data = result.data as Map<String, dynamic>?;
    return data?['id'] as String? ?? '';
  }

  /// Delete an important date by ID for the current user.
  Future<void> deleteUserImportantDate(String dateId) async {
    final user = _auth.currentUser;
    if (user == null) throw ChatException('Please sign in to continue.');

    final callable = _functions.httpsCallable('deleteUserImportantDate');
    await callable.call(<String, dynamic>{'id': dateId});
  }

  /// Fetch important dates for the current user.
  ///
  /// [upcomingOnly] — if true, only returns dates within [daysAhead] days.
  /// [daysAhead]   — window in days (default 7). Ignored when upcomingOnly=false.
  ///
  /// Returns a list of raw maps matching ImportantDate / UpcomingDate shape.
  Future<List<Map<String, dynamic>>> getUserImportantDates({
    bool upcomingOnly = false,
    int daysAhead = 7,
  }) async {
    final user = _auth.currentUser;
    if (user == null) throw ChatException('Please sign in to continue.');

    final callable = _functions.httpsCallable('getUserImportantDates');
    final result = await callable.call(<String, dynamic>{
      if (upcomingOnly) 'upcomingOnly': true,
      if (upcomingOnly) 'daysAhead': daysAhead,
    });
    final data = result.data as Map<String, dynamic>?;
    final dates = data?['dates'] as List<dynamic>? ?? [];
    return dates
        .whereType<Map>()
        .map((d) => Map<String, dynamic>.from(d))
        .toList();
  }
}
