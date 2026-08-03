import { execFile } from "node:child_process";
import { createPublicKey } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import {
  canonicalize,
  parseStrictJson,
  sha256,
  sha256Bytes,
  type JsonValue,
} from "../core/canonical.js";
import { SchemaRegistry } from "../contracts/schema-registry.js";
import {
  deriveSyntheticProviderCostCap,
  expandSyntheticSeedStream,
  selectSyntheticFinalRolloutCount,
  selectSyntheticPerRequestTokenCap,
  selectSyntheticPhaseResourceCaps,
  selectSyntheticStatisticalMargin,
  type SyntheticCalibrationDerivationResult,
  type SyntheticCapGridInput,
  type SyntheticCostInput,
  type SyntheticMarginInput,
  type SyntheticPhaseResourceInput,
  type SyntheticRolloutCountInput,
  type SyntheticSeedStreamInput,
} from "./calibration-derivation-programs.js";
import {
  verifyCalibrationDerivationProgramReadinessSignature,
  verifyCalibrationDerivationReadinessAuditSignatures,
  type CalibrationDerivationProgramDefinition,
  type CalibrationDerivationProgramReadiness,
  type CalibrationDerivationReadinessArtifactReference,
  type CalibrationDerivationReadinessAuditReceipt,
} from "./calibration-derivation-readiness.js";

const execFileAsync = promisify(execFile);

const EXPECTED_ARTIFACTS = [
  ["numeric_freeze_entry", "governance/gate3/research-protocol-numeric-freeze-entry.json", "application/json"],
  ["calibration_contract", "governance/gate3/calibration-contract-preregistration.json", "application/json"],
  ["calibration_contract_receipt", "governance/gate3/calibration-contract-preregistration-audit-receipt.json", "application/json"],
  ["conformance_manifest", "governance/trust-plane/conformance-manifest.json", "application/json"],
  ["outstanding_obligations", "governance/trust-plane/outstanding-obligations.json", "application/json"],
  ["common_schema", "schemas/common.schema.json", "application/json"],
  ["readiness_schema", "schemas/calibration-derivation-readiness.schema.json", "application/json"],
  ["derivation_programs_source", "src/governance/calibration-derivation-programs.ts", "text/typescript; charset=utf-8"],
  ["synthetic_vectors_source", "src/governance/calibration-derivation-synthetic-vectors.ts", "text/typescript; charset=utf-8"],
  ["readiness_model_source", "src/governance/calibration-derivation-readiness.ts", "text/typescript; charset=utf-8"],
  ["readiness_verifier_source", "src/governance/calibration-derivation-readiness-verifier.ts", "text/typescript; charset=utf-8"],
  ["readiness_generator_source", "scripts/create-calibration-derivation-readiness.ts", "text/typescript; charset=utf-8"],
  ["readiness_verify_script", "scripts/verify-calibration-derivation-readiness.ts", "text/typescript; charset=utf-8"],
  ["derivation_program_tests", "test/calibration-derivation-programs.test.ts", "text/typescript; charset=utf-8"],
  ["readiness_tests", "test/calibration-derivation-readiness.test.ts", "text/typescript; charset=utf-8"],
  ["readiness_documentation", "docs/evaluation/calibration-derivation-program-readiness.md", "text/markdown; charset=utf-8"],
  ["principal_identity_source", "src/trust/identity.ts", "text/typescript; charset=utf-8"],
  ["public_api_source", "src/index.ts", "text/typescript; charset=utf-8"],
  ["package_manifest", "package.json", "application/json"],
] as const;

