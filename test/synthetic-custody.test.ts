import assert from "node:assert/strict";
import {
  mkdtemp,
  rm,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  SchemaRegistry,
  SyntheticCustodyJournal,
  createEncryptedSyntheticCustody,
  createEvaluatorVaultContract,
  createSyntheticCustodyCapability,
  createSyntheticCustodyEvaluatorReceipt,
  createSyntheticCustodyReleaseRequest,
  decryptSyntheticCustody,
  fixedInertSyntheticPayload,
  sha256Text,
  type PrincipalRole,
  type PrincipalSigner,
  type SyntheticCustodyEnvelope,
  type VaultPrincipalMatrix,
} from "../src/index.js";
import {
  deterministicPrincipal,
} from "./helpers/deterministic-principal.js";

const timestamp = (
  minute: number,
): string =>
  `2026-07-31T22:${minute
    .toString()
    .padStart(2, "0")}:00.000Z`;

function signer(
  role: PrincipalRole,
  seedByte: number,
): PrincipalSigner {
  return deterministicPrincipal({
    principalId: `${role}.synthetic-custody`,
    role,
    implementationDigest: sha256Text(
      `synthetic-custody.${role}.implementation`,
    ),
    instanceId:
      `${role}.synthetic-custody.instance`,
    seedByte,
  });
}

function principals(): {
  readonly protocol: PrincipalSigner;
  readonly vault: PrincipalSigner;
  readonly evaluator: PrincipalSigner;
  readonly matrix: VaultPrincipalMatrix;
} {
  const protocol = signer("protocol_author", 131);
  const vault = signer("vault", 132);
  const evaluator = signer("evaluator", 133);
  const matrix: VaultPrincipalMatrix = {
    protocolAuthor: protocol.exportPublic(),
    benchmarkAuthor:
      signer("benchmark_author", 134).exportPublic(),
    benchmarkReviewer:
      signer(
        "benchmark_reviewer",
        135,
      ).exportPublic(),
    vault: vault.exportPublic(),
    evaluator: evaluator.exportPublic(),
    scorer: signer("scorer", 136).exportPublic(),
    promoter:
      signer("promoter", 137).exportPublic(),
    audit:
      signer("audit_store", 138).exportPublic(),
  };
  return { protocol, vault, evaluator, matrix };
}

