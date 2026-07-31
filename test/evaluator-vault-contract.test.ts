import assert from "node:assert/strict";
import {
  mkdtemp,
  readFile,
  rm,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  EVALUATOR_VAULT_ACTION_AUTHORITY,
  EVALUATOR_VAULT_MOUNT_POLICY,
  EvaluatorVault,
  HarnessError,
  HistoricalPublicExposurePolicy,
  IndependentAuthorshipLog,
  PUBLIC_EXPOSURE_RESTRICTED_USES,
  PrincipalSigner,
  SchemaRegistry,
  assertSyntheticMetadataResearchEligible,
  createBlindedAuthorshipDecision,
  createBlindedAuthorshipReview,
  createEvaluatorVaultContract,
  createIndependentAuthorshipTransition,
  createSyntheticAuthorshipMetadata,
  createSyntheticContaminationDeclaration,
  createVaultAccessRequest,
  parseStrictJson,
  sha256Text,
  verifyBlindedAuthorshipReview,
  verifyEvaluatorVaultContract,
  verifyVaultAccessRecord,
  type BlindedAuthorshipDecision,
  type BlindedAuthorshipReview,
  type EvaluatorVaultContract,
  type HistoricalPublicExposureLedger,
  type HistoricalPublicObjectInventory,
  type IndependentAuthorshipTransition,
  type PublicationDeviationRecord,
  type PublicExposureLedger,
  type PublishedArtifactInventory,
  type SyntheticAuthorshipMetadata,
  type SyntheticContaminationNode,
  type VaultAccessRequest,
  type VaultPrincipalMatrix,
} from "../src/index.js";
import {
  deterministicPrincipal,
} from "./helpers/deterministic-principal.js";

const PROTOCOL_ID =
  `protocol-sha256:${"a".repeat(64)}`;
const TASK_ONE =
  `opaque-task-sha256:${"b".repeat(64)}`;
const TASK_TWO =
  `opaque-task-sha256:${"c".repeat(64)}`;

async function readJson<T>(filePath: string): Promise<T> {
  return parseStrictJson(
    await readFile(path.resolve(filePath), "utf8"),
  ) as unknown as T;
}

interface TrustFixture {
  readonly schemas: SchemaRegistry;
  readonly policy: HistoricalPublicExposurePolicy;
  readonly historicalLedger:
    HistoricalPublicExposureLedger;
  readonly signers: {
    readonly benchmarkAuthor: PrincipalSigner;
    readonly benchmarkReviewer: PrincipalSigner;
    readonly vault: PrincipalSigner;
    readonly evaluator: PrincipalSigner;
    readonly scorer: PrincipalSigner;
    readonly promoter: PrincipalSigner;
    readonly audit: PrincipalSigner;
    readonly protocolAuthor: PrincipalSigner;
  };
  readonly contract: EvaluatorVaultContract;
}

let sharedFixture: Promise<TrustFixture> | undefined;

function signer(
  principalId: string,
  role: Parameters<typeof deterministicPrincipal>[0]["role"],
  seedByte: number,
): PrincipalSigner {
  return deterministicPrincipal({
    principalId,
    role,
    implementationDigest: sha256Text(
      `implementation:${principalId}`,
    ),
    instanceId: `${principalId}.instance`,
    seedByte,
  });
}

