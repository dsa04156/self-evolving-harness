import path from "node:path";

import { sha256, type JsonValue } from "../core/canonical.js";
import type { Clock, IdFactory } from "../core/determinism.js";
import { assertCondition } from "../core/errors.js";
import { SCHEMA_BASE_URL, type SchemaRegistry } from "../contracts/schema-registry.js";
import type { ArtifactReference } from "../domain/components.js";
import { AppendOnlyLog } from "../storage/append-only-log.js";
import type {
  Attestation,
  PrincipalIdentity,
  PrincipalRegistry,
  PrincipalSigner,
} from "../trust/identity.js";
import { type AuditLink, AuditTrail } from "./audit-trail.js";

export const EVIDENCE_RECEIPT_SCHEMA_ID = `${SCHEMA_BASE_URL}evidence-receipt.schema.json`;

export type ReceiptType =
  | "session_initialization"
  | "session_checkpoint"
  | "session_completion"
  | "static_validation"
  | "evaluation"
  | "gate_release"
  | "promotion"
  | "rejection"
  | "rollback"
  | "artifact_retention"
  | "budget_usage"
  | "audit_replay"
  | "protocol_freeze";

export interface EvidenceReceipt {
  readonly schemaVersion: 2;
  readonly receiptId: string;
  readonly protocolId: string;
  readonly receiptType: ReceiptType;
  readonly subjectIds: readonly string[];
  readonly harnessVersionIds: readonly string[];
  readonly runtimeStateSnapshotIds: readonly string[];
  readonly eventRanges: readonly {
    readonly sessionId: string;
    readonly firstSequence: number;
    readonly lastSequence: number;
    readonly headHash: string;
  }[];
  readonly recordedObservationEventIds: readonly string[];
  readonly verifierOutcomeEventIds: readonly string[];
  readonly inferenceEventIds: readonly string[];
  readonly artifactRefs: readonly ArtifactReference[];
  readonly producer: PrincipalIdentity;
  readonly createdAt: string;
  readonly receiptHash: string;
  readonly auditLink: AuditLink;
  readonly attestation: Attestation;
}

type ReceiptCore = Omit<EvidenceReceipt, "receiptHash" | "auditLink" | "attestation">;
type ReceiptSignedBody = Omit<EvidenceReceipt, "attestation">;

function receiptCore(receipt: EvidenceReceipt): ReceiptCore {
  const {
    receiptHash: _receiptHash,
    auditLink: _auditLink,
    attestation: _attestation,
    ...core
  } = receipt;
  return core;
}

function receiptSignedBody(receipt: EvidenceReceipt): ReceiptSignedBody {
  const { attestation: _attestation, ...body } = receipt;
  return body;
}

