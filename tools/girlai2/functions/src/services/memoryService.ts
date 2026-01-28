import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import OpenAI from 'openai';

const openaiApiKey = process.env.OPENAI_API_KEY || functions.config().openai?.key || '';
const openai = new OpenAI({ apiKey: openaiApiKey });

// Memory structure interfaces
export interface CoreFact {
  id: string;
  category: 'personal' | 'relationship' | 'preference' | 'life_event' | 'important_person';
  fact: string;
  context?: string;
  extractedAt: FirebaseFirestore.Timestamp;
  confidence: number;
}

export interface EmotionalMoment {
  id: string;
  summary: string;
  emotion: string;
  intensity: number; // 1-10
  userMessage: string;
  aiResponse: string;
  timestamp: FirebaseFirestore.Timestamp;
}

export interface ConversationSummary {
  id: string;
  weekStart: string; // ISO date
  weekEnd: string;
  summary: string;
  keyTopics: string[];
  emotionalTone: string;
  createdAt: FirebaseFirestore.Timestamp;
}

export interface IntelligentMemory {
  userId: string;
  coreFacts: CoreFact[];
  emotionalMoments: EmotionalMoment[];
  conversationSummaries: ConversationSummary[];
  recentContext: { role: 'user' | 'assistant'; content: string }[];
  lastUpdated: FirebaseFirestore.Timestamp;
}

// Words/phrases to filter out as noise
const NOISE_PATTERNS = [
  /^(hi|hey|hello|yo|sup)$/i,
  /^(ok|okay|k|kk)$/i,
  /^(yes|yeah|yep|yup|no|nope|nah)$/i,
  /^(lol|lmao|haha|hehe|😂|😊|👍)$/i,
  /^(brb|gtg|ttyl|bye)$/i,
  /^(thanks|thx|ty)$/i,
  /^(good|nice|cool|great|awesome)$/i,
  /^.{1,5}$/i, // Very short messages (under 6 chars)
];

/**
 * Check if a message is noise (not worth storing)
 */
function isNoiseMessage(content: string): boolean {
  const trimmed = content.trim();
  return NOISE_PATTERNS.some(pattern => pattern.test(trimmed));
}

/**
 * Extract core facts from a conversation exchange
 */
async function extractCoreFacts(
  userMessage: string,
  aiResponse: string,
  existingFacts: CoreFact[]
): Promise<CoreFact[]> {
  try {
    const existingFactsList = existingFacts.map(f => f.fact).join('\n');
    
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{
        role: 'user',
        content: `Analyze this conversation exchange and extract any NEW important personal facts about the user.

User said: "${userMessage}"
AI responded: "${aiResponse}"

Existing known facts (don't repeat these):
${existingFactsList || '(none yet)'}

Extract ONLY genuinely important, permanent facts like:
- Their name or nicknames
- Family members, pets, important people
- Where they live/work
- Important dates (birthdays, anniversaries)
- Major life events
- Strong preferences or values
- Health conditions or concerns

DO NOT extract:
- Temporary states ("I'm tired")
- Opinions about the conversation
- Things already known

Respond with JSON array (empty if no new facts):
[
  {
    "category": "personal|relationship|preference|life_event|important_person",
    "fact": "concise fact statement",
    "context": "brief context if needed",
    "confidence": 0.0-1.0
  }
]`
      }],
      temperature: 0.3,
      max_tokens: 500,
      response_format: { type: 'json_object' },
    });

    const result = JSON.parse(response.choices[0]?.message?.content || '{"facts":[]}');
    const facts = result.facts || result || [];
    
    if (!Array.isArray(facts)) return [];
    
    return facts
      .filter((f: any) => f.confidence >= 0.7)
      .map((f: any) => ({
        id: `fact_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        category: f.category || 'personal',
        fact: f.fact,
        context: f.context,
        extractedAt: admin.firestore.Timestamp.now(),
        confidence: f.confidence,
      }));
  } catch (error) {
    functions.logger.error('Error extracting core facts', { error });
    return [];
  }
}

/**
 * Analyze emotional significance of an exchange
 */
async function analyzeEmotionalSignificance(
  userMessage: string,
  aiResponse: string
): Promise<{ significant: boolean; emotion: string; intensity: number; summary: string } | null> {
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{
        role: 'user',
        content: `Rate the emotional significance of this exchange.

User: "${userMessage}"
AI: "${aiResponse}"

Respond with JSON:
{
  "intensity": 1-10 (10 = life-changing moment, 1 = mundane),
  "emotion": "primary emotion (joy, sadness, love, fear, anger, surprise, gratitude, pride, etc.)",
  "summary": "one sentence capturing why this moment matters",
  "significant": true/false (true if intensity >= 7)
}

Only mark as significant if it's a genuine emotional moment worth remembering forever.`
      }],
      temperature: 0.3,
      max_tokens: 200,
      response_format: { type: 'json_object' },
    });

    const result = JSON.parse(response.choices[0]?.message?.content || '{}');
    
    if (result.significant && result.intensity >= 7) {
      return {
        significant: true,
        emotion: result.emotion || 'neutral',
        intensity: result.intensity,
        summary: result.summary || '',
      };
    }
    return null;
  } catch (error) {
    functions.logger.error('Error analyzing emotional significance', { error });
    return null;
  }
}

/**
 * Generate weekly conversation summary
 */