async function fixture(): Promise<TrustFixture> {
  sharedFixture ??= (async () => {
    const schemas = await SchemaRegistry.load(
      path.resolve("schemas"),
    );
    const [
      priorInventory,
      priorLedger,
      deviation,
      historicalInventory,
      historicalLedger,
    ] = await Promise.all([
      readJson<PublishedArtifactInventory>(
        "governance/public-exposure/inventory-a5d8256.json",
      ),
      readJson<PublicExposureLedger>(
        "governance/public-exposure/ledger-a5d8256.json",
      ),
      readJson<PublicationDeviationRecord>(
        "governance/publication-deviations/github-publication-2026-07-31.json",
      ),
      readJson<HistoricalPublicObjectInventory>(
        "governance/public-exposure/historical-inventory-through-8b5f144.json",
      ),
      readJson<HistoricalPublicExposureLedger>(
        "governance/public-exposure/historical-ledger-through-8b5f144.json",
      ),
    ]);
    const policy = new HistoricalPublicExposurePolicy({
      ledger: historicalLedger,
      deviation,
      priorInventory,
      priorLedger,
      historicalInventory,
      schemas,
    });
    const signers = {
      benchmarkAuthor: signer(
        "benchmark.author",
        "benchmark_author",
        31,
      ),
      benchmarkReviewer: signer(
        "benchmark.reviewer",
        "benchmark_reviewer",
        32,
      ),
      vault: signer("vault", "vault", 33),
      evaluator: signer("evaluator", "evaluator", 34),
      scorer: signer("scorer", "scorer", 35),
      promoter: signer("promoter", "promoter", 36),
      audit: signer("audit", "audit_store", 37),
      protocolAuthor: signer(
        "protocol.author",
        "protocol_author",
        38,
      ),
    } as const;
    const principalMatrix: VaultPrincipalMatrix = {
      benchmarkAuthor:
        signers.benchmarkAuthor.exportPublic(),
      benchmarkReviewer:
        signers.benchmarkReviewer.exportPublic(),
      vault: signers.vault.exportPublic(),
      evaluator: signers.evaluator.exportPublic(),
      scorer: signers.scorer.exportPublic(),
      promoter: signers.promoter.exportPublic(),
      audit: signers.audit.exportPublic(),
      protocolAuthor:
        signers.protocolAuthor.exportPublic(),
    };
    const contract = createEvaluatorVaultContract({
      contractId: "evaluator-vault.contract.v1",
      protocolId: PROTOCOL_ID,
      principalMatrix,
      frozenAt: "2026-07-31T17:00:00.000Z",
      signer: signers.protocolAuthor,
      schemas,
    });
    return {
      schemas,
      policy,
      historicalLedger,
      signers,
      contract,
    };
  })();
  return sharedFixture;
}

function assignedMetadata(): SyntheticAuthorshipMetadata {
  return createSyntheticAuthorshipMetadata({
    contentCommitment: null,
    verifierCommitment: null,
    inclusionRuleHash: sha256Text(
      "synthetic-inclusion-rule-v1",
    ),
    collectionWindowHash: sha256Text(
      "synthetic-collection-window-v1",
    ),
    contaminationDeclaration:
      createSyntheticContaminationDeclaration({
        declaredClear: true,
        rootReferences: [],
      }),
  });
}

function committedMetadata(
  suffix: string,
  nodes: readonly SyntheticContaminationNode[] = [],
): SyntheticAuthorshipMetadata {
  const contentCommitment = sha256Text(
    `synthetic-content-commitment:${suffix}`,
  );
  const verifierCommitment = sha256Text(
    `synthetic-verifier-commitment:${suffix}`,
  );
  return createSyntheticAuthorshipMetadata({
    contentCommitment,
    verifierCommitment,
    inclusionRuleHash: sha256Text(
      "synthetic-inclusion-rule-v1",
    ),
    collectionWindowHash: sha256Text(
      "synthetic-collection-window-v1",
    ),
    contaminationDeclaration:
      createSyntheticContaminationDeclaration({
        declaredClear: true,
        rootReferences: [
          contentCommitment,
          verifierCommitment,
        ],
        nodes,
      }),
  });
}

