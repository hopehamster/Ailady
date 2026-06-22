import { existsSync } from "node:fs";
import { test, expect } from "./fixtures/base";

// Needs the self-hosted GLB (gitignored). Skip if absent (fresh clone / CI without a download step).
const hasGlb = existsSync("public/avatars/avaturn.glb");

test.describe("avatar render", () => {
  test.skip(!hasGlb, "needs apps/web/public/avatars/avaturn.glb (run download-glbs.mjs)");

  test("the 3D avatar paints (non-blank canvas)", async ({ talking }) => {
    await talking.goto();
    await talking.waitForAvatarReady();
    await talking.page.waitForTimeout(1500); // let the render loop draw a frame
    const painted = await talking.canvasNonBlankCount();
    expect(painted, "avatar canvas painted pixels (far from #0A1628)").toBeGreaterThan(1000);
  });

  test("@visual avatar baseline (local only)", async ({ talking }) => {
    test.skip(!!process.env.CI, "visual baselines are local-only — per-OS swiftshader drift");
    await talking.goto();
    await talking.waitForAvatarReady();
    await talking.page.waitForTimeout(1500);
    await expect(talking.canvas).toHaveScreenshot("avatar-neutral.png");
  });
});
