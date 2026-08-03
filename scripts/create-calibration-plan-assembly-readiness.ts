import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import {
  CALIBRATION_ARITHMETIC_PORTABILITY_CONTRACT,
  CALIBRATION_ASSEMBLY_COMPLETENESS_RULE,
  CALIBRATION_FREEZE_ADMISSION_FIREWALL,
  CALIBRATION_FUTURE_CANDIDATE_GRID_SCHEMAS,
  CALIBRATION_PLAN_ASSEMBLY_ARTIFACT_SPECS,
  CALIBRATION_PLAN_ASSEMBLY_READINESS_AUDIT_PATH,
  CALIBRATION_PLAN_ASSEMBLY_AUTHORITY_STATE,
  CALIBRATION_PLAN_ASSEMBLY_ELIGIBILITY_STATE,
  CALIBRATION_PLAN_ASSEMBLY_READINESS_PATH,
  CALIBRATION_PLAN_ASSEMBLY_ZERO_BUDGET,
  GitCalibrationPlanAssemblyArtifactReader,
  PrincipalSigner,
  PythonCalibrationPortabilityReferenceExecutor,
  SchemaRegistry,
  buildCalibrationFieldEvidenceMap,
  buildCalibrationPortabilityGoldenVectors,
  canonicalize,
  createCalibrationPlanAssemblyAuditReceipt,
  createCalibrationPlanAssemblyIndependentVerification,
  createCalibrationPlanAssemblyReadiness,
  parseStrictJson,
  sha256Bytes,
  sha256Text,
  verifyCalibrationPlanAssemblyAuditReceiptIndependent,
  verifyCalibrationPlanAssemblyReadinessAgainstArtifacts,
  type CalibrationPlanAssemblyArtifactReference,
  type JsonValue,
} from "../src/index.js";

const execFileAsync = promisify(execFile);

async function gitText(args: readonly string[]): Promise<string> {
  const result = await execFileAsync("git", [...args], {
    cwd: process.cwd(),
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
  return result.stdout;
}

async function gitBytes(args: readonly string[]): Promise<Buffer> {
  const result = await execFileAsync("git", [...args], {
    cwd: process.cwd(),
    encoding: "buffer",
    maxBuffer: 32 * 1024 * 1024,
  });
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
  spec: (typeof CALIBRATION_PLAN_ASSEMBLY_ARTIFACT_SPECS)[number],
): Promise<CalibrationPlanAssemblyArtifactReference> {
  const [artifactId, artifactPath, mediaType] = spec;
  const bytes = await gitBytes(["show", `${sourceCommit}:${artifactPath}`]);
  return {
    artifactId,
    path: artifactPath,
    sourceCommit,
    sha256: `sha256:${sha256Bytes(bytes)}`,
    sizeBytes: bytes.byteLength,
    mediaType,
  };
}

const status = await gitText(["status", "--porcelain=v1"]);
if (status.length !== 0) {
  throw new Error("Assembly-readiness generation requires a clean implementation-source commit");
}

const sourceCommit = await exactCommit("HEAD");
const sourceTree = await exactTree(sourceCommit);
const schemas = await SchemaRegistry.load(path.resolve("schemas"));
const artifacts = await Promise.all(
  CALIBRATION_PLAN_ASSEMBLY_ARTIFACT_SPECS.map((spec) => artifact(sourceCommit, spec)),
);
const derivationBytes = await gitBytes([
  "show",
  `${sourceCommit}:governance/gate3/calibration-derivation-program-readiness.json`,
]);
const derivation = parseStrictJson(derivationBytes.toString("utf8")) as Record<string, JsonValue>;
if (!Array.isArray(derivation["programDefinitions"]) || derivation["programDefinitions"].length !== 6) {
  throw new Error("Bound derivation readiness has no six-program inventory");
}
const programBindings = derivation["programDefinitions"].map((value) => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Bound program definition is not an object");
  }
  const definition = value as Record<string, JsonValue>;
  if (
    typeof definition["target"] !== "string" ||
    typeof definition["programId"] !== "string" ||
    typeof definition["sourceSha256"] !== "string"
  ) throw new Error("Bound program definition fields are invalid");
  return {
    target: definition["target"] as "F" | "G" | "J" | "K" | "L" | "M",
    programId: definition["programId"],
    sourceSha256: definition["sourceSha256"],
  };
});

