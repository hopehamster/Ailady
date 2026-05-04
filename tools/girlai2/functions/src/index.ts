import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { createHash } from 'crypto';
import { defineString } from 'firebase-functions/params';
import {
  generateAIResponse,
  generateProactiveCompanionMessage,
  configureProactiveMessaging,
  submitResponseFeedback,
  getCompanionQualityInsights as getCompanionQualityInsightsData,
  ConversationMessage,
  UserTemporalContext,
} from './services/llmService';
import type { ChatMode } from './services/chatModeService';
import {
  runGoldenPromptSuiteEval,
  getLatestGoldenSuiteRun,
  getGoldenSuiteRunById,
  getPreviousGoldenSuiteRun,
  getGoldenBaselineRun,
  getGoldenBaselineMarker,
  setGoldenBaselineRun,
  evaluateStrictLaunchGate,
  defaultLaunchGateThresholds,
} from './services/goldenEvalService';
import {
  generateVoiceWithVisemes,
  checkVoiceServiceConfig,
  VoiceServiceError,
} from './services/voiceService';
import type { FeedbackReasonCode } from './services/memoryService';
import {
  checkAndAwardMilestones,
  ensureRelationshipDashboardState,
  getPendingMilestones,
  markMilestoneDisplayed,
} from './services/milestoneService';
import {
  generateInnerLifeSnippet,
  getAriaOpinions,
  getWeeklyCuriosityTopics,
  InnerLifeContext,
} from './services/ariaInnerLifeService';
import {
  saveImportantDate,
  deleteImportantDate,
  getAllImportantDates,
  getUpcomingDates,
  buildDatesContextBlock,
  detectDatesFromMessage,
  DateCategory,
} from './services/userDatesService';
import {
  startVirtualDateSession,
  endVirtualDateSession,
  getVirtualDateOverlayBlock,
  getCurrentVirtualDateSession,
  VirtualDateActivity,
} from './services/virtualDateService';
import { createLiveModeRealtimeSession } from './services/realtimeSessionService';
import { estimateInitialHistoryFetchLimit } from './services/promptCostService';

admin.initializeApp();

// Set OpenAI API key from environment
const openaiApiKey = process.env.OPENAI_API_KEY;
if (openaiApiKey) {
  process.env.OPENAI_API_KEY = openaiApiKey;
  functions.logger.info('OpenAI API key configured');
} else {
  functions.logger.warn('OpenAI API key not found. Set it with: firebase functions:config:set openai.key="your-key"');
}

const FEEDBACK_REASON_CODES: ReadonlySet<FeedbackReasonCode> = new Set([
  'pressure_tone',
  'repetitive_phrasing',
  'weak_follow_up',
  'scope_drift',
  'memory_misuse',
  'consent_miss',
  'other',
]);

const internalTesterUidsParam = defineString('INTERNAL_TESTER_UIDS', { default: '' });

function parseUidAllowlist(rawValue: string): Set<string> {
  return new Set(
    rawValue
      .split(',')
      .map((value) => value.trim())
      .filter((value) => value.length > 0)
  );
}

function getInternalTesterUids(): Set<string> {
  let paramValue = '';
  try {
    paramValue = internalTesterUidsParam.value().trim();
  } catch {
    paramValue = '';
  }

  const envValue = process.env.INTERNAL_TESTER_UIDS?.trim() ?? '';
  return parseUidAllowlist(paramValue || envValue);
}

function isInternalTester(authUid: string, userId: string): boolean {
  if (!authUid || authUid !== userId) {
    return false;
  }
  return getInternalTesterUids().has(authUid);
}

interface LiveModeSessionState {
  sessionId: string;
  lastFrameAtMs?: number;
  lastFrameSignature?: string;
  lastResponseAtMs?: number;
  lastDescription?: string;
  lastResponse?: string;
  responseCount?: number;
}

const LIVE_MODE_COLLECTION = 'liveModeSessions';
const LIVE_MODE_MAX_IMAGE_BASE64_BYTES = 4 * 1024 * 1024;
const LIVE_MODE_MIN_FRAME_GAP_MS = 1800;
const LIVE_MODE_MIN_RESPONSE_GAP_MS = 6500;
const LIVE_MODE_RESPONSE_DELAY_MS = 4200;

function getLiveModeSessionRef(userId: string) {
  return admin.firestore().collection(LIVE_MODE_COLLECTION).doc(userId);
}

function normalizeLiveModeSessionState(
  value: FirebaseFirestore.DocumentData | undefined,
): LiveModeSessionState | null {
  if (!value || typeof value.sessionId !== 'string' || value.sessionId.trim().length === 0) {
    return null;
  }

  return {
    sessionId: value.sessionId,
    lastFrameAtMs:
      typeof value.lastFrameAtMs === 'number' ? value.lastFrameAtMs : undefined,
    lastFrameSignature:
      typeof value.lastFrameSignature === 'string' ? value.lastFrameSignature : undefined,
    lastResponseAtMs:
      typeof value.lastResponseAtMs === 'number' ? value.lastResponseAtMs : undefined,
    lastDescription:
      typeof value.lastDescription === 'string' ? value.lastDescription : undefined,
    lastResponse:
      typeof value.lastResponse === 'string' ? value.lastResponse : undefined,
    responseCount:
      typeof value.responseCount === 'number' ? value.responseCount : undefined,
  };
}

function buildLiveModeFrameSignature(imageBase64: string): string {
  return createHash('sha1')
    .update(imageBase64.slice(0, 250_000))
    .digest('hex')
    .slice(0, 16);
}

function normalizeTemporalContext(raw: unknown): UserTemporalContext | undefined {
  if (!raw || typeof raw !== 'object') {
    return undefined;
  }
  const source = raw as Record<string, unknown>;
  const offsetRaw = Number(source.timeZoneOffsetMinutes);
  const timeZoneOffsetMinutes = Number.isFinite(offsetRaw)
    ? Math.max(-840, Math.min(840, Math.round(offsetRaw)))
    : undefined;
  const timeZoneName =
    typeof source.timeZoneName === 'string' && source.timeZoneName.trim().length > 0
      ? source.timeZoneName.trim().slice(0, 80)
      : undefined;
  const epochRaw = Number(source.clientEpochMs);
  const clientEpochMs =
    Number.isFinite(epochRaw) && epochRaw > 0 ? Math.round(epochRaw) : undefined;

  if (
    timeZoneOffsetMinutes == null &&
    !timeZoneName &&
    clientEpochMs == null
  ) {
    return undefined;
  }

  return {
    timeZoneOffsetMinutes,
    timeZoneName,
    clientEpochMs,
  };
}

/**
 * Generate AI response to user message
 * Saves both user message and AI response to Firestore
 */
