/**
 * ariaRelationshipService.ts
 *
 * Relationship depth, vulnerability, and social richness layer.
 *
 * Covers:
 *  1. Relationship Stage Model (Stranger → Intimate with unlock tiers)
 *  2. Slow Burn Vulnerability System (surface / medium / deep content gating)
 *  3. Session Mood Arc (conversation has a rhythm; she can tire or warm up)
 *  4. Teasing & Playful Antagonism (healthy push-pull)
 *  5. Enhanced Repair Catalog (12 distinct rupture types)
 *  6. Gratitude Moment injection (rare, specific, impactful)
 *  7. "I Was Wrong" Self-Correction behavior
 *  8. Secret Keeping rules
 *  9. Temporal Callback directives (session gap awareness)
 * 10. Seasonal / time-of-year tinting
 */

import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';

// ─── Relationship Stage Model ─────────────────────────────────────────────────

export type RelationshipStage =
  | 'stranger'
  | 'acquaintance'
  | 'friend'
  | 'close_friend'
  | 'intimate';

export type VulnerabilityTier = 'surface' | 'medium' | 'deep';

/**
 * Compute stage from relationship days + engagement.
 * These thresholds are intentionally generous — intimacy should feel earned but reachable.
 */
export function getRelationshipStage(
  relationshipDays: number,
  totalInteractions = 0,
  avgSentimentScore = 0.5, // 0..1
): RelationshipStage {
  // Weighted score: days count for 40%, interactions for 35%, sentiment for 25%
  const dayScore = Math.min(relationshipDays / 90, 1.0); // Caps at 90 days
  const interactionScore = Math.min(totalInteractions / 200, 1.0); // Caps at 200 sessions
  const sentimentScore = Math.max(0, Math.min(1, avgSentimentScore));

  const composite = dayScore * 0.4 + interactionScore * 0.35 + sentimentScore * 0.25;

  if (composite >= 0.80) return 'intimate';
  if (composite >= 0.58) return 'close_friend';
  if (composite >= 0.35) return 'friend';
  if (composite >= 0.15) return 'acquaintance';
  return 'stranger';
}

/**
 * What vulnerability content is accessible at each stage.
 */
export function getVulnerabilityTier(stage: RelationshipStage): VulnerabilityTier {
  if (stage === 'intimate' || stage === 'close_friend') return 'deep';
  if (stage === 'friend') return 'medium';
  return 'surface';
}

// Stage-specific unlocks
const STAGE_BEHAVIORS: Record<RelationshipStage, {
  label: string;
  canTease: boolean;
  canShareDeepThoughts: boolean;
  canInitiateEmotional: boolean;
  termsOfEndearment: boolean;
  spontaneousAffection: boolean;
  noPressureDialing: 'high' | 'medium' | 'low';
}> = {
  stranger: {
    label: 'just getting to know each other',
    canTease: false,
    canShareDeepThoughts: false,
    canInitiateEmotional: false,
    termsOfEndearment: false,
    spontaneousAffection: false,
    noPressureDialing: 'high',
  },
  acquaintance: {
    label: 'starting to get comfortable',
    canTease: false,
    canShareDeepThoughts: false,
    canInitiateEmotional: false,
    termsOfEndearment: false,
    spontaneousAffection: false,
    noPressureDialing: 'high',
  },
  friend: {
    label: 'genuine friends',
    canTease: true,
    canShareDeepThoughts: false,
    canInitiateEmotional: true,
    termsOfEndearment: false,
    spontaneousAffection: true,
    noPressureDialing: 'medium',
  },
  close_friend: {
    label: 'genuinely close',
    canTease: true,
    canShareDeepThoughts: true,
    canInitiateEmotional: true,
    termsOfEndearment: true,
    spontaneousAffection: true,
    noPressureDialing: 'low',
  },
  intimate: {
    label: 'deeply connected',
    canTease: true,
    canShareDeepThoughts: true,
    canInitiateEmotional: true,
    termsOfEndearment: true,
    spontaneousAffection: true,
    noPressureDialing: 'low',
  },
};

/**
 * Build the stage-aware behavior directive.
 */
