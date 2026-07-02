import { test, expect } from "./fixtures/base";

// Product shell (#19) — no avatar GLB or worker needed (CI backbone).
// Navigation truth: the shell is chat-first. The Lab nav (Chat / Avatar (sandbox) /
// Create Aria) is DEV-ONLY — these specs run against the Vite dev server, so it is
// visible here; production builds hide it via import.meta.env.DEV.
test.describe("smoke", () => {
  test("shell loads: brand header, chat-first, dev lab nav", async ({ page, talking }) => {
    await talking.goto();
    await expect(page.getByRole("heading", { name: "Aria" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Conversations" })).toBeVisible();
    // DEV-only lab views (hidden in prod builds):
    await expect(page.getByRole("button", { name: "Chat" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Avatar (sandbox)" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Create Aria" })).toBeVisible();
    await expect(talking.input).toBeVisible(); // Chat (default) shows the message input
  });

  test("lab view switching works and returns to chat", async ({ page, talking }) => {
    await talking.goto();
    await page.getByRole("button", { name: "Avatar (sandbox)" }).click();
    await page.getByRole("button", { name: "Create Aria" }).click();
    await page.getByRole("button", { name: "Chat" }).click();
    await expect(talking.input).toBeVisible();
  });

  test("chat empty state welcomes, then clears after the first reply", async ({ page, talking }) => {
    await page.route("**/api/chat", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true, messageId: "s1", response: "smoke reply", emotion: "neutral", emotionTrigger: "neutral", emotionIntensity: 0.5 }),
      }),
    );
    await page.route("**/api/tts", (route) =>
      route.fulfill({ status: 503, contentType: "application/json", body: '{"success":false}' }),
    );
    await talking.goto();
    await expect(page.getByText("It's just us here.")).toBeVisible();
    await talking.send("hey");
    await expect(page.getByText("smoke reply")).toBeVisible();
    await expect(page.getByText("It's just us here.")).toBeHidden();
  });

  test("conversation history is explicitly deferred with UX copy", async ({ page, talking }) => {
    await talking.goto();
    await page.getByRole("button", { name: "Conversations" }).click();
    await expect(page.locator("[data-aria-history]")).toContainText(/coming soon/i);
  });
});
