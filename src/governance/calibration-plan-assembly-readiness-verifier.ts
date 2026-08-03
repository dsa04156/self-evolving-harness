import { execFile } from "node:child_process";
import { createPublicKey } from "node:crypto";
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
  verifyCalibrationPlanAssemblyAuditSignatures,
  verifyCalibrationPlanAssemblyReadinessSignature,
  type CalibrationPlanAssemblyArtifactReference,
  type CalibrationPlanAssemblyAuditReceipt,
  type CalibrationPlanAssemblyReadiness,
} from "./calibration-plan-assembly-readiness.js";

const execFileAsync = promisify(execFile);

const EXPECTED_ARTIFACTS = [
  ["numeric_freeze_entry", "governance/gate3/research-protocol-numeric-freeze-entry.json", "application/json"],
  ["numeric_freeze_entry_receipt", "governance/gate3/research-protocol-numeric-freeze-entry-audit-receipt.json", "application/json"],
  ["calibration_contract", "governance/gate3/calibration-contract-preregistration.json", "application/json"],
  ["calibration_contract_receipt", "governance/gate3/calibration-contract-preregistration-audit-receipt.json", "application/json"],
  ["derivation_readiness", "governance/gate3/calibration-derivation-program-readiness.json", "application/json"],
  ["derivation_readiness_receipt", "governance/gate3/calibration-derivation-program-readiness-audit-receipt.json", "application/json"],
  ["conformance_manifest", "governance/trust-plane/conformance-manifest.json", "application/json"],
  ["outstanding_obligations", "governance/trust-plane/outstanding-obligations.json", "application/json"],
  ["derivation_evidence_packet", "architect/PACKET_03RRRRRRRRRRRRRRRRRRRR_CALIBRATION_DERIVATION_READINESS_EVIDENCE.md", "text/markdown; charset=utf-8"],
  ["derivation_evidence_ruling", ".codex/gpt-pro-architect/responses/response-3rrrrrrrrrrrrrrrrrrrr.md", "text/markdown; charset=utf-8"],
  ["common_schema", "schemas/common.schema.json", "application/json"],
  ["assembly_schema", "schemas/calibration-plan-assembly-readiness.schema.json", "application/json"],
  ["derivation_programs_source", "src/governance/calibration-derivation-programs.ts", "text/typescript; charset=utf-8"],
  ["portability_source", "src/governance/calibration-plan-assembly-portability.ts", "text/typescript; charset=utf-8"],
  ["portability_reference", "scripts/calibration-portability-reference.py", "text/x-python; charset=utf-8"],
  ["assembly_model", "src/governance/calibration-plan-assembly-readiness.ts", "text/typescript; charset=utf-8"],
  ["assembly_verifier", "src/governance/calibration-plan-assembly-readiness-verifier.ts", "text/typescript; charset=utf-8"],
  ["assembly_generator", "scripts/create-calibration-plan-assembly-readiness.ts", "text/typescript; charset=utf-8"],
  ["assembly_verify_script", "scripts/verify-calibration-plan-assembly-readiness.ts", "text/typescript; charset=utf-8"],
  ["assembly_tests", "test/calibration-plan-assembly-readiness.test.ts", "text/typescript; charset=utf-8"],
  ["assembly_documentation", "docs/evaluation/calibration-plan-assembly-readiness.md", "text/markdown; charset=utf-8"],
  ["principal_identity_source", "src/trust/identity.ts", "text/typescript; charset=utf-8"],
  ["public_api_source", "src/index.ts", "text/typescript; charset=utf-8"],
  ["package_manifest", "package.json", "application/json"],
] as const;

