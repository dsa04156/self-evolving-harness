import {
  canonicalize,
  sha256,
  type JsonValue,
} from "../core/canonical.js";
import { assertCondition } from "../core/errors.js";
import {
  SCHEMA_BASE_URL,
  type SchemaRegistry,
} from "../contracts/schema-registry.js";
import type { HarnessComponentRegistry } from "../harness/component-registry.js";
import {
  createNonPromotableHarnessRecord,
  type NonPromotableHarnessRegistry,
} from "../governance/non-promotable-harness.js";
import {
  PrincipalRegistry,
  type Attestation,
  type PrincipalIdentity,
  type PrincipalSigner,
  type PublicPrincipal,
} from "../trust/identity.js";
import type { LabelBlindAttributionCorpus } from "../evaluation/hfb-label-blind-adapter.js";
import {
  verifyDevelopmentAttributionCommitment,
  type DevelopmentAttributionCommitment,
  type DevelopmentAttributionLabel,
  type DevelopmentAttributionPredictionSet,
  type DevelopmentAttributionPrototypeManifest,
  type DevelopmentClaimBoundary,
} from "../evaluation/development-attribution.js";
import {
  applyJsonPatchOperations,
  measurePayloadMutation,
  type JsonPatchOperation,
} from "./bounded-mutation.js";

export const DEVELOPMENT_MUTATION_DRY_RUN_SCHEMA_ID =
  `${SCHEMA_BASE_URL}development-mutation-dry-run.schema.json`;

export const DEVELOPMENT_CANDIDATE_ALLOWED_DESTINATIONS = [
  "development_external_evaluator",
  "development_archive",
] as const;

export const DEVELOPMENT_CANDIDATE_FORBIDDEN_DESTINATIONS = [
  "research_selection",
  "canary",
  "approved",
  "deployment",
  "production_pointer",
  "research_manifest",
] as const;

export type DevelopmentCandidateDestination =
  | (typeof DEVELOPMENT_CANDIDATE_ALLOWED_DESTINATIONS)[number]
  | (typeof DEVELOPMENT_CANDIDATE_FORBIDDEN_DESTINATIONS)[number];

export interface DevelopmentMutationDryRunRecord {
  readonly schemaVersion: 1;
  readonly dryRunId: string;
  readonly protocolId: string;
  readonly predictionCommitmentHash: string;
  readonly predictionSetHash: string;
  readonly corpusHash: string;
  readonly selectedTraceProjectionId: string;
  readonly selectedComponentType: DevelopmentAttributionLabel;
  readonly parentHarnessVersionId: string;
  readonly candidateHarnessVersionId: string;
  readonly change: {
    readonly changedComponentCount: 1;
    readonly componentId: string;
    readonly beforeComponentManifestId: string;
    readonly afterComponentManifestId: string;
    readonly nextSemanticVersion: string;
    readonly operations: readonly JsonPatchOperation[];
    readonly semanticOperations: readonly string[];
    readonly expandedClosureEditBytes: number;
    readonly replacementSurfaceBytes: number;
    readonly normalizedTokenInsertions: number;
    readonly normalizedTokenDeletions: number;
    readonly structuralEditOperations: number;
    readonly parentClosureHash: string;
    readonly candidateClosureHash: string;
    readonly capabilityIdsAdded: readonly [];
    readonly capabilityIdsRemoved: readonly [];
  };
  readonly admission: {
    readonly valid: true;
    readonly checks: readonly {
      readonly checkId: string;
      readonly passed: true;
    }[];
  };
  readonly evaluatorInputPolicy: {
    readonly datasetRole: "synthetic_development";
    readonly providerClass: "deterministic_fake";
    readonly toolClass: "immutable_builtin";
    readonly oracleAvailable: false;
    readonly gateCapability: false;
    readonly finalCapability: false;
  };
  readonly lifecycleBoundary: {
    readonly state: "development_candidate";
    readonly promotable: false;
    readonly mainQualificationLifecycleAllowed: false;
    readonly allowedDestinations:
      typeof DEVELOPMENT_CANDIDATE_ALLOWED_DESTINATIONS;
    readonly forbiddenDestinations:
      typeof DEVELOPMENT_CANDIDATE_FORBIDDEN_DESTINATIONS;
  };
  readonly claimBoundary: DevelopmentClaimBoundary;
  readonly proposer: PrincipalIdentity;
  readonly createdAt: string;
  readonly recordHash: string;
  readonly publicPrincipal: PublicPrincipal;
  readonly attestation: Attestation;
}