const EXPECTED_PROGRAM_SPECS = [
  ["F", "per_request_rollout_token_cap", "wilson_one_sided_upper_bound.v1.z_1644854_micros.ceil_probability_micros", 8, 9500, 10000, "smallest_feasible_cap_wins", "duplicate_cap_values_forbidden", "bound_ceil_to_probability_micros"],
  ["G", "empirical_phase_resource_caps", "wilson_one_sided_upper_bound.v1.z_1644854_micros.ceil_probability_micros", 8, 9500, 10000, "smallest_feasible_raw_cap_wins", "raw_cap_then_candidate_id_ascending", "selected_resource_cap_ceil_to_declared_quantum"],
  ["J", "synthetic_provider_cost_cap_arithmetic", "integer_rational_cost_arithmetic.v1", 1, null, null, "derive_only_from_selected_synthetic_G_caps", "not_applicable", "each_token_price_component_ceil_to_integer_micro"],
  ["K", "final_rollout_count_selection", "precomputed_nested_seed_precision_metrics.v1", 4, null, null, "smallest_feasible_of_2_3_5_8_wins", "fixed_rollout_count_order_2_3_5_8", "integer_basis_points_no_rounding"],
  ["L", "deterministic_seed_stream_expansion", "sha256_domain_separated_counter_stream.v1", 4, null, null, "expand_exactly_selected_rollout_count", "counter_ascending_zero_based", "not_applicable"],
  ["M", "statistical_margin_selection", "precomputed_power_and_retention_metrics.v1", 8, null, null, "strictest_feasible_smallest_allowed_loss_wins", "duplicate_allowed_loss_values_forbidden", "integer_basis_points_no_rounding"],
] as const;

const EXPECTED_FAILURES = [
  ["candidate_grid_enlargement", "reject"],
  ["hidden_or_implicit_default_candidate", "reject"],
  ["estimator_or_confidence_bound_drift", "reject"],
  ["rounding_or_tie_rule_reversal", "reject"],
  ["missing_required_stratum", "withdraw"],
  ["missing_usage_undercharging", "withdraw"],
  ["infrastructure_incident_exclusion", "withdraw"],
  ["post_result_grid_modification", "withdraw"],
  ["seed_stream_domain_or_order_change", "reject"],
  ["threshold_widening", "reject"],
  ["cycle_or_forbidden_O_to_D", "reject"],
  ["synthetic_output_as_sentinel", "reject"],
  ["provider_smoke_or_public_fixture_ancestry", "reject"],
  ["role_collapse_or_alias", "reject"],
  ["nonzero_research_budget", "reject"],
  ["final_identity_allocation", "reject"],
  ["authority_or_eligibility_escalation", "reject"],
] as const;

const EXPECTED_VECTOR_IDENTITIES = [
  ["F.smallest-feasible", "F", "sha256:1851959bfea0f299b16bdad8192fab43a61adfea561a4e5f9fed2e409e7416d1", "sha256:081de0baea3d2d9b581f83ba6469b8f4aae9f70d1b8697d211523b6d6ca10863"],
  ["F.missing-usage-withdrawal", "F", "sha256:194f03c3418a98915354709c0092341730dce9cedb59486014f1fac9c4d83528", "sha256:ac055e9be9d6fa0dccd0fe3345efc0886f3a9f74e367931db825f81fd1a5492c"],
  ["F.incident-withdrawal", "F", "sha256:9a310c3c1cd46b1ce7c347da72dbc1120a11f1389aa86e3bf8b1993314212469", "sha256:6740a3cb951e36b2c82a8d383d25c2edd625625ec1ae5dd809e1d2e3f720cb36"],
  ["F.post-result-grid-withdrawal", "F", "sha256:d1d69794d0930b78faa6f98f9afc24157d5a50295bf94d6f35d354c6cedbdba7", "sha256:5a639e95b94c29935f90de6e69a2dfb8e1b1bca59759f3cde1fc1234fd28f65d"],
  ["G.upward-resource-rounding", "G", "sha256:5c8f37ed7f9b6a48b738917750c75381dba43b161e9010fdbc5e67b27b0bd0b1", "sha256:1fd53e6d4a603a29cd98a4d5a14ff390566197df0cc1dabbcd44b5ee8f842469"],
  ["J.upward-integer-micro-cost", "J", "sha256:c2ea190e2cec2963507aaf989b45e0db3f15ca97578ab89640d2a6abceb877c8", "sha256:8f58543d4bc830ba627dfada94f0be8bd997a7618bf28137054d6fac835d0925"],
  ["K.smallest-feasible", "K", "sha256:75195240864c895c4b1e3982c49fa1569a2a1247bca1ce9d1346e45b37486b16", "sha256:b8eb78a31ea23f6c701db5d53aeb1ffaa7be57fd94dc0e78d326d9520ff5b5d9"],
  ["K.precision-limited", "K", "sha256:49f2117cbcf2b569d1e80c3e67719c741fb4572bae2fe685761a0612f39dd047", "sha256:ce9a167a80f7b7c007330e926cc5e7ec8f59cadd7fe8b588700297da6f9fb855"],
  ["L.domain-separated-order", "L", "sha256:ca8ebf12bb01256173cf8fd91ea7cb9d922f6f6a9c062c2f73196f5b195926ef", "sha256:0a1d0fb186038ab4010e60e04e51a952edfc2e33d3fd0c7c7718c4cad4395efc"],
  ["M.strictest-feasible", "M", "sha256:e90b31ebed60a0f5bfded1f157daf43978137f9b8d14c2b93cea1f12783ebd20", "sha256:16cf8f02900bd885c223a1450ae063441d4f3afa07c5f6efe4ac8bdcf92b5a2b"],
  ["M.no-feasible-withdrawal", "M", "sha256:b1aa0e3f366dbb62d277af5126cd64aaa0a0e8b9e65c3d814a1cd7bc26ca4426", "sha256:be9a536163ac025069a8f227672f5553d34b0c0df4c75b701bb9370f19c767f5"],
] as const;