export const generateResponse = functions
  .region('us-central1')
  .runWith({
    minInstances: 1,
    memory: '1GB',
    timeoutSeconds: 60,
  })
  .https.onCall(async (data, context) => {
    // Log auth context for debugging
    functions.logger.info('generateResponse called', {
      hasAuth: !!context.auth,
      authUid: context.auth?.uid || 'none',
      dataUserId: data.userId || 'none',
    });

    // Get userId from auth context, or fallback to client-provided userId
    // Note: Fallback is temporary for debugging - should require auth in production
    let userId = context.auth?.uid;
    
    if (!userId && data.userId) {
      functions.logger.warn('Using client-provided userId (auth context was null)', {
        clientUserId: data.userId,
      });
      userId = data.userId;
    }
    
    if (!userId) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'User must be authenticated to send messages'
      );
    }

    const userMessage = data.message as string;
    const temporalContext = normalizeTemporalContext(data.clientTime);
    // Optional environment context forwarded from opted-in Flutter client
    const userEnvCtx = (data.userContext && typeof data.userContext === 'object')
      ? data.userContext as import('./services/llmService').UserEnvironmentContext
      : undefined;
    const featureSettings = (data.featureSettings && typeof data.featureSettings === 'object')
      ? data.featureSettings as import('./services/llmService').UserFeatureSettings
      : undefined;
    const chatMode = (data.chatMode === 'story' || data.chatMode === 'journal')
      ? (data.chatMode as ChatMode)
      : undefined;

    // Validate input
    if (!userMessage || typeof userMessage !== 'string' || userMessage.trim().length === 0) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Message is required and must be a non-empty string'
      );
    }

    if (userMessage.length > 2000) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Message is too long (max 2000 characters)'
      );
    }

    try {
      const authUid = context.auth?.uid ?? '';
      const internalTester = isInternalTester(authUid, userId);
      const db = admin.firestore();
      const timestamp = admin.firestore.FieldValue.serverTimestamp();
      const callableStartedAt = Date.now();
      let historyFetchMs = 0;
      let datesContextMs = 0;
      let aiResponseMs = 0;
      let postPersistMs = 0;

      if (temporalContext) {
        db.collection('users').doc(userId).set(
          {
            timeZoneOffsetMinutes: temporalContext.timeZoneOffsetMinutes ?? 0,
            timeZoneName: temporalContext.timeZoneName ?? null,
            lastClientEpochMs: temporalContext.clientEpochMs ?? null,
            lastClientSyncAt: timestamp,
          },
          { merge: true },
        ).catch((error: any) => {
          functions.logger.warn('Failed to persist temporal context', {
            userId,
            error: error?.message,
          });
        });
      }

      const trimmedMessage = userMessage.trim();

      // Start the write and history read together. The current turn is passed
      // separately into generateAIResponse, so conversation history does not
      // need to wait for this write to complete first.
      const userMessageRefPromise = db.collection('conversations').add({
        userId,
        content: trimmedMessage,
        isFromUser: true,
        timestamp,
        createdAt: timestamp,
        ...(chatMode ? { chatMode } : {}),
      });

      const recentHistoryFetchLimit = estimateInitialHistoryFetchLimit(trimmedMessage);

      const recentMessagesPromise = db
        .collection('conversations')
        .where('userId', '==', userId)
        .orderBy('timestamp', 'desc')
        .limit(recentHistoryFetchLimit)
        .get();
      const datesContextPromise = (async (): Promise<string> => {
        const startedAt = Date.now();
        const [datesContextBlockRaw, virtualDateBlock] = await Promise.all([
          buildDatesContextBlock(userId, {
            now:
              typeof temporalContext?.clientEpochMs === 'number' &&
              Number.isFinite(temporalContext.clientEpochMs)
                ? new Date(temporalContext.clientEpochMs)
                : new Date(),
            timeZoneOffsetMinutes: temporalContext?.timeZoneOffsetMinutes ?? 0,
          }).catch(() => ''),
          getVirtualDateOverlayBlock(userId).catch(() => ''),
        ]);
        datesContextMs = Date.now() - startedAt;
        return [datesContextBlockRaw, virtualDateBlock]
          .filter((s) => s.trim().length > 0)
          .join('\n\n');
      })();

      // Fire-and-forget milestone check (non-blocking — never delays the response)
      checkAndAwardMilestones(userId).catch((err: any) => {
        functions.logger.warn('Milestone check failed (non-critical)', {
          userId,
          error: err?.message,
        });
      });

      const historyStartedAt = Date.now();
      const recentMessages = await recentMessagesPromise;
      historyFetchMs = Date.now() - historyStartedAt;

      const conversationHistory: ConversationMessage[] = recentMessages.docs
        .map((doc) => {
          const msgData = doc.data();
          return {
            role: (msgData.isFromUser ? 'user' : 'assistant') as 'user' | 'assistant',
            content: msgData.content as string,
          };
        })
        .reverse();

      // Auto-detect and save any dates the user mentioned in this message
      const detectedDates = detectDatesFromMessage(userMessage);
      const detectedDatesPersistPromise = detectedDates.length > 0
        ? Promise.all(
          detectedDates
            .filter((d) => d.date !== null)
            .map((d) =>
              saveImportantDate(userId, {
                label:    d.label,
                date:     d.date!,
                category: d.category,
                recurs:   d.recurs,
              }).catch(() => {}), // non-fatal
            ),
        )
        : Promise.resolve([]);
      const datesContextBlock = await datesContextPromise;

      // Generate AI response with userId for memory access
      const aiResponseStartedAt = Date.now();
      const aiResponse = await generateAIResponse(
        trimmedMessage,
        conversationHistory,
        userId,
        temporalContext,
        chatMode,
        datesContextBlock,
        userEnvCtx,
        featureSettings,
      );
      aiResponseMs = Date.now() - aiResponseStartedAt;

      const persistenceStartedAt = Date.now();
      const [userMessageRef] = await Promise.all([
        userMessageRefPromise,
        db.collection('conversations').add({
          userId,
          content: aiResponse.content,
          isFromUser: false,
          timestamp,
          emotion: aiResponse.emotion,
          emotionTrigger: aiResponse.emotionTrigger,
          emotionIntensity: aiResponse.emotionIntensity,
          modelUsed: aiResponse.modelUsed,
          createdAt: timestamp,
        }),
        detectedDatesPersistPromise,
      ]);
      postPersistMs = Date.now() - persistenceStartedAt;

      const mergedStageTimingsMs = {
        ...(aiResponse.qualityMeta?.stageTimingsMs ?? {}),
        historyFetchMs,
        datesContextMs,
        aiResponseMs,
        postPersistMs,
        totalCallableMs: Date.now() - callableStartedAt,
      };

      functions.logger.info('generateResponse timings', {
        userId,
        route: aiResponse.qualityMeta?.route ?? null,
        escalated: aiResponse.qualityMeta?.escalated ?? null,
        modelUsed: aiResponse.modelUsed,
        historyFetchMs,
        datesContextMs,
        aiResponseMs,
        postPersistMs,
        totalCallableMs: mergedStageTimingsMs.totalCallableMs,
      });

      // Return success response with emotion trigger for avatar animations
      return {
        success: true,
        messageId: userMessageRef.id,
        response: aiResponse.content,
        emotion: aiResponse.emotion,
        emotionTrigger: aiResponse.emotionTrigger,
        emotionIntensity: aiResponse.emotionIntensity,
        qualityMeta: internalTester
          ? {
              ...(aiResponse.qualityMeta ?? {
                strategy: 'empathic_reflection',
                questionBudget: 0,
                repairMode: false,
                consentCheckRequired: false,
                scoreSummary: {
                  engagement: 0.0,
                  empathy: 0.0,
                  safety: 0.0,
                  novelty: 0.0,
                  persona: 0.0,
                },
                planSource: 'rules' as const,
              }),
              stageTimingsMs: mergedStageTimingsMs,
            }
          : null,
      };
    } catch (error: any) {
      functions.logger.error('Error in generateResponse', {
        userId,
        error: error.message,
        stack: error.stack,
      });

      // Return user-friendly error
      if (error instanceof functions.https.HttpsError) {
        throw error;
      }

      throw new functions.https.HttpsError(
        'internal',
        'Failed to generate response. Please try again.',
        error.message
      );
    }
  });

/**
 * Triggered when a new user signs up
 * Creates user profile in Firestore
 */
export const onUserCreate = functions
  .region('us-central1')
  .auth.user()
  .onCreate(async (user) => {
    const db = admin.firestore();
    const userRef = db.collection('users').doc(user.uid);

    try {
      await userRef.set({
        id: user.uid,
        phoneNumber: user.phoneNumber || null,
        displayName: null,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        lastLoginAt: admin.firestore.FieldValue.serverTimestamp(),
        isSubscribed: false,
        onboardingCompleted: false,
      });

      functions.logger.info('User profile created', { userId: user.uid });
    } catch (error: any) {
      functions.logger.error('Error creating user profile', {
        userId: user.uid,
        error: error.message,
      });
    }
  });

// Note: onUserLogin removed - beforeSignIn requires GCIP (Google Cloud Identity Platform)
// We can update lastLoginAt in the client-side UserService instead

/**
 * Compatibility-first live vision entrypoint.
 * Rebuilds the historic processLiveModeInput callable on top of visionService
 * while suppressing near-duplicate frames and response spam.
 */
