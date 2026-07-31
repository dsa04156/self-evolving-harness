import assert from "node:assert/strict";
import {
  createPublicKey,
  verify,
} from "node:crypto";
import {
  mkdtemp,
  readFile,
  rm,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  ArtifactStore,
  DevelopmentArtifactTaintPolicy,
  HarnessComponentRegistry,
  SchemaRegistry,
  canonicalize,
  parseStrictJson,
  sha256,
  verifyDevelopmentArtifactTaintRecord,
  verifyDevelopmentAttributionCommitment,
  verifyDevelopmentAttributionScoreReport,
  verifyDevelopmentBoundaryMutation,
  verifyDevelopmentBoundaryReceipt,
  verifyDevelopmentOracleAccessEvent,
  verifyDevelopmentPredictionSeal,
  verifyDevelopmentSyntheticEvaluation,
  verifyDevelopmentSyntheticExecution,
  verifyNonPromotableHarnessRecord,
  type ComponentManifest,
  type DevelopmentArtifactTaintRecord,
  type DevelopmentAttributionCommitment,
  type DevelopmentAttributionPredictionSet,
  type DevelopmentAttributionPrototypeManifest,
  type DevelopmentAttributionScoreReport,
  type DevelopmentBoundaryMutationProposal,
  type DevelopmentBoundaryReceipt,
  type DevelopmentOracleAccessEvent,
  type DevelopmentOracleJoinEntry,
  type DevelopmentPredictionSealRecord,
  type DevelopmentSyntheticEvaluationResult,
  type DevelopmentSyntheticExecutionBundle,
  type HarnessClosureExport,
  type JsonValue,
  type LabelBlindAttributionCorpus,
  type NonPromotableHarnessRecord,
  type PublicPrincipal,
} from "../src/index.js";

const EVIDENCE_SCHEMA =
  "https://self-evolving-harness.local/schemas/development-process-boundary-evidence.schema.json";
const ROLE_UIDS = {
  attributor: 1201,
  committer: 1202,
  scorer: 1203,
  proposer: 1204,
  operations: 1205,
  runtime: 1206,
  evaluator: 1207,
  audit: 1208,
} as const;

interface ProcessBoundaryEvidence {
  readonly roleUids: typeof ROLE_UIDS;
  readonly hostRoleUids: Readonly<Record<string, number>>;
  readonly keyOwners: typeof ROLE_UIDS;
  readonly publicPrincipals: Readonly<
    Record<keyof typeof ROLE_UIDS, PublicPrincipal>
  >;
  readonly roleProbes: Readonly<
    Record<
      keyof typeof ROLE_UIDS,
      {
        readonly uid: number;
        readonly gid: number;
        readonly challenge: string;
        readonly challengeSignature: string;
        readonly effectiveCapabilities: string;
        readonly noNewPrivileges: string;
        readonly forbiddenReadsDenied: number;
        readonly forbiddenWritesDenied: number;
        readonly networkDenied: string;
      }
    >
  >;
  readonly earlyScorerSocketAbsent: true;
  readonly predictionSeal: {
    readonly recordHash: string;
  };
  readonly scorerRelease: {
    readonly accepted: {
      readonly accepted: true;
      readonly reportHash: string;
      readonly claimAuthorized: false;
      readonly promotionAuthorized: false;
    };
    readonly adversarial: readonly {
      readonly mode: string;
      readonly response: {
        readonly accepted: false;
      };
    }[];
    readonly oracleMountRoles: readonly ["scorer"];
    readonly proposerReceivedScorerOutput: false;
  };
  readonly candidate: {
    readonly parentHarnessVersionId: string;
    readonly candidateHarnessVersionId: string;
    readonly proposalHash: string;
    readonly nonPromotableRecordHash: string;
  };
  readonly actualRuntimeEvaluation: {
    readonly executionBundleHash: string;
    readonly resultHash: string;
    readonly sourceClass:
      "derived_from_actual_standalone_runtime_evidence";
    readonly aggregate: DevelopmentSyntheticEvaluationResult["aggregate"];
  };
  readonly finalAudit: {
    readonly receiptHashes: readonly string[];
    readonly taintRecordHash: string;
    readonly summaryHash: string;
    readonly researchEvidenceAuthorized: false;
    readonly promotionAuthorized: false;
    readonly providerUsed: false;
  };
  readonly artifacts: {
    readonly labelBlindCorpus: LabelBlindAttributionCorpus;
    readonly oracleJoin: readonly DevelopmentOracleJoinEntry[];
    readonly prototypeManifest: DevelopmentAttributionPrototypeManifest;
    readonly predictionSet: DevelopmentAttributionPredictionSet;
    readonly predictionCommitment: DevelopmentAttributionCommitment;
    readonly predictionSeal: DevelopmentPredictionSealRecord;
    readonly oracleAccessEvent: DevelopmentOracleAccessEvent;
    readonly scoreReport: DevelopmentAttributionScoreReport;
    readonly mutationProposal: DevelopmentBoundaryMutationProposal;
    readonly parentClosure: HarnessClosureExport;
    readonly candidateClosure: HarnessClosureExport;
    readonly nonPromotableRecord: NonPromotableHarnessRecord;
    readonly runtimeExecution: DevelopmentSyntheticExecutionBundle;
    readonly candidateEvaluation: DevelopmentSyntheticEvaluationResult;
    readonly taintRecord: DevelopmentArtifactTaintRecord;
    readonly roleReceipts: readonly DevelopmentBoundaryReceipt[];
    readonly finalReceipt: DevelopmentBoundaryReceipt;
  };
  readonly providerUsed: false;
  readonly researchEvidenceAuthorized: false;
  readonly promotionAuthorized: false;
}

