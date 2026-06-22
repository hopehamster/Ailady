// The preset avatar library — the faces a user can CHOOSE from. There is deliberately
// NO photo-upload path anywhere: users pick from a curated, pre-approved set, which
// designs the consent/deepfake problem out entirely (review 2026-06-21).

export interface AvatarPreset {
  id: string;
  name: string;
  /** GLB url. Dev: a SHA-pinned sample. Prod: our hand-built Avaturn T2 library in R2. */
  glbUrl: string;
}

// SHA-pinned (immutable) sample avatars from the TalkingHead repo — DEV placeholders to
// prove the picker UX with distinct faces. PROD replaces these with our hand-built
// Avaturn T2 library of preset AI-generated faces, served from R2 via loadAvatarLibrary().
const SAMPLE_SHA = "eed58d198076a7e1e825f804802921c4d3804d46";
const sample = (file: string) =>
  `https://cdn.jsdelivr.net/gh/met4citizen/TalkingHead@${SAMPLE_SHA}/avatars/${file}.glb`;

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
