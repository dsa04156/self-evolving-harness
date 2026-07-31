import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  BudgetFreezeStore,
  DeterministicClock,
  MatchedBudgetScheduler,
  PHASE_IDS,
  PhaseBudgetAccount,
  PrincipalRegistry,
  SchemaRegistry,
  assertPhaseBudgetSequenceContract,
  createBudgetFreezeManifest,
  sha256,
  verifyBudgetFreezeManifest,
  type BudgetFreezeCore,
  type BudgetFreezeManifest,
  type JsonValue,
  type PhaseBudgetAccountKey,
  type PhaseBudgetCaps,
} from "../src/index.js";
import { deterministicPrincipal } from "./helpers/deterministic-principal.js";

const protocolId = `protocol-sha256:${"1".repeat(64)}`;
const digest = (character: string): string =>
  `sha256:${character.repeat(64)}`;
const methods = [
  "B0",
  "B1",
  "B2",
  "B3",
  "B4",
  "B5-U",
  "B5-SM",
  "B6-ABL",
  "B6",
] as const;

async function temporaryDirectory(
  t: test.TestContext,
): Promise<string> {
  const root = await mkdtemp(
    path.join(os.tmpdir(), "seh-matched-budget-"),
  );
  t.after(async () => {
    await rm(root, { recursive: true, force: true });
  });
  return root;
}

function caps(
  overrides: Partial<PhaseBudgetCaps> = {},
): PhaseBudgetCaps {
  return {
    providerModelRequestAttempts: 5,
    totalChargedTokens: 50,
    providerCostMicros: 1_000,
    toolAttempts: 10,
    feedbackEvents: 5,
    wallClockMillis: 10_000,
    processCount: 10,
    outputBytes: 10_000,
    ...overrides,
  };
}

function freezeCore(
  phaseCaps: PhaseBudgetCaps = caps(),
): Omit<
  BudgetFreezeCore,
  "schemaVersion" | "hashDomain" | "createdBy"
> {
  return {
    protocolId,
    scope: "synthetic_gate3_readiness",
    datasetPermissions: ["deterministic"],
    modelIdentityHash: digest("2"),
    toolSetHash: digest("3"),
    environmentHash: digest("4"),
    permissionPolicyHash: digest("5"),
    methods,
    rolloutSeeds: [11, 22, 33, 44, 55],
    solverSlots: methods.map((methodId) => ({
      methodId,
      slots: methodId === "B0" ? 1 : 5,
    })),
    phaseCaps: PHASE_IDS.map((phaseId) => ({
      phaseId,
      caps: phaseCaps,
    })),
    perRequestTokenCap: 10,
    perRequestCostCapMicros: 100,
    sourceConfigHash: digest("6"),
    supersedesBudgetFreezeId: null,
    createdAt: "2026-07-31T00:00:00.000Z",
  };
}

function manifestCore(manifest: BudgetFreezeManifest): JsonValue {
  const {
    budgetFreezeId: _budgetFreezeId,
    attestation: _attestation,
    ...core
  } = manifest;
  return core as unknown as JsonValue;
}

