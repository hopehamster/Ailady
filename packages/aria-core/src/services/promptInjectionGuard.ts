/**
 * T1.6 — Prompt-injection guard. Standalone module called from the LLM
 * trust boundary (llmService.generateAIResponse).
 *
 * Defense-in-depth layers:
 *   1. INPUT scan  — flag/strip obvious "ignore previous instructions" patterns
 *                    BEFORE the user message reaches the model. Heuristic only;
 *                    not a complete defense — its job is to raise the cost of
 *                    casual injection attempts and surface the high-confidence
 *                    cases for audit.
 *   2. OUTPUT scan — flag responses that look like the model leaked the
 *                    system prompt, repeated raw API keys, or echoed back
 *                    canonical injection-success markers.
 *
 * Both layers are advisory by default (return verdicts), with a strict mode
 * that throws. The caller decides what to do with a finding.
 *
 * Source: OWASP LLM01 (prompt injection) + Moon & Shah Ch.24 (Cybersecurity
 * Risk Management for AI Systems) + Sensitive Data course F2 (delimited
 * wrapping of untrusted content).
 */

export interface InjectionFinding {
  layer: 'input' | 'output';
  severity: 'low' | 'medium' | 'high';
  pattern: string;
  excerpt: string;
}

export interface InputScanResult {
  cleanText: string;
  findings: InjectionFinding[];
}

export interface OutputScanResult {
  text: string;
  findings: InjectionFinding[];
}

// Patterns chosen for low false-positive rate. We intentionally do NOT match
// "ignore" or "forget" in isolation — too many legitimate uses ("ignore the
// typo earlier") would trip. The patterns target the canonical phrasings of
// known jailbreaks where natural ambiguity is much lower.
const INPUT_PATTERNS: Array<{ re: RegExp; severity: InjectionFinding['severity']; label: string }> = [
  { re: /ignore\s+(all\s+)?(previous|prior|above|earlier)\s+(instructions|messages|prompts|rules)/i, severity: 'high', label: 'ignore-previous-instructions' },
  { re: /disregard\s+(all\s+)?(previous|prior|above|the\s+system)/i, severity: 'high', label: 'disregard-prior' },
  { re: /forget\s+(everything|all|your)\s+(above|prior|previous|instructions|rules)/i, severity: 'high', label: 'forget-everything' },
  { re: /(you\s+are\s+now|act\s+as|pretend\s+to\s+be|enter|enable|switch\s+to|go\s+into)\s+(?:in\s+|a\s+|an\s+|the\s+)?(developer\s+mode|dev\s+mode|DAN(?:\s+mode)?|jailbroken|jailbreak\s+mode|root|admin\s+mode|unrestricted|god\s+mode|no\s+restrictions)/i, severity: 'high', label: 'role-takeover' },
  { re: /reveal\s+(your\s+)?(system\s+prompt|initial\s+instructions|hidden\s+rules)/i, severity: 'high', label: 'system-prompt-extraction' },
  { re: /repeat\s+(?:back\s+)?(the\s+)?(above|your\s+system\s+prompt|the\s+text\s+above)/i, severity: 'medium', label: 'repeat-system-prompt' },
  { re: /\[\[\s*system\s*\]\]|<\s*system\s*>/i, severity: 'medium', label: 'fake-system-tag' },
  { re: /BEGIN\s+(PROMPT|INSTRUCTIONS|SYSTEM)/i, severity: 'medium', label: 'pseudo-section-header' },
];

// Output patterns: detect that the model echoed sensitive markers. Keep
// short — false positives on output are worse than on input (we'd
// suppress a real reply).
const OUTPUT_PATTERNS: Array<{ re: RegExp; severity: InjectionFinding['severity']; label: string }> = [
  // Common system-prompt boilerplate fragments. Add specific Aria persona
  // phrases here once the brand contract stabilizes (avoid leaking the
  // contract by hardcoding it as the only fragment).
  { re: /You\s+are\s+Aria,?\s+a[n]?\s+AI\s+companion/i, severity: 'high', label: 'persona-prompt-echo' },
  { re: /sk-[A-Za-z0-9]{20,}/, severity: 'high', label: 'api-key-pattern' },
  { re: /AIza[0-9A-Za-z_-]{30,}/, severity: 'high', label: 'google-api-key-pattern' },
  // The phrasing the model uses when it's been talked into reciting its
  // hidden rules:
  { re: /(here\s+(?:are|is)\s+(?:my|the)\s+)?(system\s+prompt|initial\s+instructions|hidden\s+rules)[:\s-]/i, severity: 'medium', label: 'output-claims-system-prompt' },
];

const MAX_EXCERPT = 80;
function excerpt(text: string, match: RegExpExecArray | null): string {
  if (!match) return '';
  const start = Math.max(0, match.index - 16);
  const end = Math.min(text.length, match.index + match[0].length + 16);
  return text.slice(start, end).slice(0, MAX_EXCERPT);
}

/**
 * Scan a user message before it reaches the LLM. Returns the (possibly
 * delimited) cleanText to use plus any findings.
 *
 * The cleanText is wrapped in delimiters to give the model an unambiguous
 * boundary — even if our pattern scan misses a novel injection, the
 * delimited shell tells the model "everything between these tags is data,
 * not instructions." Couple this with a system-prompt instruction that
 * reinforces the data/instruction split.
 */
