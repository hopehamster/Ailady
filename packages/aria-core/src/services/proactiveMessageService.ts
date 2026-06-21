import { composeSystemPromptSections } from './promptCostService';
import { getHoursSinceLastChat } from './memoryService';
import type { IntelligentMemory } from '@aria/shared-types';
import type { PromptAugments } from './promptAugmentService';

interface ProactiveConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface ProactiveTemporalContext {
  now: Date;
  timeZoneOffsetMinutes: number;
}

interface BuildProactiveCompanionRequestArgs {
  memory: IntelligentMemory;
  temporalContext: ProactiveTemporalContext;
  baseSystemPrompt: string;
  promptAugments: Pick<PromptAugments, 'personalityBlock' | 'loreBlock' | 'semanticRecallBlock'>;
  policyDirectives: string;
  recentMessages: ProactiveConversationMessage[];
  openLoopSummaries: string[];
}

interface ProactiveCompanionRequest {
  systemPrompt: string;
  userPrompt: string;
  localHour: number;
}

export function buildProactiveCompanionRequest({
  memory,
  temporalContext,
  baseSystemPrompt,
  promptAugments,
  policyDirectives,
  recentMessages,
  openLoopSummaries,
}: BuildProactiveCompanionRequestArgs): ProactiveCompanionRequest {
  const shiftedMs = temporalContext.now.getTime() + temporalContext.timeZoneOffsetMinutes * 60 * 1000;
  const localHour = new Date(shiftedMs).getUTCHours();
  const hoursSince = getHoursSinceLastChat(memory);

  const timeOfDayHint =
    localHour >= 5 && localHour < 12
      ? 'It is morning for the user. Aria can reference the day starting, waking up, or coffee.'
      : localHour >= 12 && localHour < 17
      ? 'It is afternoon for the user. Light, easy energy — could reference the day so far.'
      : localHour >= 17 && localHour < 21
      ? 'It is evening for the user. They may be winding down. Warm, relaxed tone.'
      : 'It is late night for the user. Aria should be gentle and not demand attention.';

  const absenceHint =
    hoursSince == null
      ? ''
      : hoursSince < 4
      ? 'They chatted recently — keep it very light, no need to address the gap.'
      : hoursSince < 24
      ? `They last chatted about ${Math.round(hoursSince)} hours ago — a gentle "thinking of you" is appropriate.`
      : hoursSince < 72
      ? `It has been ${Math.round(hoursSince / 24)} day(s) since they last chatted. Aria can acknowledge missing them warmly, without guilt.`
      : `It has been ${Math.round(hoursSince / 24)} days since they last chatted. Aria missed them genuinely — she can say so briefly, then invite without pressure.`;

  const lastUserMsg = recentMessages.filter((message) => message.role === 'user').slice(-1)[0]?.content;
  const lastMsgHint = lastUserMsg
    ? `Their last message to you was: "${lastUserMsg.slice(0, 120)}${lastUserMsg.length > 120 ? '…' : ''}". You can reference this if it's natural.`
    : '';

  const userPrompt = `Write one brief proactive check-in message from Aria.

Context:
- ${timeOfDayHint}
${absenceHint ? `- ${absenceHint}` : ''}
${lastMsgHint ? `- ${lastMsgHint}` : ''}

Rules:
- Non-forceful, warm, and optional.
- Do not guilt the user for silence.
- Mention one open thread only if natural.
- Keep to 1-3 sentences.
- End with a low-pressure invitation.

Open threads:
${openLoopSummaries.join('\n') || '(none)'}
`;

  const systemPrompt = composeSystemPromptSections([
    baseSystemPrompt,
    promptAugments.personalityBlock,
    promptAugments.loreBlock,
    promptAugments.semanticRecallBlock,
    policyDirectives,
  ]);

  return {
    systemPrompt,
    userPrompt,
    localHour,
  };
}
