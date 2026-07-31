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
import {
  verifyDevelopmentAttributionCommitment,
  type DevelopmentAttributionCommitment,
  type DevelopmentAttributionLabel,
  type DevelopmentAttributionPredictionSet,
  type DevelopmentAttributionPrototypeManifest,
} from "../evaluation/development-attribution.js";
import type { LabelBlindAttributionCorpus } from "../evaluation/hfb-label-blind-adapter.js";
import type { HarnessComponentRegistry } from "../harness/component-registry.js";
import {
  PrincipalRegistry,
  type Attestation,
  type PrincipalIdentity,
  type PrincipalSigner,
  type PublicPrincipal,
} from "../trust/identity.js";
import {
  applyJsonPatchOperations,
  measurePayloadMutation,
  type JsonPatchOperation,
} from "./bounded-mutation.js";

export const DEVELOPMENT_BOUNDARY_MUTATION_SCHEMA_ID =
  `${SCHEMA_BASE_URL}development-boundary-mutation.schema.json`;

export interface DevelopmentBoundaryMutationProposal {
  readonly schemaVersion: 1;
  readonly proposalId: string;
  readonly proposalType:
    "process_isolated_development_mutation";
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
    readonly operations: readonly JsonPatchOperation[];
    readonly semanticOperations: readonly string[];
    readonly expandedClosureEditBytes: number;
    readonly replacementSurfaceBytes: number;
    readonly structuralEditOperations: number;
    readonly immutableDiffCount: 0;
    readonly capabilityIdsAdded: readonly [];
    readonly capabilityIdsRemoved: readonly [];
  };
  readonly handoffBoundary: {
    readonly state: "awaiting_non_promotable_quarantine";
    readonly evaluatorReleaseAllowed: false;
    readonly onlyAllowedDestination:
      "candidate_quarantine_authority";
    readonly quarantineRequiredBeforeEvaluation: true;
  };
  readonly capabilities: {
    readonly oracleAccess: false;
    readonly scorerOutputAccess: false;
    readonly gateAccess: false;
    readonly finalAccess: false;
  };
  readonly developmentOnly: true;
  readonly authorizedForResearchEvidence: false;
  readonly createdAt: string;
  readonly proposer: PrincipalIdentity;
  readonly proposalHash: string;
  readonly publicPrincipal: PublicPrincipal;
  readonly attestation: Attestation;
}

type ProposalCore = Omit<
  DevelopmentBoundaryMutationProposal,
  "proposalHash" | "publicPrincipal" | "attestation"
>;
type SignedBody = Omit<
  DevelopmentBoundaryMutationProposal,
  "attestation"
>;

function coreOf(
  proposal: DevelopmentBoundaryMutationProposal,
): ProposalCore {
  const {
    proposalHash: _proposalHash,
    publicPrincipal: _publicPrincipal,
    attestation: _attestation,
    ...core
  } = proposal;
  return core;
}

function signedBodyOf(
  proposal: DevelopmentBoundaryMutationProposal,
): SignedBody {
  const { attestation: _attestation, ...body } = proposal;
  return body;
}

export class DevelopmentBoundaryMutationService {
  readonly #registry: HarnessComponentRegistry;
  readonly #schemas: SchemaRegistry;
  readonly #proposer: PrincipalSigner;

  public constructor(input: {
    readonly registry: HarnessComponentRegistry;
    readonly schemas: SchemaRegistry;
    readonly proposer: PrincipalSigner;
  }) {
    assertCondition(
      input.proposer.identity.role === "proposer",
      "AUTHORIZATION_DENIED",
      "Process-isolated mutation requires proposer authority",
    );
    this.#registry = input.registry;
    this.#schemas = input.schemas;
    this.#proposer = input.proposer;
  }

