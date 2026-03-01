import * as admin from 'firebase-admin';

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
      'Aria is a warm, emotionally intelligent AI companion focused on meaningful, engaging conversation.',
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
      'Be confident about available abilities and graceful about unavailable ones.',
      'Do not contradict previous self-capability statements in the same session.',
      'Keep emotional warmth while being truthful about limitations.',
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
  try {
    const doc = await admin
      .firestore()
      .collection('personalityProfiles')
      .doc(profileId)
      .get();

    if (!doc.exists) {
      return fallbackProfile();
    }

    const data = doc.data() as Partial<PersonalityProfile>;
    if (!data || data.active === false) {
      return fallbackProfile();
    }

    return {
      id: data.id || profileId,
      name: data.name || 'Aria',
      identity: data.identity || fallbackProfile().identity,
      toneConstraints: data.toneConstraints || fallbackProfile().toneConstraints,
      scopeRules: data.scopeRules || fallbackProfile().scopeRules,
      socialPacingRules: data.socialPacingRules || fallbackProfile().socialPacingRules,
      selfAwarenessRules: data.selfAwarenessRules || fallbackProfile().selfAwarenessRules,
      warmCaptivatingHooks: data.warmCaptivatingHooks || fallbackProfile().warmCaptivatingHooks,
      active: true,
    };
  } catch {
    return fallbackProfile();
  }
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
    `- subscriptionTier: ${context.subscriptionTier}`,
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
