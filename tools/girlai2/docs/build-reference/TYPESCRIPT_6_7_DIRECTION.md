# TypeScript 6 / 7 Direction — build-reference for the Aria web monorepo

> Mined 2026-06-21 from two 2026 sources, both featuring the TypeScript team:
> - **TypeScriptFM — "What's Coming in TypeScript 6/7"** (Daniel Rosenwasser, PM; Jake Bailey, Go-port engineer). Authoritative direction.
> - **VS Code "Let it Cook — TypeScript 7 Websites from Scratch"** (James Montemagno + Daniel Rosenwasser). Live-build; practical adoption + workflow tips.
>
> Why this exists: our web product is a fresh production TS monorepo (Cloudflare Workers + React, strict, ES2022, `moduleResolution: Bundler`, `verbatimModuleSyntax`, ESM). This note tracks where TS is actually heading so our tooling/config decisions don't drift from the team's roadmap. The mined TS *books* (Total TypeScript 2026) cover type-level mastery; this covers the 2026 *direction* (the native compiler + config defaults) that books can't.

---

## 1. TS 7 = the native Go port ("tsgo") — ~10x faster, available NOW as a preview

- A genuine **language-to-language port** of the compiler + toolset from TS/JS-on-Node to **Go** (native code). Not WASM tricks, not transpilation — a real reimplementation. Feasible because TS is a "front end" (no heavy runtime codegen).
- **Perf (stated):** single-threaded already 3–4x; parallel parsing ~8x; **true ~10x only once parallel *checking* landed** (the checker was the gate). Teams already heavily parallelized (Slack/Notion/Figma/Vanta on million-line codebases) see ~4–5x. Concrete VS Code numbers: full build 60s→~30s; the Copilot extension typecheck **22s→4s**.
- **The near-term win is the editor (LSP).** The old TS server was single-threaded — a keystroke cancelled all in-flight work. The native server handles diagnostics + completions concurrently. On big codebases, "go to definition" went **30–40s → ~4s**; the status-bar "analyzing" spinner went **20–30s → ~1.5s** (and they want to make it vanish). No caching — it re-analyzes fresh on open, fast.
- **How to adopt (two paths):**
  1. **Editor (low-stakes, reversible):** install the **"TypeScript (Native Preview)"** VS Code extension. Works on open; disable anytime. A **beaker icon** in the status bar = you're on the native preview. Worth it even for plain JS.
  2. **CLI:** `npm i -D @typescript/native-preview` → gives the **`tsgo`** binary (named so it does NOT collide with `tsc`; run side by side). `tsgo` anywhere you'd run `tsc`. Throw threads at it for more speed.
- **CRITICAL — it is NOT in the `typescript` npm package yet.** `npm i typescript` still gives the old JS compiler. The plan is to fold the native compiler into `typescript` by the stable/RC, with a `tsc6` binary for the classic compiler side-by-side — but that infra coordination hasn't shipped. **Today you must explicitly use `@typescript/native-preview` / `tsgo`.** (In the stream, the model wrongly tried `npm i typescript@beta` — had to be corrected to `@typescript/native-preview`.)

## 2. TS 6 = the alignment / stepping-stone release (~late March 2026)

