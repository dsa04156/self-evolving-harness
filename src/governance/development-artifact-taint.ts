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
  PrincipalRegistry,
  type Attestation,
  type PrincipalIdentity,
  type PrincipalSigner,
  type PublicPrincipal,
} from "../trust/identity.js";

export const DEVELOPMENT_ARTIFACT_TAINT_SCHEMA_ID =
  `${SCHEMA_BASE_URL}development-artifact-taint.schema.json`;

export const DEVELOPMENT_ARTIFACT_TAINT_CLASSES = [
  "development_fixture",
  "prediction_pre_oracle",
  "oracle_input",
  "post_score_output",
  "development_candidate",
  "development_evaluation",
] as const;

export const DEVELOPMENT_ARTIFACT_USE_CLASSES = [
  "attributor_input",
  "prediction_committer_input",
  "scorer_input",
  "scorer_oracle_input",
  "development_mutation_proposer_input",
  "candidate_quarantine",
  "development_runtime_input",
  "development_evaluator_input",
  "governance_audit",
  "development_archive",
  "research_protocol_manifest",
  "research_candidate_selection",
  "promotion_decision",
  "canary",
  "deployment",
  "production_pointer",
  "claim_table",
  "research_evidence",
] as const;

export type DevelopmentArtifactTaintClass =
  (typeof DEVELOPMENT_ARTIFACT_TAINT_CLASSES)[number];
export type DevelopmentArtifactUseClassV2 =
  (typeof DEVELOPMENT_ARTIFACT_USE_CLASSES)[number];

const ALWAYS_DEVELOPMENT_ONLY = new Set<
  DevelopmentArtifactUseClassV2
>([
  "research_protocol_manifest",
  "research_candidate_selection",
  "promotion_decision",
  "canary",
  "deployment",
  "production_pointer",
  "claim_table",
  "research_evidence",
]);

function useSet(
  ...values: DevelopmentArtifactUseClassV2[]
): ReadonlySet<DevelopmentArtifactUseClassV2> {
  return new Set(values);
}

const ALLOWED_BY_TAINT: Readonly<
  Record<
    DevelopmentArtifactTaintClass,
    ReadonlySet<DevelopmentArtifactUseClassV2>
  >
> = Object.freeze({
  development_fixture: useSet(
    "attributor_input",
    "prediction_committer_input",
    "scorer_input",
    "development_mutation_proposer_input",
    "governance_audit",
    "development_archive",
  ),
  prediction_pre_oracle: useSet(
    "prediction_committer_input",
    "scorer_input",
    "development_mutation_proposer_input",
    "governance_audit",
    "development_archive",
  ),
  oracle_input: useSet(
    "scorer_oracle_input",
    "governance_audit",
    "development_archive",
  ),
  post_score_output: useSet(
    "governance_audit",
    "development_archive",
  ),
  development_candidate: useSet(
    "candidate_quarantine",
    "development_runtime_input",
    "development_evaluator_input",
    "governance_audit",
    "development_archive",
  ),
  development_evaluation: useSet(
    "governance_audit",
    "development_archive",
  ),
});

export interface DevelopmentTaintedArtifact {
  readonly artifactId: string;
  readonly artifactKind:
    | "fixture_corpus"
    | "prediction_set"
    | "prediction_commitment"
    | "prediction_seal"
    | "oracle_access_event"
    | "score_report"
    | "mutation_proposal"
    | "candidate_harness"
    | "non_promotable_record"
    | "runtime_execution"
    | "evaluator_result"
    | "wrapper_manifest"
    | "archive_record";
  readonly contentHash: string;
  readonly aliases: readonly string[];
  readonly references: readonly string[];
  readonly taintClasses:
    readonly DevelopmentArtifactTaintClass[];
  readonly allowedUseClasses:
    readonly DevelopmentArtifactUseClassV2[];
  readonly prohibitedUseClasses:
    readonly DevelopmentArtifactUseClassV2[];
}

export interface DevelopmentArtifactTaintRecord {
  readonly schemaVersion: 1;
  readonly recordId: string;
  readonly recordType: "development_artifact_taint";
  readonly policyVersion:
    "development-anti-laundering-v1";
  readonly artifacts: readonly DevelopmentTaintedArtifact[];
  readonly propagationPolicy: {
    readonly matchArtifactId: true;
    readonly matchContentHash: true;
    readonly matchAlias: true;
    readonly traverseReferences: true;
    readonly defaultResearchUse: "deny";
  };
  readonly developmentOnly: true;
  readonly authorizedForResearchEvidence: false;
  readonly recordedAt: string;
  readonly recordedBy: PrincipalIdentity;
  readonly recordHash: string;
  readonly publicPrincipal: PublicPrincipal;
  readonly attestation: Attestation;
}

export interface DevelopmentArtifactGraphNode {
  readonly artifactId: string;
  readonly contentHash: string;
  readonly aliases: readonly string[];
  readonly references: readonly string[];
}

