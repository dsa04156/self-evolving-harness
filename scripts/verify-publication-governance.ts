import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import {
  PUBLIC_EXPOSURE_ALLOWED_USES,
  PUBLIC_EXPOSURE_ARTIFACT_CLASSES,
  PUBLIC_EXPOSURE_RESTRICTED_USES,
  HarnessError,
  PublicExposurePolicy,
  SchemaRegistry,
  canonicalize,
  createPublishedArtifactInventory,
  parseStrictJson,
  sha256Bytes,
  sha256Text,
  verifyPublicationDeviationRecord,
  verifyPublicationRemediationClosure,
  verifyPublicExposureLedger,
  verifyPublishedArtifactInventory,
  type JsonValue,
  type PublicationDeviationRecord,
  type PublicationRemediationClosureRecord,
  type PublicExposureLedger,
  type PublishedArtifactInventory,
  type PublishedArtifactInventoryEntry,
} from "../src/index.js";

const execFileAsync = promisify(execFile);
const SNAPSHOT_COMMIT =
  "a5d82564cece5ecb776a27c86512c3ec56f32787";
const SNAPSHOT_TREE =
  "1bbc1a7623460cf52907758e7ee93149e18a0aec";
const INVENTORY_PATH =
  "governance/public-exposure/inventory-a5d8256.json";
const DEVIATION_PATH =
  "governance/publication-deviations/github-publication-2026-07-31.json";
const LEDGER_PATH =
  "governance/public-exposure/ledger-a5d8256.json";
const CLOSURE_PATH =
  "governance/publication-remediation-closures/github-publication-2026-07-31.json";
const EVIDENCE_PATH =
  "architect/evidence/development-process-boundary/os-boundary.json";
const EXPECTED_PRIOR_RESPONSE =
  "sha256:ac0637a0c8a17ff77c9db732ed4b2632acc825526f7b632c8ff57d89074370e3";
const EXPECTED_CORRECTIVE_RESPONSE =
  "sha256:deab2175380d472a8581ab4baed07af8518fde3ffa0a90a6457bb03a234db9cf";

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

async function historicalInventory(): Promise<{
  readonly entries: readonly PublishedArtifactInventoryEntry[];
  readonly bytesByObjectId: ReadonlyMap<string, Buffer>;
}> {
  const tree = (
    await gitText([
      "show",
      "-s",
      "--format=%T",
      SNAPSHOT_COMMIT,
    ])
  ).trim();
  if (tree !== SNAPSHOT_TREE) {
    throw new Error("Published source commit/tree binding failed");
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
          `Unsupported published tree entry: ${entry}`,
        );
      }
      return {
        mode: match[1]!,
        objectId: match[2]!,
        sizeBytes: Number(match[3]!),
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
      if (bytes.byteLength !== entry.sizeBytes) {
        throw new Error(`Git size mismatch: ${entry.path}`);
      }
      return {
        path: entry.path,
        mode: entry.mode,
        objectType: "blob",
        objectId: entry.objectId,
        sizeBytes: entry.sizeBytes,
        contentSha256: contentSha256(bytes),
      };
    })
    .sort((left, right) =>
      left.path.localeCompare(right.path),
    );
  return { entries, bytesByObjectId };
}

async function readJson<T>(filePath: string): Promise<T> {
  return parseStrictJson(
    await readFile(filePath, "utf8"),
  ) as unknown as T;
}

async function fileSha256(filePath: string): Promise<string> {
  return contentSha256(await readFile(filePath));
}

function collectHashLike(
  value: JsonValue,
  output: Set<string>,
): void {
  if (typeof value === "string") {
    if (
      /^(?:sha256|hv-sha256|cm-sha256|ci-sha256|ctr-sha256|protocol-sha256|bundle-sha256|rss-sha256):[a-f0-9]{64}$/u.test(
        value,
      )
    ) {
      output.add(value);
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectHashLike(item, output));
    return;
  }
  if (typeof value === "object" && value !== null) {
    Object.values(value).forEach((item) =>
      collectHashLike(item, output),
    );
  }
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
    throw new Error(`Public-exposure policy allowed ${label}`);
  }
}

