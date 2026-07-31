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
  PrincipalRegistry,
  type Attestation,
  type PrincipalIdentity,
  type PrincipalRole,
  type PrincipalSigner,
  type PublicPrincipal,
} from "./identity.js";

export const EVALUATOR_VAULT_CONTRACT_SCHEMA_ID =
  `${SCHEMA_BASE_URL}evaluator-vault-contract.schema.json`;

export const HISTORICAL_EXPOSURE_LEDGER_HASH =
  "sha256:52d22b10543d23fa0f7d268de029514c7ab8e62a3ab39277ade4d0c37da1e035";

export type VaultAction =
  | "create"
  | "seal"
  | "enumerate"
  | "unlock"
  | "evaluate"
  | "score"
  | "audit";

export interface VaultPrincipalMatrix {
  readonly benchmarkAuthor: PublicPrincipal;
  readonly benchmarkReviewer: PublicPrincipal;
  readonly vault: PublicPrincipal;
  readonly evaluator: PublicPrincipal;
  readonly scorer: PublicPrincipal;
  readonly promoter: PublicPrincipal;
  readonly audit: PublicPrincipal;
  readonly protocolAuthor: PublicPrincipal;
}

export interface VaultMountSet {
  readonly osIdentityClass:
    "distinct_subordinate_identity";
  readonly readOnly: readonly string[];
  readonly writeOnly: readonly string[];
  readonly appendOnly: readonly string[];
  readonly denied: readonly string[];
  readonly taskBodyAccess:
    "contract_only_not_exercised";
}

export type VaultMountPolicy = Readonly<
  Record<keyof VaultPrincipalMatrix, VaultMountSet>
>;

export interface VaultActionAuthority {
  readonly action: VaultAction;
  readonly allowedRoles: readonly PrincipalRole[];
}

export const EVALUATOR_VAULT_MOUNT_POLICY:
  VaultMountPolicy = Object.freeze({
    benchmarkAuthor: {
      osIdentityClass: "distinct_subordinate_identity",
      readOnly: [
        "contract/authorship",
        "governance/public-exposure-head",
      ],
      writeOnly: ["staging/author-commitments"],
      appendOnly: ["logs/authorship-author"],
      denied: [
        "vault/private",
        "evaluation/results",
        "promotion/registry",
      ],
      taskBodyAccess: "contract_only_not_exercised",
    },
    benchmarkReviewer: {
      osIdentityClass: "distinct_subordinate_identity",
      readOnly: ["review/blinded-commitments"],
      writeOnly: ["review/decisions"],
      appendOnly: ["logs/authorship-reviewer"],
      denied: [
        "authorship/author-identity",
        "vault/private",
        "evaluation/results",
      ],
      taskBodyAccess: "contract_only_not_exercised",
    },
    vault: {
      osIdentityClass: "distinct_subordinate_identity",
      readOnly: [
        "contract/vault",
        "staging/included-commitments",
        "governance/public-exposure-ledger",
      ],
      writeOnly: ["vault/private"],
      appendOnly: ["logs/vault-access"],
      denied: [
        "candidate/registry",
        "provider/credentials",
        "promotion/registry",
      ],
      taskBodyAccess: "contract_only_not_exercised",
    },
    evaluator: {
      osIdentityClass: "distinct_subordinate_identity",
      readOnly: [
        "contract/evaluator",
        "vault/one-time-unlock",
        "harness/exact-closure",
      ],
      writeOnly: ["evaluation/result-staging"],
      appendOnly: ["logs/evaluator-receipts"],
      denied: [
        "authorship/author-identity",
        "scoring/results",
        "promotion/registry",
      ],
      taskBodyAccess: "contract_only_not_exercised",
    },
    scorer: {
      osIdentityClass: "distinct_subordinate_identity",
      readOnly: [
        "contract/scorer",
        "evaluation/outcome-commitments",
      ],
      writeOnly: ["scoring/result-staging"],
      appendOnly: ["logs/scorer-receipts"],
      denied: [
        "vault/private",
        "authorship/author-identity",
        "candidate/registry",
      ],
      taskBodyAccess: "contract_only_not_exercised",
    },
    promoter: {
      osIdentityClass: "distinct_subordinate_identity",
      readOnly: [
        "contract/promotion",
        "scoring/aggregate-commitments",
      ],
      writeOnly: [],
      appendOnly: ["logs/promotion-decisions"],
      denied: [
        "vault/private",
        "authorship/author-identity",
        "evaluation/task-handles",
      ],
      taskBodyAccess: "contract_only_not_exercised",
    },
    audit: {
      osIdentityClass: "distinct_subordinate_identity",
      readOnly: [
        "contract/audit",
        "keys/public-principals",
      ],
      writeOnly: [],
      appendOnly: ["logs/audit"],
      denied: [
        "vault/private",
        "provider/credentials",
        "candidate/worktrees",
      ],
      taskBodyAccess: "contract_only_not_exercised",
    },
    protocolAuthor: {
      osIdentityClass: "distinct_subordinate_identity",
      readOnly: [
        "contract/reviewed-inputs",
        "keys/public-principals",
      ],
      writeOnly: ["contract/freeze-staging"],
      appendOnly: ["logs/protocol-freeze"],
      denied: [
        "vault/private",
        "evaluation/results",
        "promotion/registry",
      ],
      taskBodyAccess: "contract_only_not_exercised",
    },
  });

