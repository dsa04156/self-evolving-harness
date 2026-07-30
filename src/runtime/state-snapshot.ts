import path from "node:path";

import {
  contentId,
  sha256,
  type JsonValue,
} from "../core/canonical.js";
import { assertCondition } from "../core/errors.js";
import { SCHEMA_BASE_URL, type SchemaRegistry } from "../contracts/schema-registry.js";
import type { ArtifactReference } from "../domain/components.js";
import { AppendOnlyLog } from "../storage/append-only-log.js";
import type { ArtifactStore } from "../storage/artifact-store.js";

export const RUNTIME_STATE_SNAPSHOT_SCHEMA_ID =
  `${SCHEMA_BASE_URL}runtime-state-snapshot.schema.json`;

const REQUIRED_INHERITANCE_FIELDS = [
  "budgetAccountId",
  "datasetPermissions",
  "harnessVersionId",
  "modelIdentityHash",
  "principalDelegation",
  "protocolId",
  "runtimeStateSnapshotId",
] as const;

export interface RuntimeStateSnapshotIdentity {
  readonly canonicalizationProfile: "seh-c14n-int-v1";
  readonly protocolId: string;
  readonly harnessVersionId: string;
  readonly memory: {
    readonly mode: "fresh_empty" | "fixed_readonly" | "fixed_copy_on_write";
    readonly manifest: ArtifactReference | null;
  };
  readonly workspace: {
    readonly baseFilesystem: ArtifactReference;
    readonly repositoryTreeHash: string;
    readonly overlayMode: "fresh_copy_on_write";
    readonly untrackedFilesAllowed: false;
  };
  readonly environment: {
    readonly containerImageDigest: string;
    readonly toolchainDigest: string;
    readonly os: string;
    readonly architecture: "x86_64" | "aarch64";
    readonly locale: "C.UTF-8";
    readonly timezone: "UTC";
    readonly clockMode: "fixed_epoch" | "recorded_real_time";
    readonly randomSeed: number;
    readonly environmentAllowlistHash: string;
  };
  readonly checkpoint: {
    readonly mode: "none" | "fixed";
    readonly artifact: ArtifactReference | null;
  };
  readonly caches: {
    readonly providerCacheMode: "disabled" | "provider_reported_and_charged";
    readonly runtimeCacheMode: "fresh_empty" | "fixed_readonly";
    readonly manifest: ArtifactReference | null;
  };
  readonly policyPins: {
    readonly permissionPolicyHash: string;
    readonly safetyPolicyHash: string;
    readonly modelIdentityHash: string;
    readonly budgetPolicyHash: string;
    readonly networkPolicyHash: string;
  };
  readonly inheritance: {
    readonly descendantsMustInherit: true;
    readonly rebindAllowed: false;
    readonly pinnedFields: readonly (
      typeof REQUIRED_INHERITANCE_FIELDS
    )[number][];
  };
}

export interface RuntimeStateSnapshot {
  readonly schemaVersion: 1;
  readonly snapshotId: string;
  readonly snapshotHash: string;
  readonly identity: RuntimeStateSnapshotIdentity;
}

function asSnapshot(value: JsonValue): RuntimeStateSnapshot {
  return value as unknown as RuntimeStateSnapshot;
}

function snapshotArtifacts(
  identity: RuntimeStateSnapshotIdentity,
): ArtifactReference[] {
  return [
    identity.memory.manifest,
    identity.workspace.baseFilesystem,
    identity.checkpoint.artifact,
    identity.caches.manifest,
  ].filter((reference): reference is ArtifactReference => reference !== null);
}

export class RuntimeStateSnapshotStore {
  readonly #schemas: SchemaRegistry;
  readonly #artifacts: ArtifactStore;
  readonly #log: AppendOnlyLog<JsonValue>;
  readonly #snapshots = new Map<string, RuntimeStateSnapshot>();

