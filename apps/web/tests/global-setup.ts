import { chromium, type FullConfig } from "@playwright/test";
import { seedDevSession } from "./helpers/auth";

// Warm Vite's dep optimizer ONCE before the suite. The avatar view lazy-imports
// three.js / TalkingHead; the FIRST browser to reach it triggers Vite's esbuild
// optimize + a full-page reload, which otherwise aborts/timeouts the first real
// test's navigation. Absorb that here so every spec hits an already-warm server.
export default async function globalSetup(_config: FullConfig): Promise<void> {
  const browser = await chromium.launch({
    args: [
      "--enable-unsafe-swiftshader",
      "--use-gl=angle",
      "--use-angle=swiftshader",
      "--ignore-gpu-blocklist",
      "--enable-webgl",
    ],
  });
  const page = await browser.newPage();
  try {
    // Seed the dev session (#19 auth gate) so the warm-up reaches the avatar view.
    await seedDevSession(page);
    await page.goto("http://127.0.0.1:5173/", { waitUntil: "domcontentloaded", timeout: 120_000 });
    // Reach the avatar so the lazy three.js/TalkingHead chunks get optimized now.
    // The optimize triggers one full reload; wait it out, then the canvas appears.
    await page
      .locator("canvas")
      .first()
      .waitFor({ state: "visible", timeout: 90_000 })
      .catch(() => {
        /* warm-up is best-effort; the per-test waitForAvatarReady still gates readiness */
      });
  } finally {
    await browser.close();
  }
}