export interface CalibrationDerivationReadinessArtifactReader {
  treeOf(commit: string): Promise<string>;
  read(commit: string, artifactPath: string): Promise<Buffer>;
}

export class GitCalibrationDerivationReadinessArtifactReader
  implements CalibrationDerivationReadinessArtifactReader
{
  readonly #repositoryRoot: string;

  public constructor(repositoryRoot: string) {
    this.#repositoryRoot = path.resolve(repositoryRoot);
  }

  public async treeOf(commit: string): Promise<string> {
    const { stdout } = await execFileAsync(
      "git",
      ["rev-parse", "--verify", `${commit}^{tree}`],
      { cwd: this.#repositoryRoot, encoding: "utf8" },
    );
    return stdout.trim();
  }

  public async read(commit: string, artifactPath: string): Promise<Buffer> {
    ensureSafePath(artifactPath);
    const { stdout } = await execFileAsync(
      "git",
      ["show", `${commit}:${artifactPath}`],
      {
        cwd: this.#repositoryRoot,
        encoding: "buffer",
        maxBuffer: 32 * 1024 * 1024,
      },
    );
    return stdout;
  }
}

export interface CalibrationDerivationReadinessVerificationResult {
  readonly artifactCount: number;
  readonly programCount: number;
  readonly syntheticVectorCount: number;
  readonly withdrawalVectorCount: number;
  readonly precisionLimitedVectorCount: number;
  readonly unresolvedObligationCount: number;
  readonly providerModelRequestAttempts: 0;
  readonly calibrationExecutions: 0;
  readonly protectedDataAccesses: 0;
  readonly authoritiesGranted: 0;
  readonly finalProtocolId: null;
  readonly budgetFreezeId: null;
}

function fail(message: string): never {
  throw new Error(`Calibration derivation readiness verification failed: ${message}`);
}

function ensure(condition: unknown, message: string): asserts condition {
  if (!condition) fail(message);
}

function ensureSafePath(value: string): void {
  ensure(
    value.length > 0 &&
      !path.isAbsolute(value) &&
      !value.split(/[\\/]/u).includes("..") &&
      /^[A-Za-z0-9._/-]+$/u.test(value),
    `unsafe artifact path ${value}`,
  );
}

function sameJson(left: unknown, right: unknown): boolean {
  return canonicalize(left) === canonicalize(right);
}

function asObject(value: JsonValue, label: string): Record<string, JsonValue> {
  ensure(typeof value === "object" && value !== null && !Array.isArray(value), `${label} must be an object`);
  return value as Record<string, JsonValue>;
}

function artifactMap(
  record: CalibrationDerivationProgramReadiness,
): Map<string, CalibrationDerivationReadinessArtifactReference> {
  const map = new Map<string, CalibrationDerivationReadinessArtifactReference>();
  for (const artifact of record.artifacts) {
    ensure(!map.has(artifact.artifactId), `duplicate artifact ${artifact.artifactId}`);
    ensureSafePath(artifact.path);
    map.set(artifact.artifactId, artifact);
  }
  return map;
}

function expectedProgramDefinitions(
  sourceSha256: string,
): readonly CalibrationDerivationProgramDefinition[] {
  return EXPECTED_PROGRAM_SPECS.map((specification) => {
    const [target, programName, estimatorIdentity, candidateBound, confidenceBasisPoints, failureBoundProbabilityMicros, selectionRule, tieRule, roundingRule] = specification;
    const identity = {
      hashDomain: "CalibrationDerivationProgram.v1",
      sourceSha256,
      target,
      programName,
      estimatorIdentity,
      candidateBound,
      confidenceBasisPoints,
      failureBoundProbabilityMicros,
      selectionRule,
      tieRule,
      roundingRule,
    };
    return {
      target,
      programId: `cdp-sha256:${sha256Bytes(Buffer.from(canonicalize(identity), "utf8"))}`,
      programName,
      sourceArtifactId: "derivation_programs_source",
      sourceSha256,
      estimatorIdentity,
      candidateBound,
      confidenceBasisPoints,
      failureBoundProbabilityMicros,
      selectionRule,
      tieRule,
      roundingRule,
    } as CalibrationDerivationProgramDefinition;
  });
}

function verifyPublicRole(
  role: CalibrationDerivationProgramReadiness["roleBoundary"]["protocolAuthor"],
  expectedRole: "protocol_author" | "independent_verifier" | "audit_store",
  expectedProcess: string,
): void {
  ensure(role.role === expectedRole, `${expectedRole} role label differs`);
  ensure(role.publicPrincipal.identity.role === expectedRole, `${expectedRole} identity role differs`);
  ensure(role.processIdentity === expectedProcess, `${expectedRole} process identity differs`);
  ensure(role.currentCapabilityHandles.length === 0, `${expectedRole} has capability handles`);
  ensure(role.delegatedCapabilityIds.length === 0, `${expectedRole} has delegated capabilities`);
  ensure(role.roleAliases.length === 0, `${expectedRole} has role aliases`);
  const publicKey = createPublicKey(role.publicPrincipal.publicKeyPem);
  const digest = `sha256:${sha256Bytes(publicKey.export({ type: "spki", format: "der" }))}`;
  ensure(role.publicPrincipal.identity.identityDigest === digest, `${expectedRole} public key digest differs`);
}

function verifyRoleDisjointness(
  record: CalibrationDerivationProgramReadiness,
): void {
  const roles = [
    record.roleBoundary.protocolAuthor,
    record.roleBoundary.independentVerifier,
    record.roleBoundary.auditStore,
  ];
  verifyPublicRole(roles[0]!, "protocol_author", "process.calibration-derivation-readiness.protocol-author.v1");
  verifyPublicRole(roles[1]!, "independent_verifier", "process.calibration-derivation-readiness.independent-verifier.v1");
  verifyPublicRole(roles[2]!, "audit_store", "process.calibration-derivation-readiness.audit-store.v1");
  const projections = [
    ["principalId", (role: typeof roles[number]) => role.publicPrincipal.identity.principalId],
    ["instanceId", (role: typeof roles[number]) => role.publicPrincipal.identity.instanceId],
    ["keyId", (role: typeof roles[number]) => role.publicPrincipal.keyId],
    ["publicKeyDigest", (role: typeof roles[number]) => role.publicPrincipal.identity.identityDigest],
    ["processIdentity", (role: typeof roles[number]) => role.processIdentity],
  ] as const;
  ensure(
    sameJson(record.roleBoundary.requiredInequalities, projections.map(([name]) => name)),
    "role inequality set differs",
  );
  for (const [name, project] of projections) {
    ensure(new Set(roles.map(project)).size === roles.length, `${name} collapsed across readiness roles`);
  }
  ensure(record.roleBoundary.aliasingDelegationCosigningProxyingForbidden === true, "role collapse prohibition differs");
}

function recomputeVectorResult(target: string, input: JsonValue): SyntheticCalibrationDerivationResult {
  switch (target) {
    case "F":
      return selectSyntheticPerRequestTokenCap(input as unknown as SyntheticCapGridInput);
    case "G":
      return selectSyntheticPhaseResourceCaps(input as unknown as SyntheticPhaseResourceInput);
    case "J":
      return deriveSyntheticProviderCostCap(input as unknown as SyntheticCostInput);
    case "K":
      return selectSyntheticFinalRolloutCount(input as unknown as SyntheticRolloutCountInput);
    case "L":
      return expandSyntheticSeedStream(input as unknown as SyntheticSeedStreamInput);
    case "M":
      return selectSyntheticStatisticalMargin(input as unknown as SyntheticMarginInput);
    default:
      return fail(`unknown synthetic vector target ${target}`);
  }
}

function verifySyntheticVectors(record: CalibrationDerivationProgramReadiness): void {
  ensure(record.syntheticConformanceVectors.length === EXPECTED_VECTOR_IDENTITIES.length, "synthetic vector count differs");
  for (let index = 0; index < EXPECTED_VECTOR_IDENTITIES.length; index += 1) {
    const vector = record.syntheticConformanceVectors[index]!;
    const [caseId, target, inputHash, resultHash] = EXPECTED_VECTOR_IDENTITIES[index]!;
    ensure(vector.caseId === caseId && vector.target === target, `synthetic vector identity differs at ${index}`);
    ensure(sha256(vector.input) === inputHash, `${caseId} input hash differs`);
    ensure(sha256(vector.result as unknown as JsonValue) === resultHash, `${caseId} result hash differs`);
    ensure(vector.result.inputHash === inputHash, `${caseId} embedded input hash differs`);
    ensure(vector.result.target === target, `${caseId} result target differs`);
    for (const marked of [vector, vector.result]) {
      ensure(marked.publicDevelopment === true, `${caseId} is not public development`);
      ensure(marked.authorizedForResearchEvidence === false, `${caseId} claims research evidence`);
      ensure(marked.admissibleAsNumericFreezeValue === false, `${caseId} claims numeric admissibility`);
      ensure(marked.confirmatory === false, `${caseId} claims confirmatory status`);
    }
    const recomputed = recomputeVectorResult(target, vector.input);
    ensure(sameJson(recomputed, vector.result), `${caseId} does not recompute exactly`);
    const { syntheticResultId, ...core } = vector.result;
    ensure(
      syntheticResultId === `sdr-sha256:${sha256Bytes(Buffer.from(canonicalize(core), "utf8"))}`,
      `${caseId} synthetic result identity differs`,
    );
    const header = asObject(vector.input, `${caseId} input`)["header"];
    ensure(header !== undefined, `${caseId} has no synthetic header`);
    const headerObject = asObject(header, `${caseId} header`);
    for (const key of [
      "protectedDataAncestry",
      "providerSmokeAncestry",
      "publicFixtureAncestry",
      "benchmarkAncestry",
      "realProviderPriceAncestry",
      "providerOrModelIdentityPresent",
      "protectedDataCapabilityPresent",
    ]) {
      ensure(headerObject[key] === false, `${caseId} carries forbidden ${key}`);
    }
  }
}

function verifyGraphAcyclic(record: CalibrationDerivationProgramReadiness): void {
  const graph = record.dependencyContract.numericGraph;
  const nodes: readonly string[] = graph.nodes;
  const edges: readonly string[] = graph.edges;
  ensure(!edges.includes("O->D"), "forbidden O->D edge is active");
  ensure(graph.cycleEdgesForbidden.includes("O->D"), "O->D is not explicitly forbidden");
  const incoming = new Map(nodes.map((node) => [node, 0]));
  const outgoing = new Map(nodes.map((node) => [node, [] as string[]]));
  for (const edge of edges) {
    const [sourceExpression, destination] = edge.split("->");
    ensure(sourceExpression !== undefined && destination !== undefined && incoming.has(destination), `invalid graph edge ${edge}`);
    for (const source of sourceExpression.split("+")) {
      ensure(incoming.has(source), `unknown graph source ${source}`);
      outgoing.get(source)!.push(destination);
      incoming.set(destination, incoming.get(destination)! + 1);
    }
  }
  const queue = nodes.filter((node) => incoming.get(node) === 0).sort();
  let visited = 0;
  while (queue.length > 0) {
    const node = queue.shift()!;
    visited += 1;
    for (const destination of outgoing.get(node)!) {
      incoming.set(destination, incoming.get(destination)! - 1);
      if (incoming.get(destination) === 0) {
        queue.push(destination);
        queue.sort();
      }
    }
  }
  ensure(visited === nodes.length, "numeric dependency graph contains a cycle");
  ensure(record.dependencyContract.syntheticOutputBindings.length === 0, "synthetic output has a binding");
  ensure(record.dependencyContract.sentinelWrites.length === 0, "synthetic output writes a sentinel");
  ensure(record.dependencyContract.protocolManifestWrites.length === 0, "synthetic output writes ProtocolManifest");
  ensure(record.dependencyContract.budgetFreezeWrites.length === 0, "synthetic output writes BudgetFreezeManifest");
}

function countTrue(value: unknown): number {
  if (value === true) return 1;
  if (Array.isArray(value)) return value.reduce((sum, item) => sum + countTrue(item), 0);
  if (typeof value === "object" && value !== null) {
    return Object.values(value).reduce((sum, item) => sum + countTrue(item), 0);
  }
  return 0;
}

export async function verifyCalibrationDerivationProgramReadinessAgainstArtifacts(input: {
  readonly record: CalibrationDerivationProgramReadiness;
  readonly schemas: SchemaRegistry;
  readonly reader: CalibrationDerivationReadinessArtifactReader;
}): Promise<CalibrationDerivationReadinessVerificationResult> {
  verifyCalibrationDerivationProgramReadinessSignature({ record: input.record, schemas: input.schemas });
  const record = input.record;
  ensure(record.recordType === "calibration_derivation_program_readiness", "record type differs");
  ensure(record.status === "synthetic_programs_ready_only", "readiness status differs");
  ensure(record.zeroResearchExecution === true && record.researchEvidencePresent === false, "readiness claims execution or evidence");
  ensure(!record.forbiddenRecordTypes.includes(record.recordType), "readiness uses a forbidden record type");

  const tree = await input.reader.treeOf(record.sourceSnapshot.sourceCommit);
  ensure(tree === record.sourceSnapshot.sourceTree, "source tree differs");
  ensure(record.sourceSnapshot.additionalPushPerformed === false, "readiness claims an extra push");
  const artifacts = artifactMap(record);
  ensure(artifacts.size === EXPECTED_ARTIFACTS.length, "artifact count differs");
  for (const [artifactId, artifactPath, mediaType] of EXPECTED_ARTIFACTS) {
    const artifact = artifacts.get(artifactId);
    ensure(artifact !== undefined, `missing artifact ${artifactId}`);
    ensure(artifact.path === artifactPath && artifact.mediaType === mediaType, `${artifactId} metadata differs`);
    ensure(artifact.sourceCommit === record.sourceSnapshot.sourceCommit, `${artifactId} source commit differs`);
    const bytes = await input.reader.read(artifact.sourceCommit, artifact.path);
    ensure(artifact.sizeBytes === bytes.byteLength, `${artifactId} size differs`);
    ensure(artifact.sha256 === `sha256:${sha256Bytes(bytes)}`, `${artifactId} hash differs`);
  }

  const numericBytes = await input.reader.read(record.sourceSnapshot.sourceCommit, artifacts.get("numeric_freeze_entry")!.path);
  const numeric = asObject(parseStrictJson(numericBytes.toString("utf8")), "numeric freeze entry");
  ensure(numeric["entryId"] === record.priorBindings.numericFreezeEntryId, "numeric freeze entry ID differs");
  ensure(`sha256:${sha256Bytes(numericBytes)}` === record.priorBindings.numericFreezeEntryRawSha256, "numeric freeze entry raw hash differs");
  const calibrationBytes = await input.reader.read(record.sourceSnapshot.sourceCommit, artifacts.get("calibration_contract")!.path);
  const calibration = asObject(parseStrictJson(calibrationBytes.toString("utf8")), "calibration contract");
  ensure(calibration["calibrationContractId"] === record.priorBindings.calibrationContractId, "calibration contract ID differs");
  ensure(calibration["contractHash"] === record.priorBindings.calibrationContractHash, "calibration contract hash differs");
  ensure(`sha256:${sha256Bytes(calibrationBytes)}` === record.priorBindings.calibrationContractRawSha256, "calibration contract raw hash differs");
  const calibrationSource = asObject(calibration["sourceSnapshot"]!, "calibration source snapshot");
  ensure(calibrationSource["sourceCommit"] === record.priorBindings.calibrationContractSourceCommit, "calibration source commit differs");

  const obligationsBytes = await input.reader.read(record.sourceSnapshot.sourceCommit, artifacts.get("outstanding_obligations")!.path);
  const obligations = asObject(parseStrictJson(obligationsBytes.toString("utf8")), "outstanding obligations");
  const obligationValues = obligations["obligations"];
  ensure(Array.isArray(obligationValues) && obligationValues.length === 7, "outstanding obligation count differs");
  for (const obligation of obligationValues) {
    const current = asObject(obligation, "outstanding obligation");
    ensure(current["status"] === "unresolved" && current["evidencePresent"] === false, "an outstanding obligation was resolved by readiness work");
  }

  const programArtifact = artifacts.get("derivation_programs_source")!;
  ensure(sameJson(record.programDefinitions, expectedProgramDefinitions(programArtifact.sha256)), "program definitions or content IDs differ");
  const programBytes = await input.reader.read(programArtifact.sourceCommit, programArtifact.path);
  const programText = programBytes.toString("utf8");
  for (const forbidden of [
    /from\s+["']node:(?:fs|child_process|http|https|net|tls|worker_threads)["']/u,
    /\bfetch\s*\(/u,
    /\bprocess\.env\b/u,
    /\bMath\.random\s*\(/u,
    /\bDate\.now\s*\(/u,
  ]) {
    ensure(!forbidden.test(programText), `derivation program source contains forbidden effect ${forbidden.source}`);
  }

  ensure(record.gridContract.protocolCandidateValuesChosen === false, "protocol candidate values were chosen");
  ensure(record.gridContract.protocolCandidateValues.length === 0, "protocol candidate values are present");
  ensure(record.gridContract.capGrid.candidateMaximum === 8, "cap grid widened");
  ensure(sameJson(record.gridContract.rolloutGrid.candidateValues, [2, 3, 5, 8]), "rollout grid differs");
  ensure(record.gridContract.marginGrid.candidateMaximum === 8, "margin grid widened");
  ensure(record.gridContract.implicitOrHiddenDefaultsAllowed === false, "implicit defaults are allowed");
  ensure(record.gridContract.postResultGridModificationAllowed === false, "post-result grid modification is allowed");
  ensure(record.estimatorContract.failureEstimator.confidenceBasisPoints === 9500, "confidence bound drifted");
  ensure(record.estimatorContract.failureEstimator.zMicros === 1_644_854, "Wilson z drifted");
  ensure(record.estimatorContract.failureEstimator.acceptedUpperBoundProbabilityMicros === 10_000, "failure threshold widened");
  ensure(record.estimatorContract.resourceRounding === "upward_to_declared_positive_integer_quantum", "resource rounding reversed");
  ensure(record.estimatorContract.costRounding === "each_input_and_output_token_component_upward_to_integer_micro_then_sum", "cost rounding reversed");
  ensure(record.estimatorContract.seedStream.domain === "seh.calibration.synthetic.seed-stream.v1", "seed domain differs");
  ensure(record.estimatorContract.seedStream.ordering === "counter_ascending_zero_based", "seed ordering differs");
  ensure(record.estimatorContract.rolloutThresholds.mcseMaximumBasisPoints === 100, "MCSE threshold widened");
  ensure(record.estimatorContract.rolloutThresholds.seedVarianceShareMaximumBasisPoints === 2000, "variance threshold widened");
  ensure(record.estimatorContract.marginThresholds.powerMinimumBasisPoints === 8000, "power threshold widened");
  ensure(record.estimatorContract.marginThresholds.retentionMinimumBasisPoints === 8000, "retention threshold widened");
  ensure(record.estimatorContract.marginThresholds.safetyMarginBasisPoints === 0, "safety margin became nonzero");

  ensure(record.syntheticInputPolicy.allowedInputClass === "synthetic_public_development_table", "synthetic input class differs");
  ensure(record.syntheticInputPolicy.requiredAncestry === "manually_authored_synthetic_values", "synthetic ancestry differs");
  ensure(record.syntheticInputPolicy.protectedDataCapabilityPresent === false, "protected data capability is present");
  ensure(record.syntheticInputPolicy.providerCapabilityPresent === false, "provider capability is present");
  ensure(record.syntheticInputPolicy.benchmarkCapabilityPresent === false, "benchmark capability is present");
  ensure(record.syntheticInputPolicy.networkCapabilityPresent === false, "network capability is present");
  for (const required of ["provider_smoke", "public_fixture", "protected_data", "real_provider_price", "provider_or_model_identity"]) {
    ensure((record.syntheticInputPolicy.forbiddenAncestry as readonly string[]).includes(required), `forbidden ancestry ${required} is absent`);
  }
  for (const required of ["numeric_freeze_sentinel_value", "ProtocolManifest_value", "BudgetFreezeManifest_value", "research_claim_evidence"]) {
    ensure((record.syntheticInputPolicy.forbiddenOutputUses as readonly string[]).includes(required), `forbidden output use ${required} is absent`);
  }
  ensure(
    sameJson(
      record.failureContract,
      EXPECTED_FAILURES.map(([condition, disposition]) => ({ condition, disposition })),
    ),
    "failure and withdrawal contract differs",
  );
  verifySyntheticVectors(record);
  verifyGraphAcyclic(record);
  verifyRoleDisjointness(record);

  for (const [key, value] of Object.entries(record.researchExecutionBudget)) {
    ensure(value === 0, `research execution budget ${key} is nonzero`);
  }
  ensure(countTrue(record.authorityState) === 0, "an authority flag is true");
  ensure(record.eligibilityState.publicDevelopment === true, "readiness is not public development");
  const eligibilityWithoutPublic = { ...record.eligibilityState, publicDevelopment: false };
  ensure(countTrue(eligibilityWithoutPublic) === 0, "an eligibility flag is true");
  ensure(Object.values(record.futureIdentityState).every((value) => value === null), "a final identity was allocated");
  ensure(record.claimBoundary.calibrationPerformed === false, "readiness claims calibration");
  ensure(record.claimBoundary.numericValuesFrozen === false, "readiness claims numeric freeze");
  ensure(record.claimBoundary.estimatorAdequacyEstablished === false, "readiness claims estimator adequacy");
  ensure(record.claimBoundary.performanceEvidence === false, "readiness claims performance evidence");
  ensure(record.claimBoundary.evolutionClaim === false && record.claimBoundary.selfImprovementClaim === false, "readiness claims evolution or self-improvement");

  return {
    artifactCount: artifacts.size,
    programCount: record.programDefinitions.length,
    syntheticVectorCount: record.syntheticConformanceVectors.length,
    withdrawalVectorCount: record.syntheticConformanceVectors.filter((vector) => vector.result.status === "withdrawn_synthetic_only").length,
    precisionLimitedVectorCount: record.syntheticConformanceVectors.filter((vector) => vector.result.status === "precision_limited_synthetic_only").length,
    unresolvedObligationCount: obligationValues.length,
    providerModelRequestAttempts: 0,
    calibrationExecutions: 0,
    protectedDataAccesses: 0,
    authoritiesGranted: 0,
    finalProtocolId: null,
    budgetFreezeId: null,
  };
}

export function verifyCalibrationDerivationReadinessAuditReceiptIndependent(input: {
  readonly receipt: CalibrationDerivationReadinessAuditReceipt;
  readonly readiness: CalibrationDerivationProgramReadiness;
  readonly readinessBytes: Uint8Array;
  readonly schemas: SchemaRegistry;
}): void {
  verifyCalibrationDerivationReadinessAuditSignatures(input);
  const verification = input.receipt.independentVerification.verification;
  for (const [key, value] of Object.entries(verification)) {
    if (key === "authoritiesGranted") {
      ensure(value === 0, "audit verification grants authority");
    } else {
      ensure(value === true, `audit verification ${key} is not true`);
    }
  }
  ensure(input.receipt.referenceOnly === true, "audit receipt is not reference-only");
  ensure(input.receipt.grantsAuthority === false, "audit receipt grants authority");
}

export async function verifyCalibrationDerivationReadinessFiles(
  repositoryRoot: string,
): Promise<CalibrationDerivationReadinessVerificationResult> {
  const root = path.resolve(repositoryRoot);
  const schemas = await SchemaRegistry.load(path.join(root, "schemas"));
  const readinessBytes = await readFile(
    path.join(root, "governance/gate3/calibration-derivation-program-readiness.json"),
  );
  const receiptBytes = await readFile(
    path.join(root, "governance/gate3/calibration-derivation-program-readiness-audit-receipt.json"),
  );
  const readiness = parseStrictJson(readinessBytes.toString("utf8")) as unknown as CalibrationDerivationProgramReadiness;
  const receipt = parseStrictJson(receiptBytes.toString("utf8")) as unknown as CalibrationDerivationReadinessAuditReceipt;
  const result = await verifyCalibrationDerivationProgramReadinessAgainstArtifacts({
    record: readiness,
    schemas,
    reader: new GitCalibrationDerivationReadinessArtifactReader(root),
  });
  verifyCalibrationDerivationReadinessAuditReceiptIndependent({
    receipt,
    readiness,
    readinessBytes,
    schemas,
  });
  return result;
}
