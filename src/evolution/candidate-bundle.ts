import { constants } from "node:fs";
import { mkdir, open, unlink } from "node:fs/promises";
import path from "node:path";

import {
  canonicalBytes,
  contentId,
  sha256,
  type JsonValue,
} from "../core/canonical.js";
import { assertCondition } from "../core/errors.js";
import {
  SCHEMA_BASE_URL,
  type SchemaRegistry,
} from "../contracts/schema-registry.js";
import type {
  ComponentManifest,
  HarnessVersionManifest,
} from "../domain/components.js";
import type { EvidenceReceiptStore } from "../evidence/receipts.js";
import type {
  HarnessClosureComponent,
  HarnessComponentRegistry,
} from "../harness/component-registry.js";
import type { ArtifactReference } from "../domain/components.js";
import type { ArtifactStore } from "../storage/artifact-store.js";
import type { PrincipalSigner } from "../trust/identity.js";
import {
  type CandidateBundleCommit,
  type CandidateWorktree,
  type FilesystemSnapshotDescriptor,
  type FrozenWorktreeState,
  GitWorktreeManager,
  type MaterializedSnapshot,
} from "./worktree-isolation.js";

export const CANDIDATE_HARNESS_BUNDLE_SCHEMA_ID =
  `${SCHEMA_BASE_URL}candidate-harness-bundle.schema.json`;
export const FILESYSTEM_SNAPSHOT_SCHEMA_ID =
  `${SCHEMA_BASE_URL}filesystem-snapshot.schema.json`;

export interface CandidateHarnessBundleIdentity {
  readonly canonicalizationProfile: "seh-c14n-int-v1";
  readonly protocolId: string;
  readonly parentHarnessVersionId: string;
  readonly candidateHarnessVersionId: string;
  readonly sourceBaseCommit: string;
  readonly typeRegistryId: string;
  readonly harnessManifestHash: string;
  readonly behaviorClosureHash: string;
  readonly componentManifestIds: readonly string[];
}

export interface CandidateHarnessBundle {
  readonly schemaVersion: 1;
  readonly bundleId: string;
  readonly identity: CandidateHarnessBundleIdentity;
  readonly harnessManifest: HarnessVersionManifest;
  readonly componentEntries: readonly HarnessClosureComponent[];
}

export interface IsolatedCandidateBundle {
  readonly evolutionRunId: string;
  readonly parentHarnessVersionId: string;
  readonly candidateHarnessVersionId: string;
  readonly bundle: CandidateHarnessBundle;
  readonly bundleArtifact: ArtifactReference;
  readonly descriptorArtifact: ArtifactReference;
  readonly worktree: CandidateWorktree;
  readonly commit: CandidateBundleCommit;
  readonly frozen: FrozenWorktreeState;
  readonly snapshot: MaterializedSnapshot;
  readonly snapshotDescriptor: FilesystemSnapshotDescriptor;
  readonly snapshotDescriptorPath: string;
  readonly evidenceReceiptIds: readonly string[];
}

type BundleCore = Omit<CandidateHarnessBundle, "bundleId">;

function bundleCore(bundle: CandidateHarnessBundle): BundleCore {
  const { bundleId: _bundleId, ...core } = bundle;
  return core;
}

function safeRunDirectoryName(
  evolutionRunId: string,
  candidateHarnessVersionId: string,
): string {
  return `candidate-${sha256({
    evolutionRunId,
    candidateHarnessVersionId,
  }).slice("sha256:".length)}`;
}

async function writeExclusiveCanonicalJson(
  file: string,
  value: JsonValue,
): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  const handle = await open(
    file,
    constants.O_WRONLY |
      constants.O_CREAT |
      constants.O_EXCL |
      constants.O_NOFOLLOW,
    0o600,
  );
  try {
    await handle.writeFile(canonicalBytes(value));
    await handle.sync();
  } finally {
    await handle.close();
  }
}

