import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, test } from "node:test";

import {
  CALIBRATION_ARITHMETIC_PORTABILITY_CONTRACT,
  CALIBRATION_ASSEMBLY_COMPLETENESS_RULE,
  CALIBRATION_FREEZE_ADMISSION_FIREWALL,
  CALIBRATION_FUTURE_CANDIDATE_GRID_SCHEMAS,
  CALIBRATION_PLAN_ASSEMBLY_ARTIFACT_SPECS,
  CALIBRATION_PLAN_ASSEMBLY_AUTHORITY_STATE,
  CALIBRATION_PLAN_ASSEMBLY_ELIGIBILITY_STATE,
  CALIBRATION_PLAN_ASSEMBLY_READINESS_PATH,
  CALIBRATION_PLAN_ASSEMBLY_ZERO_BUDGET,
  PrincipalRegistry,
  PythonCalibrationPortabilityReferenceExecutor,
  SchemaRegistry,
  assessCalibrationFreezeAdmission,
  buildCalibrationFieldEvidenceMap,
  buildCalibrationPortabilityGoldenVectors,
  canonicalBytes,
  canonicalize,
  createCalibrationPlanAssemblyAuditReceipt,
  createCalibrationPlanAssemblyIndependentVerification,
  createCalibrationPlanAssemblyReadiness,
  parseStrictJson,
  sha256,
  sha256Bytes,
  verifyCalibrationPlanAssemblyAuditReceiptIndependent,
  verifyCalibrationPlanAssemblyReadinessAgainstArtifacts,
  type CalibrationFreezeAdmissionProbe,
  type CalibrationPlanAssemblyArtifactReader,
  type CalibrationPlanAssemblyArtifactReference,
  type CalibrationPlanAssemblyAuditReceipt,
  type CalibrationPlanAssemblyReadiness,
  type JsonValue,
  type PrincipalRole,
  type UnsignedCalibrationPlanAssemblyReadiness,
} from "../src/index.js";
import { deterministicPrincipal } from "./helpers/deterministic-principal.js";

const SOURCE_COMMIT = "c".repeat(40);
const SOURCE_TREE = "d".repeat(40);

class MemoryReader implements CalibrationPlanAssemblyArtifactReader {
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
  readonly record: CalibrationPlanAssemblyReadiness;
  readonly reader: MemoryReader;
  readonly portabilityReference: PythonCalibrationPortabilityReferenceExecutor;
  readonly readinessBytes: Buffer;
  readonly receipt: CalibrationPlanAssemblyAuditReceipt;
}

function principal(input: {
  readonly role: "protocol_author" | "independent_verifier" | "audit_store";
  readonly label: string;
  readonly seedByte: number;
}) {
  return deterministicPrincipal({
    principalId: `${input.role}.calibration-plan-assembly.${input.label}`,
    role: input.role,
    implementationDigest: `sha256:${input.seedByte.toString(16).padStart(2, "0").repeat(32)}`,
    instanceId: `${input.role}.calibration-plan-assembly.${input.label}.instance`,
    seedByte: input.seedByte,
  });
}

function unsignedOf(record: CalibrationPlanAssemblyReadiness): UnsignedCalibrationPlanAssemblyReadiness {
  const {
    schemaVersion: _schemaVersion,
    hashDomain: _hashDomain,
    assemblyReadinessId: _id,
    recordType: _recordType,
    recordedBy: _recordedBy,
    assemblyReadinessHash: _hash,
    publicPrincipal: _principal,
    attestation: _attestation,
    ...unsigned
  } = record;
  return unsigned;
}

