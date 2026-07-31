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

export const GOVERNANCE_DEVIATION_SCHEMA_ID =
  `${SCHEMA_BASE_URL}governance-deviation-record.schema.json`;

export const HFB_STRUCTURAL_ORACLE_SUITE_HASH =
  "sha256:a48496598ee5ebef2ca4678e25c59d5a7666fc25e2ee16317ad933f715364b41";
export const HFB_STRUCTURAL_ORACLE_EVIDENCE_FILE_HASH =
  "sha256:1a7e2ac0a0c24b4cbfba11c5b661f6130673a136a755d16743ec956652b4de3c";

export const DEVELOPMENT_EVIDENCE_USE_CLASSES = [
  "development_structural_validation",
  "scorer_self_test",
  "governance_audit",
  "semantic_correction",
] as const;

export const RESEARCH_PROHIBITED_USE_CLASSES = [
  "research_protocol_manifest",
  "candidate_input",
  "attribution_evaluation",
  "method_scheduler",
  "promotion_decision",
  "claim_table",
  "research_evidence",
] as const;

export type DevelopmentEvidenceUseClass =
  (typeof DEVELOPMENT_EVIDENCE_USE_CLASSES)[number];
export type ResearchProhibitedUseClass =
  (typeof RESEARCH_PROHIBITED_USE_CLASSES)[number];
export type EvidenceUseClass =
  | DevelopmentEvidenceUseClass
  | ResearchProhibitedUseClass;

export interface GovernanceDeviationArtifact {
  readonly artifactKind:
    | "development_evidence_file"
    | "suite_commitment"
    | "score_report"
    | "fixture_body"
    | "causal_report"
    | "known_good_harness"
    | "faulty_harness";
  readonly artifactId: string;
  readonly contentHash: string;
  readonly path: string | null;
}

export interface GovernanceDeviationRecord {
  readonly schemaVersion: 1;
  readonly deviationId: string;
  readonly recordType: "governance_deviation";
  readonly governanceDomainId: string;
  readonly protocolStatus: "not_frozen";
  readonly priorDecision: {
    readonly decision: "REVISE";
    readonly responsePath: string;
    readonly responseSha256: string;
  };
  readonly dispositionDecision: {
    readonly decision: "REVISE";
    readonly responsePath: string;
    readonly responseSha256: string;
  };
  readonly occurred: {
    readonly firstOperationAt: string;
    readonly lastOperationAt: string;
    readonly actors: readonly {
      readonly actorId: string;
      readonly actorType:
        | "human_operator"
        | "coding_agent"
        | "git_author";
      readonly displayName: string;
    }[];
    readonly implementationCommits: readonly string[];
    readonly evidenceCommits: readonly string[];
    readonly operations: readonly string[];
    readonly fixtureIds: readonly string[];
  };
  readonly exceededAuthorization: string;
  readonly affectedArtifacts: readonly GovernanceDeviationArtifact[];
  readonly quarantine: {
    readonly developmentOnly: true;
    readonly confirmatory: false;
    readonly authorizedForResearchEvidence: false;
    readonly allowedUseClasses: readonly DevelopmentEvidenceUseClass[];
    readonly prohibitedUseClasses: readonly ResearchProhibitedUseClass[];
    readonly replacementPolicy:
      "retain_as_superseded_development_evidence";
  };
  readonly remediation: {
    readonly status: "recorded" | "in_progress" | "corrected" | "closed";
    readonly requiredActions: readonly string[];
  };
  readonly recordedAt: string;
  readonly recordedBy: PrincipalIdentity;
  readonly recordHash: string;
  readonly publicPrincipal: PublicPrincipal;
  readonly attestation: Attestation;
}

export type GovernanceDeviationUnsignedInput = Omit<
  GovernanceDeviationRecord,
  | "schemaVersion"
  | "recordType"
  | "recordHash"
  | "recordedBy"
  | "publicPrincipal"
  | "attestation"
>;

type GovernanceDeviationCore = Omit<
  GovernanceDeviationRecord,
  "recordHash" | "publicPrincipal" | "attestation"
>;
type GovernanceDeviationSignedBody = Omit<
  GovernanceDeviationRecord,
  "attestation"
>;

function coreOf(
  record: GovernanceDeviationRecord,
): GovernanceDeviationCore {
  const {
    recordHash: _recordHash,
    publicPrincipal: _publicPrincipal,
    attestation: _attestation,
    ...core
  } = record;
  return core;
}