function asEvidence(value: JsonValue): ProcessBoundaryEvidence {
  return value as unknown as ProcessBoundaryEvidence;
}

async function reconstructCandidateRegistry(input: {
  readonly parent: HarnessClosureExport;
  readonly candidate: HarnessClosureExport;
  readonly schemas: SchemaRegistry;
  readonly root: string;
}): Promise<HarnessComponentRegistry> {
  const registry = new HarnessComponentRegistry({
    root: path.join(input.root, "registry"),
    schemas: input.schemas,
    artifacts: new ArtifactStore(
      path.join(input.root, "artifacts"),
    ),
    requiredSlotIds: ["permission", "workflow"],
  });
  await registry.initialize(
    path.resolve("configs/component-type-registry.json"),
  );
  const entries = new Map<
    string,
    HarnessClosureExport["componentEntries"][number]
  >();
  for (const closure of [input.parent, input.candidate]) {
    for (const entry of closure.componentEntries) {
      entries.set(
        entry.componentManifest.componentManifestId,
        entry,
      );
    }
  }
  const created = new Set<string>();
  while (created.size < entries.size) {
    let progressed = false;
    for (const entry of entries.values()) {
      const manifest = entry.componentManifest;
      if (created.has(manifest.componentManifestId)) {
        continue;
      }
      const dependencyIds =
        manifest.identity.dependencies.map(
          (dependency) =>
            dependency.component.componentManifestId,
        );
      if (
        dependencyIds.some(
          (dependencyId) => !created.has(dependencyId),
        )
      ) {
        continue;
      }
      const observed = await registry.createComponent({
        componentId: manifest.identity.componentId,
        semanticVersion:
          manifest.identity.semanticVersion,
        typeEntryId:
          manifest.identity.typeRegistryRef.typeEntryId,
        payloadLanguage: manifest.identity.payload.language,
        payload: entry.payload,
        capabilityIds:
          manifest.identity.payload.capabilityIds,
        dependencyManifestIds: dependencyIds,
      });
      assert.equal(
        observed.componentManifestId,
        manifest.componentManifestId,
      );
      created.add(manifest.componentManifestId);
      progressed = true;
    }
    assert.equal(
      progressed,
      true,
      "candidate closure has an unresolved dependency cycle",
    );
  }
  for (const closure of [input.parent, input.candidate]) {
    const manifest = closure.harnessManifest;
    const observed = await registry.createHarness({
      semanticVersion: manifest.identity.semanticVersion,
      requiredRuntimeContractHash:
        manifest.identity.requiredRuntimeContractHash,
      bindings: manifest.identity.componentBindings.map(
        (binding) => ({
          slotId: binding.slotId,
          componentManifestId:
            binding.component.componentManifestId,
        }),
      ),
    });
    assert.equal(
      observed.harnessVersionId,
      manifest.harnessVersionId,
    );
  }
  return registry;
}

