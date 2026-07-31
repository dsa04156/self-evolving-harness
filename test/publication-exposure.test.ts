import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  PUBLIC_EXPOSURE_ALLOWED_USES,
  PUBLIC_EXPOSURE_RESTRICTED_USES,
  HarnessError,
  PrincipalSigner,
  PublicationDeviationLog,
  PublicationRemediationClosureLog,
  PublicExposurePolicy,
  SchemaRegistry,
  createPublicationDeviationRecord,
  createPublicationRemediationClosure,
  createPublicExposureLedger,
  createPublishedArtifactInventory,
  sha256Text,
  verifyPublicationRemediationClosure,
  verifyPublicExposureLedger,
  type PublicationDeviationRecord,
  type PublicationDeviationUnsignedInput,
  type PublicationRemediationClosureRecord,
  type PublicExposureLedger,
  type PublishedArtifactInventory,
} from "../src/index.js";

const REPOSITORY = {
  url: "https://github.com/dsa04156/self-evolving-harness",
  owner: "dsa04156",
  remoteName: "origin",
  branch: "main",
} as const;

const SNAPSHOT_COMMIT =
  "a5d82564cece5ecb776a27c86512c3ec56f32787";
const SNAPSHOT_TREE =
  "1bbc1a7623460cf52907758e7ee93149e18a0aec";
const PUBLIC_FIXTURE_HASH = sha256Text(
  "public-development-fixture",
);
const PUBLIC_FIXTURE_BLOB =
  "1111111111111111111111111111111111111111";

interface GovernanceFixture {
  readonly schemas: SchemaRegistry;
  readonly signer: PrincipalSigner;
  readonly inventory: PublishedArtifactInventory;
  readonly deviation: PublicationDeviationRecord;
  readonly ledger: PublicExposureLedger;
  readonly closure: PublicationRemediationClosureRecord;
  readonly policy: PublicExposurePolicy;
}

function signer(): PrincipalSigner {
  return PrincipalSigner.generate({
    principalId: "protocol.author.publication-governance",
    role: "protocol_author",
    implementationDigest: sha256Text(
      "test/publication-exposure.test.ts",
    ),
    instanceId:
      "protocol.author.publication-governance.test-instance",
    keyId: "protocol.author.publication-governance.ed25519",
  });
}

function deviationValue(
  inventory: PublishedArtifactInventory,
): PublicationDeviationUnsignedInput {
  const instruction =
    "https://github.com/dsa04156/self-evolving-harness 이거ㅣ 새로만들었는데 업데이트 중간중간 하면서 진행해";
  return {
    deviationId:
      "publication-deviation.github-development.2026-07-31",
    governanceDomainId:
      "self-evolving-harness.publication-governance",
    priorDecision: {
      round: "03RRR",
      decision: "APPROVE",
      responsePath:
        ".codex/gpt-pro-architect/responses/response-3rrr.md",
      responseSha256:
        "sha256:ac0637a0c8a17ff77c9db732ed4b2632acc825526f7b632c8ff57d89074370e3",
    },
    dispositionDecision: {
      round: "03RRRR",
      decision: "REVISE",
      responsePath:
        ".codex/gpt-pro-architect/responses/response-3rrrr.md",
      responseSha256:
        "sha256:deab2175380d472a8581ab4baed07af8518fde3ffa0a90a6457bb03a234db9cf",
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
      path:
        "governance/public-exposure/inventory-a5d8256.json",
    },
    secretScan: {
      scannedScopes: ["published Git snapshot"],
      patterns: ["API keys", "private key PEM", ".env files"],
      result: "no_actual_secret_match",
      falsePositiveLiterals: ["OPENAI_API_KEY"],
      environmentFilesFound: 0,
      privateKeysPublished: false,
    },
    exceededAuthorization:
      "The public push exceeded the prior Architect scope even though the user explicitly requested periodic repository updates.",
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
        "Create a permanent public-exposure ledger.",
        "Enforce transitive non-eligibility.",
        "Close remediation by append-only signed record.",
      ],
    },
    recordedAt: "2026-07-31T16:00:00+09:00",
  };
}

