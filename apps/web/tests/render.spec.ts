import { existsSync } from "node:fs";
import { test, expect } from "./fixtures/base";

// Needs the self-hosted GLB (gitignored). Skip if absent (fresh clone / CI without a download step).
const hasGlb = existsSync("public/avatars/avaturn.glb");

test.describe("avatar render", () => {
  test.skip(!hasGlb, "needs apps/web/public/avatars/avaturn.glb (run download-glbs.mjs)");

  test("the 3D avatar paints (non-blank canvas)", async ({ talking }) => {
    await talking.goto();
    await talking.waitForAvatarReady();
    // Poll until the render loop draws a frame.  waitForTimeout is flaky —
    // a fast GPU paints in 200ms; a sluggish CI runner may need 5s.
    // expect.toPass auto-retries with backoff (Playwright course pattern).
    await expect(async () => {
      const painted = await talking.canvasNonBlankCount();
      expect(painted).toBeGreaterThan(1000);
    }).toPass({ timeout: 10_000, intervals: [300, 600, 1000, 2000] });
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