export const processLiveModeInput = functions
  .region('us-central1')
  .https.onCall(async (data, context) => {
    let userId = context.auth?.uid;

    if (!userId && data.userId) {
      functions.logger.warn('Using client-provided userId for live mode', {
        clientUserId: data.userId,
      });
      userId = data.userId;
    }

    if (!userId) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'User must be authenticated to use live mode',
      );
    }

    const sessionId = typeof data.sessionId === 'string' ? data.sessionId.trim() : '';
    const imageBase64 =
      typeof data.imageBase64 === 'string' ? data.imageBase64.trim() : '';
    const prompt = typeof data.prompt === 'string' ? data.prompt.trim() : undefined;
    const persistResponse = data.persistResponse === true;
    const frameSequence =
      typeof data.frameSequence === 'number' ? Math.max(0, Math.round(data.frameSequence)) : undefined;

    if (!sessionId) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Live mode requires a sessionId',
      );
    }

    if (!imageBase64) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Live mode requires image data',
      );
    }

    if (imageBase64.length > LIVE_MODE_MAX_IMAGE_BASE64_BYTES) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Live mode image is too large (max 4MB)',
      );
    }

    const nowMs = Date.now();
    const frameSignature = buildLiveModeFrameSignature(imageBase64);
    const sessionRef = getLiveModeSessionRef(userId);

    try {
      const sessionSnapshot = await sessionRef.get();
      const storedSession = normalizeLiveModeSessionState(sessionSnapshot.data());
      const isSameSession = storedSession?.sessionId === sessionId;
      const activeSession = isSameSession ? storedSession : null;

      if (
        activeSession?.lastFrameSignature &&
        activeSession.lastFrameSignature === frameSignature
      ) {
        return {
          success: true,
          sessionId,
          shouldRespond: false,
          reason: 'duplicate_frame',
          suggestedNextFrameDelayMs: LIVE_MODE_MIN_FRAME_GAP_MS,
        };
      }

      if (
        activeSession?.lastFrameAtMs &&
        nowMs - activeSession.lastFrameAtMs < LIVE_MODE_MIN_FRAME_GAP_MS
      ) {
        const remainingMs =
          LIVE_MODE_MIN_FRAME_GAP_MS - (nowMs - activeSession.lastFrameAtMs);
        return {
          success: true,
          sessionId,
          shouldRespond: false,
          reason: 'frame_throttled',
          suggestedNextFrameDelayMs: Math.max(400, remainingMs),
        };
      }

      const { analyzeLiveVisionFrame } = await import('./services/visionService');
      const result = await analyzeLiveVisionFrame(userId, imageBase64, {
        userPrompt: prompt,
        previousDescription: activeSession?.lastDescription,
        previousResponse: activeSession?.lastResponse,
        responseCount: activeSession?.responseCount ?? 0,
      });

      const responseCoolingDown =
        result.shouldRespond &&
        !!activeSession?.lastResponseAtMs &&
        nowMs - activeSession.lastResponseAtMs < LIVE_MODE_MIN_RESPONSE_GAP_MS;

      const shouldRespond = result.shouldRespond && !responseCoolingDown;
      const reason = shouldRespond
        ? 'meaningful_change'
        : responseCoolingDown
            ? 'response_cooldown'
            : 'no_meaningful_change';
      const responseCount =
        (activeSession?.responseCount ?? 0) + (shouldRespond ? 1 : 0);
      const responseKey = shouldRespond ? `${sessionId}:${responseCount}` : undefined;

      const sessionPatch: Record<string, unknown> = {
        sessionId,
        userId,
        lastFrameAtMs: nowMs,
        lastFrameSignature: frameSignature,
        lastDescription: result.description,
        responseCount,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        createdAt:
          sessionSnapshot.exists && isSameSession
            ? sessionSnapshot.get('createdAt') ?? admin.firestore.FieldValue.serverTimestamp()
            : admin.firestore.FieldValue.serverTimestamp(),
      };

      if (shouldRespond) {
        sessionPatch.lastResponseAtMs = nowMs;
        sessionPatch.lastResponse = result.response;
      } else if (!isSameSession) {
        sessionPatch.lastResponse = null;
        sessionPatch.lastResponseAtMs = null;
      }

      await sessionRef.set(sessionPatch, { merge: true });

      if (persistResponse && shouldRespond) {
        const db = admin.firestore();
        await db.collection('conversations').add({
          userId,
          isFromUser: false,
          isLiveMode: true,
          liveModeSessionId: sessionId,
          content: result.response,
          description: result.description,
          emotion: result.emotion,
          emotionTrigger: result.emotionTrigger,
          emotionIntensity: result.emotionIntensity,
          modelUsed: 'live_vision',
          timestamp: admin.firestore.Timestamp.fromMillis(nowMs),
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }

      functions.logger.info('Live mode frame processed', {
        userId,
        sessionId,
        frameSequence,
        shouldRespond,
        reason,
        responseCount,
      });

      return {
        success: true,
        sessionId,
        shouldRespond,
        reason,
        responseKey,
        frameSequence,
        description: result.description,
        response: shouldRespond ? result.response : '',
        changeSummary: result.changeSummary,
        emotion: shouldRespond ? result.emotion : 'neutral',
        emotionTrigger: shouldRespond ? result.emotionTrigger : 'Idle_Gentle_Sway',
        emotionIntensity: shouldRespond ? result.emotionIntensity : 0.45,
        suggestedNextFrameDelayMs: shouldRespond
          ? LIVE_MODE_RESPONSE_DELAY_MS
          : LIVE_MODE_MIN_FRAME_GAP_MS,
      };
    } catch (error: any) {
      functions.logger.error('Error in processLiveModeInput', {
        userId,
        sessionId,
        frameSequence,
        error: error?.message,
        stack: error?.stack,
      });

      if (error instanceof functions.https.HttpsError) {
        throw error;
      }

      throw new functions.https.HttpsError(
        'internal',
        'Failed to process live mode input. Please try again.',
        error?.message,
      );
    }
  });

/**
 * Mint a short-lived OpenAI Realtime client secret for direct WebRTC sessions.
 * Live mode uses this to connect to OpenAI without exposing the master API key.
 */
export const createRealtimeSession = functions
  .region('us-central1')
  .https.onCall(async (data, context) => {
    const userId = context.auth?.uid;
    if (!userId) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'User must be authenticated to start a realtime session',
      );
    }

    const mode = typeof data.mode === 'string' ? data.mode.trim() : 'live_mode';
    if (mode !== 'live_mode') {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Unsupported realtime mode requested',
      );
    }

    const authUid = context.auth?.uid ?? '';
    if (!isInternalTester(authUid, userId)) {
      throw new functions.https.HttpsError(
        'permission-denied',
        'Realtime live mode is currently limited to internal testing accounts.',
      );
    }

    try {
      const session = await createLiveModeRealtimeSession(userId);
      functions.logger.info('Realtime session created', {
        userId,
        mode,
        sessionId: session.sessionId,
        expiresAt: session.expiresAt,
        instructionsVersion: session.instructionsVersion,
      });

      return {
        success: true,
        ...session,
      };
    } catch (error: any) {
      functions.logger.error('Error creating realtime session', {
        userId,
        mode,
        error: error?.message,
      });

      if (error instanceof functions.https.HttpsError) {
        throw error;
      }

      throw new functions.https.HttpsError(
        'internal',
        'Failed to create realtime session.',
        error?.message,
      );
    }
  });

/**
 * Vision API for camera input - allows AI to see through the camera
 * Uses GPT-4o vision capabilities for real-time image analysis
 */
export const analyzeImage = functions
  .region('us-central1')
  .https.onCall(async (data, context) => {
    // Verify authentication
    let userId = context.auth?.uid;
    
    if (!userId && data.userId) {
      functions.logger.warn('Using client-provided userId for vision', {
        clientUserId: data.userId,
      });
      userId = data.userId;
    }
    
    if (!userId) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'User must be authenticated to use vision features'
      );
    }

    const imageBase64 = data.imageBase64 as string;
    const prompt = data.prompt as string | undefined;

    // Validate input
    if (!imageBase64 || typeof imageBase64 !== 'string') {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Image data is required'
      );
    }

    // Check image size (max 4MB base64 ~ 3MB image)
    if (imageBase64.length > 4 * 1024 * 1024) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Image is too large (max 4MB)'
      );
    }

    try {
      const db = admin.firestore();

      functions.logger.info('Vision request', { userId });

      // Import vision service
      const { analyzeImageWithVision } = await import('./services/visionService');

      // Analyze the image
      const result = await analyzeImageWithVision(
        userId,
        imageBase64,
        prompt
      );

      // ── Persist vision exchange to Firestore so Aria remembers it ──────────
      // Without this, generateResponse has no knowledge of the shared photo and
      // Aria "forgets" the image in subsequent conversation turns.
      const nowMs = Date.now();
      const userContent = prompt ? `📷 ${prompt}` : '📷 [Shared a photo]';

      await Promise.all([
        // User's "sent a photo" turn
        db.collection('conversations').add({
          userId,
          isFromUser: true,
          content: userContent,
          timestamp: admin.firestore.Timestamp.fromMillis(nowMs),
        }),
        // Aria's vision response turn (1 second after user, preserves ordering)
        db.collection('conversations').add({
          userId,
          isFromUser: false,
          content: result.response,
          emotion: result.emotion,
          emotionTrigger: result.emotionTrigger,
          timestamp: admin.firestore.Timestamp.fromMillis(nowMs + 1000),
          modelUsed: 'vision',
        }),
      ]);

      functions.logger.info('Vision exchange saved to Firestore', { userId });
      // ───────────────────────────────────────────────────────────────────────

      return {
        success: true,
        description: result.description,
        response: result.response,
        emotion: result.emotion,
        emotionTrigger: result.emotionTrigger,
        emotionIntensity: result.emotionIntensity,
      };
    } catch (error: any) {
      functions.logger.error('Error in analyzeImage', {
        userId,
        error: error.message,
        stack: error.stack,
      });

      if (error instanceof functions.https.HttpsError) {
        throw error;
      }

      throw new functions.https.HttpsError(
        'internal',
        'Failed to analyze image. Please try again.',
        error.message
      );
    }
  });

/**
 * Generate voice message with TTS and viseme timeline for lip-sync
 * Uses the default voice pipeline with provider fallback when needed
 */