const schemas = await SchemaRegistry.load(
  path.resolve("schemas"),
);
const inventory =
  await readJson<PublishedArtifactInventory>(INVENTORY_PATH);
const deviation =
  await readJson<PublicationDeviationRecord>(DEVIATION_PATH);
const ledger =
  await readJson<PublicExposureLedger>(LEDGER_PATH);
const closure =
  await readJson<PublicationRemediationClosureRecord>(
    CLOSURE_PATH,
  );
verifyPublishedArtifactInventory({ inventory, schemas });
verifyPublicationDeviationRecord({
  record: deviation,
  inventory,
  schemas,
});
verifyPublicExposureLedger({
  record: ledger,
  deviation,
  inventory,
  schemas,
});
verifyPublicationRemediationClosure({
  record: closure,
  deviation,
  ledger,
  inventory,
  schemas,
});

const historical = await historicalInventory();
const reconstructed = createPublishedArtifactInventory({
  inventoryId: inventory.inventoryId,
  repository: inventory.repository,
  snapshotCommit: SNAPSHOT_COMMIT,
  snapshotTree: SNAPSHOT_TREE,
  entries: historical.entries,
  createdAt: inventory.createdAt,
  schemas,
});
if (
  canonicalize(reconstructed as unknown as JsonValue) !==
  canonicalize(inventory as unknown as JsonValue)
) {
  throw new Error(
    "Published inventory cannot be reconstructed from Git",
  );
}

if (
  deviation.priorDecision.responseSha256 !==
    EXPECTED_PRIOR_RESPONSE ||
  deviation.dispositionDecision.responseSha256 !==
    EXPECTED_CORRECTIVE_RESPONSE ||
  (await fileSha256(deviation.priorDecision.responsePath)) !==
    EXPECTED_PRIOR_RESPONSE ||
  (await fileSha256(
    deviation.dispositionDecision.responsePath,
  )) !== EXPECTED_CORRECTIVE_RESPONSE
) {
  throw new Error("Architect decision binding drifted");
}
const instruction =
  "https://github.com/dsa04156/self-evolving-harness 이거ㅣ 새로만들었는데 업데이트 중간중간 하면서 진행해";
if (
  deviation.userAuthorization.instructionText !==
    instruction ||
  deviation.userAuthorization.instructionSha256 !==
    sha256Text(instruction)
) {
  throw new Error("User publication instruction drifted");
}

const expectedPushes = [
  [
    "c041f7405790e9ff85af621b468b547adbfa4987",
    "2911cf9e6d51561dab6541a98a0697d8015a3cc8",
    "2026-07-31T15:16:46+09:00",
  ],
  [
    "88e39cdebf1df4db7688fff592363f5f867533ce",
    "ccb20381cc3308cb71954789614144575870eb83",
    "2026-07-31T15:22:04+09:00",
  ],
  [
    SNAPSHOT_COMMIT,
    SNAPSHOT_TREE,
    "2026-07-31T15:31:50+09:00",
  ],
] as const;
if (
  deviation.publishedRefs.length !== expectedPushes.length ||
  expectedPushes.some((expected, index) => {
    const actual = deviation.publishedRefs[index];
    return (
      actual === undefined ||
      actual.commit !== expected[0] ||
      actual.tree !== expected[1] ||
      actual.publishedAt !== expected[2]
    );
  })
) {
  throw new Error("Published ref ledger drifted");
}

