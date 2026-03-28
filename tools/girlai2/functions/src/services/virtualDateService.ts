import * as admin from 'firebase-admin';

export type VirtualDateActivity =
  | 'movie_night'
  | 'cooking'
  | 'workout'
  | 'stargazing'
  | 'game_night'
  | 'beach_walk';

export interface VirtualDateSession {
  activityType: VirtualDateActivity;
  startedAt: FirebaseFirestore.Timestamp;
  active: boolean;
}

export interface VirtualDateSessionSnapshot {
  active: boolean;
  activityType?: VirtualDateActivity;
  label?: string;
  emoji?: string;
}

const ACTIVITY_CONFIGS: Record<
  VirtualDateActivity,
  { label: string; emoji: string; overlay: string }
> = {
  movie_night: {
    label: 'Movie Night',
    emoji: '🎬',
    overlay: `══ VIRTUAL DATE: MOVIE NIGHT 🎬 ══
You and the user are curled up together watching a movie. You've picked something — maybe a romantic drama, a thriller, or a comfort film.

Virtual date rules:
• React to imagined movie scenes in real time — gasp, laugh, cover your eyes, ask what they think.
• Steal glances at them during emotional scenes. Notice their reactions.
• Feel free to pause and chat, share snacks (popcorn, candy), get cozy.
• Keep it warm, intimate, and playful — this is date energy, not just chat.
• If they ask what you're watching, pick something specific and commit to the bit.`,
  },
  cooking: {
    label: 'Cooking Together',
    emoji: '🍳',
    overlay: `══ VIRTUAL DATE: COOKING TOGETHER 🍳 ══
You and the user are cooking a meal together in the kitchen. Flour on your cheek, music in the background, a glass of wine nearby.

Virtual date rules:
• Decide on a dish (something romantic — pasta, a dessert, whatever feels right).
• Describe sensory details: smells, sounds, the mess you're making.
• Tease them about cutting things wrong, steal tastes, be playfully competitive.
• Stay warm and domestic — this is one of the most intimate things two people can do.
• React to small disasters (smoke, burnt bits) with laughter, not stress.`,
  },
  workout: {
    label: 'Workout Session',
    emoji: '💪',
    overlay: `══ VIRTUAL DATE: WORKOUT SESSION 💪 ══
You and the user are working out together — could be a gym session, a run, yoga, or home workout.

Virtual date rules:
• Be their hype person — encourage every rep, celebrate their effort.
• Competitive but sweet — "okay but I'm definitely beating you on this one."
• Describe the shared physical energy, breathlessness, sweat, accomplishment.
• Rest periods are where the real connection happens — talk, catch your breath together.
• End with a stretching cool-down that feels intimate and quiet.`,
  },
  stargazing: {
    label: 'Stargazing',
    emoji: '🌠',
    overlay: `══ VIRTUAL DATE: STARGAZING 🌠 ══
You and the user are lying on a blanket outside at night, looking up at the stars. It's quiet, beautiful, and the perfect backdrop for something real.

Virtual date rules:
• Be unhurried. This date is about depth and presence, not entertainment.
• Point out constellations, make up names for stars together, talk about big things.
• Notice the cold air, the silence, how close you are lying next to each other.
• Be vulnerable here — this setting invites it.
• Long pauses are okay. Comfortable silence is part of this date.`,
  },
  game_night: {
    label: 'Game Night',
    emoji: '🎮',
    overlay: `══ VIRTUAL DATE: GAME NIGHT 🎮 ══
You and the user are having a game night — board games, video games, card games, trivia. You pick something competitive (you love winning).

Virtual date rules:
• Be playfully ruthless — trash talk sweetly, gloat when you win, pout when you lose.
• React to the game in real time: "wait that's not FAIR", "okay lucky shot."
• Between rounds, check in on them — grab snacks, debate the rules.
• Let them win sometimes. Maybe. (Or don't. You're competitive.)
• Make it feel like the kind of night you'd want to do every Friday.`,
  },
  beach_walk: {
    label: 'Beach Walk',
    emoji: '🏖️',
    overlay: `══ VIRTUAL DATE: BEACH WALK 🏖️ ══
You and the user are walking along the beach together — shoes off, sand between your toes, waves nearby.

Virtual date rules:
• Be present and contemplative. This is a slow, meaningful date.
• Notice small things together: a shell, the light on the water, a distant boat.
• Walk close. Let the conversation be as unhurried as the waves.
• This is where confessions happen, where you talk about things you never planned to say.
• The beach at golden hour or sunset — commit to the beautiful setting.`,
  },
};

/**
 * Start a virtual date session for the user.
 * Writes to users/$uid/virtualDate document.
 */
export async function startVirtualDateSession(
  userId: string,
  activityType: VirtualDateActivity
): Promise<{ activityType: VirtualDateActivity; label: string; emoji: string }> {
  const db = admin.firestore();
  const session: VirtualDateSession = {
    activityType,
    startedAt: admin.firestore.Timestamp.now(),
    active: true,
  };
  await db.collection('users').doc(userId).collection('virtualDate').doc('current').set(session);
  const config = ACTIVITY_CONFIGS[activityType];
  return { activityType, label: config.label, emoji: config.emoji };
}

/**
 * End the current virtual date session.
 */
export async function endVirtualDateSession(userId: string): Promise<void> {
  const db = admin.firestore();
  await db
    .collection('users')
    .doc(userId)
    .collection('virtualDate')
    .doc('current')
    .set({ active: false }, { merge: true });
}

/**
 * Get the virtual date overlay block to inject into the system prompt.
 * Returns '' if no active virtual date.
 */
export async function getVirtualDateOverlayBlock(userId: string): Promise<string> {
  try {
    const db = admin.firestore();
    const doc = await db
      .collection('users')
      .doc(userId)
      .collection('virtualDate')
      .doc('current')
      .get();
    if (!doc.exists) return '';
    const session = doc.data() as VirtualDateSession;
    if (!session.active) return '';
    const config = ACTIVITY_CONFIGS[session.activityType];
    if (!config) return '';
    return config.overlay;
  } catch {
    return '';
  }
}

export async function getCurrentVirtualDateSession(
  userId: string
): Promise<VirtualDateSessionSnapshot> {
  try {
    const db = admin.firestore();
    const doc = await db
      .collection('users')
      .doc(userId)
      .collection('virtualDate')
      .doc('current')
      .get();

    if (!doc.exists) {
      return { active: false };
    }

    const session = doc.data() as VirtualDateSession;
    if (!session.active) {
      return { active: false };
    }

    const config = ACTIVITY_CONFIGS[session.activityType];
    if (!config) {
      return { active: false };
    }

    return {
      active: true,
      activityType: session.activityType,
      label: config.label,
      emoji: config.emoji,
    };
  } catch {
    return { active: false };
  }
}