function authorshipChain(input: {
  readonly value: TrustFixture;
  readonly taskHandle: string;
  readonly workflowId: string;
  readonly decision: "include" | "reject";
}): {
  readonly transitions:
    readonly IndependentAuthorshipTransition[];
  readonly review: BlindedAuthorshipReview;
  readonly decision: BlindedAuthorshipDecision;
} {
  const common = {
    workflowId: input.workflowId,
    taskHandle: input.taskHandle,
    contract: input.value.contract,
    schemas: input.value.schemas,
    historicalPolicy: input.value.policy,
  };
  const assigned =
    createIndependentAuthorshipTransition({
      ...common,
      transitionId: `${input.workflowId}.assign`,
      action: "assign",
      previous: null,
      assignmentMetadata: assignedMetadata(),
      occurredAt: "2026-07-31T17:01:00.000Z",
      signer: input.value.signers.protocolAuthor,
    });
  const committed =
    createIndependentAuthorshipTransition({
      ...common,
      transitionId: `${input.workflowId}.commit`,
      action: "commit",
      previous: assigned,
      commitMetadata: committedMetadata(
        input.workflowId,
      ),
      occurredAt: "2026-07-31T17:02:00.000Z",
      signer: input.value.signers.benchmarkAuthor,
    });
  const review = createBlindedAuthorshipReview({
    reviewPacketId: `${input.workflowId}.review`,
    assigned,
    committed,
    issuedAt: "2026-07-31T17:03:00.000Z",
    signer: input.value.signers.vault,
    contract: input.value.contract,
    schemas: input.value.schemas,
    historicalPolicy: input.value.policy,
  });
  const underReview =
    createIndependentAuthorshipTransition({
      ...common,
      transitionId: `${input.workflowId}.blind`,
      action: "begin_blinded_review",
      previous: committed,
      review,
      occurredAt: "2026-07-31T17:04:00.000Z",
      signer: input.value.signers.vault,
    });
  const decision = createBlindedAuthorshipDecision({
    decisionId: `${input.workflowId}.decision`,
    review,
    decision: input.decision,
    ...(input.decision === "reject"
      ? {
          rejectionReasonCommitment: sha256Text(
            "synthetic-rejection-reason",
          ),
        }
      : {}),
    decidedAt: "2026-07-31T17:04:30.000Z",
    signer:
      input.value.signers.benchmarkReviewer,
    contract: input.value.contract,
    schemas: input.value.schemas,
  });
  const decided =
    createIndependentAuthorshipTransition({
      ...common,
      transitionId: `${input.workflowId}.${input.decision}`,
      action: input.decision,
      previous: underReview,
      review,
      decision,
      occurredAt: "2026-07-31T17:05:00.000Z",
      signer: input.value.signers.vault,
    });
  return {
    transitions: [
      assigned,
      committed,
      underReview,
      decided,
    ],
    review,
    decision,
  };
}

async function expectCode(
  action: () => Promise<unknown>,
  code: HarnessError["code"],
): Promise<void> {
  await assert.rejects(action, (error: unknown) => {
    return (
      error instanceof HarnessError &&
      error.code === code
    );
  });
}

test("contract freezes distinct principals, role mounts, action authority, and body-free release rules", async () => {
  const value = await fixture();
  verifyEvaluatorVaultContract({
    record: value.contract,
    schemas: value.schemas,
  });
  assert.deepEqual(
    value.contract.mountPolicy,
    EVALUATOR_VAULT_MOUNT_POLICY,
  );
  assert.deepEqual(
    value.contract.actionAuthority,
    EVALUATOR_VAULT_ACTION_AUTHORITY,
  );
  const principalIds = Object.values(
    value.contract.principalMatrix,
  ).map((entry) => entry.identity.principalId);
  const keyIds = Object.values(
    value.contract.principalMatrix,
  ).map((entry) => entry.keyId);
  assert.equal(
    new Set(principalIds).size,
    principalIds.length,
  );
  assert.equal(new Set(keyIds).size, keyIds.length);
  const serialized = JSON.stringify(value.contract);
  assert.equal(serialized.includes("PRIVATE KEY"), false);
  assert.equal(value.contract.taskBodiesPresent, false);
  assert.equal(
    value.contract.releasePolicy.deniedAttemptReleasesFields,
    0,
  );
});

