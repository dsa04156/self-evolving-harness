import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, test } from "node:test";

import {
  CALIBRATION_DERIVATION_AUTHORITY_STATE,
  CALIBRATION_DERIVATION_DEPENDENCY_CONTRACT,
  CALIBRATION_DERIVATION_ELIGIBILITY_STATE,
  CALIBRATION_DERIVATION_ESTIMATOR_CONTRACT,
  CALIBRATION_DERIVATION_FORBIDDEN_RECORD_TYPES,
  CALIBRATION_DERIVATION_GRID_CONTRACT,
  CALIBRATION_DERIVATION_READINESS_ARTIFACT_SPECS,
  CALIBRATION_DERIVATION_READINESS_PATH,
  CALIBRATION_DERIVATION_SYNTHETIC_INPUT_POLICY,
  CALIBRATION_DERIVATION_ZERO_RESEARCH_BUDGET,
  PrincipalRegistry,
  SchemaRegistry,
  buildCalibrationDerivationSyntheticVectors,
  calibrationDerivationFailureContract,
  calibrationDerivationProgramDefinitions,
  canonicalBytes,
  canonicalize,
  createCalibrationDerivationIndependentVerification,
  createCalibrationDerivationProgramReadiness,
  createCalibrationDerivationReadinessAuditReceipt,
  sha256,
  sha256Bytes,
  verifyCalibrationDerivationProgramReadinessAgainstArtifacts,
  verifyCalibrationDerivationReadinessAuditReceiptIndependent,
  type CalibrationDerivationProgramReadiness,
  type CalibrationDerivationReadinessArtifactReader,
  type CalibrationDerivationReadinessArtifactReference,
  type CalibrationDerivationReadinessAuditReceipt,
  type JsonValue,
  type PrincipalRole,
  type UnsignedCalibrationDerivationProgramReadiness,
} from "../src/index.js";
import { deterministicPrincipal } from "./helpers/deterministic-principal.js";

const SOURCE_COMMIT = "a".repeat(40);
const SOURCE_TREE = "b".repeat(40);

class MemoryReader implements CalibrationDerivationReadinessArtifactReader {
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
  readonly record: CalibrationDerivationProgramReadiness;
  readonly reader: MemoryReader;
  readonly readinessBytes: Buffer;
  readonly receipt: CalibrationDerivationReadinessAuditReceipt;
}

function mutable<T>(value: T): any {
  return structuredClone(value);
}

function testPrincipal(input: {
  readonly role: "protocol_author" | "independent_verifier" | "audit_store";
  readonly label: string;
  readonly seedByte: number;
}) {
  return deterministicPrincipal({
    principalId: `${input.role}.calibration-derivation-readiness.${input.label}`,
    role: input.role,
    implementationDigest: `sha256:${input.seedByte.toString(16).padStart(2, "0").repeat(32)}`,
    instanceId: `${input.role}.calibration-derivation-readiness.${input.label}.instance`,
    seedByte: input.seedByte,
  });
}

function unsignedOf(
  record: CalibrationDerivationProgramReadiness,
): UnsignedCalibrationDerivationProgramReadiness {
  const {
    schemaVersion: _schemaVersion,
    hashDomain: _hashDomain,
    readinessId: _readinessId,
    recordType: _recordType,
    recordedBy: _recordedBy,
    readinessHash: _readinessHash,
    publicPrincipal: _publicPrincipal,
    attestation: _attestation,
    ...unsigned
  } = record;
  return unsigned;
}

