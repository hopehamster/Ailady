import OpenAI from 'openai';
import type Anthropic from '@anthropic-ai/sdk';
import type { GoogleGenAI } from '@google/genai';
import { normalizeMemoryForProfileDisplayName } from './memoryHelpers';
import type { IntelligentMemory, CompanionRuntimeSelfModel } from '@aria/shared-types';
import type { TraceHandle } from '../observability/langfuse';
import { estimateChatInputTokens, auditTokenDrift } from './tokenObservability';
import { buildAnthropicSystemParam } from './anthropicCache';

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
  trace?: TraceHandle;
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
  trace?: TraceHandle;
}

interface ExecuteGeminiFallbackArgs {
  googleGenAI: GoogleGenAI;
  geminiModel: string;
  userMessage: string;
  memory: IntelligentMemory | null;
  runtimeSelfModel: CompanionRuntimeSelfModel;
  partnerName: string;
  /** The FULL composed system prompt (persona + connection knowledge + policy).
   * REQUIRED — Aria must never speak from a generic mini-prompt. */
  effectiveSystemPrompt: string;
  /** Conversation history INCLUDING the current user message as the last
   * entry. REQUIRED — a reply without history cannot be conversational. */
  conversationMessages: Array<{ role: 'user' | 'assistant'; content: string }>;
  logInfo?: (message: string, metadata: Record<string, unknown>) => void;
  trace?: TraceHandle;
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
  trace,
}: ExecuteOpenAICompletionArgs): Promise<ProviderRankedCandidate> {
  const start = Date.now();
  // Phase 0 P2 — strip cache-boundary sentinel before sending. OpenAI handles
  // prefix caching automatically by longest-common-prefix; the sentinel is
  // only meaningful for Anthropic's cache_control marker.
  const CACHE_BOUNDARY = '<!--PROMPT_CACHE_BOUNDARY-->';
  const cleanedMessages = messages.map((m) => {
    if (typeof m.content === 'string' && m.content.includes(CACHE_BOUNDARY)) {
      return { ...m, content: m.content.split(CACHE_BOUNDARY).join('') };
    }
    return m;
  });
  let completion: OpenAI.Chat.Completions.ChatCompletion;
  try {
    completion = await openai.chat.completions.create({
      model: modelName,
      messages: cleanedMessages,
      temperature: 0.72,
      max_tokens: generationTokens,
      presence_penalty: 0.2,
      frequency_penalty: 0.15,
      n: completionCandidates,
    }, {
      timeout: timeoutMs,
    });
  } catch (err: any) {
    trace?.recordLLMSpan({
      name: 'openai.chat',
      model: modelName,
      input: messages,
      latencyMs: Date.now() - start,
      error: err?.message ?? String(err),
      metadata: { provider: 'openai', timeoutMs },
    });
    throw err;
  }
  const candidates = completion.choices
    .map((choice) => choice.message?.content?.trim() || '')
    .filter((value) => value.length > 0);
  trace?.recordLLMSpan({
    name: 'openai.chat',
    model: modelName,
    input: cleanedMessages,
    output: candidates,
    tokensIn: completion.usage?.prompt_tokens,
    tokensOut: completion.usage?.completion_tokens,
    latencyMs: Date.now() - start,
    metadata: {
      provider: 'openai',
      candidates: completionCandidates,
      timeoutMs,
    },
  });
  auditTokenDrift({
    provider: 'openai',
    model: modelName,
    estimated: estimateChatInputTokens({
      messages: messages.map((m) => ({
        role: String(m.role),
        content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content ?? ''),
      })),
    }),
    observed: completion.usage?.prompt_tokens ?? 0,
  });
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
  trace,
}: ExecuteAnthropicCompletionArgs): Promise<ProviderRankedCandidate> {
  const start = Date.now();
  // Phase 0 P2 / Phase 3.3 — split at the cache-boundary sentinel so Anthropic
  // caches the stable prefix (shared helper, single source of truth used by the
  // streaming path too). Falls back to whole-string send if sentinel absent.
  // Per oreilly_ai_perf.md Finding #1 + Anthropic prompt-caching docs.
  const systemForAnthropic = buildAnthropicSystemParam(effectiveSystemPrompt);
  let claudeResponse: Awaited<ReturnType<typeof anthropic.messages.create>>;
  try {
    claudeResponse = await anthropic.messages.create({
      model: modelName,
      max_tokens: generationTokens,
      system: systemForAnthropic as any,
      messages: anthropicMessages,
    });
  } catch (err: any) {
    trace?.recordLLMSpan({
      name: 'anthropic.message',
      model: modelName,
      input: anthropicMessages,
      latencyMs: Date.now() - start,
      error: err?.message ?? String(err),
      metadata: { provider: 'anthropic' },
    });
    throw err;
  }
  // Type narrow — non-streaming response.
  if (!('content' in claudeResponse)) {
    throw new Error('anthropic: unexpected streaming response');
  }
  const textBlock = claudeResponse.content.find((block) => block.type === 'text');
  const claudeText = textBlock?.type === 'text'
    ? textBlock.text
    : "I'm here with you. What's on your mind?";
  trace?.recordLLMSpan({
    name: 'anthropic.message',
    model: modelName,
    input: anthropicMessages,
    output: claudeText,
    tokensIn: (claudeResponse as any).usage?.input_tokens,
    tokensOut: (claudeResponse as any).usage?.output_tokens,
    latencyMs: Date.now() - start,
    metadata: {
      provider: 'anthropic',
      // Phase 3.3 — surface prompt-cache effectiveness in Langfuse. On a cache
      // hit cacheReadTokens > 0 (stable prefix re-read at ~10% cost); on the
      // first call cacheCreationTokens > 0 (prefix written to cache).
      cacheCreationTokens: (claudeResponse as any).usage?.cache_creation_input_tokens ?? 0,
      cacheReadTokens: (claudeResponse as any).usage?.cache_read_input_tokens ?? 0,
    },
  });
  auditTokenDrift({
    provider: 'anthropic',
    model: modelName,
    estimated: estimateChatInputTokens({
      systemPrompt: effectiveSystemPrompt,
      messages: anthropicMessages.map((m: any) => ({
        role: String(m.role),
        content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content ?? ''),
      })),
    }),
    observed: (claudeResponse as any).usage?.input_tokens ?? 0,
  });
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
  effectiveSystemPrompt,
  conversationMessages,
  logInfo,
  trace,
}: ExecuteGeminiFallbackArgs): Promise<string> {
  // 2026-06-12 — the generic mini-prompt that used to live here is GONE per
  // the no-canned-content edict: Aria always speaks from the FULL composed
  // system prompt (persona + connection knowledge + policy) with the real
  // conversation history, regardless of which provider serves the turn.
  // `memory`/`runtimeSelfModel`/`partnerName` are retained in the args shape
  // for trace context only.
  void normalizeMemoryForProfileDisplayName(memory, runtimeSelfModel.profileDisplayName);
  void partnerName;

  const contents = conversationMessages.map((m) => ({
    role: m.role === 'assistant' ? ('model' as const) : ('user' as const),
    parts: [{ text: m.content }],
  }));
  if (contents.length === 0) {
    contents.push({ role: 'user' as const, parts: [{ text: userMessage }] });
  }

  logInfo?.('Gemini request', {
    model: geminiModel,
    maxOutputTokens: 1024,
    thinkingBudget: 0,
    userMessageLength: userMessage.length,
    systemPromptLength: effectiveSystemPrompt.length,
    historyTurns: contents.length,
  });

  const start = Date.now();
  let result: Awaited<ReturnType<typeof googleGenAI.models.generateContent>>;
  try {
    result = await googleGenAI.models.generateContent({
      model: geminiModel,
      config: {
        systemInstruction: effectiveSystemPrompt,
        temperature: 0.78,
        maxOutputTokens: 1024,
        thinkingConfig: { thinkingBudget: 0 },
      },
      contents,
    });
  } catch (err: any) {
    trace?.recordLLMSpan({
      name: 'gemini.fallback',
      model: geminiModel,
      input: userMessage,
      latencyMs: Date.now() - start,
      error: err?.message ?? String(err),
      metadata: { provider: 'gemini', fallback: true },
    });
    throw err;
  }
  const text = result.text;
  const candidate = (result as any).candidates?.[0];
  logInfo?.('Gemini response details', {
    textLength: text?.length ?? 0,
    textPreview: text?.substring(0, 200) ?? 'null',
    finishReason: candidate?.finishReason ?? 'unknown',
    safetyRatings: candidate?.safetyRatings ?? [],
  });
  trace?.recordLLMSpan({
    name: 'gemini.fallback',
    model: geminiModel,
    input: userMessage,
    output: text ?? '',
    tokensIn: (result as any).usageMetadata?.promptTokenCount,
    tokensOut: (result as any).usageMetadata?.candidatesTokenCount,
    latencyMs: Date.now() - start,
    metadata: {
      provider: 'gemini',
      fallback: true,
      finishReason: candidate?.finishReason ?? 'unknown',
    },
  });
  auditTokenDrift({
    provider: 'gemini',
    model: geminiModel,
    estimated: estimateChatInputTokens({
      systemPrompt: effectiveSystemPrompt,
      messages: conversationMessages,
    }),
    observed: (result as any).usageMetadata?.promptTokenCount ?? 0,
  });
  if (!text) {
    throw new Error('Empty Gemini response');
  }
  return text.trim();
}
