import 'package:cloud_firestore/cloud_firestore.dart';

class UserProfile {
  final String id;
  final String? phoneNumber;
  final String? displayName;
  final DateTime createdAt;
  final DateTime lastLoginAt;
  final bool isSubscribed;
  final DateTime? subscriptionExpiresAt;
  final bool onboardingCompleted;

  UserProfile({
    required this.id,
    this.phoneNumber,
    this.displayName,
    required this.createdAt,
    required this.lastLoginAt,
    this.isSubscribed = true,
    this.subscriptionExpiresAt,
    this.onboardingCompleted = false,
  });

  /// All subscribers have full access to every feature.
  bool get hasVisionAccess => isSubscribed;
  bool get hasPremiumFeatures => isSubscribed;

  factory UserProfile.fromFirestore(DocumentSnapshot doc) {
    final data = doc.data() as Map<String, dynamic>;
    return UserProfile(
      id: doc.id,
      phoneNumber: data['phoneNumber'],
      displayName: data['displayName'],
      createdAt: (data['createdAt'] as Timestamp?)?.toDate() ?? DateTime.now(),
      lastLoginAt:
          (data['lastLoginAt'] as Timestamp?)?.toDate() ?? DateTime.now(),
      // Accept both new field and legacy isPremium — default true (everyone is subscribed)
      isSubscribed: data['isSubscribed'] ?? data['isPremium'] ?? true,
      subscriptionExpiresAt:
          (data['subscriptionExpiresAt'] as Timestamp?)?.toDate(),
      onboardingCompleted: data['onboardingCompleted'] ?? false,
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'phoneNumber': phoneNumber,
      'displayName': displayName,
      'createdAt': Timestamp.fromDate(createdAt),
      'lastLoginAt': Timestamp.fromDate(lastLoginAt),
      'isSubscribed': isSubscribed,
      'subscriptionExpiresAt': subscriptionExpiresAt != null
          ? Timestamp.fromDate(subscriptionExpiresAt!)
          : null,
      'onboardingCompleted': onboardingCompleted,
    };
  }

  UserProfile copyWith({
    String? displayName,
    bool? isSubscribed,
    DateTime? subscriptionExpiresAt,
    bool? onboardingCompleted,
  }) {
    return UserProfile(
      id: id,
      phoneNumber: phoneNumber,
      displayName: displayName ?? this.displayName,
      createdAt: createdAt,
      lastLoginAt: lastLoginAt,
      isSubscribed: isSubscribed ?? this.isSubscribed,
      subscriptionExpiresAt:
          subscriptionExpiresAt ?? this.subscriptionExpiresAt,
      onboardingCompleted: onboardingCompleted ?? this.onboardingCompleted,
    );
  }
}