test("a protocol freezes one signed matched-budget manifest", async (t) => {
  const root = await temporaryDirectory(t);
  const schemas = await SchemaRegistry.load(path.resolve("schemas"));
  const principals = new PrincipalRegistry();
  const protocolAuthor = deterministicPrincipal({
    principalId: "protocol.author.budget",
    role: "protocol_author",
    implementationDigest: digest("7"),
    instanceId: "protocol.author.budget.instance",
    seedByte: 51,
  });
  principals.register(protocolAuthor.exportPublic());
  const store = new BudgetFreezeStore({
    root,
    protocolId,
    schemas,
    principals,
    signer: protocolAuthor,
  });
  await store.initialize();
  const frozen = await store.freeze(freezeCore());
  verifyBudgetFreezeManifest({
    manifest: frozen,
    expectedProtocolId: protocolId,
    schemas,
    principals,
  });
  assert.match(frozen.budgetFreezeId, /^bf-sha256:[a-f0-9]{64}$/u);
  assert.equal((await store.freeze(freezeCore())).budgetFreezeId, frozen.budgetFreezeId);

  await assert.rejects(
    store.freeze({
      ...freezeCore(),
      perRequestTokenCap: 9,
    }),
    /new protocol ID/u,
  );
  assert.throws(() =>
    createBudgetFreezeManifest({
      core: {
        ...freezeCore(),
        datasetPermissions: ["mine"],
      },
      signer: protocolAuthor,
      schemas,
    }),
  );

  const mutated = {
    ...frozen,
    modelIdentityHash: digest("8"),
  };
  const forged = {
    ...mutated,
    budgetFreezeId:
      `bf-sha256:${sha256(manifestCore(mutated)).slice(7)}`,
  };
  assert.throws(() =>
    verifyBudgetFreezeManifest({
      manifest: forged,
      expectedProtocolId: protocolId,
      schemas,
      principals,
    }),
  );

  const restarted = new BudgetFreezeStore({
    root,
    protocolId,
    schemas,
    principals,
    signer: protocolAuthor,
  });
  await restarted.initialize();
  assert.equal(
    restarted.active().budgetFreezeId,
    frozen.budgetFreezeId,
  );
});

test("phase accounts prevent reservation overcommit and charge failed calls", async (t) => {
  const root = await temporaryDirectory(t);
  const schemas = await SchemaRegistry.load(path.resolve("schemas"));
  const principals = new PrincipalRegistry();
  const protocolAuthor = deterministicPrincipal({
    principalId: "protocol.author.phase",
    role: "protocol_author",
    implementationDigest: digest("9"),
    instanceId: "protocol.author.phase.instance",
    seedByte: 52,
  });
  const operations = deterministicPrincipal({
    principalId: "operations.phase",
    role: "operations_owner",
    implementationDigest: digest("a"),
    instanceId: "operations.phase.instance",
    seedByte: 53,
  });
  principals.register(protocolAuthor.exportPublic());
  principals.register(operations.exportPublic());
  const phaseCaps = caps({
    providerModelRequestAttempts: 2,
    totalChargedTokens: 10,
  });
  const manifest = createBudgetFreezeManifest({
    core: freezeCore(phaseCaps),
    signer: protocolAuthor,
    schemas,
  });
  const accountKey: PhaseBudgetAccountKey = {
    accountId: "phase-account.reservation-test",
    track: "synthetic",
    methodId: "B6",
    taskId: "synthetic.task.reservation",
    candidateId: null,
    phaseId: "track_a_task_search",
  };
  const account = new PhaseBudgetAccount({
    root,
    protocolId,
    manifest,
    account: accountKey,
    schemas,
    principals,
    signer: operations,
    clock: new DeterministicClock(),
  });
  await account.initialize();
  await account.reserveProviderRequest("request.reserved.1", 6);
  await assert.rejects(
    account.reserveProviderRequest("request.denied.2", 5),
    /BUDGET_EXHAUSTED/u,
  );
  assert.equal(account.snapshot().outstandingReservationTokens, 6);
  await assert.rejects(
    account.settleProviderRequest({
      requestId: "request.reserved.1",
      status: "failed",
      usage: null,
    }),
    /BUDGET_EXHAUSTED/u,
  );
  await account.seal();
  assert.deepEqual(account.snapshot(), {
    usage: {
      modelRequestAttempts: 1,
      completedModelCalls: 0,
      failedModelCalls: 1,
      cancelledModelCalls: 0,
      inputTokens: 0,
      outputTokens: 0,
      reasoningTokens: 0,
      cachedInputTokens: 0,
      totalChargedTokens: 6,
      providerCostMicros: 0,
      toolAttempts: 0,
      feedbackEvents: 0,
      processCount: 0,
      outputBytes: 0,
      wallClockMillis: 3,
    },
    outstandingReservationTokens: 0,
    outstandingReservationCostMicros: 0,
    exhaustedDimension: "totalChargedTokens",
    sealed: true,
  });
  assert.deepEqual(
    (await account.records()).map((record) => record.eventType),
    [
      "opened",
      "provider_reserved",
      "budget_denied",
      "provider_settled",
      "sealed",
    ],
  );

  const restarted = new PhaseBudgetAccount({
    root,
    protocolId,
    manifest,
    account: accountKey,
    schemas,
    principals,
    signer: operations,
    clock: new DeterministicClock(),
  });
  await restarted.initialize();
  assert.equal(restarted.snapshot().sealed, true);
  assert.equal(restarted.snapshot().usage.totalChargedTokens, 6);

  const validRecords = await restarted.records();
  const semanticallyInvalid = validRecords.map((record, index) =>
    index === 1
      ? {
          ...record,
          usage: {
            ...record.usage,
            toolAttempts: 1,
          },
        }
      : record,
  );
  assert.throws(
    () =>
      assertPhaseBudgetSequenceContract(
        semanticallyInvalid,
        manifest,
      ),
    /unauthorized usage dimension/u,
  );
});