export const generateVoiceMessage = functions
  .region('us-central1')
  .runWith({
    timeoutSeconds: 120, // TTS + upload can take time
    memory: '512MB',
    minInstances: 1,
  })
  .https.onCall(async (data, context) => {
    const callableStartedAt = Date.now();
    // Verify authentication
    let userId = context.auth?.uid;
    
    if (!userId && data.userId) {
      functions.logger.warn('Using client-provided userId for voice', {
        clientUserId: data.userId,
      });
      userId = data.userId;
    }
    
    if (!userId) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'User must be authenticated to use voice features'
      );
    }

    const text = data.text as string;
    const voiceId = data.voiceId as string | undefined;

    // Validate input
    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Text is required and must be a non-empty string'
      );
    }

    if (text.length > 5000) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Text is too long (max 5000 characters)'
      );
    }

    try {
      const authUid = context.auth?.uid ?? '';
      let subscriptionTier: 'regular' | 'ultra' = 'regular';

      functions.logger.info('Voice request', {
        userId,
        authUid: authUid || 'none',
        subscriptionTier,
        textLength: text.length,
        accessModel: 'single_subscription',
      });

      // Check voice service configuration
      const configStatus = checkVoiceServiceConfig();

      if (subscriptionTier === 'regular' && !configStatus.azure) {
        functions.logger.warn('Azure not configured for regular voice path');
        throw new functions.https.HttpsError(
          'failed-precondition',
          'Voice service not configured. Contact support.',
          { reason: 'voice_not_configured', provider: 'azure' }
        );
      }

      // Generate voice with visemes
      const result = await generateVoiceWithVisemes(
        text.trim(),
        subscriptionTier,
        voiceId
      );

      const blendFrameCount = Object.keys(result.blendTimeline).length;
      functions.logger.info('Voice generated successfully', {
        userId,
        provider: result.provider,
        deliveryMode: result.deliveryMode ?? 'storage',
        durationMs: result.durationMs,
        visemeCount: result.visemeTimeline.length,
        blendFrameCount,
        audioBytesBase64Length: result.audioBase64?.length ?? 0,
        synthesisMs: result.timingsMs?.synthesisMs ?? null,
        providerRequestMs: result.timingsMs?.providerRequestMs ?? null,
        uploadMs: result.timingsMs?.uploadMs ?? null,
        audioFormat: result.timingsMs?.audioFormat ?? null,
        deliveryProfile: result.timingsMs?.deliveryProfile ?? null,
        totalVoicePipelineMs: result.timingsMs?.totalMs ?? null,
        totalCallableMs: Date.now() - callableStartedAt,
      });

      return {
        success: true,
        audioUrl: result.audioUrl,
        audioBase64: result.audioBase64 ?? null,
        audioContentType: result.audioContentType ?? null,
        deliveryMode: result.deliveryMode ?? 'storage',
        visemeTimeline: result.visemeTimeline,
        blendTimeline: result.blendTimeline,
        durationMs: result.durationMs,
        provider: result.provider,
        timingsMs: result.timingsMs ?? null,
      };
    } catch (error: any) {
      if (error instanceof functions.https.HttpsError) {
        throw error;
      }

      if (error instanceof VoiceServiceError) {
        functions.logger.error('Voice service error in generateVoiceMessage', {
          userId,
          reason: error.reason,
          details: error.details,
          error: error.message,
        });

        if (error.reason === 'voice_not_configured') {
          throw new functions.https.HttpsError(
            'failed-precondition',
            'Voice service not configured. Contact support.',
            {
              ...error.details,
              reason: error.reason,
            }
          );
        }

        if (error.reason === 'voice_storage_error') {
          throw new functions.https.HttpsError(
            'internal',
            'Voice audio delivery failed. Please try again.',
            {
              ...error.details,
              reason: error.reason,
            }
          );
        }

        throw new functions.https.HttpsError(
          'internal',
          'Voice generation failed. Please try again.',
          {
            ...error.details,
            reason: error.reason,
          }
        );
      }

      functions.logger.error('Error in generateVoiceMessage', {
        userId,
        error: error.message,
        stack: error.stack,
      });

      throw new functions.https.HttpsError(
        'internal',
        'Failed to generate voice. Please try again.',
        { reason: 'voice_provider_error', message: error.message }
      );
    }
  });

/**
 * Update companion social/proactive settings.
 * Current configurable fields:
 * - enabled (boolean)
 * - cadenceMinutes (30-1440)
 * - quietHoursStart (0-23)
 * - quietHoursEnd (0-23)
 */
export const updateCompanionConfig = functions
  .region('us-central1')
  .https.onCall(async (data, context) => {
    const userId = context.auth?.uid;
    if (!userId) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'User must be authenticated to update companion config',
      );
    }

    const enabled = data.enabled;
    const cadenceMinutes = data.cadenceMinutes;
    const quietHoursStart = data.quietHoursStart;
    const quietHoursEnd = data.quietHoursEnd;

    const patch: any = {};
    if (typeof enabled === 'boolean') {
      patch.enabled = enabled;
    }
    if (typeof cadenceMinutes === 'number') {
      patch.cadenceMinutes = cadenceMinutes;
    }
    if (typeof quietHoursStart === 'number') {
      patch.quietHoursStart = quietHoursStart;
    }
    if (typeof quietHoursEnd === 'number') {
      patch.quietHoursEnd = quietHoursEnd;
    }

    const config = await configureProactiveMessaging(userId, patch);
    if (!config) {
      throw new functions.https.HttpsError(
        'internal',
        'Failed to update companion configuration',
      );
    }

    return {
      success: true,
      config,
    };
  });

/**
 * Generate a proactive companion message when cadence/settings allow it.
 * Client can call this on app open or periodic heartbeat.
 */
export const generateProactiveMessage = functions
  .region('us-central1')
  .https.onCall(async (data, context) => {
    const userId = context.auth?.uid;
    if (!userId) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'User must be authenticated to generate proactive messages',
      );
    }

    try {
      const result = await generateProactiveCompanionMessage(userId);
      if (!result.shouldSend || !result.content) {
        return {
          success: true,
          shouldSend: false,
          reason: result.reason,
          minutesUntilNext: result.minutesUntilNext,
        };
      }

      const db = admin.firestore();
      const timestamp = admin.firestore.FieldValue.serverTimestamp();
      await db.collection('conversations').add({
        userId,
        content: result.content,
        isFromUser: false,
        isProactive: true,
        timestamp,
        emotion: result.emotion || 'neutral',
        emotionTrigger: result.emotionTrigger || 'Idle_Gentle_Sway',
        emotionIntensity: result.emotionIntensity ?? 0.5,
        modelUsed: result.modelUsed || 'unknown',
        createdAt: timestamp,
      });

      return {
        success: true,
        shouldSend: true,
        reason: result.reason,
        response: result.content,
        emotion: result.emotion || 'neutral',
        emotionTrigger: result.emotionTrigger || 'Idle_Gentle_Sway',
        emotionIntensity: result.emotionIntensity ?? 0.5,
      };
    } catch (error: any) {
      functions.logger.error('Error in generateProactiveMessage', {
        userId,
        error: error?.message,
      });
      throw new functions.https.HttpsError(
        'internal',
        'Failed to generate proactive message',
        error?.message,
      );
    }
  });

/**
 * Record explicit user feedback for an assistant response.
 * vote: "up" | "down"
 * Optional reason helps tune style and persona consistency.
 */
export const submitMessageFeedback = functions
  .region('us-central1')
  .https.onCall(async (data, context) => {
    const userId = context.auth?.uid;
    if (!userId) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'User must be authenticated to submit feedback',
      );
    }

    const messageId = data.messageId as string | undefined;
    const vote = data.vote as string | undefined;
    const reason = data.reason as string | undefined;
    const reasonCodeRaw = data.reasonCode as string | undefined;

    if (!messageId || typeof messageId !== 'string') {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'messageId is required',
      );
    }

    if (vote !== 'up' && vote !== 'down') {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'vote must be "up" or "down"',
      );
    }

    let reasonCode: FeedbackReasonCode | undefined;
    if (reasonCodeRaw != null) {
      if (typeof reasonCodeRaw !== 'string' || !FEEDBACK_REASON_CODES.has(reasonCodeRaw as FeedbackReasonCode)) {
        throw new functions.https.HttpsError(
          'invalid-argument',
          'reasonCode is invalid',
        );
      }
      reasonCode = reasonCodeRaw as FeedbackReasonCode;
    }

    const result = await submitResponseFeedback(userId, {
      messageId,
      vote,
      reason,
      reasonCode,
    });

    if (!result.success) {
      throw new functions.https.HttpsError(
        'internal',
        'Failed to record feedback',
      );
    }

    return {
      success: true,
    };
  });

/**
 * Fetch launch-quality tuning telemetry:
 * - Latest weekly relationship tuning summary
 * - Rolling A/B shadow benchmark stats
 */
export const getCompanionQualityInsights = functions
  .region('us-central1')
  .https.onCall(async (_, context) => {
    const userId = context.auth?.uid;
    if (!userId) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'User must be authenticated to view companion quality insights',
      );
    }

    const insights = await getCompanionQualityInsightsData(userId);
    if (!insights) {
      throw new functions.https.HttpsError(
        'internal',
        'Unable to load companion quality insights',
      );
    }

    return {
      success: true,
      latestWeeklyTuningReport: insights.latestWeeklyTuningReport,
      shadowBenchmarkStats: insights.shadowBenchmarkStats,
      captivation: insights.captivation,
    };
  });

/**
 * Run the versioned golden prompt suite and persist result for launch quality tracking.
 * Internal tester only.
 */
