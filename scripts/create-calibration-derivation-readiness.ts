import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import {
  CALIBRATION_DERIVATION_AUTHORITY_STATE,
  CALIBRATION_DERIVATION_DEPENDENCY_CONTRACT,
  CALIBRATION_DERIVATION_ELIGIBILITY_STATE,
  CALIBRATION_DERIVATION_ESTIMATOR_CONTRACT,
  CALIBRATION_DERIVATION_FORBIDDEN_RECORD_TYPES,
  CALIBRATION_DERIVATION_GRID_CONTRACT,
  CALIBRATION_DERIVATION_READINESS_ARTIFACT_SPECS,
  CALIBRATION_DERIVATION_READINESS_AUDIT_PATH,
  CALIBRATION_DERIVATION_READINESS_PATH,
  CALIBRATION_DERIVATION_SYNTHETIC_INPUT_POLICY,
  CALIBRATION_DERIVATION_ZERO_RESEARCH_BUDGET,
  GitCalibrationDerivationReadinessArtifactReader,
  PrincipalSigner,
  SchemaRegistry,
  buildCalibrationDerivationSyntheticVectors,
  calibrationDerivationFailureContract,
  calibrationDerivationProgramDefinitions,
  canonicalize,
  createCalibrationDerivationIndependentVerification,
  createCalibrationDerivationProgramReadiness,
  createCalibrationDerivationReadinessAuditReceipt,
  sha256Bytes,
  sha256Text,
  verifyCalibrationDerivationProgramReadinessAgainstArtifacts,
  verifyCalibrationDerivationReadinessAuditReceiptIndependent,
  type CalibrationDerivationReadinessArtifactReference,
  type CalibrationDerivationReadinessMediaType,
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
  if (!/^[a-f0-9]{40}$/u.test(result)) {
    throw new Error(`Git ref ${ref} did not resolve exactly`);
  }
  return result;
}

async function exactTree(commit: string): Promise<string> {
  const result = (await gitText(["rev-parse", "--verify", `${commit}^{tree}`])).trim();
  if (!/^[a-f0-9]{40}$/u.test(result)) {
    throw new Error(`Git commit ${commit} has no exact tree`);
  }
  return result;
}

async function artifact(
  sourceCommit: string,
  spec: {
    readonly artifactId: string;
    readonly path: string;
    readonly mediaType: CalibrationDerivationReadinessMediaType;
  },
): Promise<CalibrationDerivationReadinessArtifactReference> {
  const bytes = await gitBytes(["show", `${sourceCommit}:${spec.path}`]);
  return {
    artifactId: spec.artifactId,
    path: spec.path,
    sourceCommit,
    sha256: `sha256:${sha256Bytes(bytes)}`,
    sizeBytes: bytes.byteLength,
    mediaType: spec.mediaType,
  };
}

const status = await gitText(["status", "--porcelain=v1"]);
if (status.length !== 0) {
  throw new Error("Derivation-readiness generation requires a clean implementation-source commit");
}

const sourceCommit = await exactCommit("HEAD");
const sourceTree = await exactTree(sourceCommit);
const schemas = await SchemaRegistry.load(path.resolve("schemas"));
const artifacts = await Promise.all(
  CALIBRATION_DERIVATION_READINESS_ARTIFACT_SPECS.map((spec) =>
    artifact(sourceCommit, spec),
  ),
);
const programArtifact = artifacts.find(
  (candidate) => candidate.artifactId === "derivation_programs_source",
);
if (programArtifact === undefined) {
  throw new Error("Derivation program artifact is absent");
}

