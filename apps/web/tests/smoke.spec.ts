import { test, expect } from "./fixtures/base";

// App shell — no avatar GLB or worker needed (CI backbone).
test.describe("smoke", () => {
  test("app loads with the three view tabs; Chat is default", async ({ page, talking }) => {
    await talking.goto();
    await expect(page.getByRole("heading", { name: "Aria" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Chat" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Avatar (sandbox)" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Create Aria" })).toBeVisible();
    await expect(talking.input).toBeVisible(); // Chat (default) shows the message input
  });

  test("tab switching works", async ({ page, talking }) => {
    await talking.goto();
    await page.getByRole("button", { name: "Avatar (sandbox)" }).click();
    await page.getByRole("button", { name: "Create Aria" }).click();
    await page.getByRole("button", { name: "Chat" }).click();
    await expect(talking.input).toBeVisible();
  });
});
