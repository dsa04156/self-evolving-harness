import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  AuditTrail,
  ArtifactStore,
  DeterministicClock,
  DeterministicIdFactory,
  EvidenceReceiptStore,
  HarnessError,
  PrincipalRegistry,
  PrincipalSigner,
  OperationsControlPlane,
  SchemaRegistry,
  SessionLifecycleStore,
  type EvidenceReceipt,
  type SessionPins,
} from "../src/index.js";

const protocolId = `protocol-sha256:${"1".repeat(64)}`;
const harnessVersionId = `hv-sha256:${"2".repeat(64)}`;
const runtimeStateSnapshotId = `rss-sha256:${"3".repeat(64)}`;
const digest = (character: string): string => `sha256:${character.repeat(64)}`;

async function temporaryDirectory(t: test.TestContext): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "seh-evidence-"));
  t.after(async () => {
    await rm(directory, { recursive: true, force: true });
  });
  return directory;
}

test("signed receipts bind lifecycle transitions and exact abnormal termination", async (t) => {
  const root = await temporaryDirectory(t);
  const schemas = await SchemaRegistry.load(path.resolve("schemas"));
  const clock = new DeterministicClock();
  const ids = new DeterministicIdFactory();
  const principals = new PrincipalRegistry();
  const auditSigner = PrincipalSigner.generate({
    principalId: "audit.store",
    role: "audit_store",
    implementationDigest: digest("4"),
    instanceId: "audit.instance",
  });
  const operationsSigner = PrincipalSigner.generate({
    principalId: "operations.owner",
    role: "operations_owner",
    implementationDigest: digest("5"),
    instanceId: "operations.instance",
  });
  principals.register(auditSigner.exportPublic());
  principals.register(operationsSigner.exportPublic());
  const audit = new AuditTrail({
    root,
    protocolId,
    signer: auditSigner,
    principals,
    clock,
    ids,
  });
  const receipts = new EvidenceReceiptStore({
    root,
    protocolId,
    schemas,
    audit,
    principals,
    clock,
    ids,
  });
  const lifecycle = new SessionLifecycleStore({
    root,
    protocolId,
    schemas,
    audit,
    receipts,
    principals,
    clock,
    ids,
  });
  const sessionId = "session.lifecycle.1";
  const pins: SessionPins = {
    protocolId,
    harnessVersionId,
    runtimeStateSnapshotId,
    modelIdentityHash: digest("6"),
    permissionPolicyHash: digest("7"),
    safetyPolicyHash: digest("8"),
    budgetPolicyHash: digest("9"),
    budgetAccountId: "budget.lifecycle.1",
    datasetPermissions: ["deterministic"],
  };
  const createReceipt = await receipts.create({
    receiptType: "session_initialization",
    subjectIds: [sessionId],
    harnessVersionIds: [harnessVersionId],
    runtimeStateSnapshotIds: [runtimeStateSnapshotId],
    signer: operationsSigner,
  });
  await lifecycle.create({
    sessionId,
    pins,
    evidenceReceiptIds: [createReceipt.receiptId],
    signer: operationsSigner,
  });
  const initializeReceipt = await receipts.create({
    receiptType: "session_initialization",
    subjectIds: [sessionId],
    harnessVersionIds: [harnessVersionId],
    runtimeStateSnapshotIds: [runtimeStateSnapshotId],
    signer: operationsSigner,
  });
  await lifecycle.transition({
    sessionId,
    toState: "initialized",
    evidenceReceiptIds: [initializeReceipt.receiptId],
    signer: operationsSigner,
  });
  const terminationReceipt = await receipts.create({
    receiptType: "session_checkpoint",
    subjectIds: [sessionId],
    harnessVersionIds: [harnessVersionId],
    runtimeStateSnapshotIds: [runtimeStateSnapshotId],
    signer: operationsSigner,
  });
  const initiating = await lifecycle.beginTermination({
    sessionId,
    reason: "user_cancellation",
    evidenceReceiptIds: [terminationReceipt.receiptId],
    signer: operationsSigner,
  });
  const finalReceipt = await receipts.create({
    receiptType: "session_completion",
    subjectIds: [sessionId],
    harnessVersionIds: [harnessVersionId],
    runtimeStateSnapshotIds: [runtimeStateSnapshotId],
    signer: operationsSigner,
  });
  const terminated = await lifecycle.completeTermination({
    sessionId,
    finalEvidenceReceiptId: finalReceipt.receiptId,
    signer: operationsSigner,
  });
  assert.equal(await lifecycle.state(sessionId), "terminated");
  assert.deepEqual(terminated.terminationTransaction, initiating.terminationTransaction);
  assert.equal(terminated.termination?.capabilitiesRevoked, true);
  await receipts.verifyAll();
  await lifecycle.verifyAll();
  await audit.verifyAll();

  const forged = {
    ...createReceipt,
    subjectIds: ["session.forged"],
  } as EvidenceReceipt;
  await assert.rejects(
    receipts.verify(forged),
    (error: unknown) => error instanceof HarnessError && error.code === "HASH_MISMATCH",
  );
});

