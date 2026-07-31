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
  PrincipalSigner,
  SchemaRegistry,
  canonicalize,
  createPublicationDeviationRecord,
  createPublicationRemediationClosure,
  createPublicExposureLedger,
  createPublishedArtifactInventory,
  parseStrictJson,
  sha256,
  sha256Bytes,
  sha256Text,
  type JsonValue,
  type PublicExposureArtifact,
  type PublicExposureArtifactClass,
  type PublishedArtifactInventoryEntry,
} from "../src/index.js";

const execFileAsync = promisify(execFile);
const SNAPSHOT_COMMIT =
  "a5d82564cece5ecb776a27c86512c3ec56f32787";
const SNAPSHOT_TREE =
  "1bbc1a7623460cf52907758e7ee93149e18a0aec";
const REPOSITORY = {
  url: "https://github.com/dsa04156/self-evolving-harness",
  owner: "dsa04156",
  remoteName: "origin",
  branch: "main",
} as const;
const GOVERNANCE_DOMAIN =
  "self-evolving-harness.publication-governance";
const INVENTORY_PATH =
  "governance/public-exposure/inventory-a5d8256.json";
const DEVIATION_PATH =
  "governance/publication-deviations/github-publication-2026-07-31.json";
const LEDGER_PATH =
  "governance/public-exposure/ledger-a5d8256.json";
const CLOSURE_PATH =
  "governance/publication-remediation-closures/github-publication-2026-07-31.json";
const RESPONSE_03RRR =
  ".codex/gpt-pro-architect/responses/response-3rrr.md";
const RESPONSE_03RRRR =
  ".codex/gpt-pro-architect/responses/response-3rrrr.md";
const EVIDENCE_PATH =
  "architect/evidence/development-process-boundary/os-boundary.json";
const IMPLEMENTATION_PATH =
  "src/governance/publication-exposure.ts";
const TEST_PATH = "test/publication-exposure.test.ts";
const VERIFIER_PATH =
  "scripts/verify-publication-governance.ts";

interface GitInventory {
  readonly entries: readonly PublishedArtifactInventoryEntry[];
  readonly bytesByObjectId: ReadonlyMap<string, Buffer>;
}

interface SecretScan {
  readonly scannedScopes: readonly string[];
  readonly patterns: readonly string[];
  readonly result: "no_actual_secret_match";
  readonly falsePositiveLiterals: readonly string[];
  readonly environmentFilesFound: 0;
  readonly privateKeysPublished: false;
}

interface MutableExposure {
  exposureId: string;
  artifactClass: PublicExposureArtifactClass;
  artifactId: string;
  sourceKind: "git_blob" | "embedded_record";
  path: string | null;
  gitBlobId: string | null;
  contentHash: string;
  aliases: Set<string>;
  dependencies: Set<string>;
  provenanceReferences: Set<string>;
}

function contentSha256(bytes: Uint8Array): string {
  return `sha256:${sha256Bytes(bytes)}`;
}

