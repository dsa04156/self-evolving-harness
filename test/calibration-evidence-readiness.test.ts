import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, test } from "node:test";

import {
  CALIBRATION_EVIDENCE_AUTHORITY_STATE,
  CALIBRATION_EVIDENCE_CONTRACT_INVENTORY,
  CALIBRATION_EVIDENCE_DISCLOSURE_MATRIX,
  CALIBRATION_EVIDENCE_ELIGIBILITY_STATE,
  CALIBRATION_EVIDENCE_FUTURE_IDENTITY_STATE,
  CALIBRATION_EVIDENCE_GRAPH_CONTRACT,
  CALIBRATION_EVIDENCE_OWNERSHIP_MATRIX,
  CALIBRATION_EVIDENCE_READINESS_ARTIFACT_SPECS,
  CALIBRATION_EVIDENCE_READINESS_PATH,
  CALIBRATION_EVIDENCE_SYNTHETIC_FIXTURE_CONTRACT,
  CALIBRATION_EVIDENCE_ZERO_BUDGET,
  PrincipalRegistry,
  SchemaRegistry,
  buildSyntheticCalibrationCapabilityDescriptor,
  buildSyntheticCalibrationEvidenceChain,
  buildSyntheticCalibrationEvidenceScenarios,
  calibrationEvidenceContractHashes,
  canonicalBytes,
  canonicalize,
  contentId,
  createCalibrationEvidenceContractReadiness,
  createCalibrationEvidenceIndependentVerification,
  createCalibrationEvidenceReadinessAuditReceipt,
  sha256,
  sha256Bytes,
  verifyCalibrationEvidenceContractReadinessAgainstArtifacts,
  verifyCalibrationEvidenceReadinessAuditReceiptIndependent,
  verifySyntheticCalibrationEvidenceChain,
  type CalibrationEvidenceArtifactReference,
  type CalibrationEvidenceContractReadiness,
  type CalibrationEvidenceReadinessArtifactReader,
  type CalibrationEvidenceReadinessAuditReceipt,
  type CalibrationEvidenceRecord,
  type CalibrationEvidenceRecordType,
  type CalibrationEvidenceRoleBoundary,
  type JsonValue,
  type PrincipalRole,
  type PrincipalSigner,
  type UnsignedCalibrationEvidenceContractReadiness,
} from "../src/index.js";
import { deterministicPrincipal } from "./helpers/deterministic-principal.js";

const SOURCE_COMMIT = "e".repeat(40);
const SOURCE_TREE = "f".repeat(40);