async function fixture(): Promise<GovernanceFixture> {
  const schemas = await SchemaRegistry.load(
    path.resolve("schemas"),
  );
  const author = signer();
  const inventory = createPublishedArtifactInventory({
    inventoryId:
      "published-inventory.origin-main.a5d8256",
    repository: REPOSITORY,
    snapshotCommit: SNAPSHOT_COMMIT,
    snapshotTree: SNAPSHOT_TREE,
    entries: [
      {
        path: "benchmarks/public-development.json",
        mode: "100644",
        objectType: "blob",
        objectId: PUBLIC_FIXTURE_BLOB,
        sizeBytes: 26,
        contentSha256: PUBLIC_FIXTURE_HASH,
      },
    ],
    createdAt: "2026-07-31T15:59:00+09:00",
    schemas,
  });
  const deviation = createPublicationDeviationRecord({
    value: deviationValue(inventory),
    inventory,
    signer: author,
    schemas,
  });
  const ledger = createPublicExposureLedger({
    ledgerId: "public-exposure.origin-main.a5d8256",
    governanceDomainId:
      "self-evolving-harness.publication-governance",
    deviation,
    inventory,
    artifacts: [
      {
        exposureId: "public.git-blob.fixture",
        artifactClass: "development_fixture",
        artifactId: "fixture.public-development",
        sourceKind: "git_blob",
        path: "benchmarks/public-development.json",
        gitBlobId: PUBLIC_FIXTURE_BLOB,
        contentHash: PUBLIC_FIXTURE_HASH,
        aliases: [
          "split.original.public-development",
        ],
        dependencies: [],
        provenanceReferences: [],
      },
      {
        exposureId: "public.embedded.candidate",
        artifactClass: "development_candidate",
        artifactId: "candidate.public-development",
        sourceKind: "embedded_record",
        path: null,
        gitBlobId: null,
        contentHash: sha256Text("public-candidate"),
        aliases: ["candidate-copy-source"],
        dependencies: [PUBLIC_FIXTURE_HASH],
        provenanceReferences: [
          "public.git-blob.fixture",
        ],
      },
    ],
    createdAt: "2026-07-31T16:01:00+09:00",
    signer: author,
    schemas,
  });
  const closure =
    createPublicationRemediationClosure({
      value: {
        closureId:
          "publication-remediation.github-development.2026-07-31",
        governanceDomainId:
          "self-evolving-harness.publication-governance",
        deviationId: deviation.deviationId,
        deviationRecordHash: deviation.recordHash,
        correctiveDecision: {
          round: "03RRRR",
          decision: "REVISE",
          responsePath:
            ".codex/gpt-pro-architect/responses/response-3rrrr.md",
          responseSha256:
            "sha256:deab2175380d472a8581ab4baed07af8518fde3ffa0a90a6457bb03a234db9cf",
        },
        inventoryHash: inventory.inventoryHash,
        publicExposureLedgerId: ledger.ledgerId,
        publicExposureLedgerHash: ledger.ledgerHash,
        validatorEvidence: {
          implementationPath:
            "src/governance/publication-exposure.ts",
          implementationSha256: sha256Text(
            "publication implementation",
          ),
          testPath: "test/publication-exposure.test.ts",
          testSha256: sha256Text("publication test"),
          verifierPath:
            "scripts/verify-publication-governance.ts",
          verifierSha256: sha256Text(
            "publication verifier",
          ),
        },
        remediation: {
          originalDeviationWasModified: false,
          originalStatusObserved: "in_progress",
          closureStatus:
            "closed_by_append_only_record",
          completedActions: [
            "Recorded the complete published snapshot.",
            "Enforced permanent transitive non-eligibility.",
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
        closedAt: "2026-07-31T16:02:00+09:00",
      },
      deviation,
      ledger,
      inventory,
      signer: author,
      schemas,
    });
  return {
    schemas,
    signer: author,
    inventory,
    deviation,
    ledger,
    closure,
    policy: new PublicExposurePolicy({
      ledgers: [ledger],
      deviations: [deviation],
      inventory,
      schemas,
    }),
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

test("signed inventory, deviation, ledger, and append-only closure verify", async () => {
  const input = await fixture();
  verifyPublicExposureLedger({
    record: input.ledger,
    deviation: input.deviation,
    inventory: input.inventory,
    schemas: input.schemas,
  });
  verifyPublicationRemediationClosure({
    record: input.closure,
    deviation: input.deviation,
    ledger: input.ledger,
    inventory: input.inventory,
    schemas: input.schemas,
  });

  const root = await mkdtemp(
    path.join(tmpdir(), "seh-publication-governance-"),
  );
  try {
    const deviations = new PublicationDeviationLog({
      root,
      schemas: input.schemas,
      inventory: input.inventory,
    });
    const first = await deviations.append(input.deviation);
    const duplicate = await deviations.append(
      input.deviation,
    );
    assert.equal(duplicate.recordHash, first.recordHash);

    const alternate = createPublicationDeviationRecord({
      value: {
        ...deviationValue(input.inventory),
        remediation: {
          status: "in_progress",
          requiredActions: ["different signed content"],
        },
      },
      inventory: input.inventory,
      signer: input.signer,
      schemas: input.schemas,
    });
    await assert.rejects(
      deviations.append(alternate),
      /reused with different content/u,
    );

    const closures = new PublicationRemediationClosureLog({
      root,
      schemas: input.schemas,
      inventory: input.inventory,
      deviation: input.deviation,
      ledger: input.ledger,
    });
    const closure = await closures.append(input.closure);
    const closureDuplicate = await closures.append(
      input.closure,
    );
    assert.equal(
      closureDuplicate.recordHash,
      closure.recordHash,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("every prohibited lifecycle rejects direct public references", async () => {
  const input = await fixture();
  for (const useClass of PUBLIC_EXPOSURE_RESTRICTED_USES) {
    denied(() =>
      input.policy.assertPayloadAllowed({
        useClass,
        payload: {
          fixture: "fixture.public-development",
        },
      }),
    );
  }
  for (const useClass of PUBLIC_EXPOSURE_ALLOWED_USES) {
    const admission = input.policy.assertPayloadAllowed({
      useClass,
      payload: { fixture: PUBLIC_FIXTURE_HASH },
    });
    assert.deepEqual(admission?.exposureIds, [
      "public.git-blob.fixture",
    ]);
  }
});

test("gate and final reject a public fixture even after split relabeling", async () => {
  const input = await fixture();
  for (const useClass of ["gate", "final"] as const) {
    denied(() =>
      input.policy.assertGraphAllowed({
        useClass,
        rootReferences: ["new-sealed-split-id"],
        nodes: [
          {
            nodeId: "new-sealed-split-id",
            contentHash: PUBLIC_FIXTURE_HASH,
            gitBlobId: null,
            path: "sealed/renamed-fixture.json",
            aliases: [],
            dependencies: [],
            wrappers: [],
            provenanceReferences: [],
          },
        ],
      }),
    );
  }
});

test("copied candidates and transitive dependency, wrapper, and provenance laundering are rejected", async () => {
  const input = await fixture();
  const publicCandidateHash = sha256Text(
    "public-candidate",
  );
  const cases = [
    {
      nodeId: "copied-candidate",
      contentHash: publicCandidateHash,
      gitBlobId: null,
      path: "candidate/copied.json",
      aliases: [] as string[],
      dependencies: [] as string[],
      wrappers: [] as string[],
      provenanceReferences: [] as string[],
    },
    {
      nodeId: "indirect-dependency",
      contentHash: sha256Text("fresh-wrapper-1"),
      gitBlobId: null,
      path: null,
      aliases: [] as string[],
      dependencies: [PUBLIC_FIXTURE_HASH],
      wrappers: [] as string[],
      provenanceReferences: [] as string[],
    },
    {
      nodeId: "indirect-wrapper",
      contentHash: sha256Text("fresh-wrapper-2"),
      gitBlobId: null,
      path: null,
      aliases: [] as string[],
      dependencies: [] as string[],
      wrappers: ["candidate-copy-source"],
      provenanceReferences: [] as string[],
    },
    {
      nodeId: "indirect-provenance",
      contentHash: sha256Text("fresh-wrapper-3"),
      gitBlobId: null,
      path: null,
      aliases: [] as string[],
      dependencies: [] as string[],
      wrappers: [] as string[],
      provenanceReferences: [
        "split.original.public-development",
      ],
    },
  ];
  for (const node of cases) {
    denied(() =>
      input.policy.assertGraphAllowed({
        useClass: "research_selection",
        rootReferences: [node.nodeId],
        nodes: [node],
      }),
    );
  }
});

test("new protocol, rewritten history, and deleted repository cannot restore secrecy", async () => {
  const input = await fixture();
  const resetClaims = [
    { newProtocolClearsExposure: true },
    { historyRewriteRestoresSecrecy: true },
    { repositoryDeletionRestoresSecrecy: true },
  ];
  for (const claims of resetClaims) {
    denied(() =>
      input.policy.assertPayloadAllowed({
        useClass: "governance_audit",
        payload: { value: "unrelated" },
        protocolId: "protocol-v2",
        resetClaims: claims,
      }),
    );
  }
});

test("documentation cannot relabel diagnostic output as independent evaluation", async () => {
  const input = await fixture();
  denied(() =>
    input.policy.assertPayloadAllowed({
      useClass: "claim_table",
      payload: {
        evidence: "public.git-blob.fixture",
        label: "independent evaluation",
      },
    }),
  );
});

test("tampering with permanent eligibility or closure binding is rejected", async () => {
  const input = await fixture();
  const tamperedLedger = structuredClone(input.ledger);
  (
    tamperedLedger.artifacts[0]!.eligibility as {
      eligibleForGate: boolean;
    }
  ).eligibleForGate = true;
  assert.throws(() =>
    verifyPublicExposureLedger({
      record: tamperedLedger,
      deviation: input.deviation,
      inventory: input.inventory,
      schemas: input.schemas,
    }),
  );

  const tamperedClosure = structuredClone(input.closure);
  (
    tamperedClosure as {
      publicExposureLedgerHash: string;
    }
  ).publicExposureLedgerHash = sha256Text("replacement");
  assert.throws(() =>
    verifyPublicationRemediationClosure({
      record: tamperedClosure,
      deviation: input.deviation,
      ledger: input.ledger,
      inventory: input.inventory,
      schemas: input.schemas,
    }),
  );
});
