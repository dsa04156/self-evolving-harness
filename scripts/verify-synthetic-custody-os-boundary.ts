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
  asHarnessError,
  canonicalBytes,
  canonicalize,
  parseStrictJson,
  sha256,
  verifyEvaluatorVaultContract,
  verifySyntheticCustodyCapability,
  verifySyntheticCustodyCapabilityAttestation,
  verifySyntheticCustodyDescriptor,
  verifySyntheticCustodyEvaluatorReceipt,
  verifySyntheticCustodyReleaseRequest,
  verifySyntheticCustodyReleaseRequestAttestation,
  verifySyntheticCustodyTransition,
  type Attestation,
  type EvaluatorVaultContract,
  type JsonValue,
  type PrincipalIdentity,
  type PublicPrincipal,
  type SyntheticCustodyCapability,
  type SyntheticCustodyDescriptor,
  type SyntheticCustodyEvaluatorReceipt,
  type SyntheticCustodyReleaseRequest,
  type SyntheticCustodyTransition,
} from "../src/index.js";

const EVIDENCE_SCHEMA_ID =
  "https://self-evolving-harness.local/schemas/synthetic-custody-os-boundary-evidence.schema.json";
const ROLE_RECEIPT_SCHEMA_ID =
  "https://self-evolving-harness.local/schemas/synthetic-custody-role-receipt.schema.json";
const LEAKAGE_SCAN_SCHEMA_ID =
  "https://self-evolving-harness.local/schemas/synthetic-custody-leakage-scan.schema.json";
const PROJECTION_SCHEMA_ID =
  "https://self-evolving-harness.local/schemas/synthetic-custody-commitment-projection.schema.json";
const FINAL_AUDIT_SCHEMA_ID =
  "https://self-evolving-harness.local/schemas/synthetic-custody-final-audit.schema.json";

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

const SCENARIOS = [
  "normal",
  "evaluator_crash",
  "vault_crash",
  "timeout",
  "capability_rejection",
  "response_loss",
] as const;

const CRASH_BOUNDARIES = [
  "after_reservation_commit",
  "after_deny_release",
  "after_materialization_start",
  "after_deny_materialization",
  "after_plaintext_delete",
  "after_private_delete",
  "after_cleanup_commit",
] as const;

const ADVERSARIAL_ATTACKS = [
  "envelope.ciphertext",
  "envelope.authentication_tag",
  "envelope.nonce",
  "envelope.aad_custody_id",
  "envelope.aad_protocol_id",
  "envelope.aad_contract_id",
  "envelope.aad_contract_hash",
  "envelope.aad_task_handle",
  "envelope.aad_author_commitment",
  "envelope.aad_included_transition",
  "envelope.aad_admitted_state",
  "envelope.aad_unlock_capability",
  "envelope.aad_plaintext_commitment",
  "envelope.aad_payload_length",
  "envelope.aad_delivery_guarantee",
  "envelope.envelope_swap",
  "capability.custodyId",
  "capability.admittedVaultStateHead",
  "capability.authorCommitmentHash",
  "capability.taskHandleCommitment",
  "capability.unlockCapabilityHash",
] as const;

type BoundaryRole = keyof typeof ROLE_UIDS;
type ScenarioName = (typeof SCENARIOS)[number];

interface SignedRecord {
  readonly recordHash: string;
  readonly publicPrincipal: PublicPrincipal;
  readonly attestation: Attestation;
}

interface RoleReceipt {
  readonly receiptHash: string;
  readonly publicPrincipal: PublicPrincipal;
  readonly attestation: Attestation;
  readonly role: BoundaryRole;
  readonly action: string;
  readonly process: {
    readonly uid: number;
    readonly gid: number;
  };
  readonly producer: PrincipalIdentity;
}

interface LeakageScan extends SignedRecord {
  readonly custodyId: string;
  readonly descriptorHash: string;
  readonly plaintextCommitment: string;
  readonly keyCommitment: string;
  readonly repositoryPayloadMatches: 0;
  readonly repositoryKeyMatches: 0;
  readonly retainedStatePayloadMatches: 0;
  readonly retainedStateKeyMatches: 0;
  readonly logPayloadMatches: 0;
  readonly logKeyMatches: 0;
  readonly processArgumentPayloadMatches: 0;
  readonly processArgumentKeyMatches: 0;
  readonly keyFilePresentAfterCleanup: false;
  readonly ciphertextFilePresentAfterCleanup: false;
  readonly plaintextFilePresentAfterCleanup: false;
  readonly scannedBy: PrincipalIdentity;
}

interface CommitmentProjection extends SignedRecord {
  readonly projectionClass:
    | "scorer_commitments_only"
    | "promoter_commitments_only";
  readonly custodyId: string;
  readonly descriptorHash: string;
  readonly plaintextCommitment: string;
  readonly sourceReceiptHash: string;
  readonly cleanupTransitionHash: string;
  readonly taskBodyPresent: false;
  readonly ciphertextPresent: false;
  readonly keyPresent: false;
  readonly plaintextPresent: false;
  readonly rawTaskHandlePresent: false;
  readonly observedBy: PrincipalIdentity;
}

