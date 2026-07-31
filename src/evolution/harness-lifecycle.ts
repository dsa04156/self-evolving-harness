import path from "node:path";

import { sha256, type JsonValue } from "../core/canonical.js";
import type { Clock, IdFactory } from "../core/determinism.js";
import { assertCondition } from "../core/errors.js";
import { SCHEMA_BASE_URL, type SchemaRegistry } from "../contracts/schema-registry.js";
import type { HarnessQualificationState } from "../domain/runtime.js";
import { type AuditLink, AuditTrail } from "../evidence/audit-trail.js";
import type { EvidenceReceiptStore } from "../evidence/receipts.js";
import { AppendOnlyLog } from "../storage/append-only-log.js";
import type {
  Attestation,
  PrincipalIdentity,
  PrincipalRegistry,
  PrincipalRole,
  PrincipalSigner,
} from "../trust/identity.js";
import { NonPromotableHarnessRegistry } from "../governance/non-promotable-harness.js";
import type { HarnessReferenceLedger } from "./reference-ledger.js";

export const HARNESS_LIFECYCLE_SCHEMA_ID =
  `${SCHEMA_BASE_URL}harness-lifecycle-record.schema.json`;

const TRANSITIONS: Readonly<
  Record<HarnessQualificationState, readonly HarnessQualificationState[]>
> = Object.freeze({
  draft: ["candidate", "rejected"],
  candidate: ["statically_validated", "rejected"],
  statically_validated: ["evaluating", "rejected"],
  evaluating: ["canary", "rejected"],
  canary: ["approved", "rejected"],
  approved: ["retired"],
  rejected: ["retired"],
  retired: [],
});

const ROLE_FOR_STATE: Readonly<
  Record<HarnessQualificationState, readonly PrincipalRole[]>
> = Object.freeze({
  draft: ["operations_owner", "proposer"],
  candidate: ["operations_owner", "proposer"],
  statically_validated: ["operations_owner"],
  evaluating: ["operations_owner"],
  canary: ["operations_owner"],
  approved: ["promoter"],
  rejected: ["promoter", "operations_owner"],
  retired: ["promoter", "operations_owner"],
});

export interface HarnessLifecycleRecord {
  readonly schemaVersion: 2;
  readonly recordId: string;
  readonly protocolId: string;
  readonly harnessVersionId: string;
  readonly fromState: HarnessQualificationState | null;
  readonly toState: HarnessQualificationState;
  readonly evidenceReceiptIds: readonly string[];
  readonly transitionedBy: PrincipalIdentity;
  readonly transitionedAt: string;
  readonly auditLink: AuditLink;
  readonly attestation: Attestation;
}

type RecordCore = Omit<HarnessLifecycleRecord, "auditLink" | "attestation">;
type SignedBody = Omit<HarnessLifecycleRecord, "attestation">;

function coreOf(record: HarnessLifecycleRecord): RecordCore {
  const { auditLink: _auditLink, attestation: _attestation, ...core } = record;
  return core;
}

function signedBodyOf(record: HarnessLifecycleRecord): SignedBody {
  const { attestation: _attestation, ...body } = record;
  return body;
}

function asRecord(value: JsonValue): HarnessLifecycleRecord {
  return value as unknown as HarnessLifecycleRecord;
}

export class HarnessQualificationStore {
  readonly #protocolId: string;
  readonly #schemas: SchemaRegistry;
  readonly #audit: AuditTrail;
  readonly #receipts: EvidenceReceiptStore;
  readonly #principals: PrincipalRegistry;
  readonly #clock: Clock;
  readonly #ids: IdFactory;
  readonly #log: AppendOnlyLog<JsonValue>;
  readonly #references: HarnessReferenceLedger | null;
  readonly #nonPromotable: NonPromotableHarnessRegistry;