function componentManifestIds(
  entries: readonly HarnessClosureComponent[],
): string[] {
  return entries.map(
    (entry) => entry.componentManifest.componentManifestId,
  );
}

export async function createCandidateHarnessBundle(input: {
  protocolId: string;
  parentHarnessVersionId: string;
  candidate: HarnessVersionManifest;
  sourceBaseCommit: string;
  registry: HarnessComponentRegistry;
  schemas: SchemaRegistry;
}): Promise<CandidateHarnessBundle> {
  assertCondition(
    input.candidate.harnessVersionId !== input.parentHarnessVersionId,
    "PROTOCOL_MISMATCH",
    "Candidate bundle cannot represent a task retry or parent no-op",
  );
  const closure = await input.registry.exportHarnessClosure(
    input.candidate.harnessVersionId,
  );
  assertCondition(
    sha256(closure.harnessManifest) === sha256(input.candidate),
    "HASH_MISMATCH",
    "Candidate manifest differs from the registered harness",
  );
  const ids = componentManifestIds(closure.componentEntries);
  const identity: CandidateHarnessBundleIdentity = {
    canonicalizationProfile: "seh-c14n-int-v1",
    protocolId: input.protocolId,
    parentHarnessVersionId: input.parentHarnessVersionId,
    candidateHarnessVersionId: input.candidate.harnessVersionId,
    sourceBaseCommit: input.sourceBaseCommit,
    typeRegistryId: input.candidate.identity.typeRegistryId,
    harnessManifestHash: input.candidate.manifestHash,
    behaviorClosureHash:
      input.candidate.identity.behaviorClosure.closureHash,
    componentManifestIds: ids,
  };
  const core: BundleCore = {
    schemaVersion: 1,
    identity,
    harnessManifest: closure.harnessManifest,
    componentEntries: closure.componentEntries,
  };
  const bundle: CandidateHarnessBundle = {
    ...core,
    bundleId: contentId("bundle-sha256", core),
  };
  await verifyCandidateHarnessBundle({
    bundle,
    expectedProtocolId: input.protocolId,
    expectedParentHarnessVersionId: input.parentHarnessVersionId,
    expectedCandidateHarnessVersionId: input.candidate.harnessVersionId,
    expectedSourceBaseCommit: input.sourceBaseCommit,
    registry: input.registry,
    schemas: input.schemas,
  });
  return bundle;
}

export async function verifyCandidateHarnessBundle(input: {
  bundle: CandidateHarnessBundle;
  expectedProtocolId: string;
  expectedParentHarnessVersionId: string;
  expectedCandidateHarnessVersionId: string;
  expectedSourceBaseCommit: string;
  registry: HarnessComponentRegistry;
  schemas: SchemaRegistry;
}): Promise<void> {
  input.schemas.validate(
    CANDIDATE_HARNESS_BUNDLE_SCHEMA_ID,
    input.bundle as unknown as JsonValue,
  );
  assertCondition(
    input.bundle.bundleId ===
      contentId("bundle-sha256", bundleCore(input.bundle)),
    "HASH_MISMATCH",
    "Candidate bundle content ID mismatch",
  );
  const identity = input.bundle.identity;
  assertCondition(
    identity.protocolId === input.expectedProtocolId &&
      identity.parentHarnessVersionId ===
        input.expectedParentHarnessVersionId &&
      identity.candidateHarnessVersionId ===
        input.expectedCandidateHarnessVersionId &&
      identity.sourceBaseCommit === input.expectedSourceBaseCommit &&
      identity.parentHarnessVersionId !== identity.candidateHarnessVersionId,
    "PROTOCOL_MISMATCH",
    "Candidate bundle identity pins changed",
  );
  assertCondition(
    input.bundle.harnessManifest.harnessVersionId ===
      identity.candidateHarnessVersionId &&
      input.bundle.harnessManifest.manifestHash ===
        identity.harnessManifestHash &&
      input.bundle.harnessManifest.identity.typeRegistryId ===
        identity.typeRegistryId &&
      input.bundle.harnessManifest.identity.behaviorClosure.closureHash ===
        identity.behaviorClosureHash,
    "HASH_MISMATCH",
    "Candidate bundle manifest pins changed",
  );
  const entryIds = componentManifestIds(input.bundle.componentEntries);
  assertCondition(
    JSON.stringify(entryIds) ===
        JSON.stringify([...entryIds].sort()) &&
      new Set(entryIds).size === entryIds.length &&
      JSON.stringify(entryIds) ===
        JSON.stringify(identity.componentManifestIds),
    "SCHEMA_INVALID",
    "Candidate component closure is incomplete or noncanonical",
  );
  for (const entry of input.bundle.componentEntries) {
    await input.registry.validateDetachedComponent(
      entry.componentManifest,
      entry.payload,
    );
  }
  const registered = await input.registry.exportHarnessClosure(
    identity.candidateHarnessVersionId,
  );
  assertCondition(
    sha256(registered) ===
      sha256({
        harnessManifest: input.bundle.harnessManifest,
        componentEntries: input.bundle.componentEntries,
      }),
    "HASH_MISMATCH",
    "Candidate bundle differs from the registered component closure",
  );
}