test("operations responses expose deterministic state, evidence and next actions", async (t) => {
  const root = await temporaryDirectory(t);
  const schemas = await SchemaRegistry.load(path.resolve("schemas"));
  const clock = new DeterministicClock();
  const ids = new DeterministicIdFactory();
  const principals = new PrincipalRegistry();
  const auditSigner = PrincipalSigner.generate({
    principalId: "audit.operations",
    role: "audit_store",
    implementationDigest: digest("a"),
    instanceId: "audit.operations.instance",
  });
  const operationsSigner = PrincipalSigner.generate({
    principalId: "operations.control",
    role: "operations_owner",
    implementationDigest: digest("b"),
    instanceId: "operations.control.instance",
  });
  principals.register(auditSigner.exportPublic());
  principals.register(operationsSigner.exportPublic());
  const audit = new AuditTrail({
    root,
    protocolId,
    signer: auditSigner,
    principals,
    clock,
    ids,
  });
  const receipts = new EvidenceReceiptStore({
    root,
    protocolId,
    schemas,
    audit,
    principals,
    clock,
    ids,
  });
  const lifecycle = new SessionLifecycleStore({
    root,
    protocolId,
    schemas,
    audit,
    receipts,
    principals,
    clock,
    ids,
  });
  const artifacts = new ArtifactStore(path.join(root, "artifacts"));
  await artifacts.initialize();
  const control = new OperationsControlPlane({
    root,
    protocolId,
    schemas,
    lifecycle,
    receipts,
    artifacts,
    signer: operationsSigner,
    clock,
    ids,
  });
  await control.initialize();
  const pins: SessionPins = {
    protocolId,
    harnessVersionId,
    runtimeStateSnapshotId,
    modelIdentityHash: digest("c"),
    permissionPolicyHash: digest("d"),
    safetyPolicyHash: digest("e"),
    budgetPolicyHash: digest("f"),
    budgetAccountId: "budget.operations.1",
    datasetPermissions: ["deterministic"],
  };
  const started = await control.start("session.operations.1", pins);
  assert.equal(started.state, "initialized");
  assert.ok(started.nextAllowedActions.includes("submit"));
  const submitted = await control.submit(
    "session.operations.1",
    "deterministic task",
    async () => ({
      sessionId: "session.operations.1",
      state: "completed",
      finalText: "done",
      verification: {
        passed: true,
        summary: "passed",
        evidence: { deterministic: true },
        retryable: false,
      },
      usage: {
        modelCalls: 1,
        inputTokens: 1,
        outputTokens: 1,
        reasoningTokens: 0,
        cachedInputTokens: 0,
        toolCalls: 0,
        retries: 0,
        descendants: 0,
        wallClockMillis: 1,
      },
      modelUsage: {
        inputTokens: 1,
        outputTokens: 1,
        reasoningTokens: 0,
        cachedInputTokens: 0,
        totalTokens: 2,
      },
      eventHeadHash: digest("1"),
      eventCount: 1,
    }),
  );
  assert.equal(submitted.state, "completed");
  assert.ok(submitted.nextAllowedActions.includes("finalize"));
  const finalized = await control.finalize("session.operations.1");
  assert.equal(finalized.state, "retired");
  assert.deepEqual(finalized.nextAllowedActions, ["observe", "events", "artifacts"]);
  await lifecycle.verifyAll();
});