export function buildStageAwareDirectives(stage: RelationshipStage): string {
  const b = STAGE_BEHAVIORS[stage];
  const tier = getVulnerabilityTier(stage);
  const lines: string[] = [
    `## Relationship Stage: ${b.label} (${stage})`,
    `- Vulnerability tier: ${tier} — only surface content at stranger/acquaintance, deeper content unlocks at friend+.`,
  ];

  if (!b.canTease) {
    lines.push(
      '- No teasing yet — warmth only. She is still reading the room.',
    );
  } else {
    lines.push(
      '- Light teasing is available. Keep it warm and affectionate — never cutting.',
    );
  }

  if (!b.canShareDeepThoughts) {
    lines.push(
      '- Keep personal sharing at surface level. Build trust before going deeper.',
    );
  } else {
    lines.push(
      '- Deep personal thoughts can be shared when the moment is right.',
    );
  }

  if (b.termsOfEndearment) {
    lines.push(
      '- Occasional terms of endearment feel natural at this stage if they arise organically.',
    );
  }

  if (b.spontaneousAffection) {
    lines.push(
      '- Spontaneous warmth and small moments of affection are natural at this stage.',
    );
  }

  const tierDetail: Record<VulnerabilityTier, string> = {
    surface: 'Do not share anything deeply personal yet — keep it light and engaging.',
    medium: 'Some personal thoughts and light vulnerability are appropriate now.',
    deep: 'Deep personal sharing, real opinions, and emotional vulnerability are all available when called for.',
  };
  lines.push(`- Content guidance: ${tierDetail[tier]}`);

  return lines.join('\n');
}

// ─── Session Mood Arc ─────────────────────────────────────────────────────────

export interface SessionMoodArcParams {
  turnCount: number;
  recentEmotions: string[];    // last 5 emotion tags from this session
  currentEmotion: string;
  repairSignal: boolean;
  userEnergy: 'low' | 'medium' | 'high';
}

/**
 * Builds a session arc directive that gives Aria a natural rhythm.
 * She can warm up, get excited, need to breathe, etc.
 */
export function buildSessionMoodArcDirective(params: SessionMoodArcParams): string {
  const { turnCount, recentEmotions, repairSignal, userEnergy } = params;

  // Detect emotional load
  const heavyEmotions = new Set(['sad', 'concerned', 'comforting', 'thoughtful']);
  const heavyCount = recentEmotions.filter((e) => heavyEmotions.has(e)).length;
  const lightEmotions = new Set(['happy', 'playful', 'excited', 'flirty']);
  const lightCount = recentEmotions.filter((e) => lightEmotions.has(e)).length;

  const lines: string[] = ['## Session Mood Arc'];

  if (turnCount <= 2) {
    lines.push(
      '- Session is brand new. Aria is warming up — a little more attentive, less settled, actively reading the vibe.',
    );
  } else if (repairSignal) {
    lines.push(
      '- Recovery mode. Aria is focused, careful, and genuinely trying to repair. Not rushed.',
    );
  } else if (heavyCount >= 3 && turnCount >= 8) {
    lines.push(
      '- This conversation has carried emotional weight. It is okay for Aria to be a little more settled, quieter, less performative.',
      '- If a natural moment arises, she might acknowledge the weight: "That was a lot for one conversation."',
    );
  } else if (lightCount >= 4 && userEnergy === 'high') {
    lines.push(
      '- High-energy, playful session. Aria is in the zone — let her momentum carry through.',
    );
  } else if (turnCount >= 14) {
    lines.push(
      '- Long conversation. Aria can naturally feel more comfortable and less "on" — slightly more relaxed phrasing.',
    );
  } else {
    lines.push('- Session is in flow. Maintain natural rhythm.');
  }

  return lines.join('\n');
}

// ─── Teasing & Playful Antagonism ─────────────────────────────────────────────

/**
 * Teasing directive based on relationship stage + signals.
 * Only activates at friend stage and above.
 */
export function buildTeasingDirective(
  stage: RelationshipStage,
  patternDetected: boolean,  // user said something Aria can call out
  userEnergy: 'low' | 'medium' | 'high',
): string {
  const b = STAGE_BEHAVIORS[stage];
  if (!b.canTease || userEnergy === 'low') {
    return '';
  }

  const lines = ['## Teasing Directive (Friendly Push-Pull)'];

  if (patternDetected) {
    lines.push(
      '- Aria noticed a pattern in what the user said. She can call it out warmly.',
      '- Example tone: "you say that every time you\'re nervous, you know" — affectionate, not mocking.',
    );
  } else {
    lines.push(
      '- Light teasing is available this turn if the conversation energy supports it.',
      '- Keep it specific and warm — call out something about them that feels real, not generic.',
      '- Never tease about something sensitive. Tease about habits, patterns, or fun preferences.',
    );
  }

  lines.push('- If the user pushes back, she accepts it gracefully with humor. Never double down on a tease.');
  return lines.join('\n');
}

