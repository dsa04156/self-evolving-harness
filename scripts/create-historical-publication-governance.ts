import { execFile } from "node:child_process";
import {
  access,
  mkdir,
  readFile,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import {
  HISTORICAL_PUBLICATION_ROOTS,
  PrincipalSigner,
  SchemaRegistry,
  canonicalize,
  createHistoricalPublicExposureLedger,
  createHistoricalPublicObjectInventory,
  createPublicationSupersedingClosure,
  parseStrictJson,
  sha256Bytes,
  sha256Text,
  type HistoricalBlobObject,
  type HistoricalCommitObject,
  type HistoricalObjectExposure,
  type HistoricalPathObservation,
  type HistoricalPathTransition,
  type HistoricalPublicExposureArtifact,
  type HistoricalSecretScan,
  type HistoricalTreeObject,
  type JsonValue,
  type PublicationDeviationRecord,
  type PublicationRemediationClosureRecord,
  type PublicExposureArtifactClass,
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
const IMPLEMENTATION_PATH =
  "src/governance/historical-publication-exposure.ts";
const TEST_PATH =
  "test/historical-publication-exposure.test.ts";
const VERIFIER_PATH =
  "scripts/verify-historical-publication-governance.ts";
const CORRECTIVE_RESPONSE_PATH =
  ".codex/gpt-pro-architect/responses/response-3rrrrr.md";
const A5_COMMIT = HISTORICAL_PUBLICATION_ROOTS[2]!.commit;
const CORRECTIVE_COMMIT =
  HISTORICAL_PUBLICATION_ROOTS[3]!.commit;

interface GitTreeEntry {
  readonly mode: string;
  readonly type: "tree" | "blob";
  readonly objectId: string;
  readonly path: string;
}

interface TraversedGitUnion {
  readonly commits: readonly HistoricalCommitObject[];
  readonly trees: readonly HistoricalTreeObject[];
  readonly blobs: readonly HistoricalBlobObject[];
  readonly pathObservations:
    readonly HistoricalPathObservation[];
  readonly pathTransitions:
    readonly HistoricalPathTransition[];
  readonly bytesByBlobId: ReadonlyMap<string, Buffer>;
}

interface MutableArtifact {
  exposureId: string;
  artifactClass: PublicExposureArtifactClass;
  artifactId: string;
  sourceKind: "git_object" | "embedded_record";
  gitObjectType: "commit" | "tree" | "blob" | "embedded";
  gitObjectId: string | null;
  contentHash: string;
  paths: Set<string>;
  aliases: Set<string>;
  dependencies: Set<string>;
  provenanceReferences: Set<string>;
}

const ROOT_COMMITS = HISTORICAL_PUBLICATION_ROOTS.map(
  (root) => root.commit,
);

function contentSha256(bytes: Uint8Array): string {
  return `sha256:${sha256Bytes(bytes)}`;
}

async function gitText(args: readonly string[]): Promise<string> {
  const result = await execFileAsync("git", [...args], {
    cwd: process.cwd(),
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
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

async function objectBytes(
  objectType: "commit" | "tree" | "blob",
  objectId: string,
): Promise<Buffer> {
  return gitBytes(["cat-file", objectType, objectId]);
}

function exposureForRoots(
  rootCommits: readonly string[],
): HistoricalObjectExposure {
  const roots = HISTORICAL_PUBLICATION_ROOTS.filter((root) =>
    rootCommits.includes(root.commit),
  );
  if (roots.length === 0) {
    throw new Error("Git object is not exposed by a recorded root");
  }
  return {
    firstRootOrdinal: roots[0]!.ordinal,
    firstPublishedAt: roots[0]!.publishedAt,
    rootCommits: roots.map((root) => root.commit),
  };
}

async function reachableCommitsByRoot(): Promise<
  readonly ReadonlySet<string>[]
> {
  const output: ReadonlySet<string>[] = [];
  for (const root of HISTORICAL_PUBLICATION_ROOTS) {
    const commits = (
      await gitText(["rev-list", root.commit])
    )
      .trim()
      .split("\n")
      .filter((value) => value.length > 0);
    if (!commits.includes(root.commit)) {
      throw new Error(
        `Git traversal omitted publication root ${root.commit}`,
      );
    }
    output.push(new Set(commits));
  }
  return output;
}

function rootsContainingCommit(
  commitId: string,
  reachable: readonly ReadonlySet<string>[],
): readonly string[] {
  return HISTORICAL_PUBLICATION_ROOTS.filter((_, index) =>
    reachable[index]!.has(commitId),
  ).map((root) => root.commit);
}

async function commitOrder(): Promise<readonly string[]> {
  const output = (
    await gitText([
      "rev-list",
      "--topo-order",
      "--reverse",
      ...ROOT_COMMITS,
    ])
  )
    .trim()
    .split("\n")
    .filter((entry) => entry.length > 0);
  if (new Set(output).size !== output.length) {
    throw new Error("Git commit traversal returned duplicates");
  }
  return output;
}

function parseCommit(bytes: Buffer): {
  readonly treeId: string;
  readonly parentIds: readonly string[];
} {
  const lines = bytes.toString("utf8").split("\n");
  const tree = lines.find((line) => line.startsWith("tree "));
  if (tree === undefined) {
    throw new Error("Commit object has no root tree");
  }
  return {
    treeId: tree.slice("tree ".length),
    parentIds: lines
      .filter((line) => line.startsWith("parent "))
      .map((line) => line.slice("parent ".length)),
  };
}

async function recursiveTreeEntries(
  commitId: string,
): Promise<readonly GitTreeEntry[]> {
  const output = await gitText([
    "ls-tree",
    "-r",
    "-t",
    "-z",
    commitId,
  ]);
  return output
    .split("\0")
    .filter((entry) => entry.length > 0)
    .map((entry) => {
      const match =
        /^([0-9]{6}) (tree|blob) ([a-f0-9]{40})\t(.+)$/u.exec(
          entry,
        );
      if (match === null) {
        throw new Error(
          `Unsupported recursive tree entry: ${entry}`,
        );
      }
      return {
        mode: match[1]!,
        type: match[2]! as "tree" | "blob",
        objectId: match[3]!,
        path: match[4]!,
      };
    });
}

function transitionState(input: {
  readonly before:
    | { readonly blobId: string; readonly mode: string }
    | undefined;
  readonly after:
    | { readonly blobId: string; readonly mode: string }
    | undefined;
}): HistoricalPathTransition["state"] | null {
  if (input.before === undefined) return "added";
  if (input.after === undefined) return "deleted";
  if (input.before.blobId !== input.after.blobId) {
    return "modified";
  }
  if (input.before.mode !== input.after.mode) {
    return "mode_changed";
  }
  return null;
}

async function traverseGitUnion(): Promise<TraversedGitUnion> {
  const reachable = await reachableCommitsByRoot();
  const orderedCommits = await commitOrder();
  const commits: HistoricalCommitObject[] = [];
  const treeRootMembership = new Map<string, Set<string>>();
  const blobRootMembership = new Map<string, Set<string>>();
  const pathObservations: HistoricalPathObservation[] = [];
  const pathMapByCommit = new Map<
    string,
    Map<string, { readonly blobId: string; readonly mode: string }>
  >();
  const rootTreeByCommit = new Map<string, string>();
  const parentIdsByCommit = new Map<
    string,
    readonly string[]
  >();

  for (const commitId of orderedCommits) {
    const bytes = await objectBytes("commit", commitId);
    const parsed = parseCommit(bytes);
    const exposedBy = rootsContainingCommit(
      commitId,
      reachable,
    );
    commits.push({
      commitId,
      treeId: parsed.treeId,
      parentIds: parsed.parentIds,
      sizeBytes: bytes.byteLength,
      contentSha256: contentSha256(bytes),
      exposure: exposureForRoots(exposedBy),
    });
    rootTreeByCommit.set(commitId, parsed.treeId);
    parentIdsByCommit.set(commitId, parsed.parentIds);
    const rootTreeMembership =
      treeRootMembership.get(parsed.treeId) ??
      new Set<string>();
    exposedBy.forEach((root) =>
      rootTreeMembership.add(root),
    );
    treeRootMembership.set(
      parsed.treeId,
      rootTreeMembership,
    );

    const entries = await recursiveTreeEntries(commitId);
    const pathMap = new Map<
      string,
      { readonly blobId: string; readonly mode: string }
    >();
    for (const entry of entries) {
      if (entry.type === "tree") {
        const roots =
          treeRootMembership.get(entry.objectId) ??
          new Set<string>();
        exposedBy.forEach((root) => roots.add(root));
        treeRootMembership.set(entry.objectId, roots);
        continue;
      }
      const roots =
        blobRootMembership.get(entry.objectId) ??
        new Set<string>();
      exposedBy.forEach((root) => roots.add(root));
      blobRootMembership.set(entry.objectId, roots);
      pathMap.set(entry.path, {
        blobId: entry.objectId,
        mode: entry.mode,
      });
      pathObservations.push({
        commitId,
        rootTreeId: parsed.treeId,
        path: entry.path,
        mode: entry.mode,
        blobId: entry.objectId,
      });
    }
    pathMapByCommit.set(commitId, pathMap);
  }

  const pathTransitions: HistoricalPathTransition[] = [];
  for (const commitId of orderedCommits) {
    const parentId =
      parentIdsByCommit.get(commitId)?.[0] ?? null;
    const before =
      parentId === null
        ? new Map<
            string,
            {
              readonly blobId: string;
              readonly mode: string;
            }
          >()
        : pathMapByCommit.get(parentId);
    if (before === undefined) {
      throw new Error(
        `First-parent path map missing for ${commitId}`,
      );
    }
    const after = pathMapByCommit.get(commitId)!;
    const paths = new Set([
      ...before.keys(),
      ...after.keys(),
    ]);
    for (const filePath of [...paths].sort()) {
      const beforeEntry = before.get(filePath);
      const afterEntry = after.get(filePath);
      const state = transitionState({
        before: beforeEntry,
        after: afterEntry,
      });
      if (state === null) continue;
      pathTransitions.push({
        commitId,
        parentCommitId: parentId,
        path: filePath,
        state,
        beforeBlobId: beforeEntry?.blobId ?? null,
        afterBlobId: afterEntry?.blobId ?? null,
        beforeMode: beforeEntry?.mode ?? null,
        afterMode: afterEntry?.mode ?? null,
      });
    }
  }

  const trees: HistoricalTreeObject[] = [];
  for (const [treeId, roots] of treeRootMembership) {
    const bytes = await objectBytes("tree", treeId);
    trees.push({
      treeId,
      sizeBytes: bytes.byteLength,
      contentSha256: contentSha256(bytes),
      exposure: exposureForRoots([...roots]),
    });
  }
  const observationsByBlob = new Map<string, Set<string>>();
  for (const observation of pathObservations) {
    const paths =
      observationsByBlob.get(observation.blobId) ??
      new Set<string>();
    paths.add(observation.path);
    observationsByBlob.set(observation.blobId, paths);
  }
  const a5Blobs = new Set(
    [...pathMapByCommit.get(A5_COMMIT)!.values()].map(
      (entry) => entry.blobId,
    ),
  );
  const correctiveBlobs = new Set(
    [
      ...pathMapByCommit.get(CORRECTIVE_COMMIT)!.values(),
    ].map((entry) => entry.blobId),
  );
  const bytesByBlobId = new Map<string, Buffer>();
  const blobs: HistoricalBlobObject[] = [];
  for (const [blobId, roots] of blobRootMembership) {
    const bytes = await objectBytes("blob", blobId);
    bytesByBlobId.set(blobId, bytes);
    const exposure = exposureForRoots([...roots]);
    blobs.push({
      blobId,
      sizeBytes: bytes.byteLength,
      contentSha256: contentSha256(bytes),
      paths: [
        ...(observationsByBlob.get(blobId) ??
          new Set<string>()),
      ].sort(),
      presentInA5Snapshot: a5Blobs.has(blobId),
      presentInCorrectiveSnapshot:
        correctiveBlobs.has(blobId),
      historicalOnlyRelativeToA5:
        !a5Blobs.has(blobId) &&
        exposure.rootCommits.includes(A5_COMMIT),
      correctiveOnly: exposure.firstRootOrdinal === 3,
      exposure,
    });
  }
  return {
    commits,
    trees,
    blobs,
    pathObservations,
    pathTransitions,
    bytesByBlobId,
  };
}

function actualEnvironmentFile(filePath: string): boolean {
  const name = path.posix.basename(filePath);
  return (
    name === ".env" ||
    (/^\.env\./u.test(name) &&
      !/\.(?:example|sample|template|dist)$/u.test(name))
  );
}

function scanHistoricalUnion(
  union: TraversedGitUnion,
): HistoricalSecretScan {
  const falsePositiveLiterals = [
    "sk-validation-mode-must-ignore-this",
  ] as const;
  const patterns: readonly {
    readonly label: string;
    readonly pattern: RegExp;
  }[] = [
    {
      label: "private key PEM",
      pattern:
        /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/u,
    },
    {
      label: "OpenAI-style live key",
      pattern: /\bsk-[A-Za-z0-9_-]{32,}\b/u,
    },
    {
      label: "GitHub personal access token",
      pattern:
        /\b(?:ghp|gho|ghu|ghs|github_pat)_[A-Za-z0-9_]{30,}\b/u,
    },
    {
      label: "AWS access key",
      pattern: /\bAKIA[A-Z0-9]{16}\b/u,
    },
  ];
  const matches: string[] = [];
  for (const [blobId, bytes] of union.bytesByBlobId) {
    if (bytes.includes(0)) continue;
    let text = bytes.toString("utf8");
    falsePositiveLiterals.forEach((literal) => {
      text = text.replaceAll(literal, "");
    });
    for (const entry of patterns) {
      if (entry.pattern.test(text)) {
        matches.push(`${entry.label}:${blobId}`);
      }
    }
  }
  const environmentPaths = new Set(
    union.pathObservations
      .map((entry) => entry.path)
      .filter(actualEnvironmentFile),
  );
  if (matches.length > 0 || environmentPaths.size > 0) {
    throw new Error(
      `Historical public-union secret scan failed: ${[
        ...matches,
        ...[...environmentPaths].map(
          (filePath) => `environment-file:${filePath}`,
        ),
      ].join(", ")}`,
    );
  }
  return {
    scope:
      "complete_recorded_public_git_object_union",
    patterns: patterns.map((entry) => entry.label),
    falsePositiveLiterals,
    uniqueBlobsScanned: union.blobs.length,
    historicalOnlyBlobsScanned: union.blobs.filter(
      (entry) => entry.historicalOnlyRelativeToA5,
    ).length,
    correctiveOnlyBlobsScanned: union.blobs.filter(
      (entry) => entry.correctiveOnly,
    ).length,
    pathObservationsScanned:
      union.pathObservations.length,
    environmentFilesFound: 0,
    actualSecretMatches: 0,
    privateKeysPublished: false,
    result: "no_actual_secret_match",
  };
}

const CLASS_PRIORITY: Readonly<
  Record<PublicExposureArtifactClass, number>
> = {
  published_source: 0,
  development_documentation: 1,
  development_prototype: 2,
  development_fixture: 3,
  development_corpus: 4,
  development_oracle: 5,
  development_prediction: 6,
  development_execution: 7,
  development_receipt: 8,
  development_candidate: 9,
  development_evaluation: 10,
  development_score: 11,
  development_quarantine: 12,
};

function classifyPath(
  filePath: string,
): PublicExposureArtifactClass {
  const normalized = filePath.toLowerCase();
  if (
    normalized.includes("quarantine") ||
    normalized.includes("non-promotable") ||
    normalized.includes("taint") ||
    normalized.startsWith("governance/")
  ) {
    return "development_quarantine";
  }
  if (
    normalized.includes("score") ||
    normalized.includes("scorer")
  ) {
    return "development_score";
  }
  if (normalized.includes("prediction")) {
    return "development_prediction";
  }
  if (normalized.includes("receipt")) {
    return "development_receipt";
  }
  if (
    normalized.includes("candidate") ||
    normalized.includes("mutation") ||
    normalized.includes("proposal")
  ) {
    return "development_candidate";
  }
  if (
    normalized.includes("evaluation") ||
    normalized.includes("evaluator")
  ) {
    return "development_evaluation";
  }
  if (
    normalized.includes("runtime") ||
    normalized.includes("execution")
  ) {
    return "development_execution";
  }
  if (normalized.includes("oracle")) {
    return "development_oracle";
  }
  if (normalized.includes("corpus")) {
    return "development_corpus";
  }
  if (
    normalized.startsWith("benchmarks/") ||
    normalized.includes("fixture")
  ) {
    return "development_fixture";
  }
  if (
    normalized.endsWith(".md") ||
    normalized.startsWith("docs/") ||
    normalized.startsWith("architect/")
  ) {
    return "development_documentation";
  }
  if (
    normalized.startsWith("test/") ||
    normalized.startsWith("scripts/")
  ) {
    return "development_prototype";
  }
  return "published_source";
}

function strongestClass(
  paths: readonly string[],
): PublicExposureArtifactClass {
  return paths
    .map(classifyPath)
    .sort(
      (left, right) =>
        CLASS_PRIORITY[right] - CLASS_PRIORITY[left],
    )[0] ?? "published_source";
}

function hashLike(value: string): boolean {
  return /^(?:sha256|hv-sha256|cm-sha256|ci-sha256|ctr-sha256|protocol-sha256|bundle-sha256|rss-sha256):[a-f0-9]{64}$/u.test(
    value,
  );
}

function buildHistoricalArtifacts(
  union: TraversedGitUnion,
): readonly Omit<
  HistoricalPublicExposureArtifact,
  "eligibility"
>[] {
  const artifacts: MutableArtifact[] = [];
  for (const commit of union.commits) {
    artifacts.push({
      exposureId: `public.git-commit.${commit.commitId}`,
      artifactClass: "published_source",
      artifactId: `git-commit:${commit.commitId}`,
      sourceKind: "git_object",
      gitObjectType: "commit",
      gitObjectId: commit.commitId,
      contentHash: commit.contentSha256,
      paths: new Set(),
      aliases: new Set([commit.commitId]),
      dependencies: new Set([
        `git-tree:${commit.treeId}`,
        ...commit.parentIds.map(
          (parent) => `git-commit:${parent}`,
        ),
      ]),
      provenanceReferences: new Set(
        commit.exposure.rootCommits.map(
          (root) => `publication-root:${root}`,
        ),
      ),
    });
  }
  for (const tree of union.trees) {
    artifacts.push({
      exposureId: `public.git-tree.${tree.treeId}`,
      artifactClass: "published_source",
      artifactId: `git-tree:${tree.treeId}`,
      sourceKind: "git_object",
      gitObjectType: "tree",
      gitObjectId: tree.treeId,
      contentHash: tree.contentSha256,
      paths: new Set(),
      aliases: new Set([tree.treeId]),
      dependencies: new Set(),
      provenanceReferences: new Set(
        tree.exposure.rootCommits.map(
          (root) => `publication-root:${root}`,
        ),
      ),
    });
  }
  const observationsByBlob = new Map<
    string,
    HistoricalPathObservation[]
  >();
  for (const observation of union.pathObservations) {
    const prior =
      observationsByBlob.get(observation.blobId) ?? [];
    prior.push(observation);
    observationsByBlob.set(observation.blobId, prior);
  }
  for (const blob of union.blobs) {
    const observations =
      observationsByBlob.get(blob.blobId) ?? [];
    artifacts.push({
      exposureId: `public.git-blob-history.${blob.blobId}`,
      artifactClass: strongestClass(blob.paths),
      artifactId: `git-blob:${blob.blobId}`,
      sourceKind: "git_object",
      gitObjectType: "blob",
      gitObjectId: blob.blobId,
      contentHash: blob.contentSha256,
      paths: new Set(blob.paths),
      aliases: new Set([
        blob.blobId,
        ...blob.paths.map(
          (filePath) => `git-path:${filePath}`,
        ),
        ...observations.map(
          (entry) =>
            `git:${entry.commitId}:${entry.path}`,
        ),
      ]),
      dependencies: new Set(),
      provenanceReferences: new Set(
        blob.exposure.rootCommits.map(
          (root) => `publication-root:${root}`,
        ),
      ),
    });
  }

  const identifierSources = new Map<string, Set<string>>();
  for (const blob of union.blobs) {
    const bytes = union.bytesByBlobId.get(blob.blobId)!;
    if (bytes.includes(0)) continue;
    const text = bytes.toString("utf8");
    const matches =
      text.match(
        /(?:sha256|hv-sha256|cm-sha256|ci-sha256|ctr-sha256|protocol-sha256|bundle-sha256|rss-sha256):[a-f0-9]{64}/gu,
      ) ?? [];
    for (const identifier of matches) {
      if (!hashLike(identifier)) continue;
      const sources =
        identifierSources.get(identifier) ??
        new Set<string>();
      blob.paths.forEach((filePath) =>
        sources.add(filePath),
      );
      identifierSources.set(identifier, sources);
    }
  }
  for (const [identifier, sources] of identifierSources) {
    const sourcePaths = [...sources].sort();
    artifacts.push({
      exposureId: `public.embedded-history.${sha256Bytes(
        Buffer.from(identifier, "utf8"),
      )}`,
      artifactClass: strongestClass(sourcePaths),
      artifactId: identifier,
      sourceKind: "embedded_record",
      gitObjectType: "embedded",
      gitObjectId: null,
      contentHash: identifier.startsWith("sha256:")
        ? identifier
        : sha256Text(identifier),
      paths: new Set(sourcePaths),
      aliases: new Set(
        sourcePaths.map(
          (filePath) => `embedded-in:${filePath}`,
        ),
      ),
      dependencies: new Set(),
      provenanceReferences: new Set(
        sourcePaths.map(
          (filePath) => `public-path:${filePath}`,
        ),
      ),
    });
  }
  return artifacts
    .map((entry) => ({
      exposureId: entry.exposureId,
      artifactClass: entry.artifactClass,
      artifactId: entry.artifactId,
      sourceKind: entry.sourceKind,
      gitObjectType: entry.gitObjectType,
      gitObjectId: entry.gitObjectId,
      contentHash: entry.contentHash,
      paths: [...entry.paths].sort(),
      aliases: [...entry.aliases].sort(),
      dependencies: [...entry.dependencies].sort(),
      provenanceReferences: [
        ...entry.provenanceReferences,
      ].sort(),
    }))
    .sort((left, right) =>
      left.exposureId.localeCompare(right.exposureId),
    );
}

async function readJson<T>(filePath: string): Promise<T> {
  return parseStrictJson(
    await readFile(filePath, "utf8"),
  ) as unknown as T;
}

async function fileSha256(filePath: string): Promise<string> {
  return contentSha256(await readFile(filePath));
}

async function ensureAbsent(
  filePaths: readonly string[],
): Promise<void> {
  for (const filePath of filePaths) {
    try {
      await access(filePath);
    } catch {
      continue;
    }
    throw new Error(
      `Refusing to overwrite historical governance record: ${filePath}`,
    );
  }
}

const schemas = await SchemaRegistry.load(
  path.resolve("schemas"),
);
const priorInventory =
  await readJson<PublishedArtifactInventory>(
    PRIOR_INVENTORY_PATH,
  );
const priorLedger = await readJson<PublicExposureLedger>(
  PRIOR_LEDGER_PATH,
);
const deviation = await readJson<PublicationDeviationRecord>(
  DEVIATION_PATH,
);
const priorClosure =
  await readJson<PublicationRemediationClosureRecord>(
    PRIOR_CLOSURE_PATH,
  );
const union = await traverseGitUnion();
const secretScan = scanHistoricalUnion(union);
const inventory = createHistoricalPublicObjectInventory({
  inventoryId:
    "historical-public-inventory.origin-main.through-8b5f144",
  repository: priorInventory.repository,
  publicationRoots: HISTORICAL_PUBLICATION_ROOTS,
  commits: union.commits,
  trees: union.trees,
  blobs: union.blobs,
  pathObservations: union.pathObservations,
  pathTransitions: union.pathTransitions,
  secretScan,
  createdAt: "2026-07-31T16:20:00+09:00",
  schemas,
});
const author = PrincipalSigner.generate({
  principalId:
    "protocol.author.historical-publication-governance.2026-07-31",
  role: "protocol_author",
  implementationDigest: await fileSha256(
    IMPLEMENTATION_PATH,
  ),
  instanceId:
    "protocol.author.historical-publication-governance.2026-07-31.instance",
  keyId:
    "protocol.author.historical-publication-governance.2026-07-31.ed25519",
});
const artifacts = buildHistoricalArtifacts(union);
const historicalLedger =
  createHistoricalPublicExposureLedger({
    ledgerId:
      "historical-public-exposure.origin-main.through-8b5f144",
    governanceDomainId:
      "self-evolving-harness.publication-governance",
    deviation,
    priorInventory,
    priorLedger,
    historicalInventory: inventory,
    artifacts,
    createdAt: "2026-07-31T16:21:00+09:00",
    signer: author,
    schemas,
  });
const supersedingClosure =
  createPublicationSupersedingClosure({
    value: {
      closureId:
        "publication-remediation.github-development.superseding.2026-07-31",
      governanceDomainId:
        "self-evolving-harness.publication-governance",
      deviationId: deviation.deviationId,
      deviationRecordHash: deviation.recordHash,
      priorClosureId: priorClosure.closureId,
      priorClosureHash: priorClosure.recordHash,
      priorClosureFileSha256:
        await fileSha256(PRIOR_CLOSURE_PATH),
      correctiveDecision: {
        round: "03RRRRR",
        decision: "REVISE",
        responsePath: CORRECTIVE_RESPONSE_PATH,
        responseSha256: await fileSha256(
          CORRECTIVE_RESPONSE_PATH,
        ),
      },
      historicalInventoryId: inventory.inventoryId,
      historicalInventoryHash: inventory.inventoryHash,
      historicalLedgerId: historicalLedger.ledgerId,
      historicalLedgerHash: historicalLedger.ledgerHash,
      expandedSecretScan: {
        uniqueBlobsScanned:
          secretScan.uniqueBlobsScanned,
        historicalOnlyBlobsScanned:
          secretScan.historicalOnlyBlobsScanned,
        correctiveOnlyBlobsScanned:
          secretScan.correctiveOnlyBlobsScanned,
        environmentFilesFound: 0,
        actualSecretMatches: 0,
      },
      validatorEvidence: {
        implementationPath: IMPLEMENTATION_PATH,
        implementationSha256: await fileSha256(
          IMPLEMENTATION_PATH,
        ),
        testPath: TEST_PATH,
        testSha256: await fileSha256(TEST_PATH),
        verifierPath: VERIFIER_PATH,
        verifierSha256: await fileSha256(VERIFIER_PATH),
      },
      remediation: {
        priorClosureModified: false,
        priorClosureWasPremature: true,
        closureStatus:
          "superseded_by_complete_historical_union",
        completedActions: [
          "Enumerated every commit, recursive tree, blob, and path reachable from all four recorded public ref states.",
          "Recorded every per-commit path observation and first-parent add, modify, mode-change, and deletion transition.",
          "Scanned the complete historical and corrective blob union for credentials and environment files.",
          "Extended permanent exposure to every Git object, path alias, embedded identifier, historical-only blob, and corrective-only blob.",
          "Added rejection cases for deleted history, copied historical bytes, corrective-only files, unreachable commits, and historical-only dependencies.",
          "Preserved the original deviation, snapshot inventory, snapshot ledger, and premature closure byte-for-byte.",
        ],
        outstandingActions: [],
      },
      claimBoundary: {
        historicalPublicationGovernanceClosed: true,
        publicDevelopmentArtifactsPermanent: true,
        heldOutEligibilityRestored: false,
        researchEvidenceAuthorized: false,
        promotionAuthorized: false,
        providerUsed: false,
        selfImprovementClaim: false,
        additionalPushPerformed: false,
      },
      closedAt: "2026-07-31T16:22:00+09:00",
    },
    deviation,
    priorInventory,
    priorLedger,
    priorClosure,
    historicalInventory: inventory,
    historicalLedger,
    signer: author,
    schemas,
  });

await ensureAbsent([
  INVENTORY_PATH,
  LEDGER_PATH,
  CLOSURE_PATH,
]);
for (const outputPath of [
  INVENTORY_PATH,
  LEDGER_PATH,
  CLOSURE_PATH,
]) {
  await mkdir(path.dirname(outputPath), { recursive: true });
}
await writeFile(
  INVENTORY_PATH,
  `${canonicalize(inventory as unknown as JsonValue)}\n`,
  { encoding: "utf8", flag: "wx" },
);
await writeFile(
  LEDGER_PATH,
  `${canonicalize(
    historicalLedger as unknown as JsonValue,
  )}\n`,
  { encoding: "utf8", flag: "wx" },
);
await writeFile(
  CLOSURE_PATH,
  `${canonicalize(
    supersedingClosure as unknown as JsonValue,
  )}\n`,
  { encoding: "utf8", flag: "wx" },
);

process.stdout.write(
  [
    "CREATED",
    `roots=${inventory.counts.publicationRoots}`,
    `commits=${inventory.counts.reachableCommits}`,
    `trees=${inventory.counts.uniqueTrees}`,
    `blobs=${inventory.counts.uniqueBlobs}`,
    `observations=${inventory.counts.pathObservations}`,
    `transitions=${inventory.counts.pathTransitions}`,
    `historicalOnly=${inventory.counts.historicalOnlyBlobs}`,
    `correctiveOnly=${inventory.counts.correctiveOnlyBlobs}`,
    `artifacts=${historicalLedger.artifacts.length}`,
    `inventory=${inventory.inventoryHash}`,
    `ledger=${historicalLedger.ledgerHash}`,
    `closure=${supersedingClosure.recordHash}`,
  ].join(" ") + "\n",
);