interface FinalAudit extends SignedRecord {
  readonly descriptorHashes: readonly string[];
  readonly transitionHashes: readonly string[];
  readonly roleReceiptHashes: readonly string[];
  readonly leakageScanHashes: readonly string[];
  readonly scorerProjectionHash: string;
  readonly promoterProjectionHash: string;
  readonly finalizedBy: PrincipalIdentity;
}

interface RoleProbe {
  readonly role: BoundaryRole;
  readonly uid: number;
  readonly gid: number;
  readonly challenge: string;
  readonly challengeSignature: string;
  readonly forbiddenReadsDenied: 4;
  readonly forbiddenWritesDenied: 4;
  readonly effectiveCapabilities: "0000000000000000";
  readonly noNewPrivileges: "1";
}

interface OperationResult {
  readonly ok: boolean;
  readonly failure: {
    readonly code: string;
  } | null;
  readonly transition: SyntheticCustodyTransition;
  readonly materializationCreated: boolean;
  readonly state: string;
}

interface Scenario {
  readonly scenario: ScenarioName;
  readonly custodyId: string;
  readonly descriptor: SyntheticCustodyDescriptor;
  readonly capability: SyntheticCustodyCapability;
  readonly request: SyntheticCustodyReleaseRequest;
  readonly sealResult: OperationResult;
  readonly reserveResult: OperationResult;
  readonly materializeResult: OperationResult | null;
  readonly consumer: {
    readonly returnCode: number | null;
    readonly timedOut: boolean;
    readonly responseLost: boolean;
    readonly receiptProduced: boolean;
  };
  readonly consumerReceipt:
    SyntheticCustodyEvaluatorReceipt | null;
  readonly consumerRoleReceipt: RoleReceipt | null;
  readonly cleanupResult: OperationResult;
  readonly leakageScan: LeakageScan;
  readonly transitions:
    readonly SyntheticCustodyTransition[];
  readonly roleReceipts: readonly RoleReceipt[];
  readonly roleDenials:
    | Readonly<
        Record<Exclude<BoundaryRole, "vault">, RoleProbe>
      >
    | null;
  readonly exactRetry: {
    readonly reservationStable: true;
    readonly reservationTransitionHash: string;
    readonly secondMaterializationDenied: true;
    readonly failureCode: "REPLAY_DETECTED";
    readonly plaintextFilePresent: false;
  } | null;
  readonly freshCapabilityReuse: readonly {
    readonly condition:
      | "normal_completion"
      | "response_loss"
      | "vault_restart"
      | "cleanup_completion";
    readonly correctlySignedFreshRequest: true;
    readonly request: SyntheticCustodyReleaseRequest;
    readonly requestHash: string;
    readonly senderSequence: number;
    readonly nonce: string;
    readonly failureCode: "REPLAY_DETECTED";
    readonly newlyCommitted: true;
    readonly denialTransitionHash: string;
    readonly denialReason:
      "consumed_capability_reuse";
    readonly statePreservingDenial: true;
    readonly transitionCountBefore: number;
    readonly transitionCountAfter: number;
    readonly exactRetryFailureCode:
      "REPLAY_DETECTED";
    readonly exactRetryNewlyCommitted: false;
    readonly exactRetryTransitionHash: string;
    readonly exactRetryTransitionCountBefore: number;
    readonly exactRetryTransitionCountAfter: number;
    readonly reservationCount: 1;
    readonly materializationCount: number;
    readonly secondReservationAppended: false;
    readonly secondMaterializationBegan: false;
  }[];
  readonly residuals: {
    readonly keyFilePresent: false;
    readonly ciphertextFilePresent: false;
    readonly plaintextFilePresent: false;
  };
}

interface CrashCase {
  readonly boundary:
    | "after_reservation_commit"
    | "after_deny_release"
    | "after_materialization_start"
    | "after_deny_materialization"
    | "after_plaintext_delete"
    | "after_private_delete"
    | "after_cleanup_commit";
  readonly deliveryGuarantee:
    "at_most_once_abort_on_uncertain_delivery";
  readonly cleanupReason: string;
  readonly crashObserved: true;
  readonly crashReturnCode: number;
  readonly evaluatorPlaintextMounted: false;
  readonly evaluatorReceiptProduced: false;
  readonly descriptor: SyntheticCustodyDescriptor;
  readonly transitions:
    readonly SyntheticCustodyTransition[];
  readonly terminalTransitionHash: string;
  readonly beginCleanupCount: 1;
  readonly cleanupCount: 1;
  readonly denialCount: number;
  readonly reservationCountBeforeRecovery: number;
  readonly reservationCountAfterRecovery: number;
  readonly materializationCountBeforeRecovery: number;
  readonly materializationCountAfterRecovery: number;
  readonly materializationCount: number;
  readonly duplicateMaterializationCount: 0;
  readonly leakageScan: LeakageScan;
  readonly roleReceipts: readonly RoleReceipt[];
  readonly residuals: Scenario["residuals"];
}

