import OpenAI from 'openai';
import {
  buildConversationPolicyDirectives,
  buildConversationPolicyEnhancers,
} from './conversationPolicyService';
import type {
  ConversationPolicyPlanSource,
  ConversationPolicyPromptContext,
  ConversationPolicySignalSource,
} from '@aria/shared-types';
import { type PromptAugmentShape, compactPromptAugmentsForRoute } from './promptCostService';
import { buildChatModeOverlayBlock, type ChatMode } from './chatModeService';
import { composePrompt, type PromptComponent } from './promptComposer';
import { buildConnectionKnowledgeBlock } from './connectionKnowledge';

/**
 * Post-history instruction — the r/SillyTavernAI / SillyTavern-docs technique.
 * The anti-canned / anti-parrot directive is FAR stronger when placed right
 * before generation (appended to the final user turn) than buried in the
 * prefix-cached system prompt. Confirmed by community power-users tracking
 * parroting across dozens of models: "it has to be in post-instruction, close
 * to the actual response — no luck removing parroting using just the system
 * prompt at the beginning." Flag-gated; default OFF = production byte-identical.
 */
function postHistoryGuidance(): string {
  // process.env read at function-time (per-call), not module scope.
  const on = (process.env.POST_HISTORY_GUIDANCE_ENABLED ?? 'false').toLowerCase() === 'true';
  if (!on) return '';
  return '\n\n[Reply as Aria — a real person talking to someone she loves, not an assistant. Do NOT repeat or paraphrase what was just said back to them. No throat-clearing openers ("that sounds...", "I\'m here for you"). Be specific and bring something of your own: react, share a real detail, or ask something you actually want to know. Let your length vary naturally; never wrap up flat.]';
}

export interface ResponseAssemblyMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface BuildResponseAssemblyArgs {
  systemPrompt: string;
  promptAugments: PromptAugmentShape;
  route: 'fast' | 'quality';
  preferRecentExchange: boolean;
  recentExchangePriorityBlock: string;
  datesContextBlock?: string | null;
  chatMode?: ChatMode;
  /** Phase 3.1 consume side: cached summary of older turns, injected as
   * additive recall. Empty/undefined = no-op (production byte-identical). */
  historySummaryBlock?: string;
  userMessage: string;
  recentMessages: ResponseAssemblyMessage[];
  policyPlan: ConversationPolicyPlanSource;
  policySignals: ConversationPolicySignalSource;
  policyContext: ConversationPolicyPromptContext;
  /** P4 — optional intended-emotion (an EmotionKey). Empty/undefined => no hint
   * => byte-identical. Adds a 1-line inner-tone hint to the working window so the
   * rendered text matches the avatar emotion the ego intends this turn. */
  intendedEmotion?: string;
  /** SOUL B1 (#39) — the psyche's structured want rendered as an inner-state
   * block (innerStateNarratorService). Empty/undefined => filtered out =>
   * byte-identical. Placed before the tone hint in the working window: the
   * WANT, then its color. */
  innerStateBlock?: string;
}

export interface ResponseAssembly {
  effectiveRecentMessages: ResponseAssemblyMessage[];
  effectiveSystemPrompt: string;
  messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[];
  anthropicMessages: Array<{
    role: 'user' | 'assistant';
    content: string;
  }>;
}

