import * as admin from 'firebase-admin';
import { getRedisUrl } from '../config/env';

/**
 * Redis Service for fast session memory
 * 
 * Note: For production, you'll need to:
 * 1. Set up Redis instance (Redis Cloud, AWS ElastiCache, etc.)
 * 2. Install redis package: npm install redis
 * 3. Configure connection in environment variables
 * 
 * For now, this uses Firestore as fallback until Redis is configured
 */

export interface SessionMemory {
  userId: string;
  sessionId: string;
  messages: string[];
  context: string;
  timestamp: Date;
  expiresAt: Date;
}

export class RedisService {
  private db: admin.firestore.Firestore;
  private useRedis: boolean = false;
  private redisClient: any;

  constructor() {
    this.db = admin.firestore();
    // Initialize Redis connection if available
    this.initializeRedis();
  }

  /**
   * Initialize Redis connection
   */
  private async initializeRedis() {
    try {
      const redisUrl = getRedisUrl();
      if (!redisUrl) {
        console.warn('Redis URL not found, using Firestore fallback');
        this.useRedis = false;
        return;
      }

      const redis = require('redis');
      this.redisClient = redis.createClient({
        url: redisUrl,
      });
      await this.redisClient.connect();
      this.useRedis = true;
      console.log('Redis connected');
    } catch (error) {
      console.warn('Redis not available, using Firestore fallback:', error);
      this.useRedis = false;
    }
  }

  /**
   * Get session memory (fast recall)
   * Uses Redis if available, falls back to Firestore
   */
  async getSessionMemory(userId: string, sessionId: string): Promise<SessionMemory | null> {
    if (this.useRedis && this.redisClient) {
      return this.getFromRedis(userId, sessionId);
    }

    // Fallback to Firestore
    return this.getFromFirestore(userId, sessionId);
  }

  /**
   * Save session memory (fast write)
   * Uses Redis if available, falls back to Firestore
   */
  async saveSessionMemory(memory: SessionMemory): Promise<void> {
    if (this.useRedis && this.redisClient) {
      await this.saveToRedis(memory);
    }

    // Always save to Firestore for persistence
    await this.saveToFirestore(memory);
  }

  /**
   * Get recent conversations (last 10 messages)
   * Fast recall from Redis
   */
  async getRecentConversation(userId: string, limit: number = 10): Promise<string[]> {
    if (this.useRedis && this.redisClient) {
      return this.getRecentFromRedis(userId, limit);
    }

    // Fallback to Firestore
    return this.getRecentFromFirestore(userId, limit);
  }

  // Redis methods
  private async getFromRedis(userId: string, sessionId: string): Promise<SessionMemory | null> {
    try {
      const key = `session:${userId}:${sessionId}`;
      const data = await this.redisClient.get(key);
      return data ? JSON.parse(data as string) : null;
    } catch (error) {
      console.error('Error getting from Redis:', error);
      return null;
    }
  }

  private async saveToRedis(memory: SessionMemory): Promise<void> {
    try {
      const key = `session:${memory.userId}:${memory.sessionId}`;
      const ttl = 3600; // 1 hour
      await this.redisClient.setEx(key, ttl, JSON.stringify(memory));
    } catch (error) {
      console.error('Error saving to Redis:', error);
      // Don't throw - Firestore fallback will handle it
    }
  }

  private async getRecentFromRedis(userId: string, limit: number): Promise<string[]> {
    try {
      const key = `recent:${userId}`;
      const data = await this.redisClient.lRange(key, 0, limit - 1);
      return data.map((item: string) => JSON.parse(item).content);
    } catch (error) {
      console.error('Error getting recent from Redis:', error);
      return [];
    }
  }

  // Firestore fallback methods
  private async getFromFirestore(userId: string, sessionId: string): Promise<SessionMemory | null> {
    try {
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
        expiresAt: data.expiresAt?.toDate() || new Date(Date.now() + 3600000),
      };
    } catch (error) {
      console.error('Error getting from Firestore:', error);
      return null;
    }
  }

  private async saveToFirestore(memory: SessionMemory): Promise<void> {
    try {
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
          expiresAt: admin.firestore.Timestamp.fromDate(memory.expiresAt),
        });
    } catch (error) {
      console.error('Error saving to Firestore:', error);
      throw error;
    }
  }

  private async getRecentFromFirestore(userId: string, limit: number): Promise<string[]> {
    try {
      const snapshot = await this.db
        .collection('conversations')
        .where('userId', '==', userId)
        .orderBy('timestamp', 'desc')
        .limit(limit)
        .get();

      return snapshot.docs
        .map((doc) => doc.data().content as string)
        .reverse(); // Reverse to get chronological order
    } catch (error) {
      console.error('Error getting recent from Firestore:', error);
      return [];
    }
  }
}
