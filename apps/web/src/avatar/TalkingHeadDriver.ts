import type { AvatarDriver, AvatarSpeakInput } from "./AvatarDriver";
import { bodyPlanFor, type TalkingHeadMood } from "./emotionMap";

// Primary driver: Avaturn T2 GLB rendered client-side via TalkingHead.js (Three.js).
// Proven in spikes/avatar-derisk/. SELF-HOSTED (#8, 2026-07-04): the engine is served
// from OUR origin at /vendor/talkinghead/ (vendored from the immutable TalkingHead
// commit 67a210b, the same SHA previously CDN-pinned), alongside its lipsync-en.mjs
// (dynamically imported relative to the engine's own URL). Loaded via a variable so
// neither Vite's dep scanner nor TS tries to resolve it as a bundled module; its
// internal `import ... from "three"` resolves through the LOCAL importmap in
// index.html (/vendor/three/). No CDN module loading remains — the June volley's
// MEDIUM (CDN ESM = an RCE surface) is closed; strict CSP ships via public/_headers.
//
// URL is built at RUNTIME from window.location.origin: Vite rewrites root-relative
// dynamic imports (`?import`) and refuses to serve /public files as modules, but it
// leaves absolute URLs alone (which is why the CDN form worked). A runtime-computed
// absolute same-origin URL + @vite-ignore => a raw native import the browser fetches
// directly from /public, with the importmap resolving its bare `three` specifiers.
const talkingHeadUrl = (): string =>
  `${window.location.origin}/vendor/talkinghead/talkinghead.mjs`;

export class TalkingHeadDriver implements AvatarDriver {
  private head: any = null;
  private container: HTMLElement | null = null;
  private currentMood: TalkingHeadMood | null = null;
  private moodTimer: ReturnType<typeof setTimeout> | null = null;
  private gazeTimer: ReturnType<typeof setTimeout> | null = null;
  private gazeWindowSec: [number, number] = [8, 14];

  async mount(container: HTMLElement): Promise<void> {
    this.container = container;
    const mod: any = await import(/* @vite-ignore */ talkingHeadUrl());
    const TalkingHead = mod.TalkingHead;
    this.head = new TalkingHead(container, {
      // Unused until Cartesia: we never call speakText(), so no TTS key ships client-side.
      ttsEndpoint: "https://eu-texttospeech.googleapis.com/v1beta1/text:synthesize",
      lipsyncModules: ["en"],
      cameraView: "upper",
      modelPixelRatio: Math.min(2, window.devicePixelRatio || 1),
    });
  }

  async loadAvatar(ref: string): Promise<void> {
    if (!this.head) throw new Error("TalkingHeadDriver: call mount() before loadAvatar()");
    await this.head.showAvatar({
      url: ref,
      body: "F",
      avatarMood: "neutral",
      lipsyncLang: "en",
    });
  }

  setEmotion(emotion: string, intensity?: number): void {
    if (!this.head) return;
    const plan = bodyPlanFor(emotion, intensity);

    // Mood layer — deduped (re-setting the same mood restarts TalkingHead's mood
    // animation and reads as a twitch) and eased per the plan's transition time
    // (strong snaps, subtle drifts) rather than applied instantly on every turn.
    if (plan.mood !== this.currentMood) {
      this.currentMood = plan.mood;
      if (this.moodTimer) clearTimeout(this.moodTimer);
      this.moodTimer = setTimeout(() => {
        this.moodTimer = null;
        // currentMood may have moved on during the ease — apply the latest.
        try {
          this.head?.setMood(this.currentMood);
        } catch {
          // mood application must never take down the render loop
        }
      }, plan.transitionMs);
    }

    // Gesture layer — strong-band only, capability-guarded (older TalkingHead
    // builds without playGesture degrade to mood-only, never throw).
    if (plan.gesture && typeof this.head.playGesture === "function") {
      try {
        this.head.playGesture(plan.gesture.name, plan.gesture.durationSec);
      } catch {
        // gesture is decoration; mood already applied
      }
    }

    // Idle gaze cadence follows the emotion's liveliness.
    this.gazeWindowSec = plan.gazeIntervalSec;
  }

  /** Idle micro-motion: periodically re-engage the camera so she never reads
   * frozen between turns. TalkingHead already blinks/sways on its own; this
   * adds the "she's still with you" glance. Capability-guarded no-op when the
   * API is absent. Runs only between start() and stop(). */
  private scheduleGaze(): void {
    if (this.gazeTimer) clearTimeout(this.gazeTimer);
    const [min, max] = this.gazeWindowSec;
    const waitMs = (min + Math.random() * Math.max(0.1, max - min)) * 1000;
    this.gazeTimer = setTimeout(() => {
      try {
        if (this.head && typeof this.head.lookAtCamera === "function") {
          this.head.lookAtCamera(500);
        }
      } catch {
        // gaze is decoration
      }
      this.scheduleGaze();
    }, waitMs);
  }

  async speak(input: AvatarSpeakInput): Promise<void> {
    if (!this.head) return;
    this.head.speakAudio({
      audio: input.audio,
      words: input.words ?? [],
      wtimes: input.wtimes ?? [],
      wdurations: input.wdurations ?? [],
      markers: [],
      mtimes: [],
    });
  }

  start(): void {
    this.head?.start();
    this.scheduleGaze();
  }

  stop(): void {
    if (this.gazeTimer) clearTimeout(this.gazeTimer);
    this.gazeTimer = null;
    this.head?.stop();
  }

  dispose(): void {
    if (this.gazeTimer) clearTimeout(this.gazeTimer);
    this.gazeTimer = null;
    if (this.moodTimer) clearTimeout(this.moodTimer);
    this.moodTimer = null;
    try {
      this.head?.stop();
    } catch {
      // ignore — disposing
    }
    this.head = null;
    // Clear TalkingHead's canvas via a safe DOM method (no innerHTML).
    if (this.container) this.container.replaceChildren();
    this.container = null;
  }

  get audioContext(): AudioContext | null {
    return this.head?.audioCtx ?? null;
  }
}