export class CandidateBundleIsolationService {
  readonly #protocolId: string;
  readonly #baseRevision: string;
  readonly #root: string;
  readonly #registry: HarnessComponentRegistry;
  readonly #schemas: SchemaRegistry;
  readonly #artifacts: ArtifactStore;
  readonly #receipts: EvidenceReceiptStore;
  readonly #operationsSigner: PrincipalSigner;
  readonly #worktrees: GitWorktreeManager;
  readonly #prepared = new Map<string, IsolatedCandidateBundle>();

  public constructor(input: {
    protocolId: string;
    baseRevision?: string;
    root: string;
    registry: HarnessComponentRegistry;
    schemas: SchemaRegistry;
    artifacts: ArtifactStore;
    receipts: EvidenceReceiptStore;
    operationsSigner: PrincipalSigner;
    worktrees: GitWorktreeManager;
  }) {
    assertCondition(
      input.operationsSigner.identity.role === "operations_owner",
      "AUTHORIZATION_DENIED",
      "Candidate isolation requires operations-owner identity",
    );
    this.#protocolId = input.protocolId;
    this.#baseRevision = input.baseRevision ?? "HEAD";
    this.#root = path.resolve(input.root);
    this.#registry = input.registry;
    this.#schemas = input.schemas;
    this.#artifacts = input.artifacts;
    this.#receipts = input.receipts;
    this.#operationsSigner = input.operationsSigner;
    this.#worktrees = input.worktrees;
  }