const EXPECTED_PRIOR_BINDINGS = {
  numericFreezeEntryId: "nfe-sha256:7517cce6f2878429161bd73154d1ef71f5bb8fe27ca3a77e08b4b55b43df268f",
  numericFreezeEntryRawSha256: "sha256:432b341bf40096134d787381fb963c12266e2d73db97e079946614335ad01391",
  calibrationContractId: "cc-sha256:8d4ffe8fc9fee52dd3b81b58ae8c7ba65b0bafc4f1d7079f91f3e810f20fff9f",
  calibrationContractHash: "sha256:004bd1d7ae369a6e29978117d83539dec90633f3da3f6d1a0c5d5a6fbf3c8f56",
  calibrationContractRawSha256: "sha256:5231c0152ee359e42c1879ecc4d1740c8eafde132bd501f8e4196f217128d22d",
  derivationReadinessId: "cdr-sha256:d10bb58f4222876c1dd431c42cdd599e4c2317712abb314fff7e2bd699dfb08d",
  derivationReadinessHash: "sha256:b8c6239012c2a40a7f85fc64642d82d4edaed91eb845a2c1ee84026534cc7a10",
  derivationReadinessRawSha256: "sha256:ba2b142c7ac81b86ab45685eef53c20fd85e1ca1c4932501e244503a803e8c7c",
  derivationEvidencePacketRawSha256: "sha256:df35a708191cebfa0b84be94d3bcb06c855426ac2767fe13aa2953d77f4eb105",
  derivationEvidenceRulingRawSha256: "sha256:b79e1d47c4fd81d0968a8ae5ab1f8a252b761d121867519d25e725d6d075448c",
  derivationEvidenceDecision: "APPROVE",
} as const;

const EXPECTED_SEMANTIC_HASHES = {
  fieldEvidenceMap: "sha256:b61a0fdcb2f6d24be795a72bef91f7e6967446e740727db493f961f3dd76475c",
  freezeAdmissionFirewall: "sha256:efb8275e6f6157239a829d510595a3287e670b3da065a5cc9b18e5ef6e083641",
  futureCandidateGridSchemas: "sha256:1190228d0b5a73920f8cb34e996ef438798ff0470b071719e3c5198879bdbf62",
  arithmeticPortabilityContract: "sha256:57b0c05a8c9b9b3cc40f9ff4f2e250e53e7085cf5c3c13e7b31d92074679d085",
  assemblyCompletenessRule: "sha256:d66416156065145f1532cbb61a5f4a27eba17d9506bafa58ee2b63b6d1ecf9ea",
  zeroBudget: "sha256:f477ae9f77391c6b722c96239f533d556d7300e883e13519a4d1fe9deeafadb1",
  authorityState: "sha256:72217eab643c9f2061e04ca143c32abb4b185d8b909077537bef707d37885ccf",
  eligibilityState: "sha256:25d7b2172a4aef8aaf3c9b527d110e26245492e83fe2425d4b77bbbc64010ad3",
} as const;

const EXPECTED_MAPPING_PATHS = [
  "seeds.finalRolloutCount",
  "seeds.finalRolloutValues",
  "h4TransferExperiment.secondProviderAndModelIdentity",
  "identity.provider",
  "identity.modelId",
  "identity.modelRevision",
  "identity.serviceTier",
  "identity.reproducibilityTier",
  "identity.parameters.reasoningEffort",
  "identity.parameters.temperature",
  "identity.parameters.topP",
  "phases.*.providerModelRequestAttempts",
  "phases.*.totalChargedTokens",
  "phases.*.providerCostMicros",
  "phases.*.toolAttempts",
  "phases.*.feedbackEvents",
  "phases.*.wallClockSeconds",
  "phases.*.processCount",
  "phases.*.cpuSeconds",
  "phases.*.memoryMiB",
  "phases.*.outputBytes",
  "perRequest.rolloutTokenCapT",
  "environment.containerImageDigest",
  "environment.toolchainDigest",
  "environment.networkPolicyDigest",
  "statisticalMargins",
] as const;

export interface CalibrationPlanAssemblyArtifactReader {
  treeOf(commit: string): Promise<string>;
  read(commit: string, artifactPath: string): Promise<Buffer>;
}

