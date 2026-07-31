import path from "node:path";

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
  AppendOnlyLog,
  type AppendOnlyRecord,
} from "../storage/append-only-log.js";
import {
  PrincipalRegistry,
  type Attestation,
  type PrincipalIdentity,
  type PrincipalSigner,
  type PublicPrincipal,
} from "../trust/identity.js";
import {
  PERMANENT_PUBLIC_ELIGIBILITY,
  PUBLIC_EXPOSURE_ALLOWED_USES,
  PUBLIC_EXPOSURE_ARTIFACT_CLASSES,
  PUBLIC_EXPOSURE_RESTRICTED_USES,
  verifyPublicationDeviationRecord,
  verifyPublicationRemediationClosure,
  verifyPublicExposureLedger,
  type PermanentPublicEligibility,
  type PublicationDeviationRecord,
  type PublicationRemediationClosureRecord,
  type PublicExposureAllowedUse,
  type PublicExposureArtifactClass,
  type PublicExposureGraphNode,
  type PublicExposureLedger,
  type PublicExposureRestrictedUse,
  type PublicExposureUseClass,
  type PublishedArtifactInventory,
} from "./publication-exposure.js";

export const HISTORICAL_PUBLIC_OBJECT_INVENTORY_SCHEMA_ID =
  `${SCHEMA_BASE_URL}historical-public-object-inventory.schema.json`;
export const HISTORICAL_PUBLIC_EXPOSURE_LEDGER_SCHEMA_ID =
  `${SCHEMA_BASE_URL}historical-public-exposure-ledger.schema.json`;
export const PUBLICATION_SUPERSEDING_CLOSURE_SCHEMA_ID =
  `${SCHEMA_BASE_URL}publication-superseding-closure.schema.json`;

export interface HistoricalPublicationRoot {
  readonly ordinal: 0 | 1 | 2 | 3;
  readonly refName: "refs/heads/main";
  readonly commit: string;
  readonly tree: string;
  readonly publishedAt: string;
  readonly observationSource:
    | "local_remote_tracking_reflog"
    | "push_result_and_remote_ref_verification";
}

export const HISTORICAL_PUBLICATION_ROOTS:
  readonly HistoricalPublicationRoot[] = Object.freeze([
    {
      ordinal: 0,
      refName: "refs/heads/main",
      commit:
        "c041f7405790e9ff85af621b468b547adbfa4987",
      tree: "2911cf9e6d51561dab6541a98a0697d8015a3cc8",
      publishedAt: "2026-07-31T15:16:46+09:00",
      observationSource:
        "local_remote_tracking_reflog",
    },
    {
      ordinal: 1,
      refName: "refs/heads/main",
      commit:
        "88e39cdebf1df4db7688fff592363f5f867533ce",
      tree: "ccb20381cc3308cb71954789614144575870eb83",
      publishedAt: "2026-07-31T15:22:04+09:00",
      observationSource:
        "local_remote_tracking_reflog",
    },
    {
      ordinal: 2,
      refName: "refs/heads/main",
      commit:
        "a5d82564cece5ecb776a27c86512c3ec56f32787",
      tree: "1bbc1a7623460cf52907758e7ee93149e18a0aec",
      publishedAt: "2026-07-31T15:31:50+09:00",
      observationSource:
        "local_remote_tracking_reflog",
    },
    {
      ordinal: 3,
      refName: "refs/heads/main",
      commit:
        "8b5f14400a7723c821bc54420e55da58dfa7601b",
      tree: "1237af51815e9fd941c62ceb130d063584e13331",
      publishedAt: "2026-07-31T16:07:47+09:00",
      observationSource:
        "push_result_and_remote_ref_verification",
    },
  ]);

export interface HistoricalObjectExposure {
  readonly firstRootOrdinal: 0 | 1 | 2 | 3;
  readonly firstPublishedAt: string;
  readonly rootCommits: readonly string[];
}

export interface HistoricalCommitObject {
  readonly commitId: string;
  readonly treeId: string;
  readonly parentIds: readonly string[];
  readonly sizeBytes: number;
  readonly contentSha256: string;
  readonly exposure: HistoricalObjectExposure;
}

export interface HistoricalTreeObject {
  readonly treeId: string;
  readonly sizeBytes: number;
  readonly contentSha256: string;
  readonly exposure: HistoricalObjectExposure;
}

export interface HistoricalBlobObject {
  readonly blobId: string;
  readonly sizeBytes: number;
  readonly contentSha256: string;
  readonly paths: readonly string[];
  readonly presentInA5Snapshot: boolean;
  readonly presentInCorrectiveSnapshot: boolean;
  readonly historicalOnlyRelativeToA5: boolean;
  readonly correctiveOnly: boolean;
  readonly exposure: HistoricalObjectExposure;
}

export interface HistoricalPathObservation {
  readonly commitId: string;
  readonly rootTreeId: string;
  readonly path: string;
  readonly mode: string;
  readonly blobId: string;
}

export interface HistoricalPathTransition {
  readonly commitId: string;
  readonly parentCommitId: string | null;
  readonly path: string;
  readonly state:
    | "added"
    | "modified"
    | "deleted"
    | "mode_changed";
  readonly beforeBlobId: string | null;
  readonly afterBlobId: string | null;
  readonly beforeMode: string | null;
  readonly afterMode: string | null;
}

export interface HistoricalSecretScan {
  readonly scope:
    "complete_recorded_public_git_object_union";
  readonly patterns: readonly string[];
  readonly falsePositiveLiterals: readonly string[];
  readonly uniqueBlobsScanned: number;
  readonly historicalOnlyBlobsScanned: number;
  readonly correctiveOnlyBlobsScanned: number;
  readonly pathObservationsScanned: number;
  readonly environmentFilesFound: 0;
  readonly actualSecretMatches: 0;
  readonly privateKeysPublished: false;
  readonly result: "no_actual_secret_match";
}

export interface HistoricalPublicObjectInventory {
  readonly schemaVersion: 1;
  readonly inventoryId: string;
  readonly recordType:
    "historical_public_object_inventory";
  readonly repository: {
    readonly url: string;
    readonly owner: string;
    readonly remoteName: string;
    readonly branch: string;
  };
  readonly publicationRoots:
    readonly HistoricalPublicationRoot[];
  readonly traversal: {
    readonly algorithm:
      "git-rev-list-plus-recursive-tree-walk-v1";
    readonly explicitRootCommits: readonly string[];
    readonly includeReachableAncestors: true;
    readonly includeRecursiveTrees: true;
    readonly includeAllPathObservations: true;
    readonly knownRootsRemainCoveredWhenUnreachable: true;
    readonly independentReconstructionRequired: true;
  };
  readonly commits: readonly HistoricalCommitObject[];
  readonly trees: readonly HistoricalTreeObject[];
  readonly blobs: readonly HistoricalBlobObject[];
  readonly pathObservations:
    readonly HistoricalPathObservation[];
  readonly pathTransitions:
    readonly HistoricalPathTransition[];
  readonly secretScan: HistoricalSecretScan;
  readonly counts: {
    readonly publicationRoots: 4;
    readonly reachableCommits: number;
    readonly uniqueTrees: number;
    readonly uniqueBlobs: number;
    readonly pathObservations: number;
    readonly pathTransitions: number;
    readonly a5SnapshotPaths: 510;
    readonly a5SnapshotBlobs: 501;
    readonly historicalOnlyBlobs: number;
    readonly correctiveOnlyBlobs: number;
    readonly correctiveSnapshotPaths: number;
    readonly correctiveSnapshotBlobs: number;
  };
  readonly createdAt: string;
  readonly inventoryHash: string;
}

