import path from "node:path";

import { sha256, type JsonValue } from "../core/canonical.js";
import type { Clock, IdFactory } from "../core/determinism.js";
import { assertCondition } from "../core/errors.js";
import { SCHEMA_BASE_URL, type SchemaRegistry } from "../contracts/schema-registry.js";
import type { SessionPins, SessionState, TerminationReason } from "../domain/runtime.js";
import { type AuditLink, AuditTrail } from "../evidence/audit-trail.js";
import type { EvidenceReceiptStore } from "../evidence/receipts.js";
import { AppendOnlyLog } from "../storage/append-only-log.js";
import type {
  Attestation,
  PrincipalIdentity,
  PrincipalRegistry,
  PrincipalSigner,
} from "../trust/identity.js";

export const SESSION_LIFECYCLE_SCHEMA_ID =
  `${SCHEMA_BASE_URL}session-lifecycle-record.schema.json`;

const TRANSITIONS: Readonly<Record<SessionState, readonly SessionState[]>> = Object.freeze({
  created: ["initialized", "retired", "terminating"],
  initialized: ["running", "blocked", "terminating"],
  running: ["waiting", "validating", "blocked", "recovering", "terminating"],
  waiting: ["running", "blocked", "recovering", "terminating"],
  blocked: ["recovering", "terminating"],
  recovering: ["initialized", "running", "blocked", "terminating"],
  validating: ["completed", "running", "blocked", "terminating"],
  completed: ["retired", "terminating"],
  terminating: ["terminated"],
  retired: [],
  terminated: [],
});

export interface SessionTerminationTransaction {
  readonly terminationTransactionId: string;
  readonly initiatingRecordId: string;
  readonly preTerminationState: Exclude<
    SessionState,
    "retired" | "terminating" | "terminated"
  >;
  readonly initiatingPrincipal: PrincipalIdentity;
  readonly reason: TerminationReason;
}

export interface SessionTerminationCompletion {
  readonly descendantLeasesRevoked: true;
  readonly capabilitiesRevoked: true;
  readonly backendJobsStopped: true;
  readonly accountingSealed: true;
  readonly finalEvidenceReceiptId: string;
}

export interface SessionLifecycleRecord {
  readonly schemaVersion: 2;
  readonly recordId: string;
  readonly protocolId: string;
  readonly sessionId: string;
  readonly harnessVersionId: string;
  readonly runtimeStateSnapshotId: string;
  readonly fromState: SessionState | null;
  readonly toState: SessionState;
  readonly terminationReason: TerminationReason | null;
  readonly terminationTransaction: SessionTerminationTransaction | null;
  readonly termination: SessionTerminationCompletion | null;
  readonly evidenceReceiptIds: readonly string[];
  readonly transitionedBy: PrincipalIdentity;
  readonly transitionedAt: string;
  readonly auditLink: AuditLink;
  readonly attestation: Attestation;
}

type RecordCore = Omit<SessionLifecycleRecord, "auditLink" | "attestation">;
type SignedBody = Omit<SessionLifecycleRecord, "attestation">;

function coreOf(record: SessionLifecycleRecord): RecordCore {
  const { auditLink: _auditLink, attestation: _attestation, ...core } = record;
  return core;
}

function signedBodyOf(record: SessionLifecycleRecord): SignedBody {
  const { attestation: _attestation, ...body } = record;
  return body;
}

function asLifecycleRecord(value: JsonValue): SessionLifecycleRecord {
  return value as unknown as SessionLifecycleRecord;
}

export class SessionLifecycleStore {
  readonly #protocolId: string;
  readonly #schemas: SchemaRegistry;
  readonly #audit: AuditTrail;
  readonly #receipts: EvidenceReceiptStore;
  readonly #principals: PrincipalRegistry;
  readonly #clock: Clock;
  readonly #ids: IdFactory;
  readonly #log: AppendOnlyLog<JsonValue>;

