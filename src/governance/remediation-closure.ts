import path from "node:path";

import {
  canonicalize,
  sha256,
  type JsonValue,
} from "../core/canonical.js";
import { assertCondition } from "../core/errors.js";
import {
  SCHEMA_BASE_URL,
  type SchemaRegistry,
} from "../contracts/schema-registry.js";
import {
  AppendOnlyLog,
  type AppendOnlyRecord,
} from "../storage/append-only-log.js";
import {
  PrincipalRegistry,
  type Attestation,
  type PrincipalIdentity,
  type PrincipalSigner,
  type PublicPrincipal,
} from "../trust/identity.js";
import type { GovernanceDeviationRecord } from "./evidence-quarantine.js";

export const GOVERNANCE_REMEDIATION_CLOSURE_SCHEMA_ID =
  `${SCHEMA_BASE_URL}governance-remediation-closure.schema.json`;

export interface GovernanceRemediationClosureRecord {
  readonly schemaVersion: 1;
  readonly closureId: string;
  readonly recordType: "governance_remediation_closure";
  readonly governanceDomainId: string;
  readonly deviationId: string;
  readonly deviationRecordHash: string;
  readonly architectDecision: {
    readonly decision: "APPROVE";
    readonly responsePath: string;
    readonly responseSha256: string;
  };
  readonly replacementEvidence: {
    readonly semanticSuiteCommitment: string;
    readonly labelBlindCorpusCommitment: string;
    readonly semanticEvidenceSourceCommit: string;
    readonly evidencePath: string;
    readonly evidenceFileSha256: string;
  };
  readonly remediation: {
    readonly originalRecordWasModified: false;
    readonly originalStatusObserved: "in_progress";
    readonly closureStatus: "closed_by_append_only_record";
    readonly completedActions: readonly string[];
    readonly outstandingActions: readonly [];
  };
  readonly claimBoundary: {
    readonly semanticDevelopmentFixtureCorrectionClosed: true;
    readonly researchEvidenceAuthorized: false;
    readonly attributionPerformanceClaim: false;
    readonly selfEvolutionClaim: false;
    readonly oldArtifactsRemainQuarantined: true;
  };
  readonly closureSourceCommit: string;
  readonly closedAt: string;
  readonly recordedBy: PrincipalIdentity;
  readonly recordHash: string;
  readonly publicPrincipal: PublicPrincipal;
  readonly attestation: Attestation;
}

export type GovernanceRemediationClosureUnsignedInput = Omit<
  GovernanceRemediationClosureRecord,
  | "schemaVersion"
  | "recordType"
  | "recordedBy"
  | "recordHash"
  | "publicPrincipal"
  | "attestation"
>;

type ClosureCore = Omit<
  GovernanceRemediationClosureRecord,
  "recordHash" | "publicPrincipal" | "attestation"
>;
type ClosureSignedBody = Omit<
  GovernanceRemediationClosureRecord,
  "attestation"
>;

function coreOf(
  record: GovernanceRemediationClosureRecord,
): ClosureCore {
  const {
    recordHash: _recordHash,
    publicPrincipal: _publicPrincipal,
    attestation: _attestation,
    ...core
  } = record;
  return core;
}

function signedBodyOf(
  record: GovernanceRemediationClosureRecord,
): ClosureSignedBody {
  const { attestation: _attestation, ...body } = record;
  return body;
}

export function createGovernanceRemediationClosure(input: {
  readonly value: GovernanceRemediationClosureUnsignedInput;
  readonly deviation: GovernanceDeviationRecord;
  readonly signer: PrincipalSigner;
}): GovernanceRemediationClosureRecord {
  assertCondition(
    input.signer.identity.role === "protocol_author",
    "AUTHORIZATION_DENIED",
    "Only a protocol-author principal may sign remediation closure",
  );
  assertCondition(
    input.value.deviationId === input.deviation.deviationId &&
      input.value.deviationRecordHash === input.deviation.recordHash &&
      input.value.governanceDomainId ===
        input.deviation.governanceDomainId,
    "HASH_MISMATCH",
    "Remediation closure does not bind the supplied deviation",
  );
  assertCondition(
    input.deviation.remediation.status === "in_progress" &&
      input.value.remediation.originalRecordWasModified === false &&
      input.value.remediation.originalStatusObserved === "in_progress",
    "INVALID_STATE_TRANSITION",
    "Remediation closure must append to the unchanged in-progress deviation",
  );
  const core: ClosureCore = {
    schemaVersion: 1,
    closureId: input.value.closureId,
    recordType: "governance_remediation_closure",
    governanceDomainId: input.value.governanceDomainId,
    deviationId: input.value.deviationId,
    deviationRecordHash: input.value.deviationRecordHash,
    architectDecision: input.value.architectDecision,
    replacementEvidence: input.value.replacementEvidence,
    remediation: input.value.remediation,
    claimBoundary: input.value.claimBoundary,
    closureSourceCommit: input.value.closureSourceCommit,
    closedAt: input.value.closedAt,
    recordedBy: input.signer.identity,
  };
  const publicPrincipal = input.signer.exportPublic();
  const body: ClosureSignedBody = {
    ...core,
    recordHash: sha256(core as unknown as JsonValue),
    publicPrincipal,
  };
  return {
    ...body,
    attestation: input.signer.attest(body as unknown as JsonValue),
  };
}

