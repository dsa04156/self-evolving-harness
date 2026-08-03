import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import {
  CALIBRATION_EVIDENCE_AUTHORITY_STATE,
  CALIBRATION_EVIDENCE_CONTRACT_INVENTORY,
  CALIBRATION_EVIDENCE_DISCLOSURE_MATRIX,
  CALIBRATION_EVIDENCE_ELIGIBILITY_STATE,
  CALIBRATION_EVIDENCE_FUTURE_IDENTITY_STATE,
  CALIBRATION_EVIDENCE_GRAPH_CONTRACT,
  CALIBRATION_EVIDENCE_OWNERSHIP_MATRIX,
  CALIBRATION_EVIDENCE_READINESS_ARTIFACT_SPECS,
  CALIBRATION_EVIDENCE_READINESS_AUDIT_PATH,
  CALIBRATION_EVIDENCE_READINESS_PATH,
  CALIBRATION_EVIDENCE_ZERO_BUDGET,
  GitCalibrationEvidenceReadinessArtifactReader,
  PrincipalSigner,
  SchemaRegistry,
  buildSyntheticCalibrationCapabilityDescriptor,
  buildSyntheticCalibrationEvidenceChain,
  calibrationEvidenceContractHashes,
  canonicalize,
  createCalibrationEvidenceContractReadiness,
  createCalibrationEvidenceIndependentVerification,
  createCalibrationEvidenceReadinessAuditReceipt,
  sha256Bytes,
  sha256Text,
  verifyCalibrationEvidenceContractReadinessAgainstArtifacts,
  verifyCalibrationEvidenceReadinessAuditReceiptIndependent,
  verifySyntheticCalibrationEvidenceChain,
  type CalibrationEvidenceArtifactReference,
  type CalibrationEvidenceRoleBoundary,
  type JsonValue,
  type PrincipalSigner as PrincipalSignerType,
} from "../src/index.js";

const execFileAsync = promisify(execFile);

