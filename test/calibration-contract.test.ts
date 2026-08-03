import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, test } from "node:test";
import path from "node:path";

import {
  CALIBRATION_ATOMIC_FREEZE,
  CALIBRATION_AUTHORITY_STATE,
  CALIBRATION_CONTRACT_ARTIFACT_SPECS,
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
  SchemaRegistry,
  canonicalBytes,
  canonicalize,
  createCalibrationContract,
  createCalibrationContractAuditReceipt,
  defaultCalibrationPendingInventory,
  sha256,
  sha256Bytes,
  verifyCalibrationContractAgainstArtifacts,
  verifyCalibrationContractAuditReceiptIndependent,
  type CalibrationArtifactReference,
  type CalibrationContract,
  type CalibrationContractArtifactReader,
  type CalibrationContractAuditReceipt,
  type JsonValue,
  type UnsignedCalibrationContract,
} from "../src/index.js";
import { deterministicPrincipal } from "./helpers/deterministic-principal.js";

const SOURCE_COMMIT = "a".repeat(40);
const SOURCE_TREE = "b".repeat(40);

class MemoryReader implements CalibrationContractArtifactReader {
  readonly #bytes: ReadonlyMap<string, Buffer>;

  public constructor(bytes: ReadonlyMap<string, Buffer>) {
    this.#bytes = bytes;
  }

  public async treeOf(_commit: string): Promise<string> {
    return SOURCE_TREE;
  }

  public async read(commit: string, artifactPath: string): Promise<Buffer> {
    const value = this.#bytes.get(`${commit}:${artifactPath}`);
    if (value === undefined) throw new Error(`Missing ${commit}:${artifactPath}`);
    return value;
  }
}

interface Fixture {
  readonly schemas: SchemaRegistry;
  readonly record: CalibrationContract;
  readonly reader: MemoryReader;
  readonly contractBytes: Buffer;
  readonly receipt: CalibrationContractAuditReceipt;
}

function mutableCopy<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function roleAuthorities() {
  const evaluator = deterministicPrincipal({
    principalId: "principal.calibration.evaluator.test",
    role: "calibration_evaluator",
    implementationDigest: `sha256:${"1".repeat(64)}`,
    instanceId: "principal.calibration.evaluator.test.instance",
    seedByte: 233,
  });
  const scorer = deterministicPrincipal({
    principalId: "principal.calibration.scorer.test",
    role: "calibration_scorer",
    implementationDigest: `sha256:${"2".repeat(64)}`,
    instanceId: "principal.calibration.scorer.test.instance",
    seedByte: 234,
  });
  const evaluatorPublic = evaluator.exportPublic();
  const scorerPublic = scorer.exportPublic();
  return {
    evaluator: {
      role: "calibration_evaluator" as const,
      publicPrincipal: {
        ...evaluatorPublic,
        keyId: "key.calibration.evaluator.test.ed25519",
      },
      processIdentity: "future.process.calibration.evaluator.v1",
      writableMount: {
        writableMountRoot: "future-mount://calibration/evaluator",
        canonicalSourceId: `mount-source-sha256:${"3".repeat(64)}`,
        backingObjectId: `mount-object-sha256:${"4".repeat(64)}`,
        mounted: false as const,
      },
      readableDataClasses: [...CALIBRATION_EVALUATOR_READABLE],
      writableDataClasses: [...CALIBRATION_EVALUATOR_WRITABLE],
      forbiddenDataClasses: [...CALIBRATION_EVALUATOR_FORBIDDEN],
      currentCapabilityHandles: [] as const,
      delegatedCapabilityIds: [] as const,
      roleAliases: [] as const,
      keyRotationLineage: [] as const,
    },
    scorer: {
      role: "calibration_scorer" as const,
      publicPrincipal: {
        ...scorerPublic,
        keyId: "key.calibration.scorer.test.ed25519",
      },
      processIdentity: "future.process.calibration.scorer.v1",
      writableMount: {
        writableMountRoot: "future-mount://calibration/scorer",
        canonicalSourceId: `mount-source-sha256:${"5".repeat(64)}`,
        backingObjectId: `mount-object-sha256:${"6".repeat(64)}`,
        mounted: false as const,
      },
      readableDataClasses: [...CALIBRATION_SCORER_READABLE],
      writableDataClasses: [...CALIBRATION_SCORER_WRITABLE],
      forbiddenDataClasses: [...CALIBRATION_SCORER_FORBIDDEN],
      currentCapabilityHandles: [] as const,
      delegatedCapabilityIds: [] as const,
      roleAliases: [] as const,
      keyRotationLineage: [] as const,
    },
  };
}