test("independent authorship preserves assignment, commitments, blinded review, inclusion and rejection", async (t) => {
  const value = await fixture();
  const root = await mkdtemp(
    path.join(os.tmpdir(), "seh-authorship-"),
  );
  t.after(async () => {
    await rm(root, { recursive: true, force: true });
  });
  const included = authorshipChain({
    value,
    taskHandle: TASK_ONE,
    workflowId: "authorship.synthetic.include",
    decision: "include",
  });
  verifyBlindedAuthorshipReview({
    record: included.review,
    contract: value.contract,
    schemas: value.schemas,
  });
  const reviewJson = JSON.stringify(included.review);
  assert.equal(reviewJson.includes(TASK_ONE), false);
  assert.equal(
    reviewJson.includes(
      value.signers.benchmarkAuthor.identity.principalId,
    ),
    false,
  );
  assert.equal(included.review.authorIdentityIncluded, false);
  assert.equal(included.review.taskBodyIncluded, false);
  assert.equal(included.review.verifierLogicIncluded, false);
  assert.equal(included.review.labelsIncluded, false);
  assert.equal(included.review.pathsIncluded, false);
  const decisionJson = JSON.stringify(included.decision);
  assert.equal(decisionJson.includes(TASK_ONE), false);
  assert.equal(
    decisionJson.includes(
      value.signers.benchmarkAuthor.identity.principalId,
    ),
    false,
  );
  assert.throws(
    () =>
      createBlindedAuthorshipDecision({
        decisionId:
          "authorship.synthetic.wrong-reviewer",
        review: included.review,
        decision: "include",
        decidedAt: "2026-07-31T17:04:31.000Z",
        signer: value.signers.benchmarkAuthor,
        contract: value.contract,
        schemas: value.schemas,
      }),
    /frozen blinded reviewer/iu,
  );
  assert.equal(
    included.transitions.at(-1)!.blindedDecision
      ?.recordHash,
    included.decision.recordHash,
  );

  const log = new IndependentAuthorshipLog({
    root,
    workflowId: "authorship.synthetic.include",
    contract: value.contract,
    schemas: value.schemas,
    historicalPolicy: value.policy,
  });
  for (const transition of included.transitions) {
    await log.append({ record: transition });
  }
  const recovered = await log.readAll();
  assert.deepEqual(
    recovered.map((entry) => entry.nextState),
    [
      "assigned",
      "committed",
      "under_blinded_review",
      "included",
    ],
  );
  assert.equal(
    recovered[0]!.metadata.contentCommitment,
    null,
  );
  assert.equal(
    recovered[1]!.metadata.bodyPresent,
    false,
  );

  const rejected = authorshipChain({
    value,
    taskHandle: TASK_TWO,
    workflowId: "authorship.synthetic.reject",
    decision: "reject",
  });
  assert.equal(
    rejected.transitions.at(-1)!.nextState,
    "rejected",
  );
  assert.notEqual(
    rejected.transitions.at(-1)!
      .rejectionReasonCommitment,
    null,
  );
  assert.throws(
    () =>
      new EvaluatorVault({
        root: path.join(root, "rejected-vault"),
        contract: value.contract,
        schemas: value.schemas,
        vaultSigner: value.signers.vault,
        historicalPolicy: value.policy,
        authorshipAdmissions: [
          {
            included: rejected.transitions.at(-1)!,
            previous: rejected.transitions.at(-2)!,
          },
        ],
      }),
    /requires a finalized included/iu,
  );
});

test("historical exposure blocks direct, aliased, dependent, wrapped, and provenance-laundered synthetic metadata", async () => {
  const value = await fixture();
  const exposed = value.historicalLedger.artifacts.find(
    (entry) =>
      entry.contentHash !== null &&
      entry.gitObjectId !== null,
  )!;
  const clean = committedMetadata("clean");
  assert.doesNotThrow(() =>
    assertSyntheticMetadataResearchEligible({
      metadata: clean,
      historicalPolicy: value.policy,
    }),
  );
  for (const useClass of PUBLIC_EXPOSURE_RESTRICTED_USES) {
    assert.throws(
      () =>
        value.policy.assertGraphAllowed({
          useClass,
          rootReferences: [exposed.exposureId],
          nodes: [],
        }),
      /cannot be used/iu,
      useClass,
    );
  }

  const freshContent = sha256Text(
    "synthetic-contamination-root-content",
  );
  const freshVerifier = sha256Text(
    "synthetic-contamination-root-verifier",
  );
  const baseNode = {
    nodeId: freshContent,
    contentHash: null,
    gitObjectId: null,
    aliases: [] as readonly string[],
    dependencies: [] as readonly string[],
    wrappers: [] as readonly string[],
    provenanceReferences: [] as readonly string[],
  };
  const cases: readonly {
    readonly name: string;
    readonly contentCommitment?: string;
    readonly node?: SyntheticContaminationNode;
  }[] = [
    {
      name: "content hash",
      contentCommitment: exposed.contentHash!,
    },
    {
      name: "git object",
      node: {
        ...baseNode,
        gitObjectId: exposed.gitObjectId,
      },
    },
    {
      name: "alias",
      node: {
        ...baseNode,
        aliases: [exposed.artifactId],
      },
    },
    {
      name: "dependency",
      node: {
        ...baseNode,
        dependencies: [exposed.exposureId],
      },
    },
    {
      name: "wrapper",
      node: {
        ...baseNode,
        wrappers: [exposed.exposureId],
      },
    },
    {
      name: "provenance",
      node: {
        ...baseNode,
        provenanceReferences: [
          exposed.exposureId,
        ],
      },
    },
  ];
  for (const entry of cases) {
    const contentCommitment =
      entry.contentCommitment ?? freshContent;
    const metadata =
      createSyntheticAuthorshipMetadata({
        contentCommitment,
        verifierCommitment: freshVerifier,
        inclusionRuleHash: sha256Text(
          `inclusion:${entry.name}`,
        ),
        collectionWindowHash: sha256Text(
          `window:${entry.name}`,
        ),
        contaminationDeclaration:
          createSyntheticContaminationDeclaration({
            declaredClear: true,
            rootReferences: [
              contentCommitment,
              freshVerifier,
            ],
            nodes:
              entry.node === undefined
                ? []
                : [entry.node],
          }),
      });
    assert.throws(
      () =>
        assertSyntheticMetadataResearchEligible({
          metadata,
          historicalPolicy: value.policy,
        }),
      /cannot be used/iu,
      entry.name,
    );
  }
});