test("phase accounts reserve provider cost and exhaust wall time at seal", async (t) => {
  const root = await temporaryDirectory(t);
  const schemas = await SchemaRegistry.load(path.resolve("schemas"));
  const principals = new PrincipalRegistry();
  const protocolAuthor = deterministicPrincipal({
    principalId: "protocol.author.cost",
    role: "protocol_author",
    implementationDigest: digest("d"),
    instanceId: "protocol.author.cost.instance",
    seedByte: 56,
  });
  const operations = deterministicPrincipal({
    principalId: "operations.cost",
    role: "operations_owner",
    implementationDigest: digest("e"),
    instanceId: "operations.cost.instance",
    seedByte: 57,
  });
  principals.register(protocolAuthor.exportPublic());
  principals.register(operations.exportPublic());
  const costManifest = createBudgetFreezeManifest({
    core: freezeCore(
      caps({
        providerModelRequestAttempts: 5,
        totalChargedTokens: 50,
        providerCostMicros: 150,
      }),
    ),
    signer: protocolAuthor,
    schemas,
  });
  const costAccount = new PhaseBudgetAccount({
    root,
    protocolId,
    manifest: costManifest,
    account: {
      accountId: "phase-account.cost-reservation",
      track: "synthetic",
      methodId: "B6",
      taskId: "synthetic.task.cost",
      candidateId: null,
      phaseId: "track_a_task_search",
    },
    schemas,
    principals,
    signer: operations,
    clock: new DeterministicClock(),
  });
  await costAccount.initialize();
  await costAccount.reserveProviderRequest("request.cost.1", 2);
  await assert.rejects(
    costAccount.reserveProviderRequest("request.cost.2", 2),
    /providerCostMicros/u,
  );
  assert.equal(
    costAccount.snapshot().outstandingReservationCostMicros,
    100,
  );
  await assert.rejects(
    costAccount.settleProviderRequest({
      requestId: "request.cost.1",
      status: "failed",
      usage: null,
    }),
    /providerCostMicros/u,
  );
  await costAccount.seal();
  assert.equal(
    costAccount.snapshot().exhaustedDimension,
    "providerCostMicros",
  );

  const wallManifest = createBudgetFreezeManifest({
    core: {
      ...freezeCore(caps({ wallClockMillis: 0 })),
      protocolId: `protocol-sha256:${"2".repeat(64)}`,
    },
    signer: protocolAuthor,
    schemas,
  });
  const wallAccount = new PhaseBudgetAccount({
    root,
    protocolId: wallManifest.protocolId,
    manifest: wallManifest,
    account: {
      accountId: "phase-account.wall-seal",
      track: "synthetic",
      methodId: "B6",
      taskId: "synthetic.task.wall",
      candidateId: null,
      phaseId: "track_a_task_search",
    },
    schemas,
    principals,
    signer: operations,
    clock: new DeterministicClock(),
  });
  await wallAccount.initialize();
  await wallAccount.seal();
  assert.equal(
    wallAccount.snapshot().exhaustedDimension,
    "wallClockMillis",
  );
});

