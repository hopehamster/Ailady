// Pure helpers extracted from the firebase-coupled memoryService.ts (Phase-0 brain decouple). The Firestore I/O stays in the legacy memoryService; only these pure functions move.

import type { IntelligentMemory, OpenLoop } from '@aria/shared-types';

// ── Importance decay configuration (module-scope literals; pure) ──────────────
const IMPORTANCE_DECAY_RATE = 0.02; // 2% decay per day
const MIN_IMPORTANCE_THRESHOLD = 0.1; // Messages below this are candidates for pruning

// ── Display-name normalization helpers (pure regex; deps of
//    normalizeMemoryForProfileDisplayName) ────────────────────────────────────
function normalizeDisplayName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9' -]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractNameFactCandidate(fact: string): string | null {
  const patterns = [
    /\b(?:my|their|the user's|user's)\s+name\s+is\s+([a-z][a-z' -]{0,48})/i,
    /\bcall\s+(?:me|them)\s+([a-z][a-z' -]{0,48})/i,
  ];

  for (const pattern of patterns) {
    const match = fact.match(pattern);
    if (match?.[1]) {
      return match[1].trim();
    }
  }

  return null;
}

/**
 * Importance decay (dep of getRecentContextMessages).
 * `timestamp` is epoch-milliseconds (FirebaseFirestore.Timestamp -> number).
 */
function applyImportanceDecay(
  baseImportance: number,
  timestamp: number,
): number {
  const now = Date.now();
  const messageTime = timestamp;
  const daysSinceMessage = (now - messageTime) / (1000 * 60 * 60 * 24);

  // High importance messages (>0.8) decay slower
  const decayMultiplier = baseImportance > 0.8 ? 0.5 : 1.0;
  const decay = Math.pow(1 - (IMPORTANCE_DECAY_RATE * decayMultiplier), daysSinceMessage);

  return Math.max(MIN_IMPORTANCE_THRESHOLD, baseImportance * decay);
}

export function normalizeMemoryForProfileDisplayName(
  memory: IntelligentMemory | null,
  profileDisplayName?: string,
): IntelligentMemory | null {
  const canonicalName = profileDisplayName?.trim();
  if (!memory || !canonicalName) {
    return memory;
  }

  const normalizedCanonicalName = normalizeDisplayName(canonicalName);
  if (!normalizedCanonicalName) {
    return memory;
  }

  const filteredCoreFacts = memory.coreFacts.filter((fact) => {
    if (fact.category !== 'personal') {
      return true;
    }

    const candidateName = extractNameFactCandidate(fact.fact);
    if (!candidateName) {
      return true;
    }

    return normalizeDisplayName(candidateName) === normalizedCanonicalName;
  });

  if (filteredCoreFacts.length === memory.coreFacts.length) {
    return memory;
  }

  return {
    ...memory,
    coreFacts: filteredCoreFacts,
  };
}

export function getRecentContextMessages(
  memory: IntelligentMemory,
  currentTopic?: string
): { role: 'user' | 'assistant'; content: string }[] {
  // If no scored messages yet, fall back to legacy recentContext
  if (!memory.scoredMessages || memory.scoredMessages.length === 0) {
    return memory.recentContext.slice(-50);
  }

  // Apply decay to all messages
  const scoredWithDecay = memory.scoredMessages.map(msg => ({
    ...msg,
    decayedImportance: applyImportanceDecay(msg.importance, msg.timestamp),
    // Boost relevance if current topic matches message topics
    topicRelevance: currentTopic && msg.topics
      ? msg.topics.some(t => t.toLowerCase().includes(currentTopic.toLowerCase()) ||
                            currentTopic.toLowerCase().includes(t.toLowerCase()))
        ? 0.3 // 30% boost for topic match
        : 0
      : 0,
  }));

  // Calculate final score: decayed importance + topic relevance
  const scoredWithFinal = scoredWithDecay.map(msg => ({
    ...msg,
    finalScore: (msg.decayedImportance || msg.importance) + msg.topicRelevance,
  }));

  // Strategy: Always include last 20 messages + top 30 by importance
  const sortedByTime = [...scoredWithFinal].sort(
    (a, b) => b.timestamp - a.timestamp
  );
  const recentMessages = sortedByTime.slice(0, 20);
  const recentIds = new Set(recentMessages.map(m => m.id));

  // Get top importance messages not already in recent
  const sortedByImportance = scoredWithFinal
    .filter(m => !recentIds.has(m.id))
    .sort((a, b) => b.finalScore - a.finalScore);
  const topImportanceMessages = sortedByImportance.slice(0, 30);

  // Combine and sort by timestamp for conversation flow
  const selectedMessages = [...recentMessages, ...topImportanceMessages]
    .sort((a, b) => a.timestamp - b.timestamp);

  // Convert to simple format
  return selectedMessages.map(m => ({
    role: m.role,
    content: m.content,
  }));
}

export function getOpenLoopsForPrompt(
  memory: IntelligentMemory,
  limit: number = 3,
): OpenLoop[] {
  const loops = memory.openLoops || [];
  return loops
    .filter((loop) => loop.status === 'open')
    .sort((a, b) => {
      if (b.priority !== a.priority) {
        return b.priority - a.priority;
      }
      if ((b.freshnessScore || 0) !== (a.freshnessScore || 0)) {
        return (b.freshnessScore || 0) - (a.freshnessScore || 0);
      }
      return b.lastMentionedAt - a.lastMentionedAt;
    })
    .slice(0, limit);
}

export function getInteractionCount(memory: IntelligentMemory | null): number {
  if (!memory) return 0;
  // Count user turns as proxy for interactions
  const userMessages = (memory.scoredMessages || []).filter((m) => m.role === 'user');
  return userMessages.length;
}