export const EVALUATOR_VAULT_ACTION_AUTHORITY:
  readonly VaultActionAuthority[] = Object.freeze([
    {
      action: "audit",
      allowedRoles: ["audit_store"],
    },
    {
      action: "create",
      allowedRoles: ["benchmark_author"],
    },
    {
      action: "enumerate",
      allowedRoles: ["vault"],
    },
    {
      action: "evaluate",
      allowedRoles: ["evaluator"],
    },
    {
      action: "score",
      allowedRoles: ["scorer"],
    },
    {
      action: "seal",
      allowedRoles: ["vault"],
    },
    {
      action: "unlock",
      allowedRoles: ["evaluator"],
    },
  ]);

export interface EvaluatorVaultContract {
  readonly schemaVersion: 1;
  readonly contractId: string;
  readonly recordType: "evaluator_vault_contract";
  readonly protocolId: string;
  readonly historicalExposureLedgerHash: string;
  readonly syntheticMetadataOnly: true;
  readonly taskBodiesPresent: false;
  readonly principalMatrix: VaultPrincipalMatrix;
  readonly keyPolicy: {
    readonly distinctPrincipalIds: true;
    readonly distinctInstanceIds: true;
    readonly distinctIdentityDigests: true;
    readonly distinctKeyIds: true;
    readonly privateKeysPersistedInContract: false;
    readonly crossRoleSigningAllowed: false;
  };
  readonly mountPolicy: VaultMountPolicy;
  readonly actionAuthority:
    readonly VaultActionAuthority[];
  readonly handlePolicy: {
    readonly format: "opaque-task-sha256:<64-lower-hex>";
    readonly contentDerived: false;
    readonly revealsPath: false;
    readonly revealsLabel: false;
    readonly revealsTaskBody: false;
    readonly singleUseUnlockCapability: true;
    readonly capabilityBoundToEvaluator: true;
    readonly capabilityBoundToProtocol: true;
  };
  readonly releasePolicy: {
    readonly oneWay: true;
    readonly authorReceivesRunResults: false;
    readonly vaultReceivesCandidateIdentity: false;
    readonly evaluatorReceivesScore: false;
    readonly scorerReceivesTaskBody: false;
    readonly promoterReceivesTaskHandle: false;
    readonly deniedAttemptReleasesFields: 0;
  };
  readonly accessLedgerPolicy: {
    readonly appendOnly: true;
    readonly hashChained: true;
    readonly vaultSigned: true;
    readonly recordsAllowedAttempts: true;
    readonly recordsDeniedAttempts: true;
    readonly recordsObservedAndClaimedRequestHashes: true;
    readonly replayFailsClosed: true;
    readonly substitutionFailsClosed: true;
    readonly earlyAccessFailsClosed: true;
    readonly protocolMismatchFailsClosed: true;
  };
  readonly frozenAt: string;
  readonly frozenBy: PrincipalIdentity;
  readonly contractHash: string;
  readonly publicPrincipal: PublicPrincipal;
  readonly attestation: Attestation;
}