function validlyResign(
  base: CalibrationPlanAssemblyReadiness,
  mutate: (value: any) => void,
  role: PrincipalRole = "protocol_author",
): CalibrationPlanAssemblyReadiness {
  const value: any = structuredClone(unsignedOf(base));
  const signer = deterministicPrincipal({
    principalId: `principal.calibration-plan-assembly.resign.${role}`,
    role,
    implementationDigest: `sha256:${"8".repeat(64)}`,
    instanceId: `principal.calibration-plan-assembly.resign.${role}.instance`,
    seedByte: role === "protocol_author" ? 224 : 225,
  });
  value.roleBoundary.protocolAuthor.publicPrincipal = signer.exportPublic();
  mutate(value);
  const assemblyReadinessId = `cpar-sha256:${sha256Bytes(canonicalBytes({
    hashDomain: "CalibrationPlanAssemblyReadiness.v1",
    ...value,
  }))}`;
  const core = {
    schemaVersion: 1 as const,
    hashDomain: "CalibrationPlanAssemblyReadiness.v1" as const,
    assemblyReadinessId,
    recordType: "calibration_plan_assembly_readiness" as const,
    ...value,
    recordedBy: signer.identity,
  };
  const body = {
    ...core,
    assemblyReadinessHash: sha256(core as unknown as JsonValue),
    publicPrincipal: signer.exportPublic(),
  };
  const record = {
    ...body,
    attestation: signer.attest(body as unknown as JsonValue),
  } as CalibrationPlanAssemblyReadiness;
  const registry = new PrincipalRegistry();
  registry.register(signer.exportPublic());
  registry.verify(signer.identity, body as unknown as JsonValue, record.attestation);
  return record;
}

