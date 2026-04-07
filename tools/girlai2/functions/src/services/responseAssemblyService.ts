import OpenAI from 'openai';
import {
  buildConversationPolicyDirectives,
  buildConversationPolicyEnhancers,
  type ConversationPolicyPlanSource,
  type ConversationPolicyPromptContext,
  type ConversationPolicySignalSource,
} from './conversationPolicyService';
import { type PromptAugmentShape, compactPromptAugmentsForRoute, composeSystemPromptSections } from './promptCostService';
import { buildChatModeOverlayBlock, type ChatMode } from './chatModeService';

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

  const effectiveSystemPrompt = composeSystemPromptSections([
    systemPrompt,
    compactedPromptAugments.personalityBlock,
    compactedPromptAugments.personaVoiceBlock,
    compactedPromptAugments.innerLifeBlock,
    compactedPromptAugments.relationshipBlock,
    compactedPromptAugments.emotionalMemoryBlock,
    compactedPromptAugments.moodBlock,
    compactedPromptAugments.loreBlock,
    compactedPromptAugments.semanticRecallBlock,
    recentExchangePriorityBlock,
    datesContextBlock ?? '',
    chatModeBlock,
    buildConversationPolicyDirectives(
      policyPlan,
      policySignals,
      policyContext,
    ),
    buildConversationPolicyEnhancers(
      userMessage,
      policyPlan,
      policySignals,
      policyContext,
    ),
  ]);

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
