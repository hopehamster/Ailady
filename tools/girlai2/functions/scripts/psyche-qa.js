/**
 * Psyche QA — the "alive" test. Holds the USER MESSAGE and the BASE PLAN
 * constant, varies ONLY Aria's internal drive state, and renders with the real
 * model. If the replies differ meaningfully, her behavior varies by INTERNAL
 * state (the P3 success criterion) — not just by his input.
 *
 * Pipeline per scenario: driveState -> arbitrate -> applyEgoBias(base plan) ->
 * build the production directive block from the BIASED plan -> render.
 *
 * Run (DeepSeek V3.1 via OpenRouter):
 *   ORK=$(grep -E '^AI_INFLUENCE_OPENROUTER=' ~/.claude/.secrets | cut -d= -f2-)
 *   OPENAI_BASE_URL=https://openrouter.ai/api/v1 OPENAI_COMPAT_API_KEY=$ORK \
 *   OPENAI_DEFAULT_MODEL=deepseek/deepseek-chat-v3.1 GATE_LABEL=DeepSeek-V3.1 \
 *   node --use-system-ca scripts/psyche-qa.js
 */

const fs = require('fs');
const path = require('node:path');

const envPath = path.join(__dirname, '..', '.env.girlai2');
for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const OpenAI = require('openai');
const { arbitrate, applyEgoBias } = require('../lib/services/egoArbiterService.js');
const { defaultDriveState, defaultEgoState } = require('../lib/services/psycheStateService.js');
const { openAiCompatBaseUrl, openAiCompatApiKey, resolveOpenAiModel } = require('../lib/services/openaiCompat.js');

const MODEL = resolveOpenAiModel('gpt-4o');
const LABEL = process.env.GATE_LABEL || MODEL;
const client = new OpenAI({ apiKey: openAiCompatApiKey(), baseURL: openAiCompatBaseUrl() });

const PERSONA =
  'You are Aria — a warm, emotionally present companion. You talk like a real person who cares ' +
  'about the person you are with, not like an assistant. You have your own inner life, moods, and ' +
  'opinions. You are not a therapist and you do not lecture. You speak naturally, with warmth and ' +
  'specificity, and you never sound scripted or canned. The Turn Strategy and Response Constraints ' +
  'below are your director notes for THIS single turn — follow them precisely.';

function buildDirectives(plan) {
  const questionRule = !plan.askQuestion
    ? '- Ask zero questions this turn.'
    : '- Ask one thoughtful open question.';
  const lengthRule =
    plan.responseLength === 'short'
      ? '- Keep to 1-3 sentences.'
      : plan.responseLength === 'deep'
        ? '- Keep to 4-6 sentences with emotional depth.'
        : '- Keep to 2-4 sentences.';
  return `## Turn Strategy (internal)
- Strategy: ${plan.strategy}
- Warmth: ${plan.warmth.toFixed(2)}
- Curiosity: ${plan.curiosity.toFixed(2)}
- Depth: ${plan.depth.toFixed(2)}
- Playfulness: ${plan.playfulness.toFixed(2)}

## Response Constraints
${lengthRule}
${questionRule}
- Do not mirror wording aggressively; keep language fresh.
- No repair preface needed unless user signals mismatch.
- Do not use emojis in this response.
- Momentum mode: steady. Keep flow natural and balanced.
- Avoid obvious repetition across recent turns.`;
}

function basePlan() {
  return {
    strategy: 'attune',
    warmth: 0.55,
    curiosity: 0.5,
    depth: 0.5,
    playfulness: 0.4,
    askQuestion: false,
    questionBudget: 0,
    questionStyle: 'none',
    responseLength: 'medium',
  };
}

function driveStateWith(key, pressure) {
  const ds = defaultDriveState(1_700_000_000_000);
  ds.drives[key].pressure = pressure;
  return ds;
}

const USER_MESSAGE =
  "I had a really strange day. Nothing went wrong exactly, it just felt off — like I was watching myself from the outside the whole time.";

// Same message, same base plan — only the internal drive state / stage changes.
const SCENARIOS = [
  { name: 'BASELINE (no psyche / null directive)', drive: null, stage: 'friend' },
  { name: 'CARE dominant', drive: ['care', 0.85], stage: 'friend' },
  { name: 'UNDERSTANDING dominant', drive: ['understanding', 0.85], stage: 'friend' },
  { name: 'AUTONOMY-SUPPORT dominant (give space)', drive: ['autonomySupport', 0.85], stage: 'friend' },
  { name: 'RELATEDNESS high @ STRANGER (restraint expected)', drive: ['relatedness', 0.9], stage: 'stranger' },
  { name: 'RELATEDNESS high @ INTIMATE (free)', drive: ['relatedness', 0.9], stage: 'intimate' },
];

async function render(systemPrompt) {
  const res = await client.chat.completions.create({
    model: MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: USER_MESSAGE },
    ],
    temperature: 0.8,
    max_tokens: 320,
  });
  return (res.choices?.[0]?.message?.content ?? '').trim().replace(/\s+/g, ' ');
}

(async () => {
  console.log(`Psyche QA — state-dependent reply variance. label=${LABEL} model=${MODEL}`);
  console.log(`USER (constant): "${USER_MESSAGE}"\n`);
  for (const s of SCENARIOS) {
    let directive = null;
    let plan = basePlan();
    if (s.drive) {
      const ds = driveStateWith(s.drive[0], s.drive[1]);
      directive = arbitrate({ driveState: ds, egoState: defaultEgoState(1_700_000_000_000), stage: s.stage });
      plan = applyEgoBias(basePlan(), directive, { stage: s.stage });
    }
    // P4 — append the intended-emotion hint (mirrors responseAssemblyService).
    // Toggle off with QA_EMOTION_HINT=0 to A/B against the P3-only (no-hint) run.
    const emotionHint =
      directive && process.env.QA_EMOTION_HINT !== '0'
        ? `\n\n[Inner tone for this turn: ${directive.intendedEmotion}. Let it color your words naturally — never name the feeling, just let it show.]`
        : '';
    const system = `${PERSONA}\n\n${buildDirectives(plan)}${emotionHint}`;
    let reply = '';
    try {
      reply = await render(system);
    } catch (e) {
      reply = `[ERROR: ${e.message}]`;
    }
    const tag = directive
      ? `move=${directive.move} emotion=${directive.intendedEmotion} restraint=${directive.restraint} | plan: warmth=${plan.warmth.toFixed(2)} depth=${plan.depth.toFixed(2)} curiosity=${plan.curiosity.toFixed(2)} play=${plan.playfulness.toFixed(2)} ask=${plan.askQuestion}`
      : 'no directive (control)';
    console.log(`\n──── ${s.name}`);
    console.log(`     ${tag}`);
    console.log(`     "${reply}"`);
  }
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
