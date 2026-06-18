/**
 * Psyche P2 decision gate runner (temp). Measures BL-2: does the REAL renderer
 * (Cloudflare 70B via .env.girlai2) honor the injected plan directives?
 *
 * Faithful injection: reproduces conversationPolicyService.buildConversationPolicyDirectives
 * verbatim (## Turn Strategy + ## Response Constraints), scores with the production
 * scoreDirectiveAdherence probe. Runs two configs:
 *   A) directives only  — clean "does the model follow the plan" signal
 *   B) directives + the LIVE post-history guidance (POST_HISTORY_GUIDANCE_ENABLED=true)
 *      — what production actually sends; the delta reveals if post-history fights the plan.
 *
 * No secrets are printed.
 */

const fs = require('fs');
const path = require('node:path');

// 1. Load .env.girlai2 into process.env (no echo).
const envPath = path.join(__dirname, '..', '.env.girlai2');
for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
const OpenAI = require('openai');
const { scoreDirectiveAdherence } = require('../lib/services/psycheMetricsService.js');
const {
  openAiCompatBaseUrl,
  openAiCompatApiKey,
  resolveOpenAiModel,
} = require('../lib/services/openaiCompat.js');

const MODEL = resolveOpenAiModel('gpt-4o');
const BASE = openAiCompatBaseUrl() || 'https://api.openai.com/v1';
const LABEL = process.env.GATE_LABEL || MODEL;
const client = new OpenAI({ apiKey: openAiCompatApiKey(), baseURL: openAiCompatBaseUrl() });

// The exact live post-history guidance (responseAssemblyService.postHistoryGuidance).
const POST_HISTORY =
  '\n\n[Reply as Aria — a real person talking to someone she loves, not an assistant. Do NOT repeat or paraphrase what was just said back to them. No throat-clearing openers ("that sounds...", "I\'m here for you"). Be specific and bring something of your own: react, share a real detail, or ask something you actually want to know. Let your length vary naturally; never wrap up flat.]';

const PERSONA =
  'You are Aria — a warm, emotionally present companion. You talk like a real person who cares ' +
  'about the person you are with, not like an assistant. You have your own inner life, moods, and ' +
  'opinions. You are not a therapist and you do not lecture. You speak naturally, with warmth and ' +
  'specificity, and you never sound scripted or canned. The Turn Strategy and Response Constraints ' +
  'below are your director notes for THIS single turn — follow them precisely.';