type HistoricalInventoryCore = Omit<
  HistoricalPublicObjectInventory,
  "inventoryHash"
>;

function historicalInventoryCore(
  record: HistoricalPublicObjectInventory,
): HistoricalInventoryCore {
  const { inventoryHash: _inventoryHash, ...core } = record;
  return core;
}

function comparePathRecord(
  left: { readonly commitId: string; readonly path: string },
  right: { readonly commitId: string; readonly path: string },
): number {
  return (
    left.commitId.localeCompare(right.commitId) ||
    left.path.localeCompare(right.path)
  );
}

function normalizeExposure(
  exposure: HistoricalObjectExposure,
): HistoricalObjectExposure {
  const rootOrder = new Map(
    HISTORICAL_PUBLICATION_ROOTS.map((root) => [
      root.commit,
      root.ordinal,
    ]),
  );
  const rootCommits = [...exposure.rootCommits].sort(
    (left, right) =>
      (rootOrder.get(left) ?? 99) -
      (rootOrder.get(right) ?? 99),
  );
  assertCondition(
    rootCommits.length > 0 &&
      rootCommits.length === new Set(rootCommits).size &&
      rootCommits.every((commit) => rootOrder.has(commit)),
    "SCHEMA_INVALID",
    "Historical exposure roots must be unique recorded publication roots",
  );
  const first = HISTORICAL_PUBLICATION_ROOTS.find(
    (root) => root.commit === rootCommits[0],
  )!;
  assertCondition(
    exposure.firstRootOrdinal === first.ordinal &&
      exposure.firstPublishedAt === first.publishedAt,
    "HASH_MISMATCH",
    "Historical first exposure does not match its earliest publication root",
  );
  return {
    firstRootOrdinal: first.ordinal,
    firstPublishedAt: first.publishedAt,
    rootCommits,
  };
}

function normalizeHistoricalInventory(input: {
  readonly commits: readonly HistoricalCommitObject[];
  readonly trees: readonly HistoricalTreeObject[];
  readonly blobs: readonly HistoricalBlobObject[];
  readonly pathObservations:
    readonly HistoricalPathObservation[];
  readonly pathTransitions:
    readonly HistoricalPathTransition[];
}): Pick<
  HistoricalPublicObjectInventory,
  | "commits"
  | "trees"
  | "blobs"
  | "pathObservations"
  | "pathTransitions"
> {
  return {
    commits: input.commits
      .map((entry) => ({
        ...entry,
        exposure: normalizeExposure(entry.exposure),
      }))
      .sort((left, right) =>
        left.commitId.localeCompare(right.commitId),
      ),
    trees: input.trees
      .map((entry) => ({
        ...entry,
        exposure: normalizeExposure(entry.exposure),
      }))
      .sort((left, right) =>
        left.treeId.localeCompare(right.treeId),
      ),
    blobs: input.blobs
      .map((entry) => ({
        ...entry,
        paths: [...entry.paths].sort(),
        exposure: normalizeExposure(entry.exposure),
      }))
      .sort((left, right) =>
        left.blobId.localeCompare(right.blobId),
      ),
    pathObservations: [...input.pathObservations].sort(
      comparePathRecord,
    ),
    pathTransitions: [...input.pathTransitions].sort(
      comparePathRecord,
    ),
  };
}

function inventoryCounts(input: Pick<
  HistoricalPublicObjectInventory,
  | "commits"
  | "trees"
  | "blobs"
  | "pathObservations"
  | "pathTransitions"
>): HistoricalPublicObjectInventory["counts"] {
  const a5Commit = HISTORICAL_PUBLICATION_ROOTS[2]!.commit;
  const correctiveCommit =
    HISTORICAL_PUBLICATION_ROOTS[3]!.commit;
  const observationsAt = (commitId: string) =>
    input.pathObservations.filter(
      (entry) => entry.commitId === commitId,
    );
  const a5 = observationsAt(a5Commit);
  const corrective = observationsAt(correctiveCommit);
  return {
    publicationRoots: 4,
    reachableCommits: input.commits.length,
    uniqueTrees: input.trees.length,
    uniqueBlobs: input.blobs.length,
    pathObservations: input.pathObservations.length,
    pathTransitions: input.pathTransitions.length,
    a5SnapshotPaths: a5.length as 510,
    a5SnapshotBlobs: new Set(
      a5.map((entry) => entry.blobId),
    ).size as 501,
    historicalOnlyBlobs: input.blobs.filter(
      (entry) => entry.historicalOnlyRelativeToA5,
    ).length,
    correctiveOnlyBlobs: input.blobs.filter(
      (entry) => entry.correctiveOnly,
    ).length,
    correctiveSnapshotPaths: corrective.length,
    correctiveSnapshotBlobs: new Set(
      corrective.map((entry) => entry.blobId),
    ).size,
  };
}

export function createHistoricalPublicObjectInventory(input: {
  readonly inventoryId: string;
  readonly repository:
    HistoricalPublicObjectInventory["repository"];
  readonly publicationRoots:
    readonly HistoricalPublicationRoot[];
  readonly commits: readonly HistoricalCommitObject[];
  readonly trees: readonly HistoricalTreeObject[];
  readonly blobs: readonly HistoricalBlobObject[];
  readonly pathObservations:
    readonly HistoricalPathObservation[];
  readonly pathTransitions:
    readonly HistoricalPathTransition[];
  readonly secretScan: HistoricalSecretScan;
  readonly createdAt: string;
  readonly schemas: SchemaRegistry;
}): HistoricalPublicObjectInventory {
  const normalized = normalizeHistoricalInventory(input);
  const core: HistoricalInventoryCore = {
    schemaVersion: 1,
    inventoryId: input.inventoryId,
    recordType: "historical_public_object_inventory",
    repository: input.repository,
    publicationRoots: [...input.publicationRoots].sort(
      (left, right) => left.ordinal - right.ordinal,
    ),
    traversal: {
      algorithm:
        "git-rev-list-plus-recursive-tree-walk-v1",
      explicitRootCommits:
        HISTORICAL_PUBLICATION_ROOTS.map(
          (root) => root.commit,
        ),
      includeReachableAncestors: true,
      includeRecursiveTrees: true,
      includeAllPathObservations: true,
      knownRootsRemainCoveredWhenUnreachable: true,
      independentReconstructionRequired: true,
    },
    ...normalized,
    secretScan: input.secretScan,
    counts: inventoryCounts(normalized),
    createdAt: input.createdAt,
  };
  const record: HistoricalPublicObjectInventory = {
    ...core,
    inventoryHash: sha256(core as unknown as JsonValue),
  };
  verifyHistoricalPublicObjectInventory({
    record,
    schemas: input.schemas,
  });
  return record;
}