export async function generateWeeklySummary(
  userId: string,
  messages: { role: 'user' | 'assistant'; content: string; timestamp: Date }[]
): Promise<ConversationSummary | null> {
  if (messages.length < 10) return null; // Not enough to summarize
  
  try {
    const conversationText = messages
      .map(m => `${m.role}: ${m.content}`)
      .join('\n');
    
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{
        role: 'user',
        content: `Summarize this week's conversations between a user and their AI companion.

${conversationText}

Create a concise summary that captures:
1. Main topics discussed
2. Emotional tone of the week
3. Any developments in their relationship
4. Important things to remember

Respond with JSON:
{
  "summary": "2-3 sentence summary",
  "keyTopics": ["topic1", "topic2", "topic3"],
  "emotionalTone": "overall emotional tone"
}`
      }],
      temperature: 0.4,
      max_tokens: 400,
      response_format: { type: 'json_object' },
    });

    const result = JSON.parse(response.choices[0]?.message?.content || '{}');
    
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(weekStart.getDate() - 7);
    
    return {
      id: `summary_${Date.now()}`,
      weekStart: weekStart.toISOString().split('T')[0],
      weekEnd: now.toISOString().split('T')[0],
      summary: result.summary || '',
      keyTopics: result.keyTopics || [],
      emotionalTone: result.emotionalTone || 'neutral',
      createdAt: admin.firestore.Timestamp.now(),
    };
  } catch (error) {
    functions.logger.error('Error generating weekly summary', { error });
    return null;
  }
}

/**
 * Get intelligent memory for a user
 */
export async function getIntelligentMemory(userId: string): Promise<IntelligentMemory | null> {
  try {
    const db = admin.firestore();
    const memoryDoc = await db.collection('intelligentMemory').doc(userId).get();
    
    if (memoryDoc.exists) {
      return memoryDoc.data() as IntelligentMemory;
    }
    
    // Initialize empty memory
    const emptyMemory: IntelligentMemory = {
      userId,
      coreFacts: [],
      emotionalMoments: [],
      conversationSummaries: [],
      recentContext: [],
      lastUpdated: admin.firestore.Timestamp.now(),
    };
    
    await db.collection('intelligentMemory').doc(userId).set(emptyMemory);
    return emptyMemory;
  } catch (error) {
    functions.logger.error('Error getting intelligent memory', { userId, error });
    return null;
  }
}

/**
 * Update intelligent memory after a conversation exchange
 */
export async function updateIntelligentMemory(
  userId: string,
  userMessage: string,
  aiResponse: string
): Promise<void> {
  try {
    const db = admin.firestore();
    const memory = await getIntelligentMemory(userId);
    if (!memory) return;
    
    // Skip noise messages
    if (isNoiseMessage(userMessage)) {
      functions.logger.info('Skipping noise message', { userId });
      return;
    }
    
    // 1. Extract new core facts
    const newFacts = await extractCoreFacts(userMessage, aiResponse, memory.coreFacts);
    if (newFacts.length > 0) {
      memory.coreFacts = [...memory.coreFacts, ...newFacts].slice(-100); // Keep max 100 facts
      functions.logger.info('Extracted new facts', { userId, count: newFacts.length });
    }
    
    // 2. Check for emotional significance
    const emotional = await analyzeEmotionalSignificance(userMessage, aiResponse);
    if (emotional) {
      const emotionalMoment: EmotionalMoment = {
        id: `emotion_${Date.now()}`,
        summary: emotional.summary,
        emotion: emotional.emotion,
        intensity: emotional.intensity,
        userMessage,
        aiResponse,
        timestamp: admin.firestore.Timestamp.now(),
      };
      memory.emotionalMoments = [...memory.emotionalMoments, emotionalMoment].slice(-50); // Keep max 50
      functions.logger.info('Recorded emotional moment', { userId, emotion: emotional.emotion });
    }
    
    // 3. Update recent context (last 50 non-noise exchanges)
    memory.recentContext = [
      ...memory.recentContext,
      { role: 'user' as const, content: userMessage },
      { role: 'assistant' as const, content: aiResponse },
    ].slice(-100); // Keep last 100 messages (50 exchanges)
    
    // 4. Save updated memory
    memory.lastUpdated = admin.firestore.Timestamp.now();
    await db.collection('intelligentMemory').doc(userId).set(memory);
    
  } catch (error) {
    functions.logger.error('Error updating intelligent memory', { userId, error });
  }
}

/**
 * Build context string for LLM from intelligent memory
 */
export function buildMemoryContext(memory: IntelligentMemory): string {
  const sections: string[] = [];
  
  // Core facts
  if (memory.coreFacts.length > 0) {
    const factsGrouped: { [key: string]: string[] } = {};
    memory.coreFacts.forEach(f => {
      if (!factsGrouped[f.category]) factsGrouped[f.category] = [];
      factsGrouped[f.category].push(f.fact);
    });
    
    let factsText = '## What I Know About Them\n';
    for (const [category, facts] of Object.entries(factsGrouped)) {
      factsText += `**${category}**: ${facts.join('; ')}\n`;
    }
    sections.push(factsText);
  }
  
  // Emotional moments (most recent 5)
  if (memory.emotionalMoments.length > 0) {
    const recentEmotional = memory.emotionalMoments.slice(-5);
    let emotionalText = '## Meaningful Moments We Shared\n';
    recentEmotional.forEach(m => {
      emotionalText += `- ${m.summary} (${m.emotion})\n`;
    });
    sections.push(emotionalText);
  }
  
  // Recent conversation summaries
  if (memory.conversationSummaries.length > 0) {
    const recentSummaries = memory.conversationSummaries.slice(-4);
    let summaryText = '## Recent Weeks Together\n';
    recentSummaries.forEach(s => {
      summaryText += `- Week of ${s.weekStart}: ${s.summary}\n`;
    });
    sections.push(summaryText);
  }
  
  return sections.join('\n\n');
}

/**
 * Get recent context messages for conversation
 */
export function getRecentContextMessages(memory: IntelligentMemory): { role: 'user' | 'assistant'; content: string }[] {
  return memory.recentContext.slice(-50); // Last 25 exchanges
}