test("B0-B6 plans share pins and matched methods cannot borrow budgets", async (t) => {
  const root = await temporaryDirectory(t);
  const schemas = await SchemaRegistry.load(path.resolve("schemas"));
  const principals = new PrincipalRegistry();
  const protocolAuthor = deterministicPrincipal({
    principalId: "protocol.author.scheduler",
    role: "protocol_author",
    implementationDigest: digest("b"),
    instanceId: "protocol.author.scheduler.instance",
    seedByte: 54,
  });
  const operations = deterministicPrincipal({
    principalId: "operations.scheduler",
    role: "operations_owner",
    implementationDigest: digest("c"),
    instanceId: "operations.scheduler.instance",
    seedByte: 55,
  });
  principals.register(protocolAuthor.exportPublic());
  principals.register(operations.exportPublic());
  const manifest = createBudgetFreezeManifest({
    core: freezeCore(),
    signer: protocolAuthor,
    schemas,
  });
  const scheduler = new MatchedBudgetScheduler({
    root,
    protocolId,
    manifest,
    schemas,
    principals,
    signer: operations,
    clock: new DeterministicClock(),
  });
  const plan = scheduler.planTrackA("synthetic.task.scheduler");
  assert.equal(plan.length, 9);
  assert.equal(plan[0]!.methodId, "B0");
  assert.equal(plan[0]!.slots.length, 1);
  assert.ok(plan.slice(1).every((entry) => entry.slots.length === 5));
  assert.equal(
    new Set(plan.map((entry) => sha256(entry.caps as unknown as JsonValue))).size,
    1,
  );
  assert.equal(
    new Set(plan.map((entry) => entry.modelIdentityHash)).size,
    1,
  );
  const feedbackLengths = new Map<string, number[]>();
  const results = await scheduler.executeTrackA({
    taskId: "synthetic.task.scheduler",
    execute: async ({ methodId, slot, account, priorFeedback }) => {
      const lengths = feedbackLengths.get(methodId) ?? [];
      lengths.push(priorFeedback.length);
      feedbackLengths.set(methodId, lengths);
      const requestId = `request.${methodId.replaceAll("-", "_")}.${slot.slotIndex}`;
      await account.reserveProviderRequest(requestId, 2);
      await account.settleProviderRequest({
        requestId,
        status: "completed",
        usage: {
          inputTokens: 1,
          outputTokens: 1,
          reasoningTokens: 0,
          cachedInputTokens: 0,
          totalChargedTokens: 2,
          providerCostMicros: 0,
        },
      });
      return {
        methodId,
        slotIndex: slot.slotIndex,
        syntheticPassed: true,
      };
    },
  });
  assert.equal(results.length, 9);
  assert.equal(results[0]!.finalUsage.modelRequestAttempts, 1);
  assert.equal(results[0]!.finalUsage.feedbackEvents, 0);
  for (const result of results.slice(1)) {
    assert.equal(result.outcomes.length, 5);
    assert.equal(result.finalUsage.modelRequestAttempts, 5);
    assert.equal(result.finalUsage.totalChargedTokens, 10);
    assert.equal(result.finalUsage.feedbackEvents, 5);
    assert.equal(result.exhaustedDimension, null);
  }
  assert.deepEqual(feedbackLengths.get("B1"), [0, 0, 0, 0, 0]);
  assert.deepEqual(feedbackLengths.get("B2"), [0, 1, 2, 3, 4]);
});
