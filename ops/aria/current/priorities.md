# Aria Priorities

Date: 2026-04-05

## Active Priorities

1. Keep `Ailady_clean_20260327` as the only active implementation repo and stop repo drift.
2. Validate and deploy the clean-branch prompt-cost pass.
3. Run the dedicated latency pass on `IN2017` after the clean-branch prompt-cost deploy.
4. Continue shrinking `tools/girlai2/functions/src/services/llmService.ts`.
5. Preserve the `HeyGen WebView` avatar direction without letting it interrupt the current responsiveness and feature-readiness queue.

## Recently Completed

- Clean-branch ownership shrink pass for Truth Kernel, Memory Controller, and Conversation Policy.
- Semantic sweep rerun on `70578ba3` confirming capability, chronology, and repair correctness.
- Repo divergence audit locking this clean branch as the active implementation base.
- Local Aria operations hub recreated in the clean repo.
- Selective prompt-cost reimplementation landed in the clean repo with local build/test verification.

## Deferred But Still Important

- controlled realization library for callback / repair / low-pressure endings
- memory lifecycle ownership in the Memory Controller action model
- fuller animation push after stability, speed, and feature readiness stay solid
