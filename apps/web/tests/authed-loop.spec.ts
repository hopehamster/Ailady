import { test, expect } from "@playwright/test";

// #42 — the SELF-DRIVEN authed-loop harness. Proves the ENTIRE real product flow
// with NO human: real session-based OTP sign-in (phone → Turnstile → OTP → Bearer)
// → chat (real brain) → emotion → voice (real Cartesia) → memory across reload.
//
// Runs against the deployed STAGING worker (ENV=staging), which uses:
//   - Cloudflare Turnstile TEST keys (1x…AA) — auto-issue a token under automation.
//   - A deterministic mock OTP (OTP_VENDOR=mock + MOCK_OTP_CODE; staging-only, prod
//     fails closed) so the code is knowable.
// Same client + worker code as prod; prod is validated by this pass + identical code.
//
//   ARIA_STAGING_URL=https://aria-worker-staging.<sub>.workers.dev \
//     pnpm -C apps/web exec playwright test authed-loop --grep @real
//
// This is the pattern the two-person-team contract mandates: I test the real flow
// myself, measure every piece (session token, HTTP code, emotion attr, audio peak,
// recalled fact), and never hand the user a blind solo test.

const STAGING = process.env.ARIA_STAGING_URL;
const MOCK_CODE = process.env.ARIA_STAGING_OTP_CODE ?? "424242";

test.describe("@real authed loop (staging)", () => {
  test.skip(!STAGING, "set ARIA_STAGING_URL to the deployed staging worker origin");
  test.slow(); // real network + real LLM + real TTS

  test("sign in (real OTP + Turnstile) → chat → emote → voice → memory across reload", async ({ page }) => {
    // Audio tap (canon §2) — override createBufferSource BEFORE any page script so we
    // measure the peak amplitude of whatever Cartesia audio actually plays.
    await page.addInitScript(() => {
      (window as unknown as { __peak: number }).__peak = 0;
      const C = AudioContext.prototype;
      const orig = C.createBufferSource;
      C.createBufferSource = function (this: AudioContext) {
        const src = orig.call(this);
        const start = src.start.bind(src);
        src.start = (...a: Parameters<AudioBufferSourceNode["start"]>) => {
          const b = src.buffer;
          if (b) {
            const d = b.getChannelData(0);
            const w = window as unknown as { __peak: number };
            for (let i = 0; i < d.length; i += 50) w.__peak = Math.max(w.__peak, Math.abs(d[i] ?? 0));
          }
          return start(...a);
        };
        return src;
      };
    });

    await page.goto("/", { waitUntil: "domcontentloaded" });

    // ── 1. SIGN-IN WALL (real endpoints) ──────────────────────────────────────
    await page.getByLabel(/phone number/i).fill("+15551230000");
    // The Turnstile test widget auto-issues a token → the send button enables.
    // (Prod-only gating: the button is disabled until a token exists.)
    await expect(page.getByRole("button", { name: "Text me a code" })).toBeEnabled({ timeout: 25_000 });
    await page.getByRole("button", { name: "Text me a code" }).click();
    await expect(page.locator("[data-aria-auth-step]")).toHaveAttribute("data-aria-auth-step", "code", {
      timeout: 15_000,
    });
    await page.getByLabel(/6-digit code/i).fill(MOCK_CODE);
    await page.getByRole("button", { name: "Come in" }).click();

    // ── 2. SIGNED IN — a REAL Bearer session (not a dev seed) ─────────────────
    const input = page.getByPlaceholder(/say something to aria/i);
    await expect(input).toBeVisible({ timeout: 20_000 });
    const session = await page.evaluate(() => localStorage.getItem("aria.auth.session"));
    expect(session, "session persisted").toBeTruthy();
    expect(session as string, "real OTP session, not dev-mock").toMatch(/"mode":"otp"/);
    expect(session as string, "carries a real ES256 Bearer token").toMatch(/"token":"[^"]{20,}"/);

    // Helper: send a turn, assert /api/chat 200 + success, return the reply body.
    const send = async (text: string) => {
      const resp = page.waitForResponse(
        (r) => r.url().includes("/api/chat") && r.request().method() === "POST",
        { timeout: 45_000 },
      );
      await input.fill(text);
      await input.press("Enter");
      const r = await resp;
      expect(r.status(), "chat authenticated + served").toBe(200);
      const body = (await r.json()) as { success?: boolean; response?: string; emotion?: string };
      expect(body.success, "chat ok").toBeTruthy();
      return body;
    };

    // ── 3. CHAT → reply + emotion (real brain) ────────────────────────────────
    const t1 = await send("Hi Aria — my favorite color is teal. Please remember that.");
    expect((t1.response ?? "").length, "non-empty reply").toBeGreaterThan(0);
    await expect(page.locator("[data-aria-emotion]")).toHaveAttribute("data-aria-emotion", /\w+/);

    // ── 4. VOICE — real Cartesia, non-silent (canon §2 audio peak) ────────────
    await expect
      .poll(() => page.evaluate(() => (window as unknown as { __peak: number }).__peak), {
        timeout: 15_000,
        intervals: [500, 1000, 2000],
      })
      .toBeGreaterThan(0.02);

    // ── 5. MEMORY ACROSS RELOAD (server-side D1 memory) ───────────────────────
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(input, "session survived reload, no gate").toBeVisible({ timeout: 20_000 });
    const t2 = await send("What did I just tell you my favorite color is?");
    expect((t2.response ?? "").toLowerCase(), "she recalls the fact across a fresh load").toContain("teal");
  });
});
