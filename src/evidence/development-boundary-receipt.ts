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
} from "../trust/identity.js";

export const DEVELOPMENT_BOUNDARY_RECEIPT_SCHEMA_ID =
  `${SCHEMA_BASE_URL}development-boundary-receipt.schema.json`;

export const DEVELOPMENT_BOUNDARY_ROLE_NAMES = [
  "attributor",
  "prediction_committer",
  "scorer",
  "mutation_proposer",
  "candidate_quarantine",
  "runtime",
  "candidate_evaluator",
  "audit",
] as const;

export const DEVELOPMENT_BOUNDARY_ACTIONS = [
  "attribute",
  "commit_predictions",
  "seal_predictions",
  "score_predictions",
  "propose_mutation",
  "quarantine_candidate",
  "execute_synthetic_pair",
  "evaluate_synthetic_pair",
  "finalize_evidence",
] as const;

export type DevelopmentBoundaryRoleName =
  (typeof DEVELOPMENT_BOUNDARY_ROLE_NAMES)[number];
export type DevelopmentBoundaryAction =
  (typeof DEVELOPMENT_BOUNDARY_ACTIONS)[number];

export interface DevelopmentBoundaryReceipt {
  readonly schemaVersion: 1;
  readonly receiptId: string;
  readonly receiptType: "development_boundary_role_execution";
  readonly roleName: DevelopmentBoundaryRoleName;
  readonly action: DevelopmentBoundaryAction;
  readonly process: {
    readonly uid: number;
    readonly gid: number;
    readonly isolationClass:
      | "local_process"
      | "os_enforced_subordinate_uid";
  };
  readonly inputHashes: readonly string[];
  readonly outputHashes: readonly string[];
  readonly accessibleMountClasses: readonly string[];
  readonly absentCapabilityClasses: readonly string[];
  readonly success: true;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly developmentOnly: true;
  readonly authorizedForResearchEvidence: false;
  readonly producer: PrincipalIdentity;
  readonly receiptHash: string;
  readonly publicPrincipal: PublicPrincipal;
  readonly attestation: Attestation;
}

type ReceiptCore = Omit<
  DevelopmentBoundaryReceipt,
  "receiptHash" | "publicPrincipal" | "attestation"
>;
type SignedBody = Omit<
  DevelopmentBoundaryReceipt,
  "attestation"
>;

const ROLE_AUTHORITIES: Readonly<
  Record<DevelopmentBoundaryRoleName, PrincipalRole>
> = Object.freeze({
  attributor: "proposer",
  prediction_committer: "proposer",
  scorer: "evaluator",
  mutation_proposer: "proposer",
  candidate_quarantine: "operations_owner",
  runtime: "runtime",
  candidate_evaluator: "evaluator",
  audit: "audit_store",
});

function receiptCore(
  receipt: DevelopmentBoundaryReceipt,
): ReceiptCore {
  const {
    receiptHash: _receiptHash,
    publicPrincipal: _publicPrincipal,
    attestation: _attestation,
    ...core
  } = receipt;
  return core;
}

function signedBody(
  receipt: DevelopmentBoundaryReceipt,
): SignedBody {
  const { attestation: _attestation, ...body } = receipt;
  return body;
}

function sortedUnique(
  values: readonly string[],
  label: string,
): readonly string[] {
  const sorted = [...values].sort();
  assertCondition(
    sorted.length === new Set(sorted).size,
    "SCHEMA_INVALID",
    `Development boundary receipt has duplicate ${label}`,
  );
  return sorted;
}

function parseTime(value: string, label: string): number {
  const parsed = Date.parse(value);
  assertCondition(
    Number.isFinite(parsed),
    "SCHEMA_INVALID",
    `${label} is not a valid timestamp`,
  );
  return parsed;
}