  public constructor(input: {
    root: string;
    protocolId: string;
    schemas: SchemaRegistry;
    audit: AuditTrail;
    receipts: EvidenceReceiptStore;
    principals: PrincipalRegistry;
    clock: Clock;
    ids: IdFactory;
    references?: HarnessReferenceLedger;
  }) {
    this.#protocolId = input.protocolId;
    this.#schemas = input.schemas;
    this.#audit = input.audit;
    this.#receipts = input.receipts;
    this.#principals = input.principals;
    this.#clock = input.clock;
    this.#ids = input.ids;
    this.#references = input.references ?? null;
    this.#nonPromotable =
      new NonPromotableHarnessRegistry({
        root: input.root,
        schemas: input.schemas,
      });
    this.#log = new AppendOnlyLog<JsonValue>(
      path.join(input.root, "evolution"),
      "harness.lifecycle",
    );
  }

  public async createDraft(input: {
    harnessVersionId: string;
    evidenceReceiptIds: readonly string[];
    signer: PrincipalSigner;
  }): Promise<HarnessLifecycleRecord> {
    await this.#nonPromotable.assertQualificationAllowed(
      input.harnessVersionId,
    );
    assertCondition(
      (await this.records(input.harnessVersionId)).length === 0,
      "CONFLICT",
      "Harness lifecycle already exists",
    );
    return this.#append({
      harnessVersionId: input.harnessVersionId,
      fromState: null,
      toState: "draft",
      evidenceReceiptIds: input.evidenceReceiptIds,
      signer: input.signer,
    });
  }

  public async transition(input: {
    harnessVersionId: string;
    toState: HarnessQualificationState;
    evidenceReceiptIds: readonly string[];
    signer: PrincipalSigner;
  }): Promise<HarnessLifecycleRecord> {
    await this.#nonPromotable.assertQualificationAllowed(
      input.harnessVersionId,
    );
    const previous = (await this.records(input.harnessVersionId)).at(-1);
    assertCondition(previous !== undefined, "ARTIFACT_UNAVAILABLE", "Unknown harness lifecycle");
    assertCondition(
      TRANSITIONS[previous.toState].includes(input.toState),
      "INVALID_STATE_TRANSITION",
      `Harness cannot transition ${previous.toState} → ${input.toState}`,
    );
    if (input.toState === "retired" && this.#references !== null) {
      await this.#references.assertRetirable(input.harnessVersionId);
    }
    return this.#append({
      harnessVersionId: input.harnessVersionId,
      fromState: previous.toState,
      toState: input.toState,
      evidenceReceiptIds: input.evidenceReceiptIds,
      signer: input.signer,
    });
  }

  public async state(harnessVersionId: string): Promise<HarnessQualificationState> {
    const latest = (await this.records(harnessVersionId)).at(-1);
    assertCondition(latest !== undefined, "ARTIFACT_UNAVAILABLE", "Unknown harness lifecycle");
    return latest.toState;
  }

  public async records(harnessVersionId?: string): Promise<HarnessLifecycleRecord[]> {
    const records = (await this.#log.readAll()).map((entry) => asRecord(entry.payload));
    return harnessVersionId === undefined
      ? records
      : records.filter((record) => record.harnessVersionId === harnessVersionId);
  }

  public async verifyAll(): Promise<void> {
    const latest = new Map<string, HarnessLifecycleRecord>();
    for (const record of await this.records()) {
      this.#schemas.validate(HARNESS_LIFECYCLE_SCHEMA_ID, record as unknown as JsonValue);
      assertCondition(record.protocolId === this.#protocolId, "PROTOCOL_MISMATCH", "Protocol drift");
      this.#principals.verify(
        record.transitionedBy,
        signedBodyOf(record) as unknown as JsonValue,
        record.attestation,
      );
      await this.#audit.verifyLink(record.auditLink, {
        subjectType: "HarnessLifecycleRecord",
        subjectId: record.recordId,
        subjectHash: sha256(coreOf(record)),
      });
      for (const receiptId of record.evidenceReceiptIds) {
        const receipt = await this.#receipts.get(receiptId);
        await this.#receipts.verify(receipt);
        assertCondition(
          receipt.subjectIds.includes(record.harnessVersionId),
          "HASH_MISMATCH",
          "Lifecycle receipt does not bind harness",
        );
      }
      const previous = latest.get(record.harnessVersionId);
      this.#assertTransition(record, previous);
      latest.set(record.harnessVersionId, record);
    }
  }

  async #append(input: {
    harnessVersionId: string;
    fromState: HarnessQualificationState | null;
    toState: HarnessQualificationState;
    evidenceReceiptIds: readonly string[];
    signer: PrincipalSigner;
  }): Promise<HarnessLifecycleRecord> {
    assertCondition(
      ROLE_FOR_STATE[input.toState].includes(input.signer.identity.role),
      "AUTHORIZATION_DENIED",
      `${input.signer.identity.role} cannot enter ${input.toState}`,
    );
    assertCondition(
      input.evidenceReceiptIds.length > 0,
      "SCHEMA_INVALID",
      "Harness transition needs evidence",
    );
    for (const receiptId of input.evidenceReceiptIds) {
      const receipt = await this.#receipts.get(receiptId);
      await this.#receipts.verify(receipt);
      assertCondition(
        receipt.subjectIds.includes(input.harnessVersionId),
        "HASH_MISMATCH",
        "Harness receipt subject mismatch",
      );
    }
    const core: RecordCore = {
      schemaVersion: 2,
      recordId: this.#ids.next("harness-lifecycle"),
      protocolId: this.#protocolId,
      harnessVersionId: input.harnessVersionId,
      fromState: input.fromState,
      toState: input.toState,
      evidenceReceiptIds: [...new Set(input.evidenceReceiptIds)],
      transitionedBy: input.signer.identity,
      transitionedAt: this.#clock.now().toISOString(),
    };
    const auditLink = await this.#audit.appendSubject({
      subjectType: "HarnessLifecycleRecord",
      subjectId: core.recordId,
      subjectHash: sha256(core),
    });
    const body: SignedBody = { ...core, auditLink };
    const record: HarnessLifecycleRecord = {
      ...body,
      attestation: input.signer.attest(body as unknown as JsonValue),
    };
    this.#schemas.validate(HARNESS_LIFECYCLE_SCHEMA_ID, record as unknown as JsonValue);
    this.#assertTransition(record, (await this.records(input.harnessVersionId)).at(-1));
    await this.#log.append(record as unknown as JsonValue);
    return record;
  }

  #assertTransition(
    record: HarnessLifecycleRecord,
    previous: HarnessLifecycleRecord | undefined,
  ): void {
    if (previous === undefined) {
      assertCondition(
        record.fromState === null && record.toState === "draft",
        "INVALID_STATE_TRANSITION",
        "First harness lifecycle record must be draft",
      );
      return;
    }
    assertCondition(
      record.fromState === previous.toState &&
        TRANSITIONS[previous.toState].includes(record.toState),
      "INVALID_STATE_TRANSITION",
      `Invalid harness lifecycle transition ${record.fromState} → ${record.toState}`,
    );
  }
}
