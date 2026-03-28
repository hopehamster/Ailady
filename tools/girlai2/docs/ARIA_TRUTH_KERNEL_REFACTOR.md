# Aria Truth Kernel Refactor

This module is the canonical runtime truth layer for Aria.

## Ownership

- Owns truthful companion state only.
- Stores canonical sources for profile name, relationship days, timezone, subscription/access, proactive mode, free mode, location awareness, voice, and camera.
- Uses unknown or source-qualified states instead of synthetic always-on feature flags.

## Intended `llmService.ts` Use

- Build the kernel once per request from the live user record, memory signals, and feature/runtime inputs.
- Read capability and identity truth from this kernel only.
- Use `buildDeterministicCapabilitySnapshotText()` or `buildTruthCapabilitySnapshotData()` when assembling prompts, routing, or capability explanations.
- Do not reconstruct truth state inline inside `llmService.ts`; if a source is missing, keep the value unknown rather than guessing.

