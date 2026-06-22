import { test as base, expect } from "@playwright/test";
import { TalkingViewPage } from "../pom/TalkingViewPage";

type Fixtures = {
  talking: TalkingViewPage;
  jsErrors: string[];
};

export const test = base.extend<Fixtures>({
  // Auto monitor: collect pageerror + console.error; at teardown assert none except the
  // benign CDN 404 (the jsDelivr probe). A real error fails the test.
  jsErrors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
      page.on("console", (m) => {
        if (m.type() === "error") errors.push("console.error: " + m.text());
      });
      await use(errors);
      const unexpected = errors.filter((e) => !/404|favicon|Failed to load resource/i.test(e));
      expect(unexpected, `unexpected JS/console errors:\n${unexpected.join("\n")}`).toEqual([]);
    },
    { auto: true },
  ],

  talking: async ({ page }, use) => {
    await use(new TalkingViewPage(page));
  },
});

export { expect };