const protocolAuthor = PrincipalSigner.generate({
  principalId: "protocol.author.calibration-plan-assembly-readiness.public-development.2026-08-03",
  role: "protocol_author",
  implementationDigest: sha256Text(`git:${sourceCommit}:scripts/create-calibration-plan-assembly-readiness.ts`),
  instanceId: "protocol.author.calibration-plan-assembly-readiness.public-development.2026-08-03.instance",
  keyId: "protocol.author.calibration-plan-assembly-readiness.public-development.2026-08-03.ed25519",
});
const independentVerifier = PrincipalSigner.generate({
  principalId: "independent.verifier.calibration-plan-assembly-readiness.public-development.2026-08-03",
  role: "independent_verifier",
  implementationDigest: sha256Text(`git:${sourceCommit}:src/governance/calibration-plan-assembly-readiness-verifier.ts`),
  instanceId: "independent.verifier.calibration-plan-assembly-readiness.public-development.2026-08-03.instance",
  keyId: "independent.verifier.calibration-plan-assembly-readiness.public-development.2026-08-03.ed25519",
});
const auditStore = PrincipalSigner.generate({
  principalId: "audit.store.calibration-plan-assembly-readiness.public-development.2026-08-03",
  role: "audit_store",
  implementationDigest: sha256Text(`git:${sourceCommit}:src/governance/calibration-plan-assembly-readiness-verifier.ts`),
  instanceId: "audit.store.calibration-plan-assembly-readiness.public-development.2026-08-03.instance",
  keyId: "audit.store.calibration-plan-assembly-readiness.public-development.2026-08-03.ed25519",
});

const readiness = createCalibrationPlanAssemblyReadiness({
  schemas,
  signer: protocolAuthor,
  value: {
    status: "offline_mapping_and_firewall_ready_only",
    zeroExecution: true,
    calibrationPlanCreated: false,
    sourceSnapshot: { sourceCommit, sourceTree, additionalPushPerformed: false },
    priorBindings: {
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
    },
    artifacts,
    programBindings,
    fieldEvidenceMap: buildCalibrationFieldEvidenceMap(),
    mappingSummary: {
      pendingSentinelPathCount: 25,
      statisticalMarginGroupCount: 1,
      mappingCount: 26,
      effectiveExpandedOutputCount: 136,
      valuesSupplied: 0,
      futureEvidenceReferencesSupplied: 0,
    },
    freezeAdmissionFirewall: CALIBRATION_FREEZE_ADMISSION_FIREWALL,
    futureCandidateGridSchemas: CALIBRATION_FUTURE_CANDIDATE_GRID_SCHEMAS,
    actualCandidateGridInstances: [],
    arithmeticPortabilityContract: CALIBRATION_ARITHMETIC_PORTABILITY_CONTRACT,
    portabilityGoldenVectors: buildCalibrationPortabilityGoldenVectors(),
    assemblyCompletenessRule: CALIBRATION_ASSEMBLY_COMPLETENESS_RULE,
    roleBoundary: {
      protocolAuthor: {
        role: "protocol_author",
        publicPrincipal: protocolAuthor.exportPublic(),
        processIdentity: "process.calibration-plan-assembly-readiness.protocol-author.v1",
        currentCapabilityHandles: [],
        delegatedCapabilityIds: [],
        roleAliases: [],
      },
      independentVerifier: {
        role: "independent_verifier",
        publicPrincipal: independentVerifier.exportPublic(),
        processIdentity: "process.calibration-plan-assembly-readiness.independent-verifier.v1",
        currentCapabilityHandles: [],
        delegatedCapabilityIds: [],
        roleAliases: [],
      },
      auditStore: {
        role: "audit_store",
        publicPrincipal: auditStore.exportPublic(),
        processIdentity: "process.calibration-plan-assembly-readiness.audit-store.v1",
        currentCapabilityHandles: [],
        delegatedCapabilityIds: [],
        roleAliases: [],
      },
      requiredInequalities: ["principalId", "instanceId", "keyId", "publicKeyDigest", "processIdentity"],
      aliasingDelegationCosigningProxyingForbidden: true,
    },
    researchExecutionBudget: CALIBRATION_PLAN_ASSEMBLY_ZERO_BUDGET,
    authorityState: CALIBRATION_PLAN_ASSEMBLY_AUTHORITY_STATE,
    eligibilityState: CALIBRATION_PLAN_ASSEMBLY_ELIGIBILITY_STATE,
    futureIdentityState: {
      finalProtocolId: null,
      budgetFreezeId: null,
      calibrationPlanManifestId: null,
      calibrationEnvelopeId: null,
      selectedProtocolValueSetId: null,
    },
    forbiddenRecordTypes: ["CalibrationPlanManifest", "calibration_envelope", "ProtocolManifest", "BudgetFreezeManifest", "O_proposal", "O_activation"],
    claimBoundary: {
      mappingAndFirewallImplemented: true,
      arithmeticPortabilityConformanceOnly: true,
      calibrationPerformed: false,
      calibrationPlanAdmissible: false,
      numericValuesFrozen: false,
      estimatorAdequacyEstablished: false,
      performanceEvidence: false,
      fairnessEvidence: false,
      attributionEvidence: false,
      securityCertification: false,
      evolutionClaim: false,
      selfImprovementClaim: false,
    },
    recordedAt: new Date().toISOString(),
  },
});