function signedBodyOf(
  record: GovernanceDeviationRecord,
): GovernanceDeviationSignedBody {
  const { attestation: _attestation, ...body } = record;
  return body;
}

function assertCanonicalOrder(
  actual: readonly string[],
  expected: readonly string[],
  label: string,
): void {
  assertCondition(
    actual.length === expected.length &&
      actual.every((value, index) => value === expected[index]),
    "SCHEMA_INVALID",
    `${label} is not the frozen canonical list`,
  );
}

export function createGovernanceDeviationRecord(input: {
  readonly value: GovernanceDeviationUnsignedInput;
  readonly signer: PrincipalSigner;
}): GovernanceDeviationRecord {
  assertCondition(
    input.signer.identity.role === "protocol_author",
    "AUTHORIZATION_DENIED",
    "Only a protocol-author principal may sign a governance deviation",
  );
  const core: GovernanceDeviationCore = {
    schemaVersion: 1,
    deviationId: input.value.deviationId,
    recordType: "governance_deviation",
    governanceDomainId: input.value.governanceDomainId,
    protocolStatus: input.value.protocolStatus,
    priorDecision: input.value.priorDecision,
    dispositionDecision: input.value.dispositionDecision,
    occurred: input.value.occurred,
    exceededAuthorization: input.value.exceededAuthorization,
    affectedArtifacts: input.value.affectedArtifacts,
    quarantine: input.value.quarantine,
    remediation: input.value.remediation,
    recordedAt: input.value.recordedAt,
    recordedBy: input.signer.identity,
  };
  const publicPrincipal = input.signer.exportPublic();
  const body: GovernanceDeviationSignedBody = {
    ...core,
    recordHash: sha256(core as unknown as JsonValue),
    publicPrincipal,
  };
  return {
    ...body,
    attestation: input.signer.attest(body as unknown as JsonValue),
  };
}

export function verifyGovernanceDeviationRecord(input: {
  readonly record: GovernanceDeviationRecord;
  readonly schemas: SchemaRegistry;
}): void {
  input.schemas.validate(
    GOVERNANCE_DEVIATION_SCHEMA_ID,
    input.record as unknown as JsonValue,
  );
  assertCondition(
    input.record.recordedBy.role === "protocol_author",
    "AUTHORIZATION_DENIED",
    "Governance deviation is not signed by a protocol author",
  );
  assertCondition(
    canonicalize(input.record.publicPrincipal.identity) ===
      canonicalize(input.record.recordedBy),
    "AUTHENTICATION_FAILED",
    "Embedded public principal does not match the recorded signer",
  );
  assertCondition(
    input.record.recordHash ===
      sha256(coreOf(input.record) as unknown as JsonValue),
    "HASH_MISMATCH",
    "Governance deviation record hash mismatch",
  );
  assertCanonicalOrder(
    input.record.quarantine.allowedUseClasses,
    DEVELOPMENT_EVIDENCE_USE_CLASSES,
    "allowedUseClasses",
  );
  assertCanonicalOrder(
    input.record.quarantine.prohibitedUseClasses,
    RESEARCH_PROHIBITED_USE_CLASSES,
    "prohibitedUseClasses",
  );
  assertCondition(
    input.record.occurred.fixtureIds.length === 28 &&
      input.record.occurred.fixtureIds.length ===
        new Set(input.record.occurred.fixtureIds).size,
    "SCHEMA_INVALID",
    "Governance deviation must enumerate exactly 28 fixture IDs",
  );
  const principals = new PrincipalRegistry();
  principals.register(input.record.publicPrincipal);
  principals.verify(
    input.record.recordedBy,
    signedBodyOf(input.record) as unknown as JsonValue,
    input.record.attestation,
  );
}

export interface EvidenceUseAdmission {
  readonly useClass: DevelopmentEvidenceUseClass;
  readonly references: readonly string[];
  readonly governingDeviationIds: readonly string[];
  readonly admissionHash: string;
}

