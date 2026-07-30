import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  AuditTrail,
  DeterministicClock,
  DeterministicIdFactory,
  EvidenceReceiptStore,
  HarnessError,
  HarnessQualificationStore,
  HarnessReferenceLedger,
  PrincipalRegistry,
  PrincipalSigner,
  SchemaRegistry,
  type HarnessReferenceKind,
} from "../src/index.js";

const protocolId = `protocol-sha256:${"1".repeat(64)}`;
const harnessVersionId = `hv-sha256:${"2".repeat(64)}`;
const snapshotId = `rss-sha256:${"3".repeat(64)}`;
const digest = (character: string): string => `sha256:${character.repeat(64)}`;

test("every durable reference kind blocks retirement until its last hold is released", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "seh-retirement-"));
  t.after(async () => rm(root, { recursive: true, force: true }));
  const schemas = await SchemaRegistry.load(path.resolve("schemas"));
  const clock = new DeterministicClock();
  const ids = new DeterministicIdFactory();
  const principals = new PrincipalRegistry();
  const auditSigner = PrincipalSigner.generate({
    principalId: "audit.retirement",
    role: "audit_store",
    implementationDigest: digest("4"),
    instanceId: "audit.retirement.instance",
  });
  const operationsSigner = PrincipalSigner.generate({
    principalId: "operations.retirement",
    role: "operations_owner",
    implementationDigest: digest("5"),
    instanceId: "operations.retirement.instance",
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
  const references = new HarnessReferenceLedger({
    root,
    protocolId,
    schemas,
    audit,
    principals,
    clock,
    ids,
  });
  const lifecycle = new HarnessQualificationStore({
    root,
    protocolId,
    schemas,
    audit,
    receipts,
    principals,
    clock,
    ids,
    references,
  });
  const receipt = async (receiptType: "artifact_retention" | "gate_release") =>
    receipts.create({
      receiptType,
      subjectIds: [harnessVersionId],
      harnessVersionIds: [harnessVersionId],
      runtimeStateSnapshotIds: [snapshotId],
      signer: operationsSigner,
    });
  const draftReceipt = await receipt("artifact_retention");
  await lifecycle.createDraft({
    harnessVersionId,
    evidenceReceiptIds: [draftReceipt.receiptId],
    signer: operationsSigner,
  });
  const rejectedReceipt = await receipt("gate_release");
  await lifecycle.transition({
    harnessVersionId,
    toState: "rejected",
    evidenceReceiptIds: [rejectedReceipt.receiptId],
    signer: operationsSigner,
  });

  const kinds: readonly HarnessReferenceKind[] = [
    "production_target",
    "rollback_target",
    "live_session",
    "live_descendant",
    "pending_evaluation",
    "pending_deployment",
  ];
  for (const [index, holdKind] of kinds.entries()) {
    await references.acquire({
      holdId: `hold.retirement.${index}`,
      harnessVersionId,
      holdKind,
      subjectId: `subject.retirement.${index}`,
      signer: operationsSigner,
    });
  }
  const restartedReferences = new HarnessReferenceLedger({
    root,
    protocolId,
    schemas,
    audit,
    principals,
    clock,
    ids,
  });
  assert.equal((await restartedReferences.activeHolds(harnessVersionId)).length, 6);
  const retirementReceipt = await receipt("artifact_retention");
  await assert.rejects(
    lifecycle.transition({
      harnessVersionId,
      toState: "retired",
      evidenceReceiptIds: [retirementReceipt.receiptId],
      signer: operationsSigner,
    }),
    (error: unknown) =>
      error instanceof HarnessError && error.code === "INVALID_STATE_TRANSITION",
  );

  for (const [index, holdKind] of kinds.entries()) {
    await restartedReferences.release({
      holdId: `hold.retirement.${index}`,
      harnessVersionId,
      holdKind,
      subjectId: `subject.retirement.${index}`,
      signer: operationsSigner,
    });
    if (index < kinds.length - 1) {
      await assert.rejects(restartedReferences.assertRetirable(harnessVersionId));
    }
  }
  await restartedReferences.assertRetirable(harnessVersionId);
  const retired = await lifecycle.transition({
    harnessVersionId,
    toState: "retired",
    evidenceReceiptIds: [retirementReceipt.receiptId],
    signer: operationsSigner,
  });
  assert.equal(retired.toState, "retired");
  await restartedReferences.verifyAll();
  await lifecycle.verifyAll();
  await receipts.verifyAll();
  await audit.verifyAll();
});
