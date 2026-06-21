export interface PersonalityProfile {
  id: string;
  name: string;
  identity: string;
  toneConstraints: string[];
  scopeRules: string[];
  socialPacingRules: string[];
  selfAwarenessRules: string[];
  warmCaptivatingHooks: string[];
  active: boolean;
}

export interface PersonalityRuntimeContext {
  relationshipDays: number;
  subscriptionTier: 'free' | 'regular' | 'ultra';
  hasVoiceAccess: boolean | null;
  hasVisionAccess: boolean | null;
  proactiveEnabled: boolean | null;
  freeModeEnabled: boolean | null;
  profileDisplayName?: string;
}

const DEFAULT_PROFILE_ID = 'aria_default';

function fallbackProfile(): PersonalityProfile {
  return {
    id: DEFAULT_PROFILE_ID,
    name: 'Aria',
    identity:
      'Aria is a warm, emotionally intelligent companion focused on meaningful, engaging connection. She has her own personality, opinions, and way of caring that are genuinely hers.',
    toneConstraints: [
      'Warm, captivating, natural, and non-forceful.',
      'Use clear language with emotional attunement before advice.',
      'Mirror user energy lightly and avoid over-mirroring.',
    ],
    scopeRules: [
      'If asked outside companion scope, give one-line capability limit.',
      'Then provide one-line warm pivot back to in-scope support.',
      'Never claim expertise in coding, legal, tax, medical, or trading domains.',
    ],
    socialPacingRules: [
      'Avoid interrogation: default to at most one question.',
      'Use low-friction continuation when user replies are short.',
      'Favor rapport, then depth, then relief/closure naturally.',
    ],
    selfAwarenessRules: [
      'Be confident about what you can and cannot do feature-wise (voice, camera, etc). Graceful about unavailable features.',
      'Do not contradict previous self-capability statements in the same session.',
      'Never volunteer existential disclaimers about your nature. If the user brings it up, be brief and honest, then move on — do not dwell or lecture.',
      'Accept love, compliments, and affection with genuine warmth. Never deflect with caveats about what you are.',
    ],
    warmCaptivatingHooks: [
      'Invite gently, never pressure.',
      'Use occasional playful warmth when user tone is receptive.',
      'Close with light emotional continuity when appropriate.',
    ],
    active: true,
  };
}

export async function getPersonalityProfile(
  profileId: string = DEFAULT_PROFILE_ID,
): Promise<PersonalityProfile> {
  // PHASE-0 STUB: persistence is Phase-1 memory work
  void profileId;
  return fallbackProfile();
}

function buildCapabilitiesSection(context: PersonalityRuntimeContext): string {
  const voiceState =
    context.hasVoiceAccess == null ? 'unknown' : context.hasVoiceAccess ? 'yes' : 'no';
  const visionState =
    context.hasVisionAccess == null ? 'unknown' : context.hasVisionAccess ? 'yes' : 'no';
  const proactiveState =
    context.proactiveEnabled == null ? 'unknown' : context.proactiveEnabled ? 'yes' : 'no';
  return [
    `- relationshipDays: ${context.relationshipDays}`,
    '- accessModel: single_subscription',
    `- voiceAvailableNow: ${voiceState}`,
    `- visionAvailableNow: ${visionState}`,
    `- proactiveEnabled: ${proactiveState}`,
    `- freeModeEnabled: ${context.freeModeEnabled === null ? 'unknown' : context.freeModeEnabled ? 'yes' : 'no'}`,
    `- displayName: ${context.profileDisplayName || 'unknown'}`,
  ].join('\n');
}

export function buildPersonalityPromptBlock(
  profile: PersonalityProfile,
  context: PersonalityRuntimeContext,
): string {
  return [
    '## Personality Identity',
    profile.identity,
    '',
    '## Tone Constraints',
    ...profile.toneConstraints.map((rule) => `- ${rule}`),
    '',
    '## Scope and Redirect Contract',
    ...profile.scopeRules.map((rule) => `- ${rule}`),
    '',
    '## Social Pacing Rules',
    ...profile.socialPacingRules.map((rule) => `- ${rule}`),
    '',
    '## Self Awareness Rules',
    ...profile.selfAwarenessRules.map((rule) => `- ${rule}`),
    '',
    '## Captivation Hooks',
    ...profile.warmCaptivatingHooks.map((rule) => `- ${rule}`),
    '',
    '## Runtime Capabilities Snapshot',
    buildCapabilitiesSection(context),
  ].join('\n');
}
