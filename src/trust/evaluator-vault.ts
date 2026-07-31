import {
  canonicalize,
  sha256,
  sha256Text,
  type JsonValue,
} from "../core/canonical.js";
import {
  HarnessError,
  asHarnessError,
  assertCondition,
  type HarnessErrorCode,
} from "../core/errors.js";
import {
  SystemClock,
  type Clock,
} from "../core/determinism.js";
import {
  SCHEMA_BASE_URL,
  type SchemaRegistry,
} from "../contracts/schema-registry.js";
import {
  CasAppendOnlyLog,
  type CasAppendOnlyRecord,
  type CasAppendPhase,
} from "../storage/cas-append-only-log.js";
import {
  HistoricalPublicExposurePolicy,
} from "../governance/historical-publication-exposure.js";
import {
  PrincipalRegistry,
  type Attestation,
  type PrincipalIdentity,
  type PrincipalRole,
  type PrincipalSigner,
  type PublicPrincipal,
} from "./identity.js";
import {
  allowedRolesForVaultAction,
  verifyEvaluatorVaultContract,
  type EvaluatorVaultContract,
  type VaultAction,
} from "./evaluator-vault-contract.js";
import {
  verifyIndependentAuthorshipTransition,
  type IndependentAuthorshipTransition,
} from "./independent-authorship.js";
import {
  VaultWriterLease,
  type VaultWriterLeaseHandle,
} from "./vault-writer-lease.js";

export const OPAQUE_TASK_CAPABILITY_SCHEMA_ID =
  `${SCHEMA_BASE_URL}opaque-task-capability.schema.json`;
export const VAULT_ACCESS_REQUEST_SCHEMA_ID =
  `${SCHEMA_BASE_URL}vault-access-request.schema.json`;
export const VAULT_ACCESS_RECORD_SCHEMA_ID =
  `${SCHEMA_BASE_URL}vault-access-record.schema.json`;
export const VAULT_STATE_TRANSITION_SCHEMA_ID =
  `${SCHEMA_BASE_URL}vault-state-transition.schema.json`;
export const VAULT_WRITER_FENCE_SCHEMA_ID =
  `${SCHEMA_BASE_URL}vault-writer-fence.schema.json`;

export type VaultTaskState =
  | "created"
  | "sealed"
  | "unlocked"
  | "evaluated"
  | "scored";

export type VaultReleaseClass =
  | "none"
  | "opaque_handle_commitments"
  | "unlock_authorization"
  | "evaluation_commitment"
  | "score_commitment"
  | "access_chain_head";

export interface OpaqueTaskCapability {
  readonly schemaVersion: 1;
  readonly recordType: "opaque_task_capability";
  readonly capabilityId: string;
  readonly protocolId: string;
  readonly contractId: string;
  readonly contractHash: string;
  readonly taskHandle: string;
  readonly authorshipRecordHash: string;
  readonly recipient: PrincipalIdentity;
  readonly allowedAction: "unlock";
  readonly singleUse: true;
  readonly bodyAccess:
    "none_in_body_free_contract_prototype";
  readonly issuedAt: string;
  readonly expiresAt: string;
  readonly nonce: string;
  readonly issuedBy: PrincipalIdentity;
  readonly capabilityHash: string;
  readonly publicPrincipal: PublicPrincipal;
  readonly attestation: Attestation;
}

export interface VaultAccessRequest {
  readonly schemaVersion: 1;
  readonly recordType: "vault_access_request";
  readonly requestId: string;
  readonly protocolId: string;
  readonly contractId: string;
  readonly contractHash: string;
  readonly action: VaultAction;
  readonly taskHandle: string | null;
  readonly capability: OpaqueTaskCapability | null;
  readonly subjectCommitment: string | null;
  readonly senderSequence: number;
  readonly nonce: string;
  readonly requestedAt: string;
  readonly actor: PrincipalIdentity;
  readonly requestHash: string;
  readonly publicPrincipal: PublicPrincipal;
  readonly attestation: Attestation;
}

export interface VaultRelease {
  readonly releaseClass: VaultReleaseClass;
  readonly recipientRole: PrincipalRole | null;
  readonly fieldNames: readonly string[];
  readonly taskBodyReleased: false;
  readonly rawTaskHandleReleased: false;
  readonly authorIdentityReleased: false;
  readonly candidateIdentityReleased: false;
}

export interface VaultAccessRecord {
  readonly schemaVersion: 1;
  readonly recordType: "vault_access_record";
  readonly accessRecordId: string;
  readonly protocolId: string;
  readonly requestedProtocolId: string;
  readonly contractId: string;
  readonly contractHash: string;
  readonly requestIdCommitment: string;
  readonly claimedRequestHash: string;
  readonly observedRequestHash: string;
  readonly action: VaultAction;
  readonly taskHandleCommitment: string | null;
  readonly actorRole: PrincipalRole;
  readonly actorIdentityCommitment: string;
  readonly actorKeyIdCommitment: string;
  readonly senderSequence: number;
  readonly nonceCommitment: string;
  readonly decision: "allowed" | "denied";
  readonly reasonCode: string;
  readonly stateBefore: VaultTaskState | null;
  readonly stateAfter: VaultTaskState | null;
  readonly release: VaultRelease;
  readonly occurredAt: string;
  readonly recordedBy: PrincipalIdentity;
  readonly recordHash: string;
  readonly publicPrincipal: PublicPrincipal;
  readonly attestation: Attestation;
}

export interface VaultAccessOutcome {
  readonly accessRecord: VaultAccessRecord;
  readonly releasedCommitments: readonly string[];
}

export interface VaultStateTransitionRecord {
  readonly schemaVersion: 1;
  readonly recordType: "vault_state_transition";
  readonly transitionId: string;
  readonly protocolId: string;
  readonly contractId: string;
  readonly contractHash: string;
  readonly requestCommitment: string;
  readonly requestIdCommitment: string;
  readonly action: VaultAction;
  readonly taskHandleCommitment: string | null;
  readonly authorshipRecordHash: string | null;
  readonly priorTaskStateRecordHash: string | null;
  readonly priorVaultLedgerHead: string | null;
  readonly leaseOwnerCommitment: string;
  readonly leaseEpoch: number;
  readonly leaseRecordHash: string;
  readonly leaseJournalHead: string;
  readonly actorRole: PrincipalRole;
  readonly actorIdentityCommitment: string;
  readonly actorKeyIdCommitment: string;
  readonly capabilityCommitment: string | null;
  readonly inputCommitment: string | null;
  readonly resultCommitment: string | null;
  readonly releasedCommitments: readonly string[];
  readonly decision: "allowed" | "denied";
  readonly reasonCode: string;
  readonly stateBefore: VaultTaskState | null;
  readonly stateAfter: VaultTaskState | null;
  readonly taskStateSuccessor: boolean;
  readonly accessRecord: VaultAccessRecord;
  readonly occurredAt: string;
  readonly committedAt: string;
  readonly recordedBy: PrincipalIdentity;
  readonly recordHash: string;
  readonly publicPrincipal: PublicPrincipal;
  readonly attestation: Attestation;
}

export interface VaultWriterFenceRecord {
  readonly schemaVersion: 1;
  readonly recordType: "vault_writer_fence";
  readonly fenceId: string;
  readonly protocolId: string;
  readonly contractId: string;
  readonly contractHash: string;
  readonly priorVaultLedgerHead: string | null;
  readonly leaseOwnerCommitment: string;
  readonly leaseEpoch: number;
  readonly leaseRecordHash: string;
  readonly leaseJournalHead: string;
  readonly fencedAt: string;
  readonly recordedBy: PrincipalIdentity;
  readonly recordHash: string;
  readonly publicPrincipal: PublicPrincipal;
  readonly attestation: Attestation;
}

export type VaultCrashPhase =
  | "before_state_append"
  | "during_state_append"
  | "after_state_publish_before_sync"
  | "after_state_sync_before_verify"
  | "after_durable_commit_before_release"
  | "after_release_before_ack";

export interface VaultAuthorshipAdmission {
  readonly included: IndependentAuthorshipTransition;
  readonly previous: IndependentAuthorshipTransition;
}

interface VaultTaskEntry {
  readonly authorshipRecordHash: string;
  readonly state: VaultTaskState;
  readonly evaluationCommitment: string | null;
  readonly scoreCommitment: string | null;
  readonly stateRecordHash: string;
}

type CapabilityCore = Omit<
  OpaqueTaskCapability,
  "capabilityHash" | "publicPrincipal" | "attestation"
>;
type CapabilitySignedBody = Omit<
  OpaqueTaskCapability,
  "attestation"