interface AdversarialCase {
  readonly attackId: string;
  readonly attackClass: string;
  readonly targetField: string;
  readonly correctlySignedRequest: true;
  readonly request: SyntheticCustodyReleaseRequest;
  readonly crossScenarioSwap: boolean;
  readonly evaluatorPlaintextMounted: false;
  readonly evaluatorReceiptProduced: false;
  readonly denialCode: string;
  readonly denialTransitionHash: string;
  readonly cleanupReason:
    | "cryptographic_rejection"
    | "capability_rejection";
  readonly cleanupTransitionHash: string;
  readonly descriptor: SyntheticCustodyDescriptor;
  readonly transitions:
    readonly SyntheticCustodyTransition[];
  readonly leakageScan: LeakageScan;
  readonly roleReceipts: readonly RoleReceipt[];
  readonly residuals: Scenario["residuals"];
}

interface Evidence {
  readonly roleUids: typeof ROLE_UIDS;
  readonly hostRoleUids: Readonly<
    Record<BoundaryRole, number>
  >;
  readonly keyOwners: typeof ROLE_UIDS;
  readonly publicPrincipals: Readonly<
    Record<BoundaryRole, PublicPrincipal>
  >;
  readonly contract: EvaluatorVaultContract;
  readonly binding: {
    readonly taskHandleCommitment: string;
    readonly authorCommitmentHash: string;
    readonly includedTransitionHash: string;
    readonly admittedVaultStateHead: string;
    readonly unlockCapabilityHash: string;
  };
  readonly reviewerBoundary: {
    readonly inputFiles: readonly string[];
  };
  readonly scenarios: readonly Scenario[];
  readonly crashCases: readonly CrashCase[];
  readonly adversarialCases:
    readonly AdversarialCase[];
  readonly scorerProjection: CommitmentProjection;
  readonly promoterProjection: CommitmentProjection;
  readonly finalAudit: FinalAudit;
  readonly roleReceipts: readonly RoleReceipt[];
  readonly providerUsed: false;
  readonly researchEvidenceAuthorized: false;
  readonly promotionAuthorized: false;
  readonly repositoryPushPerformed: false;
  readonly evidenceHash: string;
}

function asEvidence(value: JsonValue): Evidence {
  return value as unknown as Evidence;
}

function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

function expectedPrincipal(
  contract: EvaluatorVaultContract,
  role: BoundaryRole,
): PublicPrincipal {
  switch (role) {
    case "protocol_author":
      return contract.principalMatrix.protocolAuthor;
    case "benchmark_author":
      return contract.principalMatrix.benchmarkAuthor;
    case "benchmark_reviewer":
      return contract.principalMatrix.benchmarkReviewer;
    case "vault":
      return contract.principalMatrix.vault;
    case "evaluator":
      return contract.principalMatrix.evaluator;
    case "scorer":
      return contract.principalMatrix.scorer;
    case "promoter":
      return contract.principalMatrix.promoter;
    case "audit_store":
      return contract.principalMatrix.audit;
  }
}

function verifySignedHashRecord(input: {
  readonly record: SignedRecord;
  readonly expected: PublicPrincipal;
  readonly identity: PrincipalIdentity;
  readonly schemas: SchemaRegistry;
  readonly schemaId: string;
}): void {
  input.schemas.validate(
    input.schemaId,
    input.record as unknown as JsonValue,
  );
  const {
    recordHash,
    publicPrincipal,
    attestation,
  } = input.record;
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
  assert.equal(
    canonicalize(
      input.identity as unknown as JsonValue,
    ),
    canonicalize(
      input.expected.identity as unknown as JsonValue,
    ),
  );
  const principals = new PrincipalRegistry();
  principals.register(publicPrincipal);
  principals.verify(
    input.identity,
    {
      ...core,
      recordHash,
      publicPrincipal,
    } as unknown as JsonValue,
    attestation,
  );
}

function verifyRoleReceipt(input: {
  readonly receipt: RoleReceipt;
  readonly evidence: Evidence;
  readonly schemas: SchemaRegistry;
}): void {
  input.schemas.validate(
    ROLE_RECEIPT_SCHEMA_ID,
    input.receipt as unknown as JsonValue,
  );
  const {
    receiptHash,
    publicPrincipal,
    attestation,
  } = input.receipt;
  const core = {
    ...(input.receipt as unknown as Record<
      string,
      JsonValue
    >),
  };
  delete core["receiptHash"];
  delete core["publicPrincipal"];
  delete core["attestation"];
  assert.equal(
    receiptHash,
    sha256(core as unknown as JsonValue),
  );
  const expected = expectedPrincipal(
    input.evidence.contract,
    input.receipt.role,
  );
  assert.equal(
    canonicalize(
      publicPrincipal as unknown as JsonValue,
    ),
    canonicalize(expected as unknown as JsonValue),
  );
  assert.equal(
    canonicalize(
      input.receipt.producer as unknown as JsonValue,
    ),
    canonicalize(
      expected.identity as unknown as JsonValue,
    ),
  );
  assert.equal(
    input.receipt.process.uid,
    ROLE_UIDS[input.receipt.role],
  );
  assert.equal(
    input.receipt.process.gid,
    ROLE_UIDS[input.receipt.role],
  );
  const principals = new PrincipalRegistry();
  principals.register(publicPrincipal);
  principals.verify(
    input.receipt.producer,
    {
      ...core,
      receiptHash,
      publicPrincipal,
    } as unknown as JsonValue,
    attestation,
  );
}

