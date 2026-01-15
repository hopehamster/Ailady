import 'package:firebase_auth/firebase_auth.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';

class FirebaseService {
  static final FirebaseService _instance = FirebaseService._internal();
  
  factory FirebaseService() {
    return _instance;
  }

  FirebaseService._internal();

  final FirebaseAuth _auth = FirebaseAuth.instance;
  final FirebaseFirestore _firestore = FirebaseFirestore.instance;
  final FirebaseFunctions _functions = FirebaseFunctions.instanceFor(region: 'us-central1');

  // Getters
  FirebaseAuth get auth => _auth;
  FirebaseFirestore get firestore => _firestore;
  FirebaseFunctions get functions => _functions;

  /// Call the Chat Cloud Function
  Future<Map<String, dynamic>> generateResponse(String message) async {
    try {
      final HttpsCallable callable = _functions.httpsCallable('generateResponse');
      final result = await callable.call(<String, dynamic>{
        'message': message,
      });
      return Map<String, dynamic>.from(result.data);
    } catch (e) {
      rethrow;
    }
  }

  /// Call the Voice Cloud Function
  Future<String> generateVoice(String text, {String? voiceId}) async {
    try {
      final HttpsCallable callable = _functions.httpsCallable('generateVoiceMessage');
      final result = await callable.call(<String, dynamic>{
        'text': text,
        'voiceId': voiceId,
      });
      return result.data['audioUrl'] as String;
    } catch (e) {
      rethrow;
    }
  }
}
