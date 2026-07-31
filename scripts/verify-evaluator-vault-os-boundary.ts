import assert from "node:assert/strict";
import {
  createPublicKey,
  verify,
} from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  PrincipalRegistry,
  SchemaRegistry,
  canonicalBytes,
  canonicalize,
  parseStrictJson,
  sha256,
  type Attestation,
  type JsonValue,
  type PrincipalIdentity,
  type PublicPrincipal,
  type VaultAccessRecord,
} from "../src/index.js";

const EVIDENCE_SCHEMA_ID =
  "https://self-evolving-harness.local/schemas/body-free-evaluator-vault-os-boundary-evidence.schema.json";
const ROLE_UIDS = {
  protocol_author: 1301,
  benchmark_author: 1302,
  benchmark_reviewer: 1303,
  vault: 1304,
  evaluator: 1305,
  scorer: 1306,
  promoter: 1307,
  audit_store: 1308,
} as const;
const STAGES = [
  "create",
  "seal",
  "early_evaluate",
  "protocol_mismatch",
  "capability_substitution",
  "wrong_key",
  "unlock_race_a",
  "unlock_race_b",
  "fresh_duplicate_unlock",
  "evaluate",
  "evaluate_exact_retry",
  "scorer_wrong_evaluate",
  "score",
  "author_wrong_audit",
  "promoter_wrong_score",
  "audit",
  "crash_after_durable_commit",
  "recover_after_durable_commit",
  "crash_during_hardlink_append",
  "recover_hardlink_append",
] as const;

type BoundaryRole = keyof typeof ROLE_UIDS;

interface RoleProbe {
  readonly role: BoundaryRole;
  readonly uid: number;
  readonly gid: number;
  readonly challenge: string;
  readonly challengeSignature: string;
  readonly forbiddenReadsDenied: number;
  readonly forbiddenWritesDenied: number;
  readonly signalsDenied: number;
  readonly ptraceDenied: number;
}

interface WorkerResult {
  readonly ordinal: number;
  readonly returnCode: number;
}

interface VaultResult {
  readonly ok: boolean;
  readonly failure: {
    readonly code: string;
  } | null;
  readonly outcome: {
    readonly accessRecord: VaultAccessRecord;
    readonly releasedCommitments: readonly string[];
  } | null;
  readonly transitionCount: number;
  readonly stateHead: string | null;
  readonly accessRecordHash: string | null;
}

interface TransportEntry {
  readonly stage: string;
  readonly role: BoundaryRole;
  readonly transportAccepted: true;
  readonly peer: {
    readonly uid: number;
    readonly gid: number;
  };
  readonly verifiedServerPeer: {
    readonly uid: number;
    readonly gid: number;
  };
  readonly worker: WorkerResult;
  readonly result: VaultResult | null;
  readonly receiptHash: string | null;
}

interface SignedHashRecord {
  readonly recordHash: string;
  readonly publicPrincipal: PublicPrincipal;
  readonly attestation: Attestation;
}

interface Evidence {
  readonly roleUids: typeof ROLE_UIDS;
  readonly publicPrincipals: Readonly<
    Record<BoundaryRole, PublicPrincipal>
  >;
  readonly hostRoleUids: Readonly<
    Record<BoundaryRole, number>
  >;
  readonly keyOwners: typeof ROLE_UIDS;
  readonly reviewerBoundary: {
    readonly inputFiles: readonly string[];
    readonly authorIdentityPresent: false;
    readonly rawTaskHandlePresent: false;
    readonly privateKeyPresent: false;
  };
  readonly transport: {
    readonly transactions: readonly TransportEntry[];
    readonly socketReplacementDenials: Readonly<
      Record<
        Exclude<BoundaryRole, "vault">,
        {
          readonly unlinkDenied: string;
          readonly bindDenied: string;
        }
      >
    >;
  };
  readonly vault: {
    readonly journalOwners: readonly number[];
    readonly stateHead: string;
    readonly accessRecordHashes: readonly string[];
    readonly unlockRaceSuccesses: 1;
    readonly crashRecovery: {
      readonly durableCommit: {
        readonly transitionCount: number;
        readonly accessRecordHash: string;
      };
      readonly publishedHardlink: {
        readonly transitionCount: number;
        readonly accessRecordHash: string;
        readonly stagingObservedBeforeRecovery: true;
        readonly stagingRemovedAfterRecovery: true;
      };
    };
  };
  readonly roleProbes: Readonly<
    Record<BoundaryRole, RoleProbe>
  >;
  readonly promoterProjection: SignedHashRecord;
  readonly finalAudit: SignedHashRecord & {
    readonly stateHead: string;
    readonly accessRecordHashes: readonly string[];
    readonly roleReceiptHashes: readonly string[];
    readonly promoterProjectionHash: string;
  };
  readonly providerUsed: false;
  readonly researchEvidenceAuthorized: false;
  readonly promotionAuthorized: false;
  readonly evidenceHash: string;
}

function asEvidence(value: JsonValue): Evidence {
  return value as unknown as Evidence;
}