function verifyRoleProbes(
  evidence: ProcessBoundaryEvidence,
): void {
  assert.equal(
    canonicalize(evidence.roleUids),
    canonicalize(ROLE_UIDS),
  );
  assert.equal(
    canonicalize(evidence.keyOwners),
    canonicalize(ROLE_UIDS),
  );
  assert.equal(
    new Set(Object.values(evidence.hostRoleUids)).size,
    8,
  );
  for (const [role, uid] of Object.entries(ROLE_UIDS)) {
    const probe =
      evidence.roleProbes[
        role as keyof typeof ROLE_UIDS
      ];
    const principal =
      evidence.publicPrincipals[
        role as keyof typeof ROLE_UIDS
      ];
    assert.equal(probe.uid, uid);
    assert.equal(probe.gid, uid);
    assert.equal(
      probe.effectiveCapabilities,
      "0000000000000000",
    );
    assert.equal(probe.noNewPrivileges, "1");
    assert.equal(probe.forbiddenReadsDenied, 7);
    assert.equal(probe.forbiddenWritesDenied, 7);
    assert.notEqual(probe.networkDenied, "");
    assert.equal(
      verify(
        null,
        Buffer.from(probe.challenge, "utf8"),
        createPublicKey(principal.publicKeyPem),
        Buffer.from(
          probe.challengeSignature,
          "base64url",
        ),
      ),
      true,
    );
  }
}