type ContractCore = Omit<
  EvaluatorVaultContract,
  "contractHash" | "publicPrincipal" | "attestation"
>;
type ContractSignedBody = Omit<
  EvaluatorVaultContract,
  "attestation"
>;

function contractCore(
  record: EvaluatorVaultContract,
): ContractCore {
  const {
    contractHash: _contractHash,
    publicPrincipal: _publicPrincipal,
    attestation: _attestation,
    ...core
  } = record;
  return core;
}

function contractSignedBody(
  record: EvaluatorVaultContract,
): ContractSignedBody {
  const { attestation: _attestation, ...body } = record;
  return body;
}

function matrixPrincipals(
  matrix: VaultPrincipalMatrix,
): readonly PublicPrincipal[] {
  return [
    matrix.benchmarkAuthor,
    matrix.benchmarkReviewer,
    matrix.vault,
    matrix.evaluator,
    matrix.scorer,
    matrix.promoter,
    matrix.audit,
    matrix.protocolAuthor,
  ];
}

function assertUnique(
  values: readonly string[],
  label: string,
): void {
  assertCondition(
    values.length === new Set(values).size,
    "SCHEMA_INVALID",
    `Evaluator-vault contract requires distinct ${label}`,
  );
}

function assertPrincipalMatrix(
  matrix: VaultPrincipalMatrix,
): void {
  const expectedRoles: Readonly<
    Record<keyof VaultPrincipalMatrix, PrincipalRole>
  > = {
    benchmarkAuthor: "benchmark_author",
    benchmarkReviewer: "benchmark_reviewer",
    vault: "vault",
    evaluator: "evaluator",
    scorer: "scorer",
    promoter: "promoter",
    audit: "audit_store",
    protocolAuthor: "protocol_author",
  };
  for (const key of Object.keys(
    expectedRoles,
  ) as (keyof VaultPrincipalMatrix)[]) {
    assertCondition(
      matrix[key].identity.role === expectedRoles[key],
      "AUTHORIZATION_DENIED",
      `${key} has the wrong principal role`,
    );
  }
  const principals = matrixPrincipals(matrix);
  assertUnique(
    principals.map((entry) => entry.identity.principalId),
    "principal IDs",
  );
  assertUnique(
    principals.map((entry) => entry.identity.instanceId),
    "principal instance IDs",
  );
  assertUnique(
    principals.map(
      (entry) => entry.identity.identityDigest,
    ),
    "principal identity digests",
  );
  assertUnique(
    principals.map((entry) => entry.keyId),
    "principal key IDs",
  );
  const registry = new PrincipalRegistry();
  for (const principal of principals) {
    registry.register(principal);
  }
}

