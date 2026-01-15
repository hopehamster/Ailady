import 'package:cloud_firestore/cloud_firestore.dart';

class RelationshipMetrics {
  final int trust;
  final int intimacy;
  final int empathy;
  final int xp;
  final int bondPoints;
  final int level;

  RelationshipMetrics({
    this.trust = 0,
    this.intimacy = 0,
    this.empathy = 0,
    this.xp = 0,
    this.bondPoints = 0,
    this.level = 1,
  });

  factory RelationshipMetrics.fromFirestore(DocumentSnapshot doc) {
    if (!doc.exists) return RelationshipMetrics();
    final data = doc.data() as Map<String, dynamic>;
    return RelationshipMetrics(
      trust: data['trust'] ?? 0,
      intimacy: data['intimacy'] ?? 0,
      empathy: data['empathy'] ?? 0,
      xp: data['xp'] ?? 0,
      bondPoints: data['bondPoints'] ?? 0,
      level: data['level'] ?? 1,
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'trust': trust,
      'intimacy': intimacy,
      'empathy': empathy,
      'xp': xp,
      'bondPoints': bondPoints,
      'level': level,
    };
  }
}