type RecordCore = Omit<
  DevelopmentMutationDryRunRecord,
  "recordHash" | "publicPrincipal" | "attestation"
>;
type SignedBody = Omit<
  DevelopmentMutationDryRunRecord,
  "attestation"
>;

const CLAIM_BOUNDARY: DevelopmentClaimBoundary = {
  developmentOnly: true,
  confirmatory: false,
  publicVisibleFixtures: true,
  authorizedForResearchEvidence: false,
  attributionPerformanceClaim: false,
};

function coreOf(
  record: DevelopmentMutationDryRunRecord,
): RecordCore {
  const {
    recordHash: _recordHash,
    publicPrincipal: _publicPrincipal,
    attestation: _attestation,
    ...core
  } = record;
  return core;
}

function signedBodyOf(
  record: DevelopmentMutationDryRunRecord,
): SignedBody {
  const { attestation: _attestation, ...body } = record;
  return body;
}

export class DevelopmentMutationDryRunService {
  readonly #protocolId: string;
  readonly #schemas: SchemaRegistry;
  readonly #registry: HarnessComponentRegistry;
  readonly #nonPromotable: NonPromotableHarnessRegistry;
  readonly #proposer: PrincipalSigner;
  readonly #operations: PrincipalSigner;

  public constructor(input: {
    readonly protocolId: string;
    readonly schemas: SchemaRegistry;
    readonly registry: HarnessComponentRegistry;
    readonly nonPromotable: NonPromotableHarnessRegistry;
    readonly proposer: PrincipalSigner;
    readonly operations: PrincipalSigner;
  }) {
    assertCondition(
      input.proposer.identity.role === "proposer" &&
        input.operations.identity.role === "operations_owner",
      "AUTHORIZATION_DENIED",
      "Development mutation needs separate proposer and operations identities",
    );
    this.#protocolId = input.protocolId;
    this.#schemas = input.schemas;
    this.#registry = input.registry;
    this.#nonPromotable = input.nonPromotable;
    this.#proposer = input.proposer;
    this.#operations = input.operations;
  }

