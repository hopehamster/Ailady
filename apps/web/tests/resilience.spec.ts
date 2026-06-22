import { test, expect } from "./fixtures/base";

// The jsErrors auto-fixture (base.ts) asserts no unexpected JS/console errors at teardown.
test.describe("resilience", () => {
  test("no unexpected JS/console errors across a mocked turn", async ({ page, talking }) => {
    await page.route("**/api/chat", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true, messageId: "m1", response: "resilience-ok", emotion: "neutral", emotionTrigger: "neutral", emotionIntensity: 0.5 }),
      }),
    );
    await page.route("**/api/tts", (route) => route.fulfill({ status: 503, contentType: "application/json", body: '{"success":false}' }));
    await talking.goto();
    await talking.send("hello");
    await expect(page.getByText("resilience-ok")).toBeVisible();
  });
});
