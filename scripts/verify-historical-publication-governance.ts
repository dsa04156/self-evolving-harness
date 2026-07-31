import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import {
  HISTORICAL_PUBLICATION_ROOTS,
  HarnessError,
  HistoricalPublicExposurePolicy,
  SchemaRegistry,
  canonicalize,
  parseStrictJson,
  sha256Bytes,
  sha256Text,
  verifyHistoricalPublicExposureLedger,
  verifyHistoricalPublicObjectInventory,
  verifyPublicationSupersedingClosure,
  type HistoricalPathObservation,
  type HistoricalPathTransition,
  type HistoricalPublicExposureLedger,
  type HistoricalPublicObjectInventory,
  type JsonValue,
  type PublicationDeviationRecord,
  type PublicationRemediationClosureRecord,
  type PublicationSupersedingClosureRecord,
  type PublicExposureLedger,
  type PublishedArtifactInventory,
} from "../src/index.js";

const execFileAsync = promisify(execFile);
const INVENTORY_PATH =
  "governance/public-exposure/historical-inventory-through-8b5f144.json";
const LEDGER_PATH =
  "governance/public-exposure/historical-ledger-through-8b5f144.json";
const CLOSURE_PATH =
  "governance/publication-remediation-closures/github-publication-superseding-2026-07-31.json";
const PRIOR_INVENTORY_PATH =
  "governance/public-exposure/inventory-a5d8256.json";
const PRIOR_LEDGER_PATH =
  "governance/public-exposure/ledger-a5d8256.json";
const DEVIATION_PATH =
  "governance/publication-deviations/github-publication-2026-07-31.json";
const PRIOR_CLOSURE_PATH =
  "governance/publication-remediation-closures/github-publication-2026-07-31.json";
const EXPECTED_PRIOR_CLOSURE_FILE_SHA =
  "sha256:f1436b5a13c4465c3cf61c98b67de4048cc9b77994e385f3e10f2451ad2625ba";
const EXPECTED_RESPONSE_SHA =
  "sha256:9df707631279d1b423822c9e3011e3b564a245a09660217912dc8297577cd267";
const A5_COMMIT = HISTORICAL_PUBLICATION_ROOTS[2]!.commit;
const CORRECTIVE_COMMIT =
  HISTORICAL_PUBLICATION_ROOTS[3]!.commit;

interface TreeEntry {
  readonly mode: string;
  readonly blobId: string;
  readonly path: string;
}

function contentSha256(bytes: Uint8Array): string {
  return `sha256:${sha256Bytes(bytes)}`;
}

async function gitText(args: readonly string[]): Promise<string> {
  const result = await execFileAsync("git", [...args], {
    cwd: process.cwd(),
    encoding: "utf8",
    maxBuffer: 128 * 1024 * 1024,
  });
  return result.stdout;
}

async function gitBytes(
  args: readonly string[],
): Promise<Buffer> {
  const result = await execFileAsync("git", [...args], {
    cwd: process.cwd(),
    encoding: "buffer",
    maxBuffer: 128 * 1024 * 1024,
  });
  return result.stdout;
}

async function readJson<T>(filePath: string): Promise<T> {
  return parseStrictJson(
    await readFile(filePath, "utf8"),
  ) as unknown as T;
}

async function fileSha256(filePath: string): Promise<string> {
  return contentSha256(await readFile(filePath));
}

async function objectIdsForRoot(
  rootCommit: string,
): Promise<ReadonlySet<string>> {
  const lines = (
    await gitText(["rev-list", "--objects", rootCommit])
  )
    .trim()
    .split("\n")
    .filter((entry) => entry.length > 0);
  return new Set(
    lines.map((entry) => entry.split(" ", 1)[0]!),
  );
}

async function objectType(
  objectId: string,
): Promise<"commit" | "tree" | "blob"> {
  const type = (
    await gitText(["cat-file", "-t", objectId])
  ).trim();
  if (
    type !== "commit" &&
    type !== "tree" &&
    type !== "blob"
  ) {
    throw new Error(
      `Unexpected public Git object type ${type}`,
    );
  }
  return type;
}