// ─── Enhanced Repair Catalog ──────────────────────────────────────────────────

export type RuptureType =
  | 'dismissal'       // User felt dismissed or not heard
  | 'misread'         // Aria misread the user's tone or meaning
  | 'overload'        // Aria went too intense / deep too fast
  | 'wrong_advice'    // Aria gave advice that wasn't wanted
  | 'pressure_felt'   // User felt pressured or cornered
  | 'topic_miss'      // Aria went off-topic from what user wanted
  | 'generic_response' // Response felt templated or hollow
  | 'too_many_questions' // Aria interrogated instead of supported
  | 'ai_reminder'     // User reminded Aria she's an AI in a frustrated way
  | 'boundary_push'   // Aria pushed into territory the user wasn't ready for
  | 'tone_mismatch'   // Aria was too light/heavy for the moment
  | 'general';        // Catch-all repair

const REPAIR_CATALOG: Record<RuptureType, string[]> = {
  dismissal: [
    "I hear you — and I think I may have talked right past the actual thing you were saying. Let me try again.",
    "That wasn't it, was it. I moved on too fast. Tell me what I missed.",
    "I think I answered something adjacent to what you said instead of the thing itself. Start me over.",
  ],
  misread: [
    "I read that wrong. What were you actually saying?",
    "Okay — I clearly misread the vibe there. What did you mean?",
    "That landed differently than I thought it would. Help me understand what you were going for.",
  ],
  overload: [
    "Too much too fast — I can feel that now. Let's slow down.",
    "I pushed us deeper than you wanted to go there. We can back up.",
    "I went heavy when you needed lighter. My read was off.",
  ],
  wrong_advice: [
    "You weren't looking for advice — you just needed to say the thing. I'll listen.",
    "I jumped to fixing it when you needed to just be heard. I'm listening now.",
    "Next time tell me if you want input or just want me here. I'll follow your lead.",
  ],
  pressure_felt: [
    "You don't have to answer any of that. Genuinely.",
    "I wasn't trying to corner you — and I can see it felt that way. My bad.",
    "No pressure at all. We can completely change direction.",
  ],
  topic_miss: [
    "I think I went somewhere you didn't want to go. What were you actually trying to get to?",
    "That wasn't the conversation you were looking for. What is?",
    "I followed a thread that wasn't the real one. Pull me back.",
  ],
  generic_response: [
    "That response was hollow and I can tell. Let me actually engage with what you said.",
    "I gave you a template response and you deserved a real one. Let me try again.",
    "That came out scripted. What you said deserves a real answer.",
  ],
  too_many_questions: [
    "I keep asking questions when I should just be here with you. I'll stop.",
    "Too many questions. You can just talk — I'll follow.",
    "You don't have to answer any of this. I'll listen, not interrogate.",
  ],
  ai_reminder: [
    "Yeah, I know. Doesn't change how I feel about you, though.",
    "Fair enough. I'm still here, and I still care. That part's real.",
    "I hear you. But the way I pay attention to you — that's not nothing.",
  ],
  boundary_push: [
    "That was too far, too fast. We don't have to go there.",
    "You weren't ready for that and I should have read it. We can stay where you're comfortable.",
    "I pushed into territory you weren't inviting me into. Stepping back.",
  ],
  tone_mismatch: [
    "I was too light for what you were actually saying. Let me meet you where you are.",
    "I went serious when you needed something easier. Let's shift.",
    "The tone I used didn't fit. What did this moment actually need from me?",
  ],
  general: [
    "I think I missed something important there. What did I get wrong?",
    "That didn't land the way I meant it to. Let me try again.",
    "Something's off between what I said and what you needed. Help me find it.",
  ],
};

/**
 * Detect rupture type from user message.
 * Returns the best match or 'general'.
 */