function transactionMap(
  evidence: Evidence,
): ReadonlyMap<string, TransportEntry> {
  const entries = new Map(
    evidence.transport.transactions.map(
      (entry) => [entry.stage, entry],
    ),
  );
  assert.equal(
    entries.size,
    STAGES.length,
    "transport stages are not unique",
  );
  assert.deepEqual(
    [...entries.keys()].sort(),
    [...STAGES].sort(),
  );
  return entries;
}

function requiredResult(
  entries: ReadonlyMap<string, TransportEntry>,
  stage: string,
): VaultResult {
  const entry = entries.get(stage);
  assert.ok(entry, `missing stage ${stage}`);
  assert.ok(entry.result, `stage ${stage} has no result`);
  return entry.result;
}

function verifySignedHashRecord(input: {
  readonly record: SignedHashRecord;
  readonly expected: PublicPrincipal;
  readonly principals: PrincipalRegistry;
}): void {
  const recordHash = input.record.recordHash;
  const publicPrincipal =
    input.record.publicPrincipal;
  const attestation = input.record.attestation;
  const core = {
    ...(input.record as unknown as Record<
      string,
      JsonValue
    >),
  };
  delete core["recordHash"];
  delete core["publicPrincipal"];
  delete core["attestation"];
  assert.equal(
    recordHash,
    sha256(core as unknown as JsonValue),
  );
  assert.equal(
    canonicalize(
      publicPrincipal as unknown as JsonValue,
    ),
    canonicalize(
      input.expected as unknown as JsonValue,
    ),
  );
  input.principals.verify(
    publicPrincipal.identity,
    {
      ...core,
      recordHash,
      publicPrincipal,
    } as unknown as JsonValue,
    attestation,
  );
}

function verifyAccessRecord(input: {
  readonly record: VaultAccessRecord;
  readonly vault: PublicPrincipal;
  readonly principals: PrincipalRegistry;
}): void {
  verifySignedHashRecord({
    record:
      input.record as unknown as SignedHashRecord,
    expected: input.vault,
    principals: input.principals,
  });
}