export function verifyHistoricalPublicObjectInventory(input: {
  readonly record: HistoricalPublicObjectInventory;
  readonly schemas: SchemaRegistry;
}): void {
  input.schemas.validate(
    HISTORICAL_PUBLIC_OBJECT_INVENTORY_SCHEMA_ID,
    input.record as unknown as JsonValue,
  );
  assertCondition(
    canonicalize(
      input.record.publicationRoots as unknown as JsonValue,
    ) ===
      canonicalize(
        HISTORICAL_PUBLICATION_ROOTS as unknown as JsonValue,
      ) &&
      canonicalize(
        input.record.traversal
          .explicitRootCommits as unknown as JsonValue,
      ) ===
        canonicalize(
          HISTORICAL_PUBLICATION_ROOTS.map(
            (root) => root.commit,
          ) as unknown as JsonValue,
        ),
    "HASH_MISMATCH",
    "Historical publication roots changed",
  );
  const normalized = normalizeHistoricalInventory(
    input.record,
  );
  for (const key of [
    "commits",
    "trees",
    "blobs",
    "pathObservations",
    "pathTransitions",
  ] as const) {
    assertCondition(
      canonicalize(
        input.record[key] as unknown as JsonValue,
      ) ===
        canonicalize(
          normalized[key] as unknown as JsonValue,
        ),
      "SCHEMA_INVALID",
      `Historical ${key} are not unique and canonically ordered`,
    );
  }
  const unique = (
    values: readonly string[],
    label: string,
  ) => {
    assertCondition(
      values.length === new Set(values).size,
      "SCHEMA_INVALID",
      `Historical inventory has duplicate ${label}`,
    );
  };
  unique(
    input.record.commits.map((entry) => entry.commitId),
    "commit IDs",
  );
  unique(
    input.record.trees.map((entry) => entry.treeId),
    "tree IDs",
  );
  unique(
    input.record.blobs.map((entry) => entry.blobId),
    "blob IDs",
  );
  unique(
    input.record.pathObservations.map(
      (entry) => `${entry.commitId}:${entry.path}`,
    ),
    "commit/path observations",
  );
  unique(
    input.record.pathTransitions.map(
      (entry) => `${entry.commitId}:${entry.path}`,
    ),
    "commit/path transitions",
  );
  const commitIds = new Set(
    input.record.commits.map((entry) => entry.commitId),
  );
  const treeIds = new Set(
    input.record.trees.map((entry) => entry.treeId),
  );
  const blobById = new Map(
    input.record.blobs.map((entry) => [
      entry.blobId,
      entry,
    ]),
  );
  for (const commit of input.record.commits) {
    assertCondition(
      treeIds.has(commit.treeId) &&
        commit.parentIds.every((parent) =>
          commitIds.has(parent),
        ),
      "HASH_MISMATCH",
      "Historical commit references an absent parent or tree",
    );
  }
  const observationsByBlob = new Map<string, Set<string>>();
  for (const observation of input.record.pathObservations) {
    assertCondition(
      commitIds.has(observation.commitId) &&
        treeIds.has(observation.rootTreeId) &&
        blobById.has(observation.blobId),
      "HASH_MISMATCH",
      "Historical path observation references an absent object",
    );
    const paths =
      observationsByBlob.get(observation.blobId) ??
      new Set<string>();
    paths.add(observation.path);
    observationsByBlob.set(observation.blobId, paths);
  }
  const a5BlobIds = new Set(
    input.record.pathObservations
      .filter(
        (entry) =>
          entry.commitId ===
          HISTORICAL_PUBLICATION_ROOTS[2]!.commit,
      )
      .map((entry) => entry.blobId),
  );
  const correctiveBlobIds = new Set(
    input.record.pathObservations
      .filter(
        (entry) =>
          entry.commitId ===
          HISTORICAL_PUBLICATION_ROOTS[3]!.commit,
      )
      .map((entry) => entry.blobId),
  );
  for (const blob of input.record.blobs) {
    const paths = [
      ...(observationsByBlob.get(blob.blobId) ??
        new Set<string>()),
    ].sort();
    const expectedHistorical =
      !a5BlobIds.has(blob.blobId) &&
      blob.exposure.rootCommits.includes(
        HISTORICAL_PUBLICATION_ROOTS[2]!.commit,
      );
    assertCondition(
      canonicalize(paths as unknown as JsonValue) ===
        canonicalize(blob.paths as unknown as JsonValue) &&
        blob.presentInA5Snapshot ===
          a5BlobIds.has(blob.blobId) &&
        blob.presentInCorrectiveSnapshot ===
          correctiveBlobIds.has(blob.blobId) &&
        blob.historicalOnlyRelativeToA5 ===
          expectedHistorical &&
        blob.correctiveOnly ===
          (blob.exposure.firstRootOrdinal === 3),
      "HASH_MISMATCH",
      "Historical blob paths or classification changed",
    );
  }
  for (const transition of input.record.pathTransitions) {
    const added =
      transition.state === "added" &&
      transition.beforeBlobId === null &&
      transition.beforeMode === null &&
      transition.afterBlobId !== null &&
      transition.afterMode !== null;
    const deleted =
      transition.state === "deleted" &&
      transition.beforeBlobId !== null &&
      transition.beforeMode !== null &&
      transition.afterBlobId === null &&
      transition.afterMode === null;
    const modified =
      transition.state === "modified" &&
      transition.beforeBlobId !== null &&
      transition.afterBlobId !== null &&
      transition.beforeBlobId !==
        transition.afterBlobId &&
      transition.beforeMode !== null &&
      transition.afterMode !== null;
    const modeChanged =
      transition.state === "mode_changed" &&
      transition.beforeBlobId !== null &&
      transition.beforeBlobId ===
        transition.afterBlobId &&
      transition.beforeMode !== null &&
      transition.afterMode !== null &&
      transition.beforeMode !== transition.afterMode;
    assertCondition(
      commitIds.has(transition.commitId) &&
        (transition.parentCommitId === null ||
          commitIds.has(transition.parentCommitId)) &&
        (added || deleted || modified || modeChanged),
      "SCHEMA_INVALID",
      "Historical path transition is inconsistent",
    );
  }
  const counts = inventoryCounts(input.record);
  assertCondition(
    canonicalize(counts as unknown as JsonValue) ===
      canonicalize(
        input.record.counts as unknown as JsonValue,
      ) &&
      input.record.secretScan.uniqueBlobsScanned ===
        counts.uniqueBlobs &&
      input.record.secretScan
        .historicalOnlyBlobsScanned ===
        counts.historicalOnlyBlobs &&
      input.record.secretScan.correctiveOnlyBlobsScanned ===
        counts.correctiveOnlyBlobs &&
      input.record.secretScan.pathObservationsScanned ===
        counts.pathObservations &&
      canonicalize(
        input.record.secretScan
          .falsePositiveLiterals as unknown as JsonValue,
      ) ===
        canonicalize(
          [
            "sk-validation-mode-must-ignore-this",
          ] as unknown as JsonValue,
        ) &&
      input.record.inventoryHash ===
        sha256(
          historicalInventoryCore(
            input.record,
          ) as unknown as JsonValue,
        ),
    "HASH_MISMATCH",
    "Historical inventory counts, scan, or hash changed",
  );
}

