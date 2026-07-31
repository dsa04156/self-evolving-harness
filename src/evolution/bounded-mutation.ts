import path from "node:path";

import {
  canonicalBytes,
  canonicalize,
  parseStrictJson,
  sha256,
  type JsonValue,
} from "../core/canonical.js";
import type { Clock, IdFactory } from "../core/determinism.js";
import { HarnessError, assertCondition } from "../core/errors.js";
import { SCHEMA_BASE_URL, type SchemaRegistry } from "../contracts/schema-registry.js";
import type { HarnessVersionManifest } from "../domain/components.js";
import type { InferenceMetadata } from "../evidence/runtime-events.js";
import type { HarnessComponentRegistry } from "../harness/component-registry.js";
import { AppendOnlyLog } from "../storage/append-only-log.js";
import type { PrincipalIdentity } from "../trust/identity.js";

export const MUTATION_PROPOSAL_SCHEMA_ID =
  `${SCHEMA_BASE_URL}mutation-proposal.schema.json`;

export interface JsonPatchOperation {
  readonly op: "add" | "remove" | "replace";
  readonly path: string;
  readonly value?: JsonValue;
}

export interface MutationTarget {
  readonly componentManifestId: string;
  readonly nextSemanticVersion: string;
  readonly operations: readonly JsonPatchOperation[];
  readonly semanticOperations: readonly string[];
}

export interface MutationProposal {
  readonly schemaVersion: 2;
  readonly mutationProposalId: string;
  readonly protocolId: string;
  readonly parentHarnessVersionId: string;
  readonly candidateHarnessVersionId: string;
  readonly attributionMode: "guided" | "ablated";
  readonly attributionResultId: string | null;
  readonly causeClass: "single_fault" | "multi_cause";
  readonly primaryFailureMechanism: string;
  readonly targetChanges: readonly {
    readonly componentId: string;
    readonly before: ReturnType<HarnessComponentRegistry["referenceFor"]>;
    readonly after: ReturnType<HarnessComponentRegistry["referenceFor"]>;
    readonly directlyEdited: boolean;
    readonly changedArtifactHashes: readonly string[];
    readonly semanticOperations: readonly string[];
  }[];
  readonly changeSurface: {
    readonly changedComponentCount: number;
    readonly expandedClosureEditBytes: number;
    readonly replacementSurfaceBytes: number;
    readonly normalizedTokenInsertions: number;
    readonly normalizedTokenDeletions: number;
    readonly structuralEditOperations: number;
    readonly capabilityIdsAdded: readonly [];
    readonly capabilityIdsRemoved: readonly string[];
    readonly parentClosureHash: string;
    readonly candidateClosureHash: string;
  };
  readonly predictedFix: string;
  readonly predictedRegressions: readonly string[];
  readonly passingBehaviorPreservation: readonly string[];
  readonly rejectedEditComparison: {
    readonly nearestRejectedProposalIds: readonly string[];
    readonly isEquivalent: false;
    readonly differenceSummary: string;
  };
  readonly immutableDiffCount: 0;
  readonly disabledConditionalDiffCount: 0;
  readonly predictionMetadata: InferenceMetadata;
  readonly proposer: PrincipalIdentity;
  readonly createdAt: string;
}

export type MutationProposalDisposition =
  | "pending"
  | "admitted"
  | "accepted"
  | "rejected";

interface ProposalRecord {
  readonly proposal: MutationProposal;
  readonly mutationSignature: string;
  readonly disposition: MutationProposalDisposition;
}

function decodePointer(pointer: string): string[] {
  assertCondition(
    pointer.startsWith("/") && pointer.length > 1,
    "SCHEMA_INVALID",
    "Mutation path must be a non-root JSON Pointer",
  );
  return pointer
    .slice(1)
    .split("/")
    .map((part) => part.replace(/~1/gu, "/").replace(/~0/gu, "~"))
    .map((part) => {
      assertCondition(
        part !== "__proto__" && part !== "prototype" && part !== "constructor",
        "AUTHORIZATION_DENIED",
        "Prototype mutation is forbidden",
      );
      return part;
    });
}

function cloneJson(value: JsonValue): JsonValue {
  return parseStrictJson(canonicalize(value));
}

