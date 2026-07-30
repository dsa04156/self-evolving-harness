import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  ArtifactStore,
  AuditTrail,
  EvidenceReceiptStore,
  HarnessReferenceLedger,
  OperationsControlPlane,
  PrincipalRegistry,
  PrincipalSigner,
  RandomIdFactory,
  SchemaRegistry,
  SessionLifecycleStore,
  SimulatedTerminationCrash,
  SystemClock,
  sha256,
  type SessionPins,
  type TerminationCrashStage,
} from "../src/index.js";

const protocolId = `protocol-sha256:${"1".repeat(64)}`;
const harnessVersionId = `hv-sha256:${"2".repeat(64)}`;
const snapshotId = `rss-sha256:${"3".repeat(64)}`;
const digest = (character: string): string => `sha256:${character.repeat(64)}`;

test("termination recovers exactly once after every durable crash boundary", async (t) => {
  const stages: readonly TerminationCrashStage[] = [
    "initiated",
    "final_receipt",
    "completed",
  ];
  for (const stage of stages) {
    await t.test(stage, async () => {
      const root = await mkdtemp(path.join(os.tmpdir(), `seh-termination-${stage}-`));
      try {
        const schemas = await SchemaRegistry.load(path.resolve("schemas"));
        const principals = new PrincipalRegistry();
        const auditSigner = PrincipalSigner.generate({
          principalId: `audit.termination.${stage}`,
          role: "audit_store",
          implementationDigest: digest("4"),
          instanceId: `audit.termination.${stage}.instance`,
        });
        const operationsSigner = PrincipalSigner.generate({
          principalId: `operations.termination.${stage}`,
          role: "operations_owner",
          implementationDigest: digest("5"),
          instanceId: `operations.termination.${stage}.instance`,
        });
        principals.register(auditSigner.exportPublic());
        principals.register(operationsSigner.exportPublic());
        const clock = new SystemClock();
        const ids = new RandomIdFactory();
        const artifacts = new ArtifactStore(path.join(root, "artifacts"));
        await artifacts.initialize();
        const makeStores = () => {
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
          const references = new HarnessReferenceLedger({
            root,
            protocolId,
            schemas,
            audit,
            principals,
            clock,
            ids,
          });
          return { audit, receipts, lifecycle, references };
        };
        const makeControl = (
          stores: ReturnType<typeof makeStores>,
          crashAfterTerminationStage?: TerminationCrashStage,
        ) =>
          new OperationsControlPlane({
            root,
            protocolId,
            schemas,
            lifecycle: stores.lifecycle,
            receipts: stores.receipts,
            artifacts,
            signer: operationsSigner,
            clock,
            ids,
            references: stores.references,
            ...(crashAfterTerminationStage === undefined
              ? {}
              : { crashAfterTerminationStage }),
          });
        const pins: SessionPins = {
          protocolId,
          harnessVersionId,
          runtimeStateSnapshotId: snapshotId,
          modelIdentityHash: digest("6"),
          permissionPolicyHash: digest("7"),
          safetyPolicyHash: digest("8"),
          budgetPolicyHash: digest("9"),
          budgetAccountId: `budget.termination.${stage}`,
          datasetPermissions: ["deterministic"],
        };
        const firstStores = makeStores();
        const first = makeControl(firstStores, stage);
        await first.initialize();
        const sessionId = `session.termination.${stage}`;
        await first.start(sessionId, pins);
        await assert.rejects(
          first.terminate(sessionId),
          (error: unknown) =>
            error instanceof SimulatedTerminationCrash && error.stage === stage,
        );
        assert.equal((await firstStores.references.activeHolds()).length, 1);

        const recoveredStores = makeStores();
        const recovered = makeControl(recoveredStores);
        await recovered.initialize();
        assert.equal((await recovered.observe(sessionId)).state, "terminated");
        assert.equal((await recoveredStores.references.activeHolds()).length, 0);
        const recoveredLifecycle = await recoveredStores.lifecycle.records(sessionId);
        assert.equal(
          recoveredLifecycle.filter((record) => record.toState === "terminated").length,
          1,
        );
        const finalReceiptIds = recoveredLifecycle
          .filter((record) => record.toState === "terminated")
          .map((record) => record.termination?.finalEvidenceReceiptId);
        assert.equal(new Set(finalReceiptIds).size, 1);
        const lifecycleProjectionHash = sha256(
          recoveredLifecycle as unknown as Parameters<typeof sha256>[0],
        );
        const receiptCount = (await recoveredStores.receipts.all()).length;
        const referenceCount = (await recoveredStores.references.records()).length;

        const restartedStores = makeStores();
        const restarted = makeControl(restartedStores);
        await restarted.initialize();
        assert.equal(
          sha256(
            (await restartedStores.lifecycle.records(sessionId)) as unknown as Parameters<
              typeof sha256
            >[0],
          ),
          lifecycleProjectionHash,
        );
        assert.equal((await restartedStores.receipts.all()).length, receiptCount);
        assert.equal((await restartedStores.references.records()).length, referenceCount);
        await assert.rejects(
          restartedStores.lifecycle.completeTermination({
            sessionId,
            finalEvidenceReceiptId: finalReceiptIds[0]!,
            signer: operationsSigner,
          }),
          /no open termination transaction/u,
        );
        await restartedStores.lifecycle.verifyAll();
        await restartedStores.receipts.verifyAll();
        await restartedStores.references.verifyAll();
        await restartedStores.audit.verifyAll();
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    });
  }
});
