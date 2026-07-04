// The preset avatar library — the faces a user can CHOOSE from. There is deliberately
// NO photo-upload path anywhere: users pick from a curated, pre-approved set, which
// designs the consent/deepfake problem out entirely (review 2026-06-21).

export interface AvatarPreset {
  id: string;
  name: string;
  /** GLB url. Dev: a SHA-pinned sample. Prod: our hand-built Avaturn T2 library in R2. */
  glbUrl: string;
}

// Sample avatars SELF-HOSTED from apps/web/public/avatars/ (gitignored; downloaded once
// from the TalkingHead repo via ~/.claude/tools/cloakbrowser/download-glbs.mjs). Local serve
// = instant + reliable load (the 13.8MB jsDelivr fetch stalls on cold/headless profiles,
// which flaked the avatar in tests). DEV placeholders; PROD replaces with our hand-built
// Avaturn T2 library served from R2 via loadAvatarLibrary(). The avatar is DEV-gated in the
// UI, so these local paths never ship to prod.
const sample = (file: string) => `/avatars/${file}.glb`;

// The COMMITTED generic default face (2026-07-04). Lives in public/preset/ (NOT
// gitignored) so it ships to prod — Aria has a face WITHOUT the hand-built R2
// library. A pre-approved sample avatar (no real-person likeness → the consent/
// deepfake problem stays designed-out). Swap for the real Aria later (#20) by
// pointing loadAvatarLibrary at `GET /api/avatars` over the R2 library.
const DEFAULT_PRESET: AvatarPreset = { id: "aria", name: "Aria", glbUrl: "/preset/aria-default.glb" };

const DEV_PRESETS: AvatarPreset[] = [
  { id: "ava", name: "Ava", glbUrl: sample("avaturn") },
  { id: "bri", name: "Bri", glbUrl: sample("brunette") },
  { id: "noor", name: "Noor", glbUrl: sample("avatarsdk") },
];

/**
 * The seam between the picker and where the avatars live. In PROD this fetches the
 * manifest from our R2-backed Worker endpoint (so the library updates without a
 * redeploy); in DEV it returns the placeholder gallery. Preset-only — never a user upload.
 *
 * OPERATOR TASK (to populate prod): generate the approved Avaturn T2 avatars from
 * AI-generated source faces (no real person), export GLBs, upload to R2, and serve a
 * manifest from `GET /api/avatars`. Then swap the body of this function to:
 *   const r = await fetch("/api/avatars"); return ((await r.json()).presets) as AvatarPreset[];
 */
export async function loadAvatarLibrary(): Promise<AvatarPreset[]> {
  // Default (dev + PROD) = the committed generic face, so she has a face everywhere.
  // Dev also exposes the sample gallery (gitignored GLBs) for the picker/lab.
  // PROD later: swap the body to `const r = await fetch("/api/avatars"); return (await r.json()).presets`.
  return import.meta.env.DEV ? [DEFAULT_PRESET, ...DEV_PRESETS] : [DEFAULT_PRESET];
}
