// @aria/aria-core — the Firebase-free "brain": psyche (drives/ego/arbiter),
// conversation policy, emotion, prompt composition, provider routing, and the
// `generateAIResponse` turn orchestration.
//
// Carved out of tools/girlai2/functions/src during the Phase-0 brain decouple:
//   - COPY clean : psycheStateService, egoArbiterService, psycheMetricsService,
//                  emotionUtils, textNumericUtils, promptComposer, connectionKnowledge,
//                  failureClass (logger stripped), connectionPrinciples (data)
//   - DECOUPLE   : conversationPolicyService (+ariaRelationship/signal closure),
//                  responseAssemblyService, providerExecutionService, openaiCompat,
//                  generateAIResponse (inject {memory, runtimeSelfModel})
//
// Every module here is Firebase-free: no firebase-admin / firebase-functions imports,
// no process.env reads (config is threaded in), an injected logger.

export const ARIA_CORE_VERSION = "0.0.0";

/** Logger interface injected by the host (Worker / agent / test harness). */
export interface AriaLogger {
  info(msg: string, meta?: Record<string, unknown>): void;
  warn(msg: string, meta?: Record<string, unknown>): void;
  error(msg: string, meta?: Record<string, unknown>): void;
}

/** No-op logger default. */
export const noopLogger: AriaLogger = {
  info: () => {},
  warn: () => {},
  error: () => {},
};

// ─────────────────────────────────────────────────────────────────────────────
// Public API — what the Worker / agent host calls.
// ─────────────────────────────────────────────────────────────────────────────

// The turn orchestrator + its public types.
export {
  generateAIResponse,
  analyzeConversation,
  prepareStreamingTurn,
  streamLlmTextDeltas,
} from "./services/llmService";
export type {
  AIResponse,
  ConversationMessage,
  UserEnvironmentContext,
  UserFeatureSettings,
  QualityMeta,
} from "./services/llmService";

// Runtime self-model default (the Phase-0 memory:null path needs this).
export { buildDefaultRuntimeSelfModel } from "./services/truthKernelService";

// Crisis HARD GATE — the Worker runs this BEFORE the brain.
export {
  detectCrisis,
  CRISIS_RESOURCES,
  ARIA_CRISIS_REPLY,
} from "./crisis";
export type {
  CrisisDetectionResult,
  CrisisCategory,
  CrisisSeverity,
  CrisisResource,
} from "./crisis";

// Phase 1b — structured long-term memory. aria-core owns the PURE per-turn
// update + empty-memory builder; the Worker owns D1 load/save (compile/persist).
// Phase 1c — extractTurnMemory: the per-turn LLM extraction (importance scoring +
// fact/emotion extraction + write-gate) that produces the {scoring, extraction}
// applyTurnToMemory consumes. Run it post-response (ctx.waitUntil).
export {
  applyTurnToMemory,
  createEmptyIntelligentMemory,
  extractTurnMemory,
  // Phase 1d — semantic memory: the Worker calls this post-turn (best-effort) to
  // index the turn into Qdrant. recallSemanticMemories is called inside the brain
  // (promptAugmentService) so it isn't re-exported here.
  indexSemanticMemoryForTurn,
  // M2 (audit 2026-06-22) — right-to-erasure: purge a user's Qdrant vectors.
  deleteSemanticMemoryForUser,
} from "./services/memoryService";
export type {
  ApplyTurnInput,
  TurnScoring,
  TurnExtraction,
  TurnMemoryExtractionInput,
} from "./services/memoryService";