export class GitCalibrationPlanAssemblyArtifactReader
  implements CalibrationPlanAssemblyArtifactReader
{
  readonly #repositoryRoot: string;

  public constructor(repositoryRoot: string) {
    this.#repositoryRoot = path.resolve(repositoryRoot);
  }

  public async treeOf(commit: string): Promise<string> {
    const { stdout } = await execFileAsync("git", ["rev-parse", "--verify", `${commit}^{tree}`], {
      cwd: this.#repositoryRoot,
      encoding: "utf8",
    });
    return stdout.trim();
  }

  public async read(commit: string, artifactPath: string): Promise<Buffer> {
    ensureSafePath(artifactPath);
    const { stdout } = await execFileAsync("git", ["show", `${commit}:${artifactPath}`], {
      cwd: this.#repositoryRoot,
      encoding: "buffer",
      maxBuffer: 32 * 1024 * 1024,
    });
    return stdout;
  }
}

export interface CalibrationPortabilityReferenceExecutor {
  evaluate(referenceSource: Buffer): Promise<JsonValue>;
}

export class PythonCalibrationPortabilityReferenceExecutor
  implements CalibrationPortabilityReferenceExecutor
{
  public async evaluate(referenceSource: Buffer): Promise<JsonValue> {
    const { stdout, stderr } = await execFileAsync(
      "python3",
      ["-c", referenceSource.toString("utf8")],
      { encoding: "utf8", maxBuffer: 4 * 1024 * 1024 },
    );
    ensure(stderr.length === 0, "Python portability reference emitted stderr");
    return parseStrictJson(stdout.trim());
  }
}

export interface CalibrationPlanAssemblyVerificationResult {
  readonly artifactCount: 24;
  readonly programBindingCount: 6;
  readonly pendingSentinelMappingCount: 25;
  readonly statisticalMarginMappingCount: 1;
  readonly effectiveExpandedOutputCount: 136;
  readonly goldenVectorCount: 8;
  readonly unresolvedObligationCount: number;
  readonly providerModelRequestAttempts: 0;
  readonly calibrationExecutions: 0;
  readonly protectedDataAccesses: 0;
  readonly calibrationPlanManifests: 0;
  readonly oProposals: 0;
  readonly authoritiesGranted: 0;
  readonly finalProtocolId: null;
  readonly budgetFreezeId: null;
}

