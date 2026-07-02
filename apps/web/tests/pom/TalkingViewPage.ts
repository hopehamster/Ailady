import { type Page, type Locator, expect } from "@playwright/test";
import { PNG } from "pngjs";
import { seedDevSession } from "../helpers/auth";

// The AvatarStage background (#0A1628). A blank canvas screenshots as this navy; a painted
// avatar (skin/hair) is far from it.
const AVATAR_BG = [10, 22, 40] as const;

/** Page Object for the Chat (talking-loop) view. Encapsulates the loop's verification:
 * avatar-ready wait, send, the emote hook, audio non-silence, and the render proof. */
export class TalkingViewPage {
  readonly page: Page;
  readonly input: Locator;
  readonly canvas: Locator;
  readonly emotionEl: Locator;

  constructor(page: Page) {
    this.page = page;
    this.input = page.getByPlaceholder("Say something to Aria…");
    this.canvas = page.locator("canvas").first();
    this.emotionEl = page.locator("[data-aria-emotion]");
  }

  /** Install the audio tap BEFORE any page script creates an AudioContext (addInitScript runs
   * before page scripts) — overriding createBufferSource so we can measure played-buffer peak.
   * Call BEFORE goto(). */
  async installAudioTap(): Promise<void> {
    await this.page.addInitScript(() => {
      const w = window as unknown as { __audioPeak: number; AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
      w.__audioPeak = 0;
      const Ctx = w.AudioContext || w.webkitAudioContext;
      if (!Ctx) return;
      const orig = Ctx.prototype.createBufferSource;
      Ctx.prototype.createBufferSource = function (this: AudioContext) {
        const src = orig.call(this);
        const start = src.start.bind(src);
        src.start = function (...args: Parameters<AudioBufferSourceNode["start"]>) {
          try {
            const b = src.buffer;
            if (b) {
              const d = b.getChannelData(0);
              let p = 0;
              for (let i = 0; i < d.length; i += 50) {
                const v = Math.abs(d[i] ?? 0);
                if (v > p) p = v;
              }
              if (p > w.__audioPeak) w.__audioPeak = p;
            }
          } catch {
            /* ignore */
          }
          return start(...args);
        };
        return src;
      };
    });
  }

  /** Chat is the default view. Seeds a dev session first (#19 auth gate) so the
   * spec lands straight in the chat; auth.spec.ts covers the gate itself.
   * domcontentloaded (not "load"): this is an SPA whose heavy three.js/TalkingHead
   * chunks load lazily, and a stray Vite optimizer reload aborts a "load" wait.
   * waitForAvatarReady() does the real readiness polling after. */
  async goto(): Promise<void> {
    await seedDevSession(this.page);
    await this.page.goto("/", { waitUntil: "domcontentloaded" });
  }

  /** Wait until the avatar GLB finished loading. AvatarStage exposes a deterministic
   * [data-aria-avatar-status] hook (loading|ready|error) — assert on that, not UI copy. */
  async waitForAvatarReady(timeout = 60_000): Promise<void> {
    await expect(async () => {
      const status = await this.page
        .locator("[data-aria-avatar-status]")
        .first()
        .getAttribute("data-aria-avatar-status");
      expect(status).toBe("ready");
      await expect(this.canvas).toBeVisible();
    }).toPass({ timeout, intervals: [500, 1000, 2000, 3000] });
  }

  async send(text: string): Promise<void> {
    await this.input.click();
    await this.input.fill(text);
    await this.page.keyboard.press("Enter");
  }

  /** The DOM-readable emotion hook (head.setMood is otherwise invisible). */
  async currentEmotion(): Promise<string | null> {
    return this.emotionEl.getAttribute("data-aria-emotion");
  }

  /** Peak amplitude of any played AudioBuffer (0 = silent, ~1 = loud speech). Needs the tap. */
  async audioPeak(): Promise<number> {
    return this.page.evaluate(() => (window as unknown as { __audioPeak?: number }).__audioPeak ?? 0);
  }

  /** Count avatar pixels far from the navy bg, taking the MAX across every <canvas>.
   * TalkingHead.js mounts its own canvas alongside AvatarStage's placeholder, so the
   * stage's first <canvas> is blank (just the border) while TalkingHead's is the real
   * render. Scanning all and taking the max = "the avatar painted on some canvas".
   * Browser composites the WebGL canvas in an element screenshot regardless of
   * preserveDrawingBuffer, so this is the reliable render proof (>~1000 ⇒ painted). */
  async canvasNonBlankCount(): Promise<number> {
    const canvases = this.page.locator("canvas");
    const count = await canvases.count();
    let max = 0;
    for (let c = 0; c < count; c++) {
      const buf = await canvases.nth(c).screenshot();
      const png = PNG.sync.read(buf);
      const data = png.data;
      let n = 0;
      for (let i = 0; i + 2 < data.length; i += 4) {
        const dr = Math.abs((data[i] ?? 0) - AVATAR_BG[0]);
        const dg = Math.abs((data[i + 1] ?? 0) - AVATAR_BG[1]);
        const db = Math.abs((data[i + 2] ?? 0) - AVATAR_BG[2]);
        if (dr + dg + db > 36) n++;
      }
      if (n > max) max = n;
    }
    return max;
  }
}