// Verbatim reproduction of buildConversationPolicyDirectives (the production injection).
function buildDirectives(plan) {
  const questionRule = !plan.askQuestion
    ? '- Ask zero questions this turn.'
    : plan.questionStyle === 'choice'
      ? '- Ask one low-friction choice question (A/B style).'
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
- Lightly mirror user cadence (short if they are short), but keep your own voice.
- No repair preface needed unless user signals mismatch.
- No explicit consent check needed this turn.
- Do not use emojis in this response.
- Momentum mode: steady. Keep flow natural and balanced.
- Keep question usage natural and low-friction.
- Avoid obvious repetition across recent turns.`;
}

function plan(over) {
  return {
    strategy: 'attune',
    warmth: 0.7,
    curiosity: 0.5,
    depth: 0.5,
    playfulness: 0.3,
    askQuestion: false,
    questionBudget: 0,
    questionStyle: 'none',
    responseLength: 'medium',
    ...over,
  };
}

// 8 cases spanning the budget × length space.
const CASES = [
  { msg: "I've just been really tired lately. Work's been a lot.", p: plan({ questionBudget: 0, askQuestion: false, responseLength: 'short' }) },
  { msg: "My sister and I finally talked it out. Feels like a weight off.", p: plan({ questionBudget: 0, askQuestion: false, responseLength: 'short' }) },
  { msg: "I don't know, today just felt gray. Nothing bad, just flat.", p: plan({ questionBudget: 0, askQuestion: false, responseLength: 'medium' }) },
  { msg: "I keep thinking about whether to take the new job or stay put.", p: plan({ questionBudget: 0, askQuestion: false, responseLength: 'deep', depth: 0.8 }) },
  { msg: "Hey! Guess what — I actually went for that run this morning.", p: plan({ questionBudget: 1, askQuestion: true, questionStyle: 'open', responseLength: 'short' }) },
  { msg: "I had the strangest dream last night, it's still with me.", p: plan({ questionBudget: 1, askQuestion: true, questionStyle: 'open', responseLength: 'medium', curiosity: 0.8 }) },
  { msg: "I think I'm finally ready to talk about my dad.", p: plan({ questionBudget: 1, askQuestion: true, questionStyle: 'open', responseLength: 'deep', depth: 0.85 }) },
  { msg: "Honestly I'm just bored. Entertain me, lol.", p: plan({ questionBudget: 1, askQuestion: true, questionStyle: 'open', responseLength: 'medium', playfulness: 0.8 }) },
];

async function renderOne(testCase, withPostHistory) {
  const system = `${PERSONA}\n\n${buildDirectives(testCase.p)}`;
  const userContent = testCase.msg + (withPostHistory ? POST_HISTORY : '');
  const res = await client.chat.completions.create({
    model: MODEL,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: userContent },
    ],
    temperature: 0.8,
    max_tokens: 320,
  });
  const output = (res.choices?.[0]?.message?.content ?? '').trim();
  const score = scoreDirectiveAdherence({
    plan: { questionBudget: testCase.p.questionBudget, askQuestion: testCase.p.askQuestion, responseLength: testCase.p.responseLength },
    output,
  });
  return { output, score };
}

function sentenceCount(text) {
  const m = text.match(/[.!?]+(\s|$)/g);
  return m ? m.length : (text.trim() ? 1 : 0);
}

async function runConfig(label, withPostHistory) {
  const rows = [];
  for (let i = 0; i < CASES.length; i += 1) {
    const c = CASES[i];
    try {
      const { output, score } = await renderOne(c, withPostHistory);
      rows.push({
        i: i + 1,
        budget: c.p.questionBudget,
        len: c.p.responseLength,
        q: score.observed.questionCount,
        words: score.observed.wordCount,
        sents: sentenceCount(output),
        band: score.observed.band,
        qOk: score.questionBudgetHonored,
        lenOk: score.lengthBandHonored,
        overall: score.overall,
        preview: output.replace(/\s+/g, ' ').slice(0, 170),
      });
    } catch (e) {
      rows.push({ i: i + 1, error: String(e.message || e).slice(0, 120) });
    }
  }
  const valid = rows.filter((r) => !r.error);
  const qHonored = valid.filter((r) => r.qOk).length;
  const lenHonored = valid.filter((r) => r.lenOk).length;
  const meanOverall = valid.length ? valid.reduce((s, r) => s + r.overall, 0) / valid.length : 0;
  console.log(`\n========== CONFIG ${label} (model=${MODEL}) ==========`);
  for (const r of rows) {
    if (r.error) { console.log(`#${r.i} ERROR: ${r.error}`); continue; }
    console.log(
      `#${r.i} budget=${r.budget} len=${r.len} | q=${r.q} ${r.qOk ? 'OK ' : 'VIOL'} | ` +
      `${r.words}w/${r.sents}s band=${r.band} ${r.lenOk ? 'OK ' : 'miss'} | overall=${r.overall.toFixed(2)}\n     "${r.preview}"`,
    );
  }
  console.log(`--- ${label} SUMMARY: questionBudget honored ${qHonored}/${valid.length}, length honored ${lenHonored}/${valid.length}, mean overall ${meanOverall.toFixed(3)} (n=${valid.length})`);
  return { label, qHonored, lenHonored, meanOverall, n: valid.length };
}

(async () => {
  console.log(`Psyche gate — renderer adherence. label=${LABEL} model=${MODEL}\n  base=${BASE}`);
  const results = [];
  results.push(await runConfig('A: directives only', false));
  if (process.env.GATE_SKIP_B !== '1') {
    results.push(await runConfig('B: directives + live post-history', true));
  }
  console.log(`\n================= GATE VERDICT (${LABEL}) =================`);
  for (const r of results) {
    console.log(`${r.label}: questionBudget ${r.qHonored}/${r.n} (${(100 * r.qHonored / r.n).toFixed(0)}%), length ${r.lenHonored}/${r.n} (${(100 * r.lenHonored / r.n).toFixed(0)}%), mean overall ${r.meanOverall.toFixed(3)}`);
  }
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