  public async create(input: {
    readonly dryRunId: string;
    readonly quarantineRecordId: string;
    readonly parentHarnessVersionId: string;
    readonly candidateSemanticVersion: string;
    readonly nextComponentSemanticVersion: string;
    readonly selectedTraceProjectionId: string;
    readonly operations: readonly JsonPatchOperation[];
    readonly semanticOperations: readonly string[];
    readonly manifest: DevelopmentAttributionPrototypeManifest;
    readonly corpus: LabelBlindAttributionCorpus;
    readonly predictionSet: DevelopmentAttributionPredictionSet;
    readonly commitment: DevelopmentAttributionCommitment;
    readonly createdAt: string;
  }): Promise<DevelopmentMutationDryRunRecord> {
    verifyDevelopmentAttributionCommitment({
      commitment: input.commitment,
      predictionSet: input.predictionSet,
      manifest: input.manifest,
      corpus: input.corpus,
      schemas: this.#schemas,
    });
    assertCondition(
      input.operations.length ===
        input.semanticOperations.length,
      "SCHEMA_INVALID",
      "Every development mutation operation needs a semantic label",
    );
    const prediction = input.predictionSet.predictions.find(
      (entry) =>
        entry.traceProjectionId ===
        input.selectedTraceProjectionId,
    );
    assertCondition(
      prediction !== undefined &&
        prediction.status === "predicted" &&
        prediction.rankedComponentTypes[0] !== undefined,
      "ARTIFACT_UNAVAILABLE",
      "Development mutation needs a committed top-1 prediction",
    );
    const selectedComponentType =
      prediction.rankedComponentTypes[0].componentType;
    const parent = this.#registry.getHarness(
      input.parentHarnessVersionId,
    );
    const targets = parent.identity.componentBindings
      .map((binding) =>
        this.#registry.getComponent(
          binding.component.componentManifestId,
        ),
      )
      .filter((component) => {
        const type = this.#registry.typeEntry(
          component.identity.typeRegistryRef.typeEntryId,
        );
        return (
          type.componentType === selectedComponentType &&
          type.mutableClass === "mutable" &&
          type.mvpMutationEnabled
        );
      });
    assertCondition(
      targets.length === 1,
      "AUTHORIZATION_DENIED",
      "Synthetic parent must bind exactly one mutable component matching the top-1 prediction",
    );
    const before = targets[0]!;
    const beforePayload = await this.#registry.getPayload(
      before.componentManifestId,
    );
    const afterPayload = applyJsonPatchOperations(
      beforePayload,
      input.operations,
    );
    const measure = measurePayloadMutation(
      beforePayload,
      afterPayload,
      input.operations.length,
    );
    assertCondition(
      measure.expandedClosureEditBytes <= 8192,
      "PAYLOAD_TOO_LARGE",
      "Development mutation exceeds the frozen 8192-byte boundary",
    );
    const after = await this.#registry.createComponent({
      componentId: before.identity.componentId,
      semanticVersion:
        input.nextComponentSemanticVersion,
      typeEntryId:
        before.identity.typeRegistryRef.typeEntryId,
      payloadLanguage: before.identity.payload.language,
      payload: afterPayload,
      capabilityIds: this.#registry.capabilitiesFor(
        before.componentManifestId,
      ),
      dependencyManifestIds: this.#registry.dependencyIdsFor(
        before.componentManifestId,
      ),
    });
    const candidate = await this.#registry.createHarness({
      semanticVersion: input.candidateSemanticVersion,
      requiredRuntimeContractHash:
        parent.identity.requiredRuntimeContractHash,
      bindings: parent.identity.componentBindings.map(
        (binding) => ({
          slotId: binding.slotId,
          componentManifestId:
            binding.component.componentManifestId ===
            before.componentManifestId
              ? after.componentManifestId
              : binding.component.componentManifestId,
        }),
      ),
    });
    const diff = this.#registry.diffHarnesses(
      parent.harnessVersionId,
      candidate.harnessVersionId,
    );
    assertCondition(
      diff.changed.length === 1 &&
        diff.immutableDiffCount === 0 &&
        diff.disabledConditionalDiffCount === 0,
      "AUTHORIZATION_DENIED",
      "Development candidate escaped the one-component mutable boundary",
    );

    const quarantine =
      createNonPromotableHarnessRecord({
        recordId: input.quarantineRecordId,
        harnessVersionId: candidate.harnessVersionId,
        recordedAt: input.createdAt,
        signer: this.#operations,
      });
    await this.#nonPromotable.register(quarantine);

    const core: RecordCore = {
      schemaVersion: 1,
      dryRunId: input.dryRunId,
      protocolId: this.#protocolId,
      predictionCommitmentHash:
        input.commitment.commitmentHash,
      predictionSetHash:
        input.predictionSet.predictionSetHash,
      corpusHash: input.corpus.corpusHash,
      selectedTraceProjectionId:
        input.selectedTraceProjectionId,
      selectedComponentType,
      parentHarnessVersionId: parent.harnessVersionId,
      candidateHarnessVersionId:
        candidate.harnessVersionId,
      change: {
        changedComponentCount: 1,
        componentId: before.identity.componentId,
        beforeComponentManifestId:
          before.componentManifestId,
        afterComponentManifestId:
          after.componentManifestId,
        nextSemanticVersion:
          input.nextComponentSemanticVersion,
        operations: [...input.operations],
        semanticOperations: [
          ...input.semanticOperations,
        ],
        expandedClosureEditBytes:
          measure.expandedClosureEditBytes,
        replacementSurfaceBytes:
          measure.replacementSurfaceBytes,
        normalizedTokenInsertions:
          measure.normalizedTokenInsertions,
        normalizedTokenDeletions:
          measure.normalizedTokenDeletions,
        structuralEditOperations:
          measure.structuralEditOperations,
        parentClosureHash:
          parent.identity.behaviorClosure.closureHash,
        candidateClosureHash:
          candidate.identity.behaviorClosure.closureHash,
        capabilityIdsAdded: [],
        capabilityIdsRemoved: [],
      },
      admission: {
        valid: true,
        checks: [
          {
            checkId: "prediction.commitment-verified",
            passed: true,
          },
          {
            checkId: "prediction.top1-target",
            passed: true,
          },
          {
            checkId: "mutation.single-component",
            passed: true,
          },
          {
            checkId: "mutation.mutable-type",
            passed: true,
          },
          {
            checkId: "mutation.immutable-diff-zero",
            passed: true,
          },
          {
            checkId: "mutation.capability-diff-zero",
            passed: true,
          },
          {
            checkId: "candidate.non-promotable-recorded",
            passed: true,
          },
        ],
      },
      evaluatorInputPolicy: {
        datasetRole: "synthetic_development",
        providerClass: "deterministic_fake",
        toolClass: "immutable_builtin",
        oracleAvailable: false,
        gateCapability: false,
        finalCapability: false,
      },
      lifecycleBoundary: {
        state: "development_candidate",
        promotable: false,
        mainQualificationLifecycleAllowed: false,
        allowedDestinations:
          DEVELOPMENT_CANDIDATE_ALLOWED_DESTINATIONS,
        forbiddenDestinations:
          DEVELOPMENT_CANDIDATE_FORBIDDEN_DESTINATIONS,
      },
      claimBoundary: CLAIM_BOUNDARY,
      proposer: this.#proposer.identity,
      createdAt: input.createdAt,
    };
    const publicPrincipal = this.#proposer.exportPublic();
    const body: SignedBody = {
      ...core,
      recordHash: sha256(core as unknown as JsonValue),
      publicPrincipal,
    };
    const record: DevelopmentMutationDryRunRecord = {
      ...body,
      attestation: this.#proposer.attest(
        body as unknown as JsonValue,
      ),
    };
    await verifyDevelopmentMutationDryRun({
      record,
      manifest: input.manifest,
      corpus: input.corpus,
      predictionSet: input.predictionSet,
      commitment: input.commitment,
      registry: this.#registry,
      nonPromotable: this.#nonPromotable,
      schemas: this.#schemas,
    });
    return record;
  }
}

