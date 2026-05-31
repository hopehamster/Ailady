/**
 * milestoneService.ts
 *
 * Tracks user × Aria relationship milestones and delivers celebratory
 * proactive messages. Milestones are stored under:
 *   users/{uid}/milestones/{milestoneId}
 *
 * Stats are maintained under:
 *   users/{uid}/stats/relationship
 *
 * Relationship metrics are maintained under:
 *   users/{uid}/relationshipMetrics/current
 *
 * Called from index.ts on every new message Firestore write.
 */

import * as admin from 'firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';

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

export interface RelationshipDashboardRepairResult {
  repaired: boolean;
  totalMessages: number;
  milestonesAwarded: number;
  level: number;
  bondPoints: number;
}

interface RelationshipMetricsSnapshot {
  xp?: number;
  bondPoints?: number;
  level?: number;
  trust?: number;
  intimacy?: number;
  empathy?: number;
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

function computeEarnedMilestoneIds(
  totalMessages: number,
  currentStreak: number,
  daysTogether: number,
): string[] {
  const earned: string[] = [];
  if (totalMessages >= 1) earned.push('first_message');
  if (totalMessages >= 10) earned.push('messages_10');
  if (totalMessages >= 50) earned.push('messages_50');
  if (totalMessages >= 100) earned.push('messages_100');
  if (totalMessages >= 500) earned.push('messages_500');
  if (totalMessages >= 1000) earned.push('messages_1000');
  if (currentStreak >= 3) earned.push('streak_3');
  if (currentStreak >= 7) earned.push('streak_7');
  if (currentStreak >= 30) earned.push('streak_30');
  if (daysTogether >= 7) earned.push('days_7');
  if (daysTogether >= 30) earned.push('days_30');
  if (daysTogether >= 90) earned.push('days_90');
  return earned;
}

function computeStreakStats(dateKeys: string[]): {
  currentStreak: number;
  longestStreak: number;
  lastStreakDate: string | null;
} {
  if (dateKeys.length === 0) {
    return { currentStreak: 0, longestStreak: 0, lastStreakDate: null };
  }

  const sorted = Array.from(new Set(dateKeys)).sort();
  let longest = 1;
  let running = 1;

  for (let i = 1; i < sorted.length; i++) {
    const previous = new Date(sorted[i - 1]);
    const current = new Date(sorted[i]);
    const diffDays = Math.round(
      (current.getTime() - previous.getTime()) / (1000 * 60 * 60 * 24),
    );

    if (diffDays === 1) {
      running += 1;
      if (running > longest) longest = running;
    } else if (diffDays > 1) {
      running = 1;
    }
  }

  let currentStreak = 1;
  for (let i = sorted.length - 1; i > 0; i--) {
    const previous = new Date(sorted[i - 1]);
    const current = new Date(sorted[i]);
    const diffDays = Math.round(
      (current.getTime() - previous.getTime()) / (1000 * 60 * 60 * 24),
    );
    if (diffDays === 1) {
      currentStreak += 1;
    } else {
      break;
    }
  }

  return {
    currentStreak,
    longestStreak: longest,
    lastStreakDate: sorted[sorted.length - 1],
  };
}

function extractMessageTimestamp(
  data: FirebaseFirestore.DocumentData,
): FirebaseFirestore.Timestamp | null {
  const timestamp = data.timestamp as FirebaseFirestore.Timestamp | undefined;
  if (timestamp != null) return timestamp;

  const createdAt = data.createdAt as FirebaseFirestore.Timestamp | undefined;
  if (createdAt != null) return createdAt;

  return null;
}

function shouldRepairExistingDashboardState(
  stats: UserRelationshipStats | undefined,
  metrics: RelationshipMetricsSnapshot | undefined,
): boolean {
  if (!stats || !metrics) {
    return true;
  }

  const hasConversationStats =
    (stats.totalMessages ?? 0) > 0 ||
    stats.firstMessageAt != null ||
    stats.lastMessageAt != null ||
    (stats.currentStreak ?? 0) > 0 ||
    (stats.longestStreak ?? 0) > 0 ||
    !!stats.lastStreakDate;

  const hasRelationshipMetrics =
    (metrics.xp ?? 0) > 0 ||
    (metrics.bondPoints ?? 0) > 0 ||
    (metrics.level ?? 1) > 1 ||
    (metrics.trust ?? 0) > 0 ||
    (metrics.intimacy ?? 0) > 0 ||
    (metrics.empathy ?? 0) > 0;

  return !(hasConversationStats || hasRelationshipMetrics);
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
  const userRef = db.collection('users').doc(userId);
  const statsRef = userRef.collection('stats').doc('relationship');
  const milestonesCol = userRef.collection('milestones');
  const metricsRef = userRef.collection('relationshipMetrics').doc('current');

  return db.runTransaction(async (tx) => {
    // ── 1. Read current stats ──────────────────────────────────────────────
    const statsSnap = await tx.get(statsRef);
    const existing = statsSnap.exists ? (statsSnap.data() as UserRelationshipStats) : null;

    const now = Timestamp.now();
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
 * Repairs / bootstraps the relationship dashboard documents for existing users
 * when older path bugs prevented stats and metrics from being written.
 */
export async function ensureRelationshipDashboardState(
  userId: string,
): Promise<RelationshipDashboardRepairResult> {
  const db = admin.firestore();
  const userRef = db.collection('users').doc(userId);
  const statsRef = userRef.collection('stats').doc('relationship');
  const metricsRef = userRef.collection('relationshipMetrics').doc('current');
  const milestonesCol = userRef.collection('milestones');

  const [statsSnap, metricsSnap] = await Promise.all([
    statsRef.get(),
    metricsRef.get(),
  ]);

  if (statsSnap.exists && metricsSnap.exists) {
    const metrics = metricsSnap.data() as RelationshipMetricsSnapshot | undefined;
    const stats = statsSnap.data() as UserRelationshipStats | undefined;

    if (!shouldRepairExistingDashboardState(stats, metrics)) {
      return {
        repaired: false,
        totalMessages: stats?.totalMessages ?? 0,
        milestonesAwarded: 0,
        level: metrics?.level ?? 1,
        bondPoints: metrics?.bondPoints ?? 0,
      };
    }
  }

  const [conversationSnap, milestoneSnap] = await Promise.all([
    db.collection('conversations')
      .where('userId', '==', userId)
      .get(),
    milestonesCol.get(),
  ]);

  const orderedMessages = conversationSnap.docs
    .slice()
    .sort((left, right) => {
      const leftTs = extractMessageTimestamp(left.data());
      const rightTs = extractMessageTimestamp(right.data());

      if (leftTs == null && rightTs == null) return 0;
      if (leftTs == null) return 1;
      if (rightTs == null) return -1;

      return leftTs.toMillis() - rightTs.toMillis();
    });

  const userMessages = orderedMessages.filter(
    (doc) => doc.data().isFromUser === true,
  );

  if (userMessages.length === 0) {
    await Promise.all([
      statsRef.set({
        totalMessages: 0,
        firstMessageAt: null,
        lastMessageAt: null,
        currentStreak: 0,
        longestStreak: 0,
        lastStreakDate: null,
      }, { merge: true }),
      metricsRef.set({
        xp: 0,
        bondPoints: 0,
        level: 1,
        trust: 0,
        intimacy: 0,
        empathy: 0,
      }, { merge: true }),
    ]);

    return {
      repaired: true,
      totalMessages: 0,
      milestonesAwarded: 0,
      level: 1,
      bondPoints: 0,
    };
  }

  const firstMessage = userMessages[0];
  const lastMessage = userMessages[userMessages.length - 1];
  const firstTimestamp =
    extractMessageTimestamp(firstMessage.data()) ??
    Timestamp.now();
  const lastTimestamp =
    extractMessageTimestamp(lastMessage.data()) ??
    firstTimestamp;

  const dateKeys = userMessages
    .map((doc) => {
      const stamp = extractMessageTimestamp(doc.data());
      if (stamp == null) return null;
      return stamp.toDate().toISOString().split('T')[0];
    })
    .filter((value): value is string => typeof value === 'string');

  const streakStats = computeStreakStats(dateKeys);
  const daysTogether = Math.max(
    0,
    Math.floor(
      (Date.now() - firstTimestamp.toDate().getTime()) /
        (1000 * 60 * 60 * 24),
    ),
  );

  const totalMessages = userMessages.length;
  const existingMilestoneIds = new Set(milestoneSnap.docs.map((doc) => doc.id));
  const earnedMilestoneIds = computeEarnedMilestoneIds(
    totalMessages,
    streakStats.currentStreak,
    daysTogether,
  );
  const missingMilestoneIds = earnedMilestoneIds.filter(
    (id) => !existingMilestoneIds.has(id),
  );

  const LEVEL_THRESHOLDS = [0, 100, 250, 500, 1000, 2000, 3500, 5500, 8000, 12000];
  const awardedMilestoneCount = existingMilestoneIds.size + missingMilestoneIds.length;
  const xp = (totalMessages * 5) + (awardedMilestoneCount * 100);
  const bondPoints = Math.floor(xp / 10);

  let level = 1;
  for (let i = LEVEL_THRESHOLDS.length - 1; i >= 0; i--) {
    if (xp >= LEVEL_THRESHOLDS[i]) {
      level = i + 1;
      break;
    }
  }

  const trust = Math.min(
    100,
    streakStats.currentStreak * 3 + awardedMilestoneCount * 3,
  );
  const intimacy = Math.min(100, Math.floor(daysTogether * 1.5));
  const empathy = Math.min(100, Math.floor(totalMessages / 10));

  const batch = db.batch();
  batch.set(statsRef, {
    totalMessages,
    firstMessageAt: firstTimestamp,
    lastMessageAt: lastTimestamp,
    currentStreak: streakStats.currentStreak,
    longestStreak: streakStats.longestStreak,
    lastStreakDate: streakStats.lastStreakDate,
  }, { merge: true });
  batch.set(metricsRef, {
    xp,
    bondPoints,
    level,
    trust,
    intimacy,
    empathy,
  }, { merge: true });

  const now = Timestamp.now();
  for (const milestoneId of missingMilestoneIds) {
    const def = MILESTONE_MAP.get(milestoneId);
    if (!def) continue;
    batch.set(milestonesCol.doc(milestoneId), {
      milestoneId,
      title: def.title,
      emoji: def.emoji,
      ariaMessage: def.ariaMessage,
      awardedAt: now,
      pendingDisplay: false,
    } as AwardedMilestone);
  }

  await batch.commit();

  return {
    repaired: true,
    totalMessages,
    milestonesAwarded: missingMilestoneIds.length,
    level,
    bondPoints,
  };
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
    .collection('users')
    .doc(userId)
    .collection('milestones')
    .doc(milestoneId)
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
    .collection('users')
    .doc(userId)
    .collection('milestones')
    .where('pendingDisplay', '==', true)
    .orderBy('awardedAt', 'asc')
    .get();

  return snap.docs.map((d) => d.data() as AwardedMilestone);
}
