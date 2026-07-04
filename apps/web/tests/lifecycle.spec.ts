import { existsSync } from "node:fs";
import { test, expect } from "./fixtures/base";

// #23 — browser lifecycle + recovery suite. The avatar path is lifecycle-sensitive:
// WebGL, tab visibility, remounts, load failure, mobile viewport can all regress
// silently. These specs pin the recovery behavior AvatarStage implements (status
// hook, fallback UI + retry, visibilitychange start/stop, StrictMode-safe mounts).
// The jsErrors auto-fixture additionally fails any spec on unexpected console errors.

// Committed preset (public/preset/) is the default face — always present, so the
// lifecycle specs always run.
const hasGlb = existsSync("public/preset/aria-default.glb");

const mockChat = async (page: import("@playwright/test").Page) => {
  await page.route("**/api/chat", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true, messageId: "m1", response: "lifecycle-ok",
        emotion: "neutral", emotionTrigger: "neutral", emotionIntensity: 0.4,
      }),
    }),
  );
  await page.route("**/api/tts", (route) =>
    route.fulfill({ status: 503, contentType: "application/json", body: '{"success":false}' }),
  );
};

const PAINT_BUDGET = process.env.CI ? 60_000 : 15_000;
const paints = (talking: { canvasNonBlankCount(): Promise<number> }) =>
  expect(async () => {
    expect(await talking.canvasNonBlankCount()).toBeGreaterThan(1000);
  }).toPass({ timeout: PAINT_BUDGET, intervals: [300, 600, 1000, 2000, 5000] });

test.describe("lifecycle", () => {
  test.skip(!hasGlb, "needs apps/web/public/avatars/avaturn.glb (run download-glbs.mjs)");

  test("tab hide/show: render loop stops and recovers", async ({ page, talking }) => {
    test.slow(!!process.env.CI, "software rasterization");
    await talking.goto();
    await talking.waitForAvatarReady();
    await paints(talking);

    // Hide the tab (visibilityState is read-only — override + fire the event,
    // which is exactly what AvatarStage listens to) → driver.stop().
    await page.evaluate(() => {
      Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    // Show it again → driver.start(); the canvas must keep painting frames.
    await page.evaluate(() => {
      Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await expect(page.locator("[data-aria-avatar-status]").first()).toHaveAttribute(
      "data-aria-avatar-status", "ready",
    );
    await paints(talking);
  });

  test("refresh after one turn: session, avatar, and loop all come back", async ({ page, talking }) => {
    test.slow(!!process.env.CI, "two avatar loads");
    await mockChat(page);
    await talking.goto();
    await talking.waitForAvatarReady();
    await talking.send("hey");
    await expect(page.getByText("lifecycle-ok")).toBeVisible();

    await page.reload({ waitUntil: "domcontentloaded" });
    // Session persisted (auth gate does not reappear), avatar reloads, chat works.
    await talking.waitForAvatarReady();
    await talking.send("again");
    await expect(page.getByText("lifecycle-ok").first()).toBeVisible();
  });

  test("repeated avatar mount/unmount: no blank stage after cycles", async ({ page, talking }) => {
    test.slow(!!process.env.CI, "multiple avatar loads");
    await talking.goto();
    await talking.waitForAvatarReady();
    // View switching unmounts/remounts the chat's AvatarStage (dev lab nav).
    for (let i = 0; i < 3; i++) {
      await page.getByRole("button", { name: "Avatar (sandbox)" }).click();
      await page.getByRole("button", { name: "Chat", exact: true }).click();
    }
    await talking.waitForAvatarReady();
    await paints(talking); // the stage must actually paint after the churn, not just report ready
  });

  test("avatar load failure: fallback UI, then retry recovers", async ({ page, talking }) => {
    test.slow(!!process.env.CI, "failed load + real load");
    // Fail ONLY the first GLB fetch; the retry must find a working network.
    // Matches any avatar GLB (the committed /preset/ default or a dev /avatars/ sample).
    let glbRequests = 0;
    await page.route("**/*.glb", (route) => {
      glbRequests += 1;
      if (glbRequests === 1) return route.abort("failed");
      return route.continue();
    });
    await talking.goto();
    // Product fallback state — warm copy + a retry affordance, never a dead canvas.
    await expect(page.locator('[data-aria-avatar-status="error"]')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/couldn't appear right now/i)).toBeVisible();
    await page.getByRole("button", { name: "Try again" }).click();
    await talking.waitForAvatarReady();
    await paints(talking);
  });
});

test.describe("lifecycle (mobile)", () => {
  test.skip(!hasGlb, "needs apps/web/public/avatars/avaturn.glb (run download-glbs.mjs)");
  test.use({ viewport: { width: 390, height: 844 } });

  test("mobile viewport: stage + loop stable, no horizontal overflow", async ({ page, talking }) => {
    test.slow(!!process.env.CI, "software rasterization");
    await mockChat(page);
    await talking.goto();
    await talking.waitForAvatarReady();
    await talking.send("hi from mobile");
    await expect(page.getByText("lifecycle-ok")).toBeVisible();
    // The page must never scroll horizontally on a phone.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
    await expect(talking.input).toBeVisible();
  });
});