async function fixture(): Promise<Fixture> {
  const schemas = await SchemaRegistry.load(path.resolve("schemas"));
  const bytes = new Map<string, Buffer>();
  const artifacts: CalibrationPlanAssemblyArtifactReference[] = [];
  for (const [artifactId, artifactPath, mediaType] of CALIBRATION_PLAN_ASSEMBLY_ARTIFACT_SPECS) {
    const value = await readFile(path.resolve(artifactPath));
    bytes.set(`${SOURCE_COMMIT}:${artifactPath}`, value);
    artifacts.push({
      artifactId,
      path: artifactPath,
      sourceCommit: SOURCE_COMMIT,
      sha256: `sha256:${sha256Bytes(value)}`,
      sizeBytes: value.byteLength,
      mediaType,
    });
  }
  const derivation = parseStrictJson(
    bytes.get(`${SOURCE_COMMIT}:governance/gate3/calibration-derivation-program-readiness.json`)!.toString("utf8"),
  ) as any;
  const programBindings = derivation.programDefinitions.map((definition: any) => ({
    target: definition.target,
    programId: definition.programId,
    sourceSha256: definition.sourceSha256,
  }));
  const author = principal({ role: "protocol_author", label: "test", seedByte: 221 });
  const verifier = principal({ role: "independent_verifier", label: "test", seedByte: 222 });
  const audit = principal({ role: "audit_store", label: "test", seedByte: 223 });
  const record = createCalibrationPlanAssemblyReadiness({
    schemas,
    signer: author,
    value: {
      status: "offline_mapping_and_firewall_ready_only",
      zeroExecution: true,
      calibrationPlanCreated: false,
      sourceSnapshot: { sourceCommit: SOURCE_COMMIT, sourceTree: SOURCE_TREE, additionalPushPerformed: false },
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
      mappingSummary: { pendingSentinelPathCount: 25, statisticalMarginGroupCount: 1, mappingCount: 26, effectiveExpandedOutputCount: 136, valuesSupplied: 0, futureEvidenceReferencesSupplied: 0 },
      freezeAdmissionFirewall: CALIBRATION_FREEZE_ADMISSION_FIREWALL,
      futureCandidateGridSchemas: CALIBRATION_FUTURE_CANDIDATE_GRID_SCHEMAS,
      actualCandidateGridInstances: [],
      arithmeticPortabilityContract: CALIBRATION_ARITHMETIC_PORTABILITY_CONTRACT,
      portabilityGoldenVectors: buildCalibrationPortabilityGoldenVectors(),
      assemblyCompletenessRule: CALIBRATION_ASSEMBLY_COMPLETENESS_RULE,
      roleBoundary: {
        protocolAuthor: { role: "protocol_author", publicPrincipal: author.exportPublic(), processIdentity: "process.calibration-plan-assembly-readiness.protocol-author.v1", currentCapabilityHandles: [], delegatedCapabilityIds: [], roleAliases: [] },
        independentVerifier: { role: "independent_verifier", publicPrincipal: verifier.exportPublic(), processIdentity: "process.calibration-plan-assembly-readiness.independent-verifier.v1", currentCapabilityHandles: [], delegatedCapabilityIds: [], roleAliases: [] },
        auditStore: { role: "audit_store", publicPrincipal: audit.exportPublic(), processIdentity: "process.calibration-plan-assembly-readiness.audit-store.v1", currentCapabilityHandles: [], delegatedCapabilityIds: [], roleAliases: [] },
        requiredInequalities: ["principalId", "instanceId", "keyId", "publicKeyDigest", "processIdentity"],
        aliasingDelegationCosigningProxyingForbidden: true,
      },
      researchExecutionBudget: CALIBRATION_PLAN_ASSEMBLY_ZERO_BUDGET,
      authorityState: CALIBRATION_PLAN_ASSEMBLY_AUTHORITY_STATE,
      eligibilityState: CALIBRATION_PLAN_ASSEMBLY_ELIGIBILITY_STATE,
      futureIdentityState: { finalProtocolId: null, budgetFreezeId: null, calibrationPlanManifestId: null, calibrationEnvelopeId: null, selectedProtocolValueSetId: null },
      forbiddenRecordTypes: ["CalibrationPlanManifest", "calibration_envelope", "ProtocolManifest", "BudgetFreezeManifest", "O_proposal", "O_activation"],
      claimBoundary: { mappingAndFirewallImplemented: true, arithmeticPortabilityConformanceOnly: true, calibrationPerformed: false, calibrationPlanAdmissible: false, numericValuesFrozen: false, estimatorAdequacyEstablished: false, performanceEvidence: false, fairnessEvidence: false, attributionEvidence: false, securityCertification: false, evolutionClaim: false, selfImprovementClaim: false },
      recordedAt: "2026-08-03T00:00:00.000Z",
    },
  });
  const portabilityReference = new PythonCalibrationPortabilityReferenceExecutor();
  const reader = new MemoryReader(bytes);
  const readinessBytes = Buffer.from(`${canonicalize(record as unknown as JsonValue)}\n`, "utf8");
  const verification = createCalibrationPlanAssemblyIndependentVerification({
    readiness: record,
    readinessBytes,
    signer: verifier,
    verifiedAt: "2026-08-03T00:00:01.000Z",
    verification: { schemaValid: true, signaturesValid: true, sourceBindingsValid: true, priorBindingsValid: true, programBindingsExact: true, fieldEvidenceMapCompleteAndValueFree: true, freezeAdmissionFirewallExact: true, futureGridSchemasValueFree: true, portabilityContractExact: true, crossImplementationGoldenVectorsMatch: true, rolesDisjoint: true, zeroExecutionBudget: true, finalIdentitiesAbsent: true, oCreationAbsent: true, authoritiesGranted: 0 },
  });
  const receipt = createCalibrationPlanAssemblyAuditReceipt({
    schemas,
    signer: audit,
    readiness: record,
    readinessBytes,
    value: {
      readinessReference: { assemblyReadinessId: record.assemblyReadinessId, assemblyReadinessHash: record.assemblyReadinessHash, path: CALIBRATION_PLAN_ASSEMBLY_READINESS_PATH, sourceCommit: SOURCE_COMMIT, sourceTree: SOURCE_TREE, sha256: `sha256:${sha256Bytes(readinessBytes)}`, sizeBytes: readinessBytes.byteLength },
      independentVerification: verification,
      referenceOnly: true,
      grantsAuthority: false,
    },
  });
  return { schemas, record, reader, portabilityReference, readinessBytes, receipt };
}

function completeProbe(): CalibrationFreezeAdmissionProbe {
  const fieldEvidence = buildCalibrationFieldEvidenceMap().map((mapping) => ({
    fieldPath: mapping.fieldPath,
    dependencyGraphNode: mapping.dependencyGraphNode,
    dependencyResolved: true,
    recordType: mapping.requiredFutureRecordType,
    producerRole: mapping.requiredProducerRole,
    verifierReceipt: mapping.requiredVerifierReceipt,
    evidenceVerified: true,
    sourceClass: mapping.admissibleSourceClass,
    syntheticConformanceAncestry: false,
    publicDevelopmentAncestry: false,
    providerSmokeAncestry: false,
    publicFixtureAncestry: false,
    protectedDataDirectAncestry: false,
    directEvaluatorOrScorerValue: false,
  }));
  return {
    fieldEvidence,
    resolvedNodes: ["B", "C", "F", "G", "H", "J", "K", "L", "M", "N"],
    verifiedEvidenceStages: ["E1", "E2", "E4"],
    hiddenDefaultsPresent: false,
    sentinelInterpretedAsValue: false,
    candidateGridValuesPresent: false,
    finalProtocolId: null,
    budgetFreezeId: null,
    calibrationPlanManifestId: null,
    calibrationEnvelopeId: null,
    executionAuthorityCount: 0,
    requestOProposalCreation: false,
    requestOActivation: false,
  };
}