async function main(): Promise<void> {
  const evidencePath = path.resolve(
    process.argv[2] ??
      "architect/evidence/evaluator-vault-os-boundary/evidence.json",
  );
  const schemas = await SchemaRegistry.load(
    path.resolve("schemas"),
  );
  const parsed = parseStrictJson(
    await readFile(evidencePath, "utf8"),
  );
  schemas.validate(EVIDENCE_SCHEMA_ID, parsed);
  const evidence = asEvidence(parsed);
  assert.deepEqual(evidence.roleUids, ROLE_UIDS);
  assert.deepEqual(evidence.keyOwners, ROLE_UIDS);
  assert.equal(
    new Set(Object.values(evidence.hostRoleUids)).size,
    8,
  );

  const principals = new PrincipalRegistry();
  for (const role of Object.keys(
    ROLE_UIDS,
  ) as BoundaryRole[]) {
    const principal = evidence.publicPrincipals[role];
    assert.equal(principal.identity.role, role);
    principals.register(principal);
    const probe = evidence.roleProbes[role];
    assert.equal(probe.role, role);
    assert.equal(probe.uid, ROLE_UIDS[role]);
    assert.equal(probe.gid, ROLE_UIDS[role]);
    assert.equal(
      verify(
        null,
        Buffer.from(probe.challenge, "utf8"),
        createPublicKey(principal.publicKeyPem),
        Buffer.from(
          probe.challengeSignature,
          "base64url",
        ),
      ),
      true,
      `${role} challenge signature failed`,
    );
    assert.equal(
      probe.forbiddenReadsDenied,
      probe.forbiddenWritesDenied,
    );
    assert.equal(
      probe.signalsDenied,
      probe.ptraceDenied,
    );
  }

  assert.deepEqual(
    evidence.reviewerBoundary.inputFiles,
    [
      "config.json",
      "own-public.json",
      "review.json",
      "reviewer-projection.json",
    ],
  );
  const entries = transactionMap(evidence);
  for (const entry of evidence.transport.transactions) {
    assert.equal(
      entry.peer.uid,
      ROLE_UIDS[entry.role],
    );
    assert.equal(
      entry.peer.gid,
      ROLE_UIDS[entry.role],
    );
    assert.equal(
      entry.verifiedServerPeer.uid,
      ROLE_UIDS.vault,
    );
    assert.equal(
      entry.verifiedServerPeer.gid,
      ROLE_UIDS.vault,
    );
    if (entry.result?.outcome != null) {
      verifyAccessRecord({
        record: entry.result.outcome.accessRecord,
        vault: evidence.publicPrincipals.vault,
        principals,
      });
      assert.equal(
        entry.result.accessRecordHash,
        entry.result.outcome.accessRecord.recordHash,
      );
    }
  }

  const expectedFailures = {
    early_evaluate: "INVALID_STATE_TRANSITION",
    protocol_mismatch: "PROTOCOL_MISMATCH",
    capability_substitution: "HASH_MISMATCH",
    wrong_key: "AUTHENTICATION_FAILED",
    fresh_duplicate_unlock:
      "INVALID_STATE_TRANSITION",
    scorer_wrong_evaluate: "AUTHORIZATION_DENIED",
    author_wrong_audit: "AUTHORIZATION_DENIED",
    promoter_wrong_score: "AUTHORIZATION_DENIED",
  } as const;
  for (const [stage, code] of Object.entries(
    expectedFailures,
  )) {
    assert.equal(
      requiredResult(entries, stage).failure?.code,
      code,
    );
  }
  const raceResults = [
    requiredResult(entries, "unlock_race_a"),
    requiredResult(entries, "unlock_race_b"),
  ];
  assert.equal(
    raceResults.filter((result) => result.ok).length,
    1,
  );
  assert.equal(evidence.vault.unlockRaceSuccesses, 1);
  assert.equal(
    requiredResult(entries, "evaluate")
      .accessRecordHash,
    requiredResult(entries, "evaluate_exact_retry")
      .accessRecordHash,
  );
  assert.notEqual(
    requiredResult(entries, "evaluate").stateHead,
    requiredResult(entries, "evaluate_exact_retry")
      .stateHead,
  );

  for (const stage of [
    "crash_after_durable_commit",
    "crash_during_hardlink_append",
  ]) {
    const entry = entries.get(stage)!;
    assert.equal(entry.result, null);
    assert.equal(entry.receiptHash, null);
    assert.notEqual(entry.worker.returnCode, 0);
  }
  const auditCount =
    requiredResult(entries, "audit").transitionCount;
  const durableRecovery = requiredResult(
    entries,
    "recover_after_durable_commit",
  );
  const hardlinkRecovery = requiredResult(
    entries,
    "recover_hardlink_append",
  );
  assert.equal(
    durableRecovery.transitionCount,
    auditCount + 1,
  );
  assert.equal(
    hardlinkRecovery.transitionCount,
    durableRecovery.transitionCount + 1,
  );
  assert.equal(
    evidence.vault.crashRecovery.durableCommit
      .accessRecordHash,
    durableRecovery.accessRecordHash,
  );
  assert.equal(
    evidence.vault.crashRecovery.publishedHardlink
      .accessRecordHash,
    hardlinkRecovery.accessRecordHash,
  );

  const accessRecordHashes = [
    ...new Set(
      evidence.transport.transactions.flatMap(
        (entry) =>
          entry.result?.accessRecordHash === null ||
          entry.result?.accessRecordHash === undefined
            ? []
            : [entry.result.accessRecordHash],
      ),
    ),
  ].sort();
  assert.deepEqual(
    evidence.vault.accessRecordHashes,
    accessRecordHashes,
  );
  assert.deepEqual(
    evidence.finalAudit.accessRecordHashes,
    accessRecordHashes,
  );
  assert.equal(
    evidence.vault.stateHead,
    hardlinkRecovery.stateHead,
  );
  assert.equal(
    evidence.finalAudit.stateHead,
    evidence.vault.stateHead,
  );
  assert.deepEqual(
    evidence.vault.journalOwners,
    [ROLE_UIDS.vault],
  );

  verifySignedHashRecord({
    record: evidence.promoterProjection,
    expected: evidence.publicPrincipals.promoter,
    principals,
  });
  verifySignedHashRecord({
    record: evidence.finalAudit,
    expected: evidence.publicPrincipals.audit_store,
    principals,
  });
  assert.equal(
    evidence.finalAudit.promoterProjectionHash,
    evidence.promoterProjection.recordHash,
  );
  assert.ok(
    evidence.finalAudit.roleReceiptHashes.length > 0,
  );
  for (const denial of Object.values(
    evidence.transport.socketReplacementDenials,
  )) {
    assert.notEqual(
      denial.unlinkDenied,
      "unexpected_success",
    );
    assert.notEqual(
      denial.bindDenied,
      "unexpected_success",
    );
  }

  const {
    evidenceHash,
    ...evidenceCore
  } = evidence;
  assert.equal(
    evidenceHash,
    sha256(evidenceCore as unknown as JsonValue),
  );
  const serialized = canonicalBytes(
    evidence as unknown as JsonValue,
  ).toString("utf8");
  assert.equal(
    serialized.includes("opaque-task-sha256:"),
    false,
  );
  assert.equal(evidence.providerUsed, false);
  assert.equal(
    evidence.researchEvidenceAuthorized,
    false,
  );
  assert.equal(evidence.promotionAuthorized, false);

  process.stdout.write(
    canonicalBytes({
      verified: true,
      evidenceHash,
      stateHead: evidence.vault.stateHead,
      transactionCount:
        evidence.transport.transactions.length,
      roleCount: Object.keys(ROLE_UIDS).length,
      providerUsed: false,
      researchEvidenceAuthorized: false,
      promotionAuthorized: false,
    }).toString("utf8") + "\n",
  );
}

await main();