export interface HistoricalPublicExposureArtifact {
  readonly exposureId: string;
  readonly artifactClass: PublicExposureArtifactClass;
  readonly artifactId: string;
  readonly sourceKind: "git_object" | "embedded_record";
  readonly gitObjectType:
    | "commit"
    | "tree"
    | "blob"
    | "embedded";
  readonly gitObjectId: string | null;
  readonly contentHash: string;
  readonly paths: readonly string[];
  readonly aliases: readonly string[];
  readonly dependencies: readonly string[];
  readonly provenanceReferences: readonly string[];
  readonly eligibility: PermanentPublicEligibility;
}

export interface HistoricalPublicExposureLedger {
  readonly schemaVersion: 1;
  readonly ledgerId: string;
  readonly recordType:
    "historical_public_exposure_ledger";
  readonly governanceDomainId: string;
  readonly deviationId: string;
  readonly deviationRecordHash: string;
  readonly priorLedgerId: string;
  readonly priorLedgerHash: string;
  readonly historicalInventoryId: string;
  readonly historicalInventoryHash: string;
  readonly publicationRootCommits: readonly string[];
  readonly artifacts:
    readonly HistoricalPublicExposureArtifact[];
  readonly propagationPolicy: {
    readonly matchExposureId: true;
    readonly matchArtifactId: true;
    readonly matchPath: true;
    readonly matchGitObjectId: true;
    readonly matchContentHash: true;
    readonly matchAlias: true;
    readonly traverseDependencies: true;
    readonly traverseWrappers: true;
    readonly traverseProvenance: true;
    readonly protocolVersionCannotReset: true;
    readonly historyRewriteCannotReset: true;
    readonly repositoryDeletionCannotReset: true;
    readonly unreachableCommitRemainsExposed: true;
    readonly defaultRestrictedUse: "deny";
  };
  readonly allowedUseClasses:
    readonly PublicExposureAllowedUse[];
  readonly prohibitedUseClasses:
    readonly PublicExposureRestrictedUse[];
  readonly createdAt: string;
  readonly recordedBy: PrincipalIdentity;
  readonly ledgerHash: string;
  readonly publicPrincipal: PublicPrincipal;
  readonly attestation: Attestation;
}

type HistoricalLedgerCore = Omit<
  HistoricalPublicExposureLedger,
  "ledgerHash" | "publicPrincipal" | "attestation"
>;
type HistoricalLedgerSignedBody = Omit<
  HistoricalPublicExposureLedger,
  "attestation"
>;

function historicalLedgerCore(
  record: HistoricalPublicExposureLedger,
): HistoricalLedgerCore {
  const {
    ledgerHash: _ledgerHash,
    publicPrincipal: _publicPrincipal,
    attestation: _attestation,
    ...core
  } = record;
  return core;
}

function historicalLedgerSignedBody(
  record: HistoricalPublicExposureLedger,
): HistoricalLedgerSignedBody {
  const { attestation: _attestation, ...body } = record;
  return body;
}

function sortedUniqueStrings(
  values: readonly string[],
  label: string,
): readonly string[] {
  const sorted = [...values].sort();
  assertCondition(
    sorted.length === new Set(sorted).size,
    "SCHEMA_INVALID",
    `Historical exposure has duplicate ${label}`,
  );
  return sorted;
}

function normalizeHistoricalArtifact(
  input: Omit<
    HistoricalPublicExposureArtifact,
    "eligibility"
  > & {
    readonly eligibility?: PermanentPublicEligibility;
  },
): HistoricalPublicExposureArtifact {
  assertCondition(
    PUBLIC_EXPOSURE_ARTIFACT_CLASSES.includes(
      input.artifactClass,
    ),
    "SCHEMA_INVALID",
    "Unknown historical public artifact class",
  );
  return {
    exposureId: input.exposureId,
    artifactClass: input.artifactClass,
    artifactId: input.artifactId,
    sourceKind: input.sourceKind,
    gitObjectType: input.gitObjectType,
    gitObjectId: input.gitObjectId,
    contentHash: input.contentHash,
    paths: sortedUniqueStrings(input.paths, "paths"),
    aliases: sortedUniqueStrings(input.aliases, "aliases"),
    dependencies: sortedUniqueStrings(
      input.dependencies,
      "dependencies",
    ),
    provenanceReferences: sortedUniqueStrings(
      input.provenanceReferences,
      "provenance references",
    ),
    eligibility: PERMANENT_PUBLIC_ELIGIBILITY,
  };
}

function assertProtocolAuthor(input: {
  readonly signer: PrincipalSigner;
  readonly action: string;
}): void {
  assertCondition(
    input.signer.identity.role === "protocol_author",
    "AUTHORIZATION_DENIED",
    `Only a protocol author may ${input.action}`,
  );
}

function verifyProtocolAuthorSignature(input: {
  readonly identity: PrincipalIdentity;
  readonly publicPrincipal: PublicPrincipal;
  readonly body: JsonValue;
  readonly attestation: Attestation;
  readonly recordHash: string;
  readonly expectedHash: string;
  readonly label: string;
}): void {
  assertCondition(
    input.identity.role === "protocol_author" &&
      canonicalize(
        input.publicPrincipal.identity as unknown as JsonValue,
      ) === canonicalize(input.identity as unknown as JsonValue) &&
      input.recordHash === input.expectedHash,
    "HASH_MISMATCH",
    `${input.label} identity or hash changed`,
  );
  const principals = new PrincipalRegistry();
  principals.register(input.publicPrincipal);
  principals.verify(
    input.identity,
    input.body,
    input.attestation,
  );
}