function unsignedOf(record: CalibrationContract): UnsignedCalibrationContract {
  const {
    schemaVersion: _schemaVersion,
    hashDomain: _hashDomain,
    calibrationContractId: _calibrationContractId,
    recordType: _recordType,
    recordedBy: _recordedBy,
    contractHash: _contractHash,
    publicPrincipal: _publicPrincipal,
    attestation: _attestation,
    ...unsigned
  } = record;
  return unsigned;
}

function validlyResign(
  base: CalibrationContract,
  mutate: (value: any) => void,
  role: "protocol_author" | "operations_owner" = "protocol_author",
): CalibrationContract {
  const value = mutableCopy(unsignedOf(base)) as any;
  mutate(value);
  const signer = deterministicPrincipal({
    principalId: `principal.calibration.contract.resign.${role}`,
    role,
    implementationDigest: `sha256:${"9".repeat(64)}`,
    instanceId: `principal.calibration.contract.resign.${role}.instance`,
    seedByte: role === "protocol_author" ? 235 : 236,
  });
  const calibrationContractId = `cc-sha256:${sha256Bytes(canonicalBytes({
    hashDomain: "CalibrationContract.v1",
    ...value,
  }))}`;
  const core = {
    schemaVersion: 1 as const,
    hashDomain: "CalibrationContract.v1" as const,
    calibrationContractId,
    recordType: "calibration_contract_preregistration" as const,
    ...value,
    recordedBy: signer.identity,
  };
  const body = {
    ...core,
    contractHash: sha256(core as unknown as JsonValue),
    publicPrincipal: signer.exportPublic(),
  };
  return {
    ...body,
    attestation: signer.attest(body as unknown as JsonValue),
  } as CalibrationContract;
}