test(
  "synthetic custody encrypts inert bytes and consumes one release durably",
  async (t) => {
    const root = await mkdtemp(
      path.join(os.tmpdir(), "seh-synthetic-custody-"),
    );
    t.after(async () => {
      await rm(root, { recursive: true, force: true });
    });
    const schemas = await SchemaRegistry.load(
      path.resolve("schemas"),
    );
    const actors = principals();
    const contract = createEvaluatorVaultContract({
      contractId: "synthetic-custody.contract.v1",
      protocolId:
        `protocol-sha256:${"a".repeat(64)}`,
      principalMatrix: actors.matrix,
      frozenAt: timestamp(0),
      signer: actors.protocol,
      schemas,
    });
    const payload = fixedInertSyntheticPayload();
    const sealed = createEncryptedSyntheticCustody({
      custodyId: "synthetic-custody.normal",
      taskHandleCommitment: sha256Text(
        "opaque-handle-commitment",
      ),
      authorCommitmentHash: sha256Text(
        "author-commitment",
      ),
      includedTransitionHash: sha256Text(
        "included-transition",
      ),
      admittedVaultStateHead: sha256Text(
        "vault-state-head",
      ),
      unlockCapabilityHash: sha256Text(
        "unlock-capability",
      ),
      payload,
      createdAt: timestamp(1),
      signer: actors.vault,
      contract,
      schemas,
      key: Buffer.alloc(32, 0x42),
      nonce: Buffer.alloc(12, 0x24),
    });
    assert.deepEqual(
      decryptSyntheticCustody({
        key: sealed.key,
        envelope: sealed.envelope,
        descriptor: sealed.descriptor,
        contract,
        schemas,
      }),
      payload,
    );
    const tamperedEnvelope: SyntheticCustodyEnvelope = {
      ...sealed.envelope,
      authenticationTag:
        `${sealed.envelope.authenticationTag.slice(
          0,
          -1,
        )}A`,
    };
    assert.throws(
      () =>
        decryptSyntheticCustody({
          key: sealed.key,
          envelope: tamperedEnvelope,
          descriptor: sealed.descriptor,
          contract,
          schemas,
        }),
      /authentication|commitment/iu,
    );

    const capability =
      createSyntheticCustodyCapability({
        capabilityId:
          "synthetic-custody.normal.capability",
        descriptor: sealed.descriptor,
        issuedAt: timestamp(2),
        expiresAt: timestamp(20),
        nonce:
          "synthetic-custody-capability-nonce",
        signer: actors.vault,
        contract,
        schemas,
      });
    const request =
      createSyntheticCustodyReleaseRequest({
        requestId:
          "synthetic-custody.normal.request",
        descriptor: sealed.descriptor,
        capability,
        senderSequence: 0,
        nonce: "synthetic-custody-request-nonce",
        requestedAt: timestamp(3),
        signer: actors.evaluator,
        contract,
        schemas,
      });
    const journal = new SyntheticCustodyJournal({
      root,
      descriptor: sealed.descriptor,
      contract,
      signer: actors.vault,
      schemas,
    });
    assert.equal(
      (await journal.initialize(timestamp(1))).transition
        .stateAfter,
      "sealed",
    );
    const reservation = await journal.reserve(request);
    assert.equal(reservation.failure, null);
    assert.equal(reservation.newlyCommitted, true);
    assert.equal(
      reservation.transition.stateAfter,
      "release_reserved",
    );
    const started = await journal.beginMaterialization({
      request,
      occurredAt: timestamp(4),
    });
    assert.equal(started.newlyCommitted, true);
    assert.equal(
      started.transition.stateAfter,
      "materialization_started",
    );
    const receipt =
      createSyntheticCustodyEvaluatorReceipt({
        receiptId:
          "synthetic-custody.normal.evaluator-receipt",
        descriptor: sealed.descriptor,
        releaseId:
          started.transition.releaseId!,
        observedPayload: payload,
        consumedAt: timestamp(5),
        signer: actors.evaluator,
        contract,
        schemas,
      });
    assert.equal(
      receipt.observedPlaintextCommitment,
      sealed.descriptor.plaintextCommitment,
    );
    const cleanup = await journal.cleanup({
      reason: "normal_completion",
      occurredAt: timestamp(6),
      request,
    });
    assert.equal(cleanup.transition.stateAfter, "cleaned");
    assert.equal(cleanup.transition.keyDestroyed, true);
    assert.equal(
      cleanup.transition.plaintextCleanupConfirmed,
      true,
    );
    const exactReservation =
      await journal.reserve(request);
    assert.equal(
      exactReservation.transition.recordHash,
      reservation.transition.recordHash,
    );
    assert.equal(exactReservation.newlyCommitted, false);
    const replay =
      await journal.beginMaterialization({
        request,
        occurredAt: timestamp(7),
      });
    assert.equal(
      replay.failure?.code,
      "REPLAY_DETECTED",
    );
    assert.equal(await journal.state(), "cleaned");
    assert.equal(
      (await journal.readTransitions()).filter(
        (transition) =>
          transition.action ===
          "begin_materialization",
      ).length,
      1,
    );
  },
);