function applyOperation(root: JsonValue, operation: JsonPatchOperation): void {
  const parts = decodePointer(operation.path);
  let parent: JsonValue = root;
  for (const part of parts.slice(0, -1)) {
    if (Array.isArray(parent)) {
      const index = Number(part);
      assertCondition(
        Number.isSafeInteger(index) && index >= 0 && index < parent.length,
        "SCHEMA_INVALID",
        `Invalid array pointer ${operation.path}`,
      );
      parent = parent[index]!;
    } else {
      assertCondition(
        typeof parent === "object" && parent !== null && part in parent,
        "SCHEMA_INVALID",
        `Missing pointer ${operation.path}`,
      );
      parent = parent[part]!;
    }
  }
  const leaf = parts.at(-1)!;
  if (Array.isArray(parent)) {
    if (operation.op === "add" && leaf === "-") {
      assertCondition(operation.value !== undefined, "SCHEMA_INVALID", "Add requires value");
      parent.push(cloneJson(operation.value));
      return;
    }
    const index = Number(leaf);
    assertCondition(
      Number.isSafeInteger(index) && index >= 0,
      "SCHEMA_INVALID",
      `Invalid array index ${leaf}`,
    );
    if (operation.op === "add") {
      assertCondition(index <= parent.length, "SCHEMA_INVALID", "Array add is out of range");
      assertCondition(operation.value !== undefined, "SCHEMA_INVALID", "Add requires value");
      parent.splice(index, 0, cloneJson(operation.value));
    } else if (operation.op === "remove") {
      assertCondition(index < parent.length, "SCHEMA_INVALID", "Array remove is out of range");
      parent.splice(index, 1);
    } else {
      assertCondition(index < parent.length, "SCHEMA_INVALID", "Array replace is out of range");
      assertCondition(operation.value !== undefined, "SCHEMA_INVALID", "Replace requires value");
      parent[index] = cloneJson(operation.value);
    }
    return;
  }
  assertCondition(
    typeof parent === "object" && parent !== null,
    "SCHEMA_INVALID",
    "Pointer parent is not a container",
  );
  if (operation.op === "add") {
    assertCondition(!(leaf in parent), "CONFLICT", "Add target already exists");
    assertCondition(operation.value !== undefined, "SCHEMA_INVALID", "Add requires value");
    parent[leaf] = cloneJson(operation.value);
  } else if (operation.op === "remove") {
    assertCondition(leaf in parent, "SCHEMA_INVALID", "Remove target is missing");
    delete parent[leaf];
  } else {
    assertCondition(leaf in parent, "SCHEMA_INVALID", "Replace target is missing");
    assertCondition(operation.value !== undefined, "SCHEMA_INVALID", "Replace requires value");
    parent[leaf] = cloneJson(operation.value);
  }
}

export function applyJsonPatchOperations(
  beforePayload: JsonValue,
  operations: readonly JsonPatchOperation[],
): JsonValue {
  assertCondition(
    operations.length >= 1 && operations.length <= 64,
    "SCHEMA_INVALID",
    "Mutation target has an invalid operation count",
  );
  const afterPayload = cloneJson(beforePayload);
  for (const operation of operations) {
    applyOperation(afterPayload, operation);
  }
  return afterPayload;
}

function tokenSet(value: JsonValue): Set<string> {
  return new Set(
    canonicalize(value)
      .toLocaleLowerCase("en-US")
      .match(/[\p{L}\p{N}_-]+/gu) ?? [],
  );
}

export interface PayloadMutationMeasure {
  readonly expandedClosureEditBytes: number;
  readonly replacementSurfaceBytes: number;
  readonly normalizedTokenInsertions: number;
  readonly normalizedTokenDeletions: number;
  readonly structuralEditOperations: number;
}