async function treeEntries(
  commitId: string,
): Promise<readonly TreeEntry[]> {
  const listing = await gitText([
    "ls-tree",
    "-r",
    "-z",
    commitId,
  ]);
  return listing
    .split("\0")
    .filter((entry) => entry.length > 0)
    .map((entry) => {
      const match =
        /^(100644|100755|120000) blob ([a-f0-9]{40})\t(.+)$/u.exec(
          entry,
        );
      if (match === null) {
        throw new Error(
          `Unexpected historical path entry ${entry}`,
        );
      }
      return {
        mode: match[1]!,
        blobId: match[2]!,
        path: match[3]!,
      };
    })
    .sort((left, right) =>
      left.path.localeCompare(right.path),
    );
}

function parseCommit(bytes: Buffer): {
  readonly treeId: string;
  readonly parentIds: readonly string[];
} {
  const lines = bytes.toString("utf8").split("\n");
  const treeLine = lines.find((line) =>
    line.startsWith("tree "),
  );
  if (treeLine === undefined) {
    throw new Error("Historical commit has no tree");
  }
  return {
    treeId: treeLine.slice("tree ".length),
    parentIds: lines
      .filter((line) => line.startsWith("parent "))
      .map((line) => line.slice("parent ".length)),
  };
}

function comparePath(
  left: { readonly commitId: string; readonly path: string },
  right: { readonly commitId: string; readonly path: string },
): number {
  return (
    left.commitId.localeCompare(right.commitId) ||
    left.path.localeCompare(right.path)
  );
}

function buildTransitions(input: {
  readonly commits: readonly {
    readonly commitId: string;
    readonly parentIds: readonly string[];
  }[];
  readonly maps: ReadonlyMap<
    string,
    ReadonlyMap<
      string,
      { readonly blobId: string; readonly mode: string }
    >
  >;
}): readonly HistoricalPathTransition[] {
  const output: HistoricalPathTransition[] = [];
  for (const commit of input.commits) {
    const parentCommitId = commit.parentIds[0] ?? null;
    const before =
      parentCommitId === null
        ? new Map<
            string,
            {
              readonly blobId: string;
              readonly mode: string;
            }
          >()
        : input.maps.get(parentCommitId);
    const after = input.maps.get(commit.commitId);
    if (before === undefined || after === undefined) {
      throw new Error(
        `Historical transition map missing for ${commit.commitId}`,
      );
    }
    const paths = new Set([
      ...before.keys(),
      ...after.keys(),
    ]);
    for (const filePath of [...paths].sort()) {
      const previous = before.get(filePath);
      const current = after.get(filePath);
      if (
        previous?.blobId === current?.blobId &&
        previous?.mode === current?.mode
      ) {
        continue;
      }
      const state =
        previous === undefined
          ? "added"
          : current === undefined
            ? "deleted"
            : previous.blobId !== current.blobId
              ? "modified"
              : "mode_changed";
      output.push({
        commitId: commit.commitId,
        parentCommitId,
        path: filePath,
        state,
        beforeBlobId: previous?.blobId ?? null,
        afterBlobId: current?.blobId ?? null,
        beforeMode: previous?.mode ?? null,
        afterMode: current?.mode ?? null,
      });
    }
  }
  return output.sort(comparePath);
}

function denied(action: () => unknown, label: string): void {
  let rejected = false;
  try {
    action();
  } catch (error) {
    rejected =
      error instanceof HarnessError &&
      error.code === "AUTHORIZATION_DENIED";
  }
  if (!rejected) {
    throw new Error(
      `Historical exposure policy allowed ${label}`,
    );
  }
}