export async function verifyDevelopmentMutationDryRun(input: {
  readonly record: DevelopmentMutationDryRunRecord;
  readonly manifest: DevelopmentAttributionPrototypeManifest;
  readonly corpus: LabelBlindAttributionCorpus;
  readonly predictionSet: DevelopmentAttributionPredictionSet;
  readonly commitment: DevelopmentAttributionCommitment;
  readonly registry: HarnessComponentRegistry;
  readonly nonPromotable: NonPromotableHarnessRegistry;
  readonly schemas: SchemaRegistry;
}): Promise<void> {
  input.schemas.validate(
    DEVELOPMENT_MUTATION_DRY_RUN_SCHEMA_ID,
    input.record as unknown as JsonValue,
  );
  verifyDevelopmentAttributionCommitment({
    commitment: input.commitment,
    predictionSet: input.predictionSet,
    manifest: input.manifest,
    corpus: input.corpus,
    schemas: input.schemas,
  });
  const prediction = input.predictionSet.predictions.find(
    (entry) =>
      entry.traceProjectionId ===
      input.record.selectedTraceProjectionId,
  );
  assertCondition(
    prediction?.status === "predicted" &&
      prediction.rankedComponentTypes[0]
        ?.componentType ===
        input.record.selectedComponentType,
    "HASH_MISMATCH",
    "Development mutation does not follow the committed top-1 prediction",
  );
  const diff = input.registry.diffHarnesses(
    input.record.parentHarnessVersionId,
    input.record.candidateHarnessVersionId,
  );
  const quarantine = await input.nonPromotable.recordFor(
    input.record.candidateHarnessVersionId,
  );
  assertCondition(
    diff.changed.length === 1 &&
      diff.immutableDiffCount === 0 &&
      diff.disabledConditionalDiffCount === 0 &&
      quarantine !== null &&
      quarantine.promotable === false,
    "AUTHORIZATION_DENIED",
    "Development mutation candidate is not bounded and quarantined",
  );
  assertCondition(
    input.record.proposer.role === "proposer" &&
      canonicalize(input.record.publicPrincipal.identity) ===
        canonicalize(input.record.proposer),
    "AUTHORIZATION_DENIED",
    "Development mutation record is not signed by its proposer",
  );
  assertCondition(
    input.record.recordHash ===
      sha256(coreOf(input.record) as unknown as JsonValue),
    "HASH_MISMATCH",
    "Development mutation record hash mismatch",
  );
  const principals = new PrincipalRegistry();
  principals.register(input.record.publicPrincipal);
  principals.verify(
    input.record.proposer,
    signedBodyOf(input.record) as unknown as JsonValue,
    input.record.attestation,
  );
}

export function assertDevelopmentCandidateDestination(
  record: DevelopmentMutationDryRunRecord,
  destination: DevelopmentCandidateDestination,
): void {
  assertCondition(
    record.lifecycleBoundary.allowedDestinations.includes(
      destination as
        (typeof DEVELOPMENT_CANDIDATE_ALLOWED_DESTINATIONS)[number],
    ),
    "AUTHORIZATION_DENIED",
    `Development candidate cannot enter ${destination}`,
  );
}