const environmentFiles = historical.entries.filter((entry) => {
  const name = path.posix.basename(entry.path);
  return (
    name === ".env" ||
    (/^\.env\./u.test(name) &&
      !/\.(?:example|sample|template|dist)$/u.test(name))
  );
});
const secretPatterns = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/u,
  /\bsk-[A-Za-z0-9_-]{32,}\b/u,
  /\b(?:ghp|gho|ghu|ghs|github_pat)_[A-Za-z0-9_]{30,}\b/u,
  /\bAKIA[A-Z0-9]{16}\b/u,
] as const;
const secretMatches: string[] = [];
const knownFalsePositiveLiterals = [
  "sk-validation-mode-must-ignore-this",
] as const;
for (const [objectId, bytes] of historical.bytesByObjectId) {
  if (bytes.includes(0)) continue;
  let text = bytes.toString("utf8");
  for (const literal of knownFalsePositiveLiterals) {
    text = text.replaceAll(literal, "");
  }
  if (secretPatterns.some((pattern) => pattern.test(text))) {
    secretMatches.push(objectId);
  }
}
if (
  environmentFiles.length !== 0 ||
  secretMatches.length !== 0 ||
  deviation.secretScan.environmentFilesFound !== 0 ||
  deviation.secretScan.privateKeysPublished !== false ||
  deviation.secretScan.result !== "no_actual_secret_match" ||
  canonicalize(
    deviation.secretScan
      .falsePositiveLiterals as unknown as JsonValue,
  ) !==
    canonicalize(
      knownFalsePositiveLiterals as unknown as JsonValue,
    )
) {
  throw new Error("Published snapshot secret scan failed");
}

const ledgerTokens = new Set<string>();
for (const artifact of ledger.artifacts) {
  [
    artifact.exposureId,
    artifact.artifactId,
    artifact.path,
    artifact.gitBlobId,
    artifact.contentHash,
    ...artifact.aliases,
  ].forEach((token) => {
    if (token !== null) ledgerTokens.add(token);
  });
}
for (const entry of inventory.entries) {
  for (const token of [
    entry.path,
    entry.objectId,
    entry.contentSha256,
  ]) {
    if (!ledgerTokens.has(token)) {
      throw new Error(
        `Published Git artifact missing from exposure ledger: ${token}`,
      );
    }
  }
}
const evidenceEntry = inventory.entries.find(
  (entry) => entry.path === EVIDENCE_PATH,
);
if (evidenceEntry === undefined) {
  throw new Error("Process-boundary evidence was not inventoried");
}
const evidenceBytes = historical.bytesByObjectId.get(
  evidenceEntry.objectId,
)!;
const evidence = parseStrictJson(
  evidenceBytes.toString("utf8"),
);
const embeddedIdentifiers = new Set<string>();
collectHashLike(evidence, embeddedIdentifiers);
for (const identifier of embeddedIdentifiers) {
  if (!ledgerTokens.has(identifier)) {
    throw new Error(
      `Embedded public artifact missing from exposure ledger: ${identifier}`,
    );
  }
}
const representedClasses = new Set(
  ledger.artifacts.map((artifact) => artifact.artifactClass),
);
for (const artifactClass of PUBLIC_EXPOSURE_ARTIFACT_CLASSES) {
  if (!representedClasses.has(artifactClass)) {
    throw new Error(
      `Exposure ledger does not represent ${artifactClass}`,
    );
  }
}

for (const [evidencePath, evidenceHash] of [
  [
    closure.validatorEvidence.implementationPath,
    closure.validatorEvidence.implementationSha256,
  ],
  [
    closure.validatorEvidence.testPath,
    closure.validatorEvidence.testSha256,
  ],
  [
    closure.validatorEvidence.verifierPath,
    closure.validatorEvidence.verifierSha256,
  ],
] as const) {
  if ((await fileSha256(evidencePath)) !== evidenceHash) {
    throw new Error(
      `Closure validator evidence drifted: ${evidencePath}`,
    );
  }
}

const policy = new PublicExposurePolicy({
  ledgers: [ledger],
  deviations: [deviation],
  inventory,
  schemas,
});
const fixtureArtifact =
  ledger.artifacts.find(
    (artifact) =>
      artifact.artifactClass === "development_fixture",
  ) ?? ledger.artifacts[0]!;
const corpusArtifact =
  ledger.artifacts.find(
    (artifact) =>
      artifact.artifactClass === "development_corpus",
  ) ?? fixtureArtifact;
const candidateArtifact =
  ledger.artifacts.find(
    (artifact) =>
      artifact.artifactClass === "development_candidate",
  ) ?? fixtureArtifact;