function asReceipt(value: JsonValue): EvidenceReceipt {
  return value as unknown as EvidenceReceipt;
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

export class EvidenceReceiptStore {
  readonly #protocolId: string;
  readonly #schemas: SchemaRegistry;
  readonly #audit: AuditTrail;
  readonly #principals: PrincipalRegistry;
  readonly #clock: Clock;
  readonly #ids: IdFactory;
  readonly #log: AppendOnlyLog<JsonValue>;

  public constructor(input: {
    root: string;
    protocolId: string;
    schemas: SchemaRegistry;
    audit: AuditTrail;
    principals: PrincipalRegistry;
    clock: Clock;
    ids: IdFactory;
  }) {
    this.#protocolId = input.protocolId;
    this.#schemas = input.schemas;
    this.#audit = input.audit;
    this.#principals = input.principals;
    this.#clock = input.clock;
    this.#ids = input.ids;
    this.#log = new AppendOnlyLog<JsonValue>(path.join(input.root, "evidence"), "receipts.main");
  }

  public async create(input: {
    receiptType: ReceiptType;
    subjectIds: readonly string[];
    harnessVersionIds?: readonly string[];
    runtimeStateSnapshotIds?: readonly string[];
    eventRanges?: EvidenceReceipt["eventRanges"];
    recordedObservationEventIds?: readonly string[];
    verifierOutcomeEventIds?: readonly string[];
    inferenceEventIds?: readonly string[];
    artifactRefs?: readonly ArtifactReference[];
    signer: PrincipalSigner;
  }): Promise<EvidenceReceipt> {
    assertCondition(input.subjectIds.length > 0, "SCHEMA_INVALID", "Receipt needs a subject");
    for (const range of input.eventRanges ?? []) {
      assertCondition(
        range.firstSequence <= range.lastSequence,
        "SCHEMA_INVALID",
        "Receipt event range is inverted",
      );
    }
    const core: ReceiptCore = {
      schemaVersion: 2,
      receiptId: this.#ids.next("receipt"),
      protocolId: this.#protocolId,
      receiptType: input.receiptType,
      subjectIds: uniqueSorted(input.subjectIds),
      harnessVersionIds: uniqueSorted(input.harnessVersionIds ?? []),
      runtimeStateSnapshotIds: uniqueSorted(input.runtimeStateSnapshotIds ?? []),
      eventRanges: [...(input.eventRanges ?? [])],
      recordedObservationEventIds: uniqueSorted(input.recordedObservationEventIds ?? []),
      verifierOutcomeEventIds: uniqueSorted(input.verifierOutcomeEventIds ?? []),
      inferenceEventIds: uniqueSorted(input.inferenceEventIds ?? []),
      artifactRefs: [...(input.artifactRefs ?? [])],
      producer: input.signer.identity,
      createdAt: this.#clock.now().toISOString(),
    };
    const receiptHash = sha256(core);
    const auditLink = await this.#audit.appendSubject({
      subjectType: "EvidenceReceipt",
      subjectId: core.receiptId,
      subjectHash: receiptHash,
    });
    const signedBody: ReceiptSignedBody = { ...core, receiptHash, auditLink };
    const receipt: EvidenceReceipt = {
      ...signedBody,
      attestation: input.signer.attest(signedBody as unknown as JsonValue),
    };
    this.#schemas.validate(EVIDENCE_RECEIPT_SCHEMA_ID, receipt as unknown as JsonValue);
    await this.#log.append(receipt as unknown as JsonValue);
    return receipt;
  }

  public async all(): Promise<EvidenceReceipt[]> {
    return (await this.#log.readAll()).map((record) => asReceipt(record.payload));
  }

  public async get(receiptId: string): Promise<EvidenceReceipt> {
    const receipt = (await this.all()).find((candidate) => candidate.receiptId === receiptId);
    assertCondition(receipt !== undefined, "ARTIFACT_UNAVAILABLE", `Missing receipt ${receiptId}`);
    return receipt;
  }

  public async verify(receipt: EvidenceReceipt): Promise<void> {
    this.#schemas.validate(EVIDENCE_RECEIPT_SCHEMA_ID, receipt as unknown as JsonValue);
    assertCondition(
      receipt.protocolId === this.#protocolId,
      "PROTOCOL_MISMATCH",
      "Receipt protocol mismatch",
    );
    assertCondition(
      receipt.receiptHash === sha256(receiptCore(receipt)),
      "HASH_MISMATCH",
      "Receipt hash mismatch",
    );
    this.#principals.verify(
      receipt.producer,
      receiptSignedBody(receipt) as unknown as JsonValue,
      receipt.attestation,
    );
    await this.#audit.verifyLink(receipt.auditLink, {
      subjectType: "EvidenceReceipt",
      subjectId: receipt.receiptId,
      subjectHash: receipt.receiptHash,
    });
  }

  public async verifyAll(): Promise<void> {
    const ids = new Set<string>();
    for (const receipt of await this.all()) {
      assertCondition(!ids.has(receipt.receiptId), "CONFLICT", "Duplicate receipt ID");
      ids.add(receipt.receiptId);
      await this.verify(receipt);
    }
  }
}