async function main(): Promise<void> {
  const evidencePath = path.resolve(
    process.argv[2] ??
      "architect/evidence/development-process-boundary/os-boundary.json",
  );
  const schemas = await SchemaRegistry.load(
    path.resolve("schemas"),
  );
  const parsed = parseStrictJson(
    await readFile(evidencePath, "utf8"),
  );
  schemas.validate(EVIDENCE_SCHEMA, parsed);
  const evidence = asEvidence(parsed);
  verifyRoleProbes(evidence);

  const artifacts = evidence.artifacts;
  verifyDevelopmentAttributionCommitment({
    commitment: artifacts.predictionCommitment,
    predictionSet: artifacts.predictionSet,
    manifest: artifacts.prototypeManifest,
    corpus: artifacts.labelBlindCorpus,
    schemas,
  });
  verifyDevelopmentPredictionSeal({
    record: artifacts.predictionSeal,
    commitment: artifacts.predictionCommitment,
    predictionSet: artifacts.predictionSet,
    manifest: artifacts.prototypeManifest,
    corpus: artifacts.labelBlindCorpus,
    schemas,
  });
  verifyDevelopmentOracleAccessEvent({
    event: artifacts.oracleAccessEvent,
    commitment: artifacts.predictionCommitment,
    oracleEntries: artifacts.oracleJoin,
    schemas,
  });
  verifyDevelopmentAttributionScoreReport({
    report: artifacts.scoreReport,
    commitment: artifacts.predictionCommitment,
    accessEvent: artifacts.oracleAccessEvent,
    schemas,
  });
  verifyNonPromotableHarnessRecord({
    record: artifacts.nonPromotableRecord,
    schemas,
  });
  verifyDevelopmentSyntheticExecution({
    bundle: artifacts.runtimeExecution,
    schemas,
  });
  verifyDevelopmentSyntheticEvaluation({
    result: artifacts.candidateEvaluation,
    execution: artifacts.runtimeExecution,
    nonPromotableRecord:
      artifacts.nonPromotableRecord,
    schemas,
  });
  verifyDevelopmentArtifactTaintRecord({
    record: artifacts.taintRecord,
    schemas,
  });
  for (const receipt of [
    ...artifacts.roleReceipts,
    artifacts.finalReceipt,
  ]) {
    verifyDevelopmentBoundaryReceipt({
      receipt,
      schemas,
    });
  }

  const temporary = await mkdtemp(
    path.join(os.tmpdir(), "seh-boundary-verify-"),
  );
  try {
    const registry = await reconstructCandidateRegistry({
      parent: artifacts.parentClosure,
      candidate: artifacts.candidateClosure,
      schemas,
      root: temporary,
    });
    verifyDevelopmentBoundaryMutation({
      proposal: artifacts.mutationProposal,
      manifest: artifacts.prototypeManifest,
      corpus: artifacts.labelBlindCorpus,
      predictionSet: artifacts.predictionSet,
      commitment: artifacts.predictionCommitment,
      registry,
      schemas,
    });
  } finally {
    await rm(temporary, {
      recursive: true,
      force: true,
    });
  }

  assert.equal(
    evidence.predictionSeal.recordHash,
    artifacts.predictionSeal.recordHash,
  );
  assert.equal(
    evidence.scorerRelease.accepted.reportHash,
    artifacts.scoreReport.reportHash,
  );
  assert.equal(
    evidence.candidate.proposalHash,
    artifacts.mutationProposal.proposalHash,
  );
  assert.equal(
    evidence.candidate.parentHarnessVersionId,
    artifacts.parentClosure.harnessManifest
      .harnessVersionId,
  );
  assert.equal(
    evidence.candidate.candidateHarnessVersionId,
    artifacts.candidateClosure.harnessManifest
      .harnessVersionId,
  );
  assert.equal(
    evidence.candidate.nonPromotableRecordHash,
    artifacts.nonPromotableRecord.recordHash,
  );
  assert.equal(
    evidence.actualRuntimeEvaluation.executionBundleHash,
    artifacts.runtimeExecution.bundleHash,
  );
  assert.equal(
    evidence.actualRuntimeEvaluation.resultHash,
    artifacts.candidateEvaluation.resultHash,
  );
  assert.equal(
    canonicalize(
      evidence.actualRuntimeEvaluation.aggregate,
    ),
    canonicalize(
      artifacts.candidateEvaluation.aggregate,
    ),
  );
  const allReceiptHashes = [
    ...artifacts.roleReceipts,
    artifacts.finalReceipt,
  ]
    .map((receipt) => receipt.receiptHash)
    .sort();
  assert.equal(
    canonicalize(evidence.finalAudit.receiptHashes),
    canonicalize(allReceiptHashes),
  );
  assert.equal(
    evidence.finalAudit.taintRecordHash,
    artifacts.taintRecord.recordHash,
  );
  assert.equal(
    evidence.finalAudit.summaryHash,
    sha256({
      receipts: allReceiptHashes,
      taintRecordHash: artifacts.taintRecord.recordHash,
    }),
  );

  const taint = new DevelopmentArtifactTaintPolicy({
    records: [artifacts.taintRecord],
    schemas,
  });
  assert.throws(
    () =>
      taint.assertGraphUseAllowed({
        useClass: "research_protocol_manifest",
        rootReferences: [
          artifacts.mutationProposal
            .candidateHarnessVersionId,
        ],
        nodes: [],
      }),
    /cannot be used/iu,
  );
  assert.throws(
    () =>
      taint.assertGraphUseAllowed({
        useClass:
          "development_mutation_proposer_input",
        rootReferences: [
          artifacts.scoreReport.reportHash,
        ],
        nodes: [],
      }),
    /cannot be used/iu,
  );
  assert.equal(evidence.earlyScorerSocketAbsent, true);
  assert.equal(
    evidence.scorerRelease.adversarial.length,
    7,
  );
  assert.equal(
    evidence.scorerRelease.adversarial.every(
      (entry) => entry.response.accepted === false,
    ),
    true,
  );
  assert.deepEqual(
    evidence.scorerRelease.oracleMountRoles,
    ["scorer"],
  );
  assert.equal(
    evidence.scorerRelease.proposerReceivedScorerOutput,
    false,
  );
  assert.equal(evidence.providerUsed, false);
  assert.equal(
    evidence.researchEvidenceAuthorized,
    false,
  );
  assert.equal(evidence.promotionAuthorized, false);

  process.stdout.write(
    `${canonicalize({
      verified: true,
      evidencePath: path.relative(
        process.cwd(),
        evidencePath,
      ),
      roleCount: 8,
      receiptCount: allReceiptHashes.length,
      adversarialRejectionCount:
        evidence.scorerRelease.adversarial.length,
      candidateHarnessVersionId:
        evidence.candidate.candidateHarnessVersionId,
      executionBundleHash:
        artifacts.runtimeExecution.bundleHash,
      evaluationResultHash:
        artifacts.candidateEvaluation.resultHash,
      taintRecordHash: artifacts.taintRecord.recordHash,
      providerUsed: false,
      researchEvidenceAuthorized: false,
      promotionAuthorized: false,
    })}\n`,
  );
}

await main();
