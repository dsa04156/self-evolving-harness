import path from "node:path";

import type { JsonValue } from "../core/canonical.js";
import type { Clock, IdFactory } from "../core/determinism.js";
import { assertCondition } from "../core/errors.js";
import { AppendOnlyLog } from "../storage/append-only-log.js";
import {
  type Attestation,
  type PrincipalIdentity,
  type PrincipalRegistry,
  type PrincipalSigner,
} from "../trust/identity.js";

export interface AuditLink {
  readonly protocolId: string;
  readonly logId: string;
  readonly sequence: number;
  readonly recordHash: string;
  readonly previousRecordHash: string | null;
}

export interface AuditLedger {
  appendSubject(input: {
    subjectType: string;
    subjectId: string;
    subjectHash: string;
  }): Promise<AuditLink>;
  verifyLink(
    link: AuditLink,
    expected: { subjectType: string; subjectId: string; subjectHash: string },
  ): Promise<void>;
  verifyAll(): Promise<void>;
}

interface AuditEntry {
  readonly schemaVersion: 1;
  readonly entryId: string;
  readonly protocolId: string;
  readonly logId: string;
  readonly subjectType: string;
  readonly subjectId: string;
  readonly subjectHash: string;
  readonly producer: PrincipalIdentity;
  readonly recordedAt: string;
  readonly attestation: Attestation;
}

function auditIdentity(entry: AuditEntry): Omit<AuditEntry, "attestation"> {
  const { attestation: _attestation, ...identity } = entry;
  return identity;
}

function asAuditEntry(value: JsonValue): AuditEntry {
  assertCondition(
    typeof value === "object" &&
      value !== null &&
      !Array.isArray(value) &&
      value["schemaVersion"] === 1 &&
      typeof value["entryId"] === "string" &&
      typeof value["subjectId"] === "string" &&
      typeof value["subjectHash"] === "string",
    "HASH_MISMATCH",
    "Malformed audit entry",
  );
  return value as unknown as AuditEntry;
}

export class AuditTrail implements AuditLedger {
  readonly #protocolId: string;
  readonly #logId: string;
  readonly #log: AppendOnlyLog<JsonValue>;
  readonly #signer: PrincipalSigner;
  readonly #principals: PrincipalRegistry;
  readonly #clock: Clock;
  readonly #ids: IdFactory;
  #queue: Promise<void> = Promise.resolve();

  public constructor(input: {
    root: string;
    protocolId: string;
    logId?: string;
    signer: PrincipalSigner;
    principals: PrincipalRegistry;
    clock: Clock;
    ids: IdFactory;
  }) {
    assertCondition(
      input.signer.identity.role === "audit_store",
      "AUTHORIZATION_DENIED",
      "Audit trail requires an audit-store principal",
    );
    this.#protocolId = input.protocolId;
    this.#logId = input.logId ?? "audit.main";
    this.#log = new AppendOnlyLog<JsonValue>(path.join(input.root, "audit"), this.#logId);
    this.#signer = input.signer;
    this.#principals = input.principals;
    this.#clock = input.clock;
    this.#ids = input.ids;
  }

  public async appendSubject(input: {
    subjectType: string;
    subjectId: string;
    subjectHash: string;
  }): Promise<AuditLink> {
    const operation = this.#queue.then(
      () => this.#appendSubjectLocked(input),
      () => this.#appendSubjectLocked(input),
    );
    this.#queue = operation.then(
      () => undefined,
      () => undefined,
    );
    return operation;
  }

  async #appendSubjectLocked(input: {
    subjectType: string;
    subjectId: string;
    subjectHash: string;
  }): Promise<AuditLink> {
    assertCondition(
      /^sha256:[a-f0-9]{64}$/u.test(input.subjectHash),
      "SCHEMA_INVALID",
      "Bad subject hash",
    );
    for (const record of await this.#log.readAll()) {
      const entry = asAuditEntry(record.payload);
      if (entry.subjectType !== input.subjectType || entry.subjectId !== input.subjectId) {
        continue;
      }
      assertCondition(
        entry.subjectHash === input.subjectHash,
        "CONFLICT",
        "Audit subject ID was reused with another hash",
      );
      return {
        protocolId: this.#protocolId,
        logId: this.#logId,
        sequence: record.sequence,
        recordHash: record.recordHash,
        previousRecordHash: record.previousRecordHash,
      };
    }
    const identity = {
      schemaVersion: 1 as const,
      entryId: this.#ids.next("audit-entry"),
      protocolId: this.#protocolId,
      logId: this.#logId,
      subjectType: input.subjectType,
      subjectId: input.subjectId,
      subjectHash: input.subjectHash,
      producer: this.#signer.identity,
      recordedAt: this.#clock.now().toISOString(),
    };
    const entry: AuditEntry = {
      ...identity,
      attestation: this.#signer.attest(identity as unknown as JsonValue),
    };
    const record = await this.#log.append(entry as unknown as JsonValue);
    return {
      protocolId: this.#protocolId,
      logId: this.#logId,
      sequence: record.sequence,
      recordHash: record.recordHash,
      previousRecordHash: record.previousRecordHash,
    };
  }

  public async verifyLink(
    link: AuditLink,
    expected: { subjectType: string; subjectId: string; subjectHash: string },
  ): Promise<void> {
    assertCondition(
      link.protocolId === this.#protocolId && link.logId === this.#logId,
      "PROTOCOL_MISMATCH",
      "Audit link points to another log",
    );
    const record = (await this.#log.readAll())[link.sequence];
    assertCondition(record !== undefined, "ARTIFACT_UNAVAILABLE", "Audit record is missing");
    assertCondition(
      record.recordHash === link.recordHash &&
        record.previousRecordHash === link.previousRecordHash,
      "HASH_MISMATCH",
      "Audit link does not match its record",
    );
    const entry = asAuditEntry(record.payload);
    assertCondition(
      entry.protocolId === this.#protocolId &&
        entry.logId === this.#logId &&
        entry.subjectType === expected.subjectType &&
        entry.subjectId === expected.subjectId &&
        entry.subjectHash === expected.subjectHash,
      "HASH_MISMATCH",
      "Audit subject mismatch",
    );
    this.#principals.verify(
      entry.producer,
      auditIdentity(entry) as unknown as JsonValue,
      entry.attestation,
    );
  }

  public async verifyAll(): Promise<void> {
    for (const record of await this.#log.readAll()) {
      const entry = asAuditEntry(record.payload);
      assertCondition(
        entry.protocolId === this.#protocolId && entry.logId === this.#logId,
        "PROTOCOL_MISMATCH",
        "Audit entry pin mismatch",
      );
      this.#principals.verify(
        entry.producer,
        auditIdentity(entry) as unknown as JsonValue,
        entry.attestation,
      );
      assertCondition(
        /^sha256:[a-f0-9]{64}$/u.test(entry.subjectHash),
        "SCHEMA_INVALID",
        "Malformed committed subject hash",
      );
    }
  }
}
