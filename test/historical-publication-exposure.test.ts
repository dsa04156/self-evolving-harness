import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  HISTORICAL_PUBLICATION_ROOTS,
  HarnessError,
  HistoricalPublicExposurePolicy,
  PrincipalSigner,
  PublicationSupersedingClosureLog,
  SchemaRegistry,
  createHistoricalPublicExposureLedger,
  createHistoricalPublicObjectInventory,
  createPublicationSupersedingClosure,
  parseStrictJson,
  sha256Text,
  verifyHistoricalPublicExposureLedger,
  verifyHistoricalPublicObjectInventory,
  verifyPublicationSupersedingClosure,
  type HistoricalBlobObject,
  type HistoricalCommitObject,
  type HistoricalPathObservation,
  type HistoricalPathTransition,
  type HistoricalPublicExposureArtifact,
  type HistoricalPublicExposureLedger,
  type HistoricalPublicObjectInventory,
  type HistoricalTreeObject,
  type PublicationDeviationRecord,
  type PublicationRemediationClosureRecord,
  type PublicExposureLedger,
  type PublishedArtifactInventory,
} from "../src/index.js";

const PRIOR_INVENTORY_PATH =
  "governance/public-exposure/inventory-a5d8256.json";
const PRIOR_LEDGER_PATH =
  "governance/public-exposure/ledger-a5d8256.json";
const DEVIATION_PATH =
  "governance/publication-deviations/github-publication-2026-07-31.json";
const PRIOR_CLOSURE_PATH =
  "governance/publication-remediation-closures/github-publication-2026-07-31.json";

function gitId(label: string): string {
  return createHash("sha1").update(label).digest("hex");
}

async function readJson<T>(filePath: string): Promise<T> {
  return parseStrictJson(
    await readFile(filePath, "utf8"),
  ) as unknown as T;
}

interface Fixture {
  readonly schemas: SchemaRegistry;
  readonly author: PrincipalSigner;
  readonly priorInventory: PublishedArtifactInventory;
  readonly priorLedger: PublicExposureLedger;
  readonly deviation: PublicationDeviationRecord;
  readonly priorClosure:
    PublicationRemediationClosureRecord;
  readonly inventory: HistoricalPublicObjectInventory;
  readonly ledger: HistoricalPublicExposureLedger;
  readonly closure: ReturnType<
    typeof createPublicationSupersedingClosure
  >;
  readonly policy: HistoricalPublicExposurePolicy;
  readonly legacyBlobId: string;
  readonly correctiveBlobId: string;
}

function exposure(
  firstOrdinal: 0 | 1 | 2 | 3,
): {
  readonly firstRootOrdinal: 0 | 1 | 2 | 3;
  readonly firstPublishedAt: string;
  readonly rootCommits: readonly string[];
} {
  return {
    firstRootOrdinal: firstOrdinal,
    firstPublishedAt:
      HISTORICAL_PUBLICATION_ROOTS[firstOrdinal]!
        .publishedAt,
    rootCommits: HISTORICAL_PUBLICATION_ROOTS.slice(
      firstOrdinal,
    ).map((root) => root.commit),
  };
}