>;
type RequestCore = Omit<
  VaultAccessRequest,
  "requestHash" | "publicPrincipal" | "attestation"
>;
type RequestSignedBody = Omit<
  VaultAccessRequest,
  "attestation"
>;
type AccessRecordCore = Omit<
  VaultAccessRecord,
  "recordHash" | "publicPrincipal" | "attestation"
>;
type AccessRecordSignedBody = Omit<
  VaultAccessRecord,
  "attestation"
>;
type StateTransitionCore = Omit<
  VaultStateTransitionRecord,
  "recordHash" | "publicPrincipal" | "attestation"
>;
type StateTransitionSignedBody = Omit<
  VaultStateTransitionRecord,
  "attestation"
>;
type WriterFenceCore = Omit<
  VaultWriterFenceRecord,
  "recordHash" | "publicPrincipal" | "attestation"
>;
type WriterFenceSignedBody = Omit<
  VaultWriterFenceRecord,
  "attestation"
>;
type VaultJournalPayload =
  | VaultStateTransitionRecord
  | VaultWriterFenceRecord;

function capabilityCore(
  record: OpaqueTaskCapability,
): CapabilityCore {
  const {
    capabilityHash: _capabilityHash,
    publicPrincipal: _publicPrincipal,
    attestation: _attestation,
    ...core
  } = record;
  return core;
}

function capabilitySignedBody(
  record: OpaqueTaskCapability,
): CapabilitySignedBody {
  const { attestation: _attestation, ...body } = record;
  return body;
}

function requestCore(
  record: VaultAccessRequest,
): RequestCore {
  const {
    requestHash: _requestHash,
    publicPrincipal: _publicPrincipal,
    attestation: _attestation,
    ...core
  } = record;
  return core;
}

function requestSignedBody(
  record: VaultAccessRequest,
): RequestSignedBody {
  const { attestation: _attestation, ...body } = record;
  return body;
}

function accessRecordCore(
  record: VaultAccessRecord,
): AccessRecordCore {
  const {
    recordHash: _recordHash,
    publicPrincipal: _publicPrincipal,
    attestation: _attestation,
    ...core
  } = record;
  return core;
}

function accessRecordSignedBody(
  record: VaultAccessRecord,
): AccessRecordSignedBody {
  const { attestation: _attestation, ...body } = record;
  return body;
}

function samePublicPrincipal(
  left: PublicPrincipal,
  right: PublicPrincipal,
): boolean {
  return (
    canonicalize(left as unknown as JsonValue) ===
    canonicalize(right as unknown as JsonValue)
  );
}

function principalForAction(
  contract: EvaluatorVaultContract,
  action: VaultAction,
): PublicPrincipal {
  switch (action) {
    case "create":
      return contract.principalMatrix.benchmarkAuthor;
    case "seal":
    case "enumerate":
      return contract.principalMatrix.vault;
    case "unlock":
    case "evaluate":
      return contract.principalMatrix.evaluator;
    case "score":
      return contract.principalMatrix.scorer;
    case "audit":
      return contract.principalMatrix.audit;
  }
}

function emptyRelease(): VaultRelease {
  return {
    releaseClass: "none",
    recipientRole: null,
    fieldNames: [],
    taskBodyReleased: false,
    rawTaskHandleReleased: false,
    authorIdentityReleased: false,
    candidateIdentityReleased: false,
  };
}

function release(
  releaseClass: Exclude<VaultReleaseClass, "none">,
  recipientRole: PrincipalRole,
  fieldNames: readonly string[],
): VaultRelease {
  return {
    releaseClass,
    recipientRole,
    fieldNames: [...fieldNames].sort(),
    taskBodyReleased: false,
    rawTaskHandleReleased: false,
    authorIdentityReleased: false,
    candidateIdentityReleased: false,
  };
}

function assertOpaqueHandle(
  taskHandle: string | null,
): asserts taskHandle is string {
  assertCondition(
    taskHandle !== null &&
      /^opaque-task-sha256:[a-f0-9]{64}$/u.test(
        taskHandle,
      ),
    "SCHEMA_INVALID",
    "Vault action requires an opaque task handle",
  );
}

function assertRequestShape(
  request: VaultAccessRequest,
): void {
  const hasTask = request.taskHandle !== null;
  const hasCapability = request.capability !== null;
  const hasSubject = request.subjectCommitment !== null;
  const valid =
    (request.action === "create" &&
      hasTask &&
      !hasCapability &&
      hasSubject) ||
    (request.action === "seal" &&
      hasTask &&
      !hasCapability &&
      hasSubject) ||
    (request.action === "enumerate" &&
      !hasTask &&
      !hasCapability &&
      !hasSubject) ||
    (request.action === "unlock" &&
      hasTask &&
      hasCapability &&
      !hasSubject) ||
    (request.action === "evaluate" &&
      hasTask &&
      !hasCapability &&
      hasSubject) ||
    (request.action === "score" &&
      hasTask &&
      !hasCapability &&
      hasSubject) ||
    (request.action === "audit" &&
      !hasCapability &&
      !hasSubject);
  assertCondition(
    valid,
    "SCHEMA_INVALID",
    `Vault request fields do not match ${request.action}`,
  );
}

function parseTimestamp(value: string, label: string): number {
  const parsed = Date.parse(value);
  assertCondition(
    Number.isFinite(parsed),
    "SCHEMA_INVALID",
    `${label} is not a timestamp`,
  );
  return parsed;
}

export function createOpaqueTaskCapability(input: {
  readonly capabilityId: string;
  readonly taskHandle: string;
  readonly authorshipRecordHash: string;
  readonly issuedAt: string;
  readonly expiresAt: string;
  readonly nonce: string;
  readonly signer: PrincipalSigner;
  readonly contract: EvaluatorVaultContract;
  readonly schemas: SchemaRegistry;
}): OpaqueTaskCapability {
  verifyEvaluatorVaultContract({
    record: input.contract,
    schemas: input.schemas,
  });
  assertOpaqueHandle(input.taskHandle);
  assertCondition(
    samePublicPrincipal(
      input.signer.exportPublic(),
      input.contract.principalMatrix.vault,
    ),
    "AUTHENTICATION_FAILED",
    "Only the frozen vault key may issue unlock capabilities",
  );
  assertCondition(
    parseTimestamp(input.expiresAt, "Capability expiry") >
      parseTimestamp(input.issuedAt, "Capability issue time"),
    "SCHEMA_INVALID",
    "Capability expiry must follow issuance",
  );
  const core: CapabilityCore = {
    schemaVersion: 1,
    recordType: "opaque_task_capability",
    capabilityId: input.capabilityId,
    protocolId: input.contract.protocolId,
    contractId: input.contract.contractId,
    contractHash: input.contract.contractHash,
    taskHandle: input.taskHandle,
    authorshipRecordHash: input.authorshipRecordHash,
    recipient:
      input.contract.principalMatrix.evaluator.identity,
    allowedAction: "unlock",
    singleUse: true,
    bodyAccess:
      "none_in_body_free_contract_prototype",
    issuedAt: input.issuedAt,
    expiresAt: input.expiresAt,
    nonce: input.nonce,
    issuedBy: input.signer.identity,
  };
  const publicPrincipal = input.signer.exportPublic();
  const body: CapabilitySignedBody = {
    ...core,
    capabilityHash: sha256(core as unknown as JsonValue),
    publicPrincipal,
  };
  const record: OpaqueTaskCapability = {
    ...body,
    attestation: input.signer.attest(
      body as unknown as JsonValue,
    ),
  };
  verifyOpaqueTaskCapability({
    record,
    taskHandle: input.taskHandle,
    authorshipRecordHash: input.authorshipRecordHash,
    now: input.issuedAt,
    contract: input.contract,
    schemas: input.schemas,
  });
  return record;
}

