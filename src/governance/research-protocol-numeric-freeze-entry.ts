import {
  canonicalize,
  contentId,
  sha256,
  sha256Bytes,
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

export const RESEARCH_PROTOCOL_NUMERIC_FREEZE_ENTRY_SCHEMA_ID =
  `${SCHEMA_BASE_URL}research-protocol-numeric-freeze-entry.schema.json`;

export const RESEARCH_PROTOCOL_NUMERIC_FREEZE_ENTRY_PATH =
  "governance/gate3/research-protocol-numeric-freeze-entry.json";
export const RESEARCH_PROTOCOL_NUMERIC_FREEZE_ENTRY_AUDIT_PATH =
  "governance/gate3/research-protocol-numeric-freeze-entry-audit-receipt.json";

export type NumericFreezeEntryMediaType =
  | "application/json"
  | "text/markdown; charset=utf-8"
  | "text/typescript; charset=utf-8"
  | "text/yaml; charset=utf-8";

export interface NumericFreezeEntryArtifactReference {
  readonly artifactId: string;
  readonly path: string;
  readonly sourceCommit: string;
  readonly sha256: string;
  readonly sizeBytes: number;
  readonly mediaType: NumericFreezeEntryMediaType;
}

export const NUMERIC_FREEZE_ENTRY_ARTIFACT_SPECS = [
  {
    artifactId: "conformance_manifest",
    path: "governance/trust-plane/conformance-manifest.json",
    mediaType: "application/json",
  },
  {
    artifactId: "outstanding_obligations",
    path: "governance/trust-plane/outstanding-obligations.json",
    mediaType: "application/json",
  },
  {
    artifactId: "evaluation_budget",
    path: "configs/evaluation-budget.yaml",
    mediaType: "text/yaml; charset=utf-8",
  },
  {
    artifactId: "gate_feedback_policy",
    path: "configs/gate-feedback-policy.yaml",
    mediaType: "text/yaml; charset=utf-8",
  },
  {
    artifactId: "component_type_registry",
    path: "configs/component-type-registry.json",
    mediaType: "application/json",
  },
  {
    artifactId: "budget_contract",
    path: "docs/evaluation/budget-contract.md",
    mediaType: "text/markdown; charset=utf-8",
  },
  {
    artifactId: "statistical_analysis_plan",
    path: "docs/evaluation/statistical-analysis-plan.md",
    mediaType: "text/markdown; charset=utf-8",
  },
  {
    artifactId: "data_access_policy",
    path: "docs/evaluation/data-access-policy.md",
    mediaType: "text/markdown; charset=utf-8",
  },
  {
    artifactId: "protocol_manifest_schema",
    path: "schemas/protocol-manifest.schema.json",
    mediaType: "application/json",
  },
  {
    artifactId: "budget_freeze_manifest_schema",
    path: "schemas/budget-freeze-manifest.schema.json",
    mediaType: "application/json",
  },
  {
    artifactId: "phase_budget_record_schema",
    path: "schemas/phase-budget-record.schema.json",
    mediaType: "application/json",
  },
  {
    artifactId: "principal_capability_matrix",
    path: "docs/architecture/principal-capability-matrix.md",
    mediaType: "text/markdown; charset=utf-8",
  },
  {
    artifactId: "trust_boundary",
    path: "docs/architecture/trust-boundary.md",
    mediaType: "text/markdown; charset=utf-8",
  },
  {
    artifactId: "threat_model",
    path: "docs/architecture/threat-model.md",
    mediaType: "text/markdown; charset=utf-8",
  },
  {
    artifactId: "entry_schema",
    path: "schemas/research-protocol-numeric-freeze-entry.schema.json",
    mediaType: "application/json",
  },
  {
    artifactId: "entry_model_source",
    path: "src/governance/research-protocol-numeric-freeze-entry.ts",
    mediaType: "text/typescript; charset=utf-8",
  },
  {
    artifactId: "entry_verifier_source",
    path: "src/governance/research-protocol-numeric-freeze-entry-verifier.ts",
    mediaType: "text/typescript; charset=utf-8",
  },
  {
    artifactId: "entry_generator_script",
    path: "scripts/create-research-protocol-numeric-freeze-entry.ts",
    mediaType: "text/typescript; charset=utf-8",
  },
  {
    artifactId: "entry_verify_script",
    path: "scripts/verify-research-protocol-numeric-freeze-entry.ts",
    mediaType: "text/typescript; charset=utf-8",
  },
  {
    artifactId: "entry_test",
    path: "test/research-protocol-numeric-freeze-entry.test.ts",
    mediaType: "text/typescript; charset=utf-8",
  },
  {
    artifactId: "entry_documentation",
    path: "docs/evaluation/research-protocol-numeric-freeze-entry.md",
    mediaType: "text/markdown; charset=utf-8",
  },
  {
    artifactId: "architect_packet",
    path: "architect/PACKET_03RRRRRRRRRRRRRRR_GATE3_NUMERIC_FREEZE_ENTRY.md",
    mediaType: "text/markdown; charset=utf-8",
  },
  {
    artifactId: "architect_ruling",
    path: ".codex/gpt-pro-architect/responses/response-3rrrrrrrrrrrrrrr.md",
    mediaType: "text/markdown; charset=utf-8",
  },
  {
    artifactId: "synthetic_provider_fixture",
    path: "architect/evidence/gate3/provider-budget-freeze.json",
    mediaType: "application/json",
  },
] as const satisfies readonly {
  readonly artifactId: string;
  readonly path: string;
  readonly mediaType: NumericFreezeEntryMediaType;
}[];

export const NUMERIC_FREEZE_ENTRY_GOVERNANCE_ARTIFACT_IDS = [
  "conformance_manifest",
  "outstanding_obligations",
  "architect_packet",
  "architect_ruling",
] as const;

export const NUMERIC_FREEZE_ENTRY_DRAFT_ARTIFACT_IDS = [
  "evaluation_budget",
  "gate_feedback_policy",
  "component_type_registry",
  "budget_contract",
  "statistical_analysis_plan",
  "data_access_policy",
  "protocol_manifest_schema",
  "budget_freeze_manifest_schema",
  "phase_budget_record_schema",
  "principal_capability_matrix",
  "trust_boundary",
  "threat_model",
] as const;

export const NUMERIC_FREEZE_ENTRY_IMPLEMENTATION_ARTIFACT_IDS = [
  "entry_schema",
  "entry_model_source",
  "entry_verifier_source",
  "entry_generator_script",
  "entry_verify_script",
  "entry_test",
  "entry_documentation",
] as const;

export const NUMERIC_FREEZE_ENTRY_PILOT_PENDING_FIELDS = [
  "seeds.finalRolloutCount",
  "seeds.finalRolloutValues",
  "identity",
  "phases",
  "perRequest.rolloutTokenCapT",
  "environment",
  "statisticalMargins",
  "h4SecondModelIdentity",
] as const;

export interface NumericFreezeEntrySentinel {
  readonly path: string;
  readonly sentinel:
    | "PILOT_PENDING"
    | "PILOT_PENDING_BY_PRECISION_RULE"
    | "PILOT_PENDING_AFTER_COUNT_FREEZE";
  readonly effectiveExpansionCount: number;
}

export const NUMERIC_FREEZE_ENTRY_UNRESOLVED_SENTINELS = [
  {
    path: "seeds.finalRolloutCount",
    sentinel: "PILOT_PENDING_BY_PRECISION_RULE",
    effectiveExpansionCount: 1,
  },
  {
    path: "seeds.finalRolloutValues",
    sentinel: "PILOT_PENDING_AFTER_COUNT_FREEZE",
    effectiveExpansionCount: 1,
  },
  {
    path: "h4TransferExperiment.secondProviderAndModelIdentity",
    sentinel: "PILOT_PENDING",
    effectiveExpansionCount: 1,
  },
  { path: "identity.provider", sentinel: "PILOT_PENDING", effectiveExpansionCount: 1 },
  { path: "identity.modelId", sentinel: "PILOT_PENDING", effectiveExpansionCount: 1 },
  { path: "identity.modelRevision", sentinel: "PILOT_PENDING", effectiveExpansionCount: 1 },
  { path: "identity.serviceTier", sentinel: "PILOT_PENDING", effectiveExpansionCount: 1 },
  {
    path: "identity.reproducibilityTier",
    sentinel: "PILOT_PENDING",
    effectiveExpansionCount: 1,
  },
  {
    path: "identity.parameters.reasoningEffort",
    sentinel: "PILOT_PENDING",
    effectiveExpansionCount: 1,
  },
  {
    path: "identity.parameters.temperature",
    sentinel: "PILOT_PENDING",
    effectiveExpansionCount: 1,
  },
  {
    path: "identity.parameters.topP",
    sentinel: "PILOT_PENDING",
    effectiveExpansionCount: 1,
  },
  {
    path: "phases.*.providerModelRequestAttempts",
    sentinel: "PILOT_PENDING",
    effectiveExpansionCount: 12,
  },
  {
    path: "phases.*.totalChargedTokens",
    sentinel: "PILOT_PENDING",
    effectiveExpansionCount: 12,
  },
  {
    path: "phases.*.providerCostMicros",
    sentinel: "PILOT_PENDING",
    effectiveExpansionCount: 12,
  },
  {
    path: "phases.*.toolAttempts",
    sentinel: "PILOT_PENDING",
    effectiveExpansionCount: 12,
  },
  {
    path: "phases.*.feedbackEvents",
    sentinel: "PILOT_PENDING",
    effectiveExpansionCount: 12,
  },
  {
    path: "phases.*.wallClockSeconds",
    sentinel: "PILOT_PENDING",
    effectiveExpansionCount: 12,
  },
  {
    path: "phases.*.processCount",
    sentinel: "PILOT_PENDING",
    effectiveExpansionCount: 12,
  },
  {
    path: "phases.*.cpuSeconds",
    sentinel: "PILOT_PENDING",
    effectiveExpansionCount: 12,
  },
  {
    path: "phases.*.memoryMiB",
    sentinel: "PILOT_PENDING",
    effectiveExpansionCount: 12,
  },
  {
    path: "phases.*.outputBytes",
    sentinel: "PILOT_PENDING",
    effectiveExpansionCount: 12,
  },
  {
    path: "perRequest.rolloutTokenCapT",
    sentinel: "PILOT_PENDING",
    effectiveExpansionCount: 1,
  },
  {
    path: "environment.containerImageDigest",
    sentinel: "PILOT_PENDING",
    effectiveExpansionCount: 1,
  },
  {
    path: "environment.toolchainDigest",
    sentinel: "PILOT_PENDING",
    effectiveExpansionCount: 1,
  },
  {
    path: "environment.networkPolicyDigest",
    sentinel: "PILOT_PENDING",
    effectiveExpansionCount: 1,
  },
] as const satisfies readonly NumericFreezeEntrySentinel[];

export const NUMERIC_FREEZE_ENTRY_PERMITTED_DATA_CLASSES = [
  "publicDevelopment.source_and_tree_metadata",
  "publicDevelopment.policy_schema_and_architecture",
  "publicDevelopment.zero_authority_conformance",
  "publicDevelopment.deterministic_validator_summaries",
  "publicDevelopment.architect_governance",
] as const;

export const NUMERIC_FREEZE_ENTRY_PROHIBITED_DATA_CLASSES = [
  "protected.task_or_benchmark_content",
  "protected.verifier_label_answer_or_diagnostics",
  "protected.task_handles_paths_outcomes_or_traces",
  "secret.credentials_browser_or_provider_material",
  "research.pilot_measurements_or_performance_estimates",
  "research.candidate_selection_promotion_or_deployment_state",
  "quarantine.structural_oracle_as_research_evidence",
  "protected.gate_final_temporal_sealed_or_withheld_material",
] as const;

export const NUMERIC_FREEZE_ENTRY_ZERO_BUDGET = {
  providerModelRequestAttempts: 0,
  providerTokens: 0,
  providerCostMicros: 0,
  runtimeToolAttempts: 0,
  benchmarkVaultUnlocks: 0,
  protectedDataAccesses: 0,
  feedbackReleases: 0,
  researchSchedulerProcesses: 0,
  taskExecutions: 0,
  mutationProposals: 0,
  candidateManifests: 0,
  evaluationResults: 0,
  selectionPromotionDeploymentActions: 0,
  gitPushes: 0,
} as const;

export const NUMERIC_FREEZE_ENTRY_AUTHORITY_STATE = {
  providerExecutionAuthorized: false,
  researchEvidenceAuthorized: false,
  candidateSelectionAuthorized: false,
  promotionAuthorized: false,
  deploymentAuthorized: false,
  claimAuthorityGranted: false,
} as const;

export const NUMERIC_FREEZE_ENTRY_ELIGIBILITY_STATE = {
  publicDevelopment: true,
  authorizedForResearchEvidence: false,
  confirmatory: false,
  eligibleForGate: false,
  eligibleForFinal: false,
  eligibleForHeldOut: false,
  eligibleForSealed: false,
  eligibleForTemporalHoldout: false,
  authorizedForPromotion: false,
} as const;

export interface ResearchProtocolNumericFreezeEntry {
  readonly schemaVersion: 1;
  readonly hashDomain: "ResearchProtocolNumericFreezeEntry.v1";
  readonly entryId: string;
  readonly recordType: "research_protocol_numeric_freeze_entry";
  readonly selectedObligation: "research_protocol_numeric_freeze";
  readonly obligationState: {
    readonly status: "unresolved";
    readonly evidencePresent: false;
  };
  readonly sourceSnapshot: {
    readonly sourceCommit: string;
    readonly sourceTree: string;
    readonly additionalPushPerformed: false;
  };
  readonly artifacts: readonly NumericFreezeEntryArtifactReference[];
  readonly artifactRoles: {
    readonly governanceArtifactIds: readonly string[];
    readonly draftPolicyAndSchemaArtifactIds: readonly string[];
    readonly implementationArtifactIds: readonly string[];
  };
  readonly conformanceBinding: {
    readonly artifactId: "conformance_manifest";
    readonly manifestHash: string;
  };
  readonly outstandingObligationsBinding: {
    readonly artifactId: "outstanding_obligations";
    readonly matrixId: string;
  };
  readonly pilotPendingFields: readonly string[];
  readonly unresolvedSentinels: readonly NumericFreezeEntrySentinel[];
  readonly zeroBudget: typeof NUMERIC_FREEZE_ENTRY_ZERO_BUDGET;
  readonly dataClasses: {
    readonly permitted: readonly string[];
    readonly prohibited: readonly string[];
  };
  readonly authorityState: typeof NUMERIC_FREEZE_ENTRY_AUTHORITY_STATE;
  readonly eligibilityState: typeof NUMERIC_FREEZE_ENTRY_ELIGIBILITY_STATE;
  readonly futureIdentityState: {
    readonly finalProtocolId: null;
    readonly budgetFreezeId: null;
    readonly providerIdentity: null;
    readonly modelIdentity: null;
    readonly serviceTier: null;
    readonly researchBudgetReservation: null;
  };
  readonly syntheticProviderFixtureExclusion: {
    readonly artifactId: "synthetic_provider_fixture";
    readonly forbiddenBudgetFreezeId: string;
    readonly eligibleForEntry: false;
    readonly eligibleForResearchEvidence: false;
    readonly allowedAsDependency: false;
    readonly allowedAsProvenance: false;
    readonly allowedAsValueSource: false;
    readonly allowedAsSupersessionTarget: false;
    readonly forbiddenReferenceForms: readonly string[];
  };
  readonly lineage: {
    readonly supersedesEntryIds: readonly [];
    readonly pooledProtocolIds: readonly [];
    readonly inheritedArtifactIds: readonly [];
    readonly provenanceArtifactIds: readonly [];
    readonly wrappedArtifactIds: readonly [];
    readonly copiedValueSourceArtifactIds: readonly [];
  };
  readonly architectDecision: {
    readonly packetArtifactId: "architect_packet";
    readonly rulingArtifactId: "architect_ruling";
    readonly decision: "APPROVE";
  };
  readonly claimBoundary: {
    readonly entryBoundarySpecified: true;
    readonly numericFreezeComplete: false;
    readonly researchProtocolFrozen: false;
    readonly pilotEvidence: false;
    readonly performanceEvidence: false;
    readonly attributionEvidence: false;
    readonly securityClaim: false;
    readonly evolutionClaim: false;
    readonly selfImprovementClaim: false;
  };
  readonly recordedAt: string;
  readonly recordedBy: PrincipalIdentity;
  readonly entryHash: string;
  readonly publicPrincipal: PublicPrincipal;
  readonly attestation: Attestation;
}

export type UnsignedResearchProtocolNumericFreezeEntry = Omit<
  ResearchProtocolNumericFreezeEntry,
  | "schemaVersion"
  | "hashDomain"
  | "entryId"
  | "recordType"
  | "recordedBy"
  | "entryHash"
  | "publicPrincipal"
  | "attestation"
>;

type EntryCore = Omit<
  ResearchProtocolNumericFreezeEntry,
  "entryHash" | "publicPrincipal" | "attestation"
>;
type EntrySignedBody = Omit<ResearchProtocolNumericFreezeEntry, "attestation">;

function entryIdentity(
  value: UnsignedResearchProtocolNumericFreezeEntry,
): JsonValue {
  return {
    hashDomain: "ResearchProtocolNumericFreezeEntry.v1",
    ...value,
  } as unknown as JsonValue;
}

function entryCore(record: ResearchProtocolNumericFreezeEntry): EntryCore {
  const {
    entryHash: _entryHash,
    publicPrincipal: _publicPrincipal,
    attestation: _attestation,
    ...core
  } = record;
  return core;
}

function entrySignedBody(
  record: ResearchProtocolNumericFreezeEntry,
): EntrySignedBody {
  const { attestation: _attestation, ...body } = record;
  return body;
}

function sameJson(actual: unknown, expected: unknown): boolean {
  return canonicalize(actual) === canonicalize(expected);
}

function sorted(values: readonly string[]): readonly string[] {
  return [...values].sort((left, right) => left.localeCompare(right));
}

function assertExactStrings(
  actual: readonly string[],
  expected: readonly string[],
  label: string,
): void {
  assertCondition(
    sameJson(sorted(actual), sorted(expected)),
    "HASH_MISMATCH",
    `${label} differs`,
  );
}

export function createResearchProtocolNumericFreezeEntry(input: {
  readonly value: UnsignedResearchProtocolNumericFreezeEntry;
  readonly signer: PrincipalSigner;
  readonly schemas: SchemaRegistry;
}): ResearchProtocolNumericFreezeEntry {
  assertCondition(
    input.signer.identity.role === "protocol_author",
    "AUTHORIZATION_DENIED",
    "Numeric-freeze entry requires a protocol-author signer",
  );
  const entryId = contentId(
    "ci-sha256",
    entryIdentity(input.value),
  ).replace("ci-sha256:", "nfe-sha256:");
  const core: EntryCore = {
    schemaVersion: 1,
    hashDomain: "ResearchProtocolNumericFreezeEntry.v1",
    entryId,
    recordType: "research_protocol_numeric_freeze_entry",
    ...input.value,
    recordedBy: input.signer.identity,
  };
  const body: EntrySignedBody = {
    ...core,
    entryHash: sha256(core as unknown as JsonValue),
    publicPrincipal: input.signer.exportPublic(),
  };
  const record: ResearchProtocolNumericFreezeEntry = {
    ...body,
    attestation: input.signer.attest(body as unknown as JsonValue),
  };
  verifyResearchProtocolNumericFreezeEntry({
    record,
    schemas: input.schemas,
  });
  return record;
}

export function verifyResearchProtocolNumericFreezeEntry(input: {
  readonly record: ResearchProtocolNumericFreezeEntry;
  readonly schemas: SchemaRegistry;
}): void {
  input.schemas.validate(
    RESEARCH_PROTOCOL_NUMERIC_FREEZE_ENTRY_SCHEMA_ID,
    input.record as unknown as JsonValue,
  );
  assertCondition(
    input.record.recordedBy.role === "protocol_author",
    "AUTHORIZATION_DENIED",
    "Numeric-freeze entry signer is not a protocol author",
  );
  assertCondition(
    sameJson(
      input.record.recordedBy,
      input.record.publicPrincipal.identity,
    ),
    "AUTHENTICATION_FAILED",
    "Numeric-freeze entry public principal differs",
  );
  const principals = new PrincipalRegistry();
  principals.register(input.record.publicPrincipal);
  principals.verify(
    input.record.recordedBy,
    entrySignedBody(input.record) as unknown as JsonValue,
    input.record.attestation,
  );
  assertCondition(
    input.record.entryHash ===
      sha256(entryCore(input.record) as unknown as JsonValue),
    "HASH_MISMATCH",
    "Numeric-freeze entry hash differs",
  );
  const unsigned: UnsignedResearchProtocolNumericFreezeEntry = {
    selectedObligation: input.record.selectedObligation,
    obligationState: input.record.obligationState,
    sourceSnapshot: input.record.sourceSnapshot,
    artifacts: input.record.artifacts,
    artifactRoles: input.record.artifactRoles,
    conformanceBinding: input.record.conformanceBinding,
    outstandingObligationsBinding:
      input.record.outstandingObligationsBinding,
    pilotPendingFields: input.record.pilotPendingFields,
    unresolvedSentinels: input.record.unresolvedSentinels,
    zeroBudget: input.record.zeroBudget,
    dataClasses: input.record.dataClasses,
    authorityState: input.record.authorityState,
    eligibilityState: input.record.eligibilityState,
    futureIdentityState: input.record.futureIdentityState,
    syntheticProviderFixtureExclusion:
      input.record.syntheticProviderFixtureExclusion,
    lineage: input.record.lineage,
    architectDecision: input.record.architectDecision,
    claimBoundary: input.record.claimBoundary,
    recordedAt: input.record.recordedAt,
  };
  const expectedId = contentId(
    "ci-sha256",
    entryIdentity(unsigned),
  ).replace("ci-sha256:", "nfe-sha256:");
  assertCondition(
    input.record.entryId === expectedId,
    "HASH_MISMATCH",
    "Numeric-freeze entry ID differs",
  );

  const specsById = new Map<
    string,
    (typeof NUMERIC_FREEZE_ENTRY_ARTIFACT_SPECS)[number]
  >(
    NUMERIC_FREEZE_ENTRY_ARTIFACT_SPECS.map((spec) => [
      spec.artifactId,
      spec,
    ]),
  );
  assertCondition(
    input.record.artifacts.length === specsById.size,
    "SCHEMA_INVALID",
    "Numeric-freeze entry artifact count differs",
  );
  const seenIds = new Set<string>();
  const seenPaths = new Set<string>();
  for (const artifact of input.record.artifacts) {
    assertCondition(
      !seenIds.has(artifact.artifactId) &&
        !seenPaths.has(artifact.path),
      "CONFLICT",
      "Numeric-freeze entry repeats an artifact ID or path",
    );
    seenIds.add(artifact.artifactId);
    seenPaths.add(artifact.path);
    const spec = specsById.get(artifact.artifactId);
    assertCondition(
      spec !== undefined &&
        artifact.path === spec.path &&
        artifact.mediaType === spec.mediaType &&
        artifact.sourceCommit ===
          input.record.sourceSnapshot.sourceCommit,
      "HASH_MISMATCH",
      `Numeric-freeze entry artifact ${artifact.artifactId} differs`,
    );
  }
  assertCondition(
    seenIds.size === specsById.size,
    "SCHEMA_INVALID",
    "Numeric-freeze entry omits a required artifact",
  );
  assertExactStrings(
    input.record.artifactRoles.governanceArtifactIds,
    NUMERIC_FREEZE_ENTRY_GOVERNANCE_ARTIFACT_IDS,
    "Governance artifact roles",
  );
  assertExactStrings(
    input.record.artifactRoles.draftPolicyAndSchemaArtifactIds,
    NUMERIC_FREEZE_ENTRY_DRAFT_ARTIFACT_IDS,
    "Draft policy and schema artifact roles",
  );
  assertExactStrings(
    input.record.artifactRoles.implementationArtifactIds,
    NUMERIC_FREEZE_ENTRY_IMPLEMENTATION_ARTIFACT_IDS,
    "Implementation artifact roles",
  );
  assertExactStrings(
    input.record.pilotPendingFields,
    NUMERIC_FREEZE_ENTRY_PILOT_PENDING_FIELDS,
    "Pilot-pending field groups",
  );
  assertCondition(
    sameJson(
      input.record.unresolvedSentinels,
      NUMERIC_FREEZE_ENTRY_UNRESOLVED_SENTINELS,
    ),
    "HASH_MISMATCH",
    "Unresolved-sentinel inventory differs",
  );
  assertCondition(
    sameJson(input.record.zeroBudget, NUMERIC_FREEZE_ENTRY_ZERO_BUDGET) &&
      sameJson(
        input.record.authorityState,
        NUMERIC_FREEZE_ENTRY_AUTHORITY_STATE,
      ) &&
      sameJson(
        input.record.eligibilityState,
        NUMERIC_FREEZE_ENTRY_ELIGIBILITY_STATE,
      ),
    "AUTHORIZATION_DENIED",
    "Numeric-freeze entry grants resources or authority",
  );
  assertExactStrings(
    input.record.dataClasses.permitted,
    NUMERIC_FREEZE_ENTRY_PERMITTED_DATA_CLASSES,
    "Permitted data classes",
  );
  assertExactStrings(
    input.record.dataClasses.prohibited,
    NUMERIC_FREEZE_ENTRY_PROHIBITED_DATA_CLASSES,
    "Prohibited data classes",
  );
  assertCondition(
    Object.values(input.record.futureIdentityState).every(
      (value) => value === null,
    ),
    "INVALID_STATE_TRANSITION",
    "Numeric-freeze entry allocated a future identity or budget",
  );
  assertCondition(
    Object.values(input.record.lineage).every(
      (value) => value.length === 0,
    ),
    "PROTOCOL_MISMATCH",
    "Numeric-freeze entry pools or inherits another record",
  );
  assertExactStrings(
    input.record.syntheticProviderFixtureExclusion
      .forbiddenReferenceForms,
    [
      "alias",
      "dependency",
      "direct",
      "provenance",
      "value_copy",
      "wrapper",
    ],
    "Synthetic fixture forbidden-reference forms",
  );
  assertCondition(
    input.record.obligationState.status === "unresolved" &&
      input.record.obligationState.evidencePresent === false &&
      input.record.claimBoundary.numericFreezeComplete === false &&
      input.record.claimBoundary.researchProtocolFrozen === false,
    "INVALID_STATE_TRANSITION",
    "Numeric-freeze entry claims completion",
  );
}

export interface ResearchProtocolNumericFreezeEntryAuditReceipt {
  readonly schemaVersion: 1;
  readonly hashDomain:
    "ResearchProtocolNumericFreezeEntryAuditReceipt.v1";
  readonly receiptId: string;
  readonly recordType:
    "research_protocol_numeric_freeze_entry_audit_receipt";
  readonly entryReference: {
    readonly entryId: string;
    readonly entryHash: string;
    readonly path: typeof RESEARCH_PROTOCOL_NUMERIC_FREEZE_ENTRY_PATH;
    readonly sha256: string;
    readonly sizeBytes: number;
  };
  readonly sourceSnapshot: {
    readonly sourceCommit: string;
    readonly sourceTree: string;
  };
  readonly verifierArtifactId: "entry_verifier_source";
  readonly verification: {
    readonly schemaValid: true;
    readonly signatureValid: true;
    readonly sourceBindingsValid: true;
    readonly obligationStillUnresolved: true;
    readonly zeroBudgetValid: true;
    readonly authorityAndEligibilityValid: true;
    readonly pendingSentinelsComplete: true;
    readonly protectedDataReferencesAbsent: true;
    readonly syntheticFixtureExcluded: true;
    readonly finalIdentitiesAbsent: true;
    readonly crossProtocolPoolingAbsent: true;
    readonly authoritiesGranted: 0;
  };
  readonly verifiedAt: string;
  readonly producer: PrincipalIdentity;
  readonly receiptHash: string;
  readonly publicPrincipal: PublicPrincipal;
  readonly attestation: Attestation;
}

export type UnsignedResearchProtocolNumericFreezeEntryAuditReceipt = Omit<
  ResearchProtocolNumericFreezeEntryAuditReceipt,
  | "schemaVersion"
  | "hashDomain"
  | "receiptId"
  | "recordType"
  | "producer"
  | "receiptHash"
  | "publicPrincipal"
  | "attestation"
>;

type AuditReceiptCore = Omit<
  ResearchProtocolNumericFreezeEntryAuditReceipt,
  "receiptHash" | "publicPrincipal" | "attestation"
>;
type AuditReceiptSignedBody = Omit<
  ResearchProtocolNumericFreezeEntryAuditReceipt,
  "attestation"
>;

function auditReceiptIdentity(
  value: UnsignedResearchProtocolNumericFreezeEntryAuditReceipt,
): JsonValue {
  return {
    hashDomain:
      "ResearchProtocolNumericFreezeEntryAuditReceipt.v1",
    ...value,
  } as unknown as JsonValue;
}

function auditReceiptCore(
  receipt: ResearchProtocolNumericFreezeEntryAuditReceipt,
): AuditReceiptCore {
  const {
    receiptHash: _receiptHash,
    publicPrincipal: _publicPrincipal,
    attestation: _attestation,
    ...core
  } = receipt;
  return core;
}

function auditReceiptSignedBody(
  receipt: ResearchProtocolNumericFreezeEntryAuditReceipt,
): AuditReceiptSignedBody {
  const { attestation: _attestation, ...body } = receipt;
  return body;
}

export function createResearchProtocolNumericFreezeEntryAuditReceipt(input: {
  readonly value: UnsignedResearchProtocolNumericFreezeEntryAuditReceipt;
  readonly signer: PrincipalSigner;
  readonly schemas: SchemaRegistry;
  readonly entry: ResearchProtocolNumericFreezeEntry;
  readonly entryBytes: Uint8Array;
}): ResearchProtocolNumericFreezeEntryAuditReceipt {
  assertCondition(
    input.signer.identity.role === "audit_store",
    "AUTHORIZATION_DENIED",
    "Numeric-freeze entry receipt requires an audit-store signer",
  );
  const receiptId = contentId(
    "ci-sha256",
    auditReceiptIdentity(input.value),
  ).replace("ci-sha256:", "nfer-sha256:");
  const core: AuditReceiptCore = {
    schemaVersion: 1,
    hashDomain:
      "ResearchProtocolNumericFreezeEntryAuditReceipt.v1",
    receiptId,
    recordType:
      "research_protocol_numeric_freeze_entry_audit_receipt",
    ...input.value,
    producer: input.signer.identity,
  };
  const body: AuditReceiptSignedBody = {
    ...core,
    receiptHash: sha256(core as unknown as JsonValue),
    publicPrincipal: input.signer.exportPublic(),
  };
  const receipt: ResearchProtocolNumericFreezeEntryAuditReceipt = {
    ...body,
    attestation: input.signer.attest(body as unknown as JsonValue),
  };
  verifyResearchProtocolNumericFreezeEntryAuditReceipt({
    receipt,
    entry: input.entry,
    entryBytes: input.entryBytes,
    schemas: input.schemas,
  });
  return receipt;
}

export function verifyResearchProtocolNumericFreezeEntryAuditReceipt(input: {
  readonly receipt: ResearchProtocolNumericFreezeEntryAuditReceipt;
  readonly entry: ResearchProtocolNumericFreezeEntry;
  readonly entryBytes: Uint8Array;
  readonly schemas: SchemaRegistry;
}): void {
  input.schemas.validate(
    RESEARCH_PROTOCOL_NUMERIC_FREEZE_ENTRY_SCHEMA_ID,
    input.receipt as unknown as JsonValue,
  );
  assertCondition(
    input.receipt.producer.role === "audit_store",
    "AUTHORIZATION_DENIED",
    "Numeric-freeze entry receipt signer is not audit store",
  );
  assertCondition(
    sameJson(
      input.receipt.producer,
      input.receipt.publicPrincipal.identity,
    ),
    "AUTHENTICATION_FAILED",
    "Numeric-freeze entry receipt public principal differs",
  );
  const principals = new PrincipalRegistry();
  principals.register(input.receipt.publicPrincipal);
  principals.verify(
    input.receipt.producer,
    auditReceiptSignedBody(input.receipt) as unknown as JsonValue,
    input.receipt.attestation,
  );
  assertCondition(
    input.receipt.receiptHash ===
      sha256(auditReceiptCore(input.receipt) as unknown as JsonValue),
    "HASH_MISMATCH",
    "Numeric-freeze entry audit receipt hash differs",
  );
  const unsigned: UnsignedResearchProtocolNumericFreezeEntryAuditReceipt = {
    entryReference: input.receipt.entryReference,
    sourceSnapshot: input.receipt.sourceSnapshot,
    verifierArtifactId: input.receipt.verifierArtifactId,
    verification: input.receipt.verification,
    verifiedAt: input.receipt.verifiedAt,
  };
  const expectedId = contentId(
    "ci-sha256",
    auditReceiptIdentity(unsigned),
  ).replace("ci-sha256:", "nfer-sha256:");
  assertCondition(
    input.receipt.receiptId === expectedId,
    "HASH_MISMATCH",
    "Numeric-freeze entry audit receipt ID differs",
  );
  assertCondition(
    input.receipt.entryReference.entryId === input.entry.entryId &&
      input.receipt.entryReference.entryHash === input.entry.entryHash &&
      input.receipt.entryReference.path ===
        RESEARCH_PROTOCOL_NUMERIC_FREEZE_ENTRY_PATH &&
      input.receipt.entryReference.sha256 ===
        `sha256:${sha256Bytes(input.entryBytes)}` &&
      input.receipt.entryReference.sizeBytes ===
        input.entryBytes.byteLength,
    "HASH_MISMATCH",
    "Numeric-freeze entry audit receipt does not reference exact entry bytes",
  );
  assertCondition(
    sameJson(input.receipt.sourceSnapshot, {
      sourceCommit: input.entry.sourceSnapshot.sourceCommit,
      sourceTree: input.entry.sourceSnapshot.sourceTree,
    }) && input.receipt.verification.authoritiesGranted === 0,
    "AUTHORIZATION_DENIED",
    "Numeric-freeze entry audit receipt grants authority or drifts source",
  );
}
