import { execFile } from "node:child_process";
import {
  createPublicKey,
  verify as verifySignature,
} from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import {
  canonicalBytes,
  canonicalize,
  parseStrictJson,
  sha256,
  sha256Bytes,
  type JsonValue,
} from "../core/canonical.js";
import { SchemaRegistry } from "../contracts/schema-registry.js";
import type {
  NumericFreezeEntryArtifactReference,
  ResearchProtocolNumericFreezeEntry,
  ResearchProtocolNumericFreezeEntryAuditReceipt,
} from "./research-protocol-numeric-freeze-entry.js";

const execFileAsync = promisify(execFile);

const SCHEMA_ID =
  "https://self-evolving-harness.local/schemas/research-protocol-numeric-freeze-entry.schema.json";
const ENTRY_PATH =
  "governance/gate3/research-protocol-numeric-freeze-entry.json";
const RECEIPT_PATH =
  "governance/gate3/research-protocol-numeric-freeze-entry-audit-receipt.json";

const EXPECTED_ARTIFACTS = [
  ["conformance_manifest", "governance/trust-plane/conformance-manifest.json", "application/json"],
  ["outstanding_obligations", "governance/trust-plane/outstanding-obligations.json", "application/json"],
  ["evaluation_budget", "configs/evaluation-budget.yaml", "text/yaml; charset=utf-8"],
  ["gate_feedback_policy", "configs/gate-feedback-policy.yaml", "text/yaml; charset=utf-8"],
  ["component_type_registry", "configs/component-type-registry.json", "application/json"],
  ["budget_contract", "docs/evaluation/budget-contract.md", "text/markdown; charset=utf-8"],
  ["statistical_analysis_plan", "docs/evaluation/statistical-analysis-plan.md", "text/markdown; charset=utf-8"],
  ["data_access_policy", "docs/evaluation/data-access-policy.md", "text/markdown; charset=utf-8"],
  ["protocol_manifest_schema", "schemas/protocol-manifest.schema.json", "application/json"],
  ["budget_freeze_manifest_schema", "schemas/budget-freeze-manifest.schema.json", "application/json"],
  ["phase_budget_record_schema", "schemas/phase-budget-record.schema.json", "application/json"],
  ["principal_capability_matrix", "docs/architecture/principal-capability-matrix.md", "text/markdown; charset=utf-8"],
  ["trust_boundary", "docs/architecture/trust-boundary.md", "text/markdown; charset=utf-8"],
  ["threat_model", "docs/architecture/threat-model.md", "text/markdown; charset=utf-8"],
  ["entry_schema", "schemas/research-protocol-numeric-freeze-entry.schema.json", "application/json"],
  ["entry_model_source", "src/governance/research-protocol-numeric-freeze-entry.ts", "text/typescript; charset=utf-8"],
  ["entry_verifier_source", "src/governance/research-protocol-numeric-freeze-entry-verifier.ts", "text/typescript; charset=utf-8"],
  ["entry_generator_script", "scripts/create-research-protocol-numeric-freeze-entry.ts", "text/typescript; charset=utf-8"],
  ["entry_verify_script", "scripts/verify-research-protocol-numeric-freeze-entry.ts", "text/typescript; charset=utf-8"],
  ["entry_test", "test/research-protocol-numeric-freeze-entry.test.ts", "text/typescript; charset=utf-8"],
  ["entry_documentation", "docs/evaluation/research-protocol-numeric-freeze-entry.md", "text/markdown; charset=utf-8"],
  ["architect_packet", "architect/PACKET_03RRRRRRRRRRRRRRR_GATE3_NUMERIC_FREEZE_ENTRY.md", "text/markdown; charset=utf-8"],
  ["architect_ruling", ".codex/gpt-pro-architect/responses/response-3rrrrrrrrrrrrrrr.md", "text/markdown; charset=utf-8"],
  ["synthetic_provider_fixture", "architect/evidence/gate3/provider-budget-freeze.json", "application/json"],
] as const;