export function verifyGovernanceRemediationClosure(input: {
  readonly record: GovernanceRemediationClosureRecord;
  readonly deviation: GovernanceDeviationRecord;
  readonly schemas: SchemaRegistry;
}): void {
  input.schemas.validate(
    GOVERNANCE_REMEDIATION_CLOSURE_SCHEMA_ID,
    input.record as unknown as JsonValue,
  );
  assertCondition(
    input.record.recordedBy.role === "protocol_author",
    "AUTHORIZATION_DENIED",
    "Remediation closure is not signed by a protocol author",
  );
  assertCondition(
    input.record.deviationId === input.deviation.deviationId &&
      input.record.deviationRecordHash === input.deviation.recordHash &&
      input.record.governanceDomainId ===
        input.deviation.governanceDomainId,
    "HASH_MISMATCH",
    "Remediation closure deviation binding mismatch",
  );
  assertCondition(
    input.deviation.remediation.status === "in_progress" &&
      input.record.remediation.originalRecordWasModified === false &&
      input.record.remediation.originalStatusObserved === "in_progress" &&
      input.record.remediation.closureStatus ===
        "closed_by_append_only_record" &&
      input.record.remediation.outstandingActions.length === 0,
    "INVALID_STATE_TRANSITION",
    "Remediation closure does not preserve append-only state",
  );
  assertCondition(
    canonicalize(input.record.publicPrincipal.identity) ===
      canonicalize(input.record.recordedBy),
    "AUTHENTICATION_FAILED",
    "Closure public principal does not match the recorded signer",
  );
  assertCondition(
    input.record.recordHash ===
      sha256(coreOf(input.record) as unknown as JsonValue),
    "HASH_MISMATCH",
    "Remediation closure record hash mismatch",
  );
  const principals = new PrincipalRegistry();
  principals.register(input.record.publicPrincipal);
  principals.verify(
    input.record.recordedBy,
    signedBodyOf(input.record) as unknown as JsonValue,
    input.record.attestation,
  );
}

export class GovernanceRemediationClosureLog {
  readonly #schemas: SchemaRegistry;
  readonly #deviation: GovernanceDeviationRecord;
  readonly #log: AppendOnlyLog<JsonValue>;

  public constructor(input: {
    readonly root: string;
    readonly schemas: SchemaRegistry;
    readonly deviation: GovernanceDeviationRecord;
  }) {
    this.#schemas = input.schemas;
    this.#deviation = input.deviation;
    this.#log = new AppendOnlyLog<JsonValue>(
      path.join(input.root, "governance"),
      "governance.remediation-closures",
    );
  }

  public async append(
    record: GovernanceRemediationClosureRecord,
  ): Promise<AppendOnlyRecord<JsonValue>> {
    verifyGovernanceRemediationClosure({
      record,
      deviation: this.#deviation,
      schemas: this.#schemas,
    });
    const records = await this.#log.readAll();
    const prior = records.find(
      (candidate) =>
        (
          candidate.payload as unknown as
            GovernanceRemediationClosureRecord
        ).closureId === record.closureId,
    );
    if (prior !== undefined) {
      assertCondition(
        (
          prior.payload as unknown as
            GovernanceRemediationClosureRecord
        ).recordHash === record.recordHash,
        "CONFLICT",
        "Remediation closure ID was reused with different content",
      );
      return prior;
    }
    return this.#log.append(record as unknown as JsonValue);
  }

  public async all(): Promise<
    GovernanceRemediationClosureRecord[]
  > {
    const records = (await this.#log.readAll()).map(
      (entry) =>
        entry.payload as unknown as
          GovernanceRemediationClosureRecord,
    );
    for (const record of records) {
      verifyGovernanceRemediationClosure({
        record,
        deviation: this.#deviation,
        schemas: this.#schemas,
      });
    }
    return records;
  }
}