- Same JS/TS codebase the team has used 10+ years (TS 7 is the *separate* Go rewrite). **TS 6 is config-compatible and, as much as possible, checker-compatible with TS 7.** Goal: **a project that compiles clean on 6 should compile on 7 with no adjustments** — provided you clear the deprecation warnings 6 surfaces.
- Mechanism: anything not in 7 is **deprecated in 6 first** (gradual migration). `--ignoreDeprecations` silences them temporarily (don't lean on it). The 6.0 deprecation list is large and **not fully merged** — treat specifics as directional.
- **Readiness gate:** get clean on 6.0, then 7.0 is smooth. Some teams jump straight to the 7 nightly because it surfaces breaks faster.
- **Migration tip (tacit, useful):** 7 surfaces *most* breaks as direct errors, but some are *consequential* (no error, different downstream behavior) — for those, read the release notes. Practical move: **feed the agent the 6.0/7.0 release notes and have it sweep your code — auto-fixes ~90%, you finish the rest.**

## 3. Config direction — and what it means for OUR tsconfig

**The vision: "strict on by default, fewer tsconfig knobs."** Concrete moves:
- **Bundler stacks (US): `target: "ESNext"` + `noEmit: true`** — *explicit team guidance.* Your bundler (Vite / wrangler-esbuild) does the downleveling, so TS shouldn't emit, and `target: ESNext` stops TS from erroring on newer constructs your build tool handles fine. → **Recommended tweak for us: bump `tsconfig.base.json` `target` from `ES2022` to `ESNext`.** We already `--noEmit` (typecheck-only; consumers import source), so that half is satisfied. (Caveat: if we later emit `.d.ts` at a package boundary, that one package keeps emit + a real target.)
- **`target` default is modernizing** (historically the *oldest* ES; new direction is most-recent-stable, **ES2024**) — because runtimes are evergreen. We're already ahead of that floor.
- **DOM lib (confirmed TS 6):** specifying `"DOM"` now auto-includes `DOM.Iterable` + `DOM.AsyncIterable`. → Minor: in `apps/web/tsconfig.json` we can drop the explicit `"DOM.Iterable"` once on 6.
- **ESM is fully blessed.** `require(esm)` resolved the "Python 2→3 of Node" drag. Our all-ESM monorepo is the blessed path; CommonJS was "only ever the best we had at the time."

**Deprecations to AVOID now (we already do — this validates our config):**
- `target: ES5` → **not ported to 7 at all** (and `ES5`'s old auto-`module: CommonJS` implication goes too). We're ES2022→ESNext. ✓
- `moduleResolution: "classic"` → deprecated. We're on `Bundler`. ✓
- `module: System` / `AMD` / `UMD` → deprecated. We're ESNext. ✓
- Importing TypeScript's **internal/undocumented APIs** → breaks in 7 (different runtime). We don't. ✓
- **`verbatimModuleSyntax` / `isolatedModules` / declaration-emit / project-references were NOT discussed** — no guidance to change them; keep our current choices (governed by current docs).

**Net:** our config (strict, Bundler resolution, verbatimModuleSyntax, ESM, noEmit) tracks the roadmap. The single endorsed tweak for a bundler stack like ours is **`target: ESNext`**.

## 4. The #1 wiring gotcha + tooling notes

- **If/when we adopt the native preview: switch every `tsc` → `tsgo`** in `package.json` scripts AND CI (the stream's build broke because CI called `tsc`, i.e. the old compiler). We have no CI yet — note for when we add it.
- **Compiler API in TS 7 = IPC/LSP-based, not the JS API** (and not in 7 at launch, "not too far afterwards"). Only relevant if we build TS codegen/lint tooling that imports `typescript` programmatically — we don't today; plan for out-of-process if we do.
- **Measured adoption call for us:** the **VS Code Native Preview extension** is a free local speed win (use it). Keep **`tsc` as the CI/typecheck gate** until 6.0/7.0 stabilize — `tsgo` is still nightly preview. Re-evaluate when the native compiler folds into the `typescript` package.

## 5. Workflow tips worth copying (the tacit gold from the live-build)

- **⚠ Windows + `auto` model = our cautionary tale.** On `auto`, the model repeatedly failed to account for "I'm on Windows," causing a `pnpm`/`corepack` PATH mess. **Directly relevant to us** — we've already hit Windows-specific friction (schannel cert revocation, LF↔CRLF, Python-SSL CA). **Lesson: pin a known model when platform/edge-case correctness matters; reserve `auto` for forgiving work.** (`auto` also locks the model per-chat — it won't switch mid-conversation; start a new chat to change it. ~10% usage discount.)
- **Plan → implement → review with different model classes per phase** (reasoning model to plan, coding model to implement, strong model to review).
- **Stage the build with explicit stop points** — "scaffold the base/infra, then STOP before the features" — to create a verification checkpoint (matches our own video-work checkpoint discipline). Ask the agent to **enumerate the exact commands before running them** (catches the `typescript@beta` class of mistake).
- **Make accessibility an explicit step** — "sweep all colors for contrast"; it runs a Lighthouse audit. It won't do this unprompted. (Useful for `apps/web` polish.)
- **VS Code agent has built-in browser + Playwright** — injects Playwright when clicking isn't enough (e.g. force mobile viewport) with no MCP/project install. Good for "is this actually responsive?" checks. (Confirms I can browser-test `apps/web` without extra setup.)
- **Read failing CI logs as the source of truth** — the two stream failures (pnpm version mismatch; `tsc` vs `tsgo`) were both obvious from the exact log message.
- **Feed real brand assets (screenshots, icon) as context** for on-brand scaffolds (it pulled brand color from App Store screenshots). Relevant when we build Aria's `apps/web` look — feed her canonical still + the navy/gold palette.

## 6. The AI angle (validates our whole thesis)

Daniel (flagged as hypothesis): TS's growth correlates with AI-tool use because **TS gives guardrails for whatever the model generates — catch errors earlier and faster.** A faster compile round-trip means a coding agent (under a time limit) reaches the right result faster and can check generated snippets inline, *reducing token usage because it doesn't have to go back and fix itself.* → This is exactly why the all-TypeScript stack is right for an AI-built product: the type-checker is the cheapest, fastest reviewer of my own output, and `tsgo`'s 10x makes that loop even tighter.

## 7. Action list for our monorepo

1. **Bump `tsconfig.base.json` `target` → `ESNext`** (team-endorsed for bundler stacks; we already `--noEmit`). Low-risk; surface before applying.
2. Install the **VS Code "TypeScript (Native Preview)"** extension for the 10x editor LSP (local-only, reversible).
3. Keep **`tsc` as the typecheck gate** until 6.0/7.0 stabilize; when we add CI, remember **`tsc`→`tsgo`** if we adopt the native compiler.
4. On TS 6: drop the explicit `"DOM.Iterable"` from `apps/web` lib (auto-included).
5. Adopt the workflow habits: **pin a model on Windows-sensitive work**, staged scaffolding with stop points, explicit accessibility sweeps, brand-asset-as-context.

## Cross-references
- `~/.claude/rules/vscode-claude-code-productivity.md` — VS Code as control plane (profiles, tasks); the native-preview extension is a new addition.
- `build-reference/TOTAL_TYPESCRIPT_2026.md` — type-level mastery (the books complement this direction note).
- `tsconfig.base.json` — the shared monorepo config the action list above tweaks.
