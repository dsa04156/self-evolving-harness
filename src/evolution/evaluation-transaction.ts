import path from "node:path";

import { sha256, type JsonValue } from "../core/canonical.js";
import type { Clock } from "../core/determinism.js";
import { assertCondition } from "../core/errors.js";
import { SCHEMA_BASE_URL, type SchemaRegistry } from "../contracts/schema-registry.js";
import {
  type AuditLedger,
  type AuditLink,
} from "../evidence/audit-trail.js";
import { AppendOnlyLog } from "../storage/append-only-log.js";
import type {
  Attestation,
  PrincipalIdentity,
  PrincipalRegistry,
  PrincipalSigner,
} from "../trust/identity.js";

export const EVALUATION_TRANSACTION_SCHEMA_ID =
  `${SCHEMA_BASE_URL}evaluation-transaction-record.schema.json`;

export type EvaluationTransactionStage =
  | "started"
  | "proposed"
  | "audit_linked"
  | "result_created"
  | "signature_verified"
  | "result_appended"
  | "accounting_sealed"
  | "completed"
  | "failed";

export interface EvaluationTransactionRecord {
  readonly schemaVersion: 1;
  readonly transactionRecordId: string;
  readonly protocolId: string;
  readonly transactionId: string;
  readonly requestId: string;
  readonly evaluationResultId: string;
  readonly parentHarnessVersionId: string;
  readonly candidateHarnessVersionId: string;
  readonly stage: EvaluationTransactionStage;
  readonly requestPayload: { readonly [key: string]: JsonValue };
  readonly requestPayloadHash: string;
  readonly coreHash: string | null;
  readonly resultAuditLink: AuditLink | null;
  readonly resultHash: string | null;
  readonly failureCode: string | null;
  readonly createdBy: PrincipalIdentity;
  readonly recordedAt: string;
  readonly auditLink: AuditLink;
  readonly attestation: Attestation;
}

type TransactionCore = Omit<EvaluationTransactionRecord, "auditLink" | "attestation">;
type SignedBody = Omit<EvaluationTransactionRecord, "attestation">;

const ORDER: readonly EvaluationTransactionStage[] = [
  "started",
  "proposed",
  "audit_linked",
  "result_created",
  "signature_verified",
  "result_appended",
  "accounting_sealed",
  "completed",
];

function asRecord(value: JsonValue): EvaluationTransactionRecord {
  return value as unknown as EvaluationTransactionRecord;
}

function coreOf(record: EvaluationTransactionRecord): TransactionCore {
  const { auditLink: _auditLink, attestation: _attestation, ...core } = record;
  return core;
}

function signedBodyOf(record: EvaluationTransactionRecord): SignedBody {
  const { attestation: _attestation, ...body } = record;
  return body;
}

function expectedNext(
  previous: EvaluationTransactionStage,
  next: EvaluationTransactionStage,
): boolean {
  if (next === "failed") return previous !== "completed" && previous !== "failed";
  const priorIndex = ORDER.indexOf(previous);
  return priorIndex >= 0 && ORDER[priorIndex + 1] === next;
}

export class EvaluationTransactionStore {
  readonly #protocolId: string;
  readonly #schemas: SchemaRegistry;
  readonly #audit: AuditLedger;
  readonly #principals: PrincipalRegistry;
  readonly #signer: PrincipalSigner;
  readonly #clock: Clock;
  readonly #log: AppendOnlyLog<JsonValue>;
  #queue: Promise<void> = Promise.resolve();