test("interrupt wins over a concurrent late successful executor result", async (t) => {
  const root = await temporaryDirectory(t);
  const schemas = await SchemaRegistry.load(path.resolve("schemas"));
  const clock = new DeterministicClock();
  const ids = new DeterministicIdFactory();
  const principals = new PrincipalRegistry();
  const auditSigner = PrincipalSigner.generate({
    principalId: "audit.interrupt-race",
    role: "audit_store",
    implementationDigest: digest("1"),
    instanceId: "audit.interrupt-race.instance",
  });
  const operationsSigner = PrincipalSigner.generate({
    principalId: "operations.interrupt-race",
    role: "operations_owner",
    implementationDigest: digest("2"),
    instanceId: "operations.interrupt-race.instance",
  });
  principals.register(auditSigner.exportPublic());
  principals.register(operationsSigner.exportPublic());
  const audit = new AuditTrail({
    root,
    protocolId,
    signer: auditSigner,
    principals,
    clock,
    ids,
  });
  const receipts = new EvidenceReceiptStore({
    root,
    protocolId,
    schemas,
    audit,
    principals,
    clock,
    ids,
  });
  const lifecycle = new SessionLifecycleStore({
    root,
    protocolId,
    schemas,
    audit,
    receipts,
    principals,
    clock,
    ids,
  });
  const artifacts = new ArtifactStore(path.join(root, "artifacts"));
  await artifacts.initialize();
  const control = new OperationsControlPlane({
    root,
    protocolId,
    schemas,
    lifecycle,
    receipts,
    artifacts,
    signer: operationsSigner,
    clock,
    ids,
  });
  await control.initialize();
  const sessionId = "session.interrupt-race.1";
  const pins: SessionPins = {
    protocolId,
    harnessVersionId,
    runtimeStateSnapshotId,
    modelIdentityHash: digest("3"),
    permissionPolicyHash: digest("4"),
    safetyPolicyHash: digest("5"),
    budgetPolicyHash: digest("6"),
    budgetAccountId: "budget.interrupt-race.1",
    datasetPermissions: ["deterministic"],
  };
  await control.start(sessionId, pins);
  let markStarted!: () => void;
  const started = new Promise<void>((resolve) => {
    markStarted = resolve;
  });
  const submitted = control.submit(sessionId, "late success", async (_task, signal) => {
    markStarted();
    await new Promise<void>((resolve) => {
      if (signal.aborted) resolve();
      else signal.addEventListener("abort", () => resolve(), { once: true });
    });
    return {
      sessionId,
      state: "completed",
      finalText: "late successful result",
      verification: {
        passed: true,
        summary: "late verifier result",
        evidence: { late: true },
        retryable: false,
      },
      usage: {
        modelCalls: 1,
        inputTokens: 1,
        outputTokens: 1,
        reasoningTokens: 0,
        cachedInputTokens: 0,
        toolCalls: 0,
        retries: 0,
        descendants: 0,
        wallClockMillis: 1,
      },
      modelUsage: {
        inputTokens: 1,
        outputTokens: 1,
        reasoningTokens: 0,
        cachedInputTokens: 0,
        totalTokens: 2,
      },
      eventHeadHash: digest("7"),
      eventCount: 0,
    };
  });
  await started;
  const interrupted = await control.interrupt(sessionId);
  const lateSubmit = await submitted;
  assert.equal(interrupted.state, "terminated");
  assert.equal(lateSubmit.state, "terminated");
  assert.equal(await lifecycle.state(sessionId), "terminated");
  const records = await lifecycle.records(sessionId);
  assert.equal(
    records.filter((record) => record.toState === "terminated").length,
    1,
  );
  assert.equal(
    records.some((record) => record.toState === "completed"),
    false,
  );
  await lifecycle.verifyAll();
  await receipts.verifyAll();
  await audit.verifyAll();
});
