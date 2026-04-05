import {
  buildEmotionalMemoryThreadingBlock,
  getHoursSinceLastChat,
  getInteractionCount,
  getLastConversationTopic,
  getLastSessionEmotionalTone,
  getOpenLoopsForPrompt,
  hasConflictingProfileNameReference,
  normalizeMemoryForProfileDisplayName,
  recallSemanticMemories,
  buildSemanticRecallContext,
  type IntelligentMemory,
} from './memoryService';
import {
  getPersonalityProfile,
  buildPersonalityPromptBlock,
} from './personalityService';
import {
  getActivatedLoreSnippets,
  buildLorePromptBlock,
} from './lorebookService';
import {
  buildAriaIsmsBlock,
  buildNameUseDirective,
  buildNonVerbalSubtextBlock,
  buildSentenceVarietyBlock,
} from './ariaPersonaService';
import {
  buildInnerLifePromptBlock,
  getAriaOpinions,
  type InnerLifeContext,
} from './ariaInnerLifeService';
import {
  assembleRelationshipPrompt,
  buildRelationshipContextBlocks,
  getRelationshipStage,
  type SessionMoodArcParams,
  type RelationshipStage,
} from './ariaRelationshipService';
import type { CompanionRuntimeSelfModel } from './truthKernelService';

export interface PromptAugments {
  personalityBlock: string;
  loreBlock: string;
  semanticRecallBlock: string;
  personaVoiceBlock: string;
  innerLifeBlock: string;
  relationshipBlock: string;
  emotionalMemoryBlock: string;
  moodBlock: string;
}

export interface PromptAugmentOptions {
  includeLore?: boolean;
  includeSemanticRecall?: boolean;
}

export interface PromptTemporalContext {
  now?: Date;
  timeZoneOffsetMinutes?: number;
}

export interface PromptConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface UserMoodSignal {
  energy: 'low' | 'medium' | 'high';
  tint: string;
}

