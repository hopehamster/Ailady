import { test, expect } from "./fixtures/base";

// T3 — Body-Fidelity Baseline: sweep all 8 TalkingHead moods via mocked /api/chat.
// Proves the avatar face renders differently per emotion (canvas non-blank) and the
// data-aria-emotion hook tracks the correct psyche emotion label.
//
// The 8 moods cover the full TalkingHead mood palette: the 5 warm/positive (happy, love,
// neutral, curious, playful) + the 3 negative/aroused (sad, angry, anxious). Some are
// raw psyche emotions (happy, sad, curious, playful, loving→love) and some are
// TalkingHead-level moods set directly by the avatar layer (angry, anxious). The mock
// returns them as the raw `emotion` field; the DOM hook reflects whatever the avatar
// layer sets.

const MOODS = [
  "happy",
  "love",
  "neutral",
  "sad",
  "angry",
  "anxious",
  "curious",
  "playful",
] as const;

// @visual: GPU-bound (8 full avatar renders). CI runners only have SwiftShader
// software rasterization — each mood takes 30-54s there and times out (run
// 28557079006), vs ~2s on a real GPU. test:e2e:ci grep-inverts @visual, so this
// sweep runs in the LOCAL gate (where it passes 8/8) like the @real suites.
test.describe("T3 — Body Fidelity Mood Sweep @visual", () => {
  for (const mood of MOODS) {
    test(`avatar renders mood: ${mood}`, async ({ page, talking }) => {
      // Mock /api/chat → return this emotion
      await page.route("**/api/chat", async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            success: true,
            messageId: `t3-${mood}`,
            response: `I'm feeling ${mood} today.`,
            emotion: mood,
            emotionTrigger: mood,
            emotionIntensity: 0.7,
          }),
        });
      });

      // 503 → the web falls back to the silent stub (no real audio needed)
      await page.route("**/api/tts", (route) =>
        route.fulfill({
          status: 503,
          contentType: "application/json",
          body: '{"success":false,"error":"tts_not_configured"}',
        }),
      );

      await talking.goto();
      await talking.waitForAvatarReady();
      await talking.send("How are you feeling?");

      // Assert: reply text is visible (proof the mocked response was processed)
      await expect(page.getByText(`I'm feeling ${mood} today.`)).toBeVisible({
        timeout: 10_000,
      });

      // Assert: canvas is non-blank (avatar painted something)
      const painted = await talking.canvasNonBlankCount();
      expect(
        painted,
        `avatar canvas painted pixels for mood "${mood}" (far from #0A1628)`,
      ).toBeGreaterThan(1000);

      // Assert: data-aria-emotion hook tracks the correct emotion
      await expect(talking.emotionEl).toHaveAttribute("data-aria-emotion", mood, {
        timeout: 5_000,
      });
    });
  }
});