const reader = new GitCalibrationPlanAssemblyArtifactReader(process.cwd());
const portabilityReference = new PythonCalibrationPortabilityReferenceExecutor();
const result = await verifyCalibrationPlanAssemblyReadinessAgainstArtifacts({
  record: readiness,
  schemas,
  reader,
  portabilityReference,
});
const readinessBytes = Buffer.from(`${canonicalize(readiness as unknown as JsonValue)}\n`, "utf8");
const independentVerification = createCalibrationPlanAssemblyIndependentVerification({
  readiness,
  readinessBytes,
  signer: independentVerifier,
  verifiedAt: new Date().toISOString(),
  verification: {
    schemaValid: true,
    signaturesValid: true,
    sourceBindingsValid: true,
    priorBindingsValid: true,
    programBindingsExact: true,
    fieldEvidenceMapCompleteAndValueFree: true,
    freezeAdmissionFirewallExact: true,
    futureGridSchemasValueFree: true,
    portabilityContractExact: true,
    crossImplementationGoldenVectorsMatch: true,
    rolesDisjoint: true,
    zeroExecutionBudget: true,
    finalIdentitiesAbsent: true,
    oCreationAbsent: true,
    authoritiesGranted: 0,
  },
});
const receipt = createCalibrationPlanAssemblyAuditReceipt({
  schemas,
  signer: auditStore,
  readiness,
  readinessBytes,
  value: {
    readinessReference: {
      assemblyReadinessId: readiness.assemblyReadinessId,
      assemblyReadinessHash: readiness.assemblyReadinessHash,
      path: CALIBRATION_PLAN_ASSEMBLY_READINESS_PATH,
      sourceCommit,
      sourceTree,
      sha256: `sha256:${sha256Bytes(readinessBytes)}`,
      sizeBytes: readinessBytes.byteLength,
    },
    independentVerification,
    referenceOnly: true,
    grantsAuthority: false,
  },
});
await verifyCalibrationPlanAssemblyAuditReceiptIndependent({
  receipt,
  readiness,
  readinessBytes,
  schemas,
  reader,
  portabilityReference,
});

const receiptBytes = Buffer.from(`${canonicalize(receipt as unknown as JsonValue)}\n`, "utf8");
await mkdir(path.dirname(path.resolve(CALIBRATION_PLAN_ASSEMBLY_READINESS_PATH)), { recursive: true });
await writeFile(path.resolve(CALIBRATION_PLAN_ASSEMBLY_READINESS_PATH), readinessBytes, { flag: "wx" });
await writeFile(path.resolve(CALIBRATION_PLAN_ASSEMBLY_READINESS_AUDIT_PATH), receiptBytes, { flag: "wx" });

process.stdout.write(`${JSON.stringify({
  created: true,
  assemblyReadinessId: readiness.assemblyReadinessId,
  assemblyReadinessHash: readiness.assemblyReadinessHash,
  readinessArtifactSha256: `sha256:${sha256Bytes(readinessBytes)}`,
  auditReceiptId: receipt.receiptId,
  auditReceiptHash: receipt.receiptHash,
  sourceCommit,
  sourceTree,
  artifactCount: result.artifactCount,
  mappingCount: readiness.fieldEvidenceMap.length,
  goldenVectorCount: readiness.portabilityGoldenVectors.length,
  unresolvedObligationCount: result.unresolvedObligationCount,
  authoritiesGranted: 0,
  calibrationExecutions: 0,
  calibrationPlanManifests: 0,
  oProposals: 0,
  finalProtocolId: null,
  budgetFreezeId: null,
})}\n`);
