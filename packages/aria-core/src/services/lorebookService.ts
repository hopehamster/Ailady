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
  // PHASE-0 STUB: persistence is Phase-1 memory work
  return [];
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