const schemas = await SchemaRegistry.load(
  path.resolve("schemas"),
);
const [
  inventory,
  historicalLedger,
  supersedingClosure,
  priorInventory,
  priorLedger,
  deviation,
  priorClosure,
] = await Promise.all([
  readJson<HistoricalPublicObjectInventory>(INVENTORY_PATH),
  readJson<HistoricalPublicExposureLedger>(LEDGER_PATH),
  readJson<PublicationSupersedingClosureRecord>(CLOSURE_PATH),
  readJson<PublishedArtifactInventory>(
    PRIOR_INVENTORY_PATH,
  ),
  readJson<PublicExposureLedger>(PRIOR_LEDGER_PATH),
  readJson<PublicationDeviationRecord>(DEVIATION_PATH),
  readJson<PublicationRemediationClosureRecord>(
    PRIOR_CLOSURE_PATH,
  ),
]);
verifyHistoricalPublicObjectInventory({
  record: inventory,
  schemas,
});
verifyHistoricalPublicExposureLedger({
  record: historicalLedger,
  deviation,
  priorInventory,
  priorLedger,
  historicalInventory: inventory,
  schemas,
});
verifyPublicationSupersedingClosure({
  record: supersedingClosure,
  deviation,
  priorInventory,
  priorLedger,
  priorClosure,
  historicalInventory: inventory,
  historicalLedger,
  schemas,
});

if (
  (await fileSha256(PRIOR_CLOSURE_PATH)) !==
    EXPECTED_PRIOR_CLOSURE_FILE_SHA ||
  (await fileSha256(
    supersedingClosure.correctiveDecision.responsePath,
  )) !== EXPECTED_RESPONSE_SHA
) {
  throw new Error(
    "Prior closure or Architect response bytes changed",
  );
}

const rootObjectSets = await Promise.all(
  HISTORICAL_PUBLICATION_ROOTS.map((root) =>
    objectIdsForRoot(root.commit),
  ),
);
const unionObjectIds = new Set(
  rootObjectSets.flatMap((set) => [...set]),
);
const inventoryObjectIds = new Set([
  ...inventory.commits.map((entry) => entry.commitId),
  ...inventory.trees.map((entry) => entry.treeId),
  ...inventory.blobs.map((entry) => entry.blobId),
]);
if (
  unionObjectIds.size !== inventoryObjectIds.size ||
  [...unionObjectIds].some(
    (objectId) => !inventoryObjectIds.has(objectId),
  )
) {
  throw new Error(
    "Historical inventory differs from rev-list object union",
  );
}

const expectedTypes = new Map<string, string>();
for (const commit of inventory.commits) {
  expectedTypes.set(commit.commitId, "commit");
}
for (const tree of inventory.trees) {
  expectedTypes.set(tree.treeId, "tree");
}
for (const blob of inventory.blobs) {
  expectedTypes.set(blob.blobId, "blob");
}
for (const objectId of unionObjectIds) {
  if ((await objectType(objectId)) !== expectedTypes.get(objectId)) {
    throw new Error(
      `Historical object type mismatch for ${objectId}`,
    );
  }
}

for (const [rootIndex, rootSet] of rootObjectSets.entries()) {
  const rootCommit =
    HISTORICAL_PUBLICATION_ROOTS[rootIndex]!.commit;
  for (const object of [
    ...inventory.commits.map((entry) => ({
      id: entry.commitId,
      exposure: entry.exposure,
    })),
    ...inventory.trees.map((entry) => ({
      id: entry.treeId,
      exposure: entry.exposure,
    })),
    ...inventory.blobs.map((entry) => ({
      id: entry.blobId,
      exposure: entry.exposure,
    })),
  ]) {
    if (
      rootSet.has(object.id) !==
      object.exposure.rootCommits.includes(rootCommit)
    ) {
      throw new Error(
        `Historical root membership mismatch for ${object.id}`,
      );
    }
  }
}