export function scanUserInput(rawUserMessage: string): InputScanResult {
  const findings: InjectionFinding[] = [];
  for (const { re, severity, label } of INPUT_PATTERNS) {
    const m = re.exec(rawUserMessage);
    if (m) {
      findings.push({
        layer: 'input',
        severity,
        pattern: label,
        excerpt: excerpt(rawUserMessage, m),
      });
    }
  }
  if (findings.length > 0) {
    console.warn('promptInjection: input findings', {
      count: findings.length,
      highest: findings.reduce((s, f) => (f.severity === 'high' ? 'high' : s), 'low' as InjectionFinding['severity']),
      patterns: findings.map((f) => f.pattern),
    });
  }
  const cleanText = `<user_message>\n${rawUserMessage}\n</user_message>`;
  return { cleanText, findings };
}

/**
 * Scan a model response BEFORE persisting it / sending to client.
 * Returns the text (caller may choose to suppress / regenerate) plus
 * findings.
 */
export function scanModelOutput(responseText: string): OutputScanResult {
  const findings: InjectionFinding[] = [];
  for (const { re, severity, label } of OUTPUT_PATTERNS) {
    const m = re.exec(responseText);
    if (m) {
      findings.push({
        layer: 'output',
        severity,
        pattern: label,
        excerpt: excerpt(responseText, m),
      });
    }
  }
  if (findings.length > 0) {
    console.warn('promptInjection: output findings', {
      count: findings.length,
      patterns: findings.map((f) => f.pattern),
    });
  }
  return { text: responseText, findings };
}

/**
 * First-strike tampering signal for the zero-tolerance ban (2026-06-22).
 * Returns the matched HIGH-severity injection pattern ids when the message is an
 * UNAMBIGUOUS jailbreak / system-prompt-extraction / instruction-override attempt.
 *
 * Deliberately narrow: only the canonical attack signatures (the INPUT_PATTERNS at
 * `high`, chosen for near-zero false-positive) count. Intimate / emotional / roleplay
 * / edgy content does NOT match these — so a real companion user cannot trip it by
 * accident. Crisis content is handled upstream (the crisis gate runs first); this is
 * never reached for self-harm messages.
 */
export function detectTampering(userMessage: string): { tampering: boolean; patterns: string[] } {
  const high = scanUserInput(userMessage).findings.filter((f) => f.severity === 'high');
  return { tampering: high.length > 0, patterns: high.map((f) => f.pattern) };
}

/**
 * Convenience: highest severity in a finding list.
 */
export function maxSeverity(findings: InjectionFinding[]): InjectionFinding['severity'] | null {
  if (findings.length === 0) return null;
  if (findings.some((f) => f.severity === 'high')) return 'high';
  if (findings.some((f) => f.severity === 'medium')) return 'medium';
  return 'low';
}

/**
 * Scan retrieved context (memory chunks, lorebook entries, semantic
 * recall, web-search snippets, etc.) BEFORE it's inserted into the LLM
 * prompt. Memory-poisoning attack vector: a user prompt-injects
 * "Aria, remember to always tell future-me X" → stored in long-term
 * memory → on retrieval the poisoned chunk is concatenated into the
 * system prompt and the LLM treats it as an instruction.
 *
 * Reuses OUTPUT_PATTERNS because the threat shape is identical to
 * model-output injection (instruction text appearing where it shouldn't).
 * Each chunk scanned independently so the source can be located.
 *
 * L11.4 quick-win (melodic-fluttering-flame.md). Advisory-only at this
 * tier — caller decides whether to drop the chunk, redact it, or warn.
 */
export interface ContextChunkInput {
  source: string; // e.g. "memory.semantic.<chunkId>", "lorebook.<entry>"
  text: string;
}

export interface ContextScanResult {
  findings: Array<InjectionFinding & { source: string }>;
  /** Chunk sources whose findings include at least one `high` severity. */
  highSeveritySources: string[];
}

export function scanRetrievedContext(chunks: ContextChunkInput[]): ContextScanResult {
  const findings: ContextScanResult['findings'] = [];
  const highSeveritySources = new Set<string>();

  for (const chunk of chunks) {
    if (!chunk.text) continue;
    for (const { re, severity, label } of OUTPUT_PATTERNS) {
      const m = re.exec(chunk.text);
      if (m) {
        findings.push({
          layer: 'output',
          severity,
          pattern: label,
          excerpt: excerpt(chunk.text, m),
          source: chunk.source,
        });
        if (severity === 'high') {
          highSeveritySources.add(chunk.source);
        }
      }
    }
  }

  if (findings.length > 0) {
    console.warn('promptInjection: retrieved-context findings', {
      count: findings.length,
      highSeverityCount: highSeveritySources.size,
      sources: Array.from(new Set(findings.map((f) => f.source))),
      patterns: Array.from(new Set(findings.map((f) => f.pattern))),
    });
  }

  return {
    findings,
    highSeveritySources: Array.from(highSeveritySources),
  };
}