export function buildResponseAssembly({
  systemPrompt,
  promptAugments,
  route,
  preferRecentExchange,
  recentExchangePriorityBlock,
  datesContextBlock,
  chatMode,
  historySummaryBlock,
  userMessage,
  recentMessages,
  policyPlan,
  policySignals,
  policyContext,
  intendedEmotion,
  innerStateBlock,
}: BuildResponseAssemblyArgs): ResponseAssembly {
  const effectiveRecentMessages =
    route === 'fast' ? recentMessages.slice(-8) : recentMessages;

  const compactedPromptAugments = compactPromptAugmentsForRoute(promptAugments, {
    route,
    preferRecentExchange,
  });

  const chatModeBlock = buildChatModeOverlayBlock(chatMode);

  const policyDirectivesBlock = buildConversationPolicyDirectives(
    policyPlan,
    policySignals,
    policyContext,
  );
  const policyEnhancersBlock = buildConversationPolicyEnhancers(
    userMessage,
    policyPlan,
    policySignals,
    policyContext,
  );

  // Priority-based assembly via composePrompt:
  //   persona_core (100) + user_semantic_kv (80) form the stable prefix
  //   (cache hit zone for Anthropic prompt caching). recent_recall (60) +
  //   working_window (40) form the volatile tail. The cache boundary marker
  //   sits between.
  // Policy directives + enhancers stay in working_window (end of prompt) to
  // preserve their attention recency advantage from the previous linear
  // assembly — they shape Aria's tone, length, and question discipline, and
  // moving them up the prompt would shift voice. safety_policy slot left
  // unused for now (reserved for future hard-boundary content that benefits
  // from the cache prefix without altering conversational voice).
  // Connection Knowledge (Phase 1) — flag-gated, default OFF. Returns '' when
  // disabled, so the empty-string filter below drops it and the production
  // prompt is byte-identical to pre-flag behavior. Lives on the stable
  // (cacheable) prefix side as foundational, voice-shaping knowledge.
  const connectionKnowledgeBlock = buildConnectionKnowledgeBlock();

  const userSemanticKv = [
    connectionKnowledgeBlock,
    compactedPromptAugments.personalityBlock,
    compactedPromptAugments.personaVoiceBlock,
    compactedPromptAugments.innerLifeBlock,
    compactedPromptAugments.relationshipBlock,
    compactedPromptAugments.emotionalMemoryBlock,
    compactedPromptAugments.moodBlock,
    compactedPromptAugments.loreBlock,
    datesContextBlock ?? '',
  ]
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .join('\n\n');

  // historySummaryBlock first: it summarizes turns OLDER than the verbatim
  // window, so chronologically it precedes the recent exchange. Empty when the
  // compaction flag is off -> filtered out -> prompt unchanged.
  const recentRecall = [
    historySummaryBlock ?? '',
    compactedPromptAugments.semanticRecallBlock,
    recentExchangePriorityBlock,
  ]
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .join('\n\n');

  // P4 — intended-emotion hint (flag-gated by the caller; empty => filtered out
  // => byte-identical). Placed last in the working window for max recency. The
  // "never name the feeling" clause preserves the believability rule (drives show
  // in behavior, never announced).
  const intendedEmotionBlock = intendedEmotion
    ? `[Inner tone for this turn: ${intendedEmotion}. Let it color your words naturally — never name the feeling, just let it show.]`
    : '';

  const workingWindow = [
    chatModeBlock,
    policyDirectivesBlock,
    policyEnhancersBlock,
    innerStateBlock ?? '',
    intendedEmotionBlock,
  ]
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .join('\n\n');

  const components: PromptComponent[] = [
    { name: 'persona_core', text: systemPrompt, stable: true },
    { name: 'user_semantic_kv', text: userSemanticKv, stable: true },
    { name: 'recent_recall', text: recentRecall, stable: false },
    { name: 'working_window', text: workingWindow, stable: false },
  ];

  const composed = composePrompt(components);
  const effectiveSystemPrompt = composed.text;

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    {
      role: 'system',
      content: effectiveSystemPrompt,
    },
    ...effectiveRecentMessages.map((msg) => ({
      role: msg.role,
      content: msg.content,
    })),
    {
      role: 'user',
      content: userMessage + postHistoryGuidance(),
    },
  ];

  const anthropicMessages = messages.slice(1).map((msg) => ({
    role: msg.role as 'user' | 'assistant',
    content: msg.content as string,
  }));

  return {
    effectiveRecentMessages,
    effectiveSystemPrompt,
    messages,
    anthropicMessages,
  };
}