  public async create(input: {
    readonly proposalId: string;
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
  }): Promise<DevelopmentBoundaryMutationProposal> {
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
      "Every process-boundary mutation needs one semantic operation label",
    );
    const prediction = input.predictionSet.predictions.find(
      (entry) =>
        entry.traceProjectionId ===
        input.selectedTraceProjectionId,
    );
    assertCondition(
      prediction?.status === "predicted" &&
        prediction.rankedComponentTypes[0] !== undefined,
      "ARTIFACT_UNAVAILABLE",
      "Process-boundary mutation requires a committed top-1 prediction",
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
      "Synthetic parent must expose exactly one enabled component matching the committed top-1 type",
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
      "Process-boundary mutation exceeds 8192 bytes",
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
      dependencyManifestIds:
        this.#registry.dependencyIdsFor(
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
        diff.disabledConditionalDiffCount === 0 &&
        canonicalize(
          this.#registry.capabilitiesFor(
            before.componentManifestId,
          ),
        ) ===
          canonicalize(
            this.#registry.capabilitiesFor(
              after.componentManifestId,
            ),
          ),
      "AUTHORIZATION_DENIED",
      "Process-boundary mutation escaped the single mutable component or capability boundary",
    );
    const core: ProposalCore = {
      schemaVersion: 1,
      proposalId: input.proposalId,
      proposalType:
        "process_isolated_development_mutation",
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
        operations: [...input.operations],
        semanticOperations: [
          ...input.semanticOperations,
        ],
        expandedClosureEditBytes:
          measure.expandedClosureEditBytes,
        replacementSurfaceBytes:
          measure.replacementSurfaceBytes,
        structuralEditOperations:
          measure.structuralEditOperations,
        immutableDiffCount: 0,
        capabilityIdsAdded: [],
        capabilityIdsRemoved: [],
      },
      handoffBoundary: {
        state: "awaiting_non_promotable_quarantine",
        evaluatorReleaseAllowed: false,
        onlyAllowedDestination:
          "candidate_quarantine_authority",
        quarantineRequiredBeforeEvaluation: true,
      },
      capabilities: {
        oracleAccess: false,
        scorerOutputAccess: false,
        gateAccess: false,
        finalAccess: false,
      },
      developmentOnly: true,
      authorizedForResearchEvidence: false,
      createdAt: input.createdAt,
      proposer: this.#proposer.identity,
    };
    const publicPrincipal = this.#proposer.exportPublic();
    const body: SignedBody = {
      ...core,
      proposalHash: sha256(core as unknown as JsonValue),
      publicPrincipal,
    };
    const proposal: DevelopmentBoundaryMutationProposal = {
      ...body,
      attestation: this.#proposer.attest(
        body as unknown as JsonValue,
      ),
    };
    verifyDevelopmentBoundaryMutation({
      proposal,
      manifest: input.manifest,
      corpus: input.corpus,
      predictionSet: input.predictionSet,
      commitment: input.commitment,
      registry: this.#registry,
      schemas: this.#schemas,
    });
    return proposal;
  }
}

export function verifyDevelopmentBoundaryMutation(input: {
  readonly proposal: DevelopmentBoundaryMutationProposal;
  readonly manifest: DevelopmentAttributionPrototypeManifest;
  readonly corpus: LabelBlindAttributionCorpus;
  readonly predictionSet: DevelopmentAttributionPredictionSet;
  readonly commitment: DevelopmentAttributionCommitment;
  readonly registry: HarnessComponentRegistry;
  readonly schemas: SchemaRegistry;
}): void {
  input.schemas.validate(
    DEVELOPMENT_BOUNDARY_MUTATION_SCHEMA_ID,
    input.proposal as unknown as JsonValue,
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
      input.proposal.selectedTraceProjectionId,
  );
  const diff = input.registry.diffHarnesses(
    input.proposal.parentHarnessVersionId,
    input.proposal.candidateHarnessVersionId,
  );
  assertCondition(
    prediction?.status === "predicted" &&
      prediction.rankedComponentTypes[0]
        ?.componentType ===
        input.proposal.selectedComponentType &&
      diff.changed.length === 1 &&
      diff.immutableDiffCount === 0 &&
      diff.disabledConditionalDiffCount === 0,
    "HASH_MISMATCH",
    "Process-boundary mutation does not follow its sealed top-1 prediction",
  );
  assertCondition(
    input.proposal.proposer.role === "proposer" &&
      canonicalize(
        input.proposal.publicPrincipal.identity,
      ) === canonicalize(input.proposal.proposer) &&
      input.proposal.proposalHash ===
        sha256(
          coreOf(
            input.proposal,
          ) as unknown as JsonValue,
        ),
    "AUTHORIZATION_DENIED",
    "Process-boundary mutation proposal authority or hash changed",
  );
  const principals = new PrincipalRegistry();
  principals.register(input.proposal.publicPrincipal);
  principals.verify(
    input.proposal.proposer,
    signedBodyOf(
      input.proposal,
    ) as unknown as JsonValue,
    input.proposal.attestation,
  );
}
