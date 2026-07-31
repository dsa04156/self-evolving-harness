import {
  readFile,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

import {
  EvaluatorVault,
  HarnessError,
  HistoricalPublicExposurePolicy,
  PrincipalSigner,
  SchemaRegistry,
  canonicalBytes,
  createBlindedAuthorshipDecisionFromProjection,
  createBlindedAuthorshipReview,
  createBlindedReviewerContractProjection,
  createEvaluatorVaultContract,
  createIndependentAuthorshipTransition,
  createSyntheticAuthorshipMetadata,
  createSyntheticContaminationDeclaration,
  createVaultAccessRequest,
  parseStrictJson,
  sha256,
  sha256Text,
  type BlindedAuthorshipDecision,
  type BlindedAuthorshipReview,
  type BlindedReviewerContractProjection,
  type EvaluatorVaultContract,
  type HistoricalPublicExposureLedger,
  type HistoricalPublicObjectInventory,
  type IndependentAuthorshipTransition,
  type JsonValue,
  type OpaqueTaskCapability,
  type PrincipalIdentity,
  type PublicationDeviationRecord,
  type PublicExposureLedger,
  type PublicPrincipal,
  type PublishedArtifactInventory,
  type VaultAccessRequest,
  type VaultAction,
  type VaultCrashPhase,
  type VaultPrincipalMatrix,
} from "../src/index.js";

const INPUT =
  process.env["SEH_WORKER_INPUT"] ?? "/input";
const OUTPUT =
  process.env["SEH_WORKER_OUTPUT"] ?? "/state";
const SCHEMAS =
  process.env["SEH_WORKER_SCHEMAS"] ??
  "/opt/seh/schemas";
const GOVERNANCE =
  process.env["SEH_WORKER_GOVERNANCE"] ??
  "/opt/seh/governance";
const PRIVATE_KEY =
  process.env["SEH_WORKER_PRIVATE_KEY"] ??
  "/run/keys/private.pem";
const VAULT_STATE =
  process.env["SEH_WORKER_VAULT_STATE"] ??
  "/vault-state";
const ROLE_RECEIPT_SCHEMA_ID =
  "https://self-evolving-harness.local/schemas/body-free-os-role-receipt.schema.json";
const VAULT_RESULT_SCHEMA_ID =
  "https://self-evolving-harness.local/schemas/body-free-os-vault-result.schema.json";
const PROMOTER_PROJECTION_SCHEMA_ID =
  "https://self-evolving-harness.local/schemas/body-free-promoter-projection.schema.json";
const FINAL_AUDIT_SCHEMA_ID =
  "https://self-evolving-harness.local/schemas/body-free-os-final-audit.schema.json";

const ROLE_NAMES = [
  "protocol_author",
  "benchmark_author",
  "benchmark_reviewer",
  "vault",
  "evaluator",
  "scorer",
  "promoter",
  "audit_store",
] as const;

type BoundaryRole = (typeof ROLE_NAMES)[number];

type WorkerMode =
  | "freeze_contract"
  | "assign"
  | "commit"
  | "blind"
  | "decide"
  | "include"
  | "sign_request"
  | "issue_capability"
  | "process_request"
  | "promoter_projection"
  | "finalize_audit";

interface WorkerConfiguration {
  readonly mode: WorkerMode;
  readonly role: BoundaryRole;
  readonly timestamp: string;
  readonly protocolId?: string;
  readonly contractId?: string;
  readonly workflowId?: string;
  readonly taskHandle?: string;
  readonly action?: VaultAction;
  readonly requestId?: string;
  readonly senderSequence?: number;
  readonly nonce?: string;
  readonly subjectCommitment?: string | null;
  readonly protocolOverride?: string;
  readonly capabilityMutation?: "none" | "substitute";
  readonly signingPublicPath?: string;
  readonly signingPrivatePath?: string;
  readonly leaseOwnerId?: string;
  readonly leaseTtlMillis?: number;
  readonly crashPhase?: VaultCrashPhase;
}

interface BoundaryReceipt {
  readonly schemaVersion: 1;
  readonly recordType: "body_free_os_role_receipt";
  readonly receiptId: string;
  readonly protocolId: string;
  readonly contractHash: string | null;
  readonly role: BoundaryRole;
  readonly action: WorkerMode;
  readonly process: {
    readonly uid: number;
    readonly gid: number;
    readonly isolationClass:
      "os_enforced_subordinate_uid";
  };
  readonly inputCommitments: readonly string[];
  readonly outputCommitments: readonly string[];
  readonly bodyPresent: false;
  readonly verifierLogicPresent: false;
  readonly labelsPresent: false;
  readonly pathsPresent: false;
  readonly bodyAccess:
    "none_in_body_free_contract_prototype";
  readonly occurredAt: string;
  readonly producer: PrincipalIdentity;
  readonly receiptHash: string;
  readonly publicPrincipal: PublicPrincipal;
  readonly attestation: {
    readonly keyId: string;
    readonly algorithm: "Ed25519";
    readonly signature: string;
  };
}

async function readJson<T>(
  file: string,
): Promise<T> {
  return parseStrictJson(
    await readFile(file, "utf8"),
  ) as unknown as T;
}

async function readInput<T>(
  name: string,
): Promise<T> {
  return readJson<T>(path.join(INPUT, name));
}

async function writeJson(
  name: string,
  value: JsonValue,
): Promise<void> {
  await writeFile(
    path.join(OUTPUT, name),
    canonicalBytes(value),
    { mode: 0o600, flag: "wx" },
  );
}

async function loadConfiguration(): Promise<WorkerConfiguration> {
  return readInput<WorkerConfiguration>("config.json");
}

async function loadSigner(
  config: WorkerConfiguration,
): Promise<PrincipalSigner> {
  const publicPath =
    config.signingPublicPath ?? path.join(INPUT, "own-public.json");
  const privatePath =
    config.signingPrivatePath ?? PRIVATE_KEY;
  const principal =
    await readJson<PublicPrincipal>(publicPath);
  return PrincipalSigner.import({
    identity: principal.identity,
    keyId: principal.keyId,
    privateKeyPem: await readFile(privatePath, "utf8"),
    publicKeyPem: principal.publicKeyPem,
  });
}

async function loadHistoricalPolicy(
  schemas: SchemaRegistry,
): Promise<HistoricalPublicExposurePolicy> {
  const [
    priorInventory,
    priorLedger,
    deviation,
    historicalInventory,
    historicalLedger,
  ] = await Promise.all([
    readJson<PublishedArtifactInventory>(
      path.join(
        GOVERNANCE,
        "public-exposure/inventory-a5d8256.json",
      ),
    ),
    readJson<PublicExposureLedger>(
      path.join(
        GOVERNANCE,
        "public-exposure/ledger-a5d8256.json",
      ),
    ),
    readJson<PublicationDeviationRecord>(
      path.join(
        GOVERNANCE,
        "publication-deviations/github-publication-2026-07-31.json",
      ),
    ),
    readJson<HistoricalPublicObjectInventory>(
      path.join(
        GOVERNANCE,
        "public-exposure/historical-inventory-through-8b5f144.json",
      ),
    ),
    readJson<HistoricalPublicExposureLedger>(
      path.join(
        GOVERNANCE,
        "public-exposure/historical-ledger-through-8b5f144.json",
      ),
    ),
  ]);
  return new HistoricalPublicExposurePolicy({
    ledger: historicalLedger,
    deviation,
    priorInventory,
    priorLedger,
    historicalInventory,
    schemas,
  });
}

function requireString(
  value: string | undefined,
  label: string,
): string {
  if (value === undefined || value.length === 0) {
    throw new Error(`${label} is required`);
  }
  return value;
}

function requireNumber(
  value: number | undefined,
  label: string,
): number {
  if (value === undefined || !Number.isSafeInteger(value)) {
    throw new Error(`${label} is required`);
  }
  return value;
}

function publicMatrix(
  principals: Readonly<Record<BoundaryRole, PublicPrincipal>>,
): VaultPrincipalMatrix {
  return {
    benchmarkAuthor: principals.benchmark_author,
    benchmarkReviewer: principals.benchmark_reviewer,
    vault: principals.vault,
    evaluator: principals.evaluator,
    scorer: principals.scorer,
    promoter: principals.promoter,
    audit: principals.audit_store,
    protocolAuthor: principals.protocol_author,
  };
}

function assignedMetadata() {
  return createSyntheticAuthorshipMetadata({
    contentCommitment: null,
    verifierCommitment: null,
    inclusionRuleHash: sha256Text(
      "body-free-os.inclusion-rule.v1",
    ),
    collectionWindowHash: sha256Text(
      "body-free-os.collection-window.v1",
    ),
    contaminationDeclaration:
      createSyntheticContaminationDeclaration({
        declaredClear: true,
        rootReferences: [],
      }),
  });
}

function committedMetadata(workflowId: string) {
  const contentCommitment = sha256Text(
    `body-free-os.synthetic-content:${workflowId}`,
  );
  const verifierCommitment = sha256Text(
    `body-free-os.synthetic-verifier:${workflowId}`,
  );
  return createSyntheticAuthorshipMetadata({
    contentCommitment,
    verifierCommitment,
    inclusionRuleHash: sha256Text(
      "body-free-os.inclusion-rule.v1",
    ),
    collectionWindowHash: sha256Text(
      "body-free-os.collection-window.v1",
    ),
    contaminationDeclaration:
      createSyntheticContaminationDeclaration({
        declaredClear: true,
        rootReferences: [
          contentCommitment,
          verifierCommitment,
        ],
      }),
  });
}

function processIdentity() {
  return {
    uid: process.getuid?.() ?? -1,
    gid: process.getgid?.() ?? -1,
    isolationClass:
      "os_enforced_subordinate_uid" as const,
  };
}

async function createReceipt(input: {
  readonly config: WorkerConfiguration;
  readonly schemas: SchemaRegistry;
  readonly signer: PrincipalSigner;
  readonly contractHash: string | null;
  readonly inputCommitments: readonly string[];
  readonly outputCommitments: readonly string[];
}): Promise<BoundaryReceipt> {
  const core = {
    schemaVersion: 1 as const,
    recordType:
      "body_free_os_role_receipt" as const,
    receiptId:
      `body-free-os.${input.config.role}.${input.config.mode}.${sha256Text(
        input.outputCommitments.join("\0"),
      ).slice(7, 23)}`,
    protocolId: requireString(
      input.config.protocolId,
      "protocolId",
    ),
    contractHash: input.contractHash,
    role: input.config.role,
    action: input.config.mode,
    process: processIdentity(),
    inputCommitments: [
      ...input.inputCommitments,
    ].sort(),
    outputCommitments: [
      ...input.outputCommitments,
    ].sort(),
    bodyPresent: false as const,
    verifierLogicPresent: false as const,
    labelsPresent: false as const,
    pathsPresent: false as const,
    bodyAccess:
      "none_in_body_free_contract_prototype" as const,
    occurredAt: input.config.timestamp,
    producer: input.signer.identity,
  };
  const publicPrincipal = input.signer.exportPublic();
  const signedBody = {
    ...core,
    receiptHash: sha256(core as unknown as JsonValue),
    publicPrincipal,
  };
  const receipt: BoundaryReceipt = {
    ...signedBody,
    attestation: input.signer.attest(
      signedBody as unknown as JsonValue,
    ),
  };
  input.schemas.validate(
    ROLE_RECEIPT_SCHEMA_ID,
    receipt as unknown as JsonValue,
  );
  await writeJson(
    "receipt.json",
    receipt as unknown as JsonValue,
  );
  return receipt;
}

async function freezeContract(
  config: WorkerConfiguration,
  signer: PrincipalSigner,
  schemas: SchemaRegistry,
): Promise<void> {
  const principals = await readInput<
    Readonly<Record<BoundaryRole, PublicPrincipal>>
  >("principals.json");
  const contract = createEvaluatorVaultContract({
    contractId: requireString(
      config.contractId,
      "contractId",
    ),
    protocolId: requireString(
      config.protocolId,
      "protocolId",
    ),
    principalMatrix: publicMatrix(principals),
    frozenAt: config.timestamp,
    signer,
    schemas,
  });
  await writeJson(
    "contract.json",
    contract as unknown as JsonValue,
  );
  const reviewerProjection =
    createBlindedReviewerContractProjection({
      contract,
      issuedAt: config.timestamp,
      signer,
      schemas,
    });
  await writeJson(
    "reviewer-projection.json",
    reviewerProjection as unknown as JsonValue,
  );
  await createReceipt({
    config,
    schemas,
    signer,
    contractHash: contract.contractHash,
    inputCommitments: principalsToCommitments(principals),
    outputCommitments: [
      contract.contractHash,
      reviewerProjection.projectionHash,
    ],
  });
}

function principalsToCommitments(
  principals: Readonly<Record<BoundaryRole, PublicPrincipal>>,
): readonly string[] {
  return ROLE_NAMES.map(
    (role) =>
      principals[role].identity.identityDigest,
  );
}

async function assign(
  config: WorkerConfiguration,
  signer: PrincipalSigner,
  schemas: SchemaRegistry,
): Promise<void> {
  const contract =
    await readInput<EvaluatorVaultContract>(
      "contract.json",
    );
  const policy = await loadHistoricalPolicy(schemas);
  const transition =
    createIndependentAuthorshipTransition({
      transitionId: "body-free-os.authorship.assign",
      workflowId: requireString(
        config.workflowId,
        "workflowId",
      ),
      taskHandle: requireString(
        config.taskHandle,
        "taskHandle",
      ),
      action: "assign",
      previous: null,
      assignmentMetadata: assignedMetadata(),
      occurredAt: config.timestamp,
      signer,
      contract,
      schemas,
      historicalPolicy: policy,
    });
  await writeJson(
    "assigned.json",
    transition as unknown as JsonValue,
  );
  await createReceipt({
    config,
    schemas,
    signer,
    contractHash: contract.contractHash,
    inputCommitments: [contract.contractHash],
    outputCommitments: [transition.recordHash],
  });
}

async function commitAuthorship(
  config: WorkerConfiguration,
  signer: PrincipalSigner,
  schemas: SchemaRegistry,
): Promise<void> {
  const [contract, assigned] = await Promise.all([
    readInput<EvaluatorVaultContract>("contract.json"),
    readInput<IndependentAuthorshipTransition>(
      "assigned.json",
    ),
  ]);
  const policy = await loadHistoricalPolicy(schemas);
  const transition =
    createIndependentAuthorshipTransition({
      transitionId: "body-free-os.authorship.commit",
      workflowId: assigned.workflowId,
      taskHandle: assigned.taskHandle,
      action: "commit",
      previous: assigned,
      commitMetadata: committedMetadata(
        assigned.workflowId,
      ),
      occurredAt: config.timestamp,
      signer,
      contract,
      schemas,
      historicalPolicy: policy,
    });
  await writeJson(
    "committed.json",
    transition as unknown as JsonValue,
  );
  await createReceipt({
    config,
    schemas,
    signer,
    contractHash: contract.contractHash,
    inputCommitments: [
      contract.contractHash,
      assigned.recordHash,
    ],
    outputCommitments: [transition.recordHash],
  });
}

async function blind(
  config: WorkerConfiguration,
  signer: PrincipalSigner,
  schemas: SchemaRegistry,
): Promise<void> {
  const [contract, assigned, committed] =
    await Promise.all([
      readInput<EvaluatorVaultContract>("contract.json"),
      readInput<IndependentAuthorshipTransition>(
        "assigned.json",
      ),
      readInput<IndependentAuthorshipTransition>(
        "committed.json",
      ),
    ]);
  const policy = await loadHistoricalPolicy(schemas);
  const review = createBlindedAuthorshipReview({
    reviewPacketId:
      "body-free-os.authorship.blinded-review",
    assigned,
    committed,
    issuedAt: config.timestamp,
    signer,
    contract,
    schemas,
    historicalPolicy: policy,
  });
  const transition =
    createIndependentAuthorshipTransition({
      transitionId: "body-free-os.authorship.blind",
      workflowId: committed.workflowId,
      taskHandle: committed.taskHandle,
      action: "begin_blinded_review",
      previous: committed,
      review,
      occurredAt: config.timestamp,
      signer,
      contract,
      schemas,
      historicalPolicy: policy,
    });
  await writeJson(
    "review.json",
    review as unknown as JsonValue,
  );
  await writeJson(
    "under-review.json",
    transition as unknown as JsonValue,
  );
  await createReceipt({
    config,
    schemas,
    signer,
    contractHash: contract.contractHash,
    inputCommitments: [
      assigned.recordHash,
      committed.recordHash,
    ],
    outputCommitments: [
      review.recordHash,
      transition.recordHash,
    ],
  });
}

async function decide(
  config: WorkerConfiguration,
  signer: PrincipalSigner,
  schemas: SchemaRegistry,
): Promise<void> {
  const [projection, review] = await Promise.all([
    readInput<BlindedReviewerContractProjection>(
      "reviewer-projection.json",
    ),
    readInput<BlindedAuthorshipReview>("review.json"),
  ]);
  const decision =
    createBlindedAuthorshipDecisionFromProjection({
    decisionId:
      "body-free-os.authorship.include-decision",
    review,
    decision: "include",
    decidedAt: config.timestamp,
    signer,
    projection,
    expectedProtocolAuthor:
      projection.publicPrincipal,
    schemas,
  });
  await writeJson(
    "decision.json",
    decision as unknown as JsonValue,
  );
  await createReceipt({
    config,
    schemas,
    signer,
    contractHash: projection.contractHash,
    inputCommitments: [
      projection.projectionHash,
      review.recordHash,
    ],
    outputCommitments: [decision.recordHash],
  });
}

async function include(
  config: WorkerConfiguration,
  signer: PrincipalSigner,
  schemas: SchemaRegistry,
): Promise<void> {
  const [
    contract,
    review,
    underReview,
    decision,
  ] = await Promise.all([
    readInput<EvaluatorVaultContract>("contract.json"),
    readInput<BlindedAuthorshipReview>("review.json"),
    readInput<IndependentAuthorshipTransition>(
      "under-review.json",
    ),
    readInput<BlindedAuthorshipDecision>(
      "decision.json",
    ),
  ]);
  const policy = await loadHistoricalPolicy(schemas);
  const transition =
    createIndependentAuthorshipTransition({
      transitionId: "body-free-os.authorship.include",
      workflowId: underReview.workflowId,
      taskHandle: underReview.taskHandle,
      action: "include",
      previous: underReview,
      review,
      decision,
      occurredAt: config.timestamp,
      signer,
      contract,
      schemas,
      historicalPolicy: policy,
    });
  await writeJson(
    "included.json",
    transition as unknown as JsonValue,
  );
  await createReceipt({
    config,
    schemas,
    signer,
    contractHash: contract.contractHash,
    inputCommitments: [
      underReview.recordHash,
      decision.recordHash,
    ],
    outputCommitments: [transition.recordHash],
  });
}

async function signRequest(
  config: WorkerConfiguration,
  signer: PrincipalSigner,
  schemas: SchemaRegistry,
): Promise<void> {
  const contract =
    await readInput<EvaluatorVaultContract>(
      "contract.json",
    );
  let capability: OpaqueTaskCapability | null = null;
  try {
    capability =
      await readInput<OpaqueTaskCapability>(
        "capability.json",
      );
  } catch (error) {
    if (
      !(
        error instanceof Error &&
        "code" in error &&
        error.code === "ENOENT"
      )
    ) {
      throw error;
    }
  }
  if (
    capability !== null &&
    config.capabilityMutation === "substitute"
  ) {
    capability = {
      ...capability,
      capabilityId:
        `${capability.capabilityId}.substituted`,
    };
  }
  const request = createVaultAccessRequest({
    requestId: requireString(
      config.requestId,
      "requestId",
    ),
    ...(config.protocolOverride === undefined
      ? {}
      : { protocolId: config.protocolOverride }),
    action: requireString(
      config.action,
      "action",
    ) as VaultAction,
    taskHandle: config.taskHandle ?? null,
    ...(capability === null
      ? {}
      : { capability }),
    subjectCommitment:
      config.subjectCommitment ?? null,
    senderSequence: requireNumber(
      config.senderSequence,
      "senderSequence",
    ),
    nonce: requireString(config.nonce, "nonce"),
    requestedAt: config.timestamp,
    signer,
    contract,
    schemas,
  });
  await writeJson(
    "request.json",
    request as unknown as JsonValue,
  );
  await createReceipt({
    config,
    schemas,
    signer,
    contractHash: contract.contractHash,
    inputCommitments: [
      contract.contractHash,
      ...(capability === null
        ? []
        : [capability.capabilityHash]),
      ...(config.subjectCommitment === undefined ||
      config.subjectCommitment === null
        ? []
        : [config.subjectCommitment]),
    ],
    outputCommitments: [request.requestHash],
  });
}

async function loadVault(input: {
  readonly config: WorkerConfiguration;
  readonly signer: PrincipalSigner;
  readonly schemas: SchemaRegistry;
}): Promise<EvaluatorVault> {
  const [contract, included, previous] =
    await Promise.all([
      readInput<EvaluatorVaultContract>("contract.json"),
      readInput<IndependentAuthorshipTransition>(
        "included.json",
      ),
      readInput<IndependentAuthorshipTransition>(
        "under-review.json",
      ),
    ]);
  const historicalPolicy =
    await loadHistoricalPolicy(input.schemas);
  return new EvaluatorVault({
    root: VAULT_STATE,
    contract,
    schemas: input.schemas,
    vaultSigner: input.signer,
    historicalPolicy,
    authorshipAdmissions: [
      { included, previous },
    ],
    ...(input.config.leaseOwnerId === undefined
      ? {}
      : {
          leaseOwnerId: input.config.leaseOwnerId,
        }),
    ...(input.config.leaseTtlMillis === undefined
      ? {}
      : {
          leaseTtlMillis:
            input.config.leaseTtlMillis,
        }),
    ...(input.config.crashPhase === undefined
      ? {}
      : {
          crashInjector: (
            phase: VaultCrashPhase,
          ): void => {
            if (phase === input.config.crashPhase) {
              process.kill(process.pid, "SIGKILL");
            }
          },
        }),
  });
}

async function issueCapability(
  config: WorkerConfiguration,
  signer: PrincipalSigner,
  schemas: SchemaRegistry,
): Promise<void> {
  const vault = await loadVault({
    config,
    signer,
    schemas,
  });
  await vault.recover();
  const capability = vault.issueUnlockCapability({
    capabilityId:
      "body-free-os.unlock-capability.v1",
    taskHandle: requireString(
      config.taskHandle,
      "taskHandle",
    ),
    issuedAt: config.timestamp,
    expiresAt: "2026-07-31T23:59:59.000Z",
    nonce: "body-free-os-capability-nonce-0001",
  });
  await writeJson(
    "capability.json",
    capability as unknown as JsonValue,
  );
  await createReceipt({
    config,
    schemas,
    signer,
    contractHash: capability.contractHash,
    inputCommitments: [
      capability.authorshipRecordHash,
    ],
    outputCommitments: [capability.capabilityHash],
  });
}

async function processRequest(
  config: WorkerConfiguration,
  signer: PrincipalSigner,
  schemas: SchemaRegistry,
): Promise<void> {
  const [contract, request] = await Promise.all([
    readInput<EvaluatorVaultContract>("contract.json"),
    readInput<VaultAccessRequest>("request.json"),
  ]);
  const vault = await loadVault({
    config,
    signer,
    schemas,
  });
  let outcome:
    | Awaited<ReturnType<EvaluatorVault["process"]>>
    | null = null;
  let failure:
    | {
        readonly code: string;
        readonly safeDetail: string;
      }
    | null = null;
  try {
    outcome = await vault.process(request);
  } catch (error) {
    if (error instanceof HarnessError) {
      failure = {
        code: error.code,
        safeDetail: error.safeDetail,
      };
    } else {
      throw error;
    }
  }
  const [journal, fences, authoritativeHead] =
    await Promise.all([
    vault.readStateJournal(),
    vault.readWriterFences(),
    vault.readAuthoritativeJournalHead(),
  ]);
  const requestCommitment = sha256(
    request as unknown as JsonValue,
  );
  const requestTransition =
    journal.find(
      (transition) =>
        transition.requestCommitment ===
        requestCommitment,
    ) ?? null;
  const result = {
    schemaVersion: 1,
    recordType: "body_free_os_vault_result",
    ok: failure === null,
    failure,
    outcome,
    requestCommitment,
    taskHandleCommitment:
      request.taskHandle === null
        ? null
        : sha256Text(request.taskHandle),
    taskState:
      request.taskHandle === null
        ? null
        : vault.taskState(request.taskHandle),
    transitionCount: journal.length,
    fenceCount: fences.length,
    stateHead: authoritativeHead,
    accessRecordHash:
      requestTransition?.accessRecord.recordHash ??
      null,
    process: processIdentity(),
  };
  schemas.validate(
    VAULT_RESULT_SCHEMA_ID,
    result as unknown as JsonValue,
  );
  await writeJson(
    "result.json",
    result as unknown as JsonValue,
  );
  await createReceipt({
    config,
    schemas,
    signer,
    contractHash: contract.contractHash,
    inputCommitments: [request.requestHash],
    outputCommitments: [
      ...(result.stateHead === null
        ? []
        : [result.stateHead]),
      ...(result.accessRecordHash === null
        ? []
        : [result.accessRecordHash]),
    ],
  });
}

async function promoterProjection(
  config: WorkerConfiguration,
  signer: PrincipalSigner,
  schemas: SchemaRegistry,
): Promise<void> {
  const contract =
    await readInput<EvaluatorVaultContract>(
      "contract.json",
    );
  schemas.validate(
    "https://self-evolving-harness.local/schemas/evaluator-vault-contract.schema.json",
    contract as unknown as JsonValue,
  );
  const scoreProjection = await readInput<{
    readonly scoreCommitment: string;
    readonly sourceAccessRecordHash: string;
  }>("score-projection.json");
  const core = {
    schemaVersion: 1,
    recordType:
      "body_free_promoter_projection" as const,
    protocolId: contract.protocolId,
    contractHash: contract.contractHash,
    scoreCommitment:
      scoreProjection.scoreCommitment,
    sourceAccessRecordHash:
      scoreProjection.sourceAccessRecordHash,
    rawTaskHandlePresent: false as const,
    vaultWriteCapabilityPresent: false as const,
    taskBodyPresent: false as const,
    observedAt: config.timestamp,
    observedBy: signer.identity,
  };
  const publicPrincipal = signer.exportPublic();
  const signedBody = {
    ...core,
    recordHash: sha256(core as unknown as JsonValue),
    publicPrincipal,
  };
  const projection = {
    ...signedBody,
    attestation: signer.attest(
      signedBody as unknown as JsonValue,
    ),
  };
  schemas.validate(
    PROMOTER_PROJECTION_SCHEMA_ID,
    projection as unknown as JsonValue,
  );
  await writeJson(
    "promoter-projection.json",
    projection as unknown as JsonValue,
  );
  await createReceipt({
    config,
    schemas,
    signer,
    contractHash: contract.contractHash,
    inputCommitments: [
      scoreProjection.scoreCommitment,
      scoreProjection.sourceAccessRecordHash,
    ],
    outputCommitments: [projection.recordHash],
  });
}

async function finalizeAudit(
  config: WorkerConfiguration,
  signer: PrincipalSigner,
  schemas: SchemaRegistry,
): Promise<void> {
  const contract =
    await readInput<EvaluatorVaultContract>(
      "contract.json",
    );
  schemas.validate(
    "https://self-evolving-harness.local/schemas/evaluator-vault-contract.schema.json",
    contract as unknown as JsonValue,
  );
  const summary = await readInput<{
    readonly stateHead: string;
    readonly accessRecordHashes: readonly string[];
    readonly roleReceiptHashes: readonly string[];
    readonly promoterProjectionHash: string;
  }>("audit-summary.json");
  const core = {
    schemaVersion: 1,
    recordType:
      "body_free_os_final_audit" as const,
    protocolId: contract.protocolId,
    contractHash: contract.contractHash,
    stateHead: summary.stateHead,
    accessRecordHashes: [
      ...summary.accessRecordHashes,
    ].sort(),
    roleReceiptHashes: [
      ...summary.roleReceiptHashes,
    ].sort(),
    promoterProjectionHash:
      summary.promoterProjectionHash,
    bodyPresent: false as const,
    verifierLogicPresent: false as const,
    labelsPresent: false as const,
    pathsPresent: false as const,
    providerUsed: false as const,
    researchEvidenceAuthorized: false as const,
    promotionAuthorized: false as const,
    finalizedAt: config.timestamp,
    finalizedBy: signer.identity,
  };
  const publicPrincipal = signer.exportPublic();
  const signedBody = {
    ...core,
    recordHash: sha256(core as unknown as JsonValue),
    publicPrincipal,
  };
  const audit = {
    ...signedBody,
    attestation: signer.attest(
      signedBody as unknown as JsonValue,
    ),
  };
  schemas.validate(
    FINAL_AUDIT_SCHEMA_ID,
    audit as unknown as JsonValue,
  );
  await writeJson(
    "final-audit.json",
    audit as unknown as JsonValue,
  );
  await createReceipt({
    config,
    schemas,
    signer,
    contractHash: contract.contractHash,
    inputCommitments: [
      summary.stateHead,
      ...summary.accessRecordHashes,
      ...summary.roleReceiptHashes,
      summary.promoterProjectionHash,
    ],
    outputCommitments: [audit.recordHash],
  });
}

async function main(): Promise<void> {
  const config = await loadConfiguration();
  if (!ROLE_NAMES.includes(config.role)) {
    throw new Error("unknown body-free OS role");
  }
  const [schemas, signer] = await Promise.all([
    SchemaRegistry.load(SCHEMAS),
    loadSigner(config),
  ]);
  if (
    config.signingPublicPath === undefined &&
    signer.identity.role !== config.role
  ) {
    throw new Error(
      `role key mismatch: ${config.role}/${signer.identity.role}`,
    );
  }
  switch (config.mode) {
    case "freeze_contract":
      await freezeContract(config, signer, schemas);
      break;
    case "assign":
      await assign(config, signer, schemas);
      break;
    case "commit":
      await commitAuthorship(config, signer, schemas);
      break;
    case "blind":
      await blind(config, signer, schemas);
      break;
    case "decide":
      await decide(config, signer, schemas);
      break;
    case "include":
      await include(config, signer, schemas);
      break;
    case "sign_request":
      await signRequest(config, signer, schemas);
      break;
    case "issue_capability":
      await issueCapability(config, signer, schemas);
      break;
    case "process_request":
      await processRequest(config, signer, schemas);
      break;
    case "promoter_projection":
      await promoterProjection(config, signer, schemas);
      break;
    case "finalize_audit":
      await finalizeAudit(config, signer, schemas);
      break;
  }
}

await main();