export function verifyOpaqueTaskCapability(input: {
  readonly record: OpaqueTaskCapability;
  readonly taskHandle: string;
  readonly authorshipRecordHash: string;
  readonly now: string;
  readonly contract: EvaluatorVaultContract;
  readonly schemas: SchemaRegistry;
}): void {
  verifyEvaluatorVaultContract({
    record: input.contract,
    schemas: input.schemas,
  });
  input.schemas.validate(
    OPAQUE_TASK_CAPABILITY_SCHEMA_ID,
    input.record as unknown as JsonValue,
  );
  assertCondition(
    input.record.protocolId ===
      input.contract.protocolId &&
      input.record.contractId ===
        input.contract.contractId &&
      input.record.contractHash ===
        input.contract.contractHash,
    "PROTOCOL_MISMATCH",
    "Unlock capability belongs to another protocol contract",
  );
  assertCondition(
    input.record.taskHandle === input.taskHandle &&
      input.record.authorshipRecordHash ===
        input.authorshipRecordHash &&
      canonicalize(
        input.record.recipient as unknown as JsonValue,
      ) ===
        canonicalize(
          input.contract.principalMatrix.evaluator
            .identity as unknown as JsonValue,
        ),
    "AUTHORIZATION_DENIED",
    "Unlock capability was substituted",
  );
  assertCondition(
    canonicalize(
      input.record.issuedBy as unknown as JsonValue,
    ) ===
      canonicalize(
        input.contract.principalMatrix.vault
          .identity as unknown as JsonValue,
      ) &&
      samePublicPrincipal(
        input.record.publicPrincipal,
        input.contract.principalMatrix.vault,
      ) &&
      input.record.capabilityHash ===
        sha256(
          capabilityCore(
            input.record,
          ) as unknown as JsonValue,
        ),
    "HASH_MISMATCH",
    "Unlock capability identity or hash changed",
  );
  const now = parseTimestamp(input.now, "Capability use time");
  assertCondition(
    now >=
      parseTimestamp(
        input.record.issuedAt,
        "Capability issue time",
      ) &&
      now <=
        parseTimestamp(
          input.record.expiresAt,
          "Capability expiry",
        ),
    "DEADLINE_EXCEEDED",
    "Unlock capability is not currently valid",
  );
  const principals = new PrincipalRegistry();
  principals.register(input.record.publicPrincipal);
  principals.verify(
    input.record.issuedBy,
    capabilitySignedBody(
      input.record,
    ) as unknown as JsonValue,
    input.record.attestation,
  );
}

export function createVaultAccessRequest(input: {
  readonly requestId: string;
  readonly protocolId?: string;
  readonly contractId?: string;
  readonly contractHash?: string;
  readonly action: VaultAction;
  readonly taskHandle: string | null;
  readonly capability?: OpaqueTaskCapability | null;
  readonly subjectCommitment?: string | null;
  readonly senderSequence: number;
  readonly nonce: string;
  readonly requestedAt: string;
  readonly signer: PrincipalSigner;
  readonly contract: EvaluatorVaultContract;
  readonly schemas: SchemaRegistry;
}): VaultAccessRequest {
  const core: RequestCore = {
    schemaVersion: 1,
    recordType: "vault_access_request",
    requestId: input.requestId,
    protocolId:
      input.protocolId ?? input.contract.protocolId,
    contractId:
      input.contractId ?? input.contract.contractId,
    contractHash:
      input.contractHash ?? input.contract.contractHash,
    action: input.action,
    taskHandle: input.taskHandle,
    capability: input.capability ?? null,
    subjectCommitment:
      input.subjectCommitment ?? null,
    senderSequence: input.senderSequence,
    nonce: input.nonce,
    requestedAt: input.requestedAt,
    actor: input.signer.identity,
  };
  const publicPrincipal = input.signer.exportPublic();
  const body: RequestSignedBody = {
    ...core,
    requestHash: sha256(core as unknown as JsonValue),
    publicPrincipal,
  };
  const record: VaultAccessRequest = {
    ...body,
    attestation: input.signer.attest(
      body as unknown as JsonValue,
    ),
  };
  input.schemas.validate(
    VAULT_ACCESS_REQUEST_SCHEMA_ID,
    record as unknown as JsonValue,
  );
  return record;
}

export function verifyVaultAccessRequestSelf(input: {
  readonly record: VaultAccessRequest;
  readonly schemas: SchemaRegistry;
}): void {
  input.schemas.validate(
    VAULT_ACCESS_REQUEST_SCHEMA_ID,
    input.record as unknown as JsonValue,
  );
  assertCondition(
    input.record.requestHash ===
      sha256(
        requestCore(
          input.record,
        ) as unknown as JsonValue,
      ),
    "HASH_MISMATCH",
    "Vault request hash changed",
  );
  const principals = new PrincipalRegistry();
  principals.register(input.record.publicPrincipal);
  principals.verify(
    input.record.actor,
    requestSignedBody(
      input.record,
    ) as unknown as JsonValue,
    input.record.attestation,
  );
}

export function verifyVaultAccessRecord(input: {
  readonly record: VaultAccessRecord;
  readonly contract: EvaluatorVaultContract;
  readonly schemas: SchemaRegistry;
}): void {
  input.schemas.validate(
    VAULT_ACCESS_RECORD_SCHEMA_ID,
    input.record as unknown as JsonValue,
  );
  assertCondition(
    input.record.protocolId ===
      input.contract.protocolId &&
      input.record.contractId ===
        input.contract.contractId &&
      input.record.contractHash ===
        input.contract.contractHash &&
      canonicalize(
        input.record.recordedBy as unknown as JsonValue,
      ) ===
        canonicalize(
          input.contract.principalMatrix.vault
            .identity as unknown as JsonValue,
        ) &&
      samePublicPrincipal(
        input.record.publicPrincipal,
        input.contract.principalMatrix.vault,
      ) &&
      input.record.recordHash ===
        sha256(
          accessRecordCore(
            input.record,
          ) as unknown as JsonValue,
        ),
    "HASH_MISMATCH",
    "Vault access record identity or hash changed",
  );
  if (input.record.decision === "denied") {
    assertCondition(
      canonicalize(
        input.record.release as unknown as JsonValue,
      ) ===
        canonicalize(
          emptyRelease() as unknown as JsonValue,
        ) &&
        input.record.stateAfter ===
          input.record.stateBefore,
      "AUTHORIZATION_DENIED",
      "Denied vault access released data or changed state",
    );
  }
  const principals = new PrincipalRegistry();
  principals.register(input.record.publicPrincipal);
  principals.verify(
    input.record.recordedBy,
    accessRecordSignedBody(
      input.record,
    ) as unknown as JsonValue,
    input.record.attestation,
  );
}

function writerFenceCore(
  record: VaultWriterFenceRecord,
): WriterFenceCore {
  const {
    recordHash: _recordHash,
    publicPrincipal: _publicPrincipal,
    attestation: _attestation,
    ...core
  } = record;
  return core;
}

function writerFenceSignedBody(
  record: VaultWriterFenceRecord,
): WriterFenceSignedBody {
  const { attestation: _attestation, ...body } =
    record;
  return body;
}

export function verifyVaultWriterFenceRecord(input: {
  readonly record: VaultWriterFenceRecord;
  readonly priorVaultLedgerHead: string | null;
  readonly contract: EvaluatorVaultContract;
  readonly schemas: SchemaRegistry;
}): void {
  input.schemas.validate(
    VAULT_WRITER_FENCE_SCHEMA_ID,
    input.record as unknown as JsonValue,
  );
  assertCondition(
    input.record.protocolId ===
      input.contract.protocolId &&
      input.record.contractId ===
        input.contract.contractId &&
      input.record.contractHash ===
        input.contract.contractHash &&
      input.record.priorVaultLedgerHead ===
        input.priorVaultLedgerHead &&
      Number.isFinite(
        Date.parse(input.record.fencedAt),
      ) &&
      canonicalize(
        input.record.recordedBy as unknown as JsonValue,
      ) ===
        canonicalize(
          input.contract.principalMatrix.vault
            .identity as unknown as JsonValue,
        ) &&
      samePublicPrincipal(
        input.record.publicPrincipal,
        input.contract.principalMatrix.vault,
      ) &&
      input.record.recordHash ===
        sha256(
          writerFenceCore(
            input.record,
          ) as unknown as JsonValue,
        ),
    "HASH_MISMATCH",
    "Vault writer fence binding, principal, or hash changed",
  );
  const principals = new PrincipalRegistry();
  principals.register(input.record.publicPrincipal);
  principals.verify(
    input.record.recordedBy,
    writerFenceSignedBody(
      input.record,
    ) as unknown as JsonValue,
    input.record.attestation,
  );
}

function stateTransitionCore(
  record: VaultStateTransitionRecord,
): StateTransitionCore {
  const {
    recordHash: _recordHash,
    publicPrincipal: _publicPrincipal,
    attestation: _attestation,
    ...core
  } = record;
  return core;
}

function stateTransitionSignedBody(
  record: VaultStateTransitionRecord,
): StateTransitionSignedBody {
  const { attestation: _attestation, ...body } =
    record;
  return body;
}

function releaseResultCommitment(
  releasedCommitments: readonly string[],
): string | null {
  if (releasedCommitments.length === 0) return null;
  return sha256({
    recordType: "vault_release_commitment_set",
    releasedCommitments: [...releasedCommitments].sort(),
  });
}

function legalTaskSuccessor(
  action: VaultAction,
  before: VaultTaskState | null,
  after: VaultTaskState | null,
): boolean {
  return (
    (action === "create" &&
      before === null &&
      after === "created") ||
    (action === "seal" &&
      before === "created" &&
      after === "sealed") ||
    (action === "unlock" &&
      before === "sealed" &&
      after === "unlocked") ||
    (action === "evaluate" &&
      before === "unlocked" &&
      after === "evaluated") ||
    (action === "score" &&
      before === "evaluated" &&
      after === "scored")
  );
}

export function verifyVaultStateTransitionRecord(input: {
  readonly record: VaultStateTransitionRecord;
  readonly priorVaultLedgerHead: string | null;
  readonly contract: EvaluatorVaultContract;
  readonly schemas: SchemaRegistry;
}): void {
  input.schemas.validate(
    VAULT_STATE_TRANSITION_SCHEMA_ID,
    input.record as unknown as JsonValue,
  );
  verifyVaultAccessRecord({
    record: input.record.accessRecord,
    contract: input.contract,
    schemas: input.schemas,
  });
  const access = input.record.accessRecord;
  const ordered = [...input.record.releasedCommitments].sort();
  assertCondition(
    input.record.protocolId ===
      input.contract.protocolId &&
      input.record.contractId ===
        input.contract.contractId &&
      input.record.contractHash ===
        input.contract.contractHash &&
      input.record.priorVaultLedgerHead ===
        input.priorVaultLedgerHead &&
      input.record.requestIdCommitment ===
        access.requestIdCommitment &&
      input.record.action === access.action &&
      input.record.taskHandleCommitment ===
        access.taskHandleCommitment &&
      input.record.actorRole === access.actorRole &&
      input.record.actorIdentityCommitment ===
        access.actorIdentityCommitment &&
      input.record.actorKeyIdCommitment ===
        access.actorKeyIdCommitment &&
      input.record.decision === access.decision &&
      input.record.reasonCode === access.reasonCode &&
      input.record.stateBefore === access.stateBefore &&
      input.record.stateAfter === access.stateAfter &&
      input.record.occurredAt === access.occurredAt &&
      Number.isFinite(
        Date.parse(input.record.committedAt),
      ) &&
      canonicalize(
        input.record.recordedBy as unknown as JsonValue,
      ) ===
        canonicalize(
          input.contract.principalMatrix.vault
            .identity as unknown as JsonValue,
        ) &&
      samePublicPrincipal(
        input.record.publicPrincipal,
        input.contract.principalMatrix.vault,
      ) &&
      canonicalize(
        ordered as unknown as JsonValue,
      ) ===
        canonicalize(
          input.record
            .releasedCommitments as unknown as JsonValue,
        ) &&
      new Set(ordered).size === ordered.length &&
      input.record.resultCommitment ===
        releaseResultCommitment(ordered) &&
      input.record.recordHash ===
        sha256(
          stateTransitionCore(
            input.record,
          ) as unknown as JsonValue,
        ),
    "HASH_MISMATCH",
    "Vault transition binding, release, principal, or hash changed",
  );
  if (input.record.taskStateSuccessor) {
    assertCondition(
      input.record.decision === "allowed" &&
        input.record.taskHandleCommitment !== null &&
        input.record.authorshipRecordHash !== null &&
        legalTaskSuccessor(
          input.record.action,
          input.record.stateBefore,
          input.record.stateAfter,
        ),
      "INVALID_STATE_TRANSITION",
      "Vault task successor is not a legal lifecycle transition",
    );
  } else {
    assertCondition(
      input.record.stateAfter ===
        input.record.stateBefore,
      "INVALID_STATE_TRANSITION",
      "Non-successor vault decision changed task state",
    );
  }
  const mutatingAction =
    input.record.action === "create" ||
    input.record.action === "seal" ||
    input.record.action === "unlock" ||
    input.record.action === "evaluate" ||
    input.record.action === "score";
  assertCondition(
    input.record.taskStateSuccessor ===
      (input.record.decision === "allowed" &&
        mutatingAction),
    "INVALID_STATE_TRANSITION",
    "Vault decision omitted or invented a task-state successor",
  );
  if (input.record.decision === "denied") {
    assertCondition(
      !input.record.taskStateSuccessor &&
        ordered.length === 0 &&
        input.record.resultCommitment === null,
      "AUTHORIZATION_DENIED",
      "Denied vault transition released data or advanced state",
    );
  }
  const principals = new PrincipalRegistry();
  principals.register(input.record.publicPrincipal);
  principals.verify(
    input.record.recordedBy,
    stateTransitionSignedBody(
      input.record,
    ) as unknown as JsonValue,
    input.record.attestation,
  );
}

const VAULT_FAILURE_CODES =
  new Set<HarnessErrorCode>([
    "AUTHENTICATION_FAILED",
    "AUTHORIZATION_DENIED",
    "SCHEMA_INVALID",
    "HASH_MISMATCH",
    "REPLAY_DETECTED",
    "PAYLOAD_TOO_LARGE",
    "DEADLINE_EXCEEDED",
    "BUDGET_EXHAUSTED",
    "PROTOCOL_MISMATCH",
    "ARTIFACT_UNAVAILABLE",
    "PEER_CRASHED",
    "INVALID_STATE_TRANSITION",
    "TOOL_NOT_FOUND",
    "TOOL_EXECUTION_FAILED",
    "VERIFICATION_FAILED",
    "CONFLICT",
    "INTERNAL_ERROR",
  ]);

function failureFromRecord(
  record: VaultStateTransitionRecord,
): HarnessError | null {
  if (record.decision === "allowed") return null;
  assertCondition(
    VAULT_FAILURE_CODES.has(
      record.reasonCode as HarnessErrorCode,
    ),
    "HASH_MISMATCH",
    "Vault denial contains an unknown disposition",
  );
  return new HarnessError(
    record.reasonCode as HarnessErrorCode,
    `Previously committed vault denial ${record.transitionId}`,
  );
}

class VaultCrashSignal extends Error {
  public readonly causeValue: unknown;

  public constructor(
    readonly phase: VaultCrashPhase,
    cause: unknown,
  ) {
    super(`Simulated vault crash at ${phase}`, {
      cause,
    });
    this.name = "VaultCrashSignal";
    this.causeValue = cause;
  }
}

interface RecoveredVaultJournal {
  readonly entries: readonly {
    readonly journal:
      CasAppendOnlyRecord<JsonValue>;
    readonly payload: VaultJournalPayload;
  }[];
  readonly records: readonly {
    readonly journal:
      CasAppendOnlyRecord<JsonValue>;
    readonly transition:
      VaultStateTransitionRecord;
  }[];
  readonly head: string | null;
  readonly latestFence: {
    readonly journal:
      CasAppendOnlyRecord<JsonValue>;
    readonly fence: VaultWriterFenceRecord;
  } | null;
  readonly tasks: Map<string, VaultTaskEntry>;
  readonly acceptedSequences: Map<string, number>;
  readonly acceptedNonces: Set<string>;
  readonly usedCapabilities: Set<string>;
  readonly requests: Map<
    string,
    VaultStateTransitionRecord
  >;
}

export class EvaluatorVault {
  readonly #contract: EvaluatorVaultContract;
  readonly #schemas: SchemaRegistry;
  readonly #vaultSigner: PrincipalSigner;
  readonly #stateLog: CasAppendOnlyLog<JsonValue>;
  readonly #writerLease: VaultWriterLease;
  readonly #clock: Clock;
  readonly #crashInjector:
    | ((
        phase: VaultCrashPhase,
      ) => void | Promise<void>)
    | undefined;
  #taskCache = new Map<string, VaultTaskEntry>();
  readonly #authorshipAdmissions = new Map<
    string,
    string
  >();
  #processTail: Promise<void> = Promise.resolve();

  public constructor(input: {
    readonly root: string;
    readonly contract: EvaluatorVaultContract;
    readonly schemas: SchemaRegistry;
    readonly vaultSigner: PrincipalSigner;
    readonly historicalPolicy:
      HistoricalPublicExposurePolicy;
    readonly authorshipAdmissions:
      readonly VaultAuthorshipAdmission[];
    readonly leaseOwnerId?: string;
    readonly clock?: Clock;
    readonly leaseTtlMillis?: number;
    readonly crashInjector?: (
      phase: VaultCrashPhase,
    ) => void | Promise<void>;
  }) {
    verifyEvaluatorVaultContract({
      record: input.contract,
      schemas: input.schemas,
    });
    assertCondition(
      samePublicPrincipal(
        input.vaultSigner.exportPublic(),
        input.contract.principalMatrix.vault,
      ),
      "AUTHENTICATION_FAILED",
      "EvaluatorVault requires the frozen vault signer",
    );
    this.#contract = input.contract;
    this.#schemas = input.schemas;
    this.#vaultSigner = input.vaultSigner;
    this.#clock = input.clock ?? new SystemClock();
    this.#crashInjector = input.crashInjector;
    for (const admission of input.authorshipAdmissions) {
      verifyIndependentAuthorshipTransition({
        record: admission.included,
        previous: admission.previous,
        contract: input.contract,
        schemas: input.schemas,
        historicalPolicy: input.historicalPolicy,
      });
      assertCondition(
        admission.included.nextState === "included",
        "AUTHORIZATION_DENIED",
        "Vault admission requires a finalized included authorship record",
      );
      const taskHandleCommitment = sha256Text(
        admission.included.taskHandle,
      );
      assertCondition(
        /^sha256:[a-f0-9]{64}$/u.test(
          admission.included.recordHash,
        ) &&
          !this.#authorshipAdmissions.has(
            taskHandleCommitment,
          ),
        "SCHEMA_INVALID",
        "Vault authorship admissions must be unique included records",
      );
      this.#authorshipAdmissions.set(
        taskHandleCommitment,
        admission.included.recordHash,
      );
    }
    this.#stateLog = new CasAppendOnlyLog<JsonValue>(
      input.root,
      `vault-state.${input.contract.contractId}`,
    );
    this.#writerLease = new VaultWriterLease({
      root: input.root,
      ownerId:
        input.leaseOwnerId ??
        `vault-process.${process.pid}.${sha256Text(
          `${process.pid}\0${this.#clock
            .monotonicNanos()
            .toString()}`,
        ).slice(7, 23)}`,
      contract: input.contract,
      schemas: input.schemas,
      vaultSigner: input.vaultSigner,
      clock: this.#clock,
      ...(input.leaseTtlMillis === undefined
        ? {}
        : { ttlMillis: input.leaseTtlMillis }),
    });
  }

  public issueUnlockCapability(input: {
    readonly capabilityId: string;
    readonly taskHandle: string;
    readonly issuedAt: string;
    readonly expiresAt: string;
    readonly nonce: string;
  }): OpaqueTaskCapability {
    const task = this.#taskCache.get(
      sha256Text(input.taskHandle),
    );
    assertCondition(
      task?.state === "sealed",
      "INVALID_STATE_TRANSITION",
      "Unlock capability can only be issued for a sealed task",
    );
    return createOpaqueTaskCapability({
      ...input,
      authorshipRecordHash: task.authorshipRecordHash,
      signer: this.#vaultSigner,
      contract: this.#contract,
      schemas: this.#schemas,
    });
  }

  public async process(
    request: VaultAccessRequest,
  ): Promise<VaultAccessOutcome> {
    const current = this.#processTail.then(() =>
      this.#processOne(request),
    );
    this.#processTail = current.then(
      () => undefined,
      () => undefined,
    );
    return current;
  }

  async #processOne(
    request: VaultAccessRequest,
  ): Promise<VaultAccessOutcome> {
    let lease: VaultWriterLeaseHandle | null = null;
    let releasedLease = false;
    try {
      lease = await this.#writerLease.acquire();
      await this.#appendWriterFence(lease);
      const committed =
        await this.#processUnderLease(
          request,
          lease,
          (renewed) => {
            lease = renewed;
          },
        );
      await this.#injectCrash(
        "after_durable_commit_before_release",
      );
      await this.#writerLease.release(
        committed.lease,
      );
      releasedLease = true;
      await this.#injectCrash(
        "after_release_before_ack",
      );
      if (committed.failure !== null) {
        throw committed.failure;
      }
      return committed.outcome;
    } catch (error) {
      if (
        lease !== null &&
        !releasedLease &&
        !(error instanceof VaultCrashSignal)
      ) {
        await this.#writerLease
          .release(lease)
          .catch(() => undefined);
      }
      if (error instanceof VaultCrashSignal) {
        throw new HarnessError(
          "PEER_CRASHED",
          `Vault process crashed at ${error.phase}`,
          { cause: error.causeValue },
        );
      }
      throw error;
    }
  }

  async #processUnderLease(
    request: VaultAccessRequest,
    initialLease: VaultWriterLeaseHandle,
    onLeaseRenewed: (
      lease: VaultWriterLeaseHandle,
    ) => void,
  ): Promise<{
    readonly outcome: VaultAccessOutcome;
    readonly failure: HarnessError | null;
    readonly lease: VaultWriterLeaseHandle;
  }> {
    const snapshot = await this.#recoverJournal();
    const requestCommitment = sha256(
      request as unknown as JsonValue,
    );
    const priorDecision =
      snapshot.requests.get(requestCommitment);
    if (priorDecision !== undefined) {
      return {
        outcome: {
          accessRecord:
            priorDecision.accessRecord,
          releasedCommitments:
            priorDecision.releasedCommitments,
        },
        failure: failureFromRecord(priorDecision),
        lease: initialLease,
      };
    }
    const observedRequestHash = sha256(
      requestCore(request) as unknown as JsonValue,
    );
    const taskHandleCommitment =
      request.taskHandle === null
        ? null
        : sha256Text(request.taskHandle);
    const task =
      taskHandleCommitment === null
        ? undefined
        : snapshot.tasks.get(taskHandleCommitment);
    const stateBefore = task?.state ?? null;
    let stateAfter = stateBefore;
    let releaseRecord = emptyRelease();
    let releasedCommitments: readonly string[] = [];
    let failure: HarnessError | null = null;

    try {
      verifyVaultAccessRequestSelf({
        record: request,
        schemas: this.#schemas,
      });
      assertCondition(
        request.protocolId ===
          this.#contract.protocolId &&
          request.contractId ===
            this.#contract.contractId &&
          request.contractHash ===
            this.#contract.contractHash,
        "PROTOCOL_MISMATCH",
        "Vault request belongs to another protocol contract",
      );
      assertRequestShape(request);
      const roles = allowedRolesForVaultAction(
        request.action,
      );
      assertCondition(
        roles.includes(request.actor.role),
        "AUTHORIZATION_DENIED",
        `Role ${request.actor.role} cannot ${request.action}`,
      );
      const expectedPrincipal = principalForAction(
        this.#contract,
        request.action,
      );
      assertCondition(
        samePublicPrincipal(
          request.publicPrincipal,
          expectedPrincipal,
        ),
        "AUTHENTICATION_FAILED",
        `Request key is not frozen for ${request.action}`,
      );
      this.#assertFreshRequest(
        request,
        snapshot,
      );

      switch (request.action) {
        case "create": {
          assertOpaqueHandle(request.taskHandle);
          assertCondition(
            task === undefined &&
              this.#authorshipAdmissions.get(
                taskHandleCommitment!,
              ) === request.subjectCommitment,
            "AUTHORIZATION_DENIED",
            "Opaque task is not bound to an included authorship admission",
          );
          stateAfter = "created";
          break;
        }
        case "seal": {
          assertOpaqueHandle(request.taskHandle);
          assertCondition(
            task?.state === "created" &&
              task.authorshipRecordHash ===
                request.subjectCommitment &&
              task.evaluationCommitment === null &&
              task.scoreCommitment === null,
            "AUTHORIZATION_DENIED",
            "Seal request lacks the admitted authorship commitment",
          );
          stateAfter = "sealed";
          break;
        }
        case "enumerate": {
          releasedCommitments = [
            ...snapshot.tasks.keys(),
          ].sort();
          releaseRecord = release(
            "opaque_handle_commitments",
            "vault",
            ["taskHandleCommitments"],
          );
          break;
        }
        case "unlock": {
          assertOpaqueHandle(request.taskHandle);
          assertCondition(
            task?.state === "sealed",
            "INVALID_STATE_TRANSITION",
            "Task must be sealed before unlock",
          );
          const capability = request.capability!;
          assertCondition(
            !snapshot.usedCapabilities.has(
              capability.capabilityHash,
            ),
            "REPLAY_DETECTED",
            "Unlock capability was already used",
          );
          verifyOpaqueTaskCapability({
            record: capability,
            taskHandle: request.taskHandle,
            authorshipRecordHash:
              task.authorshipRecordHash,
            now: request.requestedAt,
            contract: this.#contract,
            schemas: this.#schemas,
          });
          stateAfter = "unlocked";
          releasedCommitments = [
            capability.capabilityHash,
          ];
          releaseRecord = release(
            "unlock_authorization",
            "evaluator",
            ["capabilityHash"],
          );
          break;
        }
        case "evaluate": {
          assertOpaqueHandle(request.taskHandle);
          assertCondition(
            task?.state === "unlocked",
            "INVALID_STATE_TRANSITION",
            "Task must be unlocked before evaluation",
          );
          const evaluationCommitment =
            request.subjectCommitment!;
          stateAfter = "evaluated";
          releasedCommitments = [
            evaluationCommitment,
          ];
          releaseRecord = release(
            "evaluation_commitment",
            "scorer",
            ["evaluationCommitment"],
          );
          break;
        }
        case "score": {
          assertOpaqueHandle(request.taskHandle);
          assertCondition(
            task?.state === "evaluated" &&
              task.evaluationCommitment ===
                request.subjectCommitment,
            "INVALID_STATE_TRANSITION",
            "Score request must bind the released evaluation commitment",
          );
          const scoreCommitment = sha256({
            recordType: "synthetic_score_commitment",
            protocolId: this.#contract.protocolId,
            contractHash: this.#contract.contractHash,
            taskHandleCommitment: sha256Text(
              request.taskHandle,
            ),
            evaluationCommitment:
              task.evaluationCommitment,
            scorerRequestHash: request.requestHash,
          });
          stateAfter = "scored";
          releasedCommitments = [scoreCommitment];
          releaseRecord = release(
            "score_commitment",
            "promoter",
            ["scoreCommitment"],
          );
          break;
        }
        case "audit": {
          const priorHead =
            snapshot.head;
          releasedCommitments =
            priorHead === null ? [] : [priorHead];
          releaseRecord = release(
            "access_chain_head",
            "audit_store",
            ["accessChainHead"],
          );
          break;
        }
      }
    } catch (error) {
      failure = asHarnessError(error);
      stateAfter = stateBefore;
      releaseRecord = emptyRelease();
      releasedCommitments = [];
    }

    const accessRecord = this.#createAccessRecord({
      sequence: snapshot.records.length,
      request,
      observedRequestHash,
      decision: failure === null ? "allowed" : "denied",
      reasonCode: failure?.code ?? "ALLOWED",
      stateBefore,
      stateAfter,
      release: releaseRecord,
    });
    const lease =
      await this.#writerLease.renew(initialLease);
    onLeaseRenewed(lease);
    await this.#writerLease.assertCurrent(lease);
    const fencedHead =
      await this.#appendWriterFence(lease);
    const transition =
      this.#createStateTransition({
        sequence: snapshot.records.length,
        request,
        requestCommitment,
        accessRecord,
        priorVaultLedgerHead: fencedHead,
        priorTaskStateRecordHash:
          task?.stateRecordHash ?? null,
        authorshipRecordHash:
          task?.authorshipRecordHash ??
          (taskHandleCommitment === null
            ? null
            : (this.#authorshipAdmissions.get(
                taskHandleCommitment,
              ) ?? null)),
        lease,
        releasedCommitments,
        taskStateSuccessor:
          failure === null &&
          legalTaskSuccessor(
            request.action,
            stateBefore,
            stateAfter,
          ),
      });
    const appended =
      await this.#stateLog.appendExpected({
        expectedHeadHash:
          transition.priorVaultLedgerHead,
        payload: transition as unknown as JsonValue,
        inject: async (phase) => {
          await this.#injectCasCrash(phase);
        },
      });
    await this.#stateLog.synchronize();
    const committedHead = await this.#stateLog.head();
    assertCondition(
      committedHead?.recordHash ===
        appended.recordHash,
      "HASH_MISMATCH",
      "Vault transition is not the committed durable head",
    );
    await this.#recoverJournal();
    return {
      outcome: {
        accessRecord,
        releasedCommitments,
      },
      failure,
      lease,
    };
  }

  public async readAccessLedger(): Promise<
    readonly VaultAccessRecord[]
  > {
    return (await this.#recoverJournal()).records.map(
      (entry) => entry.transition.accessRecord,
    );
  }

  public async readStateJournal(): Promise<
    readonly VaultStateTransitionRecord[]
  > {
    return (await this.#recoverJournal()).records.map(
      (entry) => entry.transition,
    );
  }

  public async readWriterFences(): Promise<
    readonly VaultWriterFenceRecord[]
  > {
    return (await this.#recoverJournal()).entries
      .map((entry) => entry.payload)
      .filter(
        (
          entry,
        ): entry is VaultWriterFenceRecord =>
          entry.recordType ===
          "vault_writer_fence",
      );
  }

  public async readAuthoritativeJournalHead(): Promise<
    string | null
  > {
    await this.#stateLog.synchronize();
    return (await this.#stateLog.head())?.recordHash ?? null;
  }

  public async recover(): Promise<void> {
    await this.#recoverJournal();
  }

  public taskState(
    taskHandle: string,
  ): VaultTaskState | null {
    return (
      this.#taskCache.get(sha256Text(taskHandle))
        ?.state ?? null
    );
  }

  #assertFreshRequest(
    request: VaultAccessRequest,
    snapshot: RecoveredVaultJournal,
  ): void {
    const actorIdentityCommitment = sha256(
      request.actor as unknown as JsonValue,
    );
    const expected =
      (snapshot.acceptedSequences.get(
        actorIdentityCommitment,
      ) ?? -1) + 1;
    assertCondition(
      request.senderSequence === expected,
      "REPLAY_DETECTED",
      `Expected vault sender sequence ${expected}`,
    );
    const nonceCommitment = sha256Text(
      `${request.actor.principalId}\0${request.actor.instanceId}\0${request.nonce}`,
    );
    assertCondition(
      !snapshot.acceptedNonces.has(
        nonceCommitment,
      ),
      "REPLAY_DETECTED",
      "Vault request nonce was already accepted",
    );
  }

  #createAccessRecord(input: {
    readonly sequence: number;
    readonly request: VaultAccessRequest;
    readonly observedRequestHash: string;
    readonly decision: "allowed" | "denied";
    readonly reasonCode: string;
    readonly stateBefore: VaultTaskState | null;
    readonly stateAfter: VaultTaskState | null;
    readonly release: VaultRelease;
  }): VaultAccessRecord {
    const core: AccessRecordCore = {
      schemaVersion: 1,
      recordType: "vault_access_record",
      accessRecordId:
        `vault-access:${input.sequence.toString().padStart(8, "0")}`,
      protocolId: this.#contract.protocolId,
      requestedProtocolId:
        input.request.protocolId,
      contractId: this.#contract.contractId,
      contractHash: this.#contract.contractHash,
      requestIdCommitment: sha256Text(
        input.request.requestId,
      ),
      claimedRequestHash: input.request.requestHash,
      observedRequestHash:
        input.observedRequestHash,
      action: input.request.action,
      taskHandleCommitment:
        input.request.taskHandle === null
          ? null
          : sha256Text(input.request.taskHandle),
      actorRole: input.request.actor.role,
      actorIdentityCommitment: sha256(
        input.request.actor as unknown as JsonValue,
      ),
      actorKeyIdCommitment: sha256Text(
        input.request.attestation.keyId,
      ),
      senderSequence: input.request.senderSequence,
      nonceCommitment: sha256Text(
        `${input.request.actor.principalId}\0${input.request.actor.instanceId}\0${input.request.nonce}`,
      ),
      decision: input.decision,
      reasonCode: input.reasonCode,
      stateBefore: input.stateBefore,
      stateAfter: input.stateAfter,
      release: input.release,
      occurredAt: input.request.requestedAt,
      recordedBy: this.#vaultSigner.identity,
    };
    const publicPrincipal =
      this.#vaultSigner.exportPublic();
    const body: AccessRecordSignedBody = {
      ...core,
      recordHash: sha256(
        core as unknown as JsonValue,
      ),
      publicPrincipal,
    };
    const record: VaultAccessRecord = {
      ...body,
      attestation: this.#vaultSigner.attest(
        body as unknown as JsonValue,
      ),
    };
    verifyVaultAccessRecord({
      record,
      contract: this.#contract,
      schemas: this.#schemas,
    });
    return record;
  }

  async #appendWriterFence(
    lease: VaultWriterLeaseHandle,
  ): Promise<string> {
    for (let attempt = 0; attempt < 64; attempt += 1) {
      await this.#writerLease.assertCurrent(lease);
      const snapshot = await this.#recoverJournal();
      await this.#writerLease.assertCurrent(lease);
      const fence = this.#createWriterFence({
        sequence: snapshot.entries.length,
        priorVaultLedgerHead: snapshot.head,
        lease,
      });
      try {
        const appended =
          await this.#stateLog.appendExpected({
            expectedHeadHash: snapshot.head,
            payload: fence as unknown as JsonValue,
          });
        await this.#stateLog.synchronize();
        const committed = await this.#recoverJournal();
        assertCondition(
          committed.head === appended.recordHash &&
            committed.latestFence?.fence
              .recordHash === fence.recordHash,
          "HASH_MISMATCH",
          "Vault writer fence is not the committed authoritative head",
        );
        return appended.recordHash;
      } catch (error) {
        const failure = asHarnessError(error);
        if (failure.code !== "CONFLICT") {
          throw error;
        }
      }
    }
    throw new HarnessError(
      "CONFLICT",
      "Vault writer could not fence its epoch after repeated CAS contention",
      { retryable: true },
    );
  }

  #createWriterFence(input: {
    readonly sequence: number;
    readonly priorVaultLedgerHead: string | null;
    readonly lease: VaultWriterLeaseHandle;
  }): VaultWriterFenceRecord {
    const fencedAt = this.#clock.now().toISOString();
    assertCondition(
      Date.parse(fencedAt) <
        Date.parse(input.lease.validUntil),
      "CONFLICT",
      "Vault lease expired before its epoch fence was signed",
    );
    const core: WriterFenceCore = {
      schemaVersion: 1,
      recordType: "vault_writer_fence",
      fenceId:
        `vault-fence:${input.sequence
          .toString()
          .padStart(8, "0")}`,
      protocolId: this.#contract.protocolId,
      contractId: this.#contract.contractId,
      contractHash: this.#contract.contractHash,
      priorVaultLedgerHead:
        input.priorVaultLedgerHead,
      leaseOwnerCommitment:
        input.lease.ownerCommitment,
      leaseEpoch: input.lease.epoch,
      leaseRecordHash:
        input.lease.leaseRecordHash,
      leaseJournalHead:
        input.lease.leaseJournalHead,
      fencedAt,
      recordedBy: this.#vaultSigner.identity,
    };
    const publicPrincipal =
      this.#vaultSigner.exportPublic();
    const body: WriterFenceSignedBody = {
      ...core,
      recordHash: sha256(
        core as unknown as JsonValue,
      ),
      publicPrincipal,
    };
    const fence: VaultWriterFenceRecord = {
      ...body,
      attestation: this.#vaultSigner.attest(
        body as unknown as JsonValue,
      ),
    };
    verifyVaultWriterFenceRecord({
      record: fence,
      priorVaultLedgerHead:
        input.priorVaultLedgerHead,
      contract: this.#contract,
      schemas: this.#schemas,
    });
    return fence;
  }

  #createStateTransition(input: {
    readonly sequence: number;
    readonly request: VaultAccessRequest;
    readonly requestCommitment: string;
    readonly accessRecord: VaultAccessRecord;
    readonly priorVaultLedgerHead: string | null;
    readonly priorTaskStateRecordHash: string | null;
    readonly authorshipRecordHash: string | null;
    readonly lease: VaultWriterLeaseHandle;
    readonly releasedCommitments: readonly string[];
    readonly taskStateSuccessor: boolean;
  }): VaultStateTransitionRecord {
    const releasedCommitments = [
      ...input.releasedCommitments,
    ].sort();
    const committedAt =
      this.#clock.now().toISOString();
    assertCondition(
      Date.parse(committedAt) <
        Date.parse(input.lease.validUntil),
      "CONFLICT",
      "Vault lease expired before transition signing",
    );
    const core: StateTransitionCore = {
      schemaVersion: 1,
      recordType: "vault_state_transition",
      transitionId:
        `vault-transition:${input.sequence
          .toString()
          .padStart(8, "0")}`,
      protocolId: this.#contract.protocolId,
      contractId: this.#contract.contractId,
      contractHash: this.#contract.contractHash,
      requestCommitment: input.requestCommitment,
      requestIdCommitment:
        input.accessRecord.requestIdCommitment,
      action: input.request.action,
      taskHandleCommitment:
        input.accessRecord.taskHandleCommitment,
      authorshipRecordHash:
        input.authorshipRecordHash,
      priorTaskStateRecordHash:
        input.priorTaskStateRecordHash,
      priorVaultLedgerHead:
        input.priorVaultLedgerHead,
      leaseOwnerCommitment:
        input.lease.ownerCommitment,
      leaseEpoch: input.lease.epoch,
      leaseRecordHash:
        input.lease.leaseRecordHash,
      leaseJournalHead:
        input.lease.leaseJournalHead,
      actorRole: input.accessRecord.actorRole,
      actorIdentityCommitment:
        input.accessRecord.actorIdentityCommitment,
      actorKeyIdCommitment:
        input.accessRecord.actorKeyIdCommitment,
      capabilityCommitment:
        input.request.capability?.capabilityHash ??
        null,
      inputCommitment:
        input.request.subjectCommitment,
      resultCommitment:
        releaseResultCommitment(
          releasedCommitments,
        ),
      releasedCommitments,
      decision: input.accessRecord.decision,
      reasonCode: input.accessRecord.reasonCode,
      stateBefore: input.accessRecord.stateBefore,
      stateAfter: input.accessRecord.stateAfter,
      taskStateSuccessor:
        input.taskStateSuccessor,
      accessRecord: input.accessRecord,
      occurredAt: input.request.requestedAt,
      committedAt,
      recordedBy: this.#vaultSigner.identity,
    };
    const publicPrincipal =
      this.#vaultSigner.exportPublic();
    const body: StateTransitionSignedBody = {
      ...core,
      recordHash: sha256(
        core as unknown as JsonValue,
      ),
      publicPrincipal,
    };
    const transition: VaultStateTransitionRecord = {
      ...body,
      attestation: this.#vaultSigner.attest(
        body as unknown as JsonValue,
      ),
    };
    verifyVaultStateTransitionRecord({
      record: transition,
      priorVaultLedgerHead:
        input.priorVaultLedgerHead,
      contract: this.#contract,
      schemas: this.#schemas,
    });
    return transition;
  }

  async #recoverJournal(): Promise<RecoveredVaultJournal> {
    await this.#stateLog.synchronize();
    const journalRecords =
      await this.#stateLog.readAll();
    const leaseHistory =
      await this.#writerLease.recover();
    const leaseByJournalHead = new Map(
      leaseHistory.map((entry) => [
        entry.journal.recordHash,
        entry.lease,
      ]),
    );
    const entries: {
      readonly journal:
        CasAppendOnlyRecord<JsonValue>;
      readonly payload: VaultJournalPayload;
    }[] = [];
    const records: {
      readonly journal:
        CasAppendOnlyRecord<JsonValue>;
      readonly transition:
        VaultStateTransitionRecord;
    }[] = [];
    const tasks = new Map<string, VaultTaskEntry>();
    const acceptedSequences = new Map<string, number>();
    const acceptedNonces = new Set<string>();
    const usedCapabilities = new Set<string>();
    const requests = new Map<
      string,
      VaultStateTransitionRecord
    >();
    let latestFence: {
      readonly journal:
        CasAppendOnlyRecord<JsonValue>;
      readonly fence: VaultWriterFenceRecord;
    } | null = null;

    for (const journal of journalRecords) {
      assertCondition(
        typeof journal.payload === "object" &&
          journal.payload !== null &&
          !Array.isArray(journal.payload) &&
          (journal.payload["recordType"] ===
            "vault_writer_fence" ||
            journal.payload["recordType"] ===
              "vault_state_transition"),
        "SCHEMA_INVALID",
        "Vault journal contains an unknown record type",
      );
      if (
        journal.payload["recordType"] ===
        "vault_writer_fence"
      ) {
        const fence =
          journal.payload as unknown as VaultWriterFenceRecord;
        verifyVaultWriterFenceRecord({
          record: fence,
          priorVaultLedgerHead:
            journal.previousRecordHash,
          contract: this.#contract,
          schemas: this.#schemas,
        });
        const boundLease = leaseByJournalHead.get(
          fence.leaseJournalHead,
        );
        const fencedAt = Date.parse(fence.fencedAt);
        assertCondition(
          fence.fenceId ===
            `vault-fence:${entries.length
              .toString()
              .padStart(8, "0")}` &&
          boundLease !== undefined &&
            boundLease.action !== "release" &&
            boundLease.recordHash ===
              fence.leaseRecordHash &&
            boundLease.ownerCommitment ===
              fence.leaseOwnerCommitment &&
            boundLease.epoch === fence.leaseEpoch &&
            fencedAt >=
              Date.parse(boundLease.recordedAt) &&
            fencedAt <
              Date.parse(boundLease.validUntil) &&
            (latestFence === null ||
              fence.leaseEpoch >
                latestFence.fence.leaseEpoch ||
              (fence.leaseEpoch ===
                latestFence.fence.leaseEpoch &&
                fence.leaseOwnerCommitment ===
                  latestFence.fence
                    .leaseOwnerCommitment &&
                fence.leaseRecordHash !==
                  latestFence.fence
                    .leaseRecordHash &&
                boundLease.action === "renew")),
          "CONFLICT",
          "Vault writer fence is stale or detached from its lease epoch",
        );
        latestFence = { journal, fence };
        entries.push({ journal, payload: fence });
        continue;
      }
      const transition =
        journal.payload as unknown as VaultStateTransitionRecord;
      verifyVaultStateTransitionRecord({
        record: transition,
        priorVaultLedgerHead:
          journal.previousRecordHash,
        contract: this.#contract,
        schemas: this.#schemas,
      });
      const boundLease = leaseByJournalHead.get(
        transition.leaseJournalHead,
      );
      const committedAt = Date.parse(
        transition.committedAt,
      );
      assertCondition(
        latestFence !== null &&
          journal.previousRecordHash ===
            latestFence.journal.recordHash &&
          transition.leaseOwnerCommitment ===
            latestFence.fence
              .leaseOwnerCommitment &&
          transition.leaseEpoch ===
            latestFence.fence.leaseEpoch &&
          transition.leaseRecordHash ===
            latestFence.fence.leaseRecordHash &&
          transition.leaseJournalHead ===
            latestFence.fence.leaseJournalHead &&
          boundLease !== undefined &&
          boundLease.action !== "release" &&
          boundLease.recordHash ===
            transition.leaseRecordHash &&
          boundLease.ownerCommitment ===
            transition.leaseOwnerCommitment &&
          boundLease.epoch ===
            transition.leaseEpoch &&
          committedAt >=
            Date.parse(boundLease.recordedAt) &&
          committedAt <
            Date.parse(boundLease.validUntil),
        "CONFLICT",
        "Vault transition is not fenced by its active durable lease",
      );
      assertCondition(
        transition.transitionId ===
          `vault-transition:${records.length
            .toString()
            .padStart(8, "0")}` &&
          transition.accessRecord.accessRecordId ===
            `vault-access:${records.length
              .toString()
              .padStart(8, "0")}`,
        "HASH_MISMATCH",
        "Vault transition sequence identity changed",
      );
      assertCondition(
        !requests.has(
          transition.requestCommitment,
        ),
        "REPLAY_DETECTED",
        "Vault journal contains a duplicated exact request",
      );
      requests.set(
        transition.requestCommitment,
        transition,
      );

      const taskCommitment =
        transition.taskHandleCommitment;
      const priorTask =
        taskCommitment === null
          ? undefined
          : tasks.get(taskCommitment);
      assertCondition(
        transition.priorTaskStateRecordHash ===
          (priorTask?.stateRecordHash ?? null) &&
          transition.stateBefore ===
            (priorTask?.state ?? null),
        "HASH_MISMATCH",
        "Vault task transition does not extend the authoritative task head",
      );
      if (taskCommitment === null) {
        assertCondition(
          transition.authorshipRecordHash === null &&
            transition.priorTaskStateRecordHash ===
              null &&
            transition.stateBefore === null &&
            transition.stateAfter === null,
          "INVALID_STATE_TRANSITION",
          "Non-task vault decision carries task state",
        );
      } else if (priorTask !== undefined) {
        assertCondition(
          transition.authorshipRecordHash ===
            priorTask.authorshipRecordHash,
          "HASH_MISMATCH",
          "Vault task authorship binding changed",
        );
      } else {
        assertCondition(
          transition.authorshipRecordHash ===
            (this.#authorshipAdmissions.get(
              taskCommitment,
            ) ?? null),
          "AUTHORIZATION_DENIED",
          "Vault transition is detached from admitted authorship",
        );
      }

      if (transition.taskStateSuccessor) {
        assertCondition(
          taskCommitment !== null &&
            legalTaskSuccessor(
              transition.action,
              transition.stateBefore,
              transition.stateAfter,
            ),
          "INVALID_STATE_TRANSITION",
          "Vault task successor has an invalid predecessor",
        );
        const authorshipRecordHash =
          transition.authorshipRecordHash!;
        let evaluationCommitment =
          priorTask?.evaluationCommitment ?? null;
        let scoreCommitment =
          priorTask?.scoreCommitment ?? null;
        switch (transition.action) {
          case "create":
            assertCondition(
              transition.inputCommitment ===
                authorshipRecordHash,
              "HASH_MISMATCH",
              "Create transition does not bind admitted authorship",
            );
            break;
          case "seal":
            assertCondition(
              transition.inputCommitment ===
                authorshipRecordHash,
              "HASH_MISMATCH",
              "Seal transition changed authorship commitment",
            );
            break;
          case "unlock":
            assertCondition(
              transition.capabilityCommitment !==
                null &&
                !usedCapabilities.has(
                  transition.capabilityCommitment,
                ) &&
                canonicalize(
                  transition
                    .releasedCommitments as unknown as JsonValue,
                ) ===
                  canonicalize(
                    [
                      transition.capabilityCommitment,
                    ] as unknown as JsonValue,
                  ),
              "REPLAY_DETECTED",
              "Unlock transition reused or failed to bind its capability",
            );
            usedCapabilities.add(
              transition.capabilityCommitment,
            );
            break;
          case "evaluate":
            assertCondition(
              transition.inputCommitment !== null &&
                canonicalize(
                  transition
                    .releasedCommitments as unknown as JsonValue,
                ) ===
                  canonicalize(
                    [
                      transition.inputCommitment,
                    ] as unknown as JsonValue,
                  ),
              "HASH_MISMATCH",
              "Evaluation transition changed its released commitment",
            );
            evaluationCommitment =
              transition.inputCommitment;
            break;
          case "score":
            assertCondition(
              transition.inputCommitment !== null &&
                transition.inputCommitment ===
                  priorTask?.evaluationCommitment &&
                transition.releasedCommitments
                  .length === 1,
              "HASH_MISMATCH",
              "Score transition is detached from evaluation",
            );
            scoreCommitment =
              transition.releasedCommitments[0]!;
            break;
          case "enumerate":
          case "audit":
            throw new HarnessError(
              "INVALID_STATE_TRANSITION",
              "Read-only action cannot advance task state",
            );
        }
        tasks.set(taskCommitment, {
          authorshipRecordHash,
          state: transition.stateAfter!,
          evaluationCommitment,
          scoreCommitment,
          stateRecordHash:
            transition.recordHash,
        });
      }

      if (transition.decision === "allowed") {
        const priorAccepted =
          acceptedSequences.get(
            transition.actorIdentityCommitment,
          ) ?? -1;
        assertCondition(
          transition.accessRecord.senderSequence ===
            priorAccepted + 1 &&
            !acceptedNonces.has(
              transition.accessRecord
                .nonceCommitment,
            ),
          "REPLAY_DETECTED",
          "Accepted vault sequence or nonce is not monotonic",
        );
        acceptedSequences.set(
          transition.actorIdentityCommitment,
          transition.accessRecord.senderSequence,
        );
        acceptedNonces.add(
          transition.accessRecord.nonceCommitment,
        );
      }
      entries.push({
        journal,
        payload: transition,
      });
      records.push({ journal, transition });
    }
    this.#taskCache = new Map(tasks);
    return {
      entries,
      records,
      head:
        journalRecords.at(-1)?.recordHash ?? null,
      latestFence,
      tasks,
      acceptedSequences,
      acceptedNonces,
      usedCapabilities,
      requests,
    };
  }

  async #injectCasCrash(
    phase: CasAppendPhase,
  ): Promise<void> {
    switch (phase) {
      case "before_append":
        await this.#injectCrash(
          "before_state_append",
        );
        break;
      case "during_append":
        await this.#injectCrash(
          "during_state_append",
        );
        break;
      case "after_publish_before_sync":
        await this.#injectCrash(
          "after_state_publish_before_sync",
        );
        break;
      case "after_sync":
        await this.#injectCrash(
          "after_state_sync_before_verify",
        );
        break;
    }
  }

  async #injectCrash(
    phase: VaultCrashPhase,
  ): Promise<void> {
    if (this.#crashInjector === undefined) return;
    try {
      await this.#crashInjector(phase);
    } catch (error) {
      throw new VaultCrashSignal(phase, error);
    }
  }
}

export function vaultAccessLogHead(
  records: readonly CasAppendOnlyRecord<JsonValue>[],
): string | null {
  return records.at(-1)?.recordHash ?? null;
}