const EXPECTED_GOVERNANCE_IDS = [
  "architect_packet",
  "architect_ruling",
  "conformance_manifest",
  "outstanding_obligations",
] as const;
const EXPECTED_DRAFT_IDS = [
  "budget_contract",
  "budget_freeze_manifest_schema",
  "component_type_registry",
  "data_access_policy",
  "evaluation_budget",
  "gate_feedback_policy",
  "phase_budget_record_schema",
  "principal_capability_matrix",
  "protocol_manifest_schema",
  "statistical_analysis_plan",
  "threat_model",
  "trust_boundary",
] as const;
const EXPECTED_IMPLEMENTATION_IDS = [
  "entry_documentation",
  "entry_generator_script",
  "entry_model_source",
  "entry_schema",
  "entry_test",
  "entry_verifier_source",
  "entry_verify_script",
] as const;
const EXPECTED_PENDING_FIELDS = [
  "environment",
  "h4SecondModelIdentity",
  "identity",
  "perRequest.rolloutTokenCapT",
  "phases",
  "seeds.finalRolloutCount",
  "seeds.finalRolloutValues",
  "statisticalMargins",
] as const;
const EXPECTED_SENTINELS = [
  ["seeds.finalRolloutCount", "PILOT_PENDING_BY_PRECISION_RULE", 1],
  ["seeds.finalRolloutValues", "PILOT_PENDING_AFTER_COUNT_FREEZE", 1],
  ["h4TransferExperiment.secondProviderAndModelIdentity", "PILOT_PENDING", 1],
  ["identity.provider", "PILOT_PENDING", 1],
  ["identity.modelId", "PILOT_PENDING", 1],
  ["identity.modelRevision", "PILOT_PENDING", 1],
  ["identity.serviceTier", "PILOT_PENDING", 1],
  ["identity.reproducibilityTier", "PILOT_PENDING", 1],
  ["identity.parameters.reasoningEffort", "PILOT_PENDING", 1],
  ["identity.parameters.temperature", "PILOT_PENDING", 1],
  ["identity.parameters.topP", "PILOT_PENDING", 1],
  ["phases.*.providerModelRequestAttempts", "PILOT_PENDING", 12],
  ["phases.*.totalChargedTokens", "PILOT_PENDING", 12],
  ["phases.*.providerCostMicros", "PILOT_PENDING", 12],
  ["phases.*.toolAttempts", "PILOT_PENDING", 12],
  ["phases.*.feedbackEvents", "PILOT_PENDING", 12],
  ["phases.*.wallClockSeconds", "PILOT_PENDING", 12],
  ["phases.*.processCount", "PILOT_PENDING", 12],
  ["phases.*.cpuSeconds", "PILOT_PENDING", 12],
  ["phases.*.memoryMiB", "PILOT_PENDING", 12],
  ["phases.*.outputBytes", "PILOT_PENDING", 12],
  ["perRequest.rolloutTokenCapT", "PILOT_PENDING", 1],
  ["environment.containerImageDigest", "PILOT_PENDING", 1],
  ["environment.toolchainDigest", "PILOT_PENDING", 1],
  ["environment.networkPolicyDigest", "PILOT_PENDING", 1],
] as const;
const EXPECTED_PERMITTED_DATA = [
  "publicDevelopment.architect_governance",
  "publicDevelopment.deterministic_validator_summaries",
  "publicDevelopment.policy_schema_and_architecture",
  "publicDevelopment.source_and_tree_metadata",
  "publicDevelopment.zero_authority_conformance",
] as const;
const EXPECTED_PROHIBITED_DATA = [
  "protected.gate_final_temporal_sealed_or_withheld_material",
  "protected.task_handles_paths_outcomes_or_traces",
  "protected.task_or_benchmark_content",
  "protected.verifier_label_answer_or_diagnostics",
  "quarantine.structural_oracle_as_research_evidence",
  "research.candidate_selection_promotion_or_deployment_state",
  "research.pilot_measurements_or_performance_estimates",
  "secret.credentials_browser_or_provider_material",
] as const;
const EXPECTED_OBLIGATIONS = [
  "b0_b6_research_execution",
  "held_out_confirmatory_attribution",
  "performance_generalization_security_evolution_results",
  "real_benchmark_custody",
  "real_provider_receipt",
  "research_candidate_selection_promotion",
  "research_protocol_numeric_freeze",
] as const;
const EXPECTED_ZERO_BUDGET_KEYS = [
  "benchmarkVaultUnlocks",
  "candidateManifests",
  "evaluationResults",
  "feedbackReleases",
  "gitPushes",
  "mutationProposals",
  "protectedDataAccesses",
  "providerCostMicros",
  "providerModelRequestAttempts",
  "providerTokens",
  "researchSchedulerProcesses",
  "runtimeToolAttempts",
  "selectionPromotionDeploymentActions",
  "taskExecutions",
] as const;
const EXPECTED_AUTHORITY_KEYS = [
  "candidateSelectionAuthorized",
  "claimAuthorityGranted",
  "deploymentAuthorized",
  "promotionAuthorized",
  "providerExecutionAuthorized",
  "researchEvidenceAuthorized",
] as const;
const EXPECTED_PROTECTED_ELIGIBILITY_KEYS = [
  "authorizedForPromotion",
  "authorizedForResearchEvidence",
  "confirmatory",
  "eligibleForFinal",
  "eligibleForGate",
  "eligibleForHeldOut",
  "eligibleForSealed",
  "eligibleForTemporalHoldout",
] as const;