class MemoryReader implements CalibrationEvidenceReadinessArtifactReader {
  readonly #bytes: ReadonlyMap<string, Buffer>;
  public constructor(bytes: ReadonlyMap<string, Buffer>) { this.#bytes = bytes; }
  public async treeOf(_commit: string): Promise<string> { return SOURCE_TREE; }
  public async read(commit: string, artifactPath: string): Promise<Buffer> {
    const value = this.#bytes.get(`${commit}:${artifactPath}`);
    if (value === undefined) throw new Error(`Missing ${commit}:${artifactPath}`);
    return value;
  }
}

function principal(role: PrincipalRole, seedByte: number): PrincipalSigner {
  return deterministicPrincipal({
    principalId: `${role}.calibration-evidence.test`,
    role,
    implementationDigest: `sha256:${seedByte.toString(16).padStart(2, "0").repeat(32)}`,
    instanceId: `${role}.calibration-evidence.test.instance`,
    seedByte,
  });
}

interface Signers {
  readonly calibrationExecutor: PrincipalSigner;
  readonly calibrationEvaluator: PrincipalSigner;
  readonly calibrationScorer: PrincipalSigner;
  readonly independentVerifier: PrincipalSigner;
  readonly protocolAuthor: PrincipalSigner;
  readonly auditStore: PrincipalSigner;
}

function signers(): Signers {
  return {
    calibrationExecutor: principal("calibration_executor", 171),
    calibrationEvaluator: principal("calibration_evaluator", 172),
    calibrationScorer: principal("calibration_scorer", 173),
    independentVerifier: principal("independent_verifier", 174),
    protocolAuthor: principal("protocol_author", 175),
    auditStore: principal("audit_store", 176),
  };
}

function boundary(current: Signers): CalibrationEvidenceRoleBoundary {
  const role = (
    roleName: CalibrationEvidenceRoleBoundary["calibrationExecutor"]["role"],
    signer: PrincipalSigner,
    processName: string,
  ) => ({
    role: roleName,
    publicPrincipal: signer.exportPublic(),
    processIdentity: `process.calibration-evidence.${processName}.v1`,
    currentCapabilityHandles: [] as const,
    delegatedCapabilityIds: [] as const,
    proxyPrincipalIds: [] as const,
    wrapperPrincipalIds: [] as const,
    roleAliases: [] as const,
    cosignerKeyIds: [] as const,
  });
  return {
    calibrationExecutor: role("calibration_executor", current.calibrationExecutor, "calibration-executor"),
    calibrationEvaluator: role("calibration_evaluator", current.calibrationEvaluator, "calibration-evaluator"),
    calibrationScorer: role("calibration_scorer", current.calibrationScorer, "calibration-scorer"),
    independentVerifier: role("independent_verifier", current.independentVerifier, "independent-verifier"),
    protocolAuthor: role("protocol_author", current.protocolAuthor, "protocol-author"),
    auditStore: role("audit_store", current.auditStore, "audit-store"),
    requiredInequalities: ["principalId", "instanceId", "keyId", "publicKeyDigest", "processIdentity"],
    exclusiveOwnershipAndNoDelegationProxyWrapperAliasCosign: true,
  };
}

const PREFIX: Record<CalibrationEvidenceRecordType, string> = {
  CalibrationExecutionReceipt: "cer",
  CalibrationUsageReceipt: "cur",
  CalibrationIncidentRecord: "cir",
  CalibrationMeasurementCommitment: "cmc",
  CalibrationEvaluatorFailureRecord: "cefr",
  CalibrationEvaluatorIncidentRecord: "ceir",
  AggregateCalibrationCommitment: "acc",
  RejectedDerivationCandidateCommitment: "rdcc",
  CalibrationWithdrawalRecord: "cwr",
  CalibrationScorerFailureRecord: "csfr",
  CalibrationScorerIncidentRecord: "csir",
  CalibrationVerificationReceipt: "cvr",
  ProtocolAuthorDerivedValueProposal: "padvp",
};

function cryptographicallyResignRecord(input: {
  readonly base: CalibrationEvidenceRecord;
  readonly signer: PrincipalSigner;
  readonly mutate?: (value: any) => void;
}): CalibrationEvidenceRecord {
  const value: any = structuredClone({
    recordType: input.base.recordType,
    stage: input.base.stage,
    attemptCommitment: input.base.attemptCommitment,
    dependencies: input.base.dependencies,
    payload: input.base.payload,
    disposition: input.base.disposition,
    budget: input.base.budget,
    creationMode: input.base.creationMode,
    recordedAt: input.base.recordedAt,
  });
  input.mutate?.(value);
  const identityValue = { hashDomain: "CalibrationEvidenceRecord.v1", ...value };
  const evidenceRecordId = contentId("ci-sha256", identityValue).replace("ci-sha256:", `${PREFIX[value.recordType as CalibrationEvidenceRecordType]}-sha256:`);
  const core = {
    schemaVersion: 1 as const,
    hashDomain: "CalibrationEvidenceRecord.v1" as const,
    evidenceRecordId,
    ...value,
    recordedBy: input.signer.identity,
  };
  const body = { ...core, evidenceRecordHash: sha256(core as unknown as JsonValue), publicPrincipal: input.signer.exportPublic() };
  const result = { ...body, attestation: input.signer.attest(body as unknown as JsonValue) } as CalibrationEvidenceRecord;
  const registry = new PrincipalRegistry();
  registry.register(input.signer.exportPublic());
  registry.verify(input.signer.identity, body as unknown as JsonValue, result.attestation);
  return result;
}

function replaceByOriginalId(
  records: readonly CalibrationEvidenceRecord[],
  original: CalibrationEvidenceRecord,
  replacement: CalibrationEvidenceRecord,
): CalibrationEvidenceRecord[] {
  return records.map((record) => record.evidenceRecordId === original.evidenceRecordId ? replacement : record);
}

function insertBeforeStage(
  records: readonly CalibrationEvidenceRecord[],
  stage: CalibrationEvidenceRecord["stage"],
  record: CalibrationEvidenceRecord,
): CalibrationEvidenceRecord[] {
  const index = records.findIndex((candidate) => candidate.stage === stage);
  assert.notEqual(index, -1);
  return [...records.slice(0, index), record, ...records.slice(index)];
}

interface ReadinessFixture {
  readonly schemas: SchemaRegistry;
  readonly signers: Signers;
  readonly record: CalibrationEvidenceContractReadiness;
  readonly reader: MemoryReader;
  readonly readinessBytes: Buffer;
  readonly receipt: CalibrationEvidenceReadinessAuditReceipt;
}

function unsignedReadiness(record: CalibrationEvidenceContractReadiness): UnsignedCalibrationEvidenceContractReadiness {
  const {
    schemaVersion: _schemaVersion,
    hashDomain: _hashDomain,
    readinessId: _id,
    recordType: _recordType,
    recordedBy: _recordedBy,
    readinessHash: _hash,
    publicPrincipal: _principal,
    attestation: _attestation,
    ...unsigned
  } = record;
  return unsigned;
}

function validlyResignReadiness(
  base: CalibrationEvidenceContractReadiness,
  mutate: (value: any) => void,
  signerRole: PrincipalRole = "protocol_author",
): CalibrationEvidenceContractReadiness {
  const value: any = structuredClone(unsignedReadiness(base));
  const signer = principal(signerRole, signerRole === "protocol_author" ? 177 : 178);
  value.roleBoundary.protocolAuthor.publicPrincipal = signer.exportPublic();
  mutate(value);
  const readinessId = `cecr-sha256:${sha256Bytes(canonicalBytes({ hashDomain: "CalibrationEvidenceContractReadiness.v1", ...value }))}`;
  const core = { schemaVersion: 1 as const, hashDomain: "CalibrationEvidenceContractReadiness.v1" as const, readinessId, recordType: "calibration_evidence_contract_readiness" as const, ...value, recordedBy: signer.identity };
  const body = { ...core, readinessHash: sha256(core as unknown as JsonValue), publicPrincipal: signer.exportPublic() };
  return { ...body, attestation: signer.attest(body as unknown as JsonValue) } as CalibrationEvidenceContractReadiness;
}

async function readinessFixture(): Promise<ReadinessFixture> {
  const schemas = await SchemaRegistry.load(path.resolve("schemas"));
  const currentSigners = signers();
  const bytes = new Map<string, Buffer>();
  const artifacts: CalibrationEvidenceArtifactReference[] = [];
  for (const [artifactId, artifactPath, mediaType] of CALIBRATION_EVIDENCE_READINESS_ARTIFACT_SPECS) {
    const value = await readFile(path.resolve(artifactPath));
    bytes.set(`${SOURCE_COMMIT}:${artifactPath}`, value);
    artifacts.push({ artifactId, path: artifactPath, sourceCommit: SOURCE_COMMIT, sha256: `sha256:${sha256Bytes(value)}`, sizeBytes: value.byteLength, mediaType });
  }
  const record = createCalibrationEvidenceContractReadiness({
    schemas,
    signer: currentSigners.protocolAuthor,
    value: {
      status: "offline_body_free_terminal_branches_ready_only",
      sourceSnapshot: { sourceCommit: SOURCE_COMMIT, sourceTree: SOURCE_TREE, additionalPushPerformed: false },
      priorBindings: {
        assemblyReadinessId: "cpar-sha256:0ae47c5688fd04d6069ba406cd74b1b050bd94713e36d240fab08f4142470b42",
        assemblyReadinessHash: "sha256:09351930673187bda15eba19d9ff829f62f09dddea68c10d606d1ced157b6a0c",
        assemblyReadinessRawSha256: "sha256:813cf2513bfa0f7faf5fdbec99c3c466fad8c0e1563d5437bc3153428907a2b0",
        assemblyAuditReceiptId: "cparar-sha256:a515ba050d4f158fb4d95148e2049b7aa66ab4c4783996664706f6f3897cdcc2",
        assemblyAuditReceiptHash: "sha256:04968d8313a85d841ef8195f9154a88a205bc37a68e7d1b76dafd378756e1c1e",
        assemblyAuditReceiptRawSha256: "sha256:d066dbf27815443c2a62ebfbaac0b06b157482db4e5e98d24085bf637b2f36a4",
        assemblyEvidenceRulingRawSha256: "sha256:094b31e93575c388a48b7a7f2482a0f7320c2dad0b8323e1eda1a09f93a6931c",
        assemblyEvidenceDecision: "APPROVE",
        priorEvidenceReadinessId: "cecr-sha256:426f217d824d416fbfe49a472a8f1a7fe5a397d9914c5dcf2f498ec96e211c16",
        priorEvidenceReadinessHash: "sha256:1ef20a04ec0d5328def4eda2e988497ed3e2f297ab60905011d2adbfaf351595",
        priorEvidenceReadinessRawSha256: "sha256:03c593cec50b2c446f8d69680df608df914b019945747365f1894134ddfb6830",
        priorEvidenceAuditReceiptId: "cecrar-sha256:1cdee884a76bacd0807117eda24185e554a8d1f7fd09b476f8e681933cb6988f",
        priorEvidenceAuditReceiptHash: "sha256:39bb021229f501d62811744a8c061de7e89fdbebaa4c678da283779c5fbfcfcb",
        priorEvidenceAuditReceiptRawSha256: "sha256:5a13e826e20f30152dfa610256cd81d08a97951fa812db781bb37a73e2392933",
        priorEvidenceRulingRawSha256: "sha256:0e73d97bc113da856a2ddbb0a38cf40022cb4de0032dbaa96ae93fafcf36914c",
        priorEvidenceDecision: "REVISE",
      },
      artifacts,
      contractInventory: CALIBRATION_EVIDENCE_CONTRACT_INVENTORY,
      ownershipMatrix: CALIBRATION_EVIDENCE_OWNERSHIP_MATRIX,
      disclosureMatrix: CALIBRATION_EVIDENCE_DISCLOSURE_MATRIX,
      graphContract: CALIBRATION_EVIDENCE_GRAPH_CONTRACT,
      syntheticCapabilityDescriptor: buildSyntheticCalibrationCapabilityDescriptor(),
      syntheticFixtureContract: CALIBRATION_EVIDENCE_SYNTHETIC_FIXTURE_CONTRACT,
      contractHashes: calibrationEvidenceContractHashes(),
      roleBoundary: boundary(currentSigners),
      actualEvidenceRecords: [],
      actualCapabilities: [],
      researchExecutionBudget: CALIBRATION_EVIDENCE_ZERO_BUDGET,
      authorityState: CALIBRATION_EVIDENCE_AUTHORITY_STATE,
      eligibilityState: CALIBRATION_EVIDENCE_ELIGIBILITY_STATE,
      futureIdentityState: CALIBRATION_EVIDENCE_FUTURE_IDENTITY_STATE,
      forbiddenMaterialAndActions: ["actual_calibration_plan", "actual_calibration_envelope", "capability_issuance_or_consumption", "nonzero_budget", "provider_model_environment_or_price_selection", "credential_or_API_call", "benchmark_vault_task_or_raw_measurement", "sentinel_margin_final_identity_or_O", "attribution_mutation_candidate_promotion_or_deployment"],
      claimBoundary: { closedSchemasImplemented: true, semanticGraphVerifierImplemented: true, publicDevelopmentConformanceOnly: true, calibrationPerformed: false, evidenceAdmitted: false, capabilityIssuedOrConsumed: false, numericValuesFrozen: false, estimatorAdequacyEstablished: false, performanceEvidence: false, fairnessEvidence: false, attributionEvidence: false, securityCertification: false, evolutionClaim: false, selfImprovementClaim: false },
      recordedAt: "2026-08-03T14:00:00.000Z",
    },
  });
  const reader = new MemoryReader(bytes);
  const readinessBytes = Buffer.from(`${canonicalize(record as unknown as JsonValue)}\n`, "utf8");
  const independentVerification = createCalibrationEvidenceIndependentVerification({ readiness: record, readinessBytes, signer: currentSigners.independentVerifier, verifiedAt: "2026-08-03T14:00:01.000Z", verification: { schemaValid: true, signaturesValid: true, sourceBindingsValid: true, assemblyBindingValid: true, priorReviseBindingValid: true, contractsClosedAndBodyFree: true, ownershipAndDisclosureMatricesExact: true, oneWayGraphExact: true, syntheticChainVerified: true, threeTerminalScenariosVerified: true, terminalBranchesMutuallyExclusive: true, e0ToE1CoverageExact: true, e3DispositionBoundToE2: true, e4EligibilityExact: true, roleBoundaryDisjoint: true, capabilityUnissuedAndUnconsumed: true, zeroExecutionBudget: true, actualEvidenceRecordsAbsent: true, finalIdentitiesAbsent: true, oCreationAndActivationAbsent: true, authoritiesGranted: 0 } });
  const receipt = createCalibrationEvidenceReadinessAuditReceipt({
    schemas,
    signer: currentSigners.auditStore,
    readiness: record,
    readinessBytes,
    value: { readinessReference: { readinessId: record.readinessId, readinessHash: record.readinessHash, path: CALIBRATION_EVIDENCE_READINESS_PATH, sourceCommit: SOURCE_COMMIT, sourceTree: SOURCE_TREE, sha256: `sha256:${sha256Bytes(readinessBytes)}`, sizeBytes: readinessBytes.byteLength }, independentVerification, referenceOnly: true, grantsAuthority: false },
  });
  return { schemas, signers: currentSigners, record, reader, readinessBytes, receipt };
}

describe("body-free calibration evidence contracts", () => {
  test("verifies mutually exclusive success, withdrawal, and failure attempts", async () => {
    const schemas = await SchemaRegistry.load(path.resolve("schemas"));
    const current = signers();
    const scenarios = buildSyntheticCalibrationEvidenceScenarios({ signers: current, schemas });
    const results = Object.fromEntries(Object.entries(scenarios).map(([name, records]) => [name, verifySyntheticCalibrationEvidenceChain({ records, capability: buildSyntheticCalibrationCapabilityDescriptor(), roleBoundary: boundary(current), schemas })]));
    assert.deepEqual(
      Object.fromEntries(Object.entries(results).map(([name, result]) => [name, { recordCount: result.recordCount, stageCounts: result.stageCounts, terminalDisposition: result.terminalDisposition, verifiedDisposition: result.verifiedDisposition, e4Eligible: result.e4Eligible, e0ExecutionCoverageCount: result.e0ExecutionCoverageCount, e0UsageCoverageCount: result.e0UsageCoverageCount, orphanE0Count: result.orphanE0Count, reusedE0Count: result.reusedE0Count, unmatchedIncidentCount: result.unmatchedIncidentCount }])),
      {
        success: { recordCount: 9, stageCounts: { E0: 4, E1: 2, E2: 1, E3: 1, E4: 1 }, terminalDisposition: "aggregate_succeeded", verifiedDisposition: "verified_aggregate", e4Eligible: true, e0ExecutionCoverageCount: 2, e0UsageCoverageCount: 2, orphanE0Count: 0, reusedE0Count: 0, unmatchedIncidentCount: 0 },
        withdrawal: { recordCount: 12, stageCounts: { E0: 6, E1: 4, E2: 1, E3: 1, E4: 0 }, terminalDisposition: "calibration_withdrawn", verifiedDisposition: "verified_withdrawal", e4Eligible: false, e0ExecutionCoverageCount: 2, e0UsageCoverageCount: 2, orphanE0Count: 0, reusedE0Count: 0, unmatchedIncidentCount: 0 },
        failure: { recordCount: 9, stageCounts: { E0: 4, E1: 2, E2: 2, E3: 1, E4: 0 }, terminalDisposition: "calibration_failed", verifiedDisposition: "verified_failure", e4Eligible: false, e0ExecutionCoverageCount: 2, e0UsageCoverageCount: 2, orphanE0Count: 0, reusedE0Count: 0, unmatchedIncidentCount: 0 },
      },
    );
  });

  test("rejects valid signatures from wrong creators and combined or wrapped records", async () => {
    const schemas = await SchemaRegistry.load(path.resolve("schemas"));
    const current = signers();
    const records = buildSyntheticCalibrationEvidenceChain({ signers: current, schemas });
    const execution = records.find((record) => record.recordType === "CalibrationExecutionReceipt")!;
    const wrong = cryptographicallyResignRecord({ base: execution, signer: current.calibrationEvaluator });
    assert.throws(() => verifySyntheticCalibrationEvidenceChain({ records: replaceByOriginalId(records, execution, wrong), capability: buildSyntheticCalibrationCapabilityDescriptor(), roleBoundary: boundary(current), schemas }));
    const combined = cryptographicallyResignRecord({ base: execution, signer: current.calibrationExecutor, mutate: (value) => { value.payload.measurementPayload = { normalizedMeasurementCommitment: "x" }; } });
    assert.throws(() => verifySyntheticCalibrationEvidenceChain({ records: replaceByOriginalId(records, execution, combined), capability: buildSyntheticCalibrationCapabilityDescriptor(), roleBoundary: boundary(current), schemas }));
    const wrapped = cryptographicallyResignRecord({ base: execution, signer: current.calibrationExecutor, mutate: (value) => { value.creationMode.wrapped = true; } });
    assert.throws(() => verifySyntheticCalibrationEvidenceChain({ records: replaceByOriginalId(records, execution, wrapped), capability: buildSyntheticCalibrationCapabilityDescriptor(), roleBoundary: boundary(current), schemas }));
  });

  test("rejects evaluator/scorer identity collapse, delegation, proxy, alias, and cosign", async () => {
    const schemas = await SchemaRegistry.load(path.resolve("schemas"));
    const current = signers();
    const records = buildSyntheticCalibrationEvidenceChain({ signers: current, schemas });
    for (const mutate of [
      (value: any) => { value.calibrationScorer.publicPrincipal = value.calibrationEvaluator.publicPrincipal; },
      (value: any) => { value.calibrationEvaluator.delegatedCapabilityIds.push("delegate"); },
      (value: any) => { value.calibrationScorer.proxyPrincipalIds.push("proxy"); },
      (value: any) => { value.protocolAuthor.roleAliases.push("calibration_evaluator"); },
      (value: any) => { value.independentVerifier.cosignerKeyIds.push("cosigner"); },
    ]) {
      const changed: any = structuredClone(boundary(current));
      mutate(changed);
      assert.throws(() => verifySyntheticCalibrationEvidenceChain({ records, capability: buildSyntheticCalibrationCapabilityDescriptor(), roleBoundary: changed, schemas }));
    }
  });

  test("rejects executor-to-scorer and evaluator-to-author bypass edges", async () => {
    const schemas = await SchemaRegistry.load(path.resolve("schemas"));
    const current = signers();
    const records = buildSyntheticCalibrationEvidenceChain({ signers: current, schemas });
    const execution = records.find((record) => record.recordType === "CalibrationExecutionReceipt")!;
    const aggregate = records.find((record) => record.recordType === "AggregateCalibrationCommitment")!;
    const bypass = cryptographicallyResignRecord({ base: aggregate, signer: current.calibrationScorer, mutate: (value) => { value.dependencies = [{ evidenceRecordId: execution.evidenceRecordId, evidenceRecordHash: execution.evidenceRecordHash, stage: execution.stage, recordType: execution.recordType }]; } });
    assert.throws(() => verifySyntheticCalibrationEvidenceChain({ records: replaceByOriginalId(records, aggregate, bypass), capability: buildSyntheticCalibrationCapabilityDescriptor(), roleBoundary: boundary(current), schemas }));
    const measurement = records.find((record) => record.recordType === "CalibrationMeasurementCommitment")!;
    const proposal = records.find((record) => record.recordType === "ProtocolAuthorDerivedValueProposal")!;
    const direct = cryptographicallyResignRecord({ base: proposal, signer: current.protocolAuthor, mutate: (value) => { value.dependencies = [{ evidenceRecordId: measurement.evidenceRecordId, evidenceRecordHash: measurement.evidenceRecordHash, stage: measurement.stage, recordType: measurement.recordType }]; } });
    assert.throws(() => verifySyntheticCalibrationEvidenceChain({ records: replaceByOriginalId(records, proposal, direct), capability: buildSyntheticCalibrationCapabilityDescriptor(), roleBoundary: boundary(current), schemas }));
  });

  test("rejects missing or reordered stages and duplicate or omitted strata", async () => {
    const schemas = await SchemaRegistry.load(path.resolve("schemas"));
    const current = signers();
    const records = buildSyntheticCalibrationEvidenceChain({ signers: current, schemas });
    assert.throws(() => verifySyntheticCalibrationEvidenceChain({ records: records.filter((record) => record.stage !== "E3"), capability: buildSyntheticCalibrationCapabilityDescriptor(), roleBoundary: boundary(current), schemas }));
    assert.throws(() => verifySyntheticCalibrationEvidenceChain({ records: [records.at(-1)!, ...records.slice(0, -1)], capability: buildSyntheticCalibrationCapabilityDescriptor(), roleBoundary: boundary(current), schemas }));
    const aggregate = records.find((record) => record.recordType === "AggregateCalibrationCommitment")!;
    const duplicate = cryptographicallyResignRecord({ base: aggregate, signer: current.calibrationScorer, mutate: (value) => { value.payload.observedStrata[1] = structuredClone(value.payload.observedStrata[0]); } });
    assert.throws(() => verifySyntheticCalibrationEvidenceChain({ records: replaceByOriginalId(records, aggregate, duplicate), capability: buildSyntheticCalibrationCapabilityDescriptor(), roleBoundary: boundary(current), schemas }));
    const omitted = cryptographicallyResignRecord({ base: aggregate, signer: current.calibrationScorer, mutate: (value) => { value.payload.observedStrata.pop(); } });
    assert.throws(() => verifySyntheticCalibrationEvidenceChain({ records: replaceByOriginalId(records, aggregate, omitted), capability: buildSyntheticCalibrationCapabilityDescriptor(), roleBoundary: boundary(current), schemas }));
  });

  test("rejects the twelve validly re-signed terminal and E0-accounting attacks", async () => {
    const schemas = await SchemaRegistry.load(path.resolve("schemas"));
    const current = signers();
    const scenarios = buildSyntheticCalibrationEvidenceScenarios({ signers: current, schemas });
    const capability = buildSyntheticCalibrationCapabilityDescriptor();
    const verifyRejects = (label: string, records: readonly CalibrationEvidenceRecord[]) => {
      assert.throws(
        () => verifySyntheticCalibrationEvidenceChain({ records, capability, roleBoundary: boundary(current), schemas }),
        label,
      );
    };

    const successAggregate = scenarios.success.find((record) => record.recordType === "AggregateCalibrationCommitment")!;
    const successVerification = scenarios.success.find((record) => record.recordType === "CalibrationVerificationReceipt")!;
    const successE1 = scenarios.success.filter((record) => record.stage === "E1");
    const withdrawalBase = scenarios.withdrawal.find((record) => record.recordType === "CalibrationWithdrawalRecord")!;
    const injectedWithdrawal = cryptographicallyResignRecord({
      base: withdrawalBase,
      signer: current.calibrationScorer,
      mutate: (value) => {
        value.attemptCommitment = successAggregate.attemptCommitment;
        value.dependencies = successE1.map((record) => ({ evidenceRecordId: record.evidenceRecordId, evidenceRecordHash: record.evidenceRecordHash, stage: record.stage, recordType: record.recordType }));
      },
    });
    verifyRejects("aggregate+withdrawal", insertBeforeStage(scenarios.success, "E3", injectedWithdrawal));

    const scorerFailureBase = scenarios.failure.find((record) => record.recordType === "CalibrationScorerFailureRecord")!;
    const injectedFailure = cryptographicallyResignRecord({
      base: scorerFailureBase,
      signer: current.calibrationScorer,
      mutate: (value) => {
        value.attemptCommitment = successAggregate.attemptCommitment;
        value.dependencies = [{ evidenceRecordId: successE1[0]!.evidenceRecordId, evidenceRecordHash: successE1[0]!.evidenceRecordHash, stage: successE1[0]!.stage, recordType: successE1[0]!.recordType }];
      },
    });
    verifyRejects("aggregate+scorer failure", insertBeforeStage(scenarios.success, "E3", injectedFailure));

    const successProposal = scenarios.success.find((record) => record.recordType === "ProtocolAuthorDerivedValueProposal")!;
    const withdrawalVerification = scenarios.withdrawal.find((record) => record.recordType === "CalibrationVerificationReceipt")!;
    const e4AfterWithdrawal = cryptographicallyResignRecord({ base: successProposal, signer: current.protocolAuthor, mutate: (value) => {
      value.attemptCommitment = withdrawalVerification.attemptCommitment;
      value.dependencies = [{ evidenceRecordId: withdrawalVerification.evidenceRecordId, evidenceRecordHash: withdrawalVerification.evidenceRecordHash, stage: withdrawalVerification.stage, recordType: withdrawalVerification.recordType }];
      value.payload.verificationReceiptId = withdrawalVerification.evidenceRecordId;
    } });
    verifyRejects("E4 after verified withdrawal", [...scenarios.withdrawal, e4AfterWithdrawal]);

    const failureVerification = scenarios.failure.find((record) => record.recordType === "CalibrationVerificationReceipt")!;
    const e4AfterFailure = cryptographicallyResignRecord({ base: successProposal, signer: current.protocolAuthor, mutate: (value) => {
      value.attemptCommitment = failureVerification.attemptCommitment;
      value.dependencies = [{ evidenceRecordId: failureVerification.evidenceRecordId, evidenceRecordHash: failureVerification.evidenceRecordHash, stage: failureVerification.stage, recordType: failureVerification.recordType }];
      value.payload.verificationReceiptId = failureVerification.evidenceRecordId;
    } });
    verifyRejects("E4 after verified failure", [...scenarios.failure, e4AfterFailure]);

    const successMeasurements = scenarios.success.filter((record) => record.recordType === "CalibrationMeasurementCommitment");
    const missingSuccess = cryptographicallyResignRecord({ base: successMeasurements[1]!, signer: current.calibrationEvaluator, mutate: (value) => { value.payload.missingnessState = "missing_declared"; } });
    verifyRejects("successful aggregate with missing_declared", replaceByOriginalId(scenarios.success, successMeasurements[1]!, missingSuccess));

    const evaluatorFailureBase = scenarios.withdrawal.find((record) => record.recordType === "CalibrationEvaluatorFailureRecord")!;
    const successExecution = scenarios.success.find((record) => record.recordType === "CalibrationExecutionReceipt")!;
    const injectedEvaluatorFailure = cryptographicallyResignRecord({ base: evaluatorFailureBase, signer: current.calibrationEvaluator, mutate: (value) => {
      value.attemptCommitment = successAggregate.attemptCommitment;
      value.dependencies = [{ evidenceRecordId: successExecution.evidenceRecordId, evidenceRecordHash: successExecution.evidenceRecordHash, stage: successExecution.stage, recordType: successExecution.recordType }];
      value.payload.stratumCommitment = (successExecution.payload as any).stratumCommitment;
    } });
    verifyRejects("success with evaluator failure", insertBeforeStage(scenarios.success, "E2", injectedEvaluatorFailure));

    const orphanExecution = cryptographicallyResignRecord({ base: successExecution, signer: current.calibrationExecutor, mutate: (value) => { value.payload.executionCommitment = `sha256:${"1".repeat(64)}`; } });
    verifyRejects("orphan E0 execution", insertBeforeStage(scenarios.success, "E1", orphanExecution));

    const successUsage = scenarios.success.find((record) => record.recordType === "CalibrationUsageReceipt")!;
    const orphanUsage = cryptographicallyResignRecord({ base: successUsage, signer: current.calibrationExecutor, mutate: (value) => { value.payload.usageCommitment = `sha256:${"2".repeat(64)}`; } });
    verifyRejects("orphan E0 usage", insertBeforeStage(scenarios.success, "E1", orphanUsage));

    const alphaExecution = scenarios.success.find((record) => record.recordType === "CalibrationExecutionReceipt" && (record.payload as any).stratumCommitment === capability.expectedStrataCommitments[0])!;
    const reusedExecution = cryptographicallyResignRecord({ base: successMeasurements[1]!, signer: current.calibrationEvaluator, mutate: (value) => {
      value.dependencies[0] = { evidenceRecordId: alphaExecution.evidenceRecordId, evidenceRecordHash: alphaExecution.evidenceRecordHash, stage: alphaExecution.stage, recordType: alphaExecution.recordType };
      value.payload.executionReceiptId = alphaExecution.evidenceRecordId;
    } });
    verifyRejects("one E0 reused by incompatible E1", replaceByOriginalId(scenarios.success, successMeasurements[1]!, reusedExecution));

    const noUsage = cryptographicallyResignRecord({ base: successMeasurements[0]!, signer: current.calibrationEvaluator, mutate: (value) => { value.dependencies = value.dependencies.filter((dependency: any) => dependency.recordType !== "CalibrationUsageReceipt"); } });
    verifyRejects("E1 measurement execution without usage", replaceByOriginalId(scenarios.success, successMeasurements[0]!, noUsage));

    const stratumMismatch = cryptographicallyResignRecord({ base: successMeasurements[0]!, signer: current.calibrationEvaluator, mutate: (value) => { value.payload.stratumCommitment = `sha256:${"3".repeat(64)}`; } });
    verifyRejects("E0/E1 stratum mismatch", replaceByOriginalId(scenarios.success, successMeasurements[0]!, stratumMismatch));

    const mismatchedE3 = cryptographicallyResignRecord({ base: withdrawalVerification, signer: current.independentVerifier, mutate: (value) => {
      value.payload.disposition = "verified_aggregate";
      value.payload.aggregateRecordId = successAggregate.evidenceRecordId;
      value.payload.withdrawalRecordId = null;
      value.payload.aggregateVerified = true;
      value.payload.e4Eligible = true;
    } });
    verifyRejects("E3 success disposition mismatches terminal E2", replaceByOriginalId(scenarios.withdrawal, withdrawalVerification, mismatchedE3));
  });

  test("rejects post-result grid substitution", async () => {
    const schemas = await SchemaRegistry.load(path.resolve("schemas"));
    const current = signers();
    const records = buildSyntheticCalibrationEvidenceChain({ signers: current, schemas });
    const aggregate = records.find((record) => record.recordType === "AggregateCalibrationCommitment")!;
    for (const mutate of [(value: any) => { value.payload.gridCommitment = `sha256:${"a".repeat(64)}`; }]) {
      const changed = cryptographicallyResignRecord({ base: aggregate, signer: current.calibrationScorer, mutate });
      assert.throws(() => verifySyntheticCalibrationEvidenceChain({ records: replaceByOriginalId(records, aggregate, changed), capability: buildSyntheticCalibrationCapabilityDescriptor(), roleBoundary: boundary(current), schemas }));
    }
  });

  test("rejects scorer raw/protected access and evaluator direct author release", async () => {
    const schemas = await SchemaRegistry.load(path.resolve("schemas"));
    const current = signers();
    const scenarios = buildSyntheticCalibrationEvidenceScenarios({ signers: current, schemas });
    const scorerFailure = scenarios.failure.find((record) => record.recordType === "CalibrationScorerFailureRecord")!;
    for (const key of ["rawEvaluatorInputPresent", "protectedDataAccessed"]) {
      const changed = cryptographicallyResignRecord({ base: scorerFailure, signer: current.calibrationScorer, mutate: (value) => { value.payload[key] = true; } });
      assert.throws(() => verifySyntheticCalibrationEvidenceChain({ records: replaceByOriginalId(scenarios.failure, scorerFailure, changed), capability: buildSyntheticCalibrationCapabilityDescriptor(), roleBoundary: boundary(current), schemas }));
    }
    const evaluatorFailure = scenarios.withdrawal.find((record) => record.recordType === "CalibrationEvaluatorFailureRecord")!;
    const release = cryptographicallyResignRecord({ base: evaluatorFailure, signer: current.calibrationEvaluator, mutate: (value) => { value.payload.directProtocolAuthorRelease = true; } });
    assert.throws(() => verifySyntheticCalibrationEvidenceChain({ records: replaceByOriginalId(scenarios.withdrawal, evaluatorFailure, release), capability: buildSyntheticCalibrationCapabilityDescriptor(), roleBoundary: boundary(current), schemas }));
  });

  test("rejects unverified aggregates, eligibility escalation, nonzero budgets, final IDs, and O", async () => {
    const schemas = await SchemaRegistry.load(path.resolve("schemas"));
    const current = signers();
    const records = buildSyntheticCalibrationEvidenceChain({ signers: current, schemas });
    const proposal = records.find((record) => record.recordType === "ProtocolAuthorDerivedValueProposal")!;
    for (const mutate of [
      (value: any) => { value.payload.aggregateRecordId = `acc-sha256:${"b".repeat(64)}`; },
      (value: any) => { value.disposition.admissibleAsCalibrationEvidence = true; },
      (value: any) => { value.budget.providerModelRequestAttempts = 1; },
      (value: any) => { value.payload.finalProtocolId = `protocol-sha256:${"c".repeat(64)}`; },
      (value: any) => { value.payload.oProposalId = `proposal-sha256:${"d".repeat(64)}`; },
      (value: any) => { value.payload.oActivationId = `activation-sha256:${"e".repeat(64)}`; },
      (value: any) => { value.payload.grantsAuthority = true; },
    ]) {
      const changed = cryptographicallyResignRecord({ base: proposal, signer: current.protocolAuthor, mutate });
      assert.throws(() => verifySyntheticCalibrationEvidenceChain({ records: replaceByOriginalId(records, proposal, changed), capability: buildSyntheticCalibrationCapabilityDescriptor(), roleBoundary: boundary(current), schemas }));
    }
  });

  test("rejects capability issuance, consumption, handles, replay, and execution authority", async () => {
    const schemas = await SchemaRegistry.load(path.resolve("schemas"));
    const current = signers();
    const records = buildSyntheticCalibrationEvidenceChain({ signers: current, schemas });
    for (const mutate of [
      (value: any) => { value.lifecycle.issued = true; },
      (value: any) => { value.lifecycle.consumed = true; },
      (value: any) => { value.lifecycle.handle = "real-handle"; },
      (value: any) => { value.lifecycle.executionAuthorized = true; },
      (value: any) => { value.replay.observedConsumptionCount = 1; },
    ]) {
      const capability: any = structuredClone(buildSyntheticCalibrationCapabilityDescriptor());
      mutate(capability);
      assert.throws(() => verifySyntheticCalibrationEvidenceChain({ records, capability, roleBoundary: boundary(current), schemas }));
    }
  });
});

describe("calibration evidence readiness sealing contract", () => {
  test("verifies source bindings, assembly lineage, and reference-only receipt", async () => {
    const current = await readinessFixture();
    const result = await verifyCalibrationEvidenceContractReadinessAgainstArtifacts({ record: current.record, schemas: current.schemas, reader: current.reader });
    assert.deepEqual(result, { artifactCount: 21, contractRecordTypeCount: 13, evidenceStageCount: 5, syntheticScenarioCount: 3, syntheticFixtureRecordCount: 30, syntheticExpectedStratumCount: 2, unresolvedObligationCount: 7, actualEvidenceRecords: 0, issuedCapabilities: 0, consumedCapabilities: 0, providerModelRequestAttempts: 0, protectedDataAccesses: 0, finalIdentitiesAllocated: 0, oProposals: 0, oActivations: 0, authoritiesGranted: 0 });
    verifyCalibrationEvidenceReadinessAuditReceiptIndependent({ receipt: current.receipt, readiness: current.record, readinessBytes: current.readinessBytes, schemas: current.schemas });
  });

  test("rejects validly re-signed readiness escalation and role collapse", async () => {
    const current = await readinessFixture();
    for (const mutate of [
      (value: any) => { value.syntheticCapabilityDescriptor.lifecycle.issued = true; },
      (value: any) => { value.researchExecutionBudget.providerModelRequestAttempts = 1; },
      (value: any) => { value.actualEvidenceRecords.push({ recordType: "CalibrationExecutionReceipt" }); },
      (value: any) => { value.futureIdentityState.finalProtocolId = `protocol-sha256:${"a".repeat(64)}`; },
      (value: any) => { value.futureIdentityState.oProposalId = `proposal-sha256:${"b".repeat(64)}`; },
      (value: any) => { value.authorityState.calibrationExecutionAuthorized = true; },
      (value: any) => { value.eligibilityState.authorizedForResearchEvidence = true; },
      (value: any) => { value.roleBoundary.calibrationScorer.publicPrincipal = value.roleBoundary.calibrationEvaluator.publicPrincipal; },
    ]) {
      const changed = validlyResignReadiness(current.record, mutate);
      await assert.rejects(verifyCalibrationEvidenceContractReadinessAgainstArtifacts({ record: changed, schemas: current.schemas, reader: current.reader }));
    }
  });

  test("rejects a valid wrong-role readiness signature and artifact substitution", async () => {
    const current = await readinessFixture();
    const wrongRole = validlyResignReadiness(current.record, () => undefined, "operations_owner");
    await assert.rejects(verifyCalibrationEvidenceContractReadinessAgainstArtifacts({ record: wrongRole, schemas: current.schemas, reader: current.reader }));
    const changed = validlyResignReadiness(current.record, (value) => { value.artifacts[0].sha256 = `sha256:${"f".repeat(64)}`; });
    await assert.rejects(verifyCalibrationEvidenceContractReadinessAgainstArtifacts({ record: changed, schemas: current.schemas, reader: current.reader }));
  });

  test("rejects readiness-byte substitution under both nested and outer signatures", async () => {
    const current = await readinessFixture();
    const substituted = Buffer.from(current.readinessBytes);
    substituted[0] = substituted[0] === 0x7b ? 0x5b : 0x7b;
    assert.throws(() => verifyCalibrationEvidenceReadinessAuditReceiptIndependent({ receipt: current.receipt, readiness: current.record, readinessBytes: substituted, schemas: current.schemas }));
  });
});