function collectStrings(value: JsonValue, output: Set<string>): void {
  if (typeof value === "string") {
    output.add(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectStrings(item, output);
    return;
  }
  if (typeof value === "object" && value !== null) {
    for (const item of Object.values(value)) collectStrings(item, output);
  }
}

export class EvidenceQuarantinePolicy {
  readonly #records: readonly GovernanceDeviationRecord[];
  readonly #recordByBlockedReference =
    new Map<string, GovernanceDeviationRecord>();

  public constructor(input: {
    readonly records: readonly GovernanceDeviationRecord[];
    readonly schemas: SchemaRegistry;
  }) {
    assertCondition(
      input.records.length > 0,
      "SCHEMA_INVALID",
      "Evidence quarantine requires at least one deviation record",
    );
    const seenDeviationIds = new Set<string>();
    for (const record of input.records) {
      verifyGovernanceDeviationRecord({ record, schemas: input.schemas });
      assertCondition(
        !seenDeviationIds.has(record.deviationId),
        "CONFLICT",
        "Duplicate governance deviation ID",
      );
      seenDeviationIds.add(record.deviationId);
      for (const artifact of record.affectedArtifacts) {
        const prior = this.#recordByBlockedReference.get(
          artifact.contentHash,
        );
        assertCondition(
          prior === undefined || prior.deviationId === record.deviationId,
          "CONFLICT",
          "A quarantined artifact is claimed by multiple deviations",
        );
        this.#recordByBlockedReference.set(artifact.contentHash, record);
      }
    }
    this.#records = [...input.records];
  }

  public assertReferencesAllowed(input: {
    readonly useClass: EvidenceUseClass;
    readonly references: readonly string[];
  }): EvidenceUseAdmission | null {
    const references = [...new Set(input.references)].sort();
    const governing = new Map<string, GovernanceDeviationRecord>();
    for (const reference of references) {
      const record = this.#recordByBlockedReference.get(reference);
      if (record !== undefined) governing.set(record.deviationId, record);
    }
    if (governing.size === 0) return null;
    const records = [...governing.values()].sort((left, right) =>
      left.deviationId.localeCompare(right.deviationId),
    );
    const allowed = records.every((record) =>
      record.quarantine.allowedUseClasses.includes(
        input.useClass as DevelopmentEvidenceUseClass,
      ),
    );
    assertCondition(
      allowed,
      "AUTHORIZATION_DENIED",
      `Quarantined development evidence cannot be used for ${input.useClass}`,
    );
    const useClass = input.useClass as DevelopmentEvidenceUseClass;
    const governingDeviationIds = records.map(
      (record) => record.deviationId,
    );
    return {
      useClass,
      references,
      governingDeviationIds,
      admissionHash: sha256({
        useClass,
        references,
        governingDeviationIds,
      }),
    };
  }

  public assertPayloadAllowed(input: {
    readonly useClass: EvidenceUseClass;
    readonly payload: JsonValue;
  }): EvidenceUseAdmission | null {
    const references = new Set<string>();
    collectStrings(input.payload, references);
    return this.assertReferencesAllowed({
      useClass: input.useClass,
      references: [...references],
    });
  }

  public quarantinedReferences(): readonly string[] {
    return [...this.#recordByBlockedReference.keys()].sort();
  }

  public records(): readonly GovernanceDeviationRecord[] {
    return [...this.#records];
  }
}

export class GovernanceDeviationLog {
  readonly #schemas: SchemaRegistry;
  readonly #log: AppendOnlyLog<JsonValue>;

  public constructor(input: {
    readonly root: string;
    readonly schemas: SchemaRegistry;
  }) {
    this.#schemas = input.schemas;
    this.#log = new AppendOnlyLog<JsonValue>(
      path.join(input.root, "governance"),
      "governance.deviations",
    );
  }

  public async append(
    record: GovernanceDeviationRecord,
  ): Promise<AppendOnlyRecord<JsonValue>> {
    verifyGovernanceDeviationRecord({
      record,
      schemas: this.#schemas,
    });
    const existing = await this.all();
    const prior = existing.find(
      (candidate) => candidate.deviationId === record.deviationId,
    );
    assertCondition(
      prior === undefined || prior.recordHash === record.recordHash,
      "CONFLICT",
      "Governance deviation ID was reused with different content",
    );
    if (prior !== undefined) {
      const records = await this.#log.readAll();
      return records.find(
        (candidate) =>
          (candidate.payload as unknown as GovernanceDeviationRecord)
            .deviationId === record.deviationId,
      )!;
    }
    return this.#log.append(record as unknown as JsonValue);
  }

  public async all(): Promise<GovernanceDeviationRecord[]> {
    const records = (await this.#log.readAll()).map(
      (record) =>
        record.payload as unknown as GovernanceDeviationRecord,
    );
    for (const record of records) {
      verifyGovernanceDeviationRecord({
        record,
        schemas: this.#schemas,
      });
    }
    return records;
  }
}
