import * as admin from 'firebase-admin';

export interface LorebookEntry {
  id: string;
  title: string;
  content: string;
  tags: string[];
  triggers: string[];
  priority: number;
  active: boolean;
  scope: 'global' | 'companion' | 'relationship' | 'support';
}

export interface ActivatedLoreSnippet {
  id: string;
  title: string;
  content: string;
  matchScore: number;
}

interface ActivationInput {
  userMessage: string;
  openLoopHints?: string[];
  maxChars?: number;
  maxEntries?: number;
}

const DEFAULT_MAX_CHARS = 600;
const DEFAULT_MAX_ENTRIES = 3;

function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length >= 3);
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function scoreLoreEntry(entry: LorebookEntry, inputTokens: Set<string>): number {
  const triggerHits = (entry.triggers || []).reduce((hits, trigger) => {
    const triggerTokens = tokenize(trigger);
    if (triggerTokens.length === 0) {
      return hits;
    }
    const hasHit = triggerTokens.some((token) => inputTokens.has(token));
    return hasHit ? hits + 1 : hits;
  }, 0);

  const tagHits = (entry.tags || []).reduce((hits, tag) => {
    const tagTokens = tokenize(tag);
    const hasHit = tagTokens.some((token) => inputTokens.has(token));
    return hasHit ? hits + 1 : hits;
  }, 0);

  const triggerScore = triggerHits * 0.4;
  const tagScore = tagHits * 0.2;
  const priorityScore = clamp01(entry.priority || 0.5) * 0.4;
  return clamp01(triggerScore + tagScore + priorityScore);
}

export async function getActivatedLoreSnippets(
  input: ActivationInput,
): Promise<ActivatedLoreSnippet[]> {
  const messageTokens = tokenize(input.userMessage || '');
  const loopTokens = (input.openLoopHints || []).flatMap((value) => tokenize(value));
  const inputTokens = new Set<string>([...messageTokens, ...loopTokens]);

  if (inputTokens.size === 0) {
    return [];
  }

  const maxChars = Math.max(120, input.maxChars ?? DEFAULT_MAX_CHARS);
  const maxEntries = Math.max(1, input.maxEntries ?? DEFAULT_MAX_ENTRIES);

  const snapshot = await admin
    .firestore()
    .collection('lorebookEntries')
    .where('active', '==', true)
    .limit(80)
    .get();

  const scored = snapshot.docs
    .map((doc) => {
      const data = doc.data() as Partial<LorebookEntry>;
      const entry: LorebookEntry = {
        id: doc.id,
        title: data.title || doc.id,
        content: data.content || '',
        tags: Array.isArray(data.tags) ? data.tags : [],
        triggers: Array.isArray(data.triggers) ? data.triggers : [],
        priority: typeof data.priority === 'number' ? data.priority : 0.5,
        active: data.active !== false,
        scope: (data.scope as LorebookEntry['scope']) || 'global',
      };
      return {
        entry,
        score: scoreLoreEntry(entry, inputTokens),
      };
    })
    .filter((row) => row.score >= 0.32 && row.entry.content.trim().length > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxEntries * 2);

  const snippets: ActivatedLoreSnippet[] = [];
  let usedChars = 0;
  for (const row of scored) {
    const content = row.entry.content.trim();
    if (usedChars + content.length > maxChars) {
      continue;
    }
    snippets.push({
      id: row.entry.id,
      title: row.entry.title,
      content,
      matchScore: row.score,
    });
    usedChars += content.length;
    if (snippets.length >= maxEntries) {
      break;
    }
  }

  return snippets;
}

export function buildLorePromptBlock(snippets: ActivatedLoreSnippet[]): string {
  if (snippets.length === 0) {
    return '';
  }

  const lines = snippets.map(
    (snippet) => `- ${snippet.title}: ${snippet.content} (match ${snippet.matchScore.toFixed(2)})`,
  );

  return ['## Activated Lorebook Context', ...lines].join('\n');
}