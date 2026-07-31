import path from "node:path";

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
} from "../core/errors.js";
import {
  SCHEMA_BASE_URL,
  type SchemaRegistry,
} from "../contracts/schema-registry.js";
import {
  AppendOnlyLog,
  type AppendOnlyRecord,
} from "../storage/append-only-log.js";
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

export const OPAQUE_TASK_CAPABILITY_SCHEMA_ID =
  `${SCHEMA_BASE_URL}opaque-task-capability.schema.json`;
export const VAULT_ACCESS_REQUEST_SCHEMA_ID =
  `${SCHEMA_BASE_URL}vault-access-request.schema.json`;
export const VAULT_ACCESS_RECORD_SCHEMA_ID =
  `${SCHEMA_BASE_URL}vault-access-record.schema.json`;

export type VaultTaskState =
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

export interface VaultAuthorshipAdmission {
  readonly included: IndependentAuthorshipTransition;
  readonly previous: IndependentAuthorshipTransition;
}

interface PendingAuthorship {
  readonly authorshipRecordHash: string;
}

interface VaultTaskEntry {
  readonly authorshipRecordHash: string;
  readonly state: VaultTaskState;
  readonly evaluationCommitment: string | null;
  readonly scoreCommitment: string | null;
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

export class EvaluatorVault {
  readonly #contract: EvaluatorVaultContract;
  readonly #schemas: SchemaRegistry;
  readonly #vaultSigner: PrincipalSigner;
  readonly #accessLog: AppendOnlyLog<JsonValue>;
  readonly #pending = new Map<string, PendingAuthorship>();
  readonly #tasks = new Map<string, VaultTaskEntry>();
  readonly #usedCapabilities = new Set<string>();
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
    this.#accessLog = new AppendOnlyLog<JsonValue>(
      path.join(input.root, "vault-access"),
      `vault-access.${input.contract.contractId}`,
    );
  }

  public issueUnlockCapability(input: {
    readonly capabilityId: string;
    readonly taskHandle: string;
    readonly issuedAt: string;
    readonly expiresAt: string;
    readonly nonce: string;
  }): OpaqueTaskCapability {
    const task = this.#tasks.get(input.taskHandle);
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
    const priorRecords = await this.#accessLog.readAll();
    const priorAccessRecords = priorRecords.map((entry) => {
      const record =
        entry.payload as unknown as VaultAccessRecord;
      verifyVaultAccessRecord({
        record,
        contract: this.#contract,
        schemas: this.#schemas,
      });
      return record;
    });
    const observedRequestHash = sha256(
      requestCore(request) as unknown as JsonValue,
    );
    const stateBefore =
      request.taskHandle === null
        ? null
        : (this.#tasks.get(request.taskHandle)?.state ??
          null);
    let stateAfter = stateBefore;
    let releaseRecord = emptyRelease();
    let releasedCommitments: readonly string[] = [];
    let allowedMutation:
      | (() => void)
      | null = null;
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
        priorAccessRecords,
      );

      switch (request.action) {
        case "create": {
          assertOpaqueHandle(request.taskHandle);
          assertCondition(
            !this.#pending.has(request.taskHandle) &&
              !this.#tasks.has(request.taskHandle) &&
              this.#authorshipAdmissions.get(
                sha256Text(request.taskHandle),
              ) === request.subjectCommitment,
            "AUTHORIZATION_DENIED",
            "Opaque task is not bound to an included authorship admission",
          );
          const authorshipRecordHash =
            request.subjectCommitment!;
          allowedMutation = () => {
            this.#pending.set(request.taskHandle!, {
              authorshipRecordHash,
            });
          };
          break;
        }
        case "seal": {
          assertOpaqueHandle(request.taskHandle);
          const pending = this.#pending.get(
            request.taskHandle,
          );
          assertCondition(
            pending !== undefined &&
              pending.authorshipRecordHash ===
                request.subjectCommitment &&
              !this.#tasks.has(request.taskHandle),
            "AUTHORIZATION_DENIED",
            "Seal request lacks the admitted authorship commitment",
          );
          stateAfter = "sealed";
          allowedMutation = () => {
            this.#pending.delete(request.taskHandle!);
            this.#tasks.set(request.taskHandle!, {
              authorshipRecordHash:
                pending.authorshipRecordHash,
              state: "sealed",
              evaluationCommitment: null,
              scoreCommitment: null,
            });
          };
          break;
        }
        case "enumerate": {
          releasedCommitments = [
            ...this.#tasks.keys(),
          ]
            .map((handle) => sha256Text(handle))
            .sort();
          releaseRecord = release(
            "opaque_handle_commitments",
            "vault",
            ["taskHandleCommitments"],
          );
          break;
        }
        case "unlock": {
          assertOpaqueHandle(request.taskHandle);
          const task = this.#tasks.get(
            request.taskHandle,
          );
          assertCondition(
            task?.state === "sealed",
            "INVALID_STATE_TRANSITION",
            "Task must be sealed before unlock",
          );
          const capability = request.capability!;
          assertCondition(
            !this.#usedCapabilities.has(
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
          allowedMutation = () => {
            this.#usedCapabilities.add(
              capability.capabilityHash,
            );
            this.#tasks.set(request.taskHandle!, {
              ...task,
              state: "unlocked",
            });
          };
          break;
        }
        case "evaluate": {
          assertOpaqueHandle(request.taskHandle);
          const task = this.#tasks.get(
            request.taskHandle,
          );
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
          allowedMutation = () => {
            this.#tasks.set(request.taskHandle!, {
              ...task,
              state: "evaluated",
              evaluationCommitment,
            });
          };
          break;
        }
        case "score": {
          assertOpaqueHandle(request.taskHandle);
          const task = this.#tasks.get(
            request.taskHandle,
          );
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
          allowedMutation = () => {
            this.#tasks.set(request.taskHandle!, {
              ...task,
              state: "scored",
              scoreCommitment,
            });
          };
          break;
        }
        case "audit": {
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
      allowedMutation = null;
    }

    const accessRecord = this.#createAccessRecord({
      sequence: priorRecords.length,
      request,
      observedRequestHash,
      decision: failure === null ? "allowed" : "denied",
      reasonCode: failure?.code ?? "ALLOWED",
      stateBefore,
      stateAfter,
      release: releaseRecord,
    });
    const appended = await this.#accessLog.append(
      accessRecord as unknown as JsonValue,
    );
    allowedMutation?.();
    if (
      failure === null &&
      request.action === "audit"
    ) {
      releasedCommitments = [appended.recordHash];
    }
    if (failure !== null) throw failure;
    return { accessRecord, releasedCommitments };
  }

  public async readAccessLedger(): Promise<
    readonly VaultAccessRecord[]
  > {
    const records = await this.#accessLog.readAll();
    return records.map((entry) => {
      const record =
        entry.payload as unknown as VaultAccessRecord;
      verifyVaultAccessRecord({
        record,
        contract: this.#contract,
        schemas: this.#schemas,
      });
      return record;
    });
  }

  public taskState(
    taskHandle: string,
  ): VaultTaskState | null {
    return this.#tasks.get(taskHandle)?.state ?? null;
  }

  #assertFreshRequest(
    request: VaultAccessRequest,
    records: readonly VaultAccessRecord[],
  ): void {
    const channel = `${request.actor.principalId}\0${request.actor.instanceId}`;
    const actorIdentityCommitment = sha256(
      request.actor as unknown as JsonValue,
    );
    const accepted = records.filter(
      (record) =>
        record.decision === "allowed" &&
        record.actorIdentityCommitment ===
          actorIdentityCommitment,
    );
    const expected =
      Math.max(
        -1,
        ...accepted.map(
          (record) => record.senderSequence,
        ),
      ) + 1;
    assertCondition(
      request.senderSequence === expected,
      "REPLAY_DETECTED",
      `Expected vault sender sequence ${expected}`,
    );
    const nonceCommitment = sha256Text(
      `${channel}\0${request.nonce}`,
    );
    assertCondition(
      !accepted.some(
        (record) =>
          record.nonceCommitment === nonceCommitment,
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
}

export function vaultAccessLogHead(
  records: readonly AppendOnlyRecord<JsonValue>[],
): string | null {
  return records.at(-1)?.recordHash ?? null;
}