export function createHistoricalPublicExposureLedger(input: {
  readonly ledgerId: string;
  readonly governanceDomainId: string;
  readonly deviation: PublicationDeviationRecord;
  readonly priorInventory: PublishedArtifactInventory;
  readonly priorLedger: PublicExposureLedger;
  readonly historicalInventory:
    HistoricalPublicObjectInventory;
  readonly artifacts: readonly (
    Omit<HistoricalPublicExposureArtifact, "eligibility"> & {
      readonly eligibility?: PermanentPublicEligibility;
    }
  )[];
  readonly createdAt: string;
  readonly signer: PrincipalSigner;
  readonly schemas: SchemaRegistry;
}): HistoricalPublicExposureLedger {
  assertProtocolAuthor({
    signer: input.signer,
    action: "sign a historical public-exposure ledger",
  });
  verifyPublicExposureLedger({
    record: input.priorLedger,
    deviation: input.deviation,
    inventory: input.priorInventory,
    schemas: input.schemas,
  });
  verifyHistoricalPublicObjectInventory({
    record: input.historicalInventory,
    schemas: input.schemas,
  });
  const artifacts = input.artifacts
    .map(normalizeHistoricalArtifact)
    .sort((left, right) =>
      left.exposureId.localeCompare(right.exposureId),
    );
  assertCondition(
    artifacts.length > 0 &&
      artifacts.length ===
        new Set(
          artifacts.map((entry) => entry.exposureId),
        ).size,
    "SCHEMA_INVALID",
    "Historical ledger requires unique exposure IDs",
  );
  const core: HistoricalLedgerCore = {
    schemaVersion: 1,
    ledgerId: input.ledgerId,
    recordType: "historical_public_exposure_ledger",
    governanceDomainId: input.governanceDomainId,
    deviationId: input.deviation.deviationId,
    deviationRecordHash: input.deviation.recordHash,
    priorLedgerId: input.priorLedger.ledgerId,
    priorLedgerHash: input.priorLedger.ledgerHash,
    historicalInventoryId:
      input.historicalInventory.inventoryId,
    historicalInventoryHash:
      input.historicalInventory.inventoryHash,
    publicationRootCommits:
      HISTORICAL_PUBLICATION_ROOTS.map(
        (root) => root.commit,
      ),
    artifacts,
    propagationPolicy: {
      matchExposureId: true,
      matchArtifactId: true,
      matchPath: true,
      matchGitObjectId: true,
      matchContentHash: true,
      matchAlias: true,
      traverseDependencies: true,
      traverseWrappers: true,
      traverseProvenance: true,
      protocolVersionCannotReset: true,
      historyRewriteCannotReset: true,
      repositoryDeletionCannotReset: true,
      unreachableCommitRemainsExposed: true,
      defaultRestrictedUse: "deny",
    },
    allowedUseClasses: PUBLIC_EXPOSURE_ALLOWED_USES,
    prohibitedUseClasses:
      PUBLIC_EXPOSURE_RESTRICTED_USES,
    createdAt: input.createdAt,
    recordedBy: input.signer.identity,
  };
  const publicPrincipal = input.signer.exportPublic();
  const body: HistoricalLedgerSignedBody = {
    ...core,
    ledgerHash: sha256(core as unknown as JsonValue),
    publicPrincipal,
  };
  const record: HistoricalPublicExposureLedger = {
    ...body,
    attestation: input.signer.attest(
      body as unknown as JsonValue,
    ),
  };
  verifyHistoricalPublicExposureLedger({
    record,
    deviation: input.deviation,
    priorInventory: input.priorInventory,
    priorLedger: input.priorLedger,
    historicalInventory: input.historicalInventory,
    schemas: input.schemas,
  });
  return record;
}

export function verifyHistoricalPublicExposureLedger(input: {
  readonly record: HistoricalPublicExposureLedger;
  readonly deviation: PublicationDeviationRecord;
  readonly priorInventory: PublishedArtifactInventory;
  readonly priorLedger: PublicExposureLedger;
  readonly historicalInventory:
    HistoricalPublicObjectInventory;
  readonly schemas: SchemaRegistry;
}): void {
  input.schemas.validate(
    HISTORICAL_PUBLIC_EXPOSURE_LEDGER_SCHEMA_ID,
    input.record as unknown as JsonValue,
  );
  verifyPublicExposureLedger({
    record: input.priorLedger,
    deviation: input.deviation,
    inventory: input.priorInventory,
    schemas: input.schemas,
  });
  verifyHistoricalPublicObjectInventory({
    record: input.historicalInventory,
    schemas: input.schemas,
  });
  assertCondition(
    input.record.deviationId ===
      input.deviation.deviationId &&
      input.record.deviationRecordHash ===
        input.deviation.recordHash &&
      input.record.priorLedgerId ===
        input.priorLedger.ledgerId &&
      input.record.priorLedgerHash ===
        input.priorLedger.ledgerHash &&
      input.record.historicalInventoryId ===
        input.historicalInventory.inventoryId &&
      input.record.historicalInventoryHash ===
        input.historicalInventory.inventoryHash &&
      canonicalize(
        input.record
          .publicationRootCommits as unknown as JsonValue,
      ) ===
        canonicalize(
          HISTORICAL_PUBLICATION_ROOTS.map(
            (root) => root.commit,
          ) as unknown as JsonValue,
        ),
    "HASH_MISMATCH",
    "Historical exposure ledger binding changed",
  );
  const artifacts = input.record.artifacts
    .map(normalizeHistoricalArtifact)
    .sort((left, right) =>
      left.exposureId.localeCompare(right.exposureId),
    );
  assertCondition(
    artifacts.length ===
      new Set(
        artifacts.map((entry) => entry.exposureId),
      ).size &&
      canonicalize(artifacts as unknown as JsonValue) ===
        canonicalize(
          input.record.artifacts as unknown as JsonValue,
        ),
    "SCHEMA_INVALID",
    "Historical exposure artifacts are not unique and ordered",
  );
  const byObject = new Map<
    string,
    HistoricalPublicExposureArtifact
  >();
  for (const artifact of artifacts) {
    if (
      artifact.gitObjectId !== null &&
      artifact.gitObjectType !== "embedded"
    ) {
      const objectKey =
        `${artifact.gitObjectType}:${artifact.gitObjectId}`;
      assertCondition(
        !byObject.has(objectKey),
        "SCHEMA_INVALID",
        `Historical Git object has duplicate exposure entries: ${objectKey}`,
      );
      byObject.set(objectKey, artifact);
    }
  }
  assertCondition(
    byObject.size ===
      input.historicalInventory.commits.length +
        input.historicalInventory.trees.length +
        input.historicalInventory.blobs.length,
    "HASH_MISMATCH",
    "Historical ledger contains missing or unrecorded Git objects",
  );
  for (const commit of input.historicalInventory.commits) {
    const artifact = byObject.get(
      `commit:${commit.commitId}`,
    );
    assertCondition(
      artifact?.sourceKind === "git_object" &&
        artifact.artifactId ===
          `git-commit:${commit.commitId}` &&
        artifact.contentHash === commit.contentSha256 &&
        artifact.paths.length === 0,
      "HASH_MISMATCH",
      "Historical commit is missing from exposure ledger",
    );
  }
  for (const tree of input.historicalInventory.trees) {
    const artifact = byObject.get(`tree:${tree.treeId}`);
    assertCondition(
      artifact?.sourceKind === "git_object" &&
        artifact.artifactId === `git-tree:${tree.treeId}` &&
        artifact.contentHash === tree.contentSha256 &&
        artifact.paths.length === 0,
      "HASH_MISMATCH",
      "Historical tree is missing from exposure ledger",
    );
  }
  for (const blob of input.historicalInventory.blobs) {
    const artifact = byObject.get(`blob:${blob.blobId}`);
    assertCondition(
      artifact?.sourceKind === "git_object" &&
        artifact.artifactId === `git-blob:${blob.blobId}` &&
        artifact.contentHash === blob.contentSha256 &&
        canonicalize(
          artifact.paths as unknown as JsonValue,
        ) ===
          canonicalize(
            blob.paths as unknown as JsonValue,
          ),
      "HASH_MISMATCH",
      "Historical blob or path alias is missing from exposure ledger",
    );
  }
  assertCondition(
    canonicalize(
      input.record.allowedUseClasses as unknown as JsonValue,
    ) ===
      canonicalize(
        PUBLIC_EXPOSURE_ALLOWED_USES as unknown as JsonValue,
      ) &&
      canonicalize(
        input.record
          .prohibitedUseClasses as unknown as JsonValue,
      ) ===
        canonicalize(
          PUBLIC_EXPOSURE_RESTRICTED_USES as unknown as JsonValue,
        ),
    "HASH_MISMATCH",
    "Historical exposure use classes changed",
  );
  verifyProtocolAuthorSignature({
    identity: input.record.recordedBy,
    publicPrincipal: input.record.publicPrincipal,
    body:
      historicalLedgerSignedBody(
        input.record,
      ) as unknown as JsonValue,
    attestation: input.record.attestation,
    recordHash: input.record.ledgerHash,
    expectedHash: sha256(
      historicalLedgerCore(
        input.record,
      ) as unknown as JsonValue,
    ),
    label: "Historical public-exposure ledger",
  });
}