export function measurePayloadMutation(
  beforePayload: JsonValue,
  afterPayload: JsonValue,
  structuralEditOperations: number,
): PayloadMutationMeasure {
  assertCondition(
    Number.isSafeInteger(structuralEditOperations) &&
      structuralEditOperations >= 1,
    "SCHEMA_INVALID",
    "Mutation needs at least one structural operation",
  );
  const beforeBytes = canonicalBytes(beforePayload).byteLength;
  const afterBytes = canonicalBytes(afterPayload).byteLength;
  const beforeTokens = tokenSet(beforePayload);
  const afterTokens = tokenSet(afterPayload);
  return {
    // This conservative metric is independently reproducible from the two
    // content-addressed payloads; patch syntax is intentionally not trusted.
    expandedClosureEditBytes: beforeBytes + afterBytes,
    replacementSurfaceBytes: afterBytes,
    normalizedTokenInsertions: [...afterTokens].filter(
      (token) => !beforeTokens.has(token),
    ).length,
    normalizedTokenDeletions: [...beforeTokens].filter(
      (token) => !afterTokens.has(token),
    ).length,
    structuralEditOperations,
  };
}

export class BoundedMutationEngine {
  readonly #protocolId: string;
  readonly #registry: HarnessComponentRegistry;
  readonly #schemas: SchemaRegistry;
  readonly #clock: Clock;
  readonly #ids: IdFactory;
  readonly #proposer: PrincipalIdentity;
  readonly #log: AppendOnlyLog<JsonValue>;