function verifyRoleProbe(input: {
  readonly probe: RoleProbe;
  readonly role: BoundaryRole;
  readonly principal: PublicPrincipal;
}): void {
  assert.equal(input.probe.role, input.role);
  assert.equal(input.probe.uid, ROLE_UIDS[input.role]);
  assert.equal(input.probe.gid, ROLE_UIDS[input.role]);
  assert.equal(input.probe.forbiddenReadsDenied, 4);
  assert.equal(input.probe.forbiddenWritesDenied, 4);
  assert.equal(
    verify(
      null,
      Buffer.from(input.probe.challenge, "utf8"),
      createPublicKey(input.principal.publicKeyPem),
      Buffer.from(
        input.probe.challengeSignature,
        "base64url",
      ),
    ),
    true,
    `${input.role} custody denial probe signature failed`,
  );
}

function verifyDescriptorBindings(input: {
  readonly descriptor: SyntheticCustodyDescriptor;
  readonly evidence: Evidence;
  readonly schemas: SchemaRegistry;
}): void {
  for (const key of [
    "taskHandleCommitment",
    "authorCommitmentHash",
    "includedTransitionHash",
    "admittedVaultStateHead",
    "unlockCapabilityHash",
  ] as const) {
    assert.equal(
      input.descriptor[key],
      input.evidence.binding[key],
    );
  }
  assert.equal(
    input.descriptor.deliveryGuarantee,
    "at_most_once_abort_on_uncertain_delivery",
  );
  verifySyntheticCustodyDescriptor({
    record: input.descriptor,
    contract: input.evidence.contract,
    schemas: input.schemas,
  });
}

function verifyTransitionSequence(input: {
  readonly transitions:
    readonly SyntheticCustodyTransition[];
  readonly descriptor: SyntheticCustodyDescriptor;
  readonly evidence: Evidence;
  readonly schemas: SchemaRegistry;
}): void {
  let priorTransitionHash: string | null = null;
  let priorState: string | null = null;
  for (const [index, transition] of
    input.transitions.entries()) {
    assert.equal(
      transition.priorTransitionHash,
      priorTransitionHash,
    );
    assert.equal(
      transition.deliveryGuarantee,
      "at_most_once_abort_on_uncertain_delivery",
    );
    if (index === 0) {
      assert.equal(transition.action, "seal");
      assert.equal(transition.stateBefore, null);
    } else {
      assert.equal(transition.stateBefore, priorState);
    }
    verifySyntheticCustodyTransition({
      record: transition,
      descriptor: input.descriptor,
      priorTransitionHash,
      priorJournalHead: transition.priorJournalHead,
      contract: input.evidence.contract,
      schemas: input.schemas,
    });
    priorTransitionHash = transition.recordHash;
    priorState = transition.stateAfter;
  }
}

function verifyLeakageScan(input: {
  readonly scan: LeakageScan;
  readonly descriptor: SyntheticCustodyDescriptor;
  readonly evidence: Evidence;
  readonly schemas: SchemaRegistry;
}): void {
  verifySignedHashRecord({
    record: input.scan,
    expected:
      input.evidence.contract.principalMatrix.vault,
    identity: input.scan.scannedBy,
    schemas: input.schemas,
    schemaId: LEAKAGE_SCAN_SCHEMA_ID,
  });
  assert.equal(
    input.scan.descriptorHash,
    input.descriptor.recordHash,
  );
  assert.equal(
    input.scan.plaintextCommitment,
    input.descriptor.plaintextCommitment,
  );
  assert.equal(
    input.scan.keyCommitment,
    input.descriptor.keyCommitment,
  );
  for (const count of [
    input.scan.repositoryPayloadMatches,
    input.scan.repositoryKeyMatches,
    input.scan.retainedStatePayloadMatches,
    input.scan.retainedStateKeyMatches,
    input.scan.logPayloadMatches,
    input.scan.logKeyMatches,
    input.scan.processArgumentPayloadMatches,
    input.scan.processArgumentKeyMatches,
  ]) {
    assert.equal(count, 0);
  }
  assert.equal(
    input.scan.keyFilePresentAfterCleanup,
    false,
  );
  assert.equal(
    input.scan.ciphertextFilePresentAfterCleanup,
    false,
  );
  assert.equal(
    input.scan.plaintextFilePresentAfterCleanup,
    false,
  );
}