test("vault releases only commitments and fails closed on wrong role, key, replay, substitution, early access, and protocol mismatch", async (t) => {
  const value = await fixture();
  const root = await mkdtemp(
    path.join(os.tmpdir(), "seh-evaluator-vault-"),
  );
  t.after(async () => {
    await rm(root, { recursive: true, force: true });
  });
  const chainOne = authorshipChain({
    value,
    taskHandle: TASK_ONE,
    workflowId: "vault-admission.synthetic.one",
    decision: "include",
  });
  const chainTwo = authorshipChain({
    value,
    taskHandle: TASK_TWO,
    workflowId: "vault-admission.synthetic.two",
    decision: "include",
  });
  const includedOne = chainOne.transitions.at(-1)!;
  const includedTwo = chainTwo.transitions.at(-1)!;
  const vault = new EvaluatorVault({
    root,
    contract: value.contract,
    schemas: value.schemas,
    vaultSigner: value.signers.vault,
    historicalPolicy: value.policy,
    authorshipAdmissions: [
      {
        included: includedOne,
        previous: chainOne.transitions.at(-2)!,
      },
      {
        included: includedTwo,
        previous: chainTwo.transitions.at(-2)!,
      },
    ],
  });
  assert.throws(
    () =>
      vault.issueUnlockCapability({
        capabilityId: "capability.too-early",
        taskHandle: TASK_ONE,
        issuedAt: "2026-07-31T18:00:00.000Z",
        expiresAt: "2026-07-31T18:10:00.000Z",
        nonce: "capability-too-early-0001",
      }),
    /sealed task/iu,
  );

  const request = (
    input: Omit<
      Parameters<typeof createVaultAccessRequest>[0],
      "contract" | "schemas"
    >,
  ): VaultAccessRequest =>
    createVaultAccessRequest({
      ...input,
      contract: value.contract,
      schemas: value.schemas,
    });
  const createOne = request({
    requestId: "request.create.one",
    action: "create",
    taskHandle: TASK_ONE,
    subjectCommitment: includedOne.recordHash,
    senderSequence: 0,
    nonce: "request-create-one-0001",
    requestedAt: "2026-07-31T18:00:01.000Z",
    signer: value.signers.benchmarkAuthor,
  });
  await vault.process(createOne);
  await vault.process(
    request({
      requestId: "request.create.two",
      action: "create",
      taskHandle: TASK_TWO,
      subjectCommitment: includedTwo.recordHash,
      senderSequence: 1,
      nonce: "request-create-two-0001",
      requestedAt: "2026-07-31T18:00:02.000Z",
      signer: value.signers.benchmarkAuthor,
    }),
  );

  await expectCode(
    () =>
      vault.process(
        request({
          requestId: TASK_ONE,
          action: "audit",
          taskHandle: null,
          senderSequence: 2,
          nonce: "request-wrong-role-0001",
          requestedAt:
            "2026-07-31T18:00:03.000Z",
          signer: value.signers.benchmarkAuthor,
        }),
      ),
    "AUTHORIZATION_DENIED",
  );

  const rogueEvaluator = signer(
    "rogue.evaluator",
    "evaluator",
    71,
  );
  await expectCode(
    () =>
      vault.process(
        request({
          requestId: "request.wrong-key",
          action: "evaluate",
          taskHandle: TASK_ONE,
          subjectCommitment: sha256Text(
            "rogue-evaluation",
          ),
          senderSequence: 0,
          nonce: "request-wrong-key-0001",
          requestedAt:
            "2026-07-31T18:00:04.000Z",
          signer: rogueEvaluator,
        }),
      ),
    "AUTHENTICATION_FAILED",
  );

  await vault.process(
    request({
      requestId: "request.seal.one",
      action: "seal",
      taskHandle: TASK_ONE,
      subjectCommitment: includedOne.recordHash,
      senderSequence: 0,
      nonce: "request-seal-one-0001",
      requestedAt: "2026-07-31T18:00:05.000Z",
      signer: value.signers.vault,
    }),
  );
  await vault.process(
    request({
      requestId: "request.seal.two",
      action: "seal",
      taskHandle: TASK_TWO,
      subjectCommitment: includedTwo.recordHash,
      senderSequence: 1,
      nonce: "request-seal-two-0001",
      requestedAt: "2026-07-31T18:00:06.000Z",
      signer: value.signers.vault,
    }),
  );
  const enumeration = await vault.process(
    request({
      requestId: "request.enumerate",
      action: "enumerate",
      taskHandle: null,
      senderSequence: 2,
      nonce: "request-enumerate-0001",
      requestedAt: "2026-07-31T18:00:07.000Z",
      signer: value.signers.vault,
    }),
  );
  assert.deepEqual(
    enumeration.releasedCommitments,
    [sha256Text(TASK_ONE), sha256Text(TASK_TWO)].sort(),
  );
  assert.equal(
    JSON.stringify(enumeration).includes(TASK_ONE),
    false,
  );

  const capability = vault.issueUnlockCapability({
    capabilityId: "capability.task-one",
    taskHandle: TASK_ONE,
    issuedAt: "2026-07-31T18:00:08.000Z",
    expiresAt: "2026-07-31T18:10:00.000Z",
    nonce: "capability-task-one-0001",
  });

  await expectCode(
    () =>
      vault.process(
        request({
          requestId: "request.early-evaluate",
          action: "evaluate",
          taskHandle: TASK_ONE,
          subjectCommitment: sha256Text(
            "early-evaluation",
          ),
          senderSequence: 0,
          nonce: "request-early-evaluate-0001",
          requestedAt:
            "2026-07-31T18:00:09.000Z",
          signer: value.signers.evaluator,
        }),
      ),
    "INVALID_STATE_TRANSITION",
  );
  await expectCode(
    () =>
      vault.process(
        request({
          requestId: "request.protocol-mismatch",
          protocolId:
            `protocol-sha256:${"f".repeat(64)}`,
          action: "unlock",
          taskHandle: TASK_ONE,
          capability,
          senderSequence: 0,
          nonce: "request-protocol-mismatch-0001",
          requestedAt:
            "2026-07-31T18:00:10.000Z",
          signer: value.signers.evaluator,
        }),
      ),
    "PROTOCOL_MISMATCH",
  );
  await expectCode(
    () =>
      vault.process(
        request({
          requestId: "request.capability-substitution",
          action: "unlock",
          taskHandle: TASK_TWO,
          capability,
          senderSequence: 0,
          nonce:
            "request-capability-substitution-0001",
          requestedAt:
            "2026-07-31T18:00:11.000Z",
          signer: value.signers.evaluator,
        }),
      ),
    "AUTHORIZATION_DENIED",
  );

  const unlock = request({
    requestId: "request.unlock.one",
    action: "unlock",
    taskHandle: TASK_ONE,
    capability,
    senderSequence: 0,
    nonce: "request-unlock-one-0001",
    requestedAt: "2026-07-31T18:00:12.000Z",
    signer: value.signers.evaluator,
  });
  const unlocked = await vault.process(unlock);
  assert.equal(vault.taskState(TASK_ONE), "unlocked");
  assert.deepEqual(unlocked.releasedCommitments, [
    capability.capabilityHash,
  ]);
  await expectCode(
    () => vault.process(unlock),
    "REPLAY_DETECTED",
  );

  const evaluationCommitment = sha256Text(
    "synthetic-evaluation-outcome-one",
  );
  const evaluated = await vault.process(
    request({
      requestId: "request.evaluate.one",
      action: "evaluate",
      taskHandle: TASK_ONE,
      subjectCommitment: evaluationCommitment,
      senderSequence: 1,
      nonce: "request-evaluate-one-0001",
      requestedAt: "2026-07-31T18:00:13.000Z",
      signer: value.signers.evaluator,
    }),
  );
  assert.deepEqual(evaluated.releasedCommitments, [
    evaluationCommitment,
  ]);
  assert.equal(vault.taskState(TASK_ONE), "evaluated");

  await expectCode(
    () =>
      vault.process(
        request({
          requestId: "request.early-score",
          action: "score",
          taskHandle: TASK_TWO,
          subjectCommitment: sha256Text(
            "not-an-evaluation-release",
          ),
          senderSequence: 0,
          nonce: "request-early-score-0001",
          requestedAt:
            "2026-07-31T18:00:14.000Z",
          signer: value.signers.scorer,
        }),
      ),
    "INVALID_STATE_TRANSITION",
  );
  const scored = await vault.process(
    request({
      requestId: "request.score.one",
      action: "score",
      taskHandle: TASK_ONE,
      subjectCommitment: evaluationCommitment,
      senderSequence: 0,
      nonce: "request-score-one-0001",
      requestedAt: "2026-07-31T18:00:15.000Z",
      signer: value.signers.scorer,
    }),
  );
  assert.equal(scored.releasedCommitments.length, 1);
  assert.notEqual(
    scored.releasedCommitments[0],
    evaluationCommitment,
  );
  assert.equal(vault.taskState(TASK_ONE), "scored");

  const audited = await vault.process(
    request({
      requestId: "request.audit",
      action: "audit",
      taskHandle: null,
      senderSequence: 0,
      nonce: "request-audit-event-0001",
      requestedAt: "2026-07-31T18:00:16.000Z",
      signer: value.signers.audit,
    }),
  );
  assert.equal(audited.releasedCommitments.length, 1);

  const concurrentAudit = await Promise.allSettled([
    vault.process(
      request({
        requestId: "request.audit.concurrent.one",
        action: "audit",
        taskHandle: null,
        senderSequence: 1,
        nonce: "request-audit-concurrent-one-0001",
        requestedAt:
          "2026-07-31T18:00:17.000Z",
        signer: value.signers.audit,
      }),
    ),
    vault.process(
      request({
        requestId: "request.audit.concurrent.two",
        action: "audit",
        taskHandle: null,
        senderSequence: 1,
        nonce: "request-audit-concurrent-two-0001",
        requestedAt:
          "2026-07-31T18:00:17.001Z",
        signer: value.signers.audit,
      }),
    ),
  ]);
  assert.deepEqual(
    concurrentAudit.map((entry) => entry.status),
    ["fulfilled", "rejected"],
  );
  assert.equal(
    (concurrentAudit[1] as PromiseRejectedResult).reason
      .code,
    "REPLAY_DETECTED",
  );

  const restartedVault = new EvaluatorVault({
    root,
    contract: value.contract,
    schemas: value.schemas,
    vaultSigner: value.signers.vault,
    historicalPolicy: value.policy,
    authorshipAdmissions: [
      {
        included: includedOne,
        previous: chainOne.transitions.at(-2)!,
      },
      {
        included: includedTwo,
        previous: chainTwo.transitions.at(-2)!,
      },
    ],
  });
  await expectCode(
    () => restartedVault.process(createOne),
    "REPLAY_DETECTED",
  );

  const ledger = await restartedVault.readAccessLedger();
  assert.equal(
    ledger.filter((entry) => entry.decision === "denied")
      .length,
    9,
  );
  assert.equal(
    ledger.every(
      (entry) =>
        entry.release.taskBodyReleased === false &&
        entry.release.rawTaskHandleReleased === false &&
        entry.release.authorIdentityReleased === false &&
        entry.release.candidateIdentityReleased === false,
    ),
    true,
  );
  assert.equal(JSON.stringify(ledger).includes(TASK_ONE), false);
  for (const entry of ledger) {
    verifyVaultAccessRecord({
      record: entry,
      contract: value.contract,
      schemas: value.schemas,
    });
  }
  const tampered = structuredClone(ledger.at(-1)!);
  (
    tampered as {
      release: { rawTaskHandleReleased: boolean };
    }
  ).release.rawTaskHandleReleased = true;
  assert.throws(
    () =>
      verifyVaultAccessRecord({
        record: tampered,
        contract: value.contract,
        schemas: value.schemas,
      }),
    /schema|hash|released/iu,
  );
});
