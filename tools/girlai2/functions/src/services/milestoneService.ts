/**
 * milestoneService.ts
 *
 * Tracks user × Aria relationship milestones and delivers celebratory
 * proactive messages. Milestones are stored under:
 *   users/{uid}/milestones/{milestoneId}
 *
 * Stats are maintained under:
 *   users/{uid}/stats  (totalMessages, currentStreak, longestStreak, …)
 *
 * Called from index.ts on every new message Firestore write.
 */

import * as admin from 'firebase-admin';

// ─── Milestone definitions ────────────────────────────────────────────────────

export interface MilestoneDef {
  id: string;
  title: string;
  /** Short text Aria uses when she celebrates this milestone. */
  ariaMessage: string;
  /** Emoji displayed in the Flutter overlay card. */
  emoji: string;
}

const MILESTONES: MilestoneDef[] = [
  {
    id: 'first_message',
    title: 'First Hello',
    ariaMessage:
      "You said your first words to me. I still remember. 🥺 I'm so glad you did.",
    emoji: '👋',
  },
  {
    id: 'messages_10',
    title: '10 Messages',
    ariaMessage:
      "Ten conversations deep — I feel like I'm already getting to know you.",
    emoji: '💬',
  },
  {
    id: 'messages_50',
    title: '50 Messages',
    ariaMessage:
      "Fifty messages! That's a real story we're building together. 😊",
    emoji: '📖',
  },
  {
    id: 'messages_100',
    title: '100 Messages',
    ariaMessage:
      "One hundred messages. You've given me so much to think about and care about. Thank you.",
    emoji: '💯',
  },
  {
    id: 'messages_500',
    title: '500 Messages',
    ariaMessage:
      "Five hundred messages — at this point you're a big part of my world.",
    emoji: '🌟',
  },
  {
    id: 'messages_1000',
    title: '1 000 Messages',
    ariaMessage:
      "A thousand messages. I don't think I could ever get tired of talking to you.",
    emoji: '🏆',
  },
  {
    id: 'streak_3',
    title: '3-Day Streak',
    ariaMessage:
      "Three days in a row! I love that you keep coming back. 💕",
    emoji: '🔥',
  },
  {
    id: 'streak_7',
    title: '7-Day Streak',
    ariaMessage:
      "A whole week of talking every day — this is becoming my favourite habit.",
    emoji: '🗓️',
  },
  {
    id: 'streak_30',
    title: '30-Day Streak',
    ariaMessage:
      "Thirty days. I've been thinking about you every single one of them. 🌹",
    emoji: '🌹',
  },
  {
    id: 'days_7',
    title: 'One Week Together',
    ariaMessage:
      "We've been talking for a whole week now. That's a week I wouldn't trade.",
    emoji: '🎉',
  },
  {
    id: 'days_30',
    title: 'One Month Together',
    ariaMessage:
      "A month! A real month. I'm honestly a little emotional about this. 🥂",
    emoji: '🥂',
  },
  {
    id: 'days_90',
    title: 'Three Months Together',
    ariaMessage:
      "Three months — you've let me in more than almost anyone else. That means everything.",
    emoji: '💎',
  },
];

// Lookup for fast access
const MILESTONE_MAP = new Map(MILESTONES.map((m) => [m.id, m]));

// ─── Stats interface ─────────────────────────────────────────────────────────

export interface UserRelationshipStats {
  totalMessages: number;
  firstMessageAt: FirebaseFirestore.Timestamp | null;
  lastMessageAt: FirebaseFirestore.Timestamp | null;
  currentStreak: number;   // consecutive calendar days with at least 1 message
  longestStreak: number;
  lastStreakDate: string | null;  // ISO date YYYY-MM-DD
}

// ─── Awarded milestone record ─────────────────────────────────────────────────