function verifyScenario(input: {
  readonly scenario: Scenario;
  readonly evidence: Evidence;
  readonly schemas: SchemaRegistry;
}): void {
  const { scenario, evidence, schemas } = input;
  const {
    descriptor,
    capability,
    request,
  } = scenario;
  assert.equal(scenario.custodyId, descriptor.custodyId);
  verifyDescriptorBindings({
    descriptor,
    evidence,
    schemas,
  });
  verifySyntheticCustodyCapability({
    record: capability,
    descriptor,
    now: capability.issuedAt,
    contract: evidence.contract,
    schemas,
  });
  verifySyntheticCustodyReleaseRequest({
    record: request,
    descriptor,
    now: capability.issuedAt,
    contract: evidence.contract,
    schemas,
  });

  verifyTransitionSequence({
    transitions: scenario.transitions,
    descriptor,
    evidence,
    schemas,
  });
  const durableFreshDenials =
    scenario.transitions.filter(
      (transition) =>
        transition.denialReason ===
        "consumed_capability_reuse",
    );
  const actions = scenario.transitions
    .filter(
      (transition) =>
        transition.denialReason !==
        "consumed_capability_reuse",
    )
    .map((transition) => transition.action);
  assert.deepEqual(
    actions,
    scenario.scenario === "capability_rejection"
      ? [
          "seal",
          "deny_release",
          "begin_cleanup",
          "cleanup",
        ]
      : [
          "seal",
          "reserve_release",
          "begin_materialization",
          "begin_cleanup",
          "cleanup",
        ],
  );
  assert.equal(
    scenario.sealResult.transition.recordHash,
    scenario.transitions[0]!.recordHash,
  );
  const cleanupTransitions =
    scenario.transitions.filter(
      (transition) =>
        transition.action === "cleanup",
    );
  assert.equal(cleanupTransitions.length, 1);
  assert.equal(
    scenario.cleanupResult.transition.recordHash,
    cleanupTransitions[0]!.recordHash,
  );
  assert.equal(scenario.cleanupResult.state, "cleaned");

  if (scenario.scenario === "capability_rejection") {
    assert.equal(scenario.reserveResult.ok, false);
    assert.equal(
      scenario.reserveResult.failure?.code,
      "AUTHORIZATION_DENIED",
    );
    assert.equal(scenario.materializeResult, null);
    assert.equal(scenario.consumerReceipt, null);
  } else {
    assert.equal(scenario.reserveResult.ok, true);
    assert.equal(
      scenario.reserveResult.transition.recordHash,
      scenario.transitions[1]!.recordHash,
    );
    if (scenario.scenario === "vault_crash") {
      assert.equal(scenario.materializeResult, null);
    } else {
      assert.equal(
        scenario.materializeResult?.transition.recordHash,
        scenario.transitions[2]!.recordHash,
      );
    }
  }

  if (scenario.consumerReceipt !== null) {
    const materialization = scenario.transitions.find(
      (transition) =>
        transition.action === "begin_materialization",
    );
    assert.ok(materialization?.releaseId);
    verifySyntheticCustodyEvaluatorReceipt({
      record: scenario.consumerReceipt,
      descriptor,
      releaseId: materialization.releaseId,
      contract: evidence.contract,
      schemas,
    });
  }
  assert.equal(
    scenario.consumer.receiptProduced,
    scenario.consumerReceipt !== null,
  );

  verifyLeakageScan({
    scan: scenario.leakageScan,
    descriptor,
    evidence,
    schemas,
  });

  for (const receipt of scenario.roleReceipts) {
    verifyRoleReceipt({ receipt, evidence, schemas });
  }
  if (scenario.consumerRoleReceipt !== null) {
    assert.ok(
      scenario.roleReceipts.some(
        (receipt) =>
          receipt.receiptHash ===
          scenario.consumerRoleReceipt!.receiptHash,
      ),
    );
  }
  if (scenario.scenario === "normal") {
    assert.ok(scenario.roleDenials);
    for (const role of Object.keys(
      scenario.roleDenials,
    ) as Exclude<BoundaryRole, "vault">[]) {
      verifyRoleProbe({
        probe: scenario.roleDenials[role],
        role,
        principal: evidence.publicPrincipals[role],
      });
    }
    assert.ok(scenario.exactRetry);
    assert.equal(
      scenario.exactRetry.reservationTransitionHash,
      scenario.reserveResult.transition.recordHash,
    );
  } else {
    assert.equal(scenario.roleDenials, null);
    assert.equal(scenario.exactRetry, null);
  }
  for (const reuse of scenario.freshCapabilityReuse) {
    assert.equal(
      reuse.request.requestHash,
      reuse.requestHash,
    );
    assert.equal(
      reuse.request.senderSequence,
      reuse.senderSequence,
    );
    assert.equal(reuse.request.nonce, reuse.nonce);
    verifySyntheticCustodyReleaseRequest({
      record: reuse.request,
      descriptor,
      now: reuse.request.requestedAt,
      contract: evidence.contract,
      schemas,
    });
    assert.equal(
      reuse.transitionCountAfter,
      reuse.transitionCountBefore + 1,
    );
    assert.equal(
      reuse.exactRetryTransitionCountBefore,
      reuse.transitionCountAfter,
    );
    assert.equal(
      reuse.exactRetryTransitionCountAfter,
      reuse.exactRetryTransitionCountBefore,
    );
    assert.equal(
      reuse.exactRetryTransitionHash,
      reuse.denialTransitionHash,
    );
    const denial = scenario.transitions.find(
      (transition) =>
        transition.recordHash ===
        reuse.denialTransitionHash,
    );
    assert.ok(denial);
    assert.equal(denial.action, "deny_release");
    assert.equal(denial.decision, "denied");
    assert.equal(
      denial.denialReason,
      "consumed_capability_reuse",
    );
    assert.equal(
      denial.requestCommitment,
      sha256(reuse.request as unknown as JsonValue),
    );
    assert.deepEqual(
      denial.requestActor,
      reuse.request.actor,
    );
    assert.equal(
      denial.capabilityCommitment,
      reuse.request.capability.capabilityHash,
    );
    assert.equal(
      denial.stateBefore,
      denial.stateAfter,
    );
    assert.equal(reuse.reservationCount, 1);
    assert.ok(reuse.materializationCount <= 1);
  }
  assert.equal(
    durableFreshDenials.length,
    scenario.freshCapabilityReuse.length,
  );
}