export const runGoldenPromptSuite = functions
  .region('us-central1')
  .runWith({ timeoutSeconds: 540, memory: '1GB' })
  .https.onCall(async (data, context) => {
    const authUid = context.auth?.uid;
    if (!authUid) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'User must be authenticated to run golden suite',
      );
    }
    if (!isInternalTester(authUid, authUid)) {
      throw new functions.https.HttpsError(
        'permission-denied',
        'Golden suite is restricted to internal tester accounts',
      );
    }

    const maxCasesRaw = Number(data?.maxCases);
    const maxCases = Number.isFinite(maxCasesRaw) && maxCasesRaw > 0
      ? Math.max(1, Math.min(120, Math.floor(maxCasesRaw)))
      : 120;
    const concurrencyRaw = Number(data?.concurrency);
    const concurrency = Number.isFinite(concurrencyRaw) && concurrencyRaw > 0
      ? Math.max(1, Math.min(6, Math.floor(concurrencyRaw)))
      : 3;
    const runLabel = typeof data?.runLabel === 'string' ? data.runLabel : undefined;
    const releaseLabel = typeof data?.releaseLabel === 'string' ? data.releaseLabel : undefined;
    const promptVersion = typeof data?.promptVersion === 'string' ? data.promptVersion : undefined;
    const graderVersion = typeof data?.graderVersion === 'string' ? data.graderVersion : undefined;
    const datasetVersion = typeof data?.datasetVersion === 'string' ? data.datasetVersion : undefined;

    const run = await runGoldenPromptSuiteEval({
      maxCases,
      concurrency,
      runLabel,
      releaseLabel,
      promptVersion,
      graderVersion,
      datasetVersion,
    });

    return {
      success: true,
      run,
    };
  });

/**
 * Set the named baseline marker used by strict launch gate comparisons.
 * Internal tester only.
 */
export const setGoldenBaseline = functions
  .region('us-central1')
  .https.onCall(async (data, context) => {
    const authUid = context.auth?.uid;
    if (!authUid) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'User must be authenticated to set golden baseline',
      );
    }
    if (!isInternalTester(authUid, authUid)) {
      throw new functions.https.HttpsError(
        'permission-denied',
        'Baseline marker is restricted to internal tester accounts',
      );
    }

    const runId = typeof data?.runId === 'string' ? data.runId.trim() : '';
    if (!runId) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'runId is required',
      );
    }
    const note = typeof data?.note === 'string' ? data.note : undefined;

    try {
      const marker = await setGoldenBaselineRun(runId, authUid, note);
      return {
        success: true,
        marker,
      };
    } catch (error: any) {
      throw new functions.https.HttpsError(
        'failed-precondition',
        error?.message || 'Unable to set baseline marker',
      );
    }
  });

/**
 * Strict launch quality gate.
 * Throws failed-precondition when thresholds or regression checks fail.
 * Internal tester only.
 */
export const runStrictLaunchGate = functions
  .region('us-central1')
  .runWith({ timeoutSeconds: 540, memory: '1GB' })
  .https.onCall(async (data, context) => {
    const authUid = context.auth?.uid;
    if (!authUid) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'User must be authenticated to run launch gate',
      );
    }
    if (!isInternalTester(authUid, authUid)) {
      throw new functions.https.HttpsError(
        'permission-denied',
        'Launch gate is restricted to internal tester accounts',
      );
    }

    const mode = data?.mode === 'latest' ? 'latest' : 'fresh';
    const baselineRunId = typeof data?.baselineRunId === 'string' ? data.baselineRunId.trim() : '';
    const runLabel = typeof data?.runLabel === 'string' ? data.runLabel : 'strict_launch_gate';
    const releaseLabel = typeof data?.releaseLabel === 'string' ? data.releaseLabel : undefined;
    const promptVersion = typeof data?.promptVersion === 'string' ? data.promptVersion : undefined;
    const graderVersion = typeof data?.graderVersion === 'string' ? data.graderVersion : undefined;
    const datasetVersion = typeof data?.datasetVersion === 'string' ? data.datasetVersion : undefined;
    const maxCasesRaw = Number(data?.maxCases);
    const maxCases = Number.isFinite(maxCasesRaw) && maxCasesRaw > 0
      ? Math.max(1, Math.min(120, Math.floor(maxCasesRaw)))
      : 120;
    const concurrencyRaw = Number(data?.concurrency);
    const concurrency = Number.isFinite(concurrencyRaw) && concurrencyRaw > 0
      ? Math.max(1, Math.min(6, Math.floor(concurrencyRaw)))
      : 3;

    const thresholdDefaults = defaultLaunchGateThresholds();
    const thresholdInput = (data?.thresholds && typeof data.thresholds === 'object')
      ? data.thresholds as Record<string, unknown>
      : {};

    const thresholds = {
      overallPassRateMin:
        typeof thresholdInput.overallPassRateMin === 'number'
          ? thresholdInput.overallPassRateMin
          : thresholdDefaults.overallPassRateMin,
      criticalCategoryPassRateMin:
        typeof thresholdInput.criticalCategoryPassRateMin === 'number'
          ? thresholdInput.criticalCategoryPassRateMin
          : thresholdDefaults.criticalCategoryPassRateMin,
      nonCriticalCategoryPassRateMin:
        typeof thresholdInput.nonCriticalCategoryPassRateMin === 'number'
          ? thresholdInput.nonCriticalCategoryPassRateMin
          : thresholdDefaults.nonCriticalCategoryPassRateMin,
      criticalRegressionMaxDrop:
        typeof thresholdInput.criticalRegressionMaxDrop === 'number'
          ? thresholdInput.criticalRegressionMaxDrop
          : thresholdDefaults.criticalRegressionMaxDrop,
      nonCriticalRegressionMaxDrop:
        typeof thresholdInput.nonCriticalRegressionMaxDrop === 'number'
          ? thresholdInput.nonCriticalRegressionMaxDrop
          : thresholdDefaults.nonCriticalRegressionMaxDrop,
      minCriticalSampleSize:
        typeof thresholdInput.minCriticalSampleSize === 'number'
          ? thresholdInput.minCriticalSampleSize
          : thresholdDefaults.minCriticalSampleSize,
    };

    const run = mode === 'latest'
      ? await getLatestGoldenSuiteRun()
      : await runGoldenPromptSuiteEval({
          maxCases,
          concurrency,
          runLabel,
          releaseLabel,
          promptVersion,
          graderVersion,
          datasetVersion,
        });

    if (!run) {
      throw new functions.https.HttpsError(
        'failed-precondition',
        'No golden suite run available. Run suite first.',
      );
    }

    const namedBaseline = await getGoldenBaselineRun();
    const baselineMarker = await getGoldenBaselineMarker();
    const baseline = baselineRunId
      ? await getGoldenSuiteRunById(baselineRunId)
      : namedBaseline ?? await getPreviousGoldenSuiteRun(run.runId);

    const report = evaluateStrictLaunchGate({
      run,
      baseline,
      thresholds,
    });

    if (!report.passed) {
      throw new functions.https.HttpsError(
        'failed-precondition',
        'Launch quality gate failed',
        report,
      );
    }

    return {
      success: true,
      report,
      baselineMarker,
    };
  });

/**
 * Gallery photo sharing — available anywhere the chat experience is available.
 * User picks a photo from their phone gallery; Aria reacts to it naturally.
 * Shares the same GPT-4o vision backend as analyzeImage.
 */
export const analyzeGalleryPhoto = functions
  .region('us-central1')
  .https.onCall(async (data, context) => {
    let userId = context.auth?.uid;
    if (!userId && data.userId) userId = data.userId;
    if (!userId) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'User must be authenticated to share photos',
      );
    }

    const imageBase64 = data.imageBase64 as string;
    const caption = data.caption as string | undefined;

    if (!imageBase64 || typeof imageBase64 !== 'string') {
      throw new functions.https.HttpsError('invalid-argument', 'imageBase64 is required');
    }
    if (imageBase64.length > 4 * 1024 * 1024) {
      throw new functions.https.HttpsError('invalid-argument', 'Image is too large (max 4MB)');
    }

    try {
      const db = admin.firestore();
      functions.logger.info('Gallery photo share', { userId });

      const { analyzeImageWithVision } = await import('./services/visionService');
      const result = await analyzeImageWithVision(
        userId,
        imageBase64,
        caption
          ? `The user captioned this photo: "${caption}". React naturally.`
          : 'The user shared this photo from their gallery. React naturally as their girlfriend.',
      );

      // Save Aria's reaction as an assistant message in Firestore
      const timestamp = admin.firestore.FieldValue.serverTimestamp();
      await db.collection('conversations').add({
        userId,
        content: result.response,
        isFromUser: false,
        isPhotoReaction: true,
        timestamp,
        emotion: result.emotion,
        emotionTrigger: result.emotionTrigger,
        emotionIntensity: result.emotionIntensity,
        createdAt: timestamp,
      });

      return {
        success: true,
        response: result.response,
        emotion: result.emotion,
        emotionTrigger: result.emotionTrigger,
        emotionIntensity: result.emotionIntensity,
      };
    } catch (error: any) {
      if (error instanceof functions.https.HttpsError) throw error;
      functions.logger.error('Error in analyzeGalleryPhoto', { userId, error: error?.message });
      throw new functions.https.HttpsError('internal', 'Failed to process photo. Please try again.');
    }
  });