type RecordCore = Omit<
  DevelopmentArtifactTaintRecord,
  "recordHash" | "publicPrincipal" | "attestation"
>;
type SignedBody = Omit<
  DevelopmentArtifactTaintRecord,
  "attestation"
>;

function sortedUnique(
  values: readonly string[],
  label: string,
): readonly string[] {
  const sorted = [...values].sort();
  assertCondition(
    sorted.length === new Set(sorted).size,
    "SCHEMA_INVALID",
    `Development taint has duplicate ${label}`,
  );
  return sorted;
}

function allowedFor(
  taints: readonly DevelopmentArtifactTaintClass[],
): readonly DevelopmentArtifactUseClassV2[] {
  return DEVELOPMENT_ARTIFACT_USE_CLASSES.filter(
    (useClass) =>
      !ALWAYS_DEVELOPMENT_ONLY.has(useClass) &&
      taints.every((taint) =>
        ALLOWED_BY_TAINT[taint].has(useClass),
      ),
  );
}

function normalizeArtifact(input: {
  readonly artifactId: string;
  readonly artifactKind: DevelopmentTaintedArtifact["artifactKind"];
  readonly contentHash: string;
  readonly aliases?: readonly string[];
  readonly references?: readonly string[];
  readonly taintClasses:
    readonly DevelopmentArtifactTaintClass[];
}): DevelopmentTaintedArtifact {
  const taintClasses = sortedUnique(
    input.taintClasses,
    "taint class",
  ) as readonly DevelopmentArtifactTaintClass[];
  assertCondition(
    taintClasses.length > 0 &&
      taintClasses.every((taint) =>
        DEVELOPMENT_ARTIFACT_TAINT_CLASSES.includes(taint),
      ),
    "SCHEMA_INVALID",
    "Development artifact needs known taint classes",
  );
  const allowedUseClasses = allowedFor(taintClasses);
  return {
    artifactId: input.artifactId,
    artifactKind: input.artifactKind,
    contentHash: input.contentHash,
    aliases: sortedUnique(
      input.aliases ?? [],
      "artifact alias",
    ),
    references: sortedUnique(
      input.references ?? [],
      "artifact reference",
    ),
    taintClasses,
    allowedUseClasses,
    prohibitedUseClasses:
      DEVELOPMENT_ARTIFACT_USE_CLASSES.filter(
        (useClass) =>
          !allowedUseClasses.includes(useClass),
      ),
  };
}

function coreOf(
  record: DevelopmentArtifactTaintRecord,
): RecordCore {
  const {
    recordHash: _recordHash,
    publicPrincipal: _publicPrincipal,
    attestation: _attestation,
    ...core
  } = record;
  return core;
}

function signedBodyOf(
  record: DevelopmentArtifactTaintRecord,
): SignedBody {
  const { attestation: _attestation, ...body } = record;
  return body;
}

export function createDevelopmentArtifactTaintRecord(input: {
  readonly recordId: string;
  readonly artifacts: readonly {
    readonly artifactId: string;
    readonly artifactKind: DevelopmentTaintedArtifact["artifactKind"];
    readonly contentHash: string;
    readonly aliases?: readonly string[];
    readonly references?: readonly string[];
    readonly taintClasses:
      readonly DevelopmentArtifactTaintClass[];
  }[];
  readonly recordedAt: string;
  readonly signer: PrincipalSigner;
  readonly schemas: SchemaRegistry;
}): DevelopmentArtifactTaintRecord {
  assertCondition(
    input.signer.identity.role === "audit_store",
    "AUTHORIZATION_DENIED",
    "Only audit may issue development anti-laundering taints",
  );
  const artifacts = input.artifacts
    .map(normalizeArtifact)
    .sort((left, right) =>
      left.artifactId.localeCompare(right.artifactId),
    );
  const identityTokens = artifacts.flatMap((artifact) => [
    artifact.artifactId,
    artifact.contentHash,
    ...artifact.aliases,
  ]);
  assertCondition(
    artifacts.length > 0 &&
      identityTokens.length ===
        new Set(identityTokens).size,
    "SCHEMA_INVALID",
    "Development taint identities and aliases must be globally unique",
  );
  const core: RecordCore = {
    schemaVersion: 1,
    recordId: input.recordId,
    recordType: "development_artifact_taint",
    policyVersion: "development-anti-laundering-v1",
    artifacts,
    propagationPolicy: {
      matchArtifactId: true,
      matchContentHash: true,
      matchAlias: true,
      traverseReferences: true,
      defaultResearchUse: "deny",
    },
    developmentOnly: true,
    authorizedForResearchEvidence: false,
    recordedAt: input.recordedAt,
    recordedBy: input.signer.identity,
  };
  const publicPrincipal = input.signer.exportPublic();
  const body: SignedBody = {
    ...core,
    recordHash: sha256(core as unknown as JsonValue),
    publicPrincipal,
  };
  const record: DevelopmentArtifactTaintRecord = {
    ...body,
    attestation: input.signer.attest(
      body as unknown as JsonValue,
    ),
  };
  verifyDevelopmentArtifactTaintRecord({
    record,
    schemas: input.schemas,
  });
  return record;
}