async function fixture(): Promise<Fixture> {
  const schemas = await SchemaRegistry.load(path.resolve("schemas"));
  const bytes = new Map<string, Buffer>();
  const artifacts: CalibrationArtifactReference[] = [];
  for (const spec of CALIBRATION_CONTRACT_ARTIFACT_SPECS) {
    const value = await readFile(path.resolve(spec.path));
    bytes.set(`${SOURCE_COMMIT}:${spec.path}`, value);
    artifacts.push({
      artifactId: spec.artifactId,
      path: spec.path,
      sourceCommit: SOURCE_COMMIT,
      sha256: `sha256:${sha256Bytes(value)}`,
      sizeBytes: value.byteLength,
      mediaType: spec.mediaType,
    });
  }
  const roles = roleAuthorities();
  const author = deterministicPrincipal({
    principalId: "protocol.author.calibration.contract.test",
    role: "protocol_author",
    implementationDigest: `sha256:${"7".repeat(64)}`,
    instanceId: "protocol.author.calibration.contract.test.instance",
    seedByte: 237,
  });
  const record = createCalibrationContract({
    schemas,
    signer: author,
    value: {
      zeroExecution: true,
      status: "preregistered_only",
      evidencePresent: false,
      authorizedForResearchEvidence: false,
      sourceSnapshot: { sourceCommit: SOURCE_COMMIT, sourceTree: SOURCE_TREE, additionalPushPerformed: false },
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
        ...roles,
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
      ].map(([capabilityId, role, purpose]) => ({ capabilityId: capabilityId!, role: role! as "calibration_evaluator" | "calibration_scorer", purpose: purpose!, granted: false as const, delegable: false as const, currentHandle: null })),
      mountMatrix: [
        {
          role: "calibration_evaluator",
          mountKind: "reserved_future_writable",
          ...roles.evaluator.writableMount,
          currentWriteCapability: null,
        },
        {
          role: "calibration_scorer",
          mountKind: "reserved_future_writable",
          ...roles.scorer.writableMount,
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
      futureIdentityState: { finalProtocolId: null, budgetFreezeId: null, providerIdentity: null, modelIdentity: null, calibrationEnvelopeId: null },
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
      recordedAt: "2026-08-03T00:00:00.000Z",
    },
  });
  const reader = new MemoryReader(bytes);
  await verifyCalibrationContractAgainstArtifacts({ record, schemas, reader });
  const contractBytes = Buffer.from(`${canonicalize(record as unknown as JsonValue)}\n`, "utf8");
  const audit = deterministicPrincipal({
    principalId: "audit.store.calibration.contract.test",
    role: "audit_store",
    implementationDigest: `sha256:${"8".repeat(64)}`,
    instanceId: "audit.store.calibration.contract.test.instance",
    seedByte: 238,
  });
  const receipt = createCalibrationContractAuditReceipt({
    schemas,
    signer: audit,
    contract: record,
    contractBytes,
    value: {
      contractReference: {
        calibrationContractId: record.calibrationContractId,
        contractHash: record.contractHash,
        path: CALIBRATION_CONTRACT_PATH,
        sourceCommit: SOURCE_COMMIT,
        sourceTree: SOURCE_TREE,
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
      verifiedAt: "2026-08-03T00:00:01.000Z",
    },
  });
  verifyCalibrationContractAuditReceiptIndependent({ receipt, contract: record, contractBytes, schemas });
  return { schemas, record, reader, contractBytes, receipt };
}

async function rejects(current: Fixture, mutate: (value: any) => void, role: "protocol_author" | "operations_owner" = "protocol_author"): Promise<void> {
  const record = validlyResign(current.record, mutate, role);
  await assert.rejects(verifyCalibrationContractAgainstArtifacts({ record, schemas: current.schemas, reader: current.reader }));
}

describe("zero-execution calibration contract", () => {
  test("verifies the closed contract and reference-only audit receipt", async () => {
    const current = await fixture();
    const result = await verifyCalibrationContractAgainstArtifacts({ record: current.record, schemas: current.schemas, reader: current.reader });
    assert.deepEqual({ artifacts: result.artifactCount, sentinels: result.pendingSentinelCount, groups: result.pendingGroupCount, phases: result.phaseCount, classes: result.derivationClassCount, nodes: result.evidenceNodeCount, obligations: result.unresolvedObligationCount, providerAttempts: result.providerModelRequestAttempts, calibrations: result.calibrationExecutions, authorities: result.authoritiesGranted, protocolId: result.finalProtocolId, budgetId: result.budgetFreezeId }, { artifacts: 22, sentinels: 25, groups: 8, phases: 12, classes: 6, nodes: 11, obligations: 7, providerAttempts: 0, calibrations: 0, authorities: 0, protocolId: null, budgetId: null });
  });

  test("rejects every evaluator/scorer identity equality after valid outer re-signing", async () => {
    const current = await fixture();
    await rejects(current, (value) => { value.authoritySeparation.scorer.publicPrincipal.identity.principalId = value.authoritySeparation.evaluator.publicPrincipal.identity.principalId; });
    await rejects(current, (value) => { value.authoritySeparation.scorer.publicPrincipal.identity.instanceId = value.authoritySeparation.evaluator.publicPrincipal.identity.instanceId; });
    await rejects(current, (value) => { value.authoritySeparation.scorer.publicPrincipal.keyId = value.authoritySeparation.evaluator.publicPrincipal.keyId; });
    await rejects(current, (value) => { value.authoritySeparation.scorer.publicPrincipal.identity.identityDigest = value.authoritySeparation.evaluator.publicPrincipal.identity.identityDigest; });
    await rejects(current, (value) => { value.authoritySeparation.scorer.processIdentity = value.authoritySeparation.evaluator.processIdentity; });
    await rejects(current, (value) => { value.authoritySeparation.scorer.writableMount.writableMountRoot = value.authoritySeparation.evaluator.writableMount.writableMountRoot; });
  });

  test("rejects aliased backing storage, delegation, and combined capability authority", async () => {
    const current = await fixture();
    await rejects(current, (value) => { value.authoritySeparation.scorer.writableMount.canonicalSourceId = value.authoritySeparation.evaluator.writableMount.canonicalSourceId; });
    await rejects(current, (value) => { value.authoritySeparation.scorer.writableMount.backingObjectId = value.authoritySeparation.evaluator.writableMount.backingObjectId; });
    await rejects(current, (value) => { value.mountMatrix[1].canonicalSourceId = value.mountMatrix[0].canonicalSourceId; });
    await rejects(current, (value) => { value.authoritySeparation.evaluator.delegatedCapabilityIds.push("future.scorer.run_frozen_scoring"); });
    await rejects(current, (value) => { value.authoritySeparation.scorer.roleAliases.push("calibration_evaluator_scoring"); });
    await rejects(current, (value) => { value.capabilityMatrix[0].granted = true; });
  });

  test("rejects scorer protected data and wrong or combined record creation", async () => {
    const current = await fixture();
    await rejects(current, (value) => { value.authoritySeparation.scorer.readableDataClasses[0] = "task_body"; });
    await rejects(current, (value) => { value.dataAccessMatrix.find((item: any) => item.role === "protocol_author").allowedFutureDataClasses[0] = "task_level_measurements"; });
    await rejects(current, (value) => { value.dataAccessMatrix.find((item: any) => item.role === "independent_verifier").allowedFutureDataClasses[0] = "evaluator_raw_bytes_or_mount"; });
    await rejects(current, (value) => { value.recordCreationMatrix.find((item: any) => item.recordType === "AggregateCalibrationCommitment").soleCreator = "calibration_evaluator"; });
    await rejects(current, (value) => { value.recordCreationMatrix.find((item: any) => item.recordType === "CalibrationMeasurementCommitment").soleCreator = "independent_verifier"; });
    await rejects(current, (value) => { value.recordCreationMatrix[0].recordType = "CombinedMeasurementAggregateCommitment"; });
  });

  test("rejects direct release, scorer bypass, graph insertion, and omission", async () => {
    const current = await fixture();
    await rejects(current, (value) => { value.evidenceGraph.edges[0] = "E1->E4"; });
    await rejects(current, (value) => { value.evidenceGraph.edges[1] = "E0->E2"; });
    await rejects(current, (value) => { value.evidenceGraph.edges[2] = "evaluator_raw->E2"; });
    await rejects(current, (value) => { value.evidenceGraph.edges.pop(); });
  });

  test("rejects numeric drift, nonzero budget, final IDs, and authority escalation", async () => {
    const current = await fixture();
    await rejects(current, (value) => { value.pendingInventory.sentinels[0].sentinel = "PILOT_PENDING"; });
    await rejects(current, (value) => { value.pendingInventory.groups[0] = "replacement.group"; });
    await rejects(current, (value) => { value.derivationContract.assignments[0].derivationClass = "normative_contract_value"; });
    await rejects(current, (value) => { value.zeroBudget.providerModelRequestAttempts = 1; });
    await rejects(current, (value) => { value.zeroBudget.wallClockSeconds = 1; });
    await rejects(current, (value) => { value.futureIdentityState.finalProtocolId = `protocol-sha256:${"c".repeat(64)}`; });
    await rejects(current, (value) => { value.authorityState.calibrationExecutionAuthorized = true; });
    await rejects(current, (value) => { value.eligibilityState.authorizedForResearchEvidence = true; });
  });

  test("rejects a valid signature from the wrong contract creator", async () => {
    const current = await fixture();
    await rejects(current, () => undefined, "operations_owner");
  });

  test("rejects reference-only audit receipt byte substitution", async () => {
    const current = await fixture();
    const substituted = Buffer.from(current.contractBytes);
    substituted[0] = substituted[0] === 0x7b ? 0x5b : 0x7b;
    assert.throws(() => verifyCalibrationContractAuditReceiptIndependent({ receipt: current.receipt, contract: current.record, contractBytes: substituted, schemas: current.schemas }));
  });
});