for (const commit of inventory.commits) {
  const bytes = await gitBytes([
    "cat-file",
    "commit",
    commit.commitId,
  ]);
  const parsed = parseCommit(bytes);
  if (
    parsed.treeId !== commit.treeId ||
    canonicalize(
      parsed.parentIds as unknown as JsonValue,
    ) !==
      canonicalize(
        commit.parentIds as unknown as JsonValue,
      ) ||
    bytes.byteLength !== commit.sizeBytes ||
    contentSha256(bytes) !== commit.contentSha256
  ) {
    throw new Error(
      `Historical commit reconstruction failed: ${commit.commitId}`,
    );
  }
}
for (const tree of inventory.trees) {
  const bytes = await gitBytes([
    "cat-file",
    "tree",
    tree.treeId,
  ]);
  if (
    bytes.byteLength !== tree.sizeBytes ||
    contentSha256(bytes) !== tree.contentSha256
  ) {
    throw new Error(
      `Historical tree reconstruction failed: ${tree.treeId}`,
    );
  }
}
const bytesByBlob = new Map<string, Buffer>();
for (const blob of inventory.blobs) {
  const bytes = await gitBytes([
    "cat-file",
    "blob",
    blob.blobId,
  ]);
  bytesByBlob.set(blob.blobId, bytes);
  if (
    bytes.byteLength !== blob.sizeBytes ||
    contentSha256(bytes) !== blob.contentSha256
  ) {
    throw new Error(
      `Historical blob reconstruction failed: ${blob.blobId}`,
    );
  }
}

const reconstructedObservations:
  HistoricalPathObservation[] = [];
const pathMaps = new Map<
  string,
  Map<
    string,
    { readonly blobId: string; readonly mode: string }
  >
>();
for (const commit of inventory.commits) {
  const entries = await treeEntries(commit.commitId);
  const pathMap = new Map<
    string,
    { readonly blobId: string; readonly mode: string }
  >();
  for (const entry of entries) {
    reconstructedObservations.push({
      commitId: commit.commitId,
      rootTreeId: commit.treeId,
      path: entry.path,
      mode: entry.mode,
      blobId: entry.blobId,
    });
    pathMap.set(entry.path, {
      blobId: entry.blobId,
      mode: entry.mode,
    });
  }
  pathMaps.set(commit.commitId, pathMap);
}
reconstructedObservations.sort(comparePath);
if (
  canonicalize(
    reconstructedObservations as unknown as JsonValue,
  ) !==
  canonicalize(
    inventory.pathObservations as unknown as JsonValue,
  )
) {
  throw new Error(
    "Historical path observations do not reconstruct",
  );
}
const transitions = buildTransitions({
  commits: inventory.commits,
  maps: pathMaps,
});
if (
  canonicalize(transitions as unknown as JsonValue) !==
  canonicalize(
    inventory.pathTransitions as unknown as JsonValue,
  )
) {
  throw new Error(
    "Historical deletion/change transitions do not reconstruct",
  );
}

const knownFalsePositive =
  "sk-validation-mode-must-ignore-this";
const secretPatterns = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/u,
  /\bsk-[A-Za-z0-9_-]{32,}\b/u,
  /\b(?:ghp|gho|ghu|ghs|github_pat)_[A-Za-z0-9_]{30,}\b/u,
  /\bAKIA[A-Z0-9]{16}\b/u,
] as const;
const secretMatches: string[] = [];
for (const [blobId, bytes] of bytesByBlob) {
  if (bytes.includes(0)) continue;
  const text = bytes
    .toString("utf8")
    .replaceAll(knownFalsePositive, "");
  if (secretPatterns.some((pattern) => pattern.test(text))) {
    secretMatches.push(blobId);
  }
}
const environmentPaths = new Set(
  inventory.pathObservations
    .map((entry) => entry.path)
    .filter((filePath) => {
      const name = path.posix.basename(filePath);
      return (
        name === ".env" ||
        (/^\.env\./u.test(name) &&
          !/\.(?:example|sample|template|dist)$/u.test(
            name,
          ))
      );
    }),
);
if (
  secretMatches.length > 0 ||
  environmentPaths.size > 0 ||
  inventory.secretScan.uniqueBlobsScanned !==
    bytesByBlob.size
) {
  throw new Error(
    "Expanded historical secret scan failed",
  );
}

const remote = (
  await gitText([
    "ls-remote",
    "--heads",
    "origin",
    "main",
  ])
).trim();
if (!remote.startsWith(`${CORRECTIVE_COMMIT}\t`)) {
  throw new Error(
    "Current remote observation no longer matches corrective publication",
  );
}