async function fixture(): Promise<Fixture> {
  const schemas = await SchemaRegistry.load(
    path.resolve("schemas"),
  );
  const [
    priorInventory,
    priorLedger,
    deviation,
    priorClosure,
  ] = await Promise.all([
    readJson<PublishedArtifactInventory>(
      PRIOR_INVENTORY_PATH,
    ),
    readJson<PublicExposureLedger>(PRIOR_LEDGER_PATH),
    readJson<PublicationDeviationRecord>(DEVIATION_PATH),
    readJson<PublicationRemediationClosureRecord>(
      PRIOR_CLOSURE_PATH,
    ),
  ]);
  const commits: HistoricalCommitObject[] =
    HISTORICAL_PUBLICATION_ROOTS.map(
      (root, index) => ({
        commitId: root.commit,
        treeId: root.tree,
        parentIds:
          index === 0
            ? []
            : [
                HISTORICAL_PUBLICATION_ROOTS[index - 1]!
                  .commit,
              ],
        sizeBytes: 100 + index,
        contentSha256: sha256Text(
          `commit:${root.commit}`,
        ),
        exposure: exposure(index as 0 | 1 | 2 | 3),
      }),
    );
  const trees: HistoricalTreeObject[] =
    HISTORICAL_PUBLICATION_ROOTS.map(
      (root, index) => ({
        treeId: root.tree,
        sizeBytes: 200 + index,
        contentSha256: sha256Text(`tree:${root.tree}`),
        exposure: exposure(index as 0 | 1 | 2 | 3),
      }),
    );
  const legacyBlobId = gitId("legacy-only");
  const correctiveBlobId = gitId("corrective-only");
  const a5BlobIds = Array.from(
    { length: 501 },
    (_, index) => gitId(`a5-blob-${index}`),
  );
  const a5Observations: HistoricalPathObservation[] =
    Array.from({ length: 510 }, (_, index) => ({
      commitId: HISTORICAL_PUBLICATION_ROOTS[2]!.commit,
      rootTreeId: HISTORICAL_PUBLICATION_ROOTS[2]!.tree,
      path: `snapshot/file-${index.toString().padStart(3, "0")}.txt`,
      mode: "100644",
      blobId: a5BlobIds[index % a5BlobIds.length]!,
    }));
  const correctiveObservations: HistoricalPathObservation[] =
    [
      ...a5Observations.map((entry) => ({
        ...entry,
        commitId:
          HISTORICAL_PUBLICATION_ROOTS[3]!.commit,
        rootTreeId:
          HISTORICAL_PUBLICATION_ROOTS[3]!.tree,
      })),
      {
        commitId:
          HISTORICAL_PUBLICATION_ROOTS[3]!.commit,
        rootTreeId:
          HISTORICAL_PUBLICATION_ROOTS[3]!.tree,
        path: "src/corrective-only.ts",
        mode: "100644",
        blobId: correctiveBlobId,
      },
    ];
  const pathObservations: HistoricalPathObservation[] = [
    {
      commitId: HISTORICAL_PUBLICATION_ROOTS[0]!.commit,
      rootTreeId: HISTORICAL_PUBLICATION_ROOTS[0]!.tree,
      path: "legacy/deleted-only.txt",
      mode: "100644",
      blobId: legacyBlobId,
    },
    ...a5Observations,
    ...correctiveObservations,
  ];
  const transitions: HistoricalPathTransition[] = [
    {
      commitId: HISTORICAL_PUBLICATION_ROOTS[0]!.commit,
      parentCommitId: null,
      path: "legacy/deleted-only.txt",
      state: "added",
      beforeBlobId: null,
      afterBlobId: legacyBlobId,
      beforeMode: null,
      afterMode: "100644",
    },
    {
      commitId: HISTORICAL_PUBLICATION_ROOTS[1]!.commit,
      parentCommitId:
        HISTORICAL_PUBLICATION_ROOTS[0]!.commit,
      path: "legacy/deleted-only.txt",
      state: "deleted",
      beforeBlobId: legacyBlobId,
      afterBlobId: null,
      beforeMode: "100644",
      afterMode: null,
    },
    ...a5Observations.map(
      (entry): HistoricalPathTransition => ({
        commitId:
          HISTORICAL_PUBLICATION_ROOTS[2]!.commit,
        parentCommitId:
          HISTORICAL_PUBLICATION_ROOTS[1]!.commit,
        path: entry.path,
        state: "added",
        beforeBlobId: null,
        afterBlobId: entry.blobId,
        beforeMode: null,
        afterMode: entry.mode,
      }),
    ),
    {
      commitId: HISTORICAL_PUBLICATION_ROOTS[3]!.commit,
      parentCommitId:
        HISTORICAL_PUBLICATION_ROOTS[2]!.commit,
      path: "src/corrective-only.ts",
      state: "added",
      beforeBlobId: null,
      afterBlobId: correctiveBlobId,
      beforeMode: null,
      afterMode: "100644",
    },
  ];
  const pathsByBlob = new Map<string, Set<string>>();
  for (const observation of pathObservations) {
    const paths =
      pathsByBlob.get(observation.blobId) ??
      new Set<string>();
    paths.add(observation.path);
    pathsByBlob.set(observation.blobId, paths);
  }
  const blobs: HistoricalBlobObject[] = [
    {
      blobId: legacyBlobId,
      sizeBytes: 10,
      contentSha256: sha256Text("legacy-only"),
      paths: ["legacy/deleted-only.txt"],
      presentInA5Snapshot: false,
      presentInCorrectiveSnapshot: false,
      historicalOnlyRelativeToA5: true,
      correctiveOnly: false,
      exposure: exposure(0),
    },
    ...a5BlobIds.map(
      (blobId): HistoricalBlobObject => ({
        blobId,
        sizeBytes: 20,
        contentSha256: sha256Text(`content:${blobId}`),
        paths: [...pathsByBlob.get(blobId)!].sort(),
        presentInA5Snapshot: true,
        presentInCorrectiveSnapshot: true,
        historicalOnlyRelativeToA5: false,
        correctiveOnly: false,
        exposure: exposure(2),
      }),
    ),
    {
      blobId: correctiveBlobId,
      sizeBytes: 30,
      contentSha256: sha256Text("corrective-only"),
      paths: ["src/corrective-only.ts"],
      presentInA5Snapshot: false,
      presentInCorrectiveSnapshot: true,
      historicalOnlyRelativeToA5: false,
      correctiveOnly: true,
      exposure: exposure(3),
    },
  ];
  const inventory = createHistoricalPublicObjectInventory({
    inventoryId: "historical-public-inventory.test",
    repository: priorInventory.repository,
    publicationRoots: HISTORICAL_PUBLICATION_ROOTS,
    commits,
    trees,
    blobs,
    pathObservations,
    pathTransitions: transitions,
    secretScan: {
      scope:
        "complete_recorded_public_git_object_union",
      patterns: [
        "private key PEM",
        "OpenAI-style live key",
        "GitHub personal access token",
        "AWS access key",
      ],
      falsePositiveLiterals: [
        "sk-validation-mode-must-ignore-this",
      ],
      uniqueBlobsScanned: blobs.length,
      historicalOnlyBlobsScanned: 1,
      correctiveOnlyBlobsScanned: 1,
      pathObservationsScanned:
        pathObservations.length,
      environmentFilesFound: 0,
      actualSecretMatches: 0,
      privateKeysPublished: false,
      result: "no_actual_secret_match",
    },
    createdAt: "2026-07-31T16:20:00+09:00",
    schemas,
  });
  const artifacts: Omit<
    HistoricalPublicExposureArtifact,
    "eligibility"
  >[] = [
    ...commits.map((entry) => ({
      exposureId: `public.test.commit.${entry.commitId}`,
      artifactClass: "published_source" as const,
      artifactId: `git-commit:${entry.commitId}`,
      sourceKind: "git_object" as const,
      gitObjectType: "commit" as const,
      gitObjectId: entry.commitId,
      contentHash: entry.contentSha256,
      paths: [],
      aliases: [entry.commitId],
      dependencies: [`git-tree:${entry.treeId}`],
      provenanceReferences: entry.exposure.rootCommits,
    })),
    ...trees.map((entry) => ({
      exposureId: `public.test.tree.${entry.treeId}`,
      artifactClass: "published_source" as const,
      artifactId: `git-tree:${entry.treeId}`,
      sourceKind: "git_object" as const,
      gitObjectType: "tree" as const,
      gitObjectId: entry.treeId,
      contentHash: entry.contentSha256,
      paths: [],
      aliases: [entry.treeId],
      dependencies: [],
      provenanceReferences: entry.exposure.rootCommits,
    })),
    ...blobs.map((entry) => ({
      exposureId: `public.test.blob.${entry.blobId}`,
      artifactClass:
        entry.blobId === legacyBlobId
          ? ("development_fixture" as const)
          : entry.blobId === correctiveBlobId
            ? ("published_source" as const)
            : ("development_prototype" as const),
      artifactId: `git-blob:${entry.blobId}`,
      sourceKind: "git_object" as const,
      gitObjectType: "blob" as const,
      gitObjectId: entry.blobId,
      contentHash: entry.contentSha256,
      paths: entry.paths,
      aliases: [
        entry.blobId,
        ...entry.paths.map(
          (filePath) => `git-path:${filePath}`,
        ),
      ],
      dependencies: [],
      provenanceReferences: entry.exposure.rootCommits,
    })),
  ];
  const author = PrincipalSigner.generate({
    principalId: "protocol.author.historical-test",
    role: "protocol_author",
    implementationDigest: sha256Text(
      "test/historical-publication-exposure.test.ts",
    ),
    instanceId: "protocol.author.historical-test.instance",
    keyId: "protocol.author.historical-test.ed25519",
  });
  const ledger = createHistoricalPublicExposureLedger({
    ledgerId: "historical-public-exposure.test",
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
  const closure = createPublicationSupersedingClosure({
    value: {
      closureId:
        "publication-remediation.superseding.test",
      governanceDomainId:
        "self-evolving-harness.publication-governance",
      deviationId: deviation.deviationId,
      deviationRecordHash: deviation.recordHash,
      priorClosureId: priorClosure.closureId,
      priorClosureHash: priorClosure.recordHash,
      priorClosureFileSha256:
        "sha256:f1436b5a13c4465c3cf61c98b67de4048cc9b77994e385f3e10f2451ad2625ba",
      correctiveDecision: {
        round: "03RRRRR",
        decision: "REVISE",
        responsePath:
          ".codex/gpt-pro-architect/responses/response-3rrrrr.md",
        responseSha256:
          "sha256:9df707631279d1b423822c9e3011e3b564a245a09660217912dc8297577cd267",
      },
      historicalInventoryId: inventory.inventoryId,
      historicalInventoryHash: inventory.inventoryHash,
      historicalLedgerId: ledger.ledgerId,
      historicalLedgerHash: ledger.ledgerHash,
      expandedSecretScan: {
        uniqueBlobsScanned: blobs.length,
        historicalOnlyBlobsScanned: 1,
        correctiveOnlyBlobsScanned: 1,
        environmentFilesFound: 0,
        actualSecretMatches: 0,
      },
      validatorEvidence: {
        implementationPath:
          "src/governance/historical-publication-exposure.ts",
        implementationSha256: sha256Text("implementation"),
        testPath:
          "test/historical-publication-exposure.test.ts",
        testSha256: sha256Text("test"),
        verifierPath:
          "scripts/verify-historical-publication-governance.ts",
        verifierSha256: sha256Text("verifier"),
      },
      remediation: {
        priorClosureModified: false,
        priorClosureWasPremature: true,
        closureStatus:
          "superseded_by_complete_historical_union",
        completedActions: [
          "Covered the complete historical Git object union.",
          "Preserved the prior closure unchanged.",
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
    historicalLedger: ledger,
    signer: author,
    schemas,
  });
  return {
    schemas,
    author,
    priorInventory,
    priorLedger,
    deviation,
    priorClosure,
    inventory,
    ledger,
    closure,
    policy: new HistoricalPublicExposurePolicy({
      ledger,
      deviation,
      priorInventory,
      priorLedger,
      historicalInventory: inventory,
      schemas,
    }),
    legacyBlobId,
    correctiveBlobId,
  };
}

function denied(action: () => unknown): void {
  assert.throws(action, (error: unknown) => {
    return (
      error instanceof HarnessError &&
      error.code === "AUTHORIZATION_DENIED"
    );
  });
}

test("historical union, replacement ledger, and superseding closure verify", async () => {
  const input = await fixture();
  verifyHistoricalPublicObjectInventory({
    record: input.inventory,
    schemas: input.schemas,
  });
  verifyHistoricalPublicExposureLedger({
    record: input.ledger,
    deviation: input.deviation,
    priorInventory: input.priorInventory,
    priorLedger: input.priorLedger,
    historicalInventory: input.inventory,
    schemas: input.schemas,
  });
  verifyPublicationSupersedingClosure({
    record: input.closure,
    deviation: input.deviation,
    priorInventory: input.priorInventory,
    priorLedger: input.priorLedger,
    priorClosure: input.priorClosure,
    historicalInventory: input.inventory,
    historicalLedger: input.ledger,
    schemas: input.schemas,
  });
  assert.equal(input.inventory.counts.a5SnapshotPaths, 510);
  assert.equal(input.inventory.counts.a5SnapshotBlobs, 501);
  assert.equal(
    input.inventory.counts.historicalOnlyBlobs,
    1,
  );
  assert.equal(
    input.inventory.counts.correctiveOnlyBlobs,
    1,
  );
});

test("file present only in an earlier public commit stays denied after deletion", async () => {
  const input = await fixture();
  denied(() =>
    input.policy.assertGraphAllowed({
      useClass: "gate",
      rootReferences: [input.legacyBlobId],
      nodes: [],
    }),
  );
});

test("copying a deleted historical blob under a new path stays denied", async () => {
  const input = await fixture();
  const legacy = input.inventory.blobs.find(
    (entry) => entry.blobId === input.legacyBlobId,
  )!;
  denied(() =>
    input.policy.assertGraphAllowed({
      useClass: "final",
      rootReferences: ["copied-historical-content"],
      nodes: [
        {
          nodeId: "copied-historical-content",
          contentHash: legacy.contentSha256,
          gitBlobId: null,
          path: "sealed/copied-legacy.txt",
          aliases: [],
          dependencies: [],
          wrappers: [],
          provenanceReferences: [],
        },
      ],
    }),
  );
});

test("source introduced only by corrective commit is public development", async () => {
  const input = await fixture();
  denied(() =>
    input.policy.assertGraphAllowed({
      useClass: "research_evidence",
      rootReferences: [input.correctiveBlobId],
      nodes: [],
    }),
  );
});

test("known public commit stays exposed when it becomes unreachable", async () => {
  const input = await fixture();
  denied(() =>
    input.policy.assertGraphAllowed({
      useClass: "governance_audit",
      rootReferences: ["unrelated"],
      nodes: [],
      resetClaims: {
        unreachableCommitRestoresSecrecy: true,
      },
    }),
  );
});

test("manifest with only an absent historical dependency is denied", async () => {
  const input = await fixture();
  denied(() =>
    input.policy.assertGraphAllowed({
      useClass: "research_selection",
      rootReferences: ["manifest.fresh"],
      nodes: [
        {
          nodeId: "manifest.fresh",
          contentHash: sha256Text("fresh-manifest"),
          gitBlobId: null,
          path: "research/manifest.json",
          aliases: [],
          dependencies: [input.legacyBlobId],
          wrappers: [],
          provenanceReferences: [],
        },
      ],
    }),
  );
});

test("one Git object cannot be laundered through duplicate exposure entries", async () => {
  const input = await fixture();
  const duplicate = {
    ...input.ledger.artifacts[0]!,
    exposureId: "public.test.duplicate-object-entry",
  };
  assert.throws(
    () =>
      createHistoricalPublicExposureLedger({
        ledgerId: "historical-public-exposure.duplicate",
        governanceDomainId:
          "self-evolving-harness.publication-governance",
        deviation: input.deviation,
        priorInventory: input.priorInventory,
        priorLedger: input.priorLedger,
        historicalInventory: input.inventory,
        artifacts: [...input.ledger.artifacts, duplicate],
        createdAt: "2026-07-31T16:21:30+09:00",
        signer: input.author,
        schemas: input.schemas,
      }),
    (error: unknown) =>
      error instanceof HarnessError &&
      error.code === "SCHEMA_INVALID",
  );
});

test("superseding closure is append-only and preserves prior closure identity", async () => {
  const input = await fixture();
  const root = await mkdtemp(
    path.join(tmpdir(), "seh-historical-closure-"),
  );
  try {
    const log = new PublicationSupersedingClosureLog({
      root,
      schemas: input.schemas,
      deviation: input.deviation,
      priorInventory: input.priorInventory,
      priorLedger: input.priorLedger,
      priorClosure: input.priorClosure,
      historicalInventory: input.inventory,
      historicalLedger: input.ledger,
    });
    const first = await log.append(input.closure);
    const duplicate = await log.append(input.closure);
    assert.equal(first.recordHash, duplicate.recordHash);
    assert.equal(
      input.closure.priorClosureHash,
      input.priorClosure.recordHash,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