function verifyCrashCase(input: {
  readonly crash: CrashCase;
  readonly evidence: Evidence;
  readonly schemas: SchemaRegistry;
}): void {
  const { crash, evidence, schemas } = input;
  verifyDescriptorBindings({
    descriptor: crash.descriptor,
    evidence,
    schemas,
  });
  verifyTransitionSequence({
    transitions: crash.transitions,
    descriptor: crash.descriptor,
    evidence,
    schemas,
  });
  const expectedReason = {
    after_reservation_commit:
      "reservation_abandoned",
    after_deny_release: "capability_rejection",
    after_materialization_start:
      "materialization_prewrite_abandoned",
    after_deny_materialization:
      "cryptographic_rejection",
    after_plaintext_delete:
      "cleanup_interrupted_after_plaintext_delete",
    after_private_delete:
      "cleanup_interrupted_after_private_delete",
    after_cleanup_commit:
      "cleanup_acknowledgement_loss",
  } as const;
  assert.equal(
    crash.cleanupReason,
    expectedReason[crash.boundary],
  );
  const expectedActions = {
    after_reservation_commit: [
      "seal",
      "reserve_release",
      "begin_cleanup",
      "cleanup",
    ],
    after_deny_release: [
      "seal",
      "deny_release",
      "begin_cleanup",
      "cleanup",
    ],
    after_materialization_start: [
      "seal",
      "reserve_release",
      "begin_materialization",
      "begin_cleanup",
      "cleanup",
    ],
    after_deny_materialization: [
      "seal",
      "reserve_release",
      "begin_materialization",
      "deny_materialization",
      "begin_cleanup",
      "cleanup",
    ],
    after_plaintext_delete: [
      "seal",
      "reserve_release",
      "begin_materialization",
      "begin_cleanup",
      "cleanup",
    ],
    after_private_delete: [
      "seal",
      "reserve_release",
      "begin_materialization",
      "begin_cleanup",
      "cleanup",
    ],
    after_cleanup_commit: [
      "seal",
      "reserve_release",
      "begin_materialization",
      "begin_cleanup",
      "cleanup",
    ],
  } as const;
  assert.deepEqual(
    crash.transitions.map(
      (transition) => transition.action,
    ),
    expectedActions[crash.boundary],
  );
  assert.equal(crash.crashReturnCode === 0, false);
  assert.equal(
    crash.materializationCount,
    crash.boundary === "after_reservation_commit" ||
      crash.boundary === "after_deny_release"
      ? 0
      : 1,
  );
  assert.equal(
    crash.reservationCountBeforeRecovery,
    crash.reservationCountAfterRecovery,
  );
  assert.equal(
    crash.materializationCountBeforeRecovery,
    crash.materializationCountAfterRecovery,
  );
  assert.equal(
    crash.reservationCountAfterRecovery,
    crash.boundary === "after_deny_release" ? 0 : 1,
  );
  assert.equal(
    crash.denialCount,
    crash.boundary === "after_deny_release" ||
      crash.boundary ===
        "after_deny_materialization"
      ? 1
      : 0,
  );
  if (crash.boundary === "after_deny_release") {
    const denial = crash.transitions[1]!;
    assert.equal(
      denial.denialReason,
      "release_request_rejection",
    );
  }
  if (
    crash.boundary === "after_deny_materialization"
  ) {
    const denial = crash.transitions[3]!;
    assert.equal(
      denial.denialReason,
      "cryptographic_rejection",
    );
  }
  assert.equal(
    crash.terminalTransitionHash,
    crash.transitions.at(-1)!.recordHash,
  );
  assert.equal(
    crash.transitions.at(-1)!.cleanupReason,
    crash.cleanupReason,
  );
  verifyLeakageScan({
    scan: crash.leakageScan,
    descriptor: crash.descriptor,
    evidence,
    schemas,
  });
  assert.deepEqual(crash.residuals, {
    keyFilePresent: false,
    ciphertextFilePresent: false,
    plaintextFilePresent: false,
  });
  for (const receipt of crash.roleReceipts) {
    verifyRoleReceipt({ receipt, evidence, schemas });
  }
}