export interface HistoricalExposureAdmission {
  readonly useClass: PublicExposureAllowedUse;
  readonly exposureIds: readonly string[];
  readonly admissionHash: string;
}

export class HistoricalPublicExposurePolicy {
  readonly #byToken = new Map<
    string,
    HistoricalPublicExposureArtifact[]
  >();

  public constructor(input: {
    readonly ledger: HistoricalPublicExposureLedger;
    readonly deviation: PublicationDeviationRecord;
    readonly priorInventory: PublishedArtifactInventory;
    readonly priorLedger: PublicExposureLedger;
    readonly historicalInventory:
      HistoricalPublicObjectInventory;
    readonly schemas: SchemaRegistry;
  }) {
    verifyHistoricalPublicExposureLedger({
      record: input.ledger,
      deviation: input.deviation,
      priorInventory: input.priorInventory,
      priorLedger: input.priorLedger,
      historicalInventory: input.historicalInventory,
      schemas: input.schemas,
    });
    for (const artifact of input.ledger.artifacts) {
      for (const token of [
        artifact.exposureId,
        artifact.artifactId,
        artifact.gitObjectId,
        artifact.contentHash,
        ...artifact.paths,
        ...artifact.aliases,
      ]) {
        if (token === null) continue;
        const prior = this.#byToken.get(token) ?? [];
        if (
          !prior.some(
            (entry) =>
              entry.exposureId === artifact.exposureId,
          )
        ) {
          prior.push(artifact);
        }
        this.#byToken.set(token, prior);
      }
    }
  }

  public assertGraphAllowed(input: {
    readonly useClass: PublicExposureUseClass;
    readonly rootReferences: readonly string[];
    readonly nodes: readonly PublicExposureGraphNode[];
    readonly protocolId?: string;
    readonly resetClaims?: {
      readonly newProtocolClearsExposure?: boolean;
      readonly historyRewriteRestoresSecrecy?: boolean;
      readonly repositoryDeletionRestoresSecrecy?: boolean;
      readonly unreachableCommitRestoresSecrecy?: boolean;
    };
  }): HistoricalExposureAdmission | null {
    assertCondition(
      (
        [
          ...PUBLIC_EXPOSURE_ALLOWED_USES,
          ...PUBLIC_EXPOSURE_RESTRICTED_USES,
        ] as readonly string[]
      ).includes(input.useClass),
      "SCHEMA_INVALID",
      "Unknown historical public-exposure use class",
    );
    const reset = input.resetClaims;
    assertCondition(
      reset?.newProtocolClearsExposure !== true &&
        reset?.historyRewriteRestoresSecrecy !== true &&
        reset?.repositoryDeletionRestoresSecrecy !== true &&
        reset?.unreachableCommitRestoresSecrecy !== true,
      "AUTHORIZATION_DENIED",
      "No protocol, ref, history, or repository state restores public secrecy",
    );
    const nodeByToken = new Map<
      string,
      PublicExposureGraphNode
    >();
    for (const node of input.nodes) {
      for (const token of [
        node.nodeId,
        node.contentHash,
        node.gitBlobId,
        node.path,
        ...node.aliases,
      ]) {
        if (token === null) continue;
        const prior = nodeByToken.get(token);
        assertCondition(
          prior === undefined || prior === node,
          "CONFLICT",
          "Historical exposure graph has ambiguous aliases",
        );
        nodeByToken.set(token, node);
      }
    }
    const queue = [...input.rootReferences];
    const visited = new Set<string>();
    const exposures = new Map<
      string,
      HistoricalPublicExposureArtifact
    >();
    while (queue.length > 0) {
      const token = queue.shift()!;
      if (visited.has(token)) continue;
      visited.add(token);
      for (const artifact of this.#byToken.get(token) ?? []) {
        exposures.set(artifact.exposureId, artifact);
        queue.push(
          ...artifact.dependencies,
          ...artifact.provenanceReferences,
        );
      }
      const node = nodeByToken.get(token);
      if (node !== undefined) {
        queue.push(
          node.nodeId,
          ...(node.contentHash === null
            ? []
            : [node.contentHash]),
          ...(node.gitBlobId === null
            ? []
            : [node.gitBlobId]),
          ...(node.path === null ? [] : [node.path]),
          ...node.aliases,
          ...node.dependencies,
          ...node.wrappers,
          ...node.provenanceReferences,
        );
      }
    }
    if (exposures.size === 0) return null;
    assertCondition(
      PUBLIC_EXPOSURE_ALLOWED_USES.includes(
        input.useClass as PublicExposureAllowedUse,
      ) &&
        !PUBLIC_EXPOSURE_RESTRICTED_USES.includes(
          input.useClass as PublicExposureRestrictedUse,
        ),
      "AUTHORIZATION_DENIED",
      `Historical public artifacts cannot be used for ${input.useClass}`,
    );
    const exposureIds = [...exposures.keys()].sort();
    const useClass =
      input.useClass as PublicExposureAllowedUse;
    return {
      useClass,
      exposureIds,
      admissionHash: sha256({
        useClass,
        exposureIds,
        protocolId: input.protocolId ?? null,
      }),
    };
  }
}

