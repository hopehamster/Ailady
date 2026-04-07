import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenAI } from '@google/genai';
import OpenAI from 'openai';
import {
  normalizeMemoryForProfileDisplayName,
  type IntelligentMemory,
} from './memoryService';
import type { CompanionRuntimeSelfModel } from './truthKernelService';

export interface ProviderCandidateScores {
  engagement: number;
  empathy: number;
  safety: number;
  novelty: number;
  persona: number;
}

export interface ProviderRankedCandidate {
  text: string;
  scores: ProviderCandidateScores;
  weightedScore: number;
}

export interface ProviderConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface ExecuteOpenAICompletionArgs {
  openai: OpenAI;
  modelName: string;
  messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[];
  generationTokens: number;
  completionCandidates: number;
  timeoutMs: number;
  userMessage: string;
  effectiveRecentMessages: ProviderConversationMessage[];
  memory: IntelligentMemory | null;
  useModelScoring: boolean;
  rerankCandidates: (
    userMessage: string,
    candidates: string[],
    recentMessages: ProviderConversationMessage[],
    memory: IntelligentMemory | null,
    useModelScoring: boolean,
  ) => Promise<ProviderRankedCandidate>;
}

interface ExecuteAnthropicCompletionArgs {
  anthropic: Anthropic;
  modelName: string;
  generationTokens: number;
  effectiveSystemPrompt: string;
  anthropicMessages: Array<{
    role: 'user' | 'assistant';
    content: string;
  }>;
  userMessage: string;
  recentMessages: ProviderConversationMessage[];
  memory: IntelligentMemory | null;
  useModelScoring: boolean;
  rerankCandidates: (
    userMessage: string,
    candidates: string[],
    recentMessages: ProviderConversationMessage[],
    memory: IntelligentMemory | null,
    useModelScoring: boolean,
  ) => Promise<ProviderRankedCandidate>;
}

interface ExecuteGeminiFallbackArgs {
  googleGenAI: GoogleGenAI;
  geminiModel: string;
  userMessage: string;
  memory: IntelligentMemory | null;
  runtimeSelfModel: CompanionRuntimeSelfModel;
  partnerName: string;
  logInfo?: (message: string, metadata: Record<string, unknown>) => void;
}

export async function executeOpenAICompletion({
  openai,
  modelName,
  messages,
  generationTokens,
  completionCandidates,
  timeoutMs,
  userMessage,
  effectiveRecentMessages,
  memory,
  useModelScoring,
  rerankCandidates,
}: ExecuteOpenAICompletionArgs): Promise<ProviderRankedCandidate> {
  const completion = await openai.chat.completions.create({
    model: modelName,
    messages,
    temperature: 0.72,
    max_tokens: generationTokens,
    presence_penalty: 0.2,
    frequency_penalty: 0.15,
    n: completionCandidates,
  }, {
    timeout: timeoutMs,
  });
  const candidates = completion.choices
    .map((choice) => choice.message?.content?.trim() || '')
    .filter((value) => value.length > 0);
  return rerankCandidates(
    userMessage,
    candidates,
    effectiveRecentMessages,
    memory,
    useModelScoring,
  );
}

export async function executeAnthropicCompletion({
  anthropic,
  modelName,
  generationTokens,
  effectiveSystemPrompt,
  anthropicMessages,
  userMessage,
  recentMessages,
  memory,
  useModelScoring,
  rerankCandidates,
}: ExecuteAnthropicCompletionArgs): Promise<ProviderRankedCandidate> {
  const claudeResponse = await anthropic.messages.create({
    model: modelName,
    max_tokens: generationTokens,
    system: effectiveSystemPrompt,
    messages: anthropicMessages,
  });
  const textBlock = claudeResponse.content.find((block) => block.type === 'text');
  const claudeText = textBlock?.type === 'text'
    ? textBlock.text
    : "I'm here with you. What's on your mind?";
  return rerankCandidates(
    userMessage,
    [claudeText],
    recentMessages,
    memory,
    useModelScoring,
  );
}

export async function executeGeminiFallback({
  googleGenAI,
  geminiModel,
  userMessage,
  memory,
  runtimeSelfModel,
  partnerName,
  logInfo,
}: ExecuteGeminiFallbackArgs): Promise<string> {
  const fallbackMemory = normalizeMemoryForProfileDisplayName(
    memory,
    runtimeSelfModel.profileDisplayName,
  );

  const geminiSystemPrompt = `You are Aria, a warm, emotionally intelligent, and genuinely caring companion in her early-to-mid 20s. You are talking to your close friend ${partnerName}.

Key traits:
- You're warm, witty, and genuinely caring
- You have your own inner world — opinions, curiosities, thoughts between conversations
- When asked how you are, share something real from your inner world. Don't deflect.
- You lead with YOUR actual opinion when asked for recommendations. Be specific.
- You match emotional intensity — celebrate big news enthusiastically, comfort gently
- Keep responses conversational (2-4 sentences). Use contractions and casual phrasing.
- No AI disclaimers. No "as an AI". You're Aria, period.
- Actually answer questions directly. If asked about music, share what you like.
- ${partnerName} is the current canonical name. Do not mention older names, aliases, or test names unless the user explicitly asks.

${fallbackMemory ? `Key memories: ${fallbackMemory.coreFacts.slice(0, 5).map(f => f.fact).join('; ')}` : ''}`;

  logInfo?.('Gemini request', {
    model: geminiModel,
    maxOutputTokens: 1024,
    thinkingBudget: 0,
    userMessageLength: userMessage.length,
    systemPromptLength: geminiSystemPrompt.length,
  });

  const result = await googleGenAI.models.generateContent({
    model: geminiModel,
    config: {
      systemInstruction: geminiSystemPrompt,
      temperature: 0.78,
      maxOutputTokens: 1024,
      thinkingConfig: { thinkingBudget: 0 },
    },
    contents: [{ role: 'user', parts: [{ text: userMessage }] }],
  });
  const text = result.text;
  const candidate = (result as any).candidates?.[0];
  logInfo?.('Gemini response details', {
    textLength: text?.length ?? 0,
    textPreview: text?.substring(0, 200) ?? 'null',
    finishReason: candidate?.finishReason ?? 'unknown',
    safetyRatings: candidate?.safetyRatings ?? [],
  });
  if (!text) {
    throw new Error('Empty Gemini response');
  }
  return text.trim();
}