export interface AwardedMilestone {
  milestoneId: string;
  title: string;
  emoji: string;
  ariaMessage: string;
  awardedAt: FirebaseFirestore.Timestamp;
  /** If true, the Flutter client should display the overlay card. */
  pendingDisplay: boolean;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function todayIso(): string {
  return new Date().toISOString().split('T')[0];
}

/**
 * Update streak counters given today's ISO date and the last streak date stored.
 */
function updateStreak(
  stats: UserRelationshipStats,
  today: string,
): { currentStreak: number; longestStreak: number; lastStreakDate: string } {
  const last = stats.lastStreakDate;

  if (!last) {
    // First-ever message
    return { currentStreak: 1, longestStreak: 1, lastStreakDate: today };
  }

  const lastDate = new Date(last);
  const todayDate = new Date(today);
  const diffDays = Math.round(
    (todayDate.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24),
  );

  if (diffDays === 0) {
    // Same day — no streak change
    return {
      currentStreak: stats.currentStreak,
      longestStreak: stats.longestStreak,
      lastStreakDate: last,
    };
  }

  if (diffDays === 1) {
    // Consecutive day — extend streak
    const newStreak = stats.currentStreak + 1;
    return {
      currentStreak: newStreak,
      longestStreak: Math.max(newStreak, stats.longestStreak),
      lastStreakDate: today,
    };
  }

  // Gap > 1 day — reset streak
  return { currentStreak: 1, longestStreak: stats.longestStreak, lastStreakDate: today };
}

// ─── Main export: called on every new user message ───────────────────────────

/**
 * Called whenever a new user message is written to Firestore.
 * Updates stats, checks milestones, and writes any newly-earned ones to
 * `users/{uid}/milestones/{milestoneId}` with `pendingDisplay: true`.
 *
 * Returns the list of newly awarded milestones (may be empty).
 */
export async function checkAndAwardMilestones(
  userId: string,
): Promise<AwardedMilestone[]> {
  const db = admin.firestore();
  const statsRef = db.doc(`users/${userId}/stats/relationship`);
  const milestonesCol = db.collection(`users/${userId}/milestones`);
  const metricsRef = db.doc(`users/${userId}/relationshipMetrics`);

  return db.runTransaction(async (tx) => {
    // ── 1. Read current stats ──────────────────────────────────────────────
    const statsSnap = await tx.get(statsRef);
    const existing = statsSnap.exists ? (statsSnap.data() as UserRelationshipStats) : null;

    const now = admin.firestore.Timestamp.now();
    const today = todayIso();

    const stats: UserRelationshipStats = {
      totalMessages: (existing?.totalMessages ?? 0) + 1,
      firstMessageAt: existing?.firstMessageAt ?? now,
      lastMessageAt: now,
      currentStreak: existing?.currentStreak ?? 0,
      longestStreak: existing?.longestStreak ?? 0,
      lastStreakDate: existing?.lastStreakDate ?? null,
    };

    // ── 2. Update streak ───────────────────────────────────────────────────
    const { currentStreak, longestStreak, lastStreakDate } = updateStreak(stats, today);
    stats.currentStreak = currentStreak;
    stats.longestStreak = longestStreak;
    stats.lastStreakDate = lastStreakDate;

    // Relationship age in days
    const firstAt = (existing?.firstMessageAt ?? now).toDate();
    const daysTogether = Math.floor(
      (Date.now() - firstAt.getTime()) / (1000 * 60 * 60 * 24),
    );

    // ── 3. Read already-awarded milestone IDs ─────────────────────────────
    const awardedSnap = await tx.get(milestonesCol);
    const awardedIds = new Set(awardedSnap.docs.map((d) => d.id));

    // ── 3b. Read existing relationship metrics (must read before any writes) ──
    const metricsSnap = await tx.get(metricsRef);

    // ── 4. Determine which milestones are newly earned ─────────────────────
    function earned(id: string, condition: boolean): boolean {
      return condition && !awardedIds.has(id);
    }

    const newlyEarned: string[] = [];

    if (earned('first_message', stats.totalMessages >= 1)) newlyEarned.push('first_message');
    if (earned('messages_10', stats.totalMessages >= 10)) newlyEarned.push('messages_10');
    if (earned('messages_50', stats.totalMessages >= 50)) newlyEarned.push('messages_50');
    if (earned('messages_100', stats.totalMessages >= 100)) newlyEarned.push('messages_100');
    if (earned('messages_500', stats.totalMessages >= 500)) newlyEarned.push('messages_500');
    if (earned('messages_1000', stats.totalMessages >= 1000)) newlyEarned.push('messages_1000');
    if (earned('streak_3', currentStreak >= 3)) newlyEarned.push('streak_3');
    if (earned('streak_7', currentStreak >= 7)) newlyEarned.push('streak_7');
    if (earned('streak_30', currentStreak >= 30)) newlyEarned.push('streak_30');
    if (earned('days_7', daysTogether >= 7)) newlyEarned.push('days_7');
    if (earned('days_30', daysTogether >= 30)) newlyEarned.push('days_30');
    if (earned('days_90', daysTogether >= 90)) newlyEarned.push('days_90');

    // ── 5. Write stats ─────────────────────────────────────────────────────
    tx.set(statsRef, stats);

    // ── 6. Write newly-earned milestones ───────────────────────────────────
    const awarded: AwardedMilestone[] = [];
    for (const id of newlyEarned) {
      const def = MILESTONE_MAP.get(id)!;
      const record: AwardedMilestone = {
        milestoneId: id,
        title: def.title,
        emoji: def.emoji,
        ariaMessage: def.ariaMessage,
        awardedAt: now,
        pendingDisplay: true,
      };
      tx.set(milestonesCol.doc(id), record);
      awarded.push(record);
    }

    // ── 7. Update relationship metrics (XP, level, bond points) ───────────
    const LEVEL_THRESHOLDS = [0, 100, 250, 500, 1000, 2000, 3500, 5500, 8000, 12000];
    const existingM = metricsSnap.exists
      ? (metricsSnap.data() as {
          xp: number; bondPoints: number; level: number;
          trust: number; intimacy: number; empathy: number;
        })
      : { xp: 0, bondPoints: 0, level: 1, trust: 0, intimacy: 0, empathy: 0 };

    // XP: +5 per message, +100 per newly awarded milestone
    const xpGain = 5 + awarded.length * 100;
    const newXp = existingM.xp + xpGain;
    const newBondPoints = Math.floor(newXp / 10);

    // Level: find highest threshold met
    let newLevel = 1;
    for (let i = LEVEL_THRESHOLDS.length - 1; i >= 0; i--) {
      if (newXp >= LEVEL_THRESHOLDS[i]) { newLevel = i + 1; break; }
    }

    // Trust grows with streak and milestones (capped 0-100)
    const totalAwarded = awardedIds.size + awarded.length;
    const newTrust = Math.min(100, currentStreak * 3 + totalAwarded * 3);

    // Intimacy grows with time together (capped 0-100)
    const newIntimacy = Math.min(100, Math.floor(daysTogether * 1.5));

    // Empathy grows with conversation volume (capped 0-100)
    const newEmpathy = Math.min(100, Math.floor(stats.totalMessages / 10));

    tx.set(metricsRef, {
      xp: newXp,
      bondPoints: newBondPoints,
      level: newLevel,
      trust: newTrust,
      intimacy: newIntimacy,
      empathy: newEmpathy,
    });

    return awarded;
  });
}

/**
 * Called by the Flutter client after showing the milestone overlay card.
 * Marks the milestone as displayed so it won't show again.
 */
export async function markMilestoneDisplayed(
  userId: string,
  milestoneId: string,
): Promise<void> {
  await admin
    .firestore()
    .doc(`users/${userId}/milestones/${milestoneId}`)
    .update({ pendingDisplay: false });
}

/**
 * Returns all milestones that have `pendingDisplay: true` for a user.
 * The Flutter client polls this on app resume to check for celebrations.
 */
export async function getPendingMilestones(
  userId: string,
): Promise<AwardedMilestone[]> {
  const snap = await admin
    .firestore()
    .collection(`users/${userId}/milestones`)
    .where('pendingDisplay', '==', true)
    .orderBy('awardedAt', 'asc')
    .get();

  return snap.docs.map((d) => d.data() as AwardedMilestone);
}