function validlyResign(
  base: CalibrationDerivationProgramReadiness,
  mutate: (value: any) => void,
  role: PrincipalRole = "protocol_author",
): CalibrationDerivationProgramReadiness {
  const value = mutable(unsignedOf(base));
  const signer = deterministicPrincipal({
    principalId: `principal.calibration-derivation-readiness.resign.${role}`,
    role,
    implementationDigest: `sha256:${"9".repeat(64)}`,
    instanceId: `principal.calibration-derivation-readiness.resign.${role}.instance`,
    seedByte: role === "protocol_author" ? 239 : 240,
  });
  value.roleBoundary.protocolAuthor.publicPrincipal = signer.exportPublic();
  mutate(value);
  const readinessId = `cdr-sha256:${sha256Bytes(canonicalBytes({
    hashDomain: "CalibrationDerivationProgramReadiness.v1",
    ...value,
  }))}`;
  const core = {
    schemaVersion: 1 as const,
    hashDomain: "CalibrationDerivationProgramReadiness.v1" as const,
    readinessId,
    recordType: "calibration_derivation_program_readiness" as const,
    ...value,
    recordedBy: signer.identity,
  };
  const body = {
    ...core,
    readinessHash: sha256(core as unknown as JsonValue),
    publicPrincipal: signer.exportPublic(),
  };
  const record = {
    ...body,
    attestation: signer.attest(body as unknown as JsonValue),
  } as CalibrationDerivationProgramReadiness;
  const registry = new PrincipalRegistry();
  registry.register(signer.exportPublic());
  registry.verify(
    signer.identity,
    body as unknown as JsonValue,
    record.attestation,
  );
  return record;
}