  public constructor(input: {
    root: string;
    schemas: SchemaRegistry;
    artifacts: ArtifactStore;
  }) {
    this.#schemas = input.schemas;
    this.#artifacts = input.artifacts;
    this.#log = new AppendOnlyLog<JsonValue>(
      path.join(input.root, "runtime"),
      "state.snapshots",
    );
  }

  public async initialize(): Promise<void> {
    await this.#artifacts.initialize();
    for (const record of await this.#log.readAll()) {
      const snapshot = asSnapshot(record.payload);
      await this.verify(snapshot);
      assertCondition(
        !this.#snapshots.has(snapshot.snapshotId),
        "CONFLICT",
        "Duplicate runtime state snapshot",
      );
      this.#snapshots.set(snapshot.snapshotId, snapshot);
    }
  }

  public async create(
    identity: RuntimeStateSnapshotIdentity,
  ): Promise<RuntimeStateSnapshot> {
    await this.#validateIdentity(identity);
    const snapshot: RuntimeStateSnapshot = {
      schemaVersion: 1,
      snapshotId: contentId("rss-sha256", identity),
      snapshotHash: sha256(identity),
      identity,
    };
    this.#schemas.validate(
      RUNTIME_STATE_SNAPSHOT_SCHEMA_ID,
      snapshot as unknown as JsonValue,
    );
    const existing = this.#snapshots.get(snapshot.snapshotId);
    if (existing !== undefined) return existing;
    await this.#log.append(snapshot as unknown as JsonValue);
    this.#snapshots.set(snapshot.snapshotId, snapshot);
    return snapshot;
  }

  public get(snapshotId: string): RuntimeStateSnapshot {
    const snapshot = this.#snapshots.get(snapshotId);
    assertCondition(
      snapshot !== undefined,
      "ARTIFACT_UNAVAILABLE",
      `Missing runtime state snapshot ${snapshotId}`,
    );
    return snapshot;
  }

  public async verify(snapshot: RuntimeStateSnapshot): Promise<void> {
    this.#schemas.validate(
      RUNTIME_STATE_SNAPSHOT_SCHEMA_ID,
      snapshot as unknown as JsonValue,
    );
    assertCondition(
      snapshot.snapshotId === contentId("rss-sha256", snapshot.identity) &&
        snapshot.snapshotHash === sha256(snapshot.identity) &&
        snapshot.snapshotId.slice("rss-sha256:".length) ===
          snapshot.snapshotHash.slice("sha256:".length),
      "HASH_MISMATCH",
      "Runtime state snapshot identity mismatch",
    );
    await this.#validateIdentity(snapshot.identity);
  }

  public async verifyAll(): Promise<void> {
    for (const snapshot of this.#snapshots.values()) {
      await this.verify(snapshot);
    }
  }

  async #validateIdentity(
    identity: RuntimeStateSnapshotIdentity,
  ): Promise<void> {
    assertCondition(
      (identity.memory.mode === "fresh_empty") ===
        (identity.memory.manifest === null),
      "SCHEMA_INVALID",
      "Memory mode and manifest disagree",
    );
    assertCondition(
      (identity.checkpoint.mode === "none") ===
        (identity.checkpoint.artifact === null),
      "SCHEMA_INVALID",
      "Checkpoint mode and artifact disagree",
    );
    assertCondition(
      (identity.caches.runtimeCacheMode === "fresh_empty") ===
        (identity.caches.manifest === null),
      "SCHEMA_INVALID",
      "Runtime cache mode and manifest disagree",
    );
    assertCondition(
      JSON.stringify([...identity.inheritance.pinnedFields].sort()) ===
        JSON.stringify(REQUIRED_INHERITANCE_FIELDS),
      "SCHEMA_INVALID",
      "Runtime snapshot does not pin the exact descendant inheritance fields",
    );
    for (const artifact of snapshotArtifacts(identity)) {
      await this.#artifacts.verify(artifact);
    }
  }
}