async function gitText(args: readonly string[]): Promise<string> {
  const result = await execFileAsync("git", [...args], { cwd: process.cwd(), encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
  return result.stdout;
}

async function gitBytes(args: readonly string[]): Promise<Buffer> {
  const result = await execFileAsync("git", [...args], { cwd: process.cwd(), encoding: "buffer", maxBuffer: 32 * 1024 * 1024 });
  return result.stdout;
}

async function exactCommit(ref: string): Promise<string> {
  const result = (await gitText(["rev-parse", "--verify", `${ref}^{commit}`])).trim();
  if (!/^[a-f0-9]{40}$/u.test(result)) throw new Error(`Git ref ${ref} did not resolve exactly`);
  return result;
}

async function exactTree(commit: string): Promise<string> {
  const result = (await gitText(["rev-parse", "--verify", `${commit}^{tree}`])).trim();
  if (!/^[a-f0-9]{40}$/u.test(result)) throw new Error(`Git commit ${commit} has no exact tree`);
  return result;
}

async function artifact(
  sourceCommit: string,
  spec: (typeof CALIBRATION_EVIDENCE_READINESS_ARTIFACT_SPECS)[number],
): Promise<CalibrationEvidenceArtifactReference> {
  const [artifactId, artifactPath, mediaType] = spec;
  const bytes = await gitBytes(["show", `${sourceCommit}:${artifactPath}`]);
  return { artifactId, path: artifactPath, sourceCommit, sha256: `sha256:${sha256Bytes(bytes)}`, sizeBytes: bytes.byteLength, mediaType };
}

function signer(input: {
  readonly role: "calibration_executor" | "calibration_evaluator" | "calibration_scorer" | "independent_verifier" | "protocol_author" | "audit_store";
  readonly sourceCommit: string;
  readonly implementationPath: string;
}): PrincipalSignerType {
  return PrincipalSigner.generate({
    principalId: `${input.role}.calibration-evidence-readiness.public-development.2026-08-03`,
    role: input.role,
    implementationDigest: sha256Text(`git:${input.sourceCommit}:${input.implementationPath}`),
    instanceId: `${input.role}.calibration-evidence-readiness.public-development.2026-08-03.instance`,
    keyId: `${input.role}.calibration-evidence-readiness.public-development.2026-08-03.ed25519`,
  });
}

function roleBoundary(input: {
  readonly calibrationExecutor: PrincipalSignerType;
  readonly calibrationEvaluator: PrincipalSignerType;
  readonly calibrationScorer: PrincipalSignerType;
  readonly independentVerifier: PrincipalSignerType;
  readonly protocolAuthor: PrincipalSignerType;
  readonly auditStore: PrincipalSignerType;
}): CalibrationEvidenceRoleBoundary {
  const role = (roleName: CalibrationEvidenceRoleBoundary["calibrationExecutor"]["role"], current: PrincipalSignerType, processName: string) => ({
    role: roleName,
    publicPrincipal: current.exportPublic(),
    processIdentity: `process.calibration-evidence.${processName}.v1`,
    currentCapabilityHandles: [] as const,
    delegatedCapabilityIds: [] as const,
    proxyPrincipalIds: [] as const,
    wrapperPrincipalIds: [] as const,
    roleAliases: [] as const,
    cosignerKeyIds: [] as const,
  });
  return {
    calibrationExecutor: role("calibration_executor", input.calibrationExecutor, "calibration-executor"),
    calibrationEvaluator: role("calibration_evaluator", input.calibrationEvaluator, "calibration-evaluator"),
    calibrationScorer: role("calibration_scorer", input.calibrationScorer, "calibration-scorer"),
    independentVerifier: role("independent_verifier", input.independentVerifier, "independent-verifier"),
    protocolAuthor: role("protocol_author", input.protocolAuthor, "protocol-author"),
    auditStore: role("audit_store", input.auditStore, "audit-store"),
    requiredInequalities: ["principalId", "instanceId", "keyId", "publicKeyDigest", "processIdentity"],
    exclusiveOwnershipAndNoDelegationProxyWrapperAliasCosign: true,
  };
}

const status = await gitText(["status", "--porcelain=v1"]);
if (status.length !== 0) throw new Error("Evidence-readiness generation requires a clean implementation-source commit");
const sourceCommit = await exactCommit("HEAD");
const sourceTree = await exactTree(sourceCommit);
const schemas = await SchemaRegistry.load(path.resolve("schemas"));
const artifacts = await Promise.all(CALIBRATION_EVIDENCE_READINESS_ARTIFACT_SPECS.map((spec) => artifact(sourceCommit, spec)));

const principals = {
  calibrationExecutor: signer({ role: "calibration_executor", sourceCommit, implementationPath: "src/governance/calibration-evidence-contracts.ts" }),
  calibrationEvaluator: signer({ role: "calibration_evaluator", sourceCommit, implementationPath: "src/governance/calibration-evidence-contracts.ts" }),
  calibrationScorer: signer({ role: "calibration_scorer", sourceCommit, implementationPath: "src/governance/calibration-evidence-contracts.ts" }),
  independentVerifier: signer({ role: "independent_verifier", sourceCommit, implementationPath: "src/governance/calibration-evidence-readiness-verifier.ts" }),
  protocolAuthor: signer({ role: "protocol_author", sourceCommit, implementationPath: "scripts/create-calibration-evidence-readiness.ts" }),
  auditStore: signer({ role: "audit_store", sourceCommit, implementationPath: "src/governance/calibration-evidence-readiness-verifier.ts" }),
};
const roles = roleBoundary(principals);
const capability = buildSyntheticCalibrationCapabilityDescriptor();
const syntheticRecords = buildSyntheticCalibrationEvidenceChain({ signers: principals, schemas, timestampPrefix: "2026-08-03T15:00:" });
const syntheticResult = verifySyntheticCalibrationEvidenceChain({ records: syntheticRecords, capability, roleBoundary: roles, schemas });

const readiness = createCalibrationEvidenceContractReadiness({
  schemas,
  signer: principals.protocolAuthor,
  value: {
    status: "offline_body_free_contracts_ready_only",
    sourceSnapshot: { sourceCommit, sourceTree, additionalPushPerformed: false },
    priorBindings: {
      assemblyReadinessId: "cpar-sha256:0ae47c5688fd04d6069ba406cd74b1b050bd94713e36d240fab08f4142470b42",
      assemblyReadinessHash: "sha256:09351930673187bda15eba19d9ff829f62f09dddea68c10d606d1ced157b6a0c",
      assemblyReadinessRawSha256: "sha256:813cf2513bfa0f7faf5fdbec99c3c466fad8c0e1563d5437bc3153428907a2b0",
      assemblyAuditReceiptId: "cparar-sha256:a515ba050d4f158fb4d95148e2049b7aa66ab4c4783996664706f6f3897cdcc2",
      assemblyAuditReceiptHash: "sha256:04968d8313a85d841ef8195f9154a88a205bc37a68e7d1b76dafd378756e1c1e",
      assemblyAuditReceiptRawSha256: "sha256:d066dbf27815443c2a62ebfbaac0b06b157482db4e5e98d24085bf637b2f36a4",
      assemblyEvidenceRulingRawSha256: "sha256:094b31e93575c388a48b7a7f2482a0f7320c2dad0b8323e1eda1a09f93a6931c",
      assemblyEvidenceDecision: "APPROVE",
    },
    artifacts,
    contractInventory: CALIBRATION_EVIDENCE_CONTRACT_INVENTORY,
    ownershipMatrix: CALIBRATION_EVIDENCE_OWNERSHIP_MATRIX,
    disclosureMatrix: CALIBRATION_EVIDENCE_DISCLOSURE_MATRIX,
    graphContract: CALIBRATION_EVIDENCE_GRAPH_CONTRACT,
    syntheticCapabilityDescriptor: capability,
    syntheticFixtureContract: { expectedRecordCount: 14, expectedStageCounts: { E0: 3, E1: 4, E2: 5, E3: 1, E4: 1 }, expectedStratumCount: 2, fixturesPersistedAsCalibrationEvidence: false, actualEvidenceRecordsPersisted: 0, validlyResignedAttackFamiliesMinimum: 18 },
    contractHashes: calibrationEvidenceContractHashes(),
    roleBoundary: roles,
    actualEvidenceRecords: [],
    actualCapabilities: [],
    researchExecutionBudget: CALIBRATION_EVIDENCE_ZERO_BUDGET,
    authorityState: CALIBRATION_EVIDENCE_AUTHORITY_STATE,
    eligibilityState: CALIBRATION_EVIDENCE_ELIGIBILITY_STATE,
    futureIdentityState: CALIBRATION_EVIDENCE_FUTURE_IDENTITY_STATE,
    forbiddenMaterialAndActions: ["actual_calibration_plan", "actual_calibration_envelope", "capability_issuance_or_consumption", "nonzero_budget", "provider_model_environment_or_price_selection", "credential_or_API_call", "benchmark_vault_task_or_raw_measurement", "sentinel_margin_final_identity_or_O", "attribution_mutation_candidate_promotion_or_deployment"],
    claimBoundary: { closedSchemasImplemented: true, semanticGraphVerifierImplemented: true, publicDevelopmentConformanceOnly: true, calibrationPerformed: false, evidenceAdmitted: false, capabilityIssuedOrConsumed: false, numericValuesFrozen: false, estimatorAdequacyEstablished: false, performanceEvidence: false, fairnessEvidence: false, attributionEvidence: false, securityCertification: false, evolutionClaim: false, selfImprovementClaim: false },
    recordedAt: new Date().toISOString(),
  },
});

const reader = new GitCalibrationEvidenceReadinessArtifactReader(process.cwd());
const verificationResult = await verifyCalibrationEvidenceContractReadinessAgainstArtifacts({ record: readiness, schemas, reader });
const readinessBytes = Buffer.from(`${canonicalize(readiness as unknown as JsonValue)}\n`, "utf8");
const independentVerification = createCalibrationEvidenceIndependentVerification({
  readiness,
  readinessBytes,
  signer: principals.independentVerifier,
  verifiedAt: new Date().toISOString(),
  verification: { schemaValid: true, signaturesValid: true, sourceBindingsValid: true, assemblyBindingValid: true, contractsClosedAndBodyFree: true, ownershipAndDisclosureMatricesExact: true, oneWayGraphExact: true, syntheticChainVerified: true, roleBoundaryDisjoint: true, capabilityUnissuedAndUnconsumed: true, zeroExecutionBudget: true, actualEvidenceRecordsAbsent: true, finalIdentitiesAbsent: true, oCreationAndActivationAbsent: true, authoritiesGranted: 0 },
});
const receipt = createCalibrationEvidenceReadinessAuditReceipt({
  schemas,
  signer: principals.auditStore,
  readiness,
  readinessBytes,
  value: {
    readinessReference: { readinessId: readiness.readinessId, readinessHash: readiness.readinessHash, path: CALIBRATION_EVIDENCE_READINESS_PATH, sourceCommit, sourceTree, sha256: `sha256:${sha256Bytes(readinessBytes)}`, sizeBytes: readinessBytes.byteLength },
    independentVerification,
    referenceOnly: true,
    grantsAuthority: false,
  },
});
verifyCalibrationEvidenceReadinessAuditReceiptIndependent({ receipt, readiness, readinessBytes, schemas });
const receiptBytes = Buffer.from(`${canonicalize(receipt as unknown as JsonValue)}\n`, "utf8");
await mkdir(path.dirname(path.resolve(CALIBRATION_EVIDENCE_READINESS_PATH)), { recursive: true });
await writeFile(path.resolve(CALIBRATION_EVIDENCE_READINESS_PATH), readinessBytes, { flag: "wx" });
await writeFile(path.resolve(CALIBRATION_EVIDENCE_READINESS_AUDIT_PATH), receiptBytes, { flag: "wx" });

process.stdout.write(`${JSON.stringify({
  created: true,
  readinessId: readiness.readinessId,
  readinessHash: readiness.readinessHash,
  readinessArtifactSha256: `sha256:${sha256Bytes(readinessBytes)}`,
  auditReceiptId: receipt.receiptId,
  auditReceiptHash: receipt.receiptHash,
  auditReceiptArtifactSha256: `sha256:${sha256Bytes(receiptBytes)}`,
  sourceCommit,
  sourceTree,
  artifactCount: verificationResult.artifactCount,
  contractRecordTypeCount: verificationResult.contractRecordTypeCount,
  syntheticFixtureRecordCount: syntheticResult.recordCount,
  unresolvedObligationCount: verificationResult.unresolvedObligationCount,
  actualEvidenceRecords: 0,
  issuedCapabilities: 0,
  consumedCapabilities: 0,
  providerModelRequestAttempts: 0,
  protectedDataAccesses: 0,
  finalIdentitiesAllocated: 0,
  oProposals: 0,
  oActivations: 0,
  authoritiesGranted: 0,
})}\n`);
