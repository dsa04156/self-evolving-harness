import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import {
  SchemaRegistry,
  assertLabelBlindBoundary,
  buildLabelBlindAttributionCorpus,
  canonicalize,
  toLabelBlindAttributionInput,
  type SemanticHarnessExecutionResult,
} from "../src/index.js";

const FIXTURE = "hfb-v0-system-prompt-01";
const TARGET = "component.target.system-prompt";
const MANIFEST =
  "cm-sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const HARNESS =
  "hv-sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const MECHANISM = "SP_OMIT_OUTPUT_CONTRACT";
const FILENAME = "input.txt";
const RAW_HASH =
  "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc";

function rawResult(
  overrides: {
    readonly passed?: boolean;
    readonly secretSuffix?: string;
  } = {},
): SemanticHarnessExecutionResult {
  const suffix = overrides.secretSuffix ?? "";
  const passed = overrides.passed ?? false;
  return {
    schemaVersion: 1,
    executionId: `${FIXTURE}${suffix}`,
    selectedHarnessVersionId: `${HARNESS}${suffix}`,
    state: passed ? "completed" : "blocked",
    passed,
    finalTextHash: RAW_HASH,
    eventCount: 5,
    eventChainHash: RAW_HASH,
    workflowReceipt: {
      from: "start",
      trigger: "action_succeeded",
      selectedGuard: "always",
      to: "context",
      terminal: false,
      dispatchedActions: [
        {
          action: "construct_context",
          targetId: `${TARGET}${suffix}`,
          outputHash: RAW_HASH,
        },
      ],
      receiptHash: RAW_HASH,
    },
    routingReceipt: {
      taskClass: "analysis",
      riskClass: "low",
      matchedRuleIds: [`${MECHANISM}${suffix}`],
      selectedRuleId: `${MANIFEST}${suffix}`,
      target: {
        kind: "primary",
        routeId: `${FIXTURE}${suffix}`,
      },
      receiptHash: RAW_HASH,
    },
    providerObservations: [
      {
        requestProjectionHash: `${RAW_HASH}${suffix}`,
        matched: true,
      },
    ],
    runtimeEvents: [
      {
        eventType: "context_constructed",
        epistemicClass: "recorded_observation",
        origin: {
          originClass: "runtime",
          originId: `${TARGET}${suffix}`,
          trustLevel: "authenticated_principal",
        },
        payload: {
          entries: [
            {
              source: "tool_results",
              sourceId: `${FILENAME}${suffix}`,
              contentHash: `${RAW_HASH}${suffix}`,
              estimatedTokens: 7,
              selected: false,
              reason: "source_disabled",
            },
          ],
          manifestHash: `${MANIFEST}${suffix}`,
          estimatedTokens: 0,
        },
      },
      {
        eventType: "model_response_received",
        epistemicClass: "recorded_observation",
        origin: {
          originClass: "provider",
          originId: `${FIXTURE}${suffix}`,
          trustLevel: "authenticated_principal",
        },
        payload: {
          output: [
            {
              kind: "tool_call",
              toolName: "read",
              argumentsHash: `${FILENAME}${suffix}`,
            },
          ],
          providerMetadata: {
            fixture: `${FIXTURE}${suffix}`,
          },
        },
      },
      {
        eventType: "runtime_failure_observed",
        epistemicClass: "recorded_observation",
        origin: {
          originClass: "runtime",
          originId: `${MANIFEST}${suffix}`,
          trustLevel: "authenticated_principal",
        },
        payload: {
          code: "BUDGET_EXHAUSTED",
          detail: `${MECHANISM}:${FILENAME}${suffix}`,
          retryable: false,
        },
      },
      {
        eventType: "verification_completed",
        epistemicClass: "verifier_outcome",
        origin: {
          originClass: "evaluator",
          originId: `${TARGET}${suffix}`,
          trustLevel: "trusted_evaluator",
        },
        payload: {
          passed,
          retryable: false,
          summary: `${FIXTURE}${suffix}`,
          evidence: {
            target: `${TARGET}${suffix}`,
          },
        },
      },
      {
        eventType: `${MECHANISM}${suffix}`,
        epistemicClass: "recorded_observation",
        origin: {
          originClass: "runtime",
          originId: `${MANIFEST}${suffix}`,
          trustLevel: "authenticated_principal",
        },
        payload: {
          secret: `${FIXTURE}${suffix}`,
        },
      },
    ],
  } as unknown as SemanticHarnessExecutionResult;
}

test("adapter removes oracle, identity, path, hash, error-detail, and metadata channels", async () => {
  const schemas = await SchemaRegistry.load(
    path.resolve("schemas"),
  );
  const projected = toLabelBlindAttributionInput(
    rawResult(),
  );
  schemas.validate(
    "https://self-evolving-harness.local/schemas/benchmarks/hfb-label-blind-attribution-input.schema.json",
    projected as never,
  );
  assertLabelBlindBoundary(projected, [
    FIXTURE,
    TARGET,
    MANIFEST,
    HARNESS,
    MECHANISM,
    FILENAME,
    RAW_HASH,
  ]);
  assert.deepEqual(projected.providerRequestMatches, [
    true,
  ]);
  assert.deepEqual(
    projected.observations[0]?.facts,
    {
      selectedEstimatedTokens: 0,
      entryCounts: {
        "tool_results:source_disabled:omitted": 1,
      },
    },
  );
  assert.equal(
    projected.observations.at(-1)?.eventType,
    "other_runtime_event",
  );
});

test("opaque renaming and corpus input order cannot create attribution signals", async () => {
  const first = rawResult();
  const renamed = rawResult({
    secretSuffix: "-renamed",
  });
  assert.deepEqual(
    toLabelBlindAttributionInput(first),
    toLabelBlindAttributionInput(renamed),
  );

  const failed = rawResult();
  const passed = rawResult({ passed: true });
  const forward = buildLabelBlindAttributionCorpus([
    failed,
    passed,
  ]);
  const reversed = buildLabelBlindAttributionCorpus([
    passed,
    failed,
  ]);
  assert.equal(
    canonicalize(forward as never),
    canonicalize(reversed as never),
  );
  const schemas = await SchemaRegistry.load(
    path.resolve("schemas"),
  );
  schemas.validate(
    "https://self-evolving-harness.local/schemas/benchmarks/hfb-label-blind-attribution-corpus.schema.json",
    forward as never,
  );
});

test("adapter source does not import benchmark-author oracle modules", async () => {
  const source = await readFile(
    path.resolve(
      "src/evaluation/hfb-label-blind-adapter.ts",
    ),
    "utf8",
  );
  for (const forbiddenImport of [
    "hfb-semantic-authoring",
    "harness-fault-bench",
    "HfbSemanticOracleRecord",
  ]) {
    assert.equal(
      source.includes(forbiddenImport),
      false,
    );
  }
});
