import 'package:cloud_firestore/cloud_firestore.dart';

/// Subscription tiers for the app
enum SubscriptionTier {
  free,     // Free tier - basic features
  regular,  // Regular tier ($40/month) - premium features
  ultra,    // Ultra tier ($75/month) - all features including vision
}

/// Extension for SubscriptionTier enum
extension SubscriptionTierExtension on SubscriptionTier {
  String get displayName {
    switch (this) {
      case SubscriptionTier.free:
        return 'Free';
      case SubscriptionTier.regular:
        return 'Regular';
      case SubscriptionTier.ultra:
        return 'Ultra';
    }
  }
  
  double get monthlyPrice {
    switch (this) {
      case SubscriptionTier.free:
        return 0;
      case SubscriptionTier.regular:
        return 40;
      case SubscriptionTier.ultra:
        return 75;
    }
  }
  
  bool get hasVisionAccess => this == SubscriptionTier.ultra;
  bool get hasPremiumFeatures => this != SubscriptionTier.free;
  
  static SubscriptionTier fromString(String? value) {
    switch (value?.toLowerCase()) {
      case 'regular':
        return SubscriptionTier.regular;
      case 'ultra':
        return SubscriptionTier.ultra;
      default:
        return SubscriptionTier.free;
    }
  }
}

class UserProfile {
  final String id;
  final String? phoneNumber;
  final String? displayName;
  final DateTime createdAt;
  final DateTime lastLoginAt;
  final bool isPremium;  // Legacy - kept for compatibility
  final SubscriptionTier subscriptionTier;
  final DateTime? subscriptionExpiresAt;
  final bool onboardingCompleted;

  UserProfile({
    required this.id,
    this.phoneNumber,
    this.displayName,
    required this.createdAt,
    required this.lastLoginAt,
    this.isPremium = false,
    this.subscriptionTier = SubscriptionTier.free,
    this.subscriptionExpiresAt,
    this.onboardingCompleted = false,
  });

  /// Check if user has vision feature access (Ultra only)
  bool get hasVisionAccess => subscriptionTier.hasVisionAccess;
  
  /// Check if user has any premium features
  bool get hasPremiumFeatures => subscriptionTier.hasPremiumFeatures || isPremium;

  factory UserProfile.fromFirestore(DocumentSnapshot doc) {
    final data = doc.data() as Map<String, dynamic>;
    return UserProfile(
      id: doc.id,
      phoneNumber: data['phoneNumber'],
      displayName: data['displayName'],
      createdAt: (data['createdAt'] as Timestamp?)?.toDate() ?? DateTime.now(),
      lastLoginAt:
          (data['lastLoginAt'] as Timestamp?)?.toDate() ?? DateTime.now(),
      isPremium: data['isPremium'] ?? false,
      subscriptionTier: SubscriptionTierExtension.fromString(data['subscriptionTier']),
      subscriptionExpiresAt: (data['subscriptionExpiresAt'] as Timestamp?)?.toDate(),
      onboardingCompleted: data['onboardingCompleted'] ?? false,
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'phoneNumber': phoneNumber,
      'displayName': displayName,
      'createdAt': Timestamp.fromDate(createdAt),
      'lastLoginAt': Timestamp.fromDate(lastLoginAt),
      'isPremium': isPremium,
      'subscriptionTier': subscriptionTier.name,
      'subscriptionExpiresAt': subscriptionExpiresAt != null 
          ? Timestamp.fromDate(subscriptionExpiresAt!) 
          : null,
      'onboardingCompleted': onboardingCompleted,
    };
  }
  
  /// Create a copy with updated fields
  UserProfile copyWith({
    String? displayName,
    SubscriptionTier? subscriptionTier,
    DateTime? subscriptionExpiresAt,
    bool? onboardingCompleted,
  }) {
    return UserProfile(
      id: id,
      phoneNumber: phoneNumber,
      displayName: displayName ?? this.displayName,
      createdAt: createdAt,
      lastLoginAt: lastLoginAt,
      isPremium: isPremium,
      subscriptionTier: subscriptionTier ?? this.subscriptionTier,
      subscriptionExpiresAt: subscriptionExpiresAt ?? this.subscriptionExpiresAt,
      onboardingCompleted: onboardingCompleted ?? this.onboardingCompleted,
    );
  }
}