  public async prepare(input: {
    evolutionRunId: string;
    parentHarnessVersionId: string;
    candidate: HarnessVersionManifest;
    mutationProposalId: string;
    staticValidationResultId: string;
  }): Promise<IsolatedCandidateBundle> {
    assertCondition(
      !this.#prepared.has(input.evolutionRunId),
      "CONFLICT",
      "Evolution run already has a prepared candidate bundle",
    );
    await this.#artifacts.initialize();
    const directoryName = safeRunDirectoryName(
      input.evolutionRunId,
      input.candidate.harnessVersionId,
    );
    let worktree: CandidateWorktree | null = null;
    let snapshot: MaterializedSnapshot | null = null;
    let descriptorPath: string | null = null;
    try {
      worktree = await this.#worktrees.create(
        directoryName,
        this.#baseRevision,
      );
      const bundle = await createCandidateHarnessBundle({
        protocolId: this.#protocolId,
        parentHarnessVersionId: input.parentHarnessVersionId,
        candidate: input.candidate,
        sourceBaseCommit: worktree.baseCommit,
        registry: this.#registry,
        schemas: this.#schemas,
      });
      const bundleArtifact = await this.#artifacts.putJson(
        bundle as unknown as JsonValue,
      );
      const commit = await this.#worktrees.commitCandidateBundle(
        worktree,
        bundle.bundleId,
        canonicalBytes(bundle as unknown as JsonValue),
      );
      const frozen = await this.#worktrees.freeze(worktree);
      assertCondition(
        frozen.headCommit === commit.candidateCommit &&
          frozen.treeHash === commit.candidateTreeHash &&
          frozen.entries.some(
            (entry) =>
              entry.path === commit.bundleRelativePath &&
              entry.contentHash === bundleArtifact.contentHash,
          ),
        "HASH_MISMATCH",
        "Frozen worktree does not contain the exact candidate bundle",
      );
      const snapshotDescriptor = this.#worktrees.snapshotDescriptor(frozen);
      this.#schemas.validate(
        FILESYSTEM_SNAPSHOT_SCHEMA_ID,
        snapshotDescriptor as unknown as JsonValue,
      );
      snapshot = await this.#worktrees.materializeSnapshot(
        frozen,
        path.join(this.#root, "snapshots", directoryName),
      );
      descriptorPath = path.join(
        this.#root,
        "descriptors",
        `${directoryName}.json`,
      );
      await writeExclusiveCanonicalJson(
        descriptorPath,
        snapshotDescriptor as unknown as JsonValue,
      );
      const descriptorArtifact = await this.#artifacts.putJson(
        snapshotDescriptor as unknown as JsonValue,
      );
      const receipt = await this.#receipts.create({
        receiptType: "artifact_retention",
        subjectIds: [
          input.evolutionRunId,
          input.parentHarnessVersionId,
          input.candidate.harnessVersionId,
          input.mutationProposalId,
          input.staticValidationResultId,
          bundle.bundleId,
          `git:${commit.candidateCommit}`,
          frozen.filesystemSnapshotHash,
        ],
        harnessVersionIds: [
          input.parentHarnessVersionId,
          input.candidate.harnessVersionId,
        ],
        artifactRefs: [bundleArtifact, descriptorArtifact],
        signer: this.#operationsSigner,
      });
      const prepared: IsolatedCandidateBundle = {
        evolutionRunId: input.evolutionRunId,
        parentHarnessVersionId: input.parentHarnessVersionId,
        candidateHarnessVersionId: input.candidate.harnessVersionId,
        bundle,
        bundleArtifact,
        descriptorArtifact,
        worktree,
        commit,
        frozen,
        snapshot,
        snapshotDescriptor,
        snapshotDescriptorPath: descriptorPath,
        evidenceReceiptIds: [receipt.receiptId],
      };
      this.#prepared.set(input.evolutionRunId, prepared);
      return prepared;
    } catch (error) {
      if (descriptorPath !== null) {
        await unlink(descriptorPath).catch(() => undefined);
      }
      if (snapshot !== null) {
        await this.#worktrees
          .disposeMaterializedSnapshot(snapshot)
          .catch(() => undefined);
      }
      if (worktree !== null) {
        await this.#worktrees.dispose(worktree).catch(() => undefined);
      }
      throw error;
    }
  }

  public get(evolutionRunId: string): IsolatedCandidateBundle {
    const prepared = this.#prepared.get(evolutionRunId);
    assertCondition(
      prepared !== undefined,
      "ARTIFACT_UNAVAILABLE",
      `No isolated candidate for ${evolutionRunId}`,
    );
    return prepared;
  }

  public async disposeEphemeral(evolutionRunId: string): Promise<void> {
    const prepared = this.get(evolutionRunId);
    await this.#worktrees.disposeMaterializedSnapshot(prepared.snapshot);
    await this.#worktrees.dispose(prepared.worktree);
    await unlink(prepared.snapshotDescriptorPath);
    this.#prepared.delete(evolutionRunId);
  }
}