function detectUserMoodSignal(
  userMessage: string,
  recentMessages: PromptConversationMessage[] = [],
): UserMoodSignal {
  const msg = userMessage.trim();
  const words = msg.split(/\s+/).filter(Boolean);
  const wordCount = words.length;

  const highExclamations = (msg.match(/!/g) ?? []).length >= 2;
  const allCaps = wordCount >= 2 && msg === msg.toUpperCase() && /[A-Z]/.test(msg);
  const happyWords = /\b(amazing|omg|omfg|lol|lmao|haha|hehe|excited|can'?t wait|love it|awesome|wow|yay|woohoo|ecstatic|thrilled|great|fantastic|omg|finally|!!)\b/i.test(
    msg,
  );
  const energeticOpener = /^(hey!|hi!|omg|lol|haha|wow|yay|finally)/i.test(msg);

  const sadWords = /\b(sad|depressed|tired|exhausted|drained|lonely|alone|empty|hopeless|hate myself|worthless|numb|crying|cry|hurt|hurts|anxious|anxiet|miss you|missed you|bad day|rough day|hard day|struggling|idk|whatever|nevermind)\b/i.test(
    msg,
  );
  const veryShortFlat = wordCount <= 3 && !highExclamations && !happyWords;
  const singleDotOrEllipsis = /^\.*$/.test(msg) || msg === '...' || msg === '.';
  const questionFatigue = wordCount <= 5 && /^(why|what|how|when|idk|i don'?t know)/i.test(msg);

  const recentUserMessages = recentMessages
    .filter((m) => m.role === 'user')
    .slice(-4)
    .map((m) => m.content.trim());
  const avgRecentLength = recentUserMessages.length
    ? recentUserMessages.reduce((sum, m) => sum + m.split(/\s+/).length, 0) /
      recentUserMessages.length
    : wordCount;

  let score = 0;
  if (highExclamations) score += 2;
  if (allCaps) score += 2;
  if (happyWords) score += 2;
  if (energeticOpener) score += 1;
  if (wordCount >= 30) score += 1;
  if (avgRecentLength >= 25) score += 1;

  if (sadWords) score -= 3;
  if (veryShortFlat) score -= 2;
  if (singleDotOrEllipsis) score -= 4;
  if (questionFatigue) score -= 1;

  if (score >= 3) {
    return {
      energy: 'high',
      tint: happyWords ? 'playful and excited' : 'energetic',
    };
  }

  if (score <= -2) {
    return {
      energy: 'low',
      tint: sadWords ? 'emotionally heavy — user may need support' : 'low energy or terse',
    };
  }

  return {
    energy: 'medium',
    tint: 'conversational',
  };
}

export async function buildPromptAugments(
  userMessage: string,
  userId: string | undefined,
  memory: IntelligentMemory | null,
  runtimeSelfModel: CompanionRuntimeSelfModel,
  preferredUserName: string,
  options: PromptAugmentOptions = {},
  temporalContext?: PromptTemporalContext,
  recentMessages?: PromptConversationMessage[],
): Promise<PromptAugments> {
  const empty: PromptAugments = {
    personalityBlock: '',
    loreBlock: '',
    semanticRecallBlock: '',
    personaVoiceBlock: '',
    innerLifeBlock: '',
    relationshipBlock: '',
    emotionalMemoryBlock: '',
    moodBlock: '',
  };

  try {
    const effectiveMemory = normalizeMemoryForProfileDisplayName(
      memory,
      runtimeSelfModel.profileDisplayName,
    );
    const includeLore = options.includeLore !== false;
    const includeSemanticRecall = options.includeSemanticRecall !== false;
    const openLoopHints = effectiveMemory
      ? getOpenLoopsForPrompt(effectiveMemory, 3)
          .filter(
            (loop) =>
              !hasConflictingProfileNameReference(
                loop.summary,
                runtimeSelfModel.profileDisplayName,
              ),
          )
          .map((loop) => loop.summary)
      : [];

    const [profile, loreSnippets, semanticRecalls, ariaOpinions] = await Promise.all([
      getPersonalityProfile('aria_default'),
      includeLore
        ? getActivatedLoreSnippets({
            userMessage,
            openLoopHints,
            maxChars: 600,
            maxEntries: 3,
          })
        : Promise.resolve([]),
      includeSemanticRecall && userId
        ? recallSemanticMemories(userId, userMessage, {
            topK: 8,
            keep: 4,
            candidates: 200,
          })
        : Promise.resolve([]),
      userId ? getAriaOpinions(userId) : Promise.resolve([]),
    ]);

    const now = temporalContext?.now ?? new Date();
    const tzOffset = temporalContext?.timeZoneOffsetMinutes ?? 0;
    const shiftedMs = now.getTime() + tzOffset * 60 * 1000;
    const shiftedDate = new Date(shiftedMs);
    const hourOfDay = shiftedDate.getUTCHours();
    const dayOfWeek = shiftedDate.getUTCDay();

    const sessionTurnCount = Math.floor((recentMessages?.length ?? 0) / 2);
    const lastEmotionalTone = getLastSessionEmotionalTone(effectiveMemory);
    const lastConversationTopic = getLastConversationTopic(effectiveMemory);
    const hoursSinceLastChat = getHoursSinceLastChat(effectiveMemory);
    const interactionCount = getInteractionCount(effectiveMemory);

    const pacingProfile = effectiveMemory?.pacingProfile;
    const avgSentimentScore = pacingProfile
      ? (pacingProfile.intimacy + pacingProfile.depth) / 2
      : 0.5;
    const stage = getRelationshipStage(
      runtimeSelfModel.relationshipDays,
      interactionCount,
      avgSentimentScore,
    );

    const recentEmotions: string[] = (effectiveMemory?.emotionalMoments ?? [])
      .slice(-5)
      .map((m) => m.emotion)
      .filter(Boolean);
    const currentEmotionProxy =
      recentEmotions[recentEmotions.length - 1] || 'neutral';

    const moodSignal = detectUserMoodSignal(userMessage, recentMessages ?? []);

    const moodArcParams: SessionMoodArcParams = {
      turnCount: sessionTurnCount,
      recentEmotions,
      currentEmotion: currentEmotionProxy,
      repairSignal: false,
      userEnergy: moodSignal.energy,
    };

    const relationshipBlocks = buildRelationshipContextBlocks({
      stage: stage as RelationshipStage,
      moodArcParams,
      userMessage,
      repairSignal: false,
      userId: userId || '',
      sessionTurnCount,
      currentEmotion: currentEmotionProxy,
      nowDate: now,
      userTimeZoneOffsetMinutes: tzOffset,
      hoursSinceLastChat,
      patternDetected: false,
      userEnergy: moodSignal.energy,
    });

    const innerLifeCtx: InnerLifeContext = {
      hourOfDay,
      dayOfWeek,
      relationshipDays: runtimeSelfModel.relationshipDays,
      lastEmotionalTone: lastEmotionalTone || undefined,
      lastConversationTopic: lastConversationTopic || undefined,
    };

    const innerLifeBlock = userId
      ? buildInnerLifePromptBlock({
          userId,
          ctx: innerLifeCtx,
          opinions: ariaOpinions,
        })
      : '';

    const personaVoiceBlock = [
      buildAriaIsmsBlock(),
      buildNonVerbalSubtextBlock(),
      buildNameUseDirective(preferredUserName),
      buildSentenceVarietyBlock(),
    ]
      .filter(Boolean)
      .join('\n\n');

    const emotionalMemoryBlock =
      buildEmotionalMemoryThreadingBlock(effectiveMemory);

    const moodBlock =
      moodSignal.energy !== 'medium'
        ? `## User Energy Signal (this turn)\nDetected user energy: ${moodSignal.energy}. Mood tint: ${moodSignal.tint}.\n` +
          (moodSignal.energy === 'high'
            ? 'Aria should match their energy — be warm, playful, and responsive. This is a high-engagement moment.'
            : 'Aria should be gentle, softer in tone, less performative. The user may need warmth or space — read carefully before adding humor.')
        : '';

    return {
      personalityBlock: buildPersonalityPromptBlock(profile, runtimeSelfModel),
      loreBlock: buildLorePromptBlock(loreSnippets),
      semanticRecallBlock: buildSemanticRecallContext(
        semanticRecalls.filter(
          (recall) =>
            !hasConflictingProfileNameReference(
              recall.text,
              runtimeSelfModel.profileDisplayName,
            ),
        ),
        600,
      ),
      personaVoiceBlock,
      innerLifeBlock,
      relationshipBlock: assembleRelationshipPrompt(relationshipBlocks),
      emotionalMemoryBlock,
      moodBlock,
    };
  } catch {
    return empty;
  }
}
