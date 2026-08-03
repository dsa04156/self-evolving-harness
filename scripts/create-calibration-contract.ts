import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import {
  CALIBRATION_ATOMIC_FREEZE,
  CALIBRATION_AUTHORITY_STATE,
  CALIBRATION_CONTRACT_ARTIFACT_SPECS,
  CALIBRATION_CONTRACT_AUDIT_PATH,
  CALIBRATION_CONTRACT_PATH,
  CALIBRATION_DATA_ACCESS_MATRIX,
  CALIBRATION_DERIVATION_ASSIGNMENTS,
  CALIBRATION_DERIVATION_CLASSES,
  CALIBRATION_DERIVATION_RULES,
  CALIBRATION_ELIGIBILITY_STATE,
  CALIBRATION_EVALUATOR_FORBIDDEN,
  CALIBRATION_EVALUATOR_READABLE,
  CALIBRATION_EVALUATOR_WRITABLE,
  CALIBRATION_EVIDENCE_GRAPH,
  CALIBRATION_FAILURE_CONDITIONS,
  CALIBRATION_MESSAGE_FLOWS,
  CALIBRATION_NUMERIC_GRAPH,
  CALIBRATION_RECORD_CREATION_MATRIX,
  CALIBRATION_SCORER_FORBIDDEN,
  CALIBRATION_SCORER_READABLE,
  CALIBRATION_SCORER_WRITABLE,
  CALIBRATION_ZERO_BUDGET,
  GitCalibrationContractArtifactReader,
  PrincipalSigner,
  SchemaRegistry,
  canonicalize,
  createCalibrationContract,
  createCalibrationContractAuditReceipt,
  defaultCalibrationPendingInventory,
  sha256Bytes,
  sha256Text,
  verifyCalibrationContractAgainstArtifacts,
  verifyCalibrationContractAuditReceiptIndependent,
  type CalibrationArtifactMediaType,
  type CalibrationArtifactReference,
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

async function artifact(sourceCommit: string, spec: {
  readonly artifactId: string;
  readonly path: string;
  readonly mediaType: CalibrationArtifactMediaType;
}): Promise<CalibrationArtifactReference> {
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
  throw new Error("Calibration-contract generation requires a clean implementation-source commit");
}

const sourceCommit = await exactCommit("HEAD");
const sourceTree = await exactTree(sourceCommit);
const schemas = await SchemaRegistry.load(path.resolve("schemas"));
const artifacts = await Promise.all(
  CALIBRATION_CONTRACT_ARTIFACT_SPECS.map((spec) => artifact(sourceCommit, spec)),
);

const protocolAuthor = PrincipalSigner.generate({
  principalId: "protocol.author.calibration-contract.public-development.2026-08-03",
  role: "protocol_author",
  implementationDigest: sha256Text(`git:${sourceCommit}:scripts/create-calibration-contract.ts`),
  instanceId: "protocol.author.calibration-contract.public-development.2026-08-03.instance",
  keyId: "protocol.author.calibration-contract.public-development.2026-08-03.ed25519",
});
const evaluator = PrincipalSigner.generate({
  principalId: "principal.calibration.evaluator.public-development.2026-08-03",
  role: "calibration_evaluator",
  implementationDigest: sha256Text(`git:${sourceCommit}:future:calibration-evaluator`),
  instanceId: "principal.calibration.evaluator.public-development.2026-08-03.instance",
  keyId: "key.calibration.evaluator.public-development.2026-08-03.ed25519",
});
const scorer = PrincipalSigner.generate({
  principalId: "principal.calibration.scorer.public-development.2026-08-03",
  role: "calibration_scorer",
  implementationDigest: sha256Text(`git:${sourceCommit}:future:calibration-scorer`),
  instanceId: "principal.calibration.scorer.public-development.2026-08-03.instance",
  keyId: "key.calibration.scorer.public-development.2026-08-03.ed25519",
});
const evaluatorMount = {
  writableMountRoot: "future-mount://calibration/evaluator",
  canonicalSourceId: `mount-source-sha256:${sha256Text(`git:${sourceCommit}:mount:evaluator`).slice(7)}`,
  backingObjectId: `mount-object-sha256:${sha256Text(`git:${sourceCommit}:object:evaluator`).slice(7)}`,
  mounted: false as const,
};
const scorerMount = {
  writableMountRoot: "future-mount://calibration/scorer",
  canonicalSourceId: `mount-source-sha256:${sha256Text(`git:${sourceCommit}:mount:scorer`).slice(7)}`,
  backingObjectId: `mount-object-sha256:${sha256Text(`git:${sourceCommit}:object:scorer`).slice(7)}`,
  mounted: false as const,
};

const createdAt = new Date().toISOString();
const contract = createCalibrationContract({
  schemas,
  signer: protocolAuthor,
  value: {
    zeroExecution: true,
    status: "preregistered_only",
    evidencePresent: false,
    authorizedForResearchEvidence: false,
    sourceSnapshot: { sourceCommit, sourceTree, additionalPushPerformed: false },
    artifacts,
    priorBindings: {
      numericFreezeEntryId: "nfe-sha256:7517cce6f2878429161bd73154d1ef71f5bb8fe27ca3a77e08b4b55b43df268f",
      numericFreezeEntryRawSha256: "sha256:432b341bf40096134d787381fb963c12266e2d73db97e079946614335ad01391",
      entryEvidencePacketSha256: "sha256:6adbec974e9f994cb2dac92bbcb4f831611c5a19635296b8c52831ab9b3ccee6",
      entryEvidenceRulingSha256: "sha256:8552851015a6fc09659677442710da6b1227a12943b52f1289d9dd51f4bea3ab",
      derivationPacketSha256: "sha256:bffddeb8f9c7614f0ee7be5adb49cfd977b89ee3e607253b6f29e8629af61239",
      derivationRulingSha256: "sha256:f002f7808d5377035dee1f5dbb060faf6e79802f86249c59b6a45f2f55e9d3f0",
      separationPacketSha256: "sha256:d7ae7b647c58ff735dbd676390dd79300d26011ef8db85a8b3b979537c172ac6",
      separationRulingSha256: "sha256:809987398f5abf6045cf62d6e91153332a406d3f671f784c37339f5a6a57e443",
      derivationDecision: "REVISE",
      separationDecision: "APPROVE",
    },
    pendingInventory: defaultCalibrationPendingInventory(),
    derivationContract: {
      classes: [...CALIBRATION_DERIVATION_CLASSES],
      assignments: CALIBRATION_DERIVATION_ASSIGNMENTS.map(([pathOrGroup, derivationClass]) => ({ pathOrGroup, derivationClass })),
      numericGraph: CALIBRATION_NUMERIC_GRAPH,
      rules: [...CALIBRATION_DERIVATION_RULES],
      atomicFreeze: CALIBRATION_ATOMIC_FREEZE,
      failureConditions: [...CALIBRATION_FAILURE_CONDITIONS],
    },
    authoritySeparation: {
      evaluator: {
        role: "calibration_evaluator",
        publicPrincipal: evaluator.exportPublic(),
        processIdentity: "future.process.calibration.evaluator.v1",
        writableMount: evaluatorMount,
        readableDataClasses: [...CALIBRATION_EVALUATOR_READABLE],
        writableDataClasses: [...CALIBRATION_EVALUATOR_WRITABLE],
        forbiddenDataClasses: [...CALIBRATION_EVALUATOR_FORBIDDEN],
        currentCapabilityHandles: [],
        delegatedCapabilityIds: [],
        roleAliases: [],
        keyRotationLineage: [],
      },
      scorer: {
        role: "calibration_scorer",
        publicPrincipal: scorer.exportPublic(),
        processIdentity: "future.process.calibration.scorer.v1",
        writableMount: scorerMount,
        readableDataClasses: [...CALIBRATION_SCORER_READABLE],
        writableDataClasses: [...CALIBRATION_SCORER_WRITABLE],
        forbiddenDataClasses: [...CALIBRATION_SCORER_FORBIDDEN],
        currentCapabilityHandles: [],
        delegatedCapabilityIds: [],
        roleAliases: [],
        keyRotationLineage: [],
      },
      requiredInequalities: ["principalId", "instanceId", "keyId", "publicKeyDigest", "processIdentity", "writableMountRoot"],
      canonicalMountSourcesMustDiffer: true,
      backingObjectsMustDiffer: true,
      delegationForbidden: true,
      aliasingForbidden: true,
      proxyWrappingCosigningInheritanceTemporaryReuseForbidden: true,
    },
    capabilityMatrix: [
      ["future.evaluator.execute_current_pilot_once", "calibration_evaluator", "bounded_current_pilot_task_execution"],
      ["future.evaluator.read_verifier", "calibration_evaluator", "read_only_verifier_access"],
      ["future.evaluator.read_executor_stream", "calibration_evaluator", "signed_executor_stream_read"],
      ["future.evaluator.write_measurement", "calibration_evaluator", "evaluator_owned_measurement_write"],
      ["future.scorer.read_measurement_commitment", "calibration_scorer", "reference_only_measurement_read"],
      ["future.scorer.read_accounting", "calibration_scorer", "signed_accounting_read"],
      ["future.scorer.run_frozen_scoring", "calibration_scorer", "deterministic_scoring_only"],
    ].map(([capabilityId, role, purpose]) => ({
      capabilityId: capabilityId!,
      role: role! as "calibration_evaluator" | "calibration_scorer",
      purpose: purpose!,
      granted: false as const,
      delegable: false as const,
      currentHandle: null,
    })),
    mountMatrix: [
      {
        role: "calibration_evaluator",
        mountKind: "reserved_future_writable",
        ...evaluatorMount,
        currentWriteCapability: null,
      },
      {
        role: "calibration_scorer",
        mountKind: "reserved_future_writable",
        ...scorerMount,
        currentWriteCapability: null,
      },
    ],
    dataAccessMatrix: CALIBRATION_DATA_ACCESS_MATRIX.map((entry) => ({
      role: entry.role,
      allowedFutureDataClasses: [...entry.allowedFutureDataClasses],
      forbiddenDataClasses: [...entry.forbiddenDataClasses],
      currentAccessGranted: false,
    })),
    messageFlows: CALIBRATION_MESSAGE_FLOWS.map((flow) => ({ ...flow, acceptedRecordTypes: [...flow.acceptedRecordTypes] })),
    recordCreationMatrix: CALIBRATION_RECORD_CREATION_MATRIX.map(([recordType, soleCreator]) => ({ recordType, soleCreator, proxyWrapAliasDelegateCosignReuseForbidden: true as const })),
    evidenceGraph: CALIBRATION_EVIDENCE_GRAPH,
    zeroBudget: CALIBRATION_ZERO_BUDGET,
    authorityState: CALIBRATION_AUTHORITY_STATE,
    eligibilityState: CALIBRATION_ELIGIBILITY_STATE,
    futureIdentityState: {
      finalProtocolId: null,
      budgetFreezeId: null,
      providerIdentity: null,
      modelIdentity: null,
      calibrationEnvelopeId: null,
    },
    claimBoundary: {
      contractPreregistered: true,
      calibrationPerformed: false,
      numericFreezeComplete: false,
      researchProtocolFrozen: false,
      performanceEvidence: false,
      fairnessEvidence: false,
      securityClaim: false,
      evolutionClaim: false,
      selfImprovementClaim: false,
    },
    recordedAt: createdAt,
  },
});

const independentResult = await verifyCalibrationContractAgainstArtifacts({
  record: contract,
  schemas,
  reader: new GitCalibrationContractArtifactReader(process.cwd()),
});
if (independentResult.authoritiesGranted !== 0 || independentResult.calibrationExecutions !== 0) {
  throw new Error("Independent calibration-contract verification granted authority or execution");
}

const contractBytes = Buffer.from(`${canonicalize(contract as unknown as JsonValue)}\n`, "utf8");
const auditStore = PrincipalSigner.generate({
  principalId: "audit.store.calibration-contract.public-development.2026-08-03",
  role: "audit_store",
  implementationDigest: sha256Text(`git:${sourceCommit}:src/governance/calibration-contract-verifier.ts`),
  instanceId: "audit.store.calibration-contract.public-development.2026-08-03.instance",
  keyId: "audit.store.calibration-contract.public-development.2026-08-03.ed25519",
});
const receipt = createCalibrationContractAuditReceipt({
  schemas,
  signer: auditStore,
  contract,
  contractBytes,
  value: {
    contractReference: {
      calibrationContractId: contract.calibrationContractId,
      contractHash: contract.contractHash,
      path: CALIBRATION_CONTRACT_PATH,
      sourceCommit,
      sourceTree,
      sha256: `sha256:${sha256Bytes(contractBytes)}`,
      sizeBytes: contractBytes.byteLength,
    },
    verifierArtifactId: "calibration_contract_verifier",
    verification: {
      schemaValid: true,
      signatureValid: true,
      sourceBindingsValid: true,
      numericInventoryUnchanged: true,
      derivationContractComplete: true,
      authoritySeparationValid: true,
      mountSourcesDisjoint: true,
      messageAndRecordOwnershipValid: true,
      evidenceGraphComplete: true,
      zeroExecutionAndAuthorityValid: true,
      forbiddenDataAbsent: true,
      finalIdentitiesAbsent: true,
      authoritiesGranted: 0,
    },
    verifiedAt: new Date().toISOString(),
  },
});
verifyCalibrationContractAuditReceiptIndependent({ receipt, contract, contractBytes, schemas });
const receiptBytes = Buffer.from(`${canonicalize(receipt as unknown as JsonValue)}\n`, "utf8");
await mkdir(path.dirname(path.resolve(CALIBRATION_CONTRACT_PATH)), { recursive: true });
await writeFile(path.resolve(CALIBRATION_CONTRACT_PATH), contractBytes, { flag: "wx" });
await writeFile(path.resolve(CALIBRATION_CONTRACT_AUDIT_PATH), receiptBytes, { flag: "wx" });

process.stdout.write(`${JSON.stringify({
  created: true,
  calibrationContractId: contract.calibrationContractId,
  contractHash: contract.contractHash,
  contractArtifactSha256: `sha256:${sha256Bytes(contractBytes)}`,
  auditReceiptId: receipt.receiptId,
  auditReceiptHash: receipt.receiptHash,
  sourceCommit,
  sourceTree,
  artifactCount: artifacts.length,
  pendingSentinelCount: contract.pendingInventory.sentinels.length,
  authoritiesGranted: 0,
  calibrationExecutions: 0,
  finalProtocolId: null,
  budgetFreezeId: null,
})}\n`);