  public constructor(input: {
    root: string;
    protocolId: string;
    registry: HarnessComponentRegistry;
    schemas: SchemaRegistry;
    clock: Clock;
    ids: IdFactory;
    proposer: PrincipalIdentity;
  }) {
    assertCondition(
      input.proposer.role === "proposer",
      "AUTHORIZATION_DENIED",
      "Bounded mutation requires proposer identity",
    );
    this.#protocolId = input.protocolId;
    this.#registry = input.registry;
    this.#schemas = input.schemas;
    this.#clock = input.clock;
    this.#ids = input.ids;
    this.#proposer = input.proposer;
    this.#log = new AppendOnlyLog<JsonValue>(
      path.join(input.root, "evolution"),
      "mutation.proposals",
    );
  }

  public async propose(input: {
    parentHarnessVersionId: string;
    candidateSemanticVersion: string;
    attributionMode: "guided" | "ablated";
    attributionResultId: string | null;
    causeClass: "single_fault" | "multi_cause";
    primaryFailureMechanism: string;
    targets: readonly MutationTarget[];
    predictedFix: string;
    predictedRegressions: readonly string[];
    passingBehaviorPreservation: readonly string[];
    predictionMetadata: InferenceMetadata;
  }): Promise<{ candidate: HarnessVersionManifest; proposal: MutationProposal }> {
    assertCondition(
      input.targets.length >= 1 && input.targets.length <= 2,
      "AUTHORIZATION_DENIED",
      "Bounded mutation changes one or two components",
    );
    assertCondition(
      (input.causeClass === "single_fault" && input.targets.length === 1) ||
        input.causeClass === "multi_cause",
      "SCHEMA_INVALID",
      "Cause class and target count disagree",
    );
    assertCondition(
      (input.attributionMode === "guided" && input.attributionResultId !== null) ||
        (input.attributionMode === "ablated" && input.attributionResultId === null),
      "SCHEMA_INVALID",
      "Attribution mode and result disagree",
    );
    const mutationSignature = sha256({
      parentHarnessVersionId: input.parentHarnessVersionId,
      targets: input.targets,
    });
    const rejected = (await this.#records()).filter(
      (record) => record.disposition === "rejected",
    );
    const equivalent = rejected.find((record) => record.mutationSignature === mutationSignature);
    if (equivalent !== undefined) {
      throw new HarnessError(
        "CONFLICT",
        `Mutation duplicates rejected proposal ${equivalent.proposal.mutationProposalId}`,
      );
    }

    const parent = this.#registry.getHarness(input.parentHarnessVersionId);
    const replacement = new Map<string, string>();
    const targetChanges: MutationProposal["targetChanges"][number][] = [];
    let expandedBytes = 0;
    let replacementBytes = 0;
    let insertions = 0;
    let deletions = 0;
    let structuralOperations = 0;
    for (const target of input.targets) {
      const before = this.#registry.getComponent(target.componentManifestId);
      const type = this.#registry.typeEntry(before.identity.typeRegistryRef.typeEntryId);
      assertCondition(
        type.mutableClass === "mutable" && type.mvpMutationEnabled,
        "AUTHORIZATION_DENIED",
        `${type.componentType} is not mutable in the MVP`,
      );
      assertCondition(
        parent.identity.componentBindings.some(
          (binding) => binding.component.componentManifestId === target.componentManifestId,
        ),
        "AUTHORIZATION_DENIED",
        "Mutation target is not bound by the parent harness",
      );
      assertCondition(
        target.operations.length >= 1 && target.operations.length <= 64,
        "SCHEMA_INVALID",
        "Mutation target has an invalid operation count",
      );
      assertCondition(
        target.semanticOperations.length === target.operations.length,
        "SCHEMA_INVALID",
        "Every structural operation needs one semantic operation label",
      );
      const beforePayload = await this.#registry.getPayload(target.componentManifestId);
      const afterPayload = applyJsonPatchOperations(
        beforePayload,
        target.operations,
      );
      const measure = measurePayloadMutation(
        beforePayload,
        afterPayload,
        target.operations.length,
      );
      expandedBytes += measure.expandedClosureEditBytes;
      replacementBytes += measure.replacementSurfaceBytes;
      structuralOperations += measure.structuralEditOperations;
      insertions += measure.normalizedTokenInsertions;
      deletions += measure.normalizedTokenDeletions;
      const after = await this.#registry.createComponent({
        componentId: before.identity.componentId,
        semanticVersion: target.nextSemanticVersion,
        typeEntryId: before.identity.typeRegistryRef.typeEntryId,
        payloadLanguage: before.identity.payload.language,
        payload: afterPayload,
        capabilityIds: this.#registry.capabilitiesFor(target.componentManifestId),
        dependencyManifestIds: this.#registry.dependencyIdsFor(target.componentManifestId),
      });
      replacement.set(target.componentManifestId, after.componentManifestId);
      targetChanges.push({
        componentId: before.identity.componentId,
        before: this.#registry.referenceFor(before.componentManifestId),
        after: this.#registry.referenceFor(after.componentManifestId),
        directlyEdited: true,
        changedArtifactHashes: [
          before.identity.payload.artifact.contentHash,
          after.identity.payload.artifact.contentHash,
        ].sort(),
        semanticOperations: [...target.semanticOperations],
      });
    }
    assertCondition(
      expandedBytes >= 1 && expandedBytes <= 8192,
      "PAYLOAD_TOO_LARGE",
      "Expanded mutation exceeds 8192-byte admission ceiling",
    );
    const candidate = await this.#registry.createHarness({
      semanticVersion: input.candidateSemanticVersion,
      requiredRuntimeContractHash: parent.identity.requiredRuntimeContractHash,
      bindings: parent.identity.componentBindings.map((binding) => ({
        slotId: binding.slotId,
        componentManifestId:
          replacement.get(binding.component.componentManifestId) ??
          binding.component.componentManifestId,
      })),
    });
    const diff = this.#registry.diffHarnesses(parent.harnessVersionId, candidate.harnessVersionId);
    assertCondition(
      diff.changed.length === input.targets.length &&
        diff.immutableDiffCount === 0 &&
        diff.disabledConditionalDiffCount === 0,
      "AUTHORIZATION_DENIED",
      "Candidate closure changed outside the bounded mutable target set",
    );
    const nearestRejected = rejected
      .slice(-3)
      .map((record) => record.proposal.mutationProposalId);
    const proposal: MutationProposal = {
      schemaVersion: 2,
      mutationProposalId: this.#ids.next("mutation-proposal"),
      protocolId: this.#protocolId,
      parentHarnessVersionId: parent.harnessVersionId,
      candidateHarnessVersionId: candidate.harnessVersionId,
      attributionMode: input.attributionMode,
      attributionResultId: input.attributionResultId,
      causeClass: input.causeClass,
      primaryFailureMechanism: input.primaryFailureMechanism,
      targetChanges,
      changeSurface: {
        changedComponentCount: diff.changed.length,
        expandedClosureEditBytes: expandedBytes,
        replacementSurfaceBytes: replacementBytes,
        normalizedTokenInsertions: insertions,
        normalizedTokenDeletions: deletions,
        structuralEditOperations: structuralOperations,
        capabilityIdsAdded: [],
        capabilityIdsRemoved: [],
        parentClosureHash: parent.identity.behaviorClosure.closureHash,
        candidateClosureHash: candidate.identity.behaviorClosure.closureHash,
      },
      predictedFix: input.predictedFix,
      predictedRegressions: [...input.predictedRegressions],
      passingBehaviorPreservation: [...input.passingBehaviorPreservation],
      rejectedEditComparison: {
        nearestRejectedProposalIds: nearestRejected,
        isEquivalent: false,
        differenceSummary:
          nearestRejected.length === 0
            ? "No earlier rejected proposal exists."
            : "Mutation signature differs from every retained rejected proposal.",
      },
      immutableDiffCount: 0,
      disabledConditionalDiffCount: 0,
      predictionMetadata: input.predictionMetadata,
      proposer: this.#proposer,
      createdAt: this.#clock.now().toISOString(),
    };
    this.#schemas.validate(MUTATION_PROPOSAL_SCHEMA_ID, proposal as unknown as JsonValue);
    await this.#log.append({
      proposal,
      mutationSignature,
      disposition: "pending",
    } as unknown as JsonValue);
    return { candidate, proposal };
  }

  public async setDisposition(
    mutationProposalId: string,
    disposition: "accepted" | "rejected",
  ): Promise<void> {
    await this.#transitionDisposition(mutationProposalId, disposition, [
      "pending",
      "admitted",
    ]);
  }

  public async markAdmitted(mutationProposalId: string): Promise<void> {
    await this.#transitionDisposition(mutationProposalId, "admitted", [
      "pending",
    ]);
  }

  public async finalizeDisposition(
    mutationProposalId: string,
    disposition: "accepted" | "rejected",
  ): Promise<void> {
    const current = await this.#latestRecord(mutationProposalId);
    if (current.disposition === disposition) return;
    assertCondition(
      current.disposition === "admitted",
      "CONFLICT",
      "Only an admitted proposal can receive a qualification disposition",
    );
    await this.#appendDisposition(current, disposition);
  }

  public async disposition(
    mutationProposalId: string,
  ): Promise<MutationProposalDisposition> {
    return (await this.#latestRecord(mutationProposalId)).disposition;
  }

  async #transitionDisposition(
    mutationProposalId: string,
    disposition: MutationProposalDisposition,
    allowedFrom: readonly MutationProposalDisposition[],
  ): Promise<void> {
    const current = await this.#latestRecord(mutationProposalId);
    assertCondition(
      allowedFrom.includes(current.disposition),
      "CONFLICT",
      `Proposal cannot transition ${current.disposition} → ${disposition}`,
    );
    await this.#appendDisposition(current, disposition);
  }

  async #latestRecord(mutationProposalId: string): Promise<ProposalRecord> {
    const current = (await this.#records())
      .filter((record) => record.proposal.mutationProposalId === mutationProposalId)
      .at(-1);
    assertCondition(current !== undefined, "ARTIFACT_UNAVAILABLE", "Unknown mutation proposal");
    return current;
  }

  async #appendDisposition(
    current: ProposalRecord,
    disposition: MutationProposalDisposition,
  ): Promise<void> {
    await this.#log.append({
      proposal: current.proposal,
      mutationSignature: current.mutationSignature,
      disposition,
    } as unknown as JsonValue);
  }

  public async verifyPendingProposal(proposal: MutationProposal): Promise<void> {
    this.#schemas.validate(
      MUTATION_PROPOSAL_SCHEMA_ID,
      proposal as unknown as JsonValue,
    );
    const current = (await this.#records())
      .filter(
        (record) =>
          record.proposal.mutationProposalId === proposal.mutationProposalId,
      )
      .at(-1);
    assertCondition(
      current !== undefined,
      "ARTIFACT_UNAVAILABLE",
      "Mutation proposal is not in the proposer journal",
    );
    assertCondition(
      current.disposition === "pending" &&
        sha256(current.proposal) === sha256(proposal),
      "HASH_MISMATCH",
      "Mutation proposal is not the exact pending journal record",
    );
  }

  async #records(): Promise<ProposalRecord[]> {
    return (await this.#log.readAll()).map(
      (record) => record.payload as unknown as ProposalRecord,
    );
  }
}