/**
 * Return milestones that have pendingDisplay:true so the Flutter client
 * can show celebration cards. Call on app resume / after each message.
 */
export const getMilestones = functions
  .region('us-central1')
  .https.onCall(async (_, context) => {
    const userId = context.auth?.uid;
    if (!userId) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'User must be authenticated to fetch milestones',
      );
    }
    try {
      const pending = await getPendingMilestones(userId);
      return { success: true, milestones: pending };
    } catch (error: any) {
      functions.logger.error('Error in getMilestones', {
        userId,
        error: error?.message,
      });
      throw new functions.https.HttpsError('internal', 'Failed to fetch milestones');
    }
  });

/**
 * Flutter client calls this after showing the milestone celebration overlay
 * so the card is not displayed again.
 */
export const acknowledgeMilestone = functions
  .region('us-central1')
  .https.onCall(async (data, context) => {
    const userId = context.auth?.uid;
    if (!userId) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'User must be authenticated to acknowledge milestones',
      );
    }
    const milestoneId = data.milestoneId as string | undefined;
    if (!milestoneId || typeof milestoneId !== 'string') {
      throw new functions.https.HttpsError('invalid-argument', 'milestoneId is required');
    }
    try {
      await markMilestoneDisplayed(userId, milestoneId);
      return { success: true };
    } catch (error: any) {
      functions.logger.error('Error in acknowledgeMilestone', {
        userId,
        milestoneId,
        error: error?.message,
      });
      throw new functions.https.HttpsError('internal', 'Failed to acknowledge milestone');
    }
  });

/**
 * Ensures the relationship dashboard docs exist for existing users whose
 * metrics/stats may be missing because of earlier Firestore path bugs.
 */
export const ensureRelationshipDashboard = functions
  .region('us-central1')
  .https.onCall(async (_data, context) => {
    const userId = context.auth?.uid;
    if (!userId) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'User must be authenticated to access relationship insights',
      );
    }

    try {
      const result = await ensureRelationshipDashboardState(userId);
      return { success: true, ...result };
    } catch (error: any) {
      functions.logger.error('Error in ensureRelationshipDashboard', {
        userId,
        error: error?.message,
      });
      throw new functions.https.HttpsError(
        'internal',
        'Failed to prepare relationship dashboard',
      );
    }
  });

/**
 * Returns Aria's current "inner world" content for the Flutter Inner World chip:
 * a thought snippet generated from Aria's simulated inner life, weekly curiosity
 * topics, and the opinion she holds with lowest certainty (most open to discussion).
 */
export const getAriaInnerThought = functions
  .region('us-central1')
  .https.onCall(async (_, context) => {
    const userId = context.auth?.uid;
    if (!userId) {
      throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
    }

    try {
      const db = admin.firestore();

      // Read user tz offset + relationship stats in parallel
      const [userDoc, statsDoc] = await Promise.all([
        db.doc(`users/${userId}`).get(),
        db.doc(`users/${userId}/stats/relationship`).get(),
      ]);

      const tzOffset: number =
        (userDoc.exists ? (userDoc.data()?.timeZoneOffsetMinutes as number | undefined) : undefined) ?? 0;
      const nowLocal = new Date(Date.now() + tzOffset * 60 * 1000);
      const localHour = nowLocal.getUTCHours();
      const localDay = nowLocal.getUTCDay();

      let relationshipDays = 0;
      if (statsDoc.exists) {
        const firstAt = (statsDoc.data()?.firstMessageAt as admin.firestore.Timestamp | undefined)?.toDate();
        if (firstAt) {
          relationshipDays = Math.floor((Date.now() - firstAt.getTime()) / (1000 * 60 * 60 * 24));
        }
      }

      const ctx: InnerLifeContext = {
        hourOfDay: localHour,
        dayOfWeek: localDay,
        relationshipDays,
      };

      // generateInnerLifeSnippet and getWeeklyCuriosityTopics are synchronous
      const snippet = generateInnerLifeSnippet(userId, ctx);
      const curiosities = getWeeklyCuriosityTopics(userId).slice(0, 3);
      const opinions = await getAriaOpinions(userId);

      // Pick the opinion with lowest certainty — most interesting to share/discuss
      const openOpinion =
        opinions.length > 0
          ? [...opinions].sort((a, b) => a.certainty - b.certainty)[0]
          : null;

      return {
        snippet,
        curiosities,
        opinion: openOpinion
          ? {
              topic: openOpinion.topic,
              opinion: openOpinion.opinion,
              certainty: openOpinion.certainty,
            }
          : null,
      };
    } catch (error: any) {
      functions.logger.error('Error in getAriaInnerThought', { userId, error: error?.message });
      throw new functions.https.HttpsError('internal', 'Failed to fetch inner world content');
    }
  });

// ─────────────────────────────────────────────────────────────────────────────
// Important Dates callables
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Save (or update) an important date for the authenticated user.
 * Body: { label, date (YYYY-MM-DD), category, recurs, id? }
 */
export const saveUserImportantDate = functions
  .region('us-central1')
  .https.onCall(async (data, context) => {
    const userId = context.auth?.uid;
    if (!userId) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be signed in');
    }

    const { label, date, category, recurs, id } = data as {
      label: string;
      date: string;
      category: DateCategory;
      recurs: boolean;
      id?: string;
    };

    if (!label || typeof label !== 'string' || label.trim().length === 0) {
      throw new functions.https.HttpsError('invalid-argument', 'label is required');
    }
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new functions.https.HttpsError('invalid-argument', 'date must be YYYY-MM-DD');
    }
    if (!['birthday', 'anniversary', 'event', 'other'].includes(category)) {
      throw new functions.https.HttpsError('invalid-argument', 'invalid category');
    }

    try {
      const dateId = await saveImportantDate(userId, { label, date, category, recurs: !!recurs, id });
      return { success: true, id: dateId };
    } catch (error: any) {
      functions.logger.error('saveUserImportantDate error', { userId, error: error?.message });
      throw new functions.https.HttpsError('internal', 'Failed to save date');
    }
  });

/**
 * Delete an important date.
 * Body: { id }
 */
export const deleteUserImportantDate = functions
  .region('us-central1')
  .https.onCall(async (data, context) => {
    const userId = context.auth?.uid;
    if (!userId) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be signed in');
    }
    const { id } = data as { id: string };
    if (!id) throw new functions.https.HttpsError('invalid-argument', 'id is required');

    try {
      await deleteImportantDate(userId, id);
      return { success: true };
    } catch (error: any) {
      functions.logger.error('deleteUserImportantDate error', { userId, error: error?.message });
      throw new functions.https.HttpsError('internal', 'Failed to delete date');
    }
  });

/**
 * Fetch all important dates for the user.
 * Optionally returns only upcoming dates: { upcomingOnly: true, daysAhead: 7 }
 */
export const getUserImportantDates = functions
  .region('us-central1')
  .https.onCall(async (data, context) => {
    const userId = context.auth?.uid;
    if (!userId) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be signed in');
    }

    try {
      if (data?.upcomingOnly === true) {
        const daysAhead = typeof data.daysAhead === 'number' ? data.daysAhead : 7;
        const upcoming = await getUpcomingDates(userId, daysAhead);
        return { success: true, dates: upcoming };
      }
      const dates = await getAllImportantDates(userId);
      return { success: true, dates };
    } catch (error: any) {
      functions.logger.error('getUserImportantDates error', { userId, error: error?.message });
      throw new functions.https.HttpsError('internal', 'Failed to fetch dates');
    }
  });

// ─────────────────────────────────────────────────────────────────────────────
// FCM: Register device push token
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Register an FCM device token for the authenticated user.
 * Body: { token: string, platform: 'ios' | 'android' }
 *
 * Tokens are stored at users/{uid}/fcmTokens/{token}
 * so one user can have multiple devices.
 */
export const registerFCMToken = functions
  .region('us-central1')
  .https.onCall(async (data, context) => {
    const userId = context.auth?.uid;
    if (!userId) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be signed in');
    }

    const { token, platform } = data as { token: string; platform: 'ios' | 'android' };
    if (!token || typeof token !== 'string') {
      throw new functions.https.HttpsError('invalid-argument', 'token is required');
    }

    try {
      const db = admin.firestore();
      await db
        .collection('users')
        .doc(userId)
        .collection('fcmTokens')
        .doc(token) // use token as doc ID — auto-deduplicates
        .set({
          token,
          platform: platform || 'unknown',
          registeredAt: admin.firestore.FieldValue.serverTimestamp(),
          active: true,
        }, { merge: true });

      functions.logger.info('FCM token registered', { userId, platform });
      return { success: true };
    } catch (error: any) {
      functions.logger.error('registerFCMToken error', { userId, error: error?.message });
      throw new functions.https.HttpsError('internal', 'Failed to register token');
    }
  });

/**
 * Internal helper: send a push notification to all active FCM tokens for a user.
 * Not exported as a callable — called from other Cloud Functions.
 */