  public constructor(input: {
    root: string;
    protocolId: string;
    schemas: SchemaRegistry;
    audit: AuditTrail;
    receipts: EvidenceReceiptStore;
    principals: PrincipalRegistry;
    clock: Clock;
    ids: IdFactory;
  }) {
    this.#protocolId = input.protocolId;
    this.#schemas = input.schemas;
    this.#audit = input.audit;
    this.#receipts = input.receipts;
    this.#principals = input.principals;
    this.#clock = input.clock;
    this.#ids = input.ids;
    this.#log = new AppendOnlyLog<JsonValue>(
      path.join(input.root, "operations"),
      "sessions.lifecycle",
    );
  }

  public async create(input: {
    sessionId: string;
    pins: SessionPins;
    evidenceReceiptIds: readonly string[];
    signer: PrincipalSigner;
  }): Promise<SessionLifecycleRecord> {
    assertCondition(
      (await this.records(input.sessionId)).length === 0,
      "CONFLICT",
      "Session already exists",
    );
    return this.#append({
      sessionId: input.sessionId,
      pins: input.pins,
      fromState: null,
      toState: "created",
      evidenceReceiptIds: input.evidenceReceiptIds,
      signer: input.signer,
      terminationReason: null,
      terminationTransaction: null,
      termination: null,
    });
  }

  public async transition(input: {
    sessionId: string;
    toState: Exclude<SessionState, "terminating" | "terminated">;
    evidenceReceiptIds: readonly string[];
    signer: PrincipalSigner;
  }): Promise<SessionLifecycleRecord> {
    const existing = await this.records(input.sessionId);
    const previous = existing.at(-1);
    assertCondition(previous !== undefined, "ARTIFACT_UNAVAILABLE", "Unknown session");
    assertCondition(
      TRANSITIONS[previous.toState].includes(input.toState),
      "INVALID_STATE_TRANSITION",
      `Session cannot transition ${previous.toState} → ${input.toState}`,
    );
    return this.#append({
      sessionId: input.sessionId,
      pins: {
        protocolId: previous.protocolId,
        harnessVersionId: previous.harnessVersionId,
        runtimeStateSnapshotId: previous.runtimeStateSnapshotId,
      },
      fromState: previous.toState,
      toState: input.toState,
      evidenceReceiptIds: input.evidenceReceiptIds,
      signer: input.signer,
      terminationReason: null,
      terminationTransaction: null,
      termination: null,
    });
  }

  public async beginTermination(input: {
    sessionId: string;
    reason: TerminationReason;
    evidenceReceiptIds: readonly string[];
    signer: PrincipalSigner;
  }): Promise<SessionLifecycleRecord> {
    const previous = (await this.records(input.sessionId)).at(-1);
    assertCondition(previous !== undefined, "ARTIFACT_UNAVAILABLE", "Unknown session");
    assertCondition(
      TRANSITIONS[previous.toState].includes("terminating") &&
        previous.toState !== "terminating" &&
        previous.toState !== "terminated" &&
        previous.toState !== "retired",
      "INVALID_STATE_TRANSITION",
      `Session cannot terminate from ${previous.toState}`,
    );
    const recordId = this.#ids.next("session-lifecycle");
    const descriptor: SessionTerminationTransaction = {
      terminationTransactionId: this.#ids.next("termination"),
      initiatingRecordId: recordId,
      preTerminationState: previous.toState,
      initiatingPrincipal: input.signer.identity,
      reason: input.reason,
    };
    return this.#append({
      recordId,
      sessionId: input.sessionId,
      pins: {
        protocolId: previous.protocolId,
        harnessVersionId: previous.harnessVersionId,
        runtimeStateSnapshotId: previous.runtimeStateSnapshotId,
      },
      fromState: previous.toState,
      toState: "terminating",
      evidenceReceiptIds: input.evidenceReceiptIds,
      signer: input.signer,
      terminationReason: input.reason,
      terminationTransaction: descriptor,
      termination: null,
    });
  }

  public async completeTermination(input: {
    sessionId: string;
    finalEvidenceReceiptId: string;
    additionalEvidenceReceiptIds?: readonly string[];
    signer: PrincipalSigner;
  }): Promise<SessionLifecycleRecord> {
    const existing = await this.records(input.sessionId);
    const initiating = existing.at(-1);
    assertCondition(
      initiating !== undefined &&
        initiating.toState === "terminating" &&
        initiating.terminationTransaction !== null &&
        initiating.terminationReason !== null,
      "INVALID_STATE_TRANSITION",
      "Session has no open termination transaction",
    );
    const evidenceReceiptIds = [
      ...initiating.evidenceReceiptIds,
      ...(input.additionalEvidenceReceiptIds ?? []),
      input.finalEvidenceReceiptId,
    ];
    return this.#append({
      recordId: `${initiating.terminationTransaction.terminationTransactionId}.completed`,
      transitionedAt: initiating.transitionedAt,
      sessionId: input.sessionId,
      pins: {
        protocolId: initiating.protocolId,
        harnessVersionId: initiating.harnessVersionId,
        runtimeStateSnapshotId: initiating.runtimeStateSnapshotId,
      },
      fromState: "terminating",
      toState: "terminated",
      evidenceReceiptIds: [...new Set(evidenceReceiptIds)],
      signer: input.signer,
      terminationReason: initiating.terminationReason,
      terminationTransaction: initiating.terminationTransaction,
      termination: {
        descendantLeasesRevoked: true,
        capabilitiesRevoked: true,
        backendJobsStopped: true,
        accountingSealed: true,
        finalEvidenceReceiptId: input.finalEvidenceReceiptId,
      },
    });
  }

  public async records(sessionId?: string): Promise<SessionLifecycleRecord[]> {
    const records = (await this.#log.readAll()).map((entry) => asLifecycleRecord(entry.payload));
    return sessionId === undefined
      ? records
      : records.filter((record) => record.sessionId === sessionId);
  }

  public async state(sessionId: string): Promise<SessionState> {
    const latest = (await this.records(sessionId)).at(-1);
    assertCondition(latest !== undefined, "ARTIFACT_UNAVAILABLE", "Unknown session");
    return latest.toState;
  }

  public async verifyAll(): Promise<void> {
    const projected = new Map<string, SessionLifecycleRecord[]>();
    for (const record of await this.records()) {
      this.#schemas.validate(SESSION_LIFECYCLE_SCHEMA_ID, record as unknown as JsonValue);
      assertCondition(
        record.protocolId === this.#protocolId,
        "PROTOCOL_MISMATCH",
        "Session lifecycle protocol mismatch",
      );
      this.#principals.verify(
        record.transitionedBy,
        signedBodyOf(record) as unknown as JsonValue,
        record.attestation,
      );
      await this.#audit.verifyLink(record.auditLink, {
        subjectType: "SessionLifecycleRecord",
        subjectId: record.recordId,
        subjectHash: sha256(coreOf(record)),
      });
      for (const receiptId of record.evidenceReceiptIds) {
        await this.#receipts.verify(await this.#receipts.get(receiptId));
      }
      const prior = projected.get(record.sessionId) ?? [];
      this.#verifyAgainstPrior(record, prior);
      prior.push(record);
      projected.set(record.sessionId, prior);
    }
  }

  async #append(input: {
    recordId?: string;
    transitionedAt?: string;
    sessionId: string;
    pins: Pick<SessionPins, "protocolId" | "harnessVersionId" | "runtimeStateSnapshotId">;
    fromState: SessionState | null;
    toState: SessionState;
    terminationReason: TerminationReason | null;
    terminationTransaction: SessionTerminationTransaction | null;
    termination: SessionTerminationCompletion | null;
    evidenceReceiptIds: readonly string[];
    signer: PrincipalSigner;
  }): Promise<SessionLifecycleRecord> {
    assertCondition(
      input.signer.identity.role === "operations_owner",
      "AUTHORIZATION_DENIED",
      "Only operations owner may transition session lifecycle",
    );
    assertCondition(
      input.pins.protocolId === this.#protocolId,
      "PROTOCOL_MISMATCH",
      "Session lifecycle pin mismatch",
    );
    assertCondition(
      input.evidenceReceiptIds.length > 0,
      "SCHEMA_INVALID",
      "Lifecycle transition needs evidence",
    );
    for (const receiptId of input.evidenceReceiptIds) {
      const receipt = await this.#receipts.get(receiptId);
      await this.#receipts.verify(receipt);
      assertCondition(
        receipt.subjectIds.includes(input.sessionId),
        "HASH_MISMATCH",
        "Lifecycle receipt does not bind the session",
      );
    }
    const core: RecordCore = {
      schemaVersion: 2,
      recordId: input.recordId ?? this.#ids.next("session-lifecycle"),
      protocolId: input.pins.protocolId,
      sessionId: input.sessionId,
      harnessVersionId: input.pins.harnessVersionId,
      runtimeStateSnapshotId: input.pins.runtimeStateSnapshotId,
      fromState: input.fromState,
      toState: input.toState,
      terminationReason: input.terminationReason,
      terminationTransaction: input.terminationTransaction,
      termination: input.termination,
      evidenceReceiptIds: [...new Set(input.evidenceReceiptIds)],
      transitionedBy: input.signer.identity,
      transitionedAt: input.transitionedAt ?? this.#clock.now().toISOString(),
    };
    const auditLink = await this.#audit.appendSubject({
      subjectType: "SessionLifecycleRecord",
      subjectId: core.recordId,
      subjectHash: sha256(core),
    });
    const signedBody: SignedBody = { ...core, auditLink };
    const record: SessionLifecycleRecord = {
      ...signedBody,
      attestation: input.signer.attest(signedBody as unknown as JsonValue),
    };
    this.#schemas.validate(SESSION_LIFECYCLE_SCHEMA_ID, record as unknown as JsonValue);
    const prior = await this.records(input.sessionId);
    this.#verifyAgainstPrior(record, prior);
    await this.#log.append(record as unknown as JsonValue);
    return record;
  }

  #verifyAgainstPrior(
    record: SessionLifecycleRecord,
    prior: readonly SessionLifecycleRecord[],
  ): void {
    const previous = prior.at(-1);
    if (previous === undefined) {
      assertCondition(
        record.fromState === null && record.toState === "created",
        "INVALID_STATE_TRANSITION",
        "First lifecycle record must create the session",
      );
      return;
    }
    assertCondition(
      record.fromState === previous.toState &&
        TRANSITIONS[previous.toState].includes(record.toState),
      "INVALID_STATE_TRANSITION",
      `Invalid persisted transition ${record.fromState} → ${record.toState}`,
    );
    assertCondition(
      record.protocolId === previous.protocolId &&
        record.harnessVersionId === previous.harnessVersionId &&
        record.runtimeStateSnapshotId === previous.runtimeStateSnapshotId,
      "PROTOCOL_MISMATCH",
      "Session pins changed across lifecycle records",
    );
    if (record.toState === "terminating") {
      const descriptor = record.terminationTransaction;
      assertCondition(descriptor !== null, "SCHEMA_INVALID", "Missing termination descriptor");
      assertCondition(
        descriptor.initiatingRecordId === record.recordId &&
          descriptor.preTerminationState === record.fromState &&
          descriptor.reason === record.terminationReason &&
          sha256(descriptor.initiatingPrincipal) === sha256(record.transitionedBy),
        "HASH_MISMATCH",
        "Invalid initiating termination descriptor",
      );
      assertCondition(
        !prior.some(
          (candidate) =>
            candidate.terminationTransaction?.terminationTransactionId ===
            descriptor.terminationTransactionId,
        ),
        "CONFLICT",
        "Duplicate termination transaction",
      );
    }
    if (record.toState === "terminated") {
      const descriptor = record.terminationTransaction;
      assertCondition(
        previous.toState === "terminating" &&
          descriptor !== null &&
          previous.terminationTransaction !== null &&
          sha256(descriptor) === sha256(previous.terminationTransaction) &&
          descriptor.initiatingRecordId === previous.recordId &&
          record.terminationReason === previous.terminationReason &&
          previous.evidenceReceiptIds.every((id) => record.evidenceReceiptIds.includes(id)),
        "HASH_MISMATCH",
        "Termination completion changed its initiating transaction",
      );
    }
  }
}
