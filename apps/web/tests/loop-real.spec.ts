import { test, expect } from "./fixtures/base";

// The full real loop against the live worker/brain. `ARIA_REAL_API=1 pnpm test:e2e`.
test.describe("@real full loop (real brain)", () => {
  test.skip(!process.env.ARIA_REAL_API, "real-API only — run with ARIA_REAL_API=1");

  test("real reply has text + a valid emotion, and the hook reflects it", async ({ page, talking }) => {
    await talking.goto();
    await talking.waitForAvatarReady();
    const respP = page.waitForResponse((r) => r.url().includes("/api/chat") && r.request().method() === "POST");
    await talking.send("hey, I had a rough day");
    const resp = await respP;
    const body = (await resp.json()) as { success?: boolean; response?: string; emotion?: string };
    expect(body.success, "chat success").toBeTruthy();
    expect(body.response?.length ?? 0, "non-empty reply").toBeGreaterThan(0);
    expect(typeof body.emotion).toBe("string");
    expect((body.emotion ?? "").length).toBeGreaterThan(0);
    await expect(talking.emotionEl).toHaveAttribute("data-aria-emotion", body.emotion ?? "");
  });
});
