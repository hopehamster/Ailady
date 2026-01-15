import 'package:cloud_firestore/cloud_firestore.dart';

class UserProfile {
  final String id;
  final String? phoneNumber;
  final String? displayName;
  final DateTime createdAt;
  final DateTime lastLoginAt;
  final bool isPremium;

  UserProfile({
    required this.id,
    this.phoneNumber,
    this.displayName,
    required this.createdAt,
    required this.lastLoginAt,
    this.isPremium = false,
  });

  factory UserProfile.fromFirestore(DocumentSnapshot doc) {
    final data = doc.data() as Map<String, dynamic>;
    return UserProfile(
      id: doc.id,
      phoneNumber: data['phoneNumber'],
      displayName: data['displayName'],
      createdAt: (data['createdAt'] as Timestamp?)?.toDate() ?? DateTime.now(),
      lastLoginAt: (data['lastLoginAt'] as Timestamp?)?.toDate() ?? DateTime.now(),
      isPremium: data['isPremium'] ?? false,
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'phoneNumber': phoneNumber,
      'displayName': displayName,
      'createdAt': Timestamp.fromDate(createdAt),
      'lastLoginAt': Timestamp.fromDate(lastLoginAt),
      'isPremium': isPremium,
    };
  }
}
