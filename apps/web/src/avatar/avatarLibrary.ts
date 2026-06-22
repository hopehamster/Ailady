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
  return DEV_PRESETS;
}
