import { test, expect } from "./fixtures/base";
import { AUTH_SESSION_KEY, DEV_OTP_CODE } from "./helpers/auth";

// The auth gate (#19): phone entry → OTP entry → session. Exercised against the
// DEV mock adapter (these specs run on the Vite dev server); production builds
// select the real phone-OTP Bearer adapter (src/shell/auth/otpApiAdapter.ts),
// which snaps in when the Security stream publishes shared-types auth contracts.
//
// These specs deliberately do NOT seed a session — they walk the gate for real.

async function signInThroughGate(page: import("@playwright/test").Page, code = DEV_OTP_CODE) {
  await page.getByLabel(/phone number/i).fill("+1 555 010 0123");
  await page.getByRole("button", { name: "Text me a code" }).click();
  await expect(page.locator("[data-aria-auth-step]")).toHaveAttribute("data-aria-auth-step", "code");
  await page.getByLabel(/6-digit code/i).fill(code);
  await page.getByRole("button", { name: "Come in" }).click();
}

test.describe("auth gate", () => {
  test("a signed-out visit shows the gate, not the chat", async ({ page, talking }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.locator("[data-aria-auth-step]")).toHaveAttribute("data-aria-auth-step", "phone");
    await expect(talking.input).toHaveCount(0); // no chat behind the gate
  });

  test("happy path: phone → code → chat; session persists across reload", async ({ page, talking }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await signInThroughGate(page);
    await expect(talking.input).toBeVisible();

    const stored = await page.evaluate((k) => localStorage.getItem(k), AUTH_SESSION_KEY);
    expect(stored).toContain('"mode":"dev"');

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(talking.input).toBeVisible(); // restored session, no gate flash
  });

  test("a wrong code shows warm copy and stays on the code step", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await signInThroughGate(page, "123456");
    await expect(page.locator("[data-aria-auth-error]")).toHaveText(/didn't match/i);
    await expect(page.locator("[data-aria-auth-step]")).toHaveAttribute("data-aria-auth-step", "code");
  });

  test("sign out returns to the gate and clears the session", async ({ page, talking }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await signInThroughGate(page);
    await expect(talking.input).toBeVisible();

    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page.locator("[data-aria-auth-step]")).toHaveAttribute("data-aria-auth-step", "phone");
    const stored = await page.evaluate((k) => localStorage.getItem(k), AUTH_SESSION_KEY);
    expect(stored).toBeNull();
  });

  test("mobile viewport (390×844): gate and shell hold together", async ({ page, talking }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.locator("[data-aria-auth-step]")).toBeVisible();

    await signInThroughGate(page);
    await expect(talking.input).toBeVisible();

    // No horizontal overflow on mobile (desktop layout is every other spec).
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, "horizontal overflow px at 390w").toBeLessThanOrEqual(1);
  });
});