interface SignedRecord {
  readonly recordedBy?: JsonValue;
  readonly producer?: JsonValue;
  readonly publicPrincipal: {
    readonly identity: JsonValue;
    readonly keyId: string;
    readonly publicKeyPem: string;
  };
  readonly attestation: {
    readonly algorithm: string;
    readonly keyId: string;
    readonly signature: string;
  };
  readonly [key: string]: JsonValue | undefined;
}

export interface NumericFreezeEntryArtifactReader {
  treeOf(commit: string): Promise<string>;
  read(commit: string, artifactPath: string): Promise<Buffer>;
}

export class GitNumericFreezeEntryArtifactReader
implements NumericFreezeEntryArtifactReader {
  readonly #root: string;

  public constructor(root: string) {
    this.#root = root;
  }

  public async treeOf(commit: string): Promise<string> {
    const result = await execFileAsync(
      "git",
      ["rev-parse", "--verify", `${commit}^{tree}`],
      { cwd: this.#root, encoding: "utf8" },
    );
    return result.stdout.trim();
  }

  public async read(
    commit: string,
    artifactPath: string,
  ): Promise<Buffer> {
    ensureSafePath(artifactPath);
    const result = await execFileAsync(
      "git",
      ["show", `${commit}:${artifactPath}`],
      {
        cwd: this.#root,
        encoding: "buffer",
        maxBuffer: 32 * 1024 * 1024,
      },
    );
    return result.stdout;
  }
}

export interface NumericFreezeEntryVerificationResult {
  readonly verified: true;
  readonly entryId: string;
  readonly entryHash: string;
  readonly sourceCommit: string;
  readonly sourceTree: string;
  readonly artifactCount: 24;
  readonly pendingSentinelCount: 25;
  readonly unresolvedObligationCount: 7;
  readonly providerModelRequestAttempts: 0;
  readonly authoritiesGranted: 0;
  readonly researchEvidenceAuthorized: false;
  readonly finalProtocolId: null;
  readonly budgetFreezeId: null;
}

function fail(message: string): never {
  throw new Error(`Numeric-freeze entry verification failed: ${message}`);
}

function ensure(
  condition: unknown,
  message: string,
): asserts condition {
  if (!condition) fail(message);
}

function ensureSafePath(value: string): void {
  ensure(
    !path.isAbsolute(value) &&
      !value.split("/").includes("..") &&
      value.length > 0,
    `unsafe artifact path ${value}`,
  );
}

function sorted(values: readonly string[]): readonly string[] {
  return [...values].sort((left, right) => left.localeCompare(right));
}

function sameJson(left: unknown, right: unknown): boolean {
  return canonicalize(left) === canonicalize(right);
}

function sameStrings(
  actual: readonly string[],
  expected: readonly string[],
  label: string,
): void {
  ensure(sameJson(sorted(actual), sorted(expected)), `${label} differs`);
}

function withoutKeys(
  value: SignedRecord,
  keys: readonly string[],
): JsonValue {
  const excluded = new Set(keys);
  return Object.fromEntries(
    Object.entries(value).filter(([key]) => !excluded.has(key)),
  ) as JsonValue;
}

function verifyEmbeddedSignature(
  record: SignedRecord,
  identityField: "recordedBy" | "producer",
  expectedRole: "protocol_author" | "audit_store",
  label: string,
): void {
  const identity = record[identityField];
  ensure(identity !== undefined, `${label} has no signer identity`);
  ensure(
    record.attestation.algorithm === "Ed25519" &&
      record.attestation.keyId === record.publicPrincipal.keyId,
    `${label} attestation metadata differs`,
  );
  ensure(
    sameJson(identity, record.publicPrincipal.identity),
    `${label} public principal differs`,
  );
  const identityRecord = identity as {
    readonly role?: unknown;
    readonly identityDigest?: unknown;
  };
  ensure(identityRecord.role === expectedRole, `${label} signer role differs`);
  const publicKey = createPublicKey(record.publicPrincipal.publicKeyPem);
  const der = publicKey.export({ type: "spki", format: "der" });
  ensure(
    identityRecord.identityDigest === `sha256:${sha256Bytes(der)}`,
    `${label} public-key digest differs`,
  );
  ensure(
    verifySignature(
      null,
      canonicalBytes(withoutKeys(record, ["attestation"])),
      publicKey,
      Buffer.from(record.attestation.signature, "base64url"),
    ),
    `${label} signature is invalid`,
  );
}

function collectStrings(value: unknown, output: string[] = []): string[] {
  if (typeof value === "string") {
    output.push(value);
  } else if (Array.isArray(value)) {
    for (const item of value) collectStrings(item, output);
  } else if (value !== null && typeof value === "object") {
    for (const item of Object.values(value)) collectStrings(item, output);
  }
  return output;
}

function artifactMap(
  record: ResearchProtocolNumericFreezeEntry,
): Map<string, NumericFreezeEntryArtifactReference> {
  const result = new Map<string, NumericFreezeEntryArtifactReference>();
  const paths = new Set<string>();
  for (const artifact of record.artifacts) {
    ensure(!result.has(artifact.artifactId), "duplicate artifact ID");
    ensure(!paths.has(artifact.path), "duplicate artifact path");
    result.set(artifact.artifactId, artifact);
    paths.add(artifact.path);
  }
  return result;
}

function asObject(value: unknown, label: string): Record<string, unknown> {
  ensure(
    value !== null && typeof value === "object" && !Array.isArray(value),
    `${label} is not an object`,
  );
  return value as Record<string, unknown>;
}

function authorityIsZero(value: unknown, label: string): void {
  const object = asObject(value, label);
  sameStrings(Object.keys(object), EXPECTED_AUTHORITY_KEYS, `${label} keys`);
  for (const key of EXPECTED_AUTHORITY_KEYS) {
    ensure(object[key] === false, `${label}.${key} is true`);
  }
}

function verifyEntryIdentityAndSignature(
  record: ResearchProtocolNumericFreezeEntry,
): void {
  verifyEmbeddedSignature(
    record as unknown as SignedRecord,
    "recordedBy",
    "protocol_author",
    "entry",
  );
  const core = withoutKeys(record as unknown as SignedRecord, [
    "entryHash",
    "publicPrincipal",
    "attestation",
  ]);
  ensure(record.entryHash === sha256(core), "entry hash differs");
  const identity = withoutKeys(record as unknown as SignedRecord, [
    "schemaVersion",
    "entryId",
    "recordType",
    "recordedBy",
    "entryHash",
    "publicPrincipal",
    "attestation",
  ]) as Record<string, JsonValue>;
  const expectedId = `nfe-sha256:${sha256Bytes(canonicalBytes({
    hashDomain: "ResearchProtocolNumericFreezeEntry.v1",
    ...identity,
  }))}`;
  ensure(record.entryId === expectedId, "entry ID differs");
}

export async function verifyResearchProtocolNumericFreezeEntryAgainstArtifacts(input: {
  readonly record: ResearchProtocolNumericFreezeEntry;
  readonly schemas: SchemaRegistry;
  readonly reader: NumericFreezeEntryArtifactReader;
}): Promise<NumericFreezeEntryVerificationResult> {
  input.schemas.validate(
    SCHEMA_ID,
    input.record as unknown as JsonValue,
  );
  verifyEntryIdentityAndSignature(input.record);
  ensure(
    input.record.selectedObligation ===
      "research_protocol_numeric_freeze" &&
      input.record.obligationState.status === "unresolved" &&
      input.record.obligationState.evidencePresent === false,
    "selected obligation is not unresolved",
  );
  ensure(
    input.record.sourceSnapshot.additionalPushPerformed === false,
    "entry claims an additional push",
  );
  const sourceTree = await input.reader.treeOf(
    input.record.sourceSnapshot.sourceCommit,
  );
  ensure(
    sourceTree === input.record.sourceSnapshot.sourceTree,
    "source tree differs",
  );

  const artifacts = artifactMap(input.record);
  ensure(artifacts.size === EXPECTED_ARTIFACTS.length, "artifact count differs");
  const artifactBytes = new Map<string, Buffer>();
  for (const [artifactId, artifactPath, mediaType] of EXPECTED_ARTIFACTS) {
    const artifact = artifacts.get(artifactId);
    ensure(artifact !== undefined, `missing artifact ${artifactId}`);
    ensure(
      artifact.path === artifactPath &&
        artifact.mediaType === mediaType &&
        artifact.sourceCommit === input.record.sourceSnapshot.sourceCommit,
      `artifact ${artifactId} identity differs`,
    );
    const bytes = await input.reader.read(
      artifact.sourceCommit,
      artifact.path,
    );
    ensure(
      artifact.sizeBytes === bytes.byteLength &&
        artifact.sha256 === `sha256:${sha256Bytes(bytes)}`,
      `artifact ${artifactId} bytes differ`,
    );
    artifactBytes.set(artifactId, bytes);
  }
  sameStrings(
    input.record.artifactRoles.governanceArtifactIds,
    EXPECTED_GOVERNANCE_IDS,
    "governance artifact roles",
  );
  sameStrings(
    input.record.artifactRoles.draftPolicyAndSchemaArtifactIds,
    EXPECTED_DRAFT_IDS,
    "draft artifact roles",
  );
  sameStrings(
    input.record.artifactRoles.implementationArtifactIds,
    EXPECTED_IMPLEMENTATION_IDS,
    "implementation artifact roles",
  );

  const conformance = asObject(
    parseStrictJson(artifactBytes.get("conformance_manifest")!.toString("utf8")),
    "conformance manifest",
  );
  ensure(
    conformance["manifestHash"] ===
      input.record.conformanceBinding.manifestHash,
    "conformance manifest hash binding differs",
  );
  authorityIsZero(conformance["authorityState"], "conformance authority");
  const conformanceEligibility = asObject(
    conformance["eligibilityState"],
    "conformance eligibility",
  );
  ensure(
    conformanceEligibility["publicDevelopment"] === true,
    "conformance is not public development",
  );
  for (const key of EXPECTED_PROTECTED_ELIGIBILITY_KEYS) {
    ensure(conformanceEligibility[key] === false, `conformance ${key} is true`);
  }

  const obligations = asObject(
    parseStrictJson(artifactBytes.get("outstanding_obligations")!.toString("utf8")),
    "outstanding obligations",
  );
  ensure(
    obligations["matrixId"] ===
      input.record.outstandingObligationsBinding.matrixId,
    "obligation matrix ID differs",
  );
  const obligationArray = obligations["obligations"];
  ensure(Array.isArray(obligationArray), "obligations are not an array");
  const obligationIds: string[] = [];
  for (const value of obligationArray) {
    const obligation = asObject(value, "obligation");
    ensure(
      typeof obligation["obligationId"] === "string" &&
        obligation["status"] === "unresolved" &&
        obligation["evidencePresent"] === false,
      "an obligation is resolved or evidentiary",
    );
    obligationIds.push(obligation["obligationId"]);
  }
  sameStrings(obligationIds, EXPECTED_OBLIGATIONS, "obligation IDs");
  authorityIsZero(obligations["authorityState"], "obligation authority");
  const conformanceObligationRef = asObject(
    conformance["outstandingObligations"],
    "conformance obligation reference",
  );
  ensure(
    conformanceObligationRef["sha256"] ===
      artifacts.get("outstanding_obligations")!.sha256,
    "conformance does not bind the same obligation bytes",
  );

  sameStrings(
    input.record.pilotPendingFields,
    EXPECTED_PENDING_FIELDS,
    "pilot-pending fields",
  );
  ensure(
    sameJson(
      input.record.unresolvedSentinels,
      EXPECTED_SENTINELS.map(([sentinelPath, sentinel, expansion]) => ({
        path: sentinelPath,
        sentinel,
        effectiveExpansionCount: expansion,
      })),
    ),
    "unresolved sentinels differ",
  );
  const budgetText = artifactBytes.get("evaluation_budget")!.toString("utf8");
  for (const sentinel of [
    "PILOT_PENDING",
    "PILOT_PENDING_BY_PRECISION_RULE",
    "PILOT_PENDING_AFTER_COUNT_FREEZE",
  ]) {
    ensure(budgetText.includes(sentinel), `budget omits ${sentinel}`);
  }
  for (const field of EXPECTED_PENDING_FIELDS) {
    ensure(
      budgetText.includes(`- ${field}`),
      `budget omits pending-field declaration ${field}`,
    );
  }

  sameStrings(
    Object.keys(input.record.zeroBudget),
    EXPECTED_ZERO_BUDGET_KEYS,
    "zero-budget keys",
  );
  for (const value of Object.values(input.record.zeroBudget)) {
    ensure(value === 0, "entry has a nonzero resource budget");
  }
  authorityIsZero(input.record.authorityState, "entry authority");
  ensure(
    input.record.eligibilityState.publicDevelopment === true,
    "entry is not public development",
  );
  for (const key of EXPECTED_PROTECTED_ELIGIBILITY_KEYS) {
    ensure(
      input.record.eligibilityState[key] === false,
      `entry eligibility ${key} is true`,
    );
  }
  sameStrings(
    input.record.dataClasses.permitted,
    EXPECTED_PERMITTED_DATA,
    "permitted data classes",
  );
  sameStrings(
    input.record.dataClasses.prohibited,
    EXPECTED_PROHIBITED_DATA,
    "prohibited data classes",
  );
  ensure(
    Object.values(input.record.futureIdentityState).every(
      (value) => value === null,
    ),
    "future protocol, provider, model, or budget identity was allocated",
  );
  ensure(
    Object.values(input.record.lineage).every(
      (value) => value.length === 0,
    ),
    "entry pools or inherits another protocol or artifact",
  );

  const synthetic = asObject(
    parseStrictJson(artifactBytes.get("synthetic_provider_fixture")!.toString("utf8")),
    "synthetic provider fixture",
  );
  ensure(
    synthetic["scope"] === "provider_smoke" &&
      synthetic["budgetFreezeId"] ===
        input.record.syntheticProviderFixtureExclusion
          .forbiddenBudgetFreezeId,
    "synthetic provider fixture exclusion differs",
  );
  const recordStrings = collectStrings(input.record);
  ensure(
    recordStrings.filter(
      (value) =>
        value ===
        input.record.syntheticProviderFixtureExclusion
          .forbiddenBudgetFreezeId,
    ).length === 1,
    "synthetic budget identity is aliased or inherited",
  );
  ensure(
    !input.record.artifactRoles.governanceArtifactIds.includes(
      "synthetic_provider_fixture",
    ) &&
      !input.record.artifactRoles.draftPolicyAndSchemaArtifactIds.includes(
        "synthetic_provider_fixture",
      ) &&
      !input.record.artifactRoles.implementationArtifactIds.includes(
        "synthetic_provider_fixture",
      ),
    "synthetic fixture received a trusted artifact role",
  );

  const packet = artifactBytes.get("architect_packet")!.toString("utf8");
  const ruling = artifactBytes.get("architect_ruling")!.toString("utf8");
  ensure(
    packet.includes("research_protocol_numeric_freeze") &&
      packet.includes("Exact no-execution budget") &&
      ruling.startsWith("DECISION: APPROVE\n") &&
      ruling.includes("AUTHORIZED_NEXT_SCOPE:") &&
      ruling.includes("No calibration, numeric pilot"),
    "Architect packet or ruling boundary differs",
  );
  ensure(
    input.record.claimBoundary.entryBoundarySpecified === true &&
      Object.entries(input.record.claimBoundary)
        .filter(([key]) => key !== "entryBoundarySpecified")
        .every(([, value]) => value === false),
    "entry claims research completion or results",
  );

  return {
    verified: true,
    entryId: input.record.entryId,
    entryHash: input.record.entryHash,
    sourceCommit: input.record.sourceSnapshot.sourceCommit,
    sourceTree: input.record.sourceSnapshot.sourceTree,
    artifactCount: 24,
    pendingSentinelCount: 25,
    unresolvedObligationCount: 7,
    providerModelRequestAttempts: 0,
    authoritiesGranted: 0,
    researchEvidenceAuthorized: false,
    finalProtocolId: null,
    budgetFreezeId: null,
  };
}

function verifyReceiptSignatureAndHash(
  receipt: ResearchProtocolNumericFreezeEntryAuditReceipt,
): void {
  verifyEmbeddedSignature(
    receipt as unknown as SignedRecord,
    "producer",
    "audit_store",
    "audit receipt",
  );
  const core = withoutKeys(receipt as unknown as SignedRecord, [
    "receiptHash",
    "publicPrincipal",
    "attestation",
  ]);
  ensure(receipt.receiptHash === sha256(core), "audit receipt hash differs");
  const identity = withoutKeys(receipt as unknown as SignedRecord, [
    "schemaVersion",
    "receiptId",
    "recordType",
    "producer",
    "receiptHash",
    "publicPrincipal",
    "attestation",
  ]) as Record<string, JsonValue>;
  const expectedId = `nfer-sha256:${sha256Bytes(canonicalBytes({
    hashDomain:
      "ResearchProtocolNumericFreezeEntryAuditReceipt.v1",
    ...identity,
  }))}`;
  ensure(receipt.receiptId === expectedId, "audit receipt ID differs");
}

export function verifyResearchProtocolNumericFreezeEntryAuditReceiptIndependent(input: {
  readonly receipt: ResearchProtocolNumericFreezeEntryAuditReceipt;
  readonly entry: ResearchProtocolNumericFreezeEntry;
  readonly entryBytes: Uint8Array;
  readonly schemas: SchemaRegistry;
}): void {
  input.schemas.validate(
    SCHEMA_ID,
    input.receipt as unknown as JsonValue,
  );
  verifyReceiptSignatureAndHash(input.receipt);
  ensure(
    input.receipt.entryReference.entryId === input.entry.entryId &&
      input.receipt.entryReference.entryHash === input.entry.entryHash &&
      input.receipt.entryReference.path === ENTRY_PATH &&
      input.receipt.entryReference.sha256 ===
        `sha256:${sha256Bytes(input.entryBytes)}` &&
      input.receipt.entryReference.sizeBytes === input.entryBytes.byteLength,
    "audit receipt entry reference differs",
  );
  ensure(
    input.receipt.sourceSnapshot.sourceCommit ===
      input.entry.sourceSnapshot.sourceCommit &&
      input.receipt.sourceSnapshot.sourceTree ===
        input.entry.sourceSnapshot.sourceTree &&
      input.receipt.verifierArtifactId === "entry_verifier_source",
    "audit receipt source binding differs",
  );
  ensure(
    Object.entries(input.receipt.verification).every(
      ([key, value]) =>
        key === "authoritiesGranted" ? value === 0 : value === true,
    ),
    "audit receipt reports a failed check or authority",
  );
}

export async function verifyResearchProtocolNumericFreezeEntryFiles(input: {
  readonly repositoryRoot: string;
  readonly entryPath?: string;
  readonly receiptPath?: string;
}): Promise<NumericFreezeEntryVerificationResult & {
  readonly auditReceiptId: string;
  readonly auditReceiptHash: string;
}> {
  const entryPath = input.entryPath ?? ENTRY_PATH;
  const receiptPath = input.receiptPath ?? RECEIPT_PATH;
  ensureSafePath(entryPath);
  ensureSafePath(receiptPath);
  const [entryBytes, receiptBytes, schemas] = await Promise.all([
    readFile(path.join(input.repositoryRoot, entryPath)),
    readFile(path.join(input.repositoryRoot, receiptPath)),
    SchemaRegistry.load(path.join(input.repositoryRoot, "schemas")),
  ]);
  const entry = parseStrictJson(
    entryBytes.toString("utf8"),
  ) as unknown as ResearchProtocolNumericFreezeEntry;
  const receipt = parseStrictJson(
    receiptBytes.toString("utf8"),
  ) as unknown as ResearchProtocolNumericFreezeEntryAuditReceipt;
  const result =
    await verifyResearchProtocolNumericFreezeEntryAgainstArtifacts({
      record: entry,
      schemas,
      reader: new GitNumericFreezeEntryArtifactReader(
        input.repositoryRoot,
      ),
    });
  verifyResearchProtocolNumericFreezeEntryAuditReceiptIndependent({
    receipt,
    entry,
    entryBytes,
    schemas,
  });
  return {
    ...result,
    auditReceiptId: receipt.receiptId,
    auditReceiptHash: receipt.receiptHash,
  };
}
