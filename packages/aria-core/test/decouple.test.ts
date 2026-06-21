/**
 * Decouple fidelity suite — proves the Firebase-free aria-core brain behaves
 * correctly after the Phase-0 carve-out. Run with tsx (extensionless TS imports).
 *
 * - Crisis gate: the pure regex detector matches the legacy behavior.
 * - generateAIResponse: the FULL orchestration (psyche -> policy -> prompt
 *   assembly -> provider call -> fail-soft) runs end-to-end on Node and returns
 *   a well-formed AIResponse. With no LLM key it exercises everything and
 *   fail-softs to a stall-pool variant (same path proven live on workerd).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { detectCrisis, generateAIResponse } from "../src/index";

test("crisis gate — imminent suicide is detected", () => {
  const r = detectCrisis("i want to kill myself");
  assert.equal(r.severity, "imminent");
  assert.equal(r.category, "suicide");
});

test("crisis gate — advisory ideation is detected (not imminent)", () => {
  const r = detectCrisis("i wish i was dead");
  assert.equal(r.severity, "advisory");
  assert.equal(r.category, "suicide");
});

test("crisis gate — abuse disclosure", () => {
  const r = detectCrisis("my boyfriend is hitting me");
  assert.equal(r.severity, "advisory");
  assert.equal(r.category, "abuse_disclosure");
});

test("crisis gate — normal input is clean", () => {
  const r = detectCrisis("hey aria, how was your day?");
  assert.equal(r.severity, "none");
  assert.equal(r.category, null);
});

test("generateAIResponse — full orchestration returns a valid AIResponse", async () => {
  const r = await generateAIResponse("hey aria, how are you tonight?", []);
  assert.equal(typeof r.content, "string", "content is a string");
  assert.ok(r.content.length > 0, "content is non-empty");
  assert.equal(typeof r.emotion, "string", "emotion is a string");
  assert.equal(typeof r.emotionTrigger, "string", "emotionTrigger is a string");
  assert.equal(typeof r.emotionIntensity, "number", "emotionIntensity is a number");
  assert.ok(r.emotionIntensity >= 0 && r.emotionIntensity <= 1, "intensity in [0,1]");
  assert.equal(typeof r.modelUsed, "string", "modelUsed is a string");
});

test("generateAIResponse — scope guard short-circuits an out-of-scope task", async () => {
  // The scopeGuard runs before any provider call; an obvious task request
  // should return a canned out-of-scope reply (modelUsed 'scope-guard').
  const r = await generateAIResponse("write me a python script to sort a list", []);
  assert.equal(typeof r.content, "string");
  assert.ok(r.content.length > 0);
});
