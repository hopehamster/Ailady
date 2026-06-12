import OpenAI from 'openai';
import {
  buildConversationPolicyDirectives,
  buildConversationPolicyEnhancers,
  type ConversationPolicyPlanSource,
  type ConversationPolicyPromptContext,
  type ConversationPolicySignalSource,
} from './conversationPolicyService';
import { type PromptAugmentShape, compactPromptAugmentsForRoute } from './promptCostService';
import { buildChatModeOverlayBlock, type ChatMode } from './chatModeService';
import { composePrompt, type PromptComponent } from './promptComposer';
import { buildConnectionKnowledgeBlock } from './connectionKnowledge';

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

  const workingWindow = [chatModeBlock, policyDirectivesBlock, policyEnhancersBlock]
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
      content: userMessage,
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