const protocolAuthor = PrincipalSigner.generate({
  principalId: "protocol.author.calibration-derivation-readiness.public-development.2026-08-03",
  role: "protocol_author",
  implementationDigest: sha256Text(
    `git:${sourceCommit}:scripts/create-calibration-derivation-readiness.ts`,
  ),
  instanceId:
    "protocol.author.calibration-derivation-readiness.public-development.2026-08-03.instance",
  keyId:
    "protocol.author.calibration-derivation-readiness.public-development.2026-08-03.ed25519",
});
const independentVerifier = PrincipalSigner.generate({
  principalId:
    "independent.verifier.calibration-derivation-readiness.public-development.2026-08-03",
  role: "independent_verifier",
  implementationDigest: sha256Text(
    `git:${sourceCommit}:src/governance/calibration-derivation-readiness-verifier.ts`,
  ),
  instanceId:
    "independent.verifier.calibration-derivation-readiness.public-development.2026-08-03.instance",
  keyId:
    "independent.verifier.calibration-derivation-readiness.public-development.2026-08-03.ed25519",
});
const auditStore = PrincipalSigner.generate({
  principalId:
    "audit.store.calibration-derivation-readiness.public-development.2026-08-03",
  role: "audit_store",
  implementationDigest: sha256Text(
    `git:${sourceCommit}:src/governance/calibration-derivation-readiness-verifier.ts`,
  ),
  instanceId:
    "audit.store.calibration-derivation-readiness.public-development.2026-08-03.instance",
  keyId:
    "audit.store.calibration-derivation-readiness.public-development.2026-08-03.ed25519",
});

const recordedAt = new Date().toISOString();
const readiness = createCalibrationDerivationProgramReadiness({
  schemas,
  signer: protocolAuthor,
  value: {
    status: "synthetic_programs_ready_only",
    zeroResearchExecution: true,
    researchEvidencePresent: false,
    sourceSnapshot: {
      sourceCommit,
      sourceTree,
      additionalPushPerformed: false,
    },
    priorBindings: {
      numericFreezeEntryId:
        "nfe-sha256:7517cce6f2878429161bd73154d1ef71f5bb8fe27ca3a77e08b4b55b43df268f",
      numericFreezeEntryRawSha256:
        "sha256:432b341bf40096134d787381fb963c12266e2d73db97e079946614335ad01391",
      calibrationContractId:
        "cc-sha256:8d4ffe8fc9fee52dd3b81b58ae8c7ba65b0bafc4f1d7079f91f3e810f20fff9f",
      calibrationContractHash:
        "sha256:004bd1d7ae369a6e29978117d83539dec90633f3da3f6d1a0c5d5a6fbf3c8f56",
      calibrationContractRawSha256:
        "sha256:5231c0152ee359e42c1879ecc4d1740c8eafde132bd501f8e4196f217128d22d",
      calibrationContractSourceCommit:
        "f8e9df2053c958131fd47385e688f6560b3034c3",
    },
    artifacts,
    programDefinitions: calibrationDerivationProgramDefinitions(
      programArtifact.sha256,
    ),
    gridContract: CALIBRATION_DERIVATION_GRID_CONTRACT,
    estimatorContract: CALIBRATION_DERIVATION_ESTIMATOR_CONTRACT,
    syntheticInputPolicy: CALIBRATION_DERIVATION_SYNTHETIC_INPUT_POLICY,
    failureContract: calibrationDerivationFailureContract(),
    dependencyContract: CALIBRATION_DERIVATION_DEPENDENCY_CONTRACT,
    syntheticConformanceVectors:
      buildCalibrationDerivationSyntheticVectors(),
    roleBoundary: {
      protocolAuthor: {
        role: "protocol_author",
        publicPrincipal: protocolAuthor.exportPublic(),
        processIdentity:
          "process.calibration-derivation-readiness.protocol-author.v1",
        currentCapabilityHandles: [],
        delegatedCapabilityIds: [],
        roleAliases: [],
      },
      independentVerifier: {
        role: "independent_verifier",
        publicPrincipal: independentVerifier.exportPublic(),
        processIdentity:
          "process.calibration-derivation-readiness.independent-verifier.v1",
        currentCapabilityHandles: [],
        delegatedCapabilityIds: [],
        roleAliases: [],
      },
      auditStore: {
        role: "audit_store",
        publicPrincipal: auditStore.exportPublic(),
        processIdentity:
          "process.calibration-derivation-readiness.audit-store.v1",
        currentCapabilityHandles: [],
        delegatedCapabilityIds: [],
        roleAliases: [],
      },
      requiredInequalities: [
        "principalId",
        "instanceId",
        "keyId",
        "publicKeyDigest",
        "processIdentity",
      ],
      aliasingDelegationCosigningProxyingForbidden: true,
    },
    researchExecutionBudget: CALIBRATION_DERIVATION_ZERO_RESEARCH_BUDGET,
    authorityState: CALIBRATION_DERIVATION_AUTHORITY_STATE,
    eligibilityState: CALIBRATION_DERIVATION_ELIGIBILITY_STATE,
    futureIdentityState: {
      finalProtocolId: null,
      budgetFreezeId: null,
      calibrationPlanManifestId: null,
      calibrationEnvelopeId: null,
      selectedProtocolValueSetId: null,
    },
    forbiddenRecordTypes: [...CALIBRATION_DERIVATION_FORBIDDEN_RECORD_TYPES],
    claimBoundary: {
      deterministicProgramsImplemented: true,
      syntheticConformanceOnly: true,
      calibrationPerformed: false,
      numericValuesFrozen: false,
      estimatorAdequacyEstablished: false,
      performanceEvidence: false,
      fairnessEvidence: false,
      attributionEvidence: false,
      securityCertification: false,
      evolutionClaim: false,
      selfImprovementClaim: false,
    },
    recordedAt,
  },
});

