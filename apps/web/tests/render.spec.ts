import { existsSync } from "node:fs";
import { test, expect } from "./fixtures/base";

// The default face is now a COMMITTED preset (public/preset/), so this always
// exists — the avatar render tests always run (no gitignored-GLB download needed).
const hasGlb = existsSync("public/preset/aria-default.glb");

test.describe("avatar render", () => {
  test.skip(!hasGlb, "needs apps/web/public/avatars/avaturn.glb (run download-glbs.mjs)");

  test("the 3D avatar paints (non-blank canvas)", async ({ talking }) => {
    // Triples the 30s test budget in CI — SwiftShader needs it (see below).
    test.slow(!!process.env.CI, "software rasterization first-paint");
    await talking.goto();
    await talking.waitForAvatarReady();
    // Poll until the render loop draws a frame.  waitForTimeout is flaky —
    // a fast GPU paints in 200ms; a sluggish CI runner may need 5s.
    // expect.toPass auto-retries with backoff (Playwright course pattern).
    // CI runs SwiftShader SOFTWARE rasterization: the first full avatar frame
    // can take >10s there (run 28558273187 timeout evidence), so the predicate
    // budget scales up in CI while staying tight locally.
    const paintBudgetMs = process.env.CI ? 60_000 : 10_000;
    await expect(async () => {
      const painted = await talking.canvasNonBlankCount();
      expect(painted).toBeGreaterThan(1000);
    }).toPass({ timeout: paintBudgetMs, intervals: [300, 600, 1000, 2000, 5000] });
  });

  test("@visual avatar baseline (local only)", async ({ talking }) => {
    test.skip(!!process.env.CI, "visual baselines are local-only — per-OS swiftshader drift");
    await talking.goto();
    await talking.waitForAvatarReady();
    await expect(async () => {
      const painted = await talking.canvasNonBlankCount();
      expect(painted).toBeGreaterThan(1000);
    }).toPass({ timeout: 10_000, intervals: [300, 600, 1000, 2000] });
    await expect(talking.canvas).toHaveScreenshot("avatar-neutral.png");
  });
});