for (const [filePath, expectedHash] of [
  [
    supersedingClosure.validatorEvidence
      .implementationPath,
    supersedingClosure.validatorEvidence
      .implementationSha256,
  ],
  [
    supersedingClosure.validatorEvidence.testPath,
    supersedingClosure.validatorEvidence.testSha256,
  ],
  [
    supersedingClosure.validatorEvidence.verifierPath,
    supersedingClosure.validatorEvidence.verifierSha256,
  ],
] as const) {
  if ((await fileSha256(filePath)) !== expectedHash) {
    throw new Error(
      `Historical validator evidence drifted: ${filePath}`,
    );
  }
}

const policy = new HistoricalPublicExposurePolicy({
  ledger: historicalLedger,
  deviation,
  priorInventory,
  priorLedger,
  historicalInventory: inventory,
  schemas,
});
const historicalOnly = inventory.blobs.find(
  (entry) => entry.historicalOnlyRelativeToA5,
);
if (historicalOnly === undefined) {
  throw new Error("No historical-only blob was recorded");
}
const correctiveObservation =
  inventory.pathObservations.find(
    (entry) =>
      entry.commitId === CORRECTIVE_COMMIT &&
      entry.path ===
        "src/governance/publication-exposure.ts",
  );
if (correctiveObservation === undefined) {
  throw new Error(
    "Corrective-only source path was not recorded",
  );
}
const correctiveBlob = inventory.blobs.find(
  (entry) =>
    entry.blobId === correctiveObservation.blobId,
);
if (correctiveBlob?.correctiveOnly !== true) {
  throw new Error(
    "Corrective-only source blob classification failed",
  );
}
denied(
  () =>
    policy.assertGraphAllowed({
      useClass: "gate",
      rootReferences: [historicalOnly.blobId],
      nodes: [],
    }),
  "deleted historical blob",
);
denied(
  () =>
    policy.assertGraphAllowed({
      useClass: "final",
      rootReferences: ["copied.historical"],
      nodes: [
        {
          nodeId: "copied.historical",
          contentHash: historicalOnly.contentSha256,
          gitBlobId: null,
          path: "sealed/copied-history",
          aliases: [],
          dependencies: [],
          wrappers: [],
          provenanceReferences: [],
        },
      ],
    }),
  "copied historical content",
);
denied(
  () =>
    policy.assertGraphAllowed({
      useClass: "research_evidence",
      rootReferences: [correctiveBlob.blobId],
      nodes: [],
    }),
  "corrective-only source",
);
denied(
  () =>
    policy.assertGraphAllowed({
      useClass: "governance_audit",
      rootReferences: ["unrelated"],
      nodes: [],
      resetClaims: {
        unreachableCommitRestoresSecrecy: true,
      },
    }),
  "unreachable known commit reset",
);
denied(
  () =>
    policy.assertGraphAllowed({
      useClass: "research_selection",
      rootReferences: ["manifest.historical-dependency"],
      nodes: [
        {
          nodeId: "manifest.historical-dependency",
          contentHash: sha256Text(
            "manifest.historical-dependency",
          ),
          gitBlobId: null,
          path: "research/manifest.json",
          aliases: [],
          dependencies: [historicalOnly.blobId],
          wrappers: [],
          provenanceReferences: [],
        },
      ],
    }),
  "manifest with historical-only dependency",
);

process.stdout.write(
  [
    "PASS",
    `roots=${inventory.counts.publicationRoots}`,
    `commits=${inventory.counts.reachableCommits}`,
    `trees=${inventory.counts.uniqueTrees}`,
    `blobs=${inventory.counts.uniqueBlobs}`,
    `observations=${inventory.counts.pathObservations}`,
    `transitions=${inventory.counts.pathTransitions}`,
    `historicalOnly=${inventory.counts.historicalOnlyBlobs}`,
    `correctiveOnly=${inventory.counts.correctiveOnlyBlobs}`,
    `artifacts=${historicalLedger.artifacts.length}`,
    `secrets=${secretMatches.length}`,
    `inventory=${inventory.inventoryHash}`,
    `ledger=${historicalLedger.ledgerHash}`,
    `closure=${supersedingClosure.recordHash}`,
  ].join(" ") + "\n",
);