const independentResult =
  await verifyCalibrationDerivationProgramReadinessAgainstArtifacts({
    record: readiness,
    schemas,
    reader: new GitCalibrationDerivationReadinessArtifactReader(process.cwd()),
  });
if (
  independentResult.authoritiesGranted !== 0 ||
  independentResult.calibrationExecutions !== 0 ||
  independentResult.protectedDataAccesses !== 0
) {
  throw new Error("Readiness verification introduced execution or authority");
}

const readinessBytes = Buffer.from(
  `${canonicalize(readiness as unknown as JsonValue)}\n`,
  "utf8",
);
const independentVerification =
  createCalibrationDerivationIndependentVerification({
    readiness,
    readinessBytes,
    signer: independentVerifier,
    verifiedAt: new Date().toISOString(),
    verification: {
      schemaValid: true,
      signaturesValid: true,
      sourceBindingsValid: true,
      programsContentAddressed: true,
      gridAndEstimatorContractExact: true,
      syntheticInputPolicyExact: true,
      conformanceVectorsRecomputed: true,
      failureAndWithdrawalContractExact: true,
      dependencyGraphAcyclicAndNoOToD: true,
      syntheticOutputsUnboundFromSentinels: true,
      rolesDisjoint: true,
      zeroResearchBudget: true,
      finalIdentitiesAbsent: true,
      authoritiesGranted: 0,
    },
  });
const receipt = createCalibrationDerivationReadinessAuditReceipt({
  schemas,
  signer: auditStore,
  readiness,
  readinessBytes,
  value: {
    readinessReference: {
      readinessId: readiness.readinessId,
      readinessHash: readiness.readinessHash,
      path: CALIBRATION_DERIVATION_READINESS_PATH,
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
verifyCalibrationDerivationReadinessAuditReceiptIndependent({
  receipt,
  readiness,
  readinessBytes,
  schemas,
});

const receiptBytes = Buffer.from(
  `${canonicalize(receipt as unknown as JsonValue)}\n`,
  "utf8",
);
await mkdir(path.dirname(path.resolve(CALIBRATION_DERIVATION_READINESS_PATH)), {
  recursive: true,
});
await writeFile(path.resolve(CALIBRATION_DERIVATION_READINESS_PATH), readinessBytes, {
  flag: "wx",
});
await writeFile(
  path.resolve(CALIBRATION_DERIVATION_READINESS_AUDIT_PATH),
  receiptBytes,
  { flag: "wx" },
);

process.stdout.write(
  `${JSON.stringify({
    created: true,
    readinessId: readiness.readinessId,
    readinessHash: readiness.readinessHash,
    readinessArtifactSha256: `sha256:${sha256Bytes(readinessBytes)}`,
    auditReceiptId: receipt.receiptId,
    auditReceiptHash: receipt.receiptHash,
    sourceCommit,
    sourceTree,
    artifactCount: artifacts.length,
    programCount: readiness.programDefinitions.length,
    syntheticVectorCount: readiness.syntheticConformanceVectors.length,
    unresolvedObligationCount: independentResult.unresolvedObligationCount,
    authoritiesGranted: 0,
    calibrationExecutions: 0,
    protectedDataAccesses: 0,
    finalProtocolId: null,
    budgetFreezeId: null,
  })}\n`,
);
