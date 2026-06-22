import type { AvatarDriver, AvatarSpeakInput } from "./AvatarDriver";
import { emotionToMood } from "./emotionMap";

// Primary driver: Avaturn T2 GLB rendered client-side via TalkingHead.js (Three.js).
// Proven in spikes/avatar-derisk/. TalkingHead is loaded at runtime from the CDN by its
// FULL URL (via a variable, so neither Vite's dep scanner nor TS tries to resolve it as a
// bundled module). Its internal `import ... from "three"` resolves through the document
// importmap in index.html. TODO(prod): self-host this instead of the CDN.
// Pinned to the immutable v1.7.0 COMMIT SHA (not the movable @1.7 tag) so the upstream
// can't be force-moved under us — supply-chain hardening (security review 2026-06-22).
// TODO(prod, pre-launch): self-host this + three from our own origin/R2 and add a strict
// CSP; a CDN module is a remote-code-execution surface for an intimate-companion app.
const TALKINGHEAD_URL =
  "https://cdn.jsdelivr.net/gh/met4citizen/TalkingHead@67a210b91486a42e58d38fd5682fbfc6754f67bd/modules/talkinghead.mjs";

export class TalkingHeadDriver implements AvatarDriver {
  private head: any = null;
  private container: HTMLElement | null = null;

  async mount(container: HTMLElement): Promise<void> {
    this.container = container;
    const mod: any = await import(/* @vite-ignore */ TALKINGHEAD_URL);
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

  setEmotion(emotion: string): void {
    // intensity is accepted by the interface but TalkingHead's base mood is categorical;
    // intensity will modulate layered expressions in a later pass.
    this.head?.setMood(emotionToMood(emotion));
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
  }

  stop(): void {
    this.head?.stop();
  }

  dispose(): void {
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