async function fixture(): Promise<Fixture> {
  const schemas = await SchemaRegistry.load(path.resolve("schemas"));
  const bytes = new Map<string, Buffer>();
  const artifacts: CalibrationDerivationReadinessArtifactReference[] = [];
  for (const spec of CALIBRATION_DERIVATION_READINESS_ARTIFACT_SPECS) {
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
  const programArtifact = artifacts.find(
    (artifact) => artifact.artifactId === "derivation_programs_source",
  );
  assert.ok(programArtifact);
  const author = testPrincipal({
    role: "protocol_author",
    label: "test",
    seedByte: 241,
  });
  const verifier = testPrincipal({
    role: "independent_verifier",
    label: "test",
    seedByte: 242,
  });
  const audit = testPrincipal({
    role: "audit_store",
    label: "test",
    seedByte: 243,
  });
  const record = createCalibrationDerivationProgramReadiness({
    schemas,
    signer: author,
    value: {
      status: "synthetic_programs_ready_only",
      zeroResearchExecution: true,
      researchEvidencePresent: false,
      sourceSnapshot: {
        sourceCommit: SOURCE_COMMIT,
        sourceTree: SOURCE_TREE,
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
          publicPrincipal: author.exportPublic(),
          processIdentity:
            "process.calibration-derivation-readiness.protocol-author.v1",
          currentCapabilityHandles: [],
          delegatedCapabilityIds: [],
          roleAliases: [],
        },
        independentVerifier: {
          role: "independent_verifier",
          publicPrincipal: verifier.exportPublic(),
          processIdentity:
            "process.calibration-derivation-readiness.independent-verifier.v1",
          currentCapabilityHandles: [],
          delegatedCapabilityIds: [],
          roleAliases: [],
        },
        auditStore: {
          role: "audit_store",
          publicPrincipal: audit.exportPublic(),
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
      researchExecutionBudget:
        CALIBRATION_DERIVATION_ZERO_RESEARCH_BUDGET,
      authorityState: CALIBRATION_DERIVATION_AUTHORITY_STATE,
      eligibilityState: CALIBRATION_DERIVATION_ELIGIBILITY_STATE,
      futureIdentityState: {
        finalProtocolId: null,
        budgetFreezeId: null,
        calibrationPlanManifestId: null,
        calibrationEnvelopeId: null,
        selectedProtocolValueSetId: null,
      },
      forbiddenRecordTypes: [
        ...CALIBRATION_DERIVATION_FORBIDDEN_RECORD_TYPES,
      ],
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
      recordedAt: "2026-08-03T12:00:00.000Z",
    },
  });
  const reader = new MemoryReader(bytes);
  await verifyCalibrationDerivationProgramReadinessAgainstArtifacts({
    record,
    schemas,
    reader,
  });
  const readinessBytes = Buffer.from(
    `${canonicalize(record as unknown as JsonValue)}\n`,
    "utf8",
  );
  const independentVerification =
    createCalibrationDerivationIndependentVerification({
      readiness: record,
      readinessBytes,
      signer: verifier,
      verifiedAt: "2026-08-03T12:00:01.000Z",
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
    signer: audit,
    readiness: record,
    readinessBytes,
    value: {
      readinessReference: {
        readinessId: record.readinessId,
        readinessHash: record.readinessHash,
        path: CALIBRATION_DERIVATION_READINESS_PATH,
        sourceCommit: SOURCE_COMMIT,
        sourceTree: SOURCE_TREE,
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
    readiness: record,
    readinessBytes,
    schemas,
  });
  return { schemas, record, reader, readinessBytes, receipt };
}

async function rejects(
  current: Fixture,
  mutate: (value: any) => void,
): Promise<void> {
  const record = validlyResign(current.record, mutate);
  await assert.rejects(
    verifyCalibrationDerivationProgramReadinessAgainstArtifacts({
      record,
      schemas: current.schemas,
      reader: current.reader,
    }),
  );
}

describe("calibration derivation program readiness", () => {
  test("verifies the closed readiness record and nested independent audit statement", async () => {
    const current = await fixture();
    const result =
      await verifyCalibrationDerivationProgramReadinessAgainstArtifacts({
        record: current.record,
        schemas: current.schemas,
        reader: current.reader,
      });
    assert.deepEqual(result, {
      artifactCount: 19,
      programCount: 6,
      syntheticVectorCount: 11,
      withdrawalVectorCount: 4,
      precisionLimitedVectorCount: 1,
      unresolvedObligationCount: 7,
      providerModelRequestAttempts: 0,
      calibrationExecutions: 0,
      protectedDataAccesses: 0,
      authoritiesGranted: 0,
      finalProtocolId: null,
      budgetFreezeId: null,
    });
  });

  test("rejects validly re-signed grid enlargement and implicit defaults", async () => {
    const current = await fixture();
    await rejects(current, (value) => {
      value.gridContract.capGrid.candidateMaximum = 9;
    });
    await rejects(current, (value) => {
      value.gridContract.implicitOrHiddenDefaultsAllowed = true;
    });
    await rejects(current, (value) => {
      value.gridContract.protocolCandidateValues.push(4_096);
      value.gridContract.protocolCandidateValuesChosen = true;
    });
  });

  test("rejects validly re-signed estimator, confidence, rounding, and tie drift", async () => {
    const current = await fixture();
    await rejects(current, (value) => {
      value.estimatorContract.failureEstimator.identity =
        "clopper_pearson_one_sided.v1";
    });
    await rejects(current, (value) => {
      value.estimatorContract.failureEstimator.confidenceBasisPoints = 9_000;
    });
    await rejects(current, (value) => {
      value.estimatorContract.resourceRounding = "downward_to_quantum";
    });
    await rejects(current, (value) => {
      value.programDefinitions[0].tieRule = "largest_candidate_wins";
    });
  });

  test("rejects validly re-signed acceptance of missing strata, usage undercharge, or incidents", async () => {
    const current = await fixture();
    for (const caseId of [
      "F.missing-usage-withdrawal",
      "F.incident-withdrawal",
    ]) {
      await rejects(current, (value) => {
        const vector = value.syntheticConformanceVectors.find(
          (candidate: any) => candidate.caseId === caseId,
        );
        vector.result.status = "selected_synthetic_only";
        vector.result.outcome.withdrawalReason = null;
      });
    }
    await rejects(current, (value) => {
      value.failureContract = value.failureContract.filter(
        (entry: any) => entry.condition !== "missing_required_stratum",
      );
    });
  });

  test("rejects validly re-signed post-result grid mutation", async () => {
    const current = await fixture();
    await rejects(current, (value) => {
      const vector = value.syntheticConformanceVectors.find(
        (candidate: any) => candidate.caseId === "F.smallest-feasible",
      );
      vector.input.candidates[1].cap += 1;
    });
    await rejects(current, (value) => {
      value.gridContract.postResultGridModificationAllowed = true;
    });
  });

  test("rejects validly re-signed seed domain/order and widened thresholds", async () => {
    const current = await fixture();
    await rejects(current, (value) => {
      value.estimatorContract.seedStream.domain =
        "seh.calibration.synthetic.seed-stream.v2";
    });
    await rejects(current, (value) => {
      value.estimatorContract.seedStream.ordering =
        "counter_descending";
    });
    await rejects(current, (value) => {
      value.estimatorContract.rolloutThresholds.mcseMaximumBasisPoints = 200;
    });
    await rejects(current, (value) => {
      value.estimatorContract.marginThresholds.powerMinimumBasisPoints = 7_000;
    });
  });

  test("rejects validly re-signed cycles, O-to-D, and synthetic sentinel bindings", async () => {
    const current = await fixture();
    await rejects(current, (value) => {
      value.dependencyContract.numericGraph.edges.push("O->D");
    });
    await rejects(current, (value) => {
      value.dependencyContract.numericGraph.cycleEdgesForbidden = [];
    });
    await rejects(current, (value) => {
      value.dependencyContract.syntheticOutputBindings.push({
        resultId: value.syntheticConformanceVectors[0].result.syntheticResultId,
        target: "pending_sentinel",
      });
      value.dependencyContract.sentinelWrites.push(
        "perRequest.rolloutTokenCapT",
      );
    });
  });

  test("rejects validly re-signed provider-smoke or public-fixture ancestry", async () => {
    const current = await fixture();
    for (const field of ["providerSmokeAncestry", "publicFixtureAncestry"]) {
      await rejects(current, (value) => {
        value.syntheticConformanceVectors[0].input.header[field] = true;
      });
    }
    await rejects(current, (value) => {
      value.syntheticInputPolicy.forbiddenAncestry =
        value.syntheticInputPolicy.forbiddenAncestry.filter(
          (entry: string) => entry !== "provider_smoke",
        );
    });
  });

  test("rejects validly re-signed role collapse, aliasing, or delegation", async () => {
    const current = await fixture();
    await rejects(current, (value) => {
      value.roleBoundary.independentVerifier.publicPrincipal =
        value.roleBoundary.protocolAuthor.publicPrincipal;
    });
    await rejects(current, (value) => {
      value.roleBoundary.auditStore.processIdentity =
        value.roleBoundary.independentVerifier.processIdentity;
    });
    await rejects(current, (value) => {
      value.roleBoundary.independentVerifier.roleAliases.push(
        "protocol_author",
      );
    });
    await rejects(current, (value) => {
      value.roleBoundary.auditStore.delegatedCapabilityIds.push(
        "verify_and_author",
      );
    });
  });

  test("rejects validly re-signed budgets, final IDs, and authority escalation", async () => {
    const current = await fixture();
    await rejects(current, (value) => {
      value.researchExecutionBudget.providerModelRequestAttempts = 1;
    });
    await rejects(current, (value) => {
      value.researchExecutionBudget.wallClockSeconds = 1;
    });
    await rejects(current, (value) => {
      value.futureIdentityState.finalProtocolId =
        `protocol-sha256:${"c".repeat(64)}`;
    });
    await rejects(current, (value) => {
      value.futureIdentityState.calibrationEnvelopeId =
        `envelope-sha256:${"d".repeat(64)}`;
    });
    await rejects(current, (value) => {
      value.authorityState.calibrationExecutionAuthorized = true;
    });
    await rejects(current, (value) => {
      value.eligibilityState.authorizedForResearchEvidence = true;
    });
    await rejects(current, (value) => {
      value.eligibilityState.admissibleAsNumericFreezeValue = true;
    });
  });

  test("rejects a cryptographically valid readiness record from the wrong creator role", async () => {
    const current = await fixture();
    const record = validlyResign(
      current.record,
      () => undefined,
      "operations_owner",
    );
    await assert.rejects(
      verifyCalibrationDerivationProgramReadinessAgainstArtifacts({
        record,
        schemas: current.schemas,
        reader: current.reader,
      }),
    );
  });

  test("rejects source artifact substitution and reference-only receipt byte substitution", async () => {
    const current = await fixture();
    const changedArtifact = validlyResign(current.record, (value) => {
      value.artifacts.find(
        (artifact: any) =>
          artifact.artifactId === "derivation_programs_source",
      ).sha256 = `sha256:${"e".repeat(64)}`;
    });
    await assert.rejects(
      verifyCalibrationDerivationProgramReadinessAgainstArtifacts({
        record: changedArtifact,
        schemas: current.schemas,
        reader: current.reader,
      }),
    );

    const substituted = Buffer.from(current.readinessBytes);
    substituted[0] = substituted[0] === 0x7b ? 0x5b : 0x7b;
    assert.throws(() =>
      verifyCalibrationDerivationReadinessAuditReceiptIndependent({
        receipt: current.receipt,
        readiness: current.record,
        readinessBytes: substituted,
        schemas: current.schemas,
      }),
    );
  });
});