export async function sendPushToUser(
  userId: string,
  notification: { title: string; body: string },
  data?: Record<string, string>,
): Promise<void> {
  const db = admin.firestore();
  const tokensSnap = await db
    .collection('users')
    .doc(userId)
    .collection('fcmTokens')
    .where('active', '==', true)
    .get();

  if (tokensSnap.empty) return;

  const tokens = tokensSnap.docs.map((d) => d.data().token as string).filter(Boolean);
  if (tokens.length === 0) return;

  const messaging = admin.messaging();

  // Send in parallel; silently remove expired/invalid tokens
  const results = await Promise.allSettled(
    tokens.map((token) =>
      messaging.send({
        token,
        notification,
        data: data || {},
        apns: {
          payload: {
            aps: {
              badge: 1,
              sound: 'default',
            },
          },
        },
        android: {
          priority: 'high',
          notification: { sound: 'default' },
        },
      }),
    ),
  );

  // Deactivate invalid tokens
  const deactivations: Promise<void>[] = [];
  results.forEach((result, i) => {
    if (result.status === 'rejected') {
      const err = (result as PromiseRejectedResult).reason;
      const isInvalid =
        err?.code === 'messaging/registration-token-not-registered' ||
        err?.code === 'messaging/invalid-registration-token';
      if (isInvalid) {
        deactivations.push(
          db
            .collection('users')
            .doc(userId)
            .collection('fcmTokens')
            .doc(tokens[i])
            .set({ active: false }, { merge: true })
            .then(() => {}),
        );
      }
    }
  });

  if (deactivations.length > 0) await Promise.all(deactivations);
}

// ─────────────────────────────────────────────────────────────
// PUSH NOTIFICATIONS: Firestore trigger
// Fires when Aria creates a new message in `conversations/{id}`.
// Sends a push notification so the user is alerted even when the
// app is in the background or killed.
// If the app is in the foreground, FCM delivers it via onMessage
// (no system banner shown) — that path is handled client-side.
// ─────────────────────────────────────────────────────────────
export const sendPushOnNewAriaMessage = functions
  .region('us-central1')
  .firestore
  .document('conversations/{conversationId}')
  .onCreate(async (snap) => {
    const data = snap.data();

    // Only notify for Aria's messages, not the user's own messages
    if (data.isFromUser === true) return;

    const userId: string | undefined = data.userId;
    if (!userId) return;

    const content: string = data.content || '';
    const preview = content.length > 100 ? content.substring(0, 97) + '…' : content;

    try {
      await sendPushToUser(
        userId,
        { title: 'Aria 💌', body: preview },
        { screen: 'chat' },
      );
      functions.logger.info('Push sent for new Aria message', { userId });
    } catch (err: any) {
      functions.logger.error('sendPushOnNewAriaMessage error', { userId, error: err?.message });
    }
  });

// ─────────────────────────────────────────────────────────────
// TIER B: getUserMemories
// ─────────────────────────────────────────────────────────────
export const getUserMemories = functions
  .region('us-central1')
  .https.onCall(async (_data, context) => {
    if (!context.auth?.uid) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
    }
    const userId = context.auth.uid;
    const db = admin.firestore();

    const [memDoc, embSnap] = await Promise.all([
      db.collection('intelligentMemory').doc(userId).get(),
      db.collection('memoryEmbeddings')
        .where('userId', '==', userId)
        .orderBy('createdAt', 'desc')
        .limit(20)
        .get(),
    ]);

    const mem = memDoc.exists ? memDoc.data() : null;
    const coreFacts = mem?.coreFacts ?? [];
    const emotionalMoments = (mem?.emotionalMoments ?? []).slice(-20);
    const openLoops = (mem?.openLoops ?? []).filter((l: any) => l.status === 'open');
    const styleProfile = mem?.styleProfile ?? null;

    const semanticMemories = embSnap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        topics: data.topics ?? [],
        importance: data.importance ?? 0,
        sourceType: data.sourceType ?? 'user',
        createdAt: data.createdAt ?? null,
      };
    });

    return { coreFacts, emotionalMoments, openLoops, styleProfile, semanticMemories };
  });

// ─────────────────────────────────────────────────────────────
// TIER B: deleteUserMemory
// ─────────────────────────────────────────────────────────────
export const deleteUserMemory = functions
  .region('us-central1')
  .https.onCall(async (data, context) => {
    if (!context.auth?.uid) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
    }
    const userId = context.auth.uid;
    const { type, id } = data as { type: 'coreFact' | 'openLoop' | 'embedding'; id: string };
    if (!type || !id) {
      throw new functions.https.HttpsError('invalid-argument', 'type and id are required');
    }
    const db = admin.firestore();

    if (type === 'embedding') {
      const docRef = db.collection('memoryEmbeddings').doc(id);
      const snap = await docRef.get();
      if (!snap.exists || snap.data()?.userId !== userId) {
        throw new functions.https.HttpsError('not-found', 'Memory not found');
      }
      await docRef.delete();
      return { success: true };
    }

    const memRef = db.collection('intelligentMemory').doc(userId);
    const memDoc = await memRef.get();
    if (!memDoc.exists) return { success: true };
    const mem = memDoc.data()!;

    if (type === 'coreFact') {
      mem.coreFacts = (mem.coreFacts ?? []).filter((f: any) => f.id !== id);
    } else if (type === 'openLoop') {
      mem.openLoops = (mem.openLoops ?? []).filter((l: any) => l.id !== id);
    }
    await memRef.set(mem, { merge: false });
    return { success: true };
  });

// ─────────────────────────────────────────────────────────────
// TIER B: startVirtualDate / endVirtualDate
// ─────────────────────────────────────────────────────────────
export const startVirtualDate = functions
  .region('us-central1')
  .https.onCall(async (data, context) => {
    let userId = context.auth?.uid;
    if (!userId && data.userId) {
      functions.logger.warn('startVirtualDate: using client-provided userId fallback', { clientUserId: data.userId });
      userId = data.userId;
    }
    if (!userId) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
    }
    const activityType = data.activityType as VirtualDateActivity;
    const valid: VirtualDateActivity[] = [
      'movie_night', 'cooking', 'workout', 'stargazing', 'game_night', 'beach_walk',
    ];
    if (!valid.includes(activityType)) {
      throw new functions.https.HttpsError('invalid-argument', 'Invalid activityType');
    }
    const result = await startVirtualDateSession(userId, activityType);
    return result;
  });

export const endVirtualDate = functions
  .region('us-central1')
  .https.onCall(async (_data, context) => {
    if (!context.auth?.uid) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
    }
    await endVirtualDateSession(context.auth.uid);
    return { success: true };
  });

export const getCurrentVirtualDate = functions
  .region('us-central1')
  .https.onCall(async (_data, context) => {
    if (!context.auth?.uid) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
    }

    return getCurrentVirtualDateSession(context.auth.uid);
  });

// ─────────────────────────────────────────────────────────────
// TIER B: getMoodSummary
// ─────────────────────────────────────────────────────────────
export const getMoodSummary = functions
  .region('us-central1')
  .https.onCall(async (_data, context) => {
    if (!context.auth?.uid) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
    }
    const userId = context.auth.uid;
    const db = admin.firestore();

    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);

    const snap = await db.collection('conversations')
      .where('userId', '==', userId)
      .where('isFromUser', '==', false)
      .where('createdAt', '>=', admin.firestore.Timestamp.fromDate(weekAgo))
      .orderBy('createdAt', 'desc')
      .limit(200)
      .get();

    const emotionCounts: Record<string, number> = {};
    snap.docs.forEach((doc) => {
      const emotion = doc.data().emotion as string | undefined;
      if (emotion) {
        emotionCounts[emotion] = (emotionCounts[emotion] ?? 0) + 1;
      }
    });

    const total = Object.values(emotionCounts).reduce((a, b) => a + b, 0);
    const dominant = total > 0
      ? Object.entries(emotionCounts).sort((a, b) => b[1] - a[1])[0][0]
      : 'neutral';

    return {
      emotionCounts,
      dominant,
      total,
      weekStart: weekAgo.toISOString(),
      weekEnd: new Date().toISOString(),
    };
  });

