import assert from "node:assert/strict";
import test from "node:test";

import {
  MODEL_REASONING_EFFORTS,
  HarnessError,
  applyProductConfigOverrides,
  ADVANCED_REASONING_CHOICE_ID,
  buildReasoningEffortChoices,
  buildProductModelChoices,
  defaultProductConfig,
  normalizeReasoningCapabilities,
  parseProductConfig,
} from "../src/index.js";

test("OpenAI catalog pins model-specific reasoning defaults and supported levels", () => {
  const config = defaultProductConfig("/workspace", {
    providerKind: "openai",
    model: "gpt-5.6-sol",
  });
  assert.deepEqual(config.provider, {
    kind: "openai",
    model: "gpt-5.6-sol",
    reasoningEffort: "low",
    serviceTier: "default",
  });

  const xhigh = applyProductConfigOverrides(config, {
    reasoningEffort: "xhigh",
    serviceTier: "priority",
  });
  assert.equal(xhigh.provider.reasoningEffort, "xhigh");
  assert.equal(xhigh.provider.kind === "openai" && xhigh.provider.serviceTier, "priority");

  assert.throws(
    () => applyProductConfigOverrides(config, { reasoningEffort: "minimal" }),
    (error: unknown) => error instanceof HarnessError && error.code === "SCHEMA_INVALID",
  );
});

test("legacy provider config loads without inventing effort or widening budget", () => {
  const current = defaultProductConfig("/workspace", {
    providerKind: "openai",
    model: "gpt-5.6-terra",
  });
  const legacy = JSON.parse(JSON.stringify(current)) as Record<string, unknown> & {
    provider: Record<string, unknown>;
    budget: Record<string, unknown>;
  };
  legacy["schemaVersion"] = 1;
  delete legacy.provider["reasoningEffort"];
  legacy.budget["maxDescendants"] = 0;
  const parsed = parseProductConfig(legacy as never);
  assert.equal(parsed.provider.reasoningEffort, null);
  assert.equal(parsed.schemaVersion, 2);
  assert.equal(parsed.budget.maxDescendants, 0);
});

test("OpenRouter null capability expands to gateway efforts while mandatory removes none", () => {
  const capabilities = normalizeReasoningCapabilities({
    supportedEfforts: null,
    defaultEffort: "xhigh",
    mandatory: true,
    nullMeansAll: true,
  });
  assert.deepEqual(capabilities.supportedEfforts, [
    "minimal",
    "low",
    "medium",
    "high",
    "xhigh",
    "max",
  ]);
  assert.equal(capabilities.defaultEffort, "xhigh");
  assert.equal(capabilities.mandatory, true);
});

test("live OpenRouter capability metadata can supersede the bundled example", () => {
  const config = applyProductConfigOverrides(defaultProductConfig("/workspace"), {
    providerKind: "openrouter",
    model: "openai/gpt-5.6-sol",
    reasoningEffort: "minimal",
  });
  assert.equal(config.provider.reasoningEffort, "minimal");
});

test("model choices carry executable reasoning and service-tier metadata", () => {
  const config = defaultProductConfig("/workspace", {
    providerKind: "openai",
    model: "gpt-5.6-sol",
  });
  const choices = buildProductModelChoices({ provider: config.provider });
  const sol = choices.find(
    (choice) => choice.providerKind === "openai" && choice.modelId === "gpt-5.6-sol",
  );
  assert.ok(sol);
  assert.equal(sol.reasoning.defaultEffort, "low");
  assert.deepEqual(sol.reasoning.supportedEfforts, [
    "low",
    "medium",
    "high",
    "xhigh",
    "max",
  ]);
  assert.equal(sol.serviceTiers[0]?.id, "priority");
  const standard = buildReasoningEffortChoices({
    capabilities: sol.reasoning,
    current: "low",
  });
  assert.deepEqual(
    standard.map((choice) => choice.id),
    ["low", "medium", "high", "xhigh", ADVANCED_REASONING_CHOICE_ID],
  );
  assert.deepEqual(
    buildReasoningEffortChoices({
      capabilities: sol.reasoning,
      current: "low",
      advanced: true,
    }).map((choice) => choice.id),
    ["max"],
  );
});

test("SEH does not mislabel Codex Ultra as a single-model provider effort", () => {
  assert.equal((MODEL_REASONING_EFFORTS as readonly string[]).includes("ultra"), false);
});

test("Ollama rejects a portable effort override the adapter cannot execute", () => {
  assert.throws(
    () =>
      applyProductConfigOverrides(defaultProductConfig("/workspace"), {
        reasoningEffort: "high",
      }),
    (error: unknown) => error instanceof HarnessError && error.code === "SCHEMA_INVALID",
  );
});

test("Fast cannot be enabled for a model that does not advertise priority processing", () => {
  const config = defaultProductConfig("/workspace", {
    providerKind: "openai",
    model: "gpt-5.4-mini",
  });
  assert.throws(
    () => applyProductConfigOverrides(config, { serviceTier: "priority" }),
    (error: unknown) => error instanceof HarnessError && error.code === "SCHEMA_INVALID",
  );
});