  public constructor(input: {
    root: string;
    protocolId: string;
    schemas: SchemaRegistry;
    audit: AuditLedger;
    principals: PrincipalRegistry;
    signer: PrincipalSigner;
    clock: Clock;
  }) {
    assertCondition(
      input.signer.identity.role === "operations_owner",
      "AUTHORIZATION_DENIED",
      "Evaluation transactions require operations-owner identity",
    );
    this.#protocolId = input.protocolId;
    this.#schemas = input.schemas;
    this.#audit = input.audit;
    this.#principals = input.principals;
    this.#signer = input.signer;
    this.#clock = input.clock;
    this.#log = new AppendOnlyLog<JsonValue>(
      path.join(input.root, "evolution"),
      "evaluation.transactions",
    );
  }

  public begin(input: {
    transactionId: string;
    requestId: string;
    evaluationResultId: string;
    parentHarnessVersionId: string;
    candidateHarnessVersionId: string;
    requestPayload: { readonly [key: string]: JsonValue };
  }): Promise<EvaluationTransactionRecord> {
    return this.#serialized(async () => {
      const prior = await this.records(input.transactionId);
      if (prior.length > 0) {
        const first = prior[0]!;
        assertCondition(
          first.stage === "started" &&
            first.requestId === input.requestId &&
            first.evaluationResultId === input.evaluationResultId &&
            first.requestPayloadHash === sha256(input.requestPayload),
          "CONFLICT",
          "Evaluation transaction ID was reused",
        );
        return first;
      }
      return this.#append({
        ...input,
        stage: "started",
        coreHash: null,
        resultAuditLink: null,
        resultHash: null,
        failureCode: null,
        recordedAt: this.#clock.now().toISOString(),
      });
    });
  }

  public advance(
    previous: EvaluationTransactionRecord,
    stage: Exclude<EvaluationTransactionStage, "started" | "failed">,
    update: {
      coreHash?: string;
      resultAuditLink?: AuditLink;
      resultHash?: string;
    } = {},
  ): Promise<EvaluationTransactionRecord> {
    return this.#serialized(async () => {
      const latest = (await this.records(previous.transactionId)).at(-1);
      assertCondition(latest !== undefined, "ARTIFACT_UNAVAILABLE", "Transaction is missing");
      if (latest.stage === stage) return latest;
      assertCondition(
        latest.stage === previous.stage && expectedNext(latest.stage, stage),
        "INVALID_STATE_TRANSITION",
        `Evaluation transaction cannot transition ${latest.stage} → ${stage}`,
      );
      return this.#append({
        transactionId: latest.transactionId,
        requestId: latest.requestId,
        evaluationResultId: latest.evaluationResultId,
        parentHarnessVersionId: latest.parentHarnessVersionId,
        candidateHarnessVersionId: latest.candidateHarnessVersionId,
        stage,
        requestPayload: latest.requestPayload,
        coreHash: update.coreHash ?? latest.coreHash,
        resultAuditLink: update.resultAuditLink ?? latest.resultAuditLink,
        resultHash: update.resultHash ?? latest.resultHash,
        failureCode: null,
        recordedAt: latest.recordedAt,
      });
    });
  }

  public fail(
    previous: EvaluationTransactionRecord,
    failureCode: string,
  ): Promise<EvaluationTransactionRecord> {
    return this.#serialized(async () => {
      const latest = (await this.records(previous.transactionId)).at(-1);
      assertCondition(latest !== undefined, "ARTIFACT_UNAVAILABLE", "Transaction is missing");
      if (latest.stage === "failed") {
        assertCondition(
          latest.failureCode === failureCode,
          "CONFLICT",
          "Evaluation transaction has a contradictory failure",
        );
        return latest;
      }
      assertCondition(
        expectedNext(latest.stage, "failed"),
        "INVALID_STATE_TRANSITION",
        "Completed evaluation cannot fail",
      );
      return this.#append({
        transactionId: latest.transactionId,
        requestId: latest.requestId,
        evaluationResultId: latest.evaluationResultId,
        parentHarnessVersionId: latest.parentHarnessVersionId,
        candidateHarnessVersionId: latest.candidateHarnessVersionId,
        stage: "failed",
        requestPayload: latest.requestPayload,
        coreHash: latest.coreHash,
        resultAuditLink: latest.resultAuditLink,
        resultHash: latest.resultHash,
        failureCode,
        recordedAt: latest.recordedAt,
      });
    });
  }

  public async records(transactionId?: string): Promise<EvaluationTransactionRecord[]> {
    const records = (await this.#log.readAll()).map((entry) => asRecord(entry.payload));
    return transactionId === undefined
      ? records
      : records.filter((record) => record.transactionId === transactionId);
  }

  public async latest(): Promise<EvaluationTransactionRecord[]> {
    const byTransaction = new Map<string, EvaluationTransactionRecord>();
    for (const record of await this.records()) byTransaction.set(record.transactionId, record);
    return [...byTransaction.values()].sort((left, right) =>
      left.transactionId.localeCompare(right.transactionId),
    );
  }

  public async verifyAll(): Promise<void> {
    const histories = new Map<string, EvaluationTransactionRecord[]>();
    for (const record of await this.records()) {
      this.#schemas.validate(
        EVALUATION_TRANSACTION_SCHEMA_ID,
        record as unknown as JsonValue,
      );
      assertCondition(
        record.protocolId === this.#protocolId &&
          record.requestPayloadHash === sha256(record.requestPayload),
        "HASH_MISMATCH",
        "Evaluation transaction pin or request hash changed",
      );
      this.#principals.verify(
        record.createdBy,
        signedBodyOf(record) as unknown as JsonValue,
        record.attestation,
      );
      await this.#audit.verifyLink(record.auditLink, {
        subjectType: "EvaluationTransactionRecord",
        subjectId: record.transactionRecordId,
        subjectHash: sha256(coreOf(record)),
      });
      const history = histories.get(record.transactionId) ?? [];
      const previous = history.at(-1);
      if (previous === undefined) {
        assertCondition(record.stage === "started", "INVALID_STATE_TRANSITION", "Bad start");
      } else {
        assertCondition(
          expectedNext(previous.stage, record.stage) &&
            previous.requestPayloadHash === record.requestPayloadHash &&
            previous.recordedAt === record.recordedAt,
          "INVALID_STATE_TRANSITION",
          "Invalid persisted evaluation transaction transition",
        );
      }
      history.push(record);
      histories.set(record.transactionId, history);
    }
  }

  async #append(
    input: Omit<
      TransactionCore,
      | "schemaVersion"
      | "transactionRecordId"
      | "protocolId"
      | "requestPayloadHash"
      | "createdBy"
    >,
  ): Promise<EvaluationTransactionRecord> {
    const core: TransactionCore = {
      schemaVersion: 1,
      transactionRecordId: `${input.transactionId}.${input.stage}`,
      protocolId: this.#protocolId,
      ...input,
      requestPayloadHash: sha256(input.requestPayload),
      createdBy: this.#signer.identity,
    };
    const auditLink = await this.#audit.appendSubject({
      subjectType: "EvaluationTransactionRecord",
      subjectId: core.transactionRecordId,
      subjectHash: sha256(core),
    });
    const body: SignedBody = { ...core, auditLink };
    const record: EvaluationTransactionRecord = {
      ...body,
      attestation: this.#signer.attest(body as unknown as JsonValue),
    };
    this.#schemas.validate(
      EVALUATION_TRANSACTION_SCHEMA_ID,
      record as unknown as JsonValue,
    );
    await this.#log.append(record as unknown as JsonValue);
    return record;
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