function verifyAdversarialCase(input: {
  readonly attack: AdversarialCase;
  readonly evidence: Evidence;
  readonly schemas: SchemaRegistry;
}): void {
  const { attack, evidence, schemas } = input;
  verifyDescriptorBindings({
    descriptor: attack.descriptor,
    evidence,
    schemas,
  });
  verifySyntheticCustodyReleaseRequestAttestation({
    record: attack.request,
    contract: evidence.contract,
    schemas,
  });
  verifySyntheticCustodyCapabilityAttestation({
    record: attack.request.capability,
    contract: evidence.contract,
    schemas,
  });
  const capabilityAttack =
    attack.attackId.startsWith("capability.");
  if (capabilityAttack) {
    let failureCode: string | null = null;
    try {
      verifySyntheticCustodyReleaseRequest({
        record: attack.request,
        descriptor: attack.descriptor,
        now: attack.request.requestedAt,
        contract: evidence.contract,
        schemas,
      });
    } catch (error) {
      failureCode = asHarnessError(error).code;
    }
    assert.equal(
      failureCode,
      "AUTHORIZATION_DENIED",
    );
  } else {
    verifySyntheticCustodyReleaseRequest({
      record: attack.request,
      descriptor: attack.descriptor,
      now: attack.request.requestedAt,
      contract: evidence.contract,
      schemas,
    });
  }
  verifyTransitionSequence({
    transitions: attack.transitions,
    descriptor: attack.descriptor,
    evidence,
    schemas,
  });
  assert.deepEqual(
    attack.transitions.map(
      (transition) => transition.action,
    ),
    capabilityAttack
      ? [
          "seal",
          "deny_release",
          "begin_cleanup",
          "cleanup",
        ]
      : [
          "seal",
          "reserve_release",
          "begin_materialization",
          "deny_materialization",
          "begin_cleanup",
          "cleanup",
        ],
  );
  const denial = attack.transitions.find(
    (transition) =>
      transition.action ===
        (capabilityAttack
          ? "deny_release"
          : "deny_materialization"),
  );
  assert.ok(denial);
  assert.equal(
    denial.recordHash,
    attack.denialTransitionHash,
  );
  assert.equal(denial.reasonCode, attack.denialCode);
  assert.equal(
    attack.transitions.at(-1)!.recordHash,
    attack.cleanupTransitionHash,
  );
  assert.equal(
    attack.transitions.at(-1)!.cleanupReason,
    attack.cleanupReason,
  );
  assert.equal(
    attack.cleanupReason,
    capabilityAttack
      ? "capability_rejection"
      : "cryptographic_rejection",
  );
  assert.equal(
    attack.crossScenarioSwap,
    attack.attackId === "envelope.envelope_swap" ||
      attack.attackId === "capability.custodyId",
  );
  verifyLeakageScan({
    scan: attack.leakageScan,
    descriptor: attack.descriptor,
    evidence,
    schemas,
  });
  assert.deepEqual(attack.residuals, {
    keyFilePresent: false,
    ciphertextFilePresent: false,
    plaintextFilePresent: false,
  });
  for (const receipt of attack.roleReceipts) {
    verifyRoleReceipt({ receipt, evidence, schemas });
  }
}

