import path from "node:path";

import { sha256, type JsonValue } from "../core/canonical.js";
import type { Clock, IdFactory } from "../core/determinism.js";
import { assertCondition } from "../core/errors.js";
import { SCHEMA_BASE_URL, type SchemaRegistry } from "../contracts/schema-registry.js";
import { type AuditLink, AuditTrail } from "../evidence/audit-trail.js";
import { AppendOnlyLog } from "../storage/append-only-log.js";
import type {
  Attestation,
  PrincipalIdentity,
  PrincipalRegistry,
  PrincipalRole,
  PrincipalSigner,
} from "../trust/identity.js";

export const HARNESS_REFERENCE_SCHEMA_ID =
  `${SCHEMA_BASE_URL}harness-reference-record.schema.json`;

export type HarnessReferenceKind =
  | "production_target"
  | "rollback_target"
  | "live_session"
  | "live_descendant"
  | "pending_evaluation"
  | "pending_deployment";

export interface HarnessReferenceRecord {
  readonly schemaVersion: 1;
  readonly referenceRecordId: string;
  readonly protocolId: string;
  readonly holdId: string;
  readonly harnessVersionId: string;
  readonly holdKind: HarnessReferenceKind;
  readonly subjectId: string;
  readonly action: "acquire" | "release";
  readonly createdBy: PrincipalIdentity;
  readonly createdAt: string;
  readonly auditLink: AuditLink;
  readonly attestation: Attestation;
}

type ReferenceCore = Omit<HarnessReferenceRecord, "auditLink" | "attestation">;
type SignedBody = Omit<HarnessReferenceRecord, "attestation">;

const AUTHORITY: Readonly<Record<HarnessReferenceKind, readonly PrincipalRole[]>> =
  Object.freeze({
    production_target: ["operations_owner"],
    rollback_target: ["operations_owner"],
    live_session: ["operations_owner"],
    live_descendant: ["operations_owner", "runtime"],
    pending_evaluation: ["operations_owner", "evaluator"],
    pending_deployment: ["operations_owner", "promoter"],
  });

function asRecord(value: JsonValue): HarnessReferenceRecord {
  return value as unknown as HarnessReferenceRecord;
}

function coreOf(record: HarnessReferenceRecord): ReferenceCore {
  const { auditLink: _auditLink, attestation: _attestation, ...core } = record;
  return core;
}

function signedBodyOf(record: HarnessReferenceRecord): SignedBody {
  const { attestation: _attestation, ...body } = record;
  return body;
}

function sameIdentity(
  record: HarnessReferenceRecord,
  input: {
    holdId: string;
    harnessVersionId: string;
    holdKind: HarnessReferenceKind;
    subjectId: string;
  },
): boolean {
  return (
    record.holdId === input.holdId &&
    record.harnessVersionId === input.harnessVersionId &&
    record.holdKind === input.holdKind &&
    record.subjectId === input.subjectId
  );
}