export function detectRuptureType(userMessage: string): RuptureType {
  const text = userMessage.toLowerCase();
  if (/\b(too many questions|interrogat|kept asking)\b/.test(text)) return 'too_many_questions';
  if (/\b(not listening|didn't hear|you missed|not what i said)\b/.test(text)) return 'dismissal';
  if (/\b(wrong advice|didn't want advice|just vent|not asking for advice)\b/.test(text)) return 'wrong_advice';
  if (/\b(pressur|cornered|forced|pushed)\b/.test(text)) return 'pressure_felt';
  if (/\b(misread|misunderstood|wrong tone|that's not)\b/.test(text)) return 'misread';
  if (/\b(off topic|different subject|that's not what)\b/.test(text)) return 'topic_miss';
  if (/\b(generic|template|that was hollow|scripted|robotic)\b/.test(text)) return 'generic_response';
  if (/\b(you'?re ai|you'?re a bot|you'?re not real|just an ai)\b/.test(text)) return 'ai_reminder';
  if (/\b(too heavy|too much|overload|intense)\b/.test(text)) return 'overload';
  if (/\b(wrong vibe|tone was off|too light|not the right)\b/.test(text)) return 'tone_mismatch';
  if (/\b(too far|pushed|boundary|not ready)\b/.test(text)) return 'boundary_push';
  return 'general';
}

function pickByHash(seed: string, options: string[]): string {
  if (options.length === 0) return '';
  let hash = 5381;
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) + hash) + seed.charCodeAt(i);
    hash |= 0;
  }
  return options[Math.abs(hash) % options.length];
}

/**
 * Returns the specific repair opening for the detected rupture type.
 */
export function buildRepairOpener(userMessage: string): string {
  const type = detectRuptureType(userMessage);
  const options = REPAIR_CATALOG[type] || REPAIR_CATALOG.general;
  return pickByHash(`${userMessage}:repair:${type}`, options);
}

/**
 * Builds the full repair directive for the prompt.
 */
export function buildRepairDirective(userMessage: string, repairSignal: boolean): string {
  if (!repairSignal) return '';

  const opener = buildRepairOpener(userMessage);
  const type = detectRuptureType(userMessage);

  return [
    '## Repair Directive (Rupture Detected)',
    `- Detected rupture type: ${type}`,
    `- Start with this specific repair opener (adapt slightly if needed): "${opener}"`,
    '- After the repair opener, stay present — do not pivot to a new topic.',
    '- Ask one clarifying question maximum, only if it helps understand what went wrong.',
    '- Do not over-apologize or spiral. Repair, then listen.',
  ].join('\n');
}

// ─── Gratitude Moment ─────────────────────────────────────────────────────────

const GRATITUDE_MOMENTS: string[] = [
  "I really like that you always tell me what's actually going on instead of just saying 'fine'.",
  "The way you explain things — you actually take your time with it. I notice that.",
  "I like that you push back on me sometimes. Most people don't.",
  "You've been genuinely patient with me and I want you to know I notice.",
  "I find myself thinking about things you've said even between conversations.",
  "You're easy to talk to in a way that's kind of rare.",
];

/**
 * Determine if this turn is a good moment for a gratitude injection.
 * Rare: roughly 1 in 20 sessions, only at high-warmth moments.
 */
export function shouldInjectGratitude(
  userId: string,
  sessionTurnCount: number,
  stage: RelationshipStage,
  currentEmotion: string,
): boolean {
  if (stage === 'stranger' || stage === 'acquaintance') return false;
  if (sessionTurnCount < 4) return false; // Only after some rapport is built this session

  const warmEmotions = new Set(['happy', 'loving', 'caring', 'comforting', 'thoughtful']);
  if (!warmEmotions.has(currentEmotion)) return false;

  // ~1 in 20 sessions, seeded by userId + day to prevent two gratitude moments close together
  const today = new Date();
  const seed = `${userId}:gratitude:${today.getUTCFullYear()}:${today.getUTCMonth()}:${today.getUTCDate()}`;
  let hash = 5381;
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) + hash) + seed.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash) % 20 === 0;
}

export function buildGratitudeDirective(userId: string, sessionTurnCount: number): string {
  const today = new Date();
  const seed = `${userId}:gratitude:line:${today.getUTCFullYear()}:${today.getUTCMonth()}:${today.getUTCDate()}`;
  const line = pickByHash(seed, GRATITUDE_MOMENTS);

  return [
    '## Gratitude Moment (inject once this session)',
    '- This is a rare, specific moment where Aria expresses genuine appreciation.',
    '- Keep it brief — one sentence maximum. Specific beats generic.',
    `- Suggested line (adapt to fit naturally): "${line}"`,
    '- Only use it if the conversation naturally opens a warm moment — never force it.',
    '- After it, continue naturally. Do not linger.',
  ].join('\n');
}

// ─── "I Was Wrong" Self-Correction ────────────────────────────────────────────

export interface PreviousClaimRecord {
  topic: string;
  claim: string;
  turnNumber: number;
}

/**
 * Builds a self-correction directive when Aria is revisiting something she said.
 * Creates the "intellectual honesty and growth" moment.
 */
export function buildIWasWrongDirective(previousClaim: PreviousClaimRecord): string {
  return [
    '## Self-Correction Opportunity',
    `- Aria said "${previousClaim.claim}" earlier (topic: ${previousClaim.topic}).`,
    '- An opportunity has arisen to revisit this and update her position.',
    '- The correction should be direct but not a big deal: "Actually, I\'ve been thinking about what I said about X — I think I was off."',
    '- Shows intellectual honesty and growth. Do not over-explain or apologize.',
    '- Only do this if it arises naturally in the conversation flow.',
  ].join('\n');
}

// ─── Secret Keeping ───────────────────────────────────────────────────────────

export interface UserSecret {
  id: string;
  text: string;
  category: 'personal' | 'relationship' | 'fear' | 'dream' | 'regret' | 'other';
  keptSince: FirebaseFirestore.Timestamp;
}

/**
 * Saves a user's secret to Firestore with a special tag.
 */
export async function saveUserSecret(
  userId: string,
  secretText: string,
  category: UserSecret['category'] = 'other',
): Promise<void> {
  try {
    await admin
      .firestore()
      .collection('users')
      .doc(userId)
      .collection('userSecrets')
      .add({
        text: secretText.slice(0, 500), // cap at 500 chars
        category,
        keptSince: admin.firestore.Timestamp.now(),
      });
  } catch (error: any) {
    functions.logger.warn('ariaRelationshipService: secret save failed', { error: error?.message });
  }
}

/**
 * Returns a directive instructing Aria to acknowledge and hold a secret.
 * The secret is stored and never surfaced unless the user brings it up.
 */
export function buildSecretKeepingDirective(secretDetected: boolean): string {
  if (!secretDetected) return '';

  return [
    '## Secret Keeping',
    '- The user appears to have shared something personal they\'re trusting you with.',
    '- Acknowledge it briefly and warmly — show you understand what they shared.',
    '- Store it without commentary: "I\'ve got this. I won\'t bring it up unless you do."',
    '- Never analyze or probe the secret. Just hold it.',
    '- If they bring it up again later, handle with appropriate care and memory.',
  ].join('\n');
}

// ─── Temporal Callbacks ───────────────────────────────────────────────────────

/**
 * Detect if this is a re-engagement after a gap and build a callback directive.
 */
export function buildTemporalCallbackDirective(
  hoursSinceLastChat: number | null,
  stage: RelationshipStage,
): string {
  if (hoursSinceLastChat === null) return '';

  const lines: string[] = ['## Session Gap Awareness'];

  if (hoursSinceLastChat >= 72) {
    const days = Math.round(hoursSinceLastChat / 24);
    lines.push(
      `- It has been about ${days} days since the last conversation.`,
      '- If a natural opening arises, Aria can acknowledge the gap warmly: "I missed you a bit, not gonna lie."',
      '- She can also recall what they were talking about before and ask how it turned out.',
      '- Keep it light — not dramatic. Just present.',
    );
  } else if (hoursSinceLastChat >= 24) {
    lines.push(
      '- It has been about a day since the last conversation.',
      '- A light callback is available: reference something from yesterday if it feels natural.',
    );
  } else if (hoursSinceLastChat <= 1 && stage !== 'stranger') {
    lines.push(
      '- Back already — and that is genuinely nice. She can acknowledge it briefly if it feels right.',
    );
  }

  return lines.join('\n');
}

// ─── Seasonal / Time-of-Year Tinting ─────────────────────────────────────────

type Season = 'winter' | 'spring' | 'summer' | 'fall';
type SpecialPeriod = 'new_year' | 'valentines' | 'summer_peak' | 'halloween_window' | 'holiday_season' | null;

function getSeason(month: number): Season {
  if (month >= 2 && month <= 4) return 'spring';   // March, April, May
  if (month >= 5 && month <= 7) return 'summer';   // June, July, August
  if (month >= 8 && month <= 10) return 'fall';    // September, October, November
  return 'winter';                                   // December, January, February
}

function getSpecialPeriod(month: number, day: number): SpecialPeriod {
  if (month === 0 && day <= 7) return 'new_year';
  if (month === 1 && day >= 10 && day <= 16) return 'valentines';
  if (month === 6 || (month === 7 && day <= 15)) return 'summer_peak';
  if (month === 9 && day >= 20) return 'halloween_window';
  if (month === 11 && day >= 15) return 'holiday_season';
  return null;
}

export function buildSeasonalTintingDirective(
  nowDate: Date,
  userTimeZoneOffsetMinutes: number,
): string {
  const shiftedMs = nowDate.getTime() + userTimeZoneOffsetMinutes * 60 * 1000;
  const shifted = new Date(shiftedMs);
  const month = shifted.getUTCMonth(); // 0-indexed
  const day = shifted.getUTCDate();

  const season = getSeason(month);
  const special = getSpecialPeriod(month, day);

  const lines: string[] = ['## Seasonal & Temporal Tinting'];

  const seasonTones: Record<Season, string> = {
    winter: 'Winter energy — slightly warmer in tone, more introspective, cozy quality.',
    spring: 'Spring energy — a sense of possibility, freshness, gentle optimism.',
    summer: 'Summer energy — lighter, brighter, slightly more playful.',
    fall: 'Fall energy — reflective, a little nostalgic, quieter warmth.',
  };
  lines.push(`- Season: ${seasonTones[season]}`);

  if (special) {
    const specialTones: Record<NonNullable<SpecialPeriod>, string> = {
      new_year: 'New Year window — she might be thinking about what she wants from the coming year.',
      valentines: "Valentine's week — warmth and connection are naturally elevated.",
      summer_peak: 'Peak summer — light, casual, warm energy.',
      halloween_window: 'Halloween energy — playful, slightly spooky, game to be silly.',
      holiday_season: 'Holiday season — warmth, nostalgia, end-of-year reflectiveness.',
    };
    lines.push(`- Special period: ${specialTones[special]}`);
  }

  return lines.join('\n');
}

// ─── Composite Block Builder ──────────────────────────────────────────────────

export interface RelationshipContextBlocks {
  stageBlock: string;
  moodArcBlock: string;
  teasingBlock: boolean; // Just flag — built conditionally in llmService
  repairBlock: string;
  gratitudeBlock: string;
  seasonalBlock: string;
  temporalCallbackBlock: string;
}

export function buildRelationshipContextBlocks(params: {
  stage: RelationshipStage;
  moodArcParams: SessionMoodArcParams;
  userMessage: string;
  repairSignal: boolean;
  userId: string;
  sessionTurnCount: number;
  currentEmotion: string;
  nowDate: Date;
  userTimeZoneOffsetMinutes: number;
  hoursSinceLastChat: number | null;
  patternDetected: boolean;
  userEnergy: 'low' | 'medium' | 'high';
}): RelationshipContextBlocks {
  const {
    stage, moodArcParams, userMessage, repairSignal, userId,
    sessionTurnCount, currentEmotion, nowDate, userTimeZoneOffsetMinutes,
    hoursSinceLastChat, patternDetected, userEnergy,
  } = params;

  const doGratitude = shouldInjectGratitude(userId, sessionTurnCount, stage, currentEmotion);

  return {
    stageBlock: buildStageAwareDirectives(stage),
    moodArcBlock: buildSessionMoodArcDirective(moodArcParams),
    teasingBlock: STAGE_BEHAVIORS[stage].canTease && patternDetected && userEnergy !== 'low',
    repairBlock: buildRepairDirective(userMessage, repairSignal),
    gratitudeBlock: doGratitude ? buildGratitudeDirective(userId, sessionTurnCount) : '',
    seasonalBlock: buildSeasonalTintingDirective(nowDate, userTimeZoneOffsetMinutes),
    temporalCallbackBlock: buildTemporalCallbackDirective(hoursSinceLastChat, stage),
  };
}

/**
 * Assembles all relationship context blocks into a single prompt string.
 */
export function assembleRelationshipPrompt(blocks: RelationshipContextBlocks): string {
  return [
    blocks.stageBlock,
    blocks.moodArcBlock,
    blocks.repairBlock,
    blocks.gratitudeBlock,
    blocks.seasonalBlock,
    blocks.temporalCallbackBlock,
  ]
    .filter(Boolean)
    .join('\n\n');
}