export function createEvaluatorVaultContract(input: {
  readonly contractId: string;
  readonly protocolId: string;
  readonly principalMatrix: VaultPrincipalMatrix;
  readonly frozenAt: string;
  readonly signer: PrincipalSigner;
  readonly schemas: SchemaRegistry;
}): EvaluatorVaultContract {
  assertCondition(
    input.signer.identity.role === "protocol_author",
    "AUTHORIZATION_DENIED",
    "Only the protocol author may freeze the evaluator-vault contract",
  );
  assertPrincipalMatrix(input.principalMatrix);
  assertCondition(
    canonicalize(
      input.signer.exportPublic() as unknown as JsonValue,
    ) ===
      canonicalize(
        input.principalMatrix
          .protocolAuthor as unknown as JsonValue,
      ),
    "AUTHENTICATION_FAILED",
    "Contract signer is not the frozen protocol author",
  );
  const core: ContractCore = {
    schemaVersion: 1,
    contractId: input.contractId,
    recordType: "evaluator_vault_contract",
    protocolId: input.protocolId,
    historicalExposureLedgerHash:
      HISTORICAL_EXPOSURE_LEDGER_HASH,
    syntheticMetadataOnly: true,
    taskBodiesPresent: false,
    principalMatrix: input.principalMatrix,
    keyPolicy: {
      distinctPrincipalIds: true,
      distinctInstanceIds: true,
      distinctIdentityDigests: true,
      distinctKeyIds: true,
      privateKeysPersistedInContract: false,
      crossRoleSigningAllowed: false,
    },
    mountPolicy: EVALUATOR_VAULT_MOUNT_POLICY,
    actionAuthority:
      EVALUATOR_VAULT_ACTION_AUTHORITY,
    handlePolicy: {
      format: "opaque-task-sha256:<64-lower-hex>",
      contentDerived: false,
      revealsPath: false,
      revealsLabel: false,
      revealsTaskBody: false,
      singleUseUnlockCapability: true,
      capabilityBoundToEvaluator: true,
      capabilityBoundToProtocol: true,
    },
    releasePolicy: {
      oneWay: true,
      authorReceivesRunResults: false,
      vaultReceivesCandidateIdentity: false,
      evaluatorReceivesScore: false,
      scorerReceivesTaskBody: false,
      promoterReceivesTaskHandle: false,
      deniedAttemptReleasesFields: 0,
    },
    accessLedgerPolicy: {
      appendOnly: true,
      hashChained: true,
      vaultSigned: true,
      recordsAllowedAttempts: true,
      recordsDeniedAttempts: true,
      recordsObservedAndClaimedRequestHashes: true,
      replayFailsClosed: true,
      substitutionFailsClosed: true,
      earlyAccessFailsClosed: true,
      protocolMismatchFailsClosed: true,
    },
    frozenAt: input.frozenAt,
    frozenBy: input.signer.identity,
  };
  const publicPrincipal = input.signer.exportPublic();
  const body: ContractSignedBody = {
    ...core,
    contractHash: sha256(core as unknown as JsonValue),
    publicPrincipal,
  };
  const record: EvaluatorVaultContract = {
    ...body,
    attestation: input.signer.attest(
      body as unknown as JsonValue,
    ),
  };
  verifyEvaluatorVaultContract({
    record,
    schemas: input.schemas,
  });
  return record;
}

export function verifyEvaluatorVaultContract(input: {
  readonly record: EvaluatorVaultContract;
  readonly schemas: SchemaRegistry;
}): void {
  input.schemas.validate(
    EVALUATOR_VAULT_CONTRACT_SCHEMA_ID,
    input.record as unknown as JsonValue,
  );
  assertPrincipalMatrix(input.record.principalMatrix);
  assertCondition(
    input.record.historicalExposureLedgerHash ===
      HISTORICAL_EXPOSURE_LEDGER_HASH &&
      canonicalize(
        input.record.mountPolicy as unknown as JsonValue,
      ) ===
        canonicalize(
          EVALUATOR_VAULT_MOUNT_POLICY as unknown as JsonValue,
        ) &&
      canonicalize(
        input.record
          .actionAuthority as unknown as JsonValue,
      ) ===
        canonicalize(
          EVALUATOR_VAULT_ACTION_AUTHORITY as unknown as JsonValue,
        ),
    "HASH_MISMATCH",
    "Evaluator-vault immutable policy changed",
  );
  assertCondition(
    canonicalize(
      input.record.frozenBy as unknown as JsonValue,
    ) ===
      canonicalize(
        input.record.principalMatrix.protocolAuthor
          .identity as unknown as JsonValue,
      ) &&
      canonicalize(
        input.record.publicPrincipal as unknown as JsonValue,
      ) ===
        canonicalize(
          input.record.principalMatrix
            .protocolAuthor as unknown as JsonValue,
        ) &&
      input.record.contractHash ===
        sha256(
          contractCore(
            input.record,
          ) as unknown as JsonValue,
        ),
    "HASH_MISMATCH",
    "Evaluator-vault contract identity or hash changed",
  );
  const principals = new PrincipalRegistry();
  principals.register(input.record.publicPrincipal);
  principals.verify(
    input.record.frozenBy,
    contractSignedBody(
      input.record,
    ) as unknown as JsonValue,
    input.record.attestation,
  );
}

export function allowedRolesForVaultAction(
  action: VaultAction,
): readonly PrincipalRole[] {
  return EVALUATOR_VAULT_ACTION_AUTHORITY.find(
    (entry) => entry.action === action,
  )!.allowedRoles;
}