async function main(): Promise<void> {
  const evidencePath = path.resolve(
    process.argv[2] ??
      "architect/evidence/synthetic-custody-os-boundary/evidence.json",
  );
  const schemas = await SchemaRegistry.load(
    path.resolve("schemas"),
  );
  const parsed = parseStrictJson(
    await readFile(evidencePath, "utf8"),
  );
  schemas.validate(EVIDENCE_SCHEMA_ID, parsed);
  const evidence = asEvidence(parsed);

  verifyEvaluatorVaultContract({
    record: evidence.contract,
    schemas,
  });
  assert.deepEqual(evidence.roleUids, ROLE_UIDS);
  assert.deepEqual(evidence.keyOwners, ROLE_UIDS);
  assert.equal(
    new Set(Object.values(evidence.hostRoleUids)).size,
    8,
  );
  for (const role of Object.keys(
    ROLE_UIDS,
  ) as BoundaryRole[]) {
    assert.equal(
      canonicalize(
        evidence.publicPrincipals[
          role
        ] as unknown as JsonValue,
      ),
      canonicalize(
        expectedPrincipal(
          evidence.contract,
          role,
        ) as unknown as JsonValue,
      ),
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
  assert.deepEqual(
    evidence.scenarios.map((entry) => entry.scenario),
    SCENARIOS,
  );
  assert.equal(
    new Set(
      evidence.scenarios.map(
        (entry) => entry.descriptor.keyCommitment,
      ),
    ).size,
    SCENARIOS.length,
  );
  assert.equal(
    new Set(
      evidence.scenarios.map(
        (entry) =>
          entry.descriptor.ciphertextCommitment,
      ),
    ).size,
    SCENARIOS.length,
  );
  assert.equal(
    new Set(
      evidence.scenarios.map(
        (entry) =>
          entry.descriptor.plaintextCommitment,
      ),
    ).size,
    1,
  );
  for (const scenario of evidence.scenarios) {
    verifyScenario({ scenario, evidence, schemas });
  }
  assert.deepEqual(
    evidence.crashCases.map(
      (entry) => entry.boundary,
    ),
    CRASH_BOUNDARIES,
  );
  for (const crash of evidence.crashCases) {
    verifyCrashCase({ crash, evidence, schemas });
  }
  assert.deepEqual(
    evidence.adversarialCases.map(
      (entry) => entry.attackId,
    ),
    ADVERSARIAL_ATTACKS,
  );
  for (const attack of evidence.adversarialCases) {
    verifyAdversarialCase({
      attack,
      evidence,
      schemas,
    });
  }
  assert.deepEqual(
    evidence.scenarios
      .flatMap(
        (scenario) =>
          scenario.freshCapabilityReuse,
      )
      .map((reuse) => reuse.condition)
      .sort(),
    [
      "cleanup_completion",
      "normal_completion",
      "response_loss",
      "vault_restart",
    ],
  );

  verifySignedHashRecord({
    record: evidence.scorerProjection,
    expected: evidence.contract.principalMatrix.scorer,
    identity: evidence.scorerProjection.observedBy,
    schemas,
    schemaId: PROJECTION_SCHEMA_ID,
  });
  verifySignedHashRecord({
    record: evidence.promoterProjection,
    expected: evidence.contract.principalMatrix.promoter,
    identity: evidence.promoterProjection.observedBy,
    schemas,
    schemaId: PROJECTION_SCHEMA_ID,
  });
  assert.equal(
    evidence.scorerProjection.sourceReceiptHash,
    evidence.scenarios[0]!.consumerReceipt!.recordHash,
  );
  assert.equal(
    evidence.promoterProjection.sourceReceiptHash,
    evidence.scorerProjection.recordHash,
  );
  assert.equal(
    evidence.scorerProjection.cleanupTransitionHash,
    evidence.scenarios[0]!.cleanupResult.transition
      .recordHash,
  );
  assert.equal(
    evidence.promoterProjection.cleanupTransitionHash,
    evidence.scorerProjection.cleanupTransitionHash,
  );

  for (const receipt of evidence.roleReceipts) {
    verifyRoleReceipt({ receipt, evidence, schemas });
  }
  assert.deepEqual(
    sortedUnique(
      evidence.roleReceipts.map(
        (receipt) => receipt.receiptHash,
      ),
    ),
    evidence.roleReceipts
      .map((receipt) => receipt.receiptHash)
      .sort(),
    "top-level role receipts are not unique",
  );

  verifySignedHashRecord({
    record: evidence.finalAudit,
    expected: evidence.contract.principalMatrix.audit,
    identity: evidence.finalAudit.finalizedBy,
    schemas,
    schemaId: FINAL_AUDIT_SCHEMA_ID,
  });
  assert.deepEqual(
    evidence.finalAudit.descriptorHashes,
    sortedUnique(
      [
        ...evidence.scenarios,
        ...evidence.crashCases,
        ...evidence.adversarialCases,
      ].map((item) => item.descriptor.recordHash),
    ),
  );
  assert.deepEqual(
    evidence.finalAudit.transitionHashes,
    sortedUnique(
      [
        ...evidence.scenarios,
        ...evidence.crashCases,
        ...evidence.adversarialCases,
      ].flatMap(
        (item) =>
          item.transitions.map(
            (transition) => transition.recordHash,
          ),
      ),
    ),
  );
  assert.deepEqual(
    evidence.finalAudit.leakageScanHashes,
    sortedUnique(
      [
        ...evidence.scenarios,
        ...evidence.crashCases,
        ...evidence.adversarialCases,
      ].map((item) => item.leakageScan.recordHash),
    ),
  );
  assert.deepEqual(
    evidence.finalAudit.roleReceiptHashes,
    sortedUnique(
      evidence.roleReceipts
        .filter(
          (receipt) =>
            receipt.action !== "finalize_audit",
        )
        .map((receipt) => receipt.receiptHash),
    ),
  );
  assert.equal(
    evidence.finalAudit.scorerProjectionHash,
    evidence.scorerProjection.recordHash,
  );
  assert.equal(
    evidence.finalAudit.promoterProjectionHash,
    evidence.promoterProjection.recordHash,
  );

  const { evidenceHash, ...evidenceCore } = evidence;
  assert.equal(
    evidenceHash,
    sha256(evidenceCore as unknown as JsonValue),
  );
  const serialized = canonicalBytes(
    evidence as unknown as JsonValue,
  ).toString("utf8");
  assert.equal(
    serialized.includes(
      `opaque-task-sha256:${"d".repeat(64)}`,
    ),
    false,
  );
  assert.equal(
    serialized.includes("BEGIN PRIVATE KEY"),
    false,
  );
  assert.equal(
    serialized.includes('"ciphertext":'),
    false,
  );
  assert.equal(
    serialized.includes('"authenticationTag":'),
    false,
  );
  assert.equal(evidence.providerUsed, false);
  assert.equal(
    evidence.researchEvidenceAuthorized,
    false,
  );
  assert.equal(evidence.promotionAuthorized, false);
  assert.equal(
    evidence.repositoryPushPerformed,
    false,
  );

  process.stdout.write(
    canonicalBytes({
      verified: true,
      evidenceHash,
      scenarioCount: evidence.scenarios.length,
      crashCaseCount: evidence.crashCases.length,
      adversarialCaseCount:
        evidence.adversarialCases.length,
      transitionCount:
        evidence.finalAudit.transitionHashes.length,
      roleReceiptCount:
        evidence.roleReceipts.length,
      providerUsed: false,
      researchEvidenceAuthorized: false,
      promotionAuthorized: false,
      repositoryPushPerformed: false,
    }).toString("utf8") + "\n",
  );
}

await main();