test(
  "synthetic custody records expired denial and one-winner reservation contention",
  async (t) => {
    const root = await mkdtemp(
      path.join(
        os.tmpdir(),
        "seh-synthetic-custody-denial-",
      ),
    );
    t.after(async () => {
      await rm(root, { recursive: true, force: true });
    });
    const schemas = await SchemaRegistry.load(
      path.resolve("schemas"),
    );
    const actors = principals();
    const contract = createEvaluatorVaultContract({
      contractId:
        "synthetic-custody.contention.contract.v1",
      protocolId:
        `protocol-sha256:${"b".repeat(64)}`,
      principalMatrix: actors.matrix,
      frozenAt: timestamp(0),
      signer: actors.protocol,
      schemas,
    });

    const makeObject = (
      custodyId: string,
    ) =>
      createEncryptedSyntheticCustody({
        custodyId,
        taskHandleCommitment:
          sha256Text("opaque-handle"),
        authorCommitmentHash:
          sha256Text("author-record"),
        includedTransitionHash:
          sha256Text("included-record"),
        admittedVaultStateHead:
          sha256Text("vault-head"),
        unlockCapabilityHash:
          sha256Text("unlock-capability"),
        payload: fixedInertSyntheticPayload(),
        createdAt: timestamp(1),
        signer: actors.vault,
        contract,
        schemas,
      });

    const expired = makeObject(
      "synthetic-custody.expired",
    );
    const expiredCapability =
      createSyntheticCustodyCapability({
        capabilityId:
          "synthetic-custody.expired.capability",
        descriptor: expired.descriptor,
        issuedAt: timestamp(2),
        expiresAt: timestamp(3),
        nonce: "expired-capability-nonce",
        signer: actors.vault,
        contract,
        schemas,
      });
    const expiredRequest =
      createSyntheticCustodyReleaseRequest({
        requestId:
          "synthetic-custody.expired.request",
        descriptor: expired.descriptor,
        capability: expiredCapability,
        senderSequence: 0,
        nonce: "expired-request-nonce",
        requestedAt: timestamp(4),
        signer: actors.evaluator,
        contract,
        schemas,
      });
    const expiredJournal =
      new SyntheticCustodyJournal({
        root: path.join(root, "expired"),
        descriptor: expired.descriptor,
        contract,
        signer: actors.vault,
        schemas,
      });
    await expiredJournal.initialize(timestamp(1));
    const denied =
      await expiredJournal.reserve(expiredRequest);
    assert.equal(
      denied.failure?.code,
      "AUTHORIZATION_DENIED",
    );
    assert.equal(
      denied.transition.action,
      "deny_release",
    );
    await expiredJournal.cleanup({
      reason: "capability_rejection",
      occurredAt: timestamp(5),
      request: expiredRequest,
    });
    assert.equal(
      await expiredJournal.state(),
      "cleaned",
    );

    const raced = makeObject(
      "synthetic-custody.raced",
    );
    const racedCapability =
      createSyntheticCustodyCapability({
        capabilityId:
          "synthetic-custody.raced.capability",
        descriptor: raced.descriptor,
        issuedAt: timestamp(2),
        expiresAt: timestamp(20),
        nonce: "raced-capability-nonce",
        signer: actors.vault,
        contract,
        schemas,
      });
    const requests = ["a", "b"].map((suffix) =>
      createSyntheticCustodyReleaseRequest({
        requestId:
          `synthetic-custody.raced.request.${suffix}`,
        descriptor: raced.descriptor,
        capability: racedCapability,
        senderSequence: 0,
        nonce:
          `synthetic-custody-raced-request-${suffix}`,
        requestedAt: timestamp(4),
        signer: actors.evaluator,
        contract,
        schemas,
      }),
    );
    const racedRoot = path.join(root, "raced");
    const journals = [0, 1].map(
      () =>
        new SyntheticCustodyJournal({
          root: racedRoot,
          descriptor: raced.descriptor,
          contract,
          signer: actors.vault,
          schemas,
        }),
    );
    await journals[0]!.initialize(timestamp(1));
    const dispositions = await Promise.all([
      journals[0]!.reserve(requests[0]!),
      journals[1]!.reserve(requests[1]!),
    ]);
    assert.equal(
      dispositions.filter(
        (result) => result.failure === null,
      ).length,
      1,
    );
    assert.equal(
      dispositions.filter(
        (result) =>
          result.failure?.code === "REPLAY_DETECTED",
      ).length,
      1,
    );
  },
);
