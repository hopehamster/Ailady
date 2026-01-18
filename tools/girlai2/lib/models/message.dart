import 'package:cloud_firestore/cloud_firestore.dart';

class Message {
  final String id;
  final String userId;
  final String content;
  final bool isFromUser;
  final DateTime timestamp;

  // AI-Specific Fields
  final String? emotion;
  final String? emotionTrigger;
  final String? voiceUrl;
  final String? imageUrl;
  final String? modelUsed;

  Message({
    required this.id,
    required this.userId,
    required this.content,
    required this.isFromUser,
    required this.timestamp,
    this.emotion,
    this.emotionTrigger,
    this.voiceUrl,
    this.imageUrl,
    this.modelUsed,
  });

  factory Message.fromFirestore(DocumentSnapshot doc) {
    final data = doc.data() as Map<String, dynamic>;
    return Message(
      id: doc.id,
      userId: data['userId'] ?? '',
      content: data['content'] ?? '',
      isFromUser: data['isFromUser'] ?? false,
      timestamp: (data['timestamp'] as Timestamp?)?.toDate() ?? DateTime.now(),
      emotion: data['emotion'],
      emotionTrigger: data['emotionTrigger'],
      voiceUrl: data['voiceUrl'],
      imageUrl: data['imageUrl'],
      modelUsed: data['modelUsed'],
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'userId': userId,
      'content': content,
      'isFromUser': isFromUser,
      'timestamp': Timestamp.fromDate(timestamp),
      'emotion': emotion,
      'emotionTrigger': emotionTrigger,
      'voiceUrl': voiceUrl,
      'imageUrl': imageUrl,
      'modelUsed': modelUsed,
    };
  }
}