export function verifyDevelopmentArtifactTaintRecord(input: {
  readonly record: DevelopmentArtifactTaintRecord;
  readonly schemas: SchemaRegistry;
}): void {
  input.schemas.validate(
    DEVELOPMENT_ARTIFACT_TAINT_SCHEMA_ID,
    input.record as unknown as JsonValue,
  );
  assertCondition(
    input.record.recordedBy.role === "audit_store" &&
      canonicalize(input.record.publicPrincipal.identity) ===
        canonicalize(input.record.recordedBy) &&
      input.record.recordHash ===
        sha256(coreOf(input.record) as unknown as JsonValue),
    "AUTHORIZATION_DENIED",
    "Development taint authority or record hash changed",
  );
  const tokens = new Set<string>();
  for (const artifact of input.record.artifacts) {
    const normalized = normalizeArtifact(artifact);
    assertCondition(
      canonicalize(normalized) === canonicalize(artifact),
      "HASH_MISMATCH",
      "Development taint policy matrix or ordering changed",
    );
    for (const token of [
      artifact.artifactId,
      artifact.contentHash,
      ...artifact.aliases,
    ]) {
      assertCondition(
        !tokens.has(token),
        "CONFLICT",
        "Development taint token identifies multiple artifacts",
      );
      tokens.add(token);
    }
  }
  const principals = new PrincipalRegistry();
  principals.register(input.record.publicPrincipal);
  principals.verify(
    input.record.recordedBy,
    signedBodyOf(input.record) as unknown as JsonValue,
    input.record.attestation,
  );
}

export class DevelopmentArtifactTaintPolicy {
  readonly #byToken = new Map<
    string,
    DevelopmentTaintedArtifact
  >();
  readonly #schemas: SchemaRegistry;

  public constructor(input: {
    readonly records: readonly DevelopmentArtifactTaintRecord[];
    readonly schemas: SchemaRegistry;
  }) {
    this.#schemas = input.schemas;
    for (const record of input.records) {
      verifyDevelopmentArtifactTaintRecord({
        record,
        schemas: this.#schemas,
      });
      for (const artifact of record.artifacts) {
        for (const token of [
          artifact.artifactId,
          artifact.contentHash,
          ...artifact.aliases,
        ]) {
          const prior = this.#byToken.get(token);
          assertCondition(
            prior === undefined ||
              canonicalize(prior) ===
                canonicalize(artifact),
            "CONFLICT",
            "Conflicting development taint records",
          );
          this.#byToken.set(token, artifact);
        }
      }
    }
  }

  public assertGraphUseAllowed(input: {
    readonly useClass: DevelopmentArtifactUseClassV2;
    readonly rootReferences: readonly string[];
    readonly nodes: readonly DevelopmentArtifactGraphNode[];
  }): void {
    assertCondition(
      DEVELOPMENT_ARTIFACT_USE_CLASSES.includes(
        input.useClass,
      ),
      "SCHEMA_INVALID",
      "Unknown development artifact use class",
    );
    const graphByToken = new Map<
      string,
      DevelopmentArtifactGraphNode
    >();
    for (const node of input.nodes) {
      for (const token of [
        node.artifactId,
        node.contentHash,
        ...node.aliases,
      ]) {
        const prior = graphByToken.get(token);
        assertCondition(
          prior === undefined || prior === node,
          "CONFLICT",
          "Submitted graph contains ambiguous artifact aliases",
        );
        graphByToken.set(token, node);
      }
    }

    const queue = [...input.rootReferences];
    const visited = new Set<string>();
    const tainted = new Map<
      string,
      DevelopmentTaintedArtifact
    >();
    while (queue.length > 0) {
      const token = queue.shift()!;
      if (visited.has(token)) continue;
      visited.add(token);
      const registered = this.#byToken.get(token);
      if (registered !== undefined) {
        tainted.set(
          registered.artifactId,
          registered,
        );
        queue.push(...registered.references);
      }
      const node = graphByToken.get(token);
      if (node !== undefined) {
        queue.push(
          node.artifactId,
          node.contentHash,
          ...node.aliases,
          ...node.references,
        );
      }
    }

    for (const artifact of tainted.values()) {
      assertCondition(
        artifact.allowedUseClasses.includes(
          input.useClass,
        ) &&
          !artifact.prohibitedUseClasses.includes(
            input.useClass,
          ),
        "AUTHORIZATION_DENIED",
        `Development artifact ${artifact.artifactId} cannot be used for ${input.useClass}`,
      );
    }
    if (tainted.size > 0) return;
    assertCondition(
      !ALWAYS_DEVELOPMENT_ONLY.has(input.useClass),
      "AUTHORIZATION_DENIED",
      "Research, claim, or promotion inputs must prove a closed graph free of development aliases",
    );
  }
}
