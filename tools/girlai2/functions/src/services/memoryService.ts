import * as admin from 'firebase-admin';
import { RedisService } from './redisService';
import { PineconeService } from './pineconeService';

export interface SessionMemory {
  userId: string;
  sessionId: string;
  messages: string[];
  context: string;
  timestamp: Date;
}

export interface PermanentMemory {
  userId: string;
  facts: Record<string, any>;
  milestones: string[];
  preferences: Record<string, any>;
  emotionalData?: Record<string, any>;
  eventMemory?: Record<string, any>;
  likes?: string[];
  dislikes?: string[];
  dailyPatterns?: Record<string, any>;
}

export class MemoryService {
  private db: admin.firestore.Firestore;
  private redisService: RedisService;
  private pineconeService: PineconeService;

  constructor() {
    this.db = admin.firestore();
    this.redisService = new RedisService();
    this.pineconeService = new PineconeService();
  }

  async getSessionMemory(userId: string, sessionId: string): Promise<SessionMemory | null> {
    try {
      // Try Redis first (fast recall)
      const redisMemory = await this.redisService.getSessionMemory(userId, sessionId);
      if (redisMemory) {
        return redisMemory;
      }

      // Fallback to Firestore
      const doc = await this.db
        .collection('memories')
        .doc(userId)
        .collection('sessions')
        .doc(sessionId)
        .get();

      if (!doc.exists) {
        return null;
      }

      const data = doc.data()!;
      return {
        userId: data.userId,
        sessionId: data.sessionId,
        messages: data.messages || [],
        context: data.context || '',
        timestamp: data.timestamp.toDate(),
      };
    } catch (error) {
      console.error('Error getting session memory:', error);
      return null;
    }
  }

  async saveSessionMemory(memory: SessionMemory): Promise<void> {
    try {
      // Save to Redis for fast recall
      await this.redisService.saveSessionMemory({
        ...memory,
        expiresAt: new Date(Date.now() + 3600000), // 1 hour TTL
      });

      // Also save to Firestore for persistence
      await this.db
        .collection('memories')
        .doc(memory.userId)
        .collection('sessions')
        .doc(memory.sessionId)
        .set({
          userId: memory.userId,
          sessionId: memory.sessionId,
          messages: memory.messages,
          context: memory.context,
          timestamp: admin.firestore.Timestamp.fromDate(memory.timestamp),
        });
    } catch (error) {
      console.error('Error saving session memory:', error);
      throw error;
    }
  }

  async getPermanentMemory(userId: string): Promise<PermanentMemory | null> {
    try {
      const userDoc = await this.db.collection('users').doc(userId).get();

      if (!userDoc.exists) {
        return null;
      }

      const data = userDoc.data()!;
      return {
        userId: userId,
        facts: data.facts || {},
        milestones: data.milestones || [],
        preferences: data.preferences || {},
        emotionalData: data.emotionalData || {},
        eventMemory: data.eventMemory || {},
        likes: data.likes || [],
        dislikes: data.dislikes || [],
        dailyPatterns: data.dailyPatterns || {},
      };
    } catch (error) {
      console.error('Error getting permanent memory:', error);
      return null;
    }
  }

  async updatePermanentMemory(userId: string, updates: Partial<PermanentMemory>): Promise<void> {
    try {
      const updateData: any = {};
      
      if (updates.facts) {
        updateData.facts = updates.facts;
      }
      if (updates.milestones) {
        updateData.milestones = admin.firestore.FieldValue.arrayUnion(...updates.milestones);
      }
      if (updates.preferences) {
        updateData.preferences = updates.preferences;
      }

      await this.db.collection('users').doc(userId).update(updateData);
    } catch (error) {
      console.error('Error updating permanent memory:', error);
      throw error;
    }
  }

  async buildContext(userId: string, sessionId: string, query?: string): Promise<string> {
    const permanentMemory = await this.getPermanentMemory(userId);
    const sessionMemory = await this.getSessionMemory(userId, sessionId);

    let context = '';

    // Add permanent facts
    if (permanentMemory) {
      context += 'User Information:\n';
      if (permanentMemory.facts.birthday) {
        context += `- Birthday: ${permanentMemory.facts.birthday}\n`;
      }
      if (permanentMemory.facts.preferredName) {
        context += `- Preferred Name: ${permanentMemory.facts.preferredName}\n`;
      }
      if (permanentMemory.preferences.emotionalTone) {
        context += `- Emotional Tone Preference: ${permanentMemory.preferences.emotionalTone}\n`;
      }
      
      // Add emotional data
      if (permanentMemory.emotionalData) {
        context += `- Emotional State: ${JSON.stringify(permanentMemory.emotionalData)}\n`;
      }
      
      // Add likes and dislikes
      if (permanentMemory.likes && permanentMemory.likes.length > 0) {
        context += `- Likes: ${permanentMemory.likes.join(', ')}\n`;
      }
      if (permanentMemory.dislikes && permanentMemory.dislikes.length > 0) {
        context += `- Dislikes: ${permanentMemory.dislikes.join(', ')}\n`;
      }
      
      // Add daily patterns
      if (permanentMemory.dailyPatterns) {
        context += `- Daily Patterns: ${JSON.stringify(permanentMemory.dailyPatterns)}\n`;
      }
      
      context += '\n';
    }

    // Add recent conversation context (from Redis for fast recall)
    if (sessionMemory && sessionMemory.messages.length > 0) {
      context += 'Recent Conversation:\n';
      const recentMessages = sessionMemory.messages.slice(-5); // Last 5 messages
      recentMessages.forEach((msg, index) => {
        context += `${index + 1}. ${msg}\n`;
      });
      context += '\n';
    } else {
      // Fallback: get recent from Redis
      const recentMessages = await this.redisService.getRecentConversation(userId, 5);
      if (recentMessages.length > 0) {
        context += 'Recent Conversation:\n';
        recentMessages.forEach((msg, index) => {
          context += `${index + 1}. ${msg}\n`;
        });
        context += '\n';
      }
    }

    // Add semantic search results if query provided
    if (query) {
      const similarMemories = await this.pineconeService.searchSimilarMemories(userId, query, 3);
      if (similarMemories.length > 0) {
        context += 'Related Memories:\n';
        similarMemories.forEach((memory, index) => {
          context += `${index + 1}. ${memory.text}\n`;
        });
        context += '\n';
      }
    }

    return context;
  }

  generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