async function gitText(args: readonly string[]): Promise<string> {
  const result = await execFileAsync("git", [...args], {
    cwd: process.cwd(),
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
  return result.stdout;
}

async function gitBytes(
  args: readonly string[],
): Promise<Buffer> {
  const result = await execFileAsync("git", [...args], {
    cwd: process.cwd(),
    encoding: "buffer",
    maxBuffer: 64 * 1024 * 1024,
  });
  return result.stdout;
}

async function buildGitInventory(): Promise<GitInventory> {
  const actualTree = (
    await gitText([
      "show",
      "-s",
      "--format=%T",
      SNAPSHOT_COMMIT,
    ])
  ).trim();
  if (actualTree !== SNAPSHOT_TREE) {
    throw new Error(
      `Published snapshot tree drifted: ${actualTree}`,
    );
  }
  const listing = await gitText([
    "ls-tree",
    "-r",
    "-l",
    "-z",
    SNAPSHOT_COMMIT,
  ]);
  const parsed = listing
    .split("\0")
    .filter((entry) => entry.length > 0)
    .map((entry) => {
      const match =
        /^(100644|100755|120000) blob ([a-f0-9]{40})\s+([0-9]+)\t(.+)$/u.exec(
          entry,
        );
      if (match === null) {
        throw new Error(
          `Unsupported published Git tree entry: ${entry}`,
        );
      }
      return {
        mode: match[1]!,
        objectId: match[2]!,
        reportedSize: Number(match[3]!),
        path: match[4]!,
      };
    });
  const bytesByObjectId = new Map<string, Buffer>();
  for (const entry of parsed) {
    if (!bytesByObjectId.has(entry.objectId)) {
      bytesByObjectId.set(
        entry.objectId,
        await gitBytes(["cat-file", "blob", entry.objectId]),
      );
    }
  }
  const entries = parsed
    .map((entry): PublishedArtifactInventoryEntry => {
      const bytes = bytesByObjectId.get(entry.objectId)!;
      if (bytes.byteLength !== entry.reportedSize) {
        throw new Error(
          `Git size mismatch for ${entry.path}`,
        );
      }
      return {
        path: entry.path,
        mode: entry.mode,
        objectType: "blob",
        objectId: entry.objectId,
        sizeBytes: bytes.byteLength,
        contentSha256: contentSha256(bytes),
      };
    })
    .sort((left, right) =>
      left.path.localeCompare(right.path),
    );
  return { entries, bytesByObjectId };
}

function actualEnvironmentFile(filePath: string): boolean {
  const name = path.posix.basename(filePath);
  return (
    name === ".env" ||
    (/^\.env\./u.test(name) &&
      !/\.(?:example|sample|template|dist)$/u.test(name))
  );
}

function scanPublishedSnapshot(
  inventory: GitInventory,
): SecretScan {
  const knownFalsePositiveLiterals = [
    "sk-validation-mode-must-ignore-this",
  ] as const;
  const secretPatterns: readonly {
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
  for (const [objectId, bytes] of inventory.bytesByObjectId) {
    if (bytes.includes(0)) continue;
    let text = bytes.toString("utf8");
    for (const literal of knownFalsePositiveLiterals) {
      text = text.replaceAll(literal, "");
    }
    for (const candidate of secretPatterns) {
      if (candidate.pattern.test(text)) {
        matches.push(`${candidate.label}:${objectId}`);
      }
    }
  }
  const environmentFiles = inventory.entries.filter((entry) =>
    actualEnvironmentFile(entry.path),
  );
  if (matches.length > 0 || environmentFiles.length > 0) {
    throw new Error(
      `Published snapshot secret scan failed: ${[
        ...matches,
        ...environmentFiles.map(
          (entry) => `environment-file:${entry.path}`,
        ),
      ].join(", ")}`,
    );
  }
  return {
    scannedScopes: [
      `Git snapshot ${SNAPSHOT_COMMIT}`,
      `${inventory.entries.length} tracked files`,
      `${inventory.bytesByObjectId.size} unique Git blobs`,
    ],
    patterns: secretPatterns.map((entry) => entry.label),
    result: "no_actual_secret_match",
    falsePositiveLiterals: knownFalsePositiveLiterals,
    environmentFilesFound: 0,
    privateKeysPublished: false,
  };
}

function classifyGitPath(
  filePath: string,
): PublicExposureArtifactClass {
  if (
    filePath.startsWith("benchmarks/") ||
    filePath.includes("fixture")
  ) {
    return filePath.includes("corpus")
      ? "development_corpus"
      : "development_fixture";
  }
  if (
    filePath.startsWith("governance/") ||
    filePath.includes("quarantine") ||
    filePath.includes("non-promotable")
  ) {
    return "development_quarantine";
  }
  if (
    filePath.startsWith("architect/evidence/") ||
    filePath.includes("evaluation")
  ) {
    return "development_evaluation";
  }
  if (
    filePath.endsWith(".md") ||
    filePath.startsWith("docs/") ||
    filePath.startsWith("architect/")
  ) {
    return "development_documentation";
  }
  return "published_source";
}

function classifyEvidencePointer(
  pointer: string,
): PublicExposureArtifactClass {
  const normalized = pointer.toLowerCase();
  if (normalized.includes("prediction")) {
    return "development_prediction";
  }
  if (
    normalized.includes("score") ||
    normalized.includes("oracleaccess") ||
    normalized.includes("oraclejoin")
  ) {
    return normalized.includes("score")
      ? "development_score"
      : "development_oracle";
  }
  if (
    normalized.includes("receipt") ||
    normalized.includes("finalaudit")
  ) {
    return "development_receipt";
  }
  if (
    normalized.includes("taint") ||
    normalized.includes("nonpromotable") ||
    normalized.includes("quarantine")
  ) {
    return "development_quarantine";
  }
  if (normalized.includes("evaluation")) {
    return "development_evaluation";
  }
  if (
    normalized.includes("runtime") ||
    normalized.includes("execution")
  ) {
    return "development_execution";
  }
  if (
    normalized.includes("candidate") ||
    normalized.includes("proposal") ||
    normalized.includes("harnessversion")
  ) {
    return "development_candidate";
  }
  if (
    normalized.includes("corpus") ||
    normalized.includes("fixture")
  ) {
    return "development_corpus";
  }
  return "development_prototype";
}

function hashLike(value: string): boolean {
  return /^(?:sha256|hv-sha256|cm-sha256|ci-sha256|ctr-sha256|protocol-sha256|bundle-sha256|rss-sha256):[a-f0-9]{64}$/u.test(
    value,
  );
}

const ARTIFACT_CLASS_PRIORITY: Readonly<
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

function collectEvidenceIdentifiers(
  value: JsonValue,
  pointer: string,
  output: Map<
    string,
    {
      pointers: Set<string>;
      artifactClass: PublicExposureArtifactClass;
    }
  >,
): void {
  if (typeof value === "string") {
    if (!hashLike(value)) return;
    const artifactClass = classifyEvidencePointer(pointer);
    const current = output.get(value);
    if (current === undefined) {
      output.set(value, {
        pointers: new Set([pointer]),
        artifactClass,
      });
    } else {
      current.pointers.add(pointer);
      if (
        ARTIFACT_CLASS_PRIORITY[artifactClass] >
        ARTIFACT_CLASS_PRIORITY[current.artifactClass]
      ) {
        current.artifactClass = artifactClass;
      }
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      collectEvidenceIdentifiers(
        item,
        `${pointer}/${index}`,
        output,
      ),
    );
    return;
  }
  if (typeof value === "object" && value !== null) {
    for (const [key, item] of Object.entries(value)) {
      collectEvidenceIdentifiers(
        item,
        `${pointer}/${key.replaceAll("~", "~0").replaceAll("/", "~1")}`,
        output,
      );
    }
  }
}

function mergeExposure(
  byContentHash: Map<string, MutableExposure>,
  candidate: MutableExposure,
): void {
  const current = byContentHash.get(candidate.contentHash);
  if (current === undefined) {
    byContentHash.set(candidate.contentHash, candidate);
    return;
  }
  candidate.aliases.forEach((alias) =>
    current.aliases.add(alias),
  );
  candidate.dependencies.forEach((dependency) =>
    current.dependencies.add(dependency),
  );
  candidate.provenanceReferences.forEach((reference) =>
    current.provenanceReferences.add(reference),
  );
  current.aliases.add(candidate.exposureId);
  current.aliases.add(candidate.artifactId);
  if (candidate.path !== null) {
    current.aliases.add(candidate.path);
  }
  if (candidate.gitBlobId !== null) {
    current.aliases.add(candidate.gitBlobId);
  }
}

function buildExposureArtifacts(input: {
  readonly inventory: GitInventory;
  readonly evidence: JsonValue;
}): readonly Omit<
  PublicExposureArtifact,
  "eligibility"
>[] {
  const byContentHash = new Map<string, MutableExposure>();
  const byBlob = new Map<
    string,
    readonly PublishedArtifactInventoryEntry[]
  >();
  for (const entry of input.inventory.entries) {
    const prior = byBlob.get(entry.objectId) ?? [];
    byBlob.set(entry.objectId, [...prior, entry]);
  }
  for (const [objectId, entries] of byBlob) {
    const sorted = [...entries].sort((left, right) =>
      left.path.localeCompare(right.path),
    );
    const first = sorted[0]!;
    mergeExposure(byContentHash, {
      exposureId: `public.git-blob.${objectId}`,
      artifactClass: classifyGitPath(first.path),
      artifactId: `git-blob:${objectId}`,
      sourceKind: "git_blob",
      path: first.path,
      gitBlobId: objectId,
      contentHash: first.contentSha256,
      aliases: new Set(
        sorted.flatMap((entry) => [
          entry.path,
          `git-path:${entry.path}`,
        ]),
      ),
      dependencies: new Set(),
      provenanceReferences: new Set([
        `git:${SNAPSHOT_COMMIT}:${objectId}`,
      ]),
    });
  }

  const identifiers = new Map<
    string,
    {
      pointers: Set<string>;
      artifactClass: PublicExposureArtifactClass;
    }
  >();
  collectEvidenceIdentifiers(
    input.evidence,
    EVIDENCE_PATH,
    identifiers,
  );
  for (const [identifier, metadata] of identifiers) {
    const contentHash = identifier.startsWith("sha256:")
      ? identifier
      : sha256Text(identifier);
    mergeExposure(byContentHash, {
      exposureId: `public.embedded.${sha256Bytes(
        Buffer.from(identifier, "utf8"),
      )}`,
      artifactClass: metadata.artifactClass,
      artifactId: identifier,
      sourceKind: "embedded_record",
      path: null,
      gitBlobId: null,
      contentHash,
      aliases: new Set(metadata.pointers),
      dependencies: new Set(),
      provenanceReferences: new Set([
        EVIDENCE_PATH,
        `git:${SNAPSHOT_COMMIT}:${EVIDENCE_PATH}`,
      ]),
    });
  }

  const root =
    typeof input.evidence === "object" &&
    input.evidence !== null &&
    !Array.isArray(input.evidence)
      ? input.evidence
      : null;
  const publishedArtifacts =
    root !== null &&
    typeof root["artifacts"] === "object" &&
    root["artifacts"] !== null &&
    !Array.isArray(root["artifacts"])
      ? root["artifacts"]
      : null;
  const containerSpecs: readonly {
    readonly key: string;
    readonly artifactClass: PublicExposureArtifactClass;
  }[] = [
    {
      key: "prototypeManifest",
      artifactClass: "development_prototype",
    },
    {
      key: "labelBlindCorpus",
      artifactClass: "development_corpus",
    },
    {
      key: "predictionSet",
      artifactClass: "development_prediction",
    },
    {
      key: "predictionCommitment",
      artifactClass: "development_prediction",
    },
    {
      key: "predictionSeal",
      artifactClass: "development_prediction",
    },
    {
      key: "oracleAccessEvent",
      artifactClass: "development_oracle",
    },
    {
      key: "oracleJoin",
      artifactClass: "development_oracle",
    },
    {
      key: "scoreReport",
      artifactClass: "development_score",
    },
    {
      key: "mutationProposal",
      artifactClass: "development_candidate",
    },
    {
      key: "candidateClosure",
      artifactClass: "development_candidate",
    },
    {
      key: "runtimeExecution",
      artifactClass: "development_execution",
    },
    {
      key: "candidateEvaluation",
      artifactClass: "development_evaluation",
    },
    {
      key: "nonPromotableRecord",
      artifactClass: "development_quarantine",
    },
    {
      key: "taintRecord",
      artifactClass: "development_quarantine",
    },
    {
      key: "finalReceipt",
      artifactClass: "development_receipt",
    },
  ];
  if (publishedArtifacts !== null) {
    for (const spec of containerSpecs) {
      const value = publishedArtifacts[spec.key];
      if (value === undefined) continue;
      const pointer = `${EVIDENCE_PATH}/artifacts/${spec.key}`;
      const contentHash = sha256(value);
      mergeExposure(byContentHash, {
        exposureId: `public.embedded-container.${spec.key}`,
        artifactClass: spec.artifactClass,
        artifactId: `embedded-container:${spec.key}`,
        sourceKind: "embedded_record",
        path: null,
        gitBlobId: null,
        contentHash,
        aliases: new Set([pointer]),
        dependencies: new Set(),
        provenanceReferences: new Set([
          EVIDENCE_PATH,
          `git:${SNAPSHOT_COMMIT}:${EVIDENCE_PATH}`,
        ]),
      });
    }
    const roleReceipts = publishedArtifacts["roleReceipts"];
    if (Array.isArray(roleReceipts)) {
      roleReceipts.forEach((value, index) => {
        const contentHash = sha256(value);
        mergeExposure(byContentHash, {
          exposureId: `public.embedded-container.role-receipt-${index}`,
          artifactClass: "development_receipt",
          artifactId: `embedded-container:role-receipt-${index}`,
          sourceKind: "embedded_record",
          path: null,
          gitBlobId: null,
          contentHash,
          aliases: new Set([
            `${EVIDENCE_PATH}/artifacts/roleReceipts/${index}`,
          ]),
          dependencies: new Set(),
          provenanceReferences: new Set([
            EVIDENCE_PATH,
            `git:${SNAPSHOT_COMMIT}:${EVIDENCE_PATH}`,
          ]),
        });
      });
    }
  }
  return [...byContentHash.values()]
    .map((entry) => ({
      exposureId: entry.exposureId,
      artifactClass: entry.artifactClass,
      artifactId: entry.artifactId,
      sourceKind: entry.sourceKind,
      path: entry.path,
      gitBlobId: entry.gitBlobId,
      contentHash: entry.contentHash,
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
      `Refusing to overwrite governance record: ${filePath}`,
    );
  }
}

const schemas = await SchemaRegistry.load(
  path.resolve("schemas"),
);
const gitInventory = await buildGitInventory();
const inventory = createPublishedArtifactInventory({
  inventoryId: "published-inventory.origin-main.a5d8256",
  repository: REPOSITORY,
  snapshotCommit: SNAPSHOT_COMMIT,
  snapshotTree: SNAPSHOT_TREE,
  entries: gitInventory.entries,
  createdAt: "2026-07-31T16:00:00+09:00",
  schemas,
});
const secretScan = scanPublishedSnapshot(gitInventory);
const author = PrincipalSigner.generate({
  principalId:
    "protocol.author.publication-governance.2026-07-31",
  role: "protocol_author",
  implementationDigest: await fileSha256(
    IMPLEMENTATION_PATH,
  ),
  instanceId:
    "protocol.author.publication-governance.2026-07-31.instance",
  keyId:
    "protocol.author.publication-governance.2026-07-31.ed25519",
});
const instruction =
  "https://github.com/dsa04156/self-evolving-harness 이거ㅣ 새로만들었는데 업데이트 중간중간 하면서 진행해";
const deviation = createPublicationDeviationRecord({
  value: {
    deviationId:
      "publication-deviation.github-development.2026-07-31",
    governanceDomainId: GOVERNANCE_DOMAIN,
    priorDecision: {
      round: "03RRR",
      decision: "APPROVE",
      responsePath: RESPONSE_03RRR,
      responseSha256: await fileSha256(RESPONSE_03RRR),
    },
    dispositionDecision: {
      round: "03RRRR",
      decision: "REVISE",
      responsePath: RESPONSE_03RRRR,
      responseSha256: await fileSha256(RESPONSE_03RRRR),
    },
    userAuthorization: {
      instructionText: instruction,
      instructionSha256: sha256Text(instruction),
      source: "conversation_user_message",
      timestampAvailability: "not_recorded",
    },
    repository: REPOSITORY,
    publishedRefs: [
      {
        refName: "refs/heads/main",
        commit:
          "c041f7405790e9ff85af621b468b547adbfa4987",
        tree: "2911cf9e6d51561dab6541a98a0697d8015a3cc8",
        publishedAt: "2026-07-31T15:16:46+09:00",
        observationSource:
          "local_remote_tracking_reflog",
      },
      {
        refName: "refs/heads/main",
        commit:
          "88e39cdebf1df4db7688fff592363f5f867533ce",
        tree: "ccb20381cc3308cb71954789614144575870eb83",
        publishedAt: "2026-07-31T15:22:04+09:00",
        observationSource:
          "local_remote_tracking_reflog",
      },
      {
        refName: "refs/heads/main",
        commit: SNAPSHOT_COMMIT,
        tree: SNAPSHOT_TREE,
        publishedAt: "2026-07-31T15:31:50+09:00",
        observationSource:
          "local_remote_tracking_reflog",
      },
    ],
    implementationSource: {
      commit:
        "88e39cdebf1df4db7688fff592363f5f867533ce",
      tree: "ccb20381cc3308cb71954789614144575870eb83",
    },
    evidenceCheckpoint: {
      commit: SNAPSHOT_COMMIT,
      tree: SNAPSHOT_TREE,
    },
    inventory: {
      inventoryId: inventory.inventoryId,
      inventoryHash: inventory.inventoryHash,
      snapshotCommit: inventory.snapshotCommit,
      snapshotTree: inventory.snapshotTree,
      entryCount: inventory.entryCount,
      path: INVENTORY_PATH,
    },
    secretScan,
    exceededAuthorization:
      "The user explicitly instructed periodic pushes to the new GitHub repository, but the Round 03RRR Architect authorization prohibited repository push/publication. The three origin/main updates therefore exceeded the narrower Architect authorization and permanently exposed the development artifacts.",
    accompanyingActions: {
      providerCall: false,
      researchExecution: false,
      gateOrFinalAccess: false,
      promotion: false,
      deployment: false,
      credentialPublication: false,
    },
    permanentConsequence: {
      publicExposureIrreversible: true,
      historyRewriteDoesNotRestoreSecrecy: true,
      repositoryDeletionDoesNotRestoreSecrecy: true,
      publishedArtifactsRequireExposureLedger: true,
    },
    remediation: {
      status: "in_progress",
      requiredActions: [
        "Bind every published Git blob and embedded development identifier into a signed public-exposure ledger.",
        "Deny direct and transitive use in held-out, sealed, temporal holdout, gate, final, confirmatory, research-selection, promotion, research-evidence, and claim-table lifecycles.",
        "Preserve the deviation record and append a separately signed remediation closure.",
        "Verify the complete snapshot, secret scan, signatures, hashes, and anti-laundering policy from a clean corrective commit.",
      ],
    },
    recordedAt: "2026-07-31T16:01:00+09:00",
  },
  inventory,
  signer: author,
  schemas,
});

const evidenceEntry = inventory.entries.find(
  (entry) => entry.path === EVIDENCE_PATH,
);
if (evidenceEntry === undefined) {
  throw new Error(
    "Published snapshot does not contain process-boundary evidence",
  );
}
const evidenceBytes = gitInventory.bytesByObjectId.get(
  evidenceEntry.objectId,
)!;
const evidence = parseStrictJson(
  evidenceBytes.toString("utf8"),
);
const exposureArtifacts = buildExposureArtifacts({
  inventory: gitInventory,
  evidence,
});
const ledger = createPublicExposureLedger({
  ledgerId: "public-exposure.origin-main.a5d8256",
  governanceDomainId: GOVERNANCE_DOMAIN,
  deviation,
  inventory,
  artifacts: exposureArtifacts,
  createdAt: "2026-07-31T16:02:00+09:00",
  signer: author,
  schemas,
});
const closure = createPublicationRemediationClosure({
  value: {
    closureId:
      "publication-remediation.github-development.2026-07-31",
    governanceDomainId: GOVERNANCE_DOMAIN,
    deviationId: deviation.deviationId,
    deviationRecordHash: deviation.recordHash,
    correctiveDecision: {
      round: "03RRRR",
      decision: "REVISE",
      responsePath: RESPONSE_03RRRR,
      responseSha256: await fileSha256(RESPONSE_03RRRR),
    },
    inventoryHash: inventory.inventoryHash,
    publicExposureLedgerId: ledger.ledgerId,
    publicExposureLedgerHash: ledger.ledgerHash,
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
      originalDeviationWasModified: false,
      originalStatusObserved: "in_progress",
      closureStatus: "closed_by_append_only_record",
      completedActions: [
        "Recorded the exact repository, owner, branch, remote, commits, trees, push observations, user instruction, and Architect decisions.",
        `Inventoried ${inventory.entryCount} paths in the published snapshot and grouped them into ${exposureArtifacts.length} permanent exposure entries.`,
        "Recorded all hash-like identifiers embedded in the published development process-boundary evidence.",
        "Enforced direct, copy, alias, content, dependency, wrapper, and provenance propagation.",
        "Made protocol reset, history rewrite, and repository deletion incapable of restoring eligibility.",
        "Added negative tests for gate/final reuse, split relabeling, copied candidates, transitive laundering, reset claims, and diagnostic claim laundering.",
      ],
      outstandingActions: [],
    },
    claimBoundary: {
      publicationGovernanceClosed: true,
      publicDevelopmentArtifactsPermanent: true,
      heldOutEligibilityRestored: false,
      researchEvidenceAuthorized: false,
      promotionAuthorized: false,
      providerUsed: false,
      selfImprovementClaim: false,
    },
    closedAt: "2026-07-31T16:03:00+09:00",
  },
  deviation,
  ledger,
  inventory,
  signer: author,
  schemas,
});

const outputPaths = [
  INVENTORY_PATH,
  DEVIATION_PATH,
  LEDGER_PATH,
  CLOSURE_PATH,
] as const;
await ensureAbsent(outputPaths);
for (const outputPath of outputPaths) {
  await mkdir(path.dirname(outputPath), { recursive: true });
}
await writeFile(
  INVENTORY_PATH,
  `${canonicalize(inventory as unknown as JsonValue)}\n`,
  { encoding: "utf8", flag: "wx" },
);
await writeFile(
  DEVIATION_PATH,
  `${canonicalize(deviation as unknown as JsonValue)}\n`,
  { encoding: "utf8", flag: "wx" },
);
await writeFile(
  LEDGER_PATH,
  `${canonicalize(ledger as unknown as JsonValue)}\n`,
  { encoding: "utf8", flag: "wx" },
);
await writeFile(
  CLOSURE_PATH,
  `${canonicalize(closure as unknown as JsonValue)}\n`,
  { encoding: "utf8", flag: "wx" },
);

process.stdout.write(
  [
    "CREATED",
    `snapshot=${SNAPSHOT_COMMIT}`,
    `paths=${inventory.entryCount}`,
    `uniqueBlobs=${gitInventory.bytesByObjectId.size}`,
    `exposures=${ledger.artifacts.length}`,
    `inventory=${inventory.inventoryHash}`,
    `deviation=${deviation.recordHash}`,
    `ledger=${ledger.ledgerHash}`,
    `closure=${closure.recordHash}`,
  ].join(" ") + "\n",
);
