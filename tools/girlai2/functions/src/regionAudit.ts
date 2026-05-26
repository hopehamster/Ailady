/**
 * Region co-location audit — Phase 0 P4.
 *
 * Per `oreilly_ai_perf.md` Finding #4 + `round_11.md` Theme 4: cross-region
 * hops between Functions and TTS/LLM providers add ~25-200ms one-way to the
 * latency budget. ElevenLabs explicitly recommends co-locating ASR + LLM + TTS
 * so the only meaningful hop is user↔system.
 *
 * Aria's current state (2026-05-25 audit):
 * - Functions: us-central1 (Iowa)
 * - Azure TTS default: eastus (Virginia)  ← ~600mi mismatch
 * - OpenAI / Anthropic / Gemini: provider-routed (no client-side region)
 *
 * This module logs a one-time warning at module init if regions are mismatched.
 * It does NOT auto-change configuration — Azure custom-voice deployments are
 * region-locked and silent migration would break them. Surfacing the mismatch
 * lets the operator decide: change AZURE_SPEECH_REGION to `centralus`, OR move
 * Functions to a region adjacent to `eastus` (us-east4), OR accept the cost.
 */

import * as functions from 'firebase-functions';

const FUNCTIONS_REGION = 'us-central1'; // matches all .region() calls in index.ts

// Azure regions geographically nearest each GCP region. Rough proxy for "same
// data-center metro" — keeps the audit honest without claiming sub-ms accuracy.
const COLOCATED_AZURE: Record<string, string[]> = {
  'us-central1': ['centralus', 'northcentralus'],
  'us-east4': ['eastus', 'eastus2'],
  'us-west1': ['westus2', 'westus3'],
  'europe-west1': ['westeurope', 'northeurope'],
  'asia-northeast1': ['japaneast'],
};

let auditRan = false;

export function auditRegionsOnce(): void {
  if (auditRan) return;
  auditRan = true;

  const azureRegion =
    process.env.AZURE_SPEECH_REGION || 'eastus' /* matches voiceService default */;
  const expected = COLOCATED_AZURE[FUNCTIONS_REGION] || [];
  const colocated = expected.includes(azureRegion);

  if (!colocated) {
    functions.logger.warn('regionAudit: TTS region not co-located with Functions', {
      functions_region: FUNCTIONS_REGION,
      azure_region: azureRegion,
      recommended_azure_regions: expected,
      estimated_added_rtt_ms: '40-200',
      recommendation:
        'Set AZURE_SPEECH_REGION to one of the recommended regions, ' +
        'or move Functions to a region adjacent to the current Azure region.',
      source: 'oreilly_ai_perf.md Finding #4 + round_11.md Theme 4',
    });
  } else {
    functions.logger.info('regionAudit: TTS co-located with Functions', {
      functions_region: FUNCTIONS_REGION,
      azure_region: azureRegion,
    });
  }
}