describe("calibration plan assembly readiness", () => {
  test("TypeScript and independent Python portability vectors are byte-identical", async () => {
    const source = await readFile(path.resolve("scripts/calibration-portability-reference.py"));
    const reference = await new PythonCalibrationPortabilityReferenceExecutor().evaluate(source);
    assert.equal(canonicalize(reference), canonicalize(buildCalibrationPortabilityGoldenVectors()));
  });

  test("freeze firewall recognizes complete metadata but never creates O", () => {
    const assessment = assessCalibrationFreezeAdmission(completeProbe());
    assert.deepEqual(assessment, {
      completenessSatisfied: true,
      futureOProposalPreconditionsMet: true,
      rejectionCodes: [],
      oProposalCreated: false,
      oActivationPerformed: false,
      authorityGranted: false,
    });
  });

  test("freeze firewall rejects every prohibited admission class", () => {
    const attacks: readonly [string, (probe: any) => void][] = [
      ["field_set_incomplete_or_duplicate", (probe) => probe.fieldEvidence.pop()],
      ["mapping_contract_mismatch", (probe) => { probe.fieldEvidence[0].producerRole = "calibration_scorer"; }],
      ["dependency_unresolved", (probe) => { probe.fieldEvidence[0].dependencyResolved = false; }],
      ["evidence_unverified", (probe) => { probe.fieldEvidence[0].evidenceVerified = false; }],
      ["E1_E2_or_E4_unverified", (probe) => { probe.verifiedEvidenceStages = ["E1", "E2"]; }],
      ["synthetic_or_public_development_source", (probe) => { probe.fieldEvidence[0].syntheticConformanceAncestry = true; }],
      ["provider_smoke_public_fixture_or_protected_ancestry", (probe) => { probe.fieldEvidence[0].protectedDataDirectAncestry = true; }],
      ["direct_evaluator_or_scorer_input", (probe) => { probe.fieldEvidence[0].directEvaluatorOrScorerValue = true; }],
      ["sentinel_interpreted_as_value", (probe) => { probe.sentinelInterpretedAsValue = true; }],
      ["hidden_default_present", (probe) => { probe.hiddenDefaultsPresent = true; }],
      ["candidate_grid_value_present", (probe) => { probe.candidateGridValuesPresent = true; }],
      ["premature_final_identity", (probe) => { probe.finalProtocolId = "protocol-premature"; }],
      ["nonzero_execution_authority", (probe) => { probe.executionAuthorityCount = 1; }],
      ["O_creation_or_activation_requested", (probe) => { probe.requestOProposalCreation = true; }],
    ];
    for (const [expected, mutate] of attacks) {
      const probe: any = structuredClone(completeProbe());
      mutate(probe);
      const assessment = assessCalibrationFreezeAdmission(probe);
      assert.equal(assessment.completenessSatisfied, false, expected);
      assert.ok(assessment.rejectionCodes.includes(expected), expected);
      assert.equal(assessment.oProposalCreated, false);
      assert.equal(assessment.authorityGranted, false);
    }
  });

  test("independent verifier accepts the closed signed readiness and receipt", async () => {
    const value = await fixture();
    const direct = await verifyCalibrationPlanAssemblyReadinessAgainstArtifacts({ record: value.record, schemas: value.schemas, reader: value.reader, portabilityReference: value.portabilityReference });
    assert.deepEqual(direct, { artifactCount: 24, programBindingCount: 6, pendingSentinelMappingCount: 25, statisticalMarginMappingCount: 1, effectiveExpandedOutputCount: 136, goldenVectorCount: 8, unresolvedObligationCount: 7, providerModelRequestAttempts: 0, calibrationExecutions: 0, protectedDataAccesses: 0, calibrationPlanManifests: 0, oProposals: 0, authoritiesGranted: 0, finalProtocolId: null, budgetFreezeId: null });
    const audited = await verifyCalibrationPlanAssemblyAuditReceiptIndependent({ receipt: value.receipt, readiness: value.record, readinessBytes: value.readinessBytes, schemas: value.schemas, reader: value.reader, portabilityReference: value.portabilityReference });
    assert.deepEqual(audited, direct);
  });

  test("validly re-signed semantic attacks are rejected", async () => {
    const value = await fixture();
    const attacks: readonly [string, (record: any) => void][] = [
      ["incomplete mapping", (record) => record.fieldEvidenceMap.pop()],
      ["duplicate mapping", (record) => { record.fieldEvidenceMap[1].fieldPath = record.fieldEvidenceMap[0].fieldPath; }],
      ["wrong producer", (record) => { record.fieldEvidenceMap[0].requiredProducerRole = "calibration_scorer"; }],
      ["synthetic value admission", (record) => { record.fieldEvidenceMap[0].admissibleSourceClass = "synthetic_conformance_output"; }],
      ["public-development laundering", (record) => { record.fieldEvidenceMap[0].prohibitedSourceClasses = record.fieldEvidenceMap[0].prohibitedSourceClasses.filter((item: string) => item !== "public_development_result"); }],
      ["missing verifier receipt", (record) => { record.fieldEvidenceMap[0].requiredVerifierReceipt = "MissingReceipt"; }],
      ["candidate values inserted", (record) => { record.futureCandidateGridSchemas[0].candidates = [1]; }],
      ["arithmetic drift", (record) => { record.arithmeticPortabilityContract.wilsonBound.zNumerator = 1_644_853; }],
      ["serialization drift", (record) => { record.arithmeticPortabilityContract.deterministicSerialization.whitespace = "allowed"; }],
      ["partial freeze", (record) => { record.mappingSummary.mappingCount = 25; }],
      ["final ID", (record) => { record.futureIdentityState.finalProtocolId = "protocol-premature"; }],
      ["nonzero budget", (record) => { record.researchExecutionBudget.providerModelRequestAttempts = 1; }],
      ["protected capability", (record) => { record.authorityState.protectedDataAccessAuthorized = true; }],
      ["authority escalation", (record) => { record.eligibilityState.authorizedForResearchEvidence = true; }],
      ["O creation", (record) => { record.assemblyCompletenessRule.thisReadinessMayCreateOrActivateO = true; }],
      ["grid instance", (record) => { record.actualCandidateGridInstances.push({ target: "F" }); }],
      ["program substitution", (record) => { record.programBindings[0].programId = `cdp-sha256:${"0".repeat(64)}`; }],
      ["role collapse", (record) => { record.roleBoundary.independentVerifier.publicPrincipal = record.roleBoundary.protocolAuthor.publicPrincipal; }],
    ];
    for (const [label, mutate] of attacks) {
      const attacked = validlyResign(value.record, mutate);
      await assert.rejects(
        verifyCalibrationPlanAssemblyReadinessAgainstArtifacts({ record: attacked, schemas: value.schemas, reader: value.reader, portabilityReference: value.portabilityReference }),
        (error) => {
          assert.ok(error instanceof Error, label);
          return true;
        },
      );
    }
  });

  test("wrong signer and substituted readiness bytes are rejected", async () => {
    const value = await fixture();
    const wrongRole = validlyResign(value.record, () => {}, "calibration_scorer");
    await assert.rejects(
      verifyCalibrationPlanAssemblyReadinessAgainstArtifacts({ record: wrongRole, schemas: value.schemas, reader: value.reader, portabilityReference: value.portabilityReference }),
    );
    const substituted = Buffer.from(value.readinessBytes);
    substituted[substituted.length - 2] = substituted[substituted.length - 2] === 0x7d ? 0x5d : 0x7d;
    await assert.rejects(
      verifyCalibrationPlanAssemblyAuditReceiptIndependent({ receipt: value.receipt, readiness: value.record, readinessBytes: substituted, schemas: value.schemas, reader: value.reader, portabilityReference: value.portabilityReference }),
    );
  });
});
