import * as admin from 'firebase-admin';
import { getPineconeApiKey } from '../config/env';

/**
 * Pinecone Service for vector memory search
 * 
 * Note: For production, you'll need to:
 * 1. Set up Pinecone account and index
 * 2. Install @pinecone-database/pinecone package
 * 3. Configure API key and environment in environment variables
 * 
 * This provides semantic search for conversation context
 */

export interface VectorMemory {
  userId: string;
  text: string;
  embedding: number[];
  metadata: Record<string, any>;
  timestamp: Date;
}

export class PineconeService {
  private db: admin.firestore.Firestore;
  private usePinecone: boolean = false;
  private pineconeClient: any;
  // @ts-ignore
  private index: any;

  constructor() {
    this.db = admin.firestore();
    // Initialize Pinecone connection if available
    this.initializePinecone();
  }

  /**
   * Initialize Pinecone connection
   */
  private async initializePinecone() {
    try {
      const apiKey = getPineconeApiKey();
      if (!apiKey) {
        console.warn('Pinecone API key not found, using Firestore fallback');
        this.usePinecone = false;
        return;
      }

      const { Pinecone } = require('@pinecone-database/pinecone');
      this.pineconeClient = new Pinecone({
        apiKey: apiKey,
      });
      this.index = this.pineconeClient.index(process.env.PINECONE_INDEX_NAME || 'girlai2-memory');
      this.usePinecone = true;
      console.log('Pinecone connected');
    } catch (error) {
      console.warn('Pinecone not available, using Firestore fallback:', error);
      this.usePinecone = false;
    }
  }

  /**
   * Store conversation in vector memory
   */
  async storeMemory(memory: VectorMemory): Promise<void> {
    if (this.usePinecone) {
      // await this.storeInPinecone(memory);
      // Uncomment when Pinecone is set up
    }

    // Fallback to Firestore
    await this.storeInFirestore(memory);
  }

  /**
   * Search similar memories (semantic search)
   */
  async searchSimilarMemories(
    userId: string,
    query: string,
    limit: number = 5
  ): Promise<VectorMemory[]> {
    if (this.usePinecone) {
      // return this.searchInPinecone(userId, query, limit);
      // Uncomment when Pinecone is set up
    }

    // Fallback to Firestore (simple text search)
    return this.searchInFirestore(userId, query, limit);
  }

  // Pinecone methods (uncomment when Pinecone is set up)
  // private async storeInPinecone(memory: VectorMemory): Promise<void> {
  //   const id = `${memory.userId}_${Date.now()}`;
  //   await this.index.upsert([{
  //     id: id,
  //     values: memory.embedding,
  //     metadata: {
  //       userId: memory.userId,
  //       text: memory.text,
  //       timestamp: memory.timestamp.toISOString(),
  //       ...memory.metadata,
  //     },
  //   }]);
  // }

  // private async searchInPinecone(
  //   userId: string,
  //   query: string,
  //   limit: number
  // ): Promise<VectorMemory[]> {
  //   // Generate embedding for query (using OpenAI or similar)
  //   const queryEmbedding = await this.generateEmbedding(query);
  //   
  //   const results = await this.index.query({
  //     vector: queryEmbedding,
  //     topK: limit,
  //     filter: { userId: userId },
  //     includeMetadata: true,
  //   });
  //   
  //   return results.matches.map((match: any) => ({
  //     userId: match.metadata.userId,
  //     text: match.metadata.text,
  //     embedding: match.values,
  //     metadata: match.metadata,
  //     timestamp: new Date(match.metadata.timestamp),
  //   }));
  // }

  // Firestore fallback methods
  private async storeInFirestore(memory: VectorMemory): Promise<void> {
    try {
      await this.db
        .collection('vector_memories')
        .doc(`${memory.userId}_${Date.now()}`)
        .set({
          userId: memory.userId,
          text: memory.text,
          metadata: memory.metadata,
          timestamp: admin.firestore.Timestamp.fromDate(memory.timestamp),
        });
    } catch (error) {
      console.error('Error storing in Firestore:', error);
      throw error;
    }
  }

  private async searchInFirestore(
    userId: string,
    query: string,
    limit: number
  ): Promise<VectorMemory[]> {
    try {
      // Simple text search fallback
      const snapshot = await this.db
        .collection('vector_memories')
        .where('userId', '==', userId)
        .orderBy('timestamp', 'desc')
        .limit(limit)
        .get();

      return snapshot.docs.map((doc) => {
        const data = doc.data();
        return {
          userId: data.userId,
          text: data.text,
          embedding: [], // Empty for Firestore fallback
          metadata: data.metadata || {},
          timestamp: data.timestamp.toDate(),
        };
      });
    } catch (error) {
      console.error('Error searching in Firestore:', error);
      return [];
    }
  }

  // Helper to generate embeddings (when using Pinecone)
  // private async generateEmbedding(text: string): Promise<number[]> {
  //   // Use OpenAI embeddings API or similar
  //   // This is a placeholder
  //   return [];
  // }
}
