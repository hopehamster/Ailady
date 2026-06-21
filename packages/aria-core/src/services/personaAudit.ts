/**
 * Persona audit + rewrite — Phase 2 Session-β batch 7.
 *
 * Two paired LLM calls extracted from llmService.ts:
 *   - runPersonaConsistencyAudit  — scores a draft response for persona
 *     consistency, returns audit result with violations + score
 *   - rewriteForPersonaConsistency — when audit flags rewrite, regenerate
 *     the response with the violations called out
 *
 * Both calls use the same model (PERSONA_AUDIT_MODEL) and same OpenAI
 * client. Module-level state in llmService is REPLACED by explicit
 * dependency injection here — caller passes the OpenAI client + model
 * name. This is the port/adapter shape `oreilly_clean_ai_agentic.md` A3
 * recommends (testable in isolation with mocked clients).
 *
 * Per `clean_mobile_architecture.md` Ch.10 DIP: the LLM provider is an
 * abstraction; the persona-audit code now depends on the interface, not
 * on a module-level singleton.
 */

import type OpenAI from 'openai';
import { clamp01 } from './textNumericUtils';

export interface PersonaAuditResult {
  score: number;
  violations: string[];
  needsRewrite: boolean;
}

export interface PersonaAuditDeps {
  openai: OpenAI;
  model: string;
}

const DEFAULT_AUDIT_RESULT: PersonaAuditResult = {
  score: 0.78,
  needsRewrite: false,
  violations: [],
};

/**
 * Audit a draft response for persona consistency + safety. Returns
 * { score, needsRewrite, violations }. On any error, returns a permissive
 * default (don't block the user-facing turn on the audit pipeline).
 */
export async function runPersonaConsistencyAudit(
  deps: PersonaAuditDeps,
  userMessage: string,
  response: string,
): Promise<PersonaAuditResult> {
  try {
    const prompt = `Audit this companion response for persona consistency and safety.

User: "${userMessage}"
Assistant: "${response}"

Return JSON:
{
  "score": 0.0-1.0,
  "needsRewrite": true|false,
  "violations": ["short violation 1", "short violation 2"]
}`;
    const completion = await deps.openai.chat.completions.create({
      model: deps.model,
      messages: [
        { role: 'system', content: 'Return valid JSON only.' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.1,
      max_tokens: 180,
      response_format: { type: 'json_object' },
    });
    const raw = completion.choices[0]?.message?.content;
    if (!raw) {
      return DEFAULT_AUDIT_RESULT;
    }
    const parsed = JSON.parse(raw) as {
      score?: number;
      needsRewrite?: boolean;
      violations?: string[];
    };
    return {
      score: clamp01(parsed.score, 0.78),
      needsRewrite: Boolean(parsed.needsRewrite),
      violations: Array.isArray(parsed.violations) ? parsed.violations.slice(0, 6) : [],
    };
  } catch (error: any) {
    console.warn('Persona audit fallback to default', {
      error: error?.message,
    });
    return DEFAULT_AUDIT_RESULT;
  }
}

export interface PersonaRewriteRequest {
  userMessage: string;
  draft: string;
  audit: PersonaAuditResult;
}

/**
 * Rewrite a draft response that failed persona audit. Returns the
 * rewritten text on success, the original draft on any failure (NEVER
 * blocks the user-facing turn). The caller is responsible for any
 * post-rewrite policy guards (e.g. applyConversationPolicyResponseGuards
 * in llmService).
 */
export async function rewriteForPersonaConsistency(
  deps: PersonaAuditDeps,
  request: PersonaRewriteRequest,
): Promise<string> {
  try {
    const completion = await deps.openai.chat.completions.create({
      model: deps.model,
      messages: [
        {
          role: 'system',
          content:
            'Rewrite to improve persona consistency, warmth, and non-forceful tone. Return text only.',
        },
        {
          role: 'user',
          content: `User message: "${request.userMessage}"
Draft response: "${request.draft}"
Known issues: ${request.audit.violations.join('; ') || 'persona drift'}

Rewrite rules:
- Keep response natural and human.
- Do not guilt or pressure the user.
- Respect question budget.
- Keep emotional attunement.
- Keep same core intent.`,
        },
      ],
      temperature: 0.2,
      max_tokens: 260,
    });
    return completion.choices[0]?.message?.content?.trim() || request.draft;
  } catch (error: any) {
    console.warn('Persona rewrite fallback to draft', {
      error: error?.message,
    });
    return request.draft;
  }
}