for (const useClass of PUBLIC_EXPOSURE_RESTRICTED_USES) {
  denied(
    () =>
      policy.assertPayloadAllowed({
        useClass,
        payload: { artifact: fixtureArtifact.artifactId },
      }),
    `direct ${useClass} use`,
  );
}
for (const useClass of PUBLIC_EXPOSURE_ALLOWED_USES) {
  const admission = policy.assertPayloadAllowed({
    useClass,
    payload: { artifact: fixtureArtifact.contentHash },
  });
  if (admission === null) {
    throw new Error(
      `Expected ${useClass} governance admission`,
    );
  }
}
for (const useClass of ["gate", "final"] as const) {
  denied(
    () =>
      policy.assertGraphAllowed({
        useClass,
        rootReferences: ["sealed.relabelled.corpus"],
        nodes: [
          {
            nodeId: "sealed.relabelled.corpus",
            contentHash: corpusArtifact.contentHash,
            gitBlobId: null,
            path: "sealed/new-split-id.json",
            aliases: [],
            dependencies: [],
            wrappers: [],
            provenanceReferences: [],
          },
        ],
      }),
    `relabeled corpus in ${useClass}`,
  );
}
denied(
  () =>
    policy.assertGraphAllowed({
      useClass: "research_selection",
      rootReferences: ["candidate.copied"],
      nodes: [
        {
          nodeId: "candidate.copied",
          contentHash: candidateArtifact.contentHash,
          gitBlobId: null,
          path: "candidate/copied.json",
          aliases: [],
          dependencies: [],
          wrappers: [],
          provenanceReferences: [],
        },
      ],
    }),
  "copied candidate",
);
for (const relation of [
  "dependencies",
  "wrappers",
  "provenanceReferences",
] as const) {
  denied(
    () =>
      policy.assertGraphAllowed({
        useClass: "research_evidence",
        rootReferences: [`fresh.${relation}`],
        nodes: [
          {
            nodeId: `fresh.${relation}`,
            contentHash: sha256Text(`fresh.${relation}`),
            gitBlobId: null,
            path: null,
            aliases: [],
            dependencies:
              relation === "dependencies"
                ? [fixtureArtifact.artifactId]
                : [],
            wrappers:
              relation === "wrappers"
                ? [fixtureArtifact.artifactId]
                : [],
            provenanceReferences:
              relation === "provenanceReferences"
                ? [fixtureArtifact.artifactId]
                : [],
          },
        ],
      }),
    `indirect ${relation}`,
  );
}
for (const resetClaims of [
  { newProtocolClearsExposure: true },
  { historyRewriteRestoresSecrecy: true },
  { repositoryDeletionRestoresSecrecy: true },
]) {
  denied(
    () =>
      policy.assertPayloadAllowed({
        useClass: "governance_audit",
        payload: { artifact: "new-clean-artifact" },
        protocolId: "protocol-v2",
        resetClaims,
      }),
    "exposure reset claim",
  );
}
denied(
  () =>
    policy.assertPayloadAllowed({
      useClass: "claim_table",
      payload: {
        artifact: fixtureArtifact.artifactId,
        claim: "independent evaluation",
      },
    }),
  "diagnostic independent-evaluation claim",
);

for (const requiredDocument of [
  "README.md",
  "ARCHITECTURE.md",
  "SECURITY.md",
  "REPRODUCIBILITY.md",
  "LIMITATIONS.md",
  "NEGATIVE_RESULTS.md",
]) {
  const text = await readFile(requiredDocument, "utf8");
  if (
    !text.includes("publicDevelopment") ||
    !text.includes("authorizedForResearchEvidence=false")
  ) {
    throw new Error(
      `${requiredDocument} omits the permanent public-development boundary`,
    );
  }
}

process.stdout.write(
  [
    "PASS",
    `snapshot=${SNAPSHOT_COMMIT}`,
    `paths=${inventory.entryCount}`,
    `exposures=${ledger.artifacts.length}`,
    `embedded=${embeddedIdentifiers.size}`,
    `classes=${representedClasses.size}`,
    `restricted=${PUBLIC_EXPOSURE_RESTRICTED_USES.length}`,
    `inventory=${inventory.inventoryHash}`,
    `deviation=${deviation.recordHash}`,
    `ledger=${ledger.ledgerHash}`,
    `closure=${closure.recordHash}`,
  ].join(" ") + "\n",
);
