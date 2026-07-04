import { test, expect } from "./fixtures/base";

// The talking loop, DETERMINISTIC: mock the brain + TTS so it's fast, cost-free, and needs
// no worker/secret/avatar. Proves reply → emotion wiring (the data-aria-emotion hook).
const EMOTIONS = ["loving", "playful", "concerned"];

test.describe("talking loop (mocked)", () => {
  test("reply renders + the emotion hook tracks the reply's emotion", async ({ page, talking }) => {
    let turn = 0;
    await page.route("**/api/chat", async (route) => {
      const emotion = EMOTIONS[turn % EMOTIONS.length];
      turn += 1;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          messageId: `m${turn}`,
          response: `mocked reply ${turn}`,
          emotion,
          emotionTrigger: emotion,
          emotionIntensity: 0.7,
        }),
      });
    });
    // 503 → the web falls back to the silent stub (no real audio needed here).
    await page.route("**/api/tts", (route) =>
      route.fulfill({ status: 503, contentType: "application/json", body: '{"success":false,"error":"tts_not_configured"}' }),
    );

    await talking.goto();

    await talking.send("hey");
    await expect(page.getByText("mocked reply 1")).toBeVisible();
    await expect(talking.emotionEl).toHaveAttribute("data-aria-emotion", "loving");

    await talking.send("again");
    await expect(page.getByText("mocked reply 2")).toBeVisible();
    await expect(talking.emotionEl).toHaveAttribute("data-aria-emotion", "playful");

    await talking.send("once more");
    await expect(page.getByText("mocked reply 3")).toBeVisible();
    await expect(talking.emotionEl).toHaveAttribute("data-aria-emotion", "concerned");
  });

  test("a server error surfaces as a product-quality bubble, not a crash (#24)", async ({ page, talking }) => {
    await page.route("**/api/chat", (route) => route.fulfill({ status: 500, contentType: "application/json", body: '{"success":false,"error":"brain_error"}' }));
    await talking.goto();
    await talking.send("hi");
    // Warm in-world copy from errors/chatErrors.ts — never a raw status/stack/error id.
    await expect(page.getByText(/hiccuped on my side/i)).toBeVisible();
    await expect(page.getByText(/server error|brain_error|500/)).toHaveCount(0);
  });

  test("a 429 surfaces retry-after-aware copy (#24)", async ({ page, talking }) => {
    await page.route("**/api/chat", (route) =>
      route.fulfill({
        status: 429,
        contentType: "application/json",
        headers: { "retry-after": "17" },
        body: '{"success":false,"error":"rate_limited"}',
      }),
    );
    await talking.goto();
    await talking.send("hi");
    await expect(page.getByText(/give me 17 seconds/i)).toBeVisible();
  });

  test("a network failure surfaces warm copy, not a crash (#24)", async ({ page, talking }) => {
    // route.abort() throws a fetch TypeError — the same catch path a 30s timeout aborts into.
    await page.route("**/api/chat", (route) => route.abort("failed"));
    await talking.goto();
    await talking.send("hi");
    await expect(page.getByText(/can't reach you|lost you/i)).toBeVisible();
    await expect(page.getByText(/failed to fetch|TypeError|ERR_/)).toHaveCount(0);
  });

  test("a malformed 200 response degrades gracefully, no crash (#24)", async ({ page, talking }) => {
    await page.route("**/api/chat", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: "not json at all" }),
    );
    await talking.goto();
    await talking.send("hi");
    await expect(page.getByText(/didn't get through|try once more/i)).toBeVisible();
  });

  test("a failed send offers a retry that recovers (#24)", async ({ page, talking }) => {
    let attempt = 0;
    await page.route("**/api/chat", (route) => {
      attempt += 1;
      if (attempt === 1) {
        return route.fulfill({ status: 500, contentType: "application/json", body: '{"success":false}' });
      }
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true, messageId: "m2", response: "recovered reply", emotion: "loving", emotionIntensity: 0.5 }),
      });
    });
    await page.route("**/api/tts", (route) =>
      route.fulfill({ status: 503, contentType: "application/json", body: '{"success":false}' }),
    );
    await talking.goto();
    await talking.send("hi");
    await expect(page.getByText(/hiccuped on my side/i)).toBeVisible();
    const retry = page.getByTestId("retry-send");
    await expect(retry).toBeVisible();
    await retry.click();
    await expect(page.getByText("recovered reply")).toBeVisible();
    await expect(retry).toHaveCount(0); // retry affordance clears after a successful resend
  });
});