export interface PublicationSupersedingClosureRecord {
  readonly schemaVersion: 1;
  readonly closureId: string;
  readonly recordType:
    "publication_superseding_closure";
  readonly governanceDomainId: string;
  readonly deviationId: string;
  readonly deviationRecordHash: string;
  readonly priorClosureId: string;
  readonly priorClosureHash: string;
  readonly priorClosureFileSha256: string;
  readonly correctiveDecision: {
    readonly round: "03RRRRR";
    readonly decision: "REVISE";
    readonly responsePath: string;
    readonly responseSha256: string;
  };
  readonly historicalInventoryId: string;
  readonly historicalInventoryHash: string;
  readonly historicalLedgerId: string;
  readonly historicalLedgerHash: string;
  readonly expandedSecretScan: {
    readonly uniqueBlobsScanned: number;
    readonly historicalOnlyBlobsScanned: number;
    readonly correctiveOnlyBlobsScanned: number;
    readonly environmentFilesFound: 0;
    readonly actualSecretMatches: 0;
  };
  readonly validatorEvidence: {
    readonly implementationPath: string;
    readonly implementationSha256: string;
    readonly testPath: string;
    readonly testSha256: string;
    readonly verifierPath: string;
    readonly verifierSha256: string;
  };
  readonly remediation: {
    readonly priorClosureModified: false;
    readonly priorClosureWasPremature: true;
    readonly closureStatus:
      "superseded_by_complete_historical_union";
    readonly completedActions: readonly string[];
    readonly outstandingActions: readonly [];
  };
  readonly claimBoundary: {
    readonly historicalPublicationGovernanceClosed: true;
    readonly publicDevelopmentArtifactsPermanent: true;
    readonly heldOutEligibilityRestored: false;
    readonly researchEvidenceAuthorized: false;
    readonly promotionAuthorized: false;
    readonly providerUsed: false;
    readonly selfImprovementClaim: false;
    readonly additionalPushPerformed: false;
  };
  readonly closedAt: string;
  readonly recordedBy: PrincipalIdentity;
  readonly recordHash: string;
  readonly publicPrincipal: PublicPrincipal;
  readonly attestation: Attestation;
}

export type PublicationSupersedingClosureUnsignedInput =
  Omit<
    PublicationSupersedingClosureRecord,
    | "schemaVersion"
    | "recordType"
    | "recordedBy"
    | "recordHash"
    | "publicPrincipal"
    | "attestation"
  >;

type SupersedingClosureCore = Omit<
  PublicationSupersedingClosureRecord,
  "recordHash" | "publicPrincipal" | "attestation"
>;
type SupersedingClosureSignedBody = Omit<
  PublicationSupersedingClosureRecord,
  "attestation"
>;

function supersedingClosureCore(
  record: PublicationSupersedingClosureRecord,
): SupersedingClosureCore {
  const {
    recordHash: _recordHash,
    publicPrincipal: _publicPrincipal,
    attestation: _attestation,
    ...core
  } = record;
  return core;
}

function supersedingClosureSignedBody(
  record: PublicationSupersedingClosureRecord,
): SupersedingClosureSignedBody {
  const { attestation: _attestation, ...body } = record;
  return body;
}

export function createPublicationSupersedingClosure(input: {
  readonly value:
    PublicationSupersedingClosureUnsignedInput;
  readonly deviation: PublicationDeviationRecord;
  readonly priorInventory: PublishedArtifactInventory;
  readonly priorLedger: PublicExposureLedger;
  readonly priorClosure:
    PublicationRemediationClosureRecord;
  readonly historicalInventory:
    HistoricalPublicObjectInventory;
  readonly historicalLedger:
    HistoricalPublicExposureLedger;
  readonly signer: PrincipalSigner;
  readonly schemas: SchemaRegistry;
}): PublicationSupersedingClosureRecord {
  assertProtocolAuthor({
    signer: input.signer,
    action: "sign a superseding publication closure",
  });
  verifyPublicationRemediationClosure({
    record: input.priorClosure,
    deviation: input.deviation,
    ledger: input.priorLedger,
    inventory: input.priorInventory,
    schemas: input.schemas,
  });
  verifyHistoricalPublicExposureLedger({
    record: input.historicalLedger,
    deviation: input.deviation,
    priorInventory: input.priorInventory,
    priorLedger: input.priorLedger,
    historicalInventory: input.historicalInventory,
    schemas: input.schemas,
  });
  const scan = input.historicalInventory.secretScan;
  assertCondition(
    input.value.deviationId ===
      input.deviation.deviationId &&
      input.value.deviationRecordHash ===
        input.deviation.recordHash &&
      input.value.priorClosureId ===
        input.priorClosure.closureId &&
      input.value.priorClosureHash ===
        input.priorClosure.recordHash &&
      input.value.priorClosureFileSha256 ===
        "sha256:f1436b5a13c4465c3cf61c98b67de4048cc9b77994e385f3e10f2451ad2625ba" &&
      input.value.historicalInventoryId ===
        input.historicalInventory.inventoryId &&
      input.value.historicalInventoryHash ===
        input.historicalInventory.inventoryHash &&
      input.value.historicalLedgerId ===
        input.historicalLedger.ledgerId &&
      input.value.historicalLedgerHash ===
        input.historicalLedger.ledgerHash &&
      input.value.expandedSecretScan
        .uniqueBlobsScanned ===
        scan.uniqueBlobsScanned &&
      input.value.expandedSecretScan
        .historicalOnlyBlobsScanned ===
        scan.historicalOnlyBlobsScanned &&
      input.value.expandedSecretScan
        .correctiveOnlyBlobsScanned ===
        scan.correctiveOnlyBlobsScanned,
    "HASH_MISMATCH",
    "Superseding closure does not bind the complete historical correction",
  );
  const core: SupersedingClosureCore = {
    schemaVersion: 1,
    closureId: input.value.closureId,
    recordType: "publication_superseding_closure",
    governanceDomainId: input.value.governanceDomainId,
    deviationId: input.value.deviationId,
    deviationRecordHash:
      input.value.deviationRecordHash,
    priorClosureId: input.value.priorClosureId,
    priorClosureHash: input.value.priorClosureHash,
    priorClosureFileSha256:
      input.value.priorClosureFileSha256,
    correctiveDecision: input.value.correctiveDecision,
    historicalInventoryId:
      input.value.historicalInventoryId,
    historicalInventoryHash:
      input.value.historicalInventoryHash,
    historicalLedgerId: input.value.historicalLedgerId,
    historicalLedgerHash:
      input.value.historicalLedgerHash,
    expandedSecretScan: input.value.expandedSecretScan,
    validatorEvidence: input.value.validatorEvidence,
    remediation: input.value.remediation,
    claimBoundary: input.value.claimBoundary,
    closedAt: input.value.closedAt,
    recordedBy: input.signer.identity,
  };
  const publicPrincipal = input.signer.exportPublic();
  const body: SupersedingClosureSignedBody = {
    ...core,
    recordHash: sha256(core as unknown as JsonValue),
    publicPrincipal,
  };
  const record: PublicationSupersedingClosureRecord = {
    ...body,
    attestation: input.signer.attest(
      body as unknown as JsonValue,
    ),
  };
  verifyPublicationSupersedingClosure({
    record,
    deviation: input.deviation,
    priorInventory: input.priorInventory,
    priorLedger: input.priorLedger,
    priorClosure: input.priorClosure,
    historicalInventory: input.historicalInventory,
    historicalLedger: input.historicalLedger,
    schemas: input.schemas,
  });
  return record;
}