export function createDevelopmentBoundaryReceipt(input: {
  readonly receiptId: string;
  readonly roleName: DevelopmentBoundaryRoleName;
  readonly action: DevelopmentBoundaryAction;
  readonly process: DevelopmentBoundaryReceipt["process"];
  readonly inputHashes: readonly string[];
  readonly outputHashes: readonly string[];
  readonly accessibleMountClasses: readonly string[];
  readonly absentCapabilityClasses: readonly string[];
  readonly startedAt: string;
  readonly completedAt: string;
  readonly signer: PrincipalSigner;
  readonly schemas: SchemaRegistry;
}): DevelopmentBoundaryReceipt {
  assertCondition(
    input.signer.identity.role ===
      ROLE_AUTHORITIES[input.roleName],
    "AUTHORIZATION_DENIED",
    `${input.roleName} receipt requires ${ROLE_AUTHORITIES[input.roleName]} authority`,
  );
  assertCondition(
    parseTime(input.completedAt, "completedAt") >=
      parseTime(input.startedAt, "startedAt"),
    "INVALID_STATE_TRANSITION",
    "Development role completion precedes its start",
  );
  const core: ReceiptCore = {
    schemaVersion: 1,
    receiptId: input.receiptId,
    receiptType: "development_boundary_role_execution",
    roleName: input.roleName,
    action: input.action,
    process: input.process,
    inputHashes: sortedUnique(
      input.inputHashes,
      "input hash",
    ),
    outputHashes: sortedUnique(
      input.outputHashes,
      "output hash",
    ),
    accessibleMountClasses: sortedUnique(
      input.accessibleMountClasses,
      "accessible mount class",
    ),
    absentCapabilityClasses: sortedUnique(
      input.absentCapabilityClasses,
      "absent capability class",
    ),
    success: true,
    startedAt: input.startedAt,
    completedAt: input.completedAt,
    developmentOnly: true,
    authorizedForResearchEvidence: false,
    producer: input.signer.identity,
  };
  const publicPrincipal = input.signer.exportPublic();
  const body: SignedBody = {
    ...core,
    receiptHash: sha256(core as unknown as JsonValue),
    publicPrincipal,
  };
  const receipt: DevelopmentBoundaryReceipt = {
    ...body,
    attestation: input.signer.attest(
      body as unknown as JsonValue,
    ),
  };
  verifyDevelopmentBoundaryReceipt({
    receipt,
    schemas: input.schemas,
  });
  return receipt;
}

export function verifyDevelopmentBoundaryReceipt(input: {
  readonly receipt: DevelopmentBoundaryReceipt;
  readonly schemas: SchemaRegistry;
}): void {
  input.schemas.validate(
    DEVELOPMENT_BOUNDARY_RECEIPT_SCHEMA_ID,
    input.receipt as unknown as JsonValue,
  );
  assertCondition(
    input.receipt.producer.role ===
      ROLE_AUTHORITIES[input.receipt.roleName] &&
      canonicalize(input.receipt.publicPrincipal.identity) ===
        canonicalize(input.receipt.producer),
    "AUTHORIZATION_DENIED",
    "Development boundary receipt has the wrong role authority",
  );
  assertCondition(
    parseTime(input.receipt.completedAt, "completedAt") >=
      parseTime(input.receipt.startedAt, "startedAt") &&
      canonicalize(input.receipt.inputHashes) ===
        canonicalize(
          [...input.receipt.inputHashes].sort(),
        ) &&
      canonicalize(input.receipt.outputHashes) ===
        canonicalize(
          [...input.receipt.outputHashes].sort(),
        ) &&
      input.receipt.receiptHash ===
        sha256(
          receiptCore(input.receipt) as unknown as JsonValue,
        ),
    "HASH_MISMATCH",
    "Development boundary receipt changed",
  );
  const principals = new PrincipalRegistry();
  principals.register(input.receipt.publicPrincipal);
  principals.verify(
    input.receipt.producer,
    signedBody(input.receipt) as unknown as JsonValue,
    input.receipt.attestation,
  );
}
