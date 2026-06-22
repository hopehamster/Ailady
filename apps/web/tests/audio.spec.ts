import { test, expect } from "./fixtures/base";

// Real Cartesia voice. Run with `ARIA_REAL_API=1 pnpm test:e2e` (needs the worker + the
// Cartesia key in apps/worker/.dev.vars). CI never sets ARIA_REAL_API → skipped.
test.describe("@real real voice (Cartesia/Michelle)", () => {
  test.skip(!process.env.ARIA_REAL_API, "real-API only — run with ARIA_REAL_API=1");

  test("a reply produces non-silent audio", async ({ talking }) => {
    await talking.installAudioTap(); // addInitScript — BEFORE goto
    await talking.goto();
    await talking.waitForAvatarReady(); // need the driver for speak() to run
    await talking.send("hi, can you say hello back to me");
    // Real LLM (~2-4s) + Cartesia (~1-3s) + decode + speak. The tap records the played
    // AudioBuffer's peak (real Michelle audio ⇒ well above silence).
    await expect
      .poll(() => talking.audioPeak(), { timeout: 35_000, intervals: [1000, 2000, 3000] })
      .toBeGreaterThan(0.05);
  });
});