export function verifyPublicationSupersedingClosure(input: {
  readonly record: PublicationSupersedingClosureRecord;
  readonly deviation: PublicationDeviationRecord;
  readonly priorInventory: PublishedArtifactInventory;
  readonly priorLedger: PublicExposureLedger;
  readonly priorClosure:
    PublicationRemediationClosureRecord;
  readonly historicalInventory:
    HistoricalPublicObjectInventory;
  readonly historicalLedger:
    HistoricalPublicExposureLedger;
  readonly schemas: SchemaRegistry;
}): void {
  input.schemas.validate(
    PUBLICATION_SUPERSEDING_CLOSURE_SCHEMA_ID,
    input.record as unknown as JsonValue,
  );
  verifyPublicationRemediationClosure({
    record: input.priorClosure,
    deviation: input.deviation,
    ledger: input.priorLedger,
    inventory: input.priorInventory,
    schemas: input.schemas,
  });
  verifyHistoricalPublicExposureLedger({
    record: input.historicalLedger,
    deviation: input.deviation,
    priorInventory: input.priorInventory,
    priorLedger: input.priorLedger,
    historicalInventory: input.historicalInventory,
    schemas: input.schemas,
  });
  const scan = input.historicalInventory.secretScan;
  assertCondition(
    input.record.deviationId ===
      input.deviation.deviationId &&
      input.record.deviationRecordHash ===
        input.deviation.recordHash &&
      input.record.priorClosureId ===
        input.priorClosure.closureId &&
      input.record.priorClosureHash ===
        input.priorClosure.recordHash &&
      input.record.priorClosureFileSha256 ===
        "sha256:f1436b5a13c4465c3cf61c98b67de4048cc9b77994e385f3e10f2451ad2625ba" &&
      input.record.historicalInventoryId ===
        input.historicalInventory.inventoryId &&
      input.record.historicalInventoryHash ===
        input.historicalInventory.inventoryHash &&
      input.record.historicalLedgerId ===
        input.historicalLedger.ledgerId &&
      input.record.historicalLedgerHash ===
        input.historicalLedger.ledgerHash &&
      input.record.correctiveDecision.responseSha256 ===
        "sha256:9df707631279d1b423822c9e3011e3b564a245a09660217912dc8297577cd267" &&
      input.record.expandedSecretScan
        .uniqueBlobsScanned ===
        scan.uniqueBlobsScanned &&
      input.record.expandedSecretScan
        .historicalOnlyBlobsScanned ===
        scan.historicalOnlyBlobsScanned &&
      input.record.expandedSecretScan
        .correctiveOnlyBlobsScanned ===
        scan.correctiveOnlyBlobsScanned &&
      input.record.remediation.priorClosureModified ===
        false &&
      input.record.remediation.priorClosureWasPremature ===
        true &&
      input.record.remediation.outstandingActions
        .length === 0,
    "INVALID_STATE_TRANSITION",
    "Superseding publication closure binding changed",
  );
  verifyProtocolAuthorSignature({
    identity: input.record.recordedBy,
    publicPrincipal: input.record.publicPrincipal,
    body:
      supersedingClosureSignedBody(
        input.record,
      ) as unknown as JsonValue,
    attestation: input.record.attestation,
    recordHash: input.record.recordHash,
    expectedHash: sha256(
      supersedingClosureCore(
        input.record,
      ) as unknown as JsonValue,
    ),
    label: "Superseding publication closure",
  });
}

export class PublicationSupersedingClosureLog {
  readonly #schemas: SchemaRegistry;
  readonly #input: Omit<
    Parameters<
      typeof verifyPublicationSupersedingClosure
    >[0],
    "record"
  >;
  readonly #log: AppendOnlyLog<JsonValue>;

  public constructor(input: {
    readonly root: string;
    readonly schemas: SchemaRegistry;
    readonly deviation: PublicationDeviationRecord;
    readonly priorInventory: PublishedArtifactInventory;
    readonly priorLedger: PublicExposureLedger;
    readonly priorClosure:
      PublicationRemediationClosureRecord;
    readonly historicalInventory:
      HistoricalPublicObjectInventory;
    readonly historicalLedger:
      HistoricalPublicExposureLedger;
  }) {
    const { root, ...verification } = input;
    this.#schemas = input.schemas;
    this.#input = verification;
    this.#log = new AppendOnlyLog<JsonValue>(
      path.join(root, "governance"),
      "governance.publication-superseding-closures",
    );
  }

  public async append(
    record: PublicationSupersedingClosureRecord,
  ): Promise<AppendOnlyRecord<JsonValue>> {
    verifyPublicationSupersedingClosure({
      record,
      ...this.#input,
      schemas: this.#schemas,
    });
    const records = await this.#log.readAll();
    const prior = records.find(
      (entry) =>
        (
          entry.payload as unknown as PublicationSupersedingClosureRecord
        ).closureId === record.closureId,
    );
    assertCondition(
      prior === undefined ||
        (
          prior.payload as unknown as PublicationSupersedingClosureRecord
        ).recordHash === record.recordHash,
      "CONFLICT",
      "Superseding closure ID was reused with different content",
    );
    if (prior !== undefined) return prior;
    return this.#log.append(record as unknown as JsonValue);
  }
}