function fail(message: string): never {
  throw new Error(`Calibration plan assembly readiness verification failed: ${message}`);
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

function objectOf(value: JsonValue, label: string): Record<string, JsonValue> {
  ensure(typeof value === "object" && value !== null && !Array.isArray(value), `${label} must be an object`);
  return value as Record<string, JsonValue>;
}

function artifactMap(record: CalibrationPlanAssemblyReadiness): Map<string, CalibrationPlanAssemblyArtifactReference> {
  const map = new Map<string, CalibrationPlanAssemblyArtifactReference>();
  for (const artifact of record.artifacts) {
    ensure(!map.has(artifact.artifactId), `duplicate artifact ${artifact.artifactId}`);
    ensureSafePath(artifact.path);
    map.set(artifact.artifactId, artifact);
  }
  return map;
}

function verifyRoleDisjointness(record: CalibrationPlanAssemblyReadiness): void {
  const expected = [
    [record.roleBoundary.protocolAuthor, "protocol_author", "process.calibration-plan-assembly-readiness.protocol-author.v1"],
    [record.roleBoundary.independentVerifier, "independent_verifier", "process.calibration-plan-assembly-readiness.independent-verifier.v1"],
    [record.roleBoundary.auditStore, "audit_store", "process.calibration-plan-assembly-readiness.audit-store.v1"],
  ] as const;
  const rows: string[][] = [];
  for (const [role, roleName, processIdentity] of expected) {
    ensure(role.role === roleName && role.publicPrincipal.identity.role === roleName, `${roleName} role differs`);
    ensure(role.processIdentity === processIdentity, `${roleName} process differs`);
    ensure(role.currentCapabilityHandles.length === 0 && role.delegatedCapabilityIds.length === 0 && role.roleAliases.length === 0, `${roleName} has aliases or capabilities`);
    const key = createPublicKey(role.publicPrincipal.publicKeyPem);
    const digest = `sha256:${sha256Bytes(key.export({ type: "spki", format: "der" }))}`;
    ensure(role.publicPrincipal.identity.identityDigest === digest, `${roleName} key digest differs`);
    rows.push([
      role.publicPrincipal.identity.principalId,
      role.publicPrincipal.identity.instanceId,
      role.publicPrincipal.keyId,
      digest,
      role.processIdentity,
    ]);
  }
  for (let column = 0; column < 5; column += 1) {
    ensure(new Set(rows.map((row) => row[column])).size === rows.length, `role identity column ${column} collapsed`);
  }
  ensure(
    sameJson(record.roleBoundary.requiredInequalities, ["principalId", "instanceId", "keyId", "publicKeyDigest", "processIdentity"]) &&
      record.roleBoundary.aliasingDelegationCosigningProxyingForbidden === true,
    "role inequality contract differs",
  );
}

async function verifyArtifacts(input: {
  readonly record: CalibrationPlanAssemblyReadiness;
  readonly reader: CalibrationPlanAssemblyArtifactReader;
}): Promise<Map<string, Buffer>> {
  const tree = await input.reader.treeOf(input.record.sourceSnapshot.sourceCommit);
  ensure(tree === input.record.sourceSnapshot.sourceTree, "source tree differs");
  ensure(input.record.sourceSnapshot.additionalPushPerformed === false, "source snapshot reports a push");
  const artifacts = artifactMap(input.record);
  ensure(artifacts.size === EXPECTED_ARTIFACTS.length, "artifact count differs");
  const bytes = new Map<string, Buffer>();
  for (const [artifactId, artifactPath, mediaType] of EXPECTED_ARTIFACTS) {
    const artifact = artifacts.get(artifactId);
    ensure(artifact !== undefined, `missing artifact ${artifactId}`);
    ensure(
      artifact.path === artifactPath &&
        artifact.mediaType === mediaType &&
        artifact.sourceCommit === input.record.sourceSnapshot.sourceCommit,
      `artifact ${artifactId} metadata differs`,
    );
    const content = await input.reader.read(artifact.sourceCommit, artifact.path);
    ensure(artifact.sizeBytes === content.byteLength, `artifact ${artifactId} size differs`);
    ensure(artifact.sha256 === `sha256:${sha256Bytes(content)}`, `artifact ${artifactId} hash differs`);
    bytes.set(artifactId, content);
  }
  return bytes;
}

function verifyPriorBindings(record: CalibrationPlanAssemblyReadiness, bytes: ReadonlyMap<string, Buffer>): {
  readonly programBindings: readonly { readonly target: string; readonly programId: string; readonly sourceSha256: string }[];
  readonly unresolvedObligationCount: number;
} {
  ensure(sameJson(record.priorBindings, EXPECTED_PRIOR_BINDINGS), "prior bindings differ");
  const numeric = objectOf(parseStrictJson(bytes.get("numeric_freeze_entry")!.toString("utf8")), "numeric freeze entry");
  const contract = objectOf(parseStrictJson(bytes.get("calibration_contract")!.toString("utf8")), "calibration contract");
  const derivation = objectOf(parseStrictJson(bytes.get("derivation_readiness")!.toString("utf8")), "derivation readiness");
  ensure(numeric["entryId"] === EXPECTED_PRIOR_BINDINGS.numericFreezeEntryId, "numeric freeze entry identity differs");
  ensure(contract["calibrationContractId"] === EXPECTED_PRIOR_BINDINGS.calibrationContractId, "calibration contract identity differs");
  ensure(contract["contractHash"] === EXPECTED_PRIOR_BINDINGS.calibrationContractHash, "calibration contract hash differs");
  ensure(derivation["readinessId"] === EXPECTED_PRIOR_BINDINGS.derivationReadinessId, "derivation readiness identity differs");
  ensure(derivation["readinessHash"] === EXPECTED_PRIOR_BINDINGS.derivationReadinessHash, "derivation readiness hash differs");
  ensure(`sha256:${sha256Bytes(bytes.get("numeric_freeze_entry")!)}` === EXPECTED_PRIOR_BINDINGS.numericFreezeEntryRawSha256, "numeric entry raw hash differs");
  ensure(`sha256:${sha256Bytes(bytes.get("calibration_contract")!)}` === EXPECTED_PRIOR_BINDINGS.calibrationContractRawSha256, "calibration contract raw hash differs");
  ensure(`sha256:${sha256Bytes(bytes.get("derivation_readiness")!)}` === EXPECTED_PRIOR_BINDINGS.derivationReadinessRawSha256, "derivation readiness raw hash differs");
  ensure(`sha256:${sha256Bytes(bytes.get("derivation_evidence_packet")!)}` === EXPECTED_PRIOR_BINDINGS.derivationEvidencePacketRawSha256, "evidence packet raw hash differs");
  ensure(`sha256:${sha256Bytes(bytes.get("derivation_evidence_ruling")!)}` === EXPECTED_PRIOR_BINDINGS.derivationEvidenceRulingRawSha256, "evidence ruling raw hash differs");
  ensure(bytes.get("derivation_evidence_ruling")!.toString("utf8").startsWith("DECISION: APPROVE\n"), "bound ruling is not APPROVE");
  const sentinelRows = numeric["unresolvedSentinels"];
  ensure(Array.isArray(sentinelRows) && sentinelRows.length === 25, "numeric-freeze sentinel inventory differs");
  sentinelRows.forEach((value, index) => {
    const sentinel = objectOf(value, "numeric-freeze sentinel");
    const mapping = record.fieldEvidenceMap[index];
    ensure(mapping !== undefined, `mapping ${index} is absent`);
    ensure(
      mapping.fieldPath === sentinel["path"] &&
        mapping.originalSentinel === sentinel["sentinel"] &&
        mapping.effectiveExpansionCount === sentinel["effectiveExpansionCount"],
      `mapping ${index} differs from the bound sentinel inventory`,
    );
  });
  const pendingGroups = numeric["pilotPendingFields"];
  ensure(Array.isArray(pendingGroups) && pendingGroups.includes("statisticalMargins"), "statistical-margin pending group is absent");
  const derivationContract = objectOf(contract["derivationContract"] as JsonValue, "derivation contract");
  const assignments = derivationContract["assignments"];
  ensure(Array.isArray(assignments) && assignments.length === 26, "bound derivation assignments differ");
  const assignmentMap = new Map<string, JsonValue>();
  for (const value of assignments) {
    const assignment = objectOf(value, "derivation assignment");
    ensure(typeof assignment["pathOrGroup"] === "string", "derivation assignment path differs");
    assignmentMap.set(assignment["pathOrGroup"], assignment["derivationClass"]!);
  }
  for (const mapping of record.fieldEvidenceMap) {
    const lookup = mapping.fieldPath === "h4TransferExperiment.secondProviderAndModelIdentity"
      ? "h4TransferExperiment.secondProviderAndModelIdentity/h4SecondModelIdentity"
      : mapping.fieldPath;
    ensure(assignmentMap.get(lookup) === mapping.directDerivationClass, `derivation class differs for ${mapping.fieldPath}`);
  }
  ensure(
    sameJson(record.assemblyCompletenessRule.numericGraph, derivationContract["numericGraph"]),
    "assembly numeric graph differs from the bound calibration contract",
  );
  const definitions = derivation["programDefinitions"];
  ensure(Array.isArray(definitions) && definitions.length === 6, "bound derivation program inventory differs");
  const programBindings = definitions.map((value) => {
    const definition = objectOf(value, "program definition");
    ensure(typeof definition["target"] === "string" && typeof definition["programId"] === "string" && typeof definition["sourceSha256"] === "string", "program definition fields differ");
    return { target: definition["target"], programId: definition["programId"], sourceSha256: definition["sourceSha256"] };
  });
  const obligations = objectOf(parseStrictJson(bytes.get("outstanding_obligations")!.toString("utf8")), "outstanding obligations");
  const obligationRows = obligations["obligations"];
  ensure(Array.isArray(obligationRows), "outstanding obligations are absent");
  return { programBindings, unresolvedObligationCount: obligationRows.filter((value) => objectOf(value, "obligation")["status"] === "unresolved").length };
}

function verifySemanticContract(record: CalibrationPlanAssemblyReadiness): void {
  ensure(sha256(record.fieldEvidenceMap as unknown as JsonValue) === EXPECTED_SEMANTIC_HASHES.fieldEvidenceMap, "field-evidence map differs");
  ensure(record.fieldEvidenceMap.length === 26, "mapping cardinality differs");
  ensure(record.fieldEvidenceMap.every((mapping, index) => mapping.fieldPath === EXPECTED_MAPPING_PATHS[index]), "mapping path order differs");
  ensure(new Set(record.fieldEvidenceMap.map((mapping) => mapping.fieldPath)).size === 26, "mapping paths are duplicated");
  ensure(record.fieldEvidenceMap.slice(0, 25).every((mapping) => mapping.mappingKind === "pending_sentinel" && mapping.originalSentinel !== null), "pending sentinel mappings differ");
  ensure(record.fieldEvidenceMap[25]?.mappingKind === "statistical_margin_group" && record.fieldEvidenceMap[25]?.originalSentinel === null, "statistical margin mapping differs");
  ensure(record.fieldEvidenceMap.every((mapping) => mapping.valueSupplied === false && mapping.futureEvidenceReferenceSupplied === false && !("value" in mapping)), "mapping contains a value or evidence reference");
  ensure(record.fieldEvidenceMap.reduce((sum, mapping) => sum + mapping.effectiveExpansionCount, 0) === 136, "effective expansion count differs");
  ensure(sameJson(record.mappingSummary, { pendingSentinelPathCount: 25, statisticalMarginGroupCount: 1, mappingCount: 26, effectiveExpandedOutputCount: 136, valuesSupplied: 0, futureEvidenceReferencesSupplied: 0 }), "mapping summary differs");
  ensure(sha256(record.freezeAdmissionFirewall as unknown as JsonValue) === EXPECTED_SEMANTIC_HASHES.freezeAdmissionFirewall, "freeze-admission firewall differs");
  ensure(sha256(record.futureCandidateGridSchemas as unknown as JsonValue) === EXPECTED_SEMANTIC_HASHES.futureCandidateGridSchemas, "future grid schemas differ");
  ensure(record.futureCandidateGridSchemas.every((schema) => !schema.actualCandidateValuesPresent && !schema.actualGridInstancePresent && !("candidates" in schema)), "future grid schema contains candidate values");
  ensure(record.actualCandidateGridInstances.length === 0, "actual candidate grid instance exists");
  ensure(sha256(record.arithmeticPortabilityContract as unknown as JsonValue) === EXPECTED_SEMANTIC_HASHES.arithmeticPortabilityContract, "arithmetic portability contract differs");
  ensure(sha256(record.assemblyCompletenessRule as unknown as JsonValue) === EXPECTED_SEMANTIC_HASHES.assemblyCompletenessRule, "assembly completeness rule differs");
  ensure(record.assemblyCompletenessRule.thisReadinessMayProposeO === false && record.assemblyCompletenessRule.thisReadinessMayCreateOrActivateO === false, "readiness can create O");
  ensure(sha256(record.researchExecutionBudget as unknown as JsonValue) === EXPECTED_SEMANTIC_HASHES.zeroBudget && Object.values(record.researchExecutionBudget).every((value) => value === 0), "zero budget differs");
  ensure(sha256(record.authorityState as unknown as JsonValue) === EXPECTED_SEMANTIC_HASHES.authorityState && Object.values(record.authorityState).every((value) => value === false), "authority state differs");
  ensure(sha256(record.eligibilityState as unknown as JsonValue) === EXPECTED_SEMANTIC_HASHES.eligibilityState, "eligibility state differs");
  ensure(Object.entries(record.eligibilityState).every(([key, value]) => key === "publicDevelopment" ? value === true : value === false), "eligibility state grants evidence status");
  ensure(Object.values(record.futureIdentityState).every((value) => value === null), "future identity allocated");
  ensure(record.zeroExecution === true && record.calibrationPlanCreated === false, "readiness claims execution or plan creation");
  ensure(record.claimBoundary.mappingAndFirewallImplemented === true && record.claimBoundary.arithmeticPortabilityConformanceOnly === true, "bounded implementation claim absent");
  ensure(Object.entries(record.claimBoundary).every(([key, value]) => ["mappingAndFirewallImplemented", "arithmeticPortabilityConformanceOnly"].includes(key) ? value === true : value === false), "claim boundary escalated");
}

export async function verifyCalibrationPlanAssemblyReadinessAgainstArtifacts(input: {
  readonly record: CalibrationPlanAssemblyReadiness;
  readonly schemas: SchemaRegistry;
  readonly reader: CalibrationPlanAssemblyArtifactReader;
  readonly portabilityReference: CalibrationPortabilityReferenceExecutor;
}): Promise<CalibrationPlanAssemblyVerificationResult> {
  verifyCalibrationPlanAssemblyReadinessSignature({ record: input.record, schemas: input.schemas });
  verifyRoleDisjointness(input.record);
  const bytes = await verifyArtifacts({ record: input.record, reader: input.reader });
  const prior = verifyPriorBindings(input.record, bytes);
  ensure(sameJson(input.record.programBindings, prior.programBindings), "program bindings differ from bound readiness record");
  ensure(input.record.programBindings.every((binding) => binding.sourceSha256 === input.record.programBindings[0]?.sourceSha256), "program source hashes differ");
  ensure(input.record.artifacts.find((artifact) => artifact.artifactId === "derivation_programs_source")?.sha256 === input.record.programBindings[0]?.sourceSha256, "program binding source artifact differs");
  verifySemanticContract(input.record);
  const reference = await input.portabilityReference.evaluate(bytes.get("portability_reference")!);
  ensure(canonicalize(reference) === canonicalize(input.record.portabilityGoldenVectors as unknown as JsonValue), "cross-implementation golden vectors differ");
  ensure(input.record.portabilityGoldenVectors.length === 8, "golden vector count differs");
  ensure(input.record.portabilityGoldenVectors.every((vector) => vector.publicDevelopment && !vector.authorizedForResearchEvidence && !vector.admissibleAsNumericFreezeValue), "golden vector eligibility escalated");
  ensure(prior.unresolvedObligationCount === 7, "unresolved trust obligations changed");
  return {
    artifactCount: 24,
    programBindingCount: 6,
    pendingSentinelMappingCount: 25,
    statisticalMarginMappingCount: 1,
    effectiveExpandedOutputCount: 136,
    goldenVectorCount: 8,
    unresolvedObligationCount: prior.unresolvedObligationCount,
    providerModelRequestAttempts: 0,
    calibrationExecutions: 0,
    protectedDataAccesses: 0,
    calibrationPlanManifests: 0,
    oProposals: 0,
    authoritiesGranted: 0,
    finalProtocolId: null,
    budgetFreezeId: null,
  };
}

export async function verifyCalibrationPlanAssemblyAuditReceiptIndependent(input: {
  readonly receipt: CalibrationPlanAssemblyAuditReceipt;
  readonly readiness: CalibrationPlanAssemblyReadiness;
  readonly readinessBytes: Uint8Array;
  readonly schemas: SchemaRegistry;
  readonly reader: CalibrationPlanAssemblyArtifactReader;
  readonly portabilityReference: CalibrationPortabilityReferenceExecutor;
}): Promise<CalibrationPlanAssemblyVerificationResult> {
  verifyCalibrationPlanAssemblyAuditSignatures({ receipt: input.receipt, readiness: input.readiness, readinessBytes: input.readinessBytes, schemas: input.schemas });
  const result = await verifyCalibrationPlanAssemblyReadinessAgainstArtifacts({ record: input.readiness, schemas: input.schemas, reader: input.reader, portabilityReference: input.portabilityReference });
  const flags = input.receipt.independentVerification.verification;
  ensure(Object.entries(flags).every(([key, value]) => key === "authoritiesGranted" ? value === 0 : value === true), "independent verification flags differ");
  ensure(input.receipt.referenceOnly === true && input.receipt.grantsAuthority === false, "receipt grants authority");
  return result;
}

export function calibrationPlanAssemblySemanticHashPlaceholders(): typeof EXPECTED_SEMANTIC_HASHES {
  return EXPECTED_SEMANTIC_HASHES;
}
