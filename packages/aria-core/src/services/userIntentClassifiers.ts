/**
 * User-intent classifiers — pure-regex detectors for understanding what
 * the user is *asking about*. Extracted from llmService.ts as Phase 2
 * Session-β batch 4.
 *
 * Distinct from sibling modules:
 *   - `routeIntentDetection.ts` — which model tier should serve this turn
 *   - `signalDetectors.ts`      — what conversation signal is present
 *   - THIS module               — what is the user asking ABOUT (capability
 *                                 query / name query / chronology / recent)
 *
 * Per `clean_mobile_architecture.md` Ch.6 SCP: each detector has one
 * concern. Types live with their detectors (Single Concern per file).
 */

// ── CapabilityIntent ────────────────────────────────────────────────────
export interface CapabilityIntent {
  isCapabilityQuery: boolean;
  wantsComparison: boolean;
  wantsDemoPrompts: boolean;
  wantsLimits: boolean;
  focus:
    | 'overview'
    | 'limits'
    | 'location'
    | 'voice'
    | 'camera'
    | 'memory'
    | 'timeline'
    | 'proactive'
    | 'free_mode'
    | 'avatar'
    | 'unknown';
}

export function detectCapabilityIntent(userMessage: string): CapabilityIntent {
  const text = userMessage.trim().toLowerCase();
  if (!text) {
    return {
      isCapabilityQuery: false,
      wantsComparison: false,
      wantsDemoPrompts: false,
      wantsLimits: false,
      focus: 'unknown',
    };
  }

  const directPatterns: RegExp[] = [
    /\bwhat can you do\b/i,
    /\bwhat features\b/i,
    /\bwhich features\b/i,
    /\bfeatures are active\b/i,
    /\bwhat are your features\b/i,
    /\byour features\b/i,
    /\byour capabilities\b/i,
    /\bwhat are your capabilities\b/i,
    /\bself aware\b/i,
    /\bself-aware\b/i,
    /\bknow yourself\b/i,
    /\bwhat makes you different\b/i,
    /\bhow are you different\b/i,
    /\bwhat can aria do\b/i,
  ];

  const capabilityVerbPatterns: RegExp[] = [
    /\bcan you\b.{0,40}\b(remember|voice|speak|talk|see|camera|track|feature|capability|timeline|proactive|free mode|location|weather|city|local time)\b/i,
    /\bdo you have\b.{0,40}\b(voice|camera|memory|timeline|features|capabilities|location|weather|local time)\b/i,
    /\bexplain\b.{0,40}\b(features|capabilities|what you do)\b/i,
    /\blist\b.{0,40}\b(features|capabilities)\b/i,
  ];

  const comparisonPatterns: RegExp[] = [
    /\bbetter than\b/i,
    /\bcompared to\b/i,
    /\bversus\b/i,
    /\bvs\b/i,
    /\bother ai girlfriend\b/i,
    /\bother companions\b/i,
    /\bmost apps\b/i,
  ];

  const demoPatterns: RegExp[] = [
    /\bdemo\b/i,
    /\bshow me\b/i,
    /\btest\b/i,
    /\btry\b/i,
  ];

  const limitPatterns: RegExp[] = [
    /\bwhat can(?:not|'?t) you do(?: yet)?\b/i,
    /\bwhat are your limits\b/i,
    /\bwhat can you not do\b/i,
    /\bwhat do you not do\b/i,
    /\bwhat can't you do\b/i,
    /\bwhat is outside your scope\b/i,
    /\bwhat are you missing\b/i,
    /\bwhat are you not able to do\b/i,
  ];

  const capabilityNouns = /\b(feature|features|capability|capabilities|settings|voice|camera|memory|proactive|free mode|timeline|location|weather|city|local time|time zone|timezone|limits|scope)\b/i;
  const selfReference = /\b(you|your|aria)\b/i;
  const directHit = directPatterns.some((pattern) => pattern.test(text));
  const verbHit = capabilityVerbPatterns.some((pattern) => pattern.test(text));
  const limitHit = limitPatterns.some((pattern) => pattern.test(text));
  const nounHit = capabilityNouns.test(text);
  const selfHit = selfReference.test(text);
  const identityOnly = /\bwho are you\b/i.test(text) && !nounHit && !verbHit;
  const capabilityScore =
    (directHit ? 2 : 0) +
    (verbHit ? 2 : 0) +
    (limitHit ? 2 : 0) +
    (nounHit ? 1 : 0) +
    (selfHit ? 1 : 0);
  const isCapabilityQuery = !identityOnly && capabilityScore >= 2;
  const wantsComparison = comparisonPatterns.some((pattern) => pattern.test(text));
  const wantsDemoPrompts = demoPatterns.some((pattern) => pattern.test(text));
  const wantsLimits = limitHit;
  const focus: CapabilityIntent['focus'] = (() => {
    if (limitHit) {
      return 'limits';
    }
    if (/\b(location|weather|city|local time|time zone|timezone|your world)\b/i.test(text)) {
      return 'location';
    }
    if (/\b(voice|speak|talk|audio|lip[- ]?sync)\b/i.test(text)) {
      return 'voice';
    }
    if (/\b(camera|see|vision|photo|image)\b/i.test(text)) {
      return 'camera';
    }
    if (/\b(memory|remember|recall|open loop|details about me)\b/i.test(text)) {
      return 'memory';
    }
    if (/\b(timeline|date|dates|calendar|chronology|time awareness|upcoming)\b/i.test(text)) {
      return 'timeline';
    }
    if (/\b(proactive|check[- ]?in|reach out|message me first)\b/i.test(text)) {
      return 'proactive';
    }
    if (/\b(free mode|autonomy|autonomous)\b/i.test(text)) {
      return 'free_mode';
    }
    if (/\b(avatar|animation|animated|live2d|face|expression)\b/i.test(text)) {
      return 'avatar';
    }
    return isCapabilityQuery ? 'overview' : 'unknown';
  })();

  return {
    isCapabilityQuery,
    wantsComparison,
    wantsDemoPrompts,
    wantsLimits,
    focus,
  };
}

// ── RecentExchangeIntent ────────────────────────────────────────────────
export interface RecentExchangeIntent {
  isRecentExchangeQuery: boolean;
  focus: 'recent_two' | 'unresolved' | 'natural_callback' | 'unknown';
}

export function detectRecentExchangeIntent(userMessage: string): RecentExchangeIntent {
  const text = userMessage.trim().toLowerCase();
  if (!text) {
    return { isRecentExchangeQuery: false, focus: 'unknown' };
  }

  if (
    /\b(what|which).{0,24}\b(last|recent|fresh|next)\b.{0,24}\b(two|2)\b.{0,40}\b(i told you|i mentioned|i said)\b/i.test(
      text,
    ) ||
    /\bwhat did i (just|recently) (tell|mention|say)\b/i.test(text)
  ) {
    return { isRecentExchangeQuery: true, focus: 'recent_two' };
  }

  if (
    /\b(still unresolved|left unresolved|still open|open thread)\b/i.test(text) ||
    /\bwhat is still unresolved from what i told you earlier\b/i.test(text)
  ) {
    return { isRecentExchangeQuery: true, focus: 'unresolved' };
  }

  if (
    /\b(bring up|mention|circle back|callback|call back|pick up)\b.{0,48}\b(one thing|something)\b.{0,48}\b(before|earlier|i mentioned)\b/i.test(
      text,
    ) ||
    (/\bnaturally\b/i.test(text) && /\b(i mentioned|earlier|before)\b/i.test(text))
  ) {
    return { isRecentExchangeQuery: true, focus: 'natural_callback' };
  }

  return { isRecentExchangeQuery: false, focus: 'unknown' };
}

// ── NameIntent ──────────────────────────────────────────────────────────
export interface NameIntent {
  isNameQuery: boolean;
  target: 'user' | 'assistant' | 'unknown';
}

export function detectNameIntent(userMessage: string): NameIntent {
  const text = userMessage.trim().toLowerCase();
  if (!text) {
    return { isNameQuery: false, target: 'unknown' };
  }

  const userPatterns: RegExp[] = [
    /\bwhat is my name\b/i,
    /\bwhat should you call me\b/i,
    /\bwhat do you call me\b/i,
    /\bwhat are you supposed to call me\b/i,
    /\bwhich name should you use for me\b/i,
  ];
  if (userPatterns.some((pattern) => pattern.test(text))) {
    return { isNameQuery: true, target: 'user' };
  }

  const assistantPatterns: RegExp[] = [
    /\bwhat is your name\b/i,
    /\bwhat should i call you\b/i,
    /\bwhat do i call you\b/i,
    /\bhow should i address you\b/i,
  ];
  if (assistantPatterns.some((pattern) => pattern.test(text))) {
    return { isNameQuery: true, target: 'assistant' };
  }

  return { isNameQuery: false, target: 'unknown' };
}

// ── ChronologyIntent ────────────────────────────────────────────────────
export interface ChronologyIntent {
  isChronologyQuery: boolean;
  focus:
    | 'exact_date'
    | 'upcoming_first'
    | 'past_check'
    | 'upcoming_week'
    | 'calendar_order'
    | 'unknown';
}

export function detectChronologyIntent(userMessage: string): ChronologyIntent {
  const text = userMessage.trim().toLowerCase();
  if (!text) {
    return { isChronologyQuery: false, focus: 'unknown' };
  }

  const exactDatePatterns = [
    /\bwhat date is that exactly\b/i,
    /\bwhat exact day and date\b/i,
    /\bwhat date do you mean\b/i,
    /\bwhat day and date do you mean\b/i,
  ];
  if (exactDatePatterns.some((pattern) => pattern.test(text))) {
    return { isChronologyQuery: true, focus: 'exact_date' };
  }

  if (/\bwhat is coming up first\b/i.test(text) || /\bwhich .* comes first\b/i.test(text)) {
    return { isChronologyQuery: true, focus: 'upcoming_first' };
  }

  if (/\bif today is after one of those dates\b/i.test(text) || /\bhas that passed\b/i.test(text)) {
    return { isChronologyQuery: true, focus: 'past_check' };
  }

  if (/\bsummarize my upcoming week\b/i.test(text)) {
    return { isChronologyQuery: true, focus: 'upcoming_week' };
  }

  if (/\bcalendar order\b/i.test(text)) {
    return { isChronologyQuery: true, focus: 'calendar_order' };
  }

  return { isChronologyQuery: false, focus: 'unknown' };
}