export class HarnessReferenceLedger {
  readonly #protocolId: string;
  readonly #schemas: SchemaRegistry;
  readonly #audit: AuditTrail;
  readonly #principals: PrincipalRegistry;
  readonly #clock: Clock;
  readonly #ids: IdFactory;
  readonly #log: AppendOnlyLog<JsonValue>;
  #queue: Promise<void> = Promise.resolve();

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
    this.#log = new AppendOnlyLog<JsonValue>(
      path.join(input.root, "evolution"),
      "harness.references",
    );
  }

  public acquire(input: {
    holdId: string;
    harnessVersionId: string;
    holdKind: HarnessReferenceKind;
    subjectId: string;
    signer: PrincipalSigner;
  }): Promise<HarnessReferenceRecord> {
    return this.#serialized(() => this.#change({ ...input, action: "acquire" }));
  }

  public release(input: {
    holdId: string;
    harnessVersionId: string;
    holdKind: HarnessReferenceKind;
    subjectId: string;
    signer: PrincipalSigner;
  }): Promise<HarnessReferenceRecord> {
    return this.#serialized(() => this.#change({ ...input, action: "release" }));
  }

  public async activeHolds(harnessVersionId?: string): Promise<HarnessReferenceRecord[]> {
    const projected = await this.#project();
    return [...projected.values()]
      .filter(
        (record) =>
          record.action === "acquire" &&
          (harnessVersionId === undefined ||
            record.harnessVersionId === harnessVersionId),
      )
      .sort((left, right) => left.holdId.localeCompare(right.holdId));
  }

  public async assertRetirable(harnessVersionId: string): Promise<void> {
    const holds = await this.activeHolds(harnessVersionId);
    assertCondition(
      holds.length === 0,
      "INVALID_STATE_TRANSITION",
      `Harness has active retirement holds: ${holds
        .map((hold) => `${hold.holdKind}:${hold.subjectId}`)
        .join(",")}`,
    );
  }

  public async records(): Promise<HarnessReferenceRecord[]> {
    return (await this.#log.readAll()).map((entry) => asRecord(entry.payload));
  }

  public async verifyAll(): Promise<void> {
    await this.#project();
  }

  async #change(input: {
    holdId: string;
    harnessVersionId: string;
    holdKind: HarnessReferenceKind;
    subjectId: string;
    action: "acquire" | "release";
    signer: PrincipalSigner;
  }): Promise<HarnessReferenceRecord> {
    assertCondition(
      AUTHORITY[input.holdKind].includes(input.signer.identity.role),
      "AUTHORIZATION_DENIED",
      `${input.signer.identity.role} cannot manage ${input.holdKind} holds`,
    );
    const history = (await this.records()).filter(
      (record) => record.holdId === input.holdId,
    );
    const previous = history.at(-1);
    if (previous !== undefined) {
      assertCondition(
        sameIdentity(previous, input),
        "CONFLICT",
        "Retirement hold ID was reused for another reference",
      );
      if (previous.action === input.action) return previous;
    }
    if (input.action === "acquire") {
      assertCondition(
        previous === undefined,
        "CONFLICT",
        "Released retirement hold IDs cannot be reacquired",
      );
    } else {
      assertCondition(
        previous?.action === "acquire",
        "INVALID_STATE_TRANSITION",
        "Only an active retirement hold can be released",
      );
    }
    const core: ReferenceCore = {
      schemaVersion: 1,
      referenceRecordId: this.#ids.next("harness-reference"),
      protocolId: this.#protocolId,
      holdId: input.holdId,
      harnessVersionId: input.harnessVersionId,
      holdKind: input.holdKind,
      subjectId: input.subjectId,
      action: input.action,
      createdBy: input.signer.identity,
      createdAt: this.#clock.now().toISOString(),
    };
    const auditLink = await this.#audit.appendSubject({
      subjectType: "HarnessReferenceRecord",
      subjectId: core.referenceRecordId,
      subjectHash: sha256(core),
    });
    const body: SignedBody = { ...core, auditLink };
    const record: HarnessReferenceRecord = {
      ...body,
      attestation: input.signer.attest(body as unknown as JsonValue),
    };
    this.#schemas.validate(HARNESS_REFERENCE_SCHEMA_ID, record as unknown as JsonValue);
    await this.#log.append(record as unknown as JsonValue);
    return record;
  }

  async #project(): Promise<Map<string, HarnessReferenceRecord>> {
    const projected = new Map<string, HarnessReferenceRecord>();
    for (const record of await this.records()) {
      this.#schemas.validate(HARNESS_REFERENCE_SCHEMA_ID, record as unknown as JsonValue);
      assertCondition(
        record.protocolId === this.#protocolId,
        "PROTOCOL_MISMATCH",
        "Reference ledger protocol drift",
      );
      assertCondition(
        AUTHORITY[record.holdKind].includes(record.createdBy.role),
        "AUTHORIZATION_DENIED",
        "Reference record role is unauthorized",
      );
      this.#principals.verify(
        record.createdBy,
        signedBodyOf(record) as unknown as JsonValue,
        record.attestation,
      );
      await this.#audit.verifyLink(record.auditLink, {
        subjectType: "HarnessReferenceRecord",
        subjectId: record.referenceRecordId,
        subjectHash: sha256(coreOf(record)),
      });
      const previous = projected.get(record.holdId);
      if (previous === undefined) {
        assertCondition(
          record.action === "acquire",
          "INVALID_STATE_TRANSITION",
          "Reference history must begin with acquire",
        );
      } else {
        assertCondition(
          previous.action === "acquire" &&
            record.action === "release" &&
            sameIdentity(previous, record),
          "INVALID_STATE_TRANSITION",
          "Reference release is duplicate or contradictory",
        );
      }
      projected.set(record.holdId, record);
    }
    return projected;
  }

  async #serialized<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.#queue.then(operation, operation);
    this.#queue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
}