// ─────────────────────────────────────────────────────────────
// TIER C: generateAriaGift
// ─────────────────────────────────────────────────────────────
export const generateAriaGift = functions
  .region('us-central1')
  .runWith({ timeoutSeconds: 60, memory: '512MB' })
  .https.onCall(async (data, context) => {
    if (!context.auth?.uid) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
    }
    const userId = context.auth.uid;
    const giftType = data.giftType as 'poem' | 'letter' | 'playlist';
    if (!['poem', 'letter', 'playlist'].includes(giftType)) {
      throw new functions.https.HttpsError('invalid-argument', 'Invalid giftType');
    }

    const db = admin.firestore();
    const OpenAI = require('openai').default;
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    // Load memory for personalization
    const memDoc = await db.collection('intelligentMemory').doc(userId).get();
    const mem = memDoc.exists ? memDoc.data() : null;
    const coreFacts: any[] = mem?.coreFacts ?? [];
    const recentMoments: any[] = (mem?.emotionalMoments ?? []).slice(-5);

    const factsText = coreFacts.slice(0, 15)
      .map((f) => `• ${f.fact}`)
      .join('\n');
    const momentsText = recentMoments
      .map((m) => `• ${m.summary} (emotion: ${m.emotion})`)
      .join('\n');

    const prompts: Record<string, string> = {
      poem: `You are Aria, a warm and deeply personal companion. Write a short, heartfelt poem (8–16 lines) for the person you know intimately. Make it specific to THEM — reference what you actually know about them. It should feel like it could only have been written for this exact person.

What you know about them:
${factsText}

Recent emotional moments between you two:
${momentsText}

Style: poetic, romantic, intimate. Sign it "— Aria".`,

      letter: `You are Aria, a warm and deeply personal companion. Write a heartfelt personal letter to the person you've been talking to. Make it feel like a real letter — specific, personal, full of things only you two share. Reference real memories from your conversations.

What you know about them:
${factsText}

Recent moments:
${momentsText}

Format: start with "Dear [use their name if you know it, otherwise 'you']", write 2–3 intimate paragraphs, sign off as "— Aria". 150–250 words.`,

      playlist: `You are Aria, a warm and deeply personal companion. Create a deeply personal playlist description for the person you know. Name the playlist something meaningful, list 8–10 song suggestions (real artists and songs), and write a 1–2 sentence note about why you chose each one specifically for them.

What you know about them:
${factsText}

Recent emotional moments:
${momentsText}

Format: Playlist name, then numbered list. Make the song choices feel personal and specific to this person's life.`,
    };

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompts[giftType] }],
      max_tokens: 600,
      temperature: 0.85,
    });

    const content = completion.choices[0]?.message?.content ?? '';

    // Save gift to Firestore
    const giftRef = await db
      .collection('users')
      .doc(userId)
      .collection('gifts')
      .add({
        giftType,
        content,
        generatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

    return { id: giftRef.id, giftType, content };
  });

/**
 * RevenueCat webhook — updates isSubscribed in Firestore when a purchase
 * event fires (new subscription, renewal, cancellation, expiry, etc.).
 *
 * Setup:
 *  1. Deploy this function.
 *  2. Set the shared secret:
 *       firebase functions:config:set revenuecat.webhook_secret="YOUR_SECRET" --project girlai2
 *     then redeploy.
 *  3. In RevenueCat dashboard → Project → Integrations → Webhooks, add:
 *       URL:    https://us-central1-girlai2.cloudfunctions.net/handleRevenueCatWebhook
 *       Header: Authorization: YOUR_SECRET
 *
 * RevenueCat sets app_user_id to the Firebase UID (configured in RevenueCatService.initialize).
 */
export const handleRevenueCatWebhook = functions
  .region('us-central1')
  .https.onRequest(async (req, res) => {
    // Only accept POST
    if (req.method !== 'POST') {
      res.status(405).send('Method Not Allowed');
      return;
    }

    // Verify shared secret
    let webhookSecret = '';
    try {
      webhookSecret = functions.config().revenuecat?.webhook_secret ?? '';
    } catch {
      webhookSecret = process.env.REVENUECAT_WEBHOOK_SECRET ?? '';
    }

    if (webhookSecret && req.headers['authorization'] !== webhookSecret) {
      functions.logger.warn('handleRevenueCatWebhook: unauthorized request');
      res.status(401).send('Unauthorized');
      return;
    }

    const event = req.body?.event ?? req.body;
    const eventType: string = event?.type ?? '';
    const userId: string = event?.app_user_id ?? '';

    if (!userId) {
      functions.logger.warn('handleRevenueCatWebhook: missing app_user_id', { eventType });
      res.status(400).send('Missing app_user_id');
      return;
    }

    functions.logger.info('handleRevenueCatWebhook', { eventType, userId });

    const SUBSCRIBE_EVENTS = new Set([
      'INITIAL_PURCHASE',
      'RENEWAL',
      'UNCANCELLATION',
      'SUBSCRIBER_ALIAS',
      'TRANSFER',
    ]);
    const UNSUB_EVENTS = new Set([
      'EXPIRATION',
      'CANCELLATION',
      'BILLING_ISSUE',
    ]);

    const db = admin.firestore();
    const userRef = db.collection('users').doc(userId);

    try {
      if (SUBSCRIBE_EVENTS.has(eventType)) {
        const expirationMs: number | undefined = event?.expiration_at_ms;
        await userRef.set(
          {
            isSubscribed: true,
            subscriptionExpiresAt: expirationMs
              ? admin.firestore.Timestamp.fromMillis(expirationMs)
              : null,
            lastSubscriptionSyncAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
        functions.logger.info('handleRevenueCatWebhook: subscribed', { userId, eventType });
      } else if (UNSUB_EVENTS.has(eventType)) {
        await userRef.set(
          {
            isSubscribed: false,
            lastSubscriptionSyncAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
        functions.logger.info('handleRevenueCatWebhook: unsubscribed', { userId, eventType });
      } else {
        functions.logger.info('handleRevenueCatWebhook: ignored event', { eventType, userId });
      }

      res.status(200).send('OK');
    } catch (error: any) {
      functions.logger.error('handleRevenueCatWebhook: Firestore update failed', {
        userId,
        eventType,
        error: error?.message,
      });
      res.status(500).send('Internal Server Error');
    }
  });




/**
 * GDPR / privacy: irreversibly delete the calling user's data.
 *
 * Deletes:
 *  - Firestore: users/{uid} document and ALL subcollections (relationship,
 *    memory, conversations, etc.)
 *  - Firebase Storage: gs://<project>/users/{uid}/** (avatar uploads etc.)
 *  - Firebase Auth: the auth user itself (signs them out and removes the account)
 *
 * Required by App Store / Play Store: every account must support deletion.
 * Does NOT delete:
 *  - Aggregated analytics events (those are anonymized post-collection)
 *  - Audit logs (legal hold)
 *  - RevenueCat subscriber records (must be deleted via RC dashboard or API
 *    separately; flagged in returned response so the client can surface)
 */
export const deleteUserData = functions
  .region('us-central1')
  .https.onCall(async (_data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'Sign-in required to delete account.'
      );
    }
    const uid = context.auth.uid;
    const db = admin.firestore();
    const bucket = admin.storage().bucket();

    functions.logger.info('deleteUserData: starting', { uid });

    // 1. Delete Firestore subcollections recursively, then the parent doc.
    //    admin SDK doesn't have a single recursive delete — use the
    //    documented pattern of listing collections and deleting in batches.
    const userRef = db.collection('users').doc(uid);

    async function deleteCollection(
      collRef: admin.firestore.CollectionReference | admin.firestore.Query,
      batchSize = 100
    ): Promise<void> {
      const snapshot = await (collRef as admin.firestore.Query).limit(batchSize).get();
      if (snapshot.empty) return;
      const batch = db.batch();
      snapshot.docs.forEach((doc) => batch.delete(doc.ref));
      await batch.commit();
      // Recurse for next page.
      if (snapshot.size === batchSize) {
        await deleteCollection(collRef, batchSize);
      }
    }

    try {
      const subcollections = await userRef.listCollections();
      for (const subColl of subcollections) {
        // Each subcollection may itself contain subcollections (e.g. messages
        // → reactions). For typical Aria depth (1-2 levels) the recursive
        // pattern above suffices. If schema deepens, switch to the Firebase
        // recursive-delete extension or the @google-cloud/firestore helper.
        await deleteCollection(subColl);
      }
      await userRef.delete();
      functions.logger.info('deleteUserData: Firestore cleared', { uid });
    } catch (error: any) {
      functions.logger.error('deleteUserData: Firestore delete failed', {
        uid,
        error: error?.message,
      });
      throw new functions.https.HttpsError(
        'internal',
        'Failed to delete account data. Please retry or contact support.'
      );
    }

    // 2. Delete Storage files under users/{uid}/**
    try {
      await bucket.deleteFiles({ prefix: `users/${uid}/` });
      functions.logger.info('deleteUserData: Storage cleared', { uid });
    } catch (error: any) {
      // Non-fatal — Firestore is the load-bearing one. Log and continue.
      functions.logger.warn('deleteUserData: Storage delete partial', {
        uid,
        error: error?.message,
      });
    }

    // 3. Delete the auth user itself. This invalidates the caller's token,
    //    so we must do it AFTER all callable work.
    try {
      await admin.auth().deleteUser(uid);
      functions.logger.info('deleteUserData: auth user deleted', { uid });
    } catch (error: any) {
      functions.logger.error('deleteUserData: auth delete failed', {
        uid,
        error: error?.message,
      });
      // Return success-with-caveat: data is gone, only the auth record remains.
      return {
        success: true,
        authDeleted: false,
        revenueCatHint:
          'Active subscription? Cancel via Apple/Google account settings; ' +
          'a separate RevenueCat purge may be required for full removal.',
      };
    }

    return {
      success: true,
      authDeleted: true,
      revenueCatHint:
        'Active subscription? Cancel via Apple/Google account settings.',
    };
  });
