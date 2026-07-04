import { defineConfig, devices } from "@playwright/test";

const CI = !!process.env.CI;

// Headless Chrome disables software WebGL by default → the TalkingHead/Three.js avatar
// canvas renders BLANK. These flags enable it (verified: lights up the real GPU via ANGLE,
// or SwiftShader on a GPU-less CI runner).
const GL_ARGS = [
  "--enable-unsafe-swiftshader",
  "--use-gl=angle",
  "--use-angle=swiftshader",
  "--ignore-gpu-blocklist",
  "--enable-webgl",
];

// Boot the web dev server always; the worker ONLY locally — CI has no gitignored
// apps/worker/.dev.vars, so wrangler would hang/timeout there. Mocked specs route-mock
// /api/*, and @real specs are CI-skipped, so CI needs no worker.
const webServer = CI
  ? [{ command: "pnpm dev", url: "http://127.0.0.1:5173", reuseExistingServer: false, timeout: 120_000 }]
  : [
      {
        command: "pnpm -C ../worker dev",
        url: "http://127.0.0.1:8787/healthz",
        reuseExistingServer: true,
        timeout: 90_000,
      },
      { command: "pnpm dev", url: "http://127.0.0.1:5173", reuseExistingServer: true, timeout: 90_000 },
    ];

export default defineConfig({
  testDir: "./tests",
  globalSetup: "./tests/global-setup.ts",
  fullyParallel: true,
  forbidOnly: CI,
  retries: CI ? 2 : 0,
  // Hang discipline (#25): explicit per-test + per-action budgets so a stalled
  // GLB load / dead worker DIES FAST with a trace (on retry) instead of eating
  // the job timeout with nothing to debug. 45s covers the slowest legit spec
  // (avatar paint on SwiftShader) with margin.
  timeout: 45_000,
  // Serial. Every spec mounts the avatar (a 13.8MB self-hosted GLB); running many workers
  // in parallel saturates the Vite dev server and stalls the GLB loads past timeout. The
  // suite is small, so serial is both reliable and fast enough.
  workers: 1,
  reporter: [["html", { open: "never" }], ["list"]],
  // Generous visual tolerance — software WebGL is nondeterministic; @visual specs are
  // local-only anyway (per-OS baselines).
  expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.35 } },
  use: {
    baseURL: "http://127.0.0.1:5173",
    trace: "on-first-retry",
    video: "on-first-retry",
    screenshot: "only-on-failure",
    // #25 hang discipline: individual actions/navigations fail inside the test
    // timeout so the failure names the stalled step (with trace) rather than
    // the whole test evaporating on a generic timeout.
    actionTimeout: 15_000,
    navigationTimeout: 20_000,
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: { args: GL_ARGS },
      },
    },
  ],
  webServer,
});
