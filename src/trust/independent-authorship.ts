import path from "node:path";

import {
  canonicalize,
  sha256,
  sha256Text,
  type JsonValue,
} from "../core/canonical.js";
import { assertCondition } from "../core/errors.js";
import {
  SCHEMA_BASE_URL,
  type SchemaRegistry,
} from "../contracts/schema-registry.js";
import {
  AppendOnlyLog,
  type AppendOnlyRecord,
} from "../storage/append-only-log.js";
import {
  PUBLIC_EXPOSURE_RESTRICTED_USES,
  type PublicExposureGraphNode,
} from "../governance/publication-exposure.js";
import {
  HistoricalPublicExposurePolicy,
} from "../governance/historical-publication-exposure.js";
import {
  PrincipalRegistry,
  type Attestation,
  type PrincipalIdentity,
  type PrincipalSigner,
  type PublicPrincipal,
} from "./identity.js";
import {
  HISTORICAL_EXPOSURE_LEDGER_HASH,
  verifyEvaluatorVaultContract,
  type EvaluatorVaultContract,
} from "./evaluator-vault-contract.js";

export const INDEPENDENT_AUTHORSHIP_TRANSITION_SCHEMA_ID =
  `${SCHEMA_BASE_URL}independent-authorship-transition.schema.json`;
export const BLINDED_AUTHORSHIP_REVIEW_SCHEMA_ID =
  `${SCHEMA_BASE_URL}blinded-authorship-review.schema.json`;
export const BLINDED_AUTHORSHIP_DECISION_SCHEMA_ID =
  `${SCHEMA_BASE_URL}blinded-authorship-decision.schema.json`;

export type AuthorshipState =
  | "assigned"
  | "committed"
  | "under_blinded_review"
  | "included"
  | "rejected";

export type AuthorshipAction =
  | "assign"
  | "commit"
  | "begin_blinded_review"
  | "include"
  | "reject";

export interface SyntheticContaminationNode {
  readonly nodeId: string;
  readonly contentHash: string | null;
  readonly gitObjectId: string | null;
  readonly aliases: readonly string[];
  readonly dependencies: readonly string[];
  readonly wrappers: readonly string[];
  readonly provenanceReferences: readonly string[];
}

export interface SyntheticContaminationDeclaration {
  readonly declaredClear: boolean;
  readonly publicExposureLedgerHash: string;
  readonly rootReferences: readonly string[];
  readonly nodes: readonly SyntheticContaminationNode[];
  readonly declarationHash: string;
}

export interface SyntheticAuthorshipMetadata {
  readonly contentCommitment: string | null;
  readonly verifierCommitment: string | null;
  readonly inclusionRuleHash: string;
  readonly collectionWindowHash: string;
  readonly contaminationDeclaration:
    SyntheticContaminationDeclaration;
  readonly bodyPresent: false;
  readonly verifierLogicPresent: false;
  readonly labelsPresent: false;
  readonly pathsPresent: false;
  readonly syntheticMetadataOnly: true;
}

export interface IndependentAuthorshipTransition {
  readonly schemaVersion: 1;
  readonly recordType:
    "independent_authorship_transition";
  readonly transitionId: string;
  readonly workflowId: string;
  readonly protocolId: string;
  readonly contractId: string;
  readonly contractHash: string;
  readonly taskHandle: string;
  readonly action: AuthorshipAction;
  readonly previousState: AuthorshipState | null;
  readonly nextState: AuthorshipState;
  readonly authorPrincipalId: string;
  readonly reviewerPrincipalId: string;
  readonly blindReviewId: string | null;
  readonly reviewPacketHash: string | null;
  readonly reviewDecision: "include" | "reject" | null;
  readonly rejectionReasonCommitment: string | null;
  readonly blindedReview: BlindedAuthorshipReview | null;
  readonly blindedDecision:
    BlindedAuthorshipDecision | null;
  readonly metadata: SyntheticAuthorshipMetadata;
  readonly priorRecordHash: string | null;
  readonly occurredAt: string;
  readonly actor: PrincipalIdentity;
  readonly recordHash: string;
  readonly publicPrincipal: PublicPrincipal;
  readonly attestation: Attestation;
}

export interface BlindedAuthorshipReview {
  readonly schemaVersion: 1;
  readonly recordType: "blinded_authorship_review";
  readonly reviewPacketId: string;
  readonly protocolId: string;
  readonly contractId: string;
  readonly contractHash: string;
  readonly workflowId: string;
  readonly taskHandleCommitment: string;
  readonly contentCommitment: string;
  readonly verifierCommitment: string;
  readonly inclusionRuleHash: string;
  readonly collectionWindowHash: string;
  readonly contaminationDeclarationHash: string;
  readonly authorIdentityIncluded: false;
  readonly taskHandleIncluded: false;
  readonly taskBodyIncluded: false;
  readonly verifierLogicIncluded: false;
  readonly labelsIncluded: false;
  readonly pathsIncluded: false;
  readonly issuedAt: string;
  readonly issuedBy: PrincipalIdentity;
  readonly recordHash: string;
  readonly publicPrincipal: PublicPrincipal;
  readonly attestation: Attestation;
}

export interface BlindedAuthorshipDecision {
  readonly schemaVersion: 1;
  readonly recordType:
    "blinded_authorship_decision";
  readonly decisionId: string;
  readonly protocolId: string;
  readonly contractId: string;
  readonly contractHash: string;
  readonly reviewPacketId: string;
  readonly reviewPacketHash: string;
  readonly decision: "include" | "reject";
  readonly rejectionReasonCommitment: string | null;
  readonly decidedAt: string;
  readonly decidedBy: PrincipalIdentity;
  readonly recordHash: string;
  readonly publicPrincipal: PublicPrincipal;
  readonly attestation: Attestation;
}

type DeclarationCore = Omit<
  SyntheticContaminationDeclaration,
  "declarationHash"
>;
type TransitionCore = Omit<
  IndependentAuthorshipTransition,
  "recordHash" | "publicPrincipal" | "attestation"
>;
type TransitionSignedBody = Omit<
  IndependentAuthorshipTransition,
  "attestation"
>;
type ReviewCore = Omit<
  BlindedAuthorshipReview,
  "recordHash" | "publicPrincipal" | "attestation"
>;
type ReviewSignedBody = Omit<
  BlindedAuthorshipReview,
  "attestation"
>;
type DecisionCore = Omit<
  BlindedAuthorshipDecision,
  "recordHash" | "publicPrincipal" | "attestation"
>;
type DecisionSignedBody = Omit<
  BlindedAuthorshipDecision,
  "attestation"
>;

function transitionCore(
  record: IndependentAuthorshipTransition,
): TransitionCore {
  const {
    recordHash: _recordHash,
    publicPrincipal: _publicPrincipal,
    attestation: _attestation,
    ...core
  } = record;
  return core;
}

function transitionSignedBody(
  record: IndependentAuthorshipTransition,
): TransitionSignedBody {
  const { attestation: _attestation, ...body } = record;
  return body;
}

function reviewCore(
  record: BlindedAuthorshipReview,
): ReviewCore {
  const {
    recordHash: _recordHash,
    publicPrincipal: _publicPrincipal,
    attestation: _attestation,
    ...core
  } = record;
  return core;
}

function reviewSignedBody(
  record: BlindedAuthorshipReview,
): ReviewSignedBody {
  const { attestation: _attestation, ...body } = record;
  return body;
}

function decisionCore(
  record: BlindedAuthorshipDecision,
): DecisionCore {
  const {
    recordHash: _recordHash,
    publicPrincipal: _publicPrincipal,
    attestation: _attestation,
    ...core
  } = record;
  return core;
}

function decisionSignedBody(
  record: BlindedAuthorshipDecision,
): DecisionSignedBody {
  const { attestation: _attestation, ...body } = record;
  return body;
}

function uniqueSorted(
  values: readonly string[],
  label: string,
): readonly string[] {
  const sorted = [...values].sort();
  assertCondition(
    sorted.length === new Set(sorted).size,
    "SCHEMA_INVALID",
    `Synthetic authorship has duplicate ${label}`,
  );
  return sorted;
}

function normalizeContaminationNode(
  node: SyntheticContaminationNode,
): SyntheticContaminationNode {
  return {
    nodeId: node.nodeId,
    contentHash: node.contentHash,
    gitObjectId: node.gitObjectId,
    aliases: uniqueSorted(node.aliases, "node aliases"),
    dependencies: uniqueSorted(
      node.dependencies,
      "node dependencies",
    ),
    wrappers: uniqueSorted(
      node.wrappers,
      "node wrappers",
    ),
    provenanceReferences: uniqueSorted(
      node.provenanceReferences,
      "node provenance references",
    ),
  };
}

function declarationCore(
  declaration: SyntheticContaminationDeclaration,
): DeclarationCore {
  const {
    declarationHash: _declarationHash,
    ...core
  } = declaration;
  return core;
}

export function createSyntheticContaminationDeclaration(
  input: {
    readonly declaredClear: boolean;
    readonly rootReferences: readonly string[];
    readonly nodes?: readonly SyntheticContaminationNode[];
  },
): SyntheticContaminationDeclaration {
  const nodes = (input.nodes ?? [])
    .map(normalizeContaminationNode)
    .sort((left, right) =>
      left.nodeId.localeCompare(right.nodeId),
    );
  assertCondition(
    nodes.length ===
      new Set(nodes.map((node) => node.nodeId)).size,
    "SCHEMA_INVALID",
    "Synthetic contamination nodes must have unique IDs",
  );
  const core: DeclarationCore = {
    declaredClear: input.declaredClear,
    publicExposureLedgerHash:
      HISTORICAL_EXPOSURE_LEDGER_HASH,
    rootReferences: uniqueSorted(
      input.rootReferences,
      "root references",
    ),
    nodes,
  };
  return {
    ...core,
    declarationHash: sha256(core as unknown as JsonValue),
  };
}

export function createSyntheticAuthorshipMetadata(input: {
  readonly contentCommitment: string | null;
  readonly verifierCommitment: string | null;
  readonly inclusionRuleHash: string;
  readonly collectionWindowHash: string;
  readonly contaminationDeclaration:
    SyntheticContaminationDeclaration;
}): SyntheticAuthorshipMetadata {
  return {
    ...input,
    bodyPresent: false,
    verifierLogicPresent: false,
    labelsPresent: false,
    pathsPresent: false,
    syntheticMetadataOnly: true,
  };
}

function assertDeclarationIntegrity(
  declaration: SyntheticContaminationDeclaration,
): void {
  const normalized =
    createSyntheticContaminationDeclaration({
      declaredClear: declaration.declaredClear,
      rootReferences: declaration.rootReferences,
      nodes: declaration.nodes,
    });
  assertCondition(
    canonicalize(
      normalized as unknown as JsonValue,
    ) ===
      canonicalize(
        declaration as unknown as JsonValue,
      ),
    "HASH_MISMATCH",
    "Synthetic contamination declaration changed",
  );
}

function policyNodes(
  nodes: readonly SyntheticContaminationNode[],
): readonly PublicExposureGraphNode[] {
  return nodes.map((node) => ({
    nodeId: node.nodeId,
    contentHash: node.contentHash,
    gitBlobId: node.gitObjectId,
    path: null,
    aliases: node.aliases,
    dependencies: node.dependencies,
    wrappers: node.wrappers,
    provenanceReferences: node.provenanceReferences,
  }));
}

export function assertSyntheticMetadataResearchEligible(
  input: {
    readonly metadata: SyntheticAuthorshipMetadata;
    readonly historicalPolicy:
      HistoricalPublicExposurePolicy;
  },
): void {
  const declaration =
    input.metadata.contaminationDeclaration;
  assertDeclarationIntegrity(declaration);
  assertCondition(
    declaration.declaredClear &&
      declaration.publicExposureLedgerHash ===
        HISTORICAL_EXPOSURE_LEDGER_HASH &&
      input.metadata.contentCommitment !== null &&
      input.metadata.verifierCommitment !== null &&
      declaration.rootReferences.includes(
        input.metadata.contentCommitment,
      ) &&
      declaration.rootReferences.includes(
        input.metadata.verifierCommitment,
      ),
    "AUTHORIZATION_DENIED",
    "Authorship metadata lacks a complete clear contamination declaration",
  );
  const nodes = policyNodes(declaration.nodes);
  for (const useClass of PUBLIC_EXPOSURE_RESTRICTED_USES) {
    const result =
      input.historicalPolicy.assertGraphAllowed({
        useClass,
        rootReferences: declaration.rootReferences,
        nodes,
      });
    assertCondition(
      result === null,
      "AUTHORIZATION_DENIED",
      `Synthetic authorship is contaminated for ${useClass}`,
    );
  }
}

function expectedActor(
  input: {
    readonly action: AuthorshipAction;
    readonly contract: EvaluatorVaultContract;
  },
): PublicPrincipal {
  switch (input.action) {
    case "assign":
      return input.contract.principalMatrix.protocolAuthor;
    case "commit":
      return input.contract.principalMatrix.benchmarkAuthor;
    case "begin_blinded_review":
      return input.contract.principalMatrix.vault;
    case "include":
    case "reject":
      return input.contract.principalMatrix.vault;
  }
}

function expectedTransition(input: {
  readonly action: AuthorshipAction;
  readonly previous:
    IndependentAuthorshipTransition | null;
}): {
  readonly previousState: AuthorshipState | null;
  readonly nextState: AuthorshipState;
} {
  const prior = input.previous?.nextState ?? null;
  const expected: Readonly<
    Record<
      AuthorshipAction,
      readonly [AuthorshipState | null, AuthorshipState]
    >
  > = {
    assign: [null, "assigned"],
    commit: ["assigned", "committed"],
    begin_blinded_review: [
      "committed",
      "under_blinded_review",
    ],
    include: ["under_blinded_review", "included"],
    reject: ["under_blinded_review", "rejected"],
  };
  const [previousState, nextState] =
    expected[input.action];
  assertCondition(
    prior === previousState,
    "INVALID_STATE_TRANSITION",
    `Cannot ${input.action} from ${String(prior)}`,
  );
  return { previousState, nextState };
}

function assertReviewMatches(input: {
  readonly review: BlindedAuthorshipReview;
  readonly transition: IndependentAuthorshipTransition;
}): void {
  const metadata = input.transition.metadata;
  assertCondition(
    input.review.protocolId ===
      input.transition.protocolId &&
      input.review.contractId ===
        input.transition.contractId &&
      input.review.contractHash ===
        input.transition.contractHash &&
      input.review.workflowId ===
        input.transition.workflowId &&
      input.review.taskHandleCommitment ===
        sha256Text(input.transition.taskHandle) &&
      input.review.contentCommitment ===
        metadata.contentCommitment &&
      input.review.verifierCommitment ===
        metadata.verifierCommitment &&
      input.review.inclusionRuleHash ===
        metadata.inclusionRuleHash &&
      input.review.collectionWindowHash ===
        metadata.collectionWindowHash &&
      input.review.contaminationDeclarationHash ===
        metadata.contaminationDeclaration
          .declarationHash,
    "HASH_MISMATCH",
    "Blinded review packet does not match the committed metadata",
  );
}

export function createBlindedAuthorshipReview(input: {
  readonly reviewPacketId: string;
  readonly assigned:
    IndependentAuthorshipTransition;
  readonly committed:
    IndependentAuthorshipTransition;
  readonly issuedAt: string;
  readonly signer: PrincipalSigner;
  readonly contract: EvaluatorVaultContract;
  readonly schemas: SchemaRegistry;
  readonly historicalPolicy:
    HistoricalPublicExposurePolicy;
}): BlindedAuthorshipReview {
  verifyIndependentAuthorshipTransition({
    record: input.committed,
    previous: input.assigned,
    contract: input.contract,
    schemas: input.schemas,
    historicalPolicy: input.historicalPolicy,
  });
  assertCondition(
    input.committed.nextState === "committed" &&
      input.committed.metadata.contentCommitment !==
        null &&
      input.committed.metadata.verifierCommitment !==
        null &&
      canonicalize(
        input.signer.exportPublic() as unknown as JsonValue,
      ) ===
        canonicalize(
          input.contract.principalMatrix
            .vault as unknown as JsonValue,
        ),
    "AUTHORIZATION_DENIED",
    "Only the frozen vault may blind a committed authorship record",
  );
  const metadata = input.committed.metadata;
  const core: ReviewCore = {
    schemaVersion: 1,
    recordType: "blinded_authorship_review",
    reviewPacketId: input.reviewPacketId,
    protocolId: input.contract.protocolId,
    contractId: input.contract.contractId,
    contractHash: input.contract.contractHash,
    workflowId: input.committed.workflowId,
    taskHandleCommitment: sha256Text(
      input.committed.taskHandle,
    ),
    contentCommitment: metadata.contentCommitment!,
    verifierCommitment:
      metadata.verifierCommitment!,
    inclusionRuleHash: metadata.inclusionRuleHash,
    collectionWindowHash:
      metadata.collectionWindowHash,
    contaminationDeclarationHash:
      metadata.contaminationDeclaration.declarationHash,
    authorIdentityIncluded: false,
    taskHandleIncluded: false,
    taskBodyIncluded: false,
    verifierLogicIncluded: false,
    labelsIncluded: false,
    pathsIncluded: false,
    issuedAt: input.issuedAt,
    issuedBy: input.signer.identity,
  };
  const publicPrincipal = input.signer.exportPublic();
  const body: ReviewSignedBody = {
    ...core,
    recordHash: sha256(core as unknown as JsonValue),
    publicPrincipal,
  };
  const record: BlindedAuthorshipReview = {
    ...body,
    attestation: input.signer.attest(
      body as unknown as JsonValue,
    ),
  };
  verifyBlindedAuthorshipReview({
    record,
    contract: input.contract,
    schemas: input.schemas,
  });
  assertReviewMatches({
    review: record,
    transition: input.committed,
  });
  return record;
}

export function verifyBlindedAuthorshipReview(input: {
  readonly record: BlindedAuthorshipReview;
  readonly contract: EvaluatorVaultContract;
  readonly schemas: SchemaRegistry;
}): void {
  verifyEvaluatorVaultContract({
    record: input.contract,
    schemas: input.schemas,
  });
  input.schemas.validate(
    BLINDED_AUTHORSHIP_REVIEW_SCHEMA_ID,
    input.record as unknown as JsonValue,
  );
  assertCondition(
    input.record.protocolId ===
      input.contract.protocolId &&
      input.record.contractId ===
        input.contract.contractId &&
      input.record.contractHash ===
        input.contract.contractHash &&
      canonicalize(
        input.record.issuedBy as unknown as JsonValue,
      ) ===
        canonicalize(
          input.contract.principalMatrix.vault
            .identity as unknown as JsonValue,
        ) &&
      canonicalize(
        input.record
          .publicPrincipal as unknown as JsonValue,
      ) ===
        canonicalize(
          input.contract.principalMatrix
            .vault as unknown as JsonValue,
        ) &&
      input.record.recordHash ===
        sha256(
          reviewCore(
            input.record,
          ) as unknown as JsonValue,
        ),
    "HASH_MISMATCH",
    "Blinded review identity, contract, or hash changed",
  );
  const principals = new PrincipalRegistry();
  principals.register(input.record.publicPrincipal);
  principals.verify(
    input.record.issuedBy,
    reviewSignedBody(
      input.record,
    ) as unknown as JsonValue,
    input.record.attestation,
  );
}

export function createBlindedAuthorshipDecision(input: {
  readonly decisionId: string;
  readonly review: BlindedAuthorshipReview;
  readonly decision: "include" | "reject";
  readonly rejectionReasonCommitment?: string | null;
  readonly decidedAt: string;
  readonly signer: PrincipalSigner;
  readonly contract: EvaluatorVaultContract;
  readonly schemas: SchemaRegistry;
}): BlindedAuthorshipDecision {
  verifyBlindedAuthorshipReview({
    record: input.review,
    contract: input.contract,
    schemas: input.schemas,
  });
  assertCondition(
    canonicalize(
      input.signer.exportPublic() as unknown as JsonValue,
    ) ===
      canonicalize(
        input.contract.principalMatrix
          .benchmarkReviewer as unknown as JsonValue,
      ),
    "AUTHENTICATION_FAILED",
    "Only the frozen blinded reviewer may decide authorship inclusion",
  );
  const rejectionReasonCommitment =
    input.rejectionReasonCommitment ?? null;
  assertCondition(
    (input.decision === "reject" &&
      rejectionReasonCommitment !== null) ||
      (input.decision === "include" &&
        rejectionReasonCommitment === null),
    "SCHEMA_INVALID",
    "Blinded decision and rejection commitment disagree",
  );
  const core: DecisionCore = {
    schemaVersion: 1,
    recordType: "blinded_authorship_decision",
    decisionId: input.decisionId,
    protocolId: input.contract.protocolId,
    contractId: input.contract.contractId,
    contractHash: input.contract.contractHash,
    reviewPacketId: input.review.reviewPacketId,
    reviewPacketHash: input.review.recordHash,
    decision: input.decision,
    rejectionReasonCommitment,
    decidedAt: input.decidedAt,
    decidedBy: input.signer.identity,
  };
  const publicPrincipal = input.signer.exportPublic();
  const body: DecisionSignedBody = {
    ...core,
    recordHash: sha256(core as unknown as JsonValue),
    publicPrincipal,
  };
  const record: BlindedAuthorshipDecision = {
    ...body,
    attestation: input.signer.attest(
      body as unknown as JsonValue,
    ),
  };
  verifyBlindedAuthorshipDecision({
    record,
    review: input.review,
    contract: input.contract,
    schemas: input.schemas,
  });
  return record;
}

export function verifyBlindedAuthorshipDecision(input: {
  readonly record: BlindedAuthorshipDecision;
  readonly review: BlindedAuthorshipReview;
  readonly contract: EvaluatorVaultContract;
  readonly schemas: SchemaRegistry;
}): void {
  verifyBlindedAuthorshipReview({
    record: input.review,
    contract: input.contract,
    schemas: input.schemas,
  });
  input.schemas.validate(
    BLINDED_AUTHORSHIP_DECISION_SCHEMA_ID,
    input.record as unknown as JsonValue,
  );
  assertCondition(
    input.record.protocolId ===
      input.contract.protocolId &&
      input.record.contractId ===
        input.contract.contractId &&
      input.record.contractHash ===
        input.contract.contractHash &&
      input.record.reviewPacketId ===
        input.review.reviewPacketId &&
      input.record.reviewPacketHash ===
        input.review.recordHash &&
      canonicalize(
        input.record.decidedBy as unknown as JsonValue,
      ) ===
        canonicalize(
          input.contract.principalMatrix
            .benchmarkReviewer.identity as unknown as JsonValue,
        ) &&
      canonicalize(
        input.record
          .publicPrincipal as unknown as JsonValue,
      ) ===
        canonicalize(
          input.contract.principalMatrix
            .benchmarkReviewer as unknown as JsonValue,
        ) &&
      input.record.recordHash ===
        sha256(
          decisionCore(
            input.record,
          ) as unknown as JsonValue,
        ),
    "HASH_MISMATCH",
    "Blinded authorship decision identity, review, or hash changed",
  );
  assertCondition(
    (input.record.decision === "reject" &&
      input.record.rejectionReasonCommitment !== null) ||
      (input.record.decision === "include" &&
        input.record.rejectionReasonCommitment === null),
    "SCHEMA_INVALID",
    "Blinded authorship decision fields disagree",
  );
  const principals = new PrincipalRegistry();
  principals.register(input.record.publicPrincipal);
  principals.verify(
    input.record.decidedBy,
    decisionSignedBody(
      input.record,
    ) as unknown as JsonValue,
    input.record.attestation,
  );
}

export function createIndependentAuthorshipTransition(
  input: {
    readonly transitionId: string;
    readonly workflowId: string;
    readonly taskHandle: string;
    readonly action: AuthorshipAction;
    readonly previous:
      IndependentAuthorshipTransition | null;
    readonly assignmentMetadata?:
      SyntheticAuthorshipMetadata;
    readonly commitMetadata?:
      SyntheticAuthorshipMetadata;
    readonly review?: BlindedAuthorshipReview;
    readonly decision?: BlindedAuthorshipDecision;
    readonly occurredAt: string;
    readonly signer: PrincipalSigner;
    readonly contract: EvaluatorVaultContract;
    readonly schemas: SchemaRegistry;
    readonly historicalPolicy:
      HistoricalPublicExposurePolicy;
  },
): IndependentAuthorshipTransition {
  verifyEvaluatorVaultContract({
    record: input.contract,
    schemas: input.schemas,
  });
  const actor = expectedActor({
    action: input.action,
    contract: input.contract,
  });
  assertCondition(
    canonicalize(
      input.signer.exportPublic() as unknown as JsonValue,
    ) === canonicalize(actor as unknown as JsonValue),
    "AUTHORIZATION_DENIED",
    `Wrong actor for authorship action ${input.action}`,
  );
  const states = expectedTransition({
    action: input.action,
    previous: input.previous,
  });
  if (input.previous !== null) {
    assertCondition(
      input.previous.workflowId === input.workflowId &&
        input.previous.taskHandle === input.taskHandle &&
        input.previous.contractHash ===
          input.contract.contractHash &&
        input.previous.protocolId ===
          input.contract.protocolId,
      "HASH_MISMATCH",
      "Authorship transition changed workflow identity",
    );
  }
  const metadata =
    input.action === "assign"
      ? input.assignmentMetadata
      : input.action === "commit"
        ? input.commitMetadata
        : input.previous?.metadata;
  assertCondition(
    metadata !== undefined,
    "SCHEMA_INVALID",
    "Authorship transition metadata is missing",
  );
  if (input.action === "assign") {
    assertCondition(
      metadata.contentCommitment === null &&
        metadata.verifierCommitment === null &&
        metadata.contaminationDeclaration
          .publicExposureLedgerHash ===
          HISTORICAL_EXPOSURE_LEDGER_HASH,
      "SCHEMA_INVALID",
      "Assignment cannot contain task or verifier commitments",
    );
    assertDeclarationIntegrity(
      metadata.contaminationDeclaration,
    );
  } else if (input.action === "commit") {
    assertSyntheticMetadataResearchEligible({
      metadata,
      historicalPolicy: input.historicalPolicy,
    });
  } else {
    assertCondition(
      canonicalize(metadata as unknown as JsonValue) ===
        canonicalize(
          input.previous!.metadata as unknown as JsonValue,
        ),
      "HASH_MISMATCH",
      "Review transition changed committed metadata",
    );
  }

  const reviewRequired =
    input.action === "begin_blinded_review" ||
    input.action === "include" ||
    input.action === "reject";
  if (reviewRequired) {
    assertCondition(
      input.review !== undefined,
      "SCHEMA_INVALID",
      "Blinded review packet is required",
    );
    verifyBlindedAuthorshipReview({
      record: input.review,
      contract: input.contract,
      schemas: input.schemas,
    });
    assertReviewMatches({
      review: input.review,
      transition: input.previous!,
    });
    if (input.previous!.reviewPacketHash !== null) {
      assertCondition(
        input.previous!.reviewPacketHash ===
          input.review.recordHash &&
          input.previous!.blindReviewId ===
            input.review.reviewPacketId,
        "HASH_MISMATCH",
        "Authorship review packet was substituted",
      );
    }
  }
  const decisionRequired =
    input.action === "include" ||
    input.action === "reject";
  if (decisionRequired) {
    assertCondition(
      input.decision !== undefined &&
        input.review !== undefined,
      "SCHEMA_INVALID",
      "Blinded reviewer decision is required",
    );
    verifyBlindedAuthorshipDecision({
      record: input.decision,
      review: input.review,
      contract: input.contract,
      schemas: input.schemas,
    });
    assertCondition(
      input.decision.decision === input.action,
      "AUTHORIZATION_DENIED",
      "Vault finalization differs from the blinded reviewer decision",
    );
  } else {
    assertCondition(
      input.decision === undefined,
      "SCHEMA_INVALID",
      "Premature blinded reviewer decision",
    );
  }
  const rejection =
    input.decision?.rejectionReasonCommitment ?? null;
  assertCondition(
    (input.action === "reject" && rejection !== null) ||
      (input.action !== "reject" && rejection === null),
    "SCHEMA_INVALID",
    "Rejection commitment does not match the authorship decision",
  );
  const core: TransitionCore = {
    schemaVersion: 1,
    recordType: "independent_authorship_transition",
    transitionId: input.transitionId,
    workflowId: input.workflowId,
    protocolId: input.contract.protocolId,
    contractId: input.contract.contractId,
    contractHash: input.contract.contractHash,
    taskHandle: input.taskHandle,
    action: input.action,
    previousState: states.previousState,
    nextState: states.nextState,
    authorPrincipalId:
      input.contract.principalMatrix.benchmarkAuthor
        .identity.principalId,
    reviewerPrincipalId:
      input.contract.principalMatrix.benchmarkReviewer
        .identity.principalId,
    blindReviewId: reviewRequired
      ? input.review!.reviewPacketId
      : null,
    reviewPacketHash: reviewRequired
      ? input.review!.recordHash
      : null,
    reviewDecision:
      input.action === "include"
        ? "include"
        : input.action === "reject"
          ? "reject"
          : null,
    rejectionReasonCommitment: rejection,
    blindedReview: reviewRequired
      ? input.review!
      : null,
    blindedDecision: decisionRequired
      ? input.decision!
      : null,
    metadata,
    priorRecordHash:
      input.previous?.recordHash ?? null,
    occurredAt: input.occurredAt,
    actor: input.signer.identity,
  };
  const publicPrincipal = input.signer.exportPublic();
  const body: TransitionSignedBody = {
    ...core,
    recordHash: sha256(core as unknown as JsonValue),
    publicPrincipal,
  };
  const record: IndependentAuthorshipTransition = {
    ...body,
    attestation: input.signer.attest(
      body as unknown as JsonValue,
    ),
  };
  verifyIndependentAuthorshipTransition({
    record,
    previous: input.previous,
    contract: input.contract,
    schemas: input.schemas,
    historicalPolicy: input.historicalPolicy,
  });
  return record;
}

export function verifyIndependentAuthorshipTransition(
  input: {
    readonly record:
      IndependentAuthorshipTransition;
    readonly previous:
      IndependentAuthorshipTransition | null;
    readonly contract: EvaluatorVaultContract;
    readonly schemas: SchemaRegistry;
    readonly historicalPolicy:
      HistoricalPublicExposurePolicy;
  },
): void {
  verifyEvaluatorVaultContract({
    record: input.contract,
    schemas: input.schemas,
  });
  input.schemas.validate(
    INDEPENDENT_AUTHORSHIP_TRANSITION_SCHEMA_ID,
    input.record as unknown as JsonValue,
  );
  const expected = expectedTransition({
    action: input.record.action,
    previous: input.previous,
  });
  const actor = expectedActor({
    action: input.record.action,
    contract: input.contract,
  });
  assertCondition(
    input.record.protocolId ===
      input.contract.protocolId &&
      input.record.contractId ===
        input.contract.contractId &&
      input.record.contractHash ===
        input.contract.contractHash &&
      input.record.previousState ===
        expected.previousState &&
      input.record.nextState === expected.nextState &&
      input.record.priorRecordHash ===
        (input.previous?.recordHash ?? null) &&
      input.record.authorPrincipalId ===
        input.contract.principalMatrix.benchmarkAuthor
          .identity.principalId &&
      input.record.reviewerPrincipalId ===
        input.contract.principalMatrix.benchmarkReviewer
          .identity.principalId &&
      canonicalize(
        input.record.actor as unknown as JsonValue,
      ) ===
        canonicalize(
          actor.identity as unknown as JsonValue,
        ) &&
      canonicalize(
        input.record
          .publicPrincipal as unknown as JsonValue,
      ) === canonicalize(actor as unknown as JsonValue) &&
      input.record.recordHash ===
        sha256(
          transitionCore(
            input.record,
          ) as unknown as JsonValue,
        ),
    "HASH_MISMATCH",
    "Authorship transition identity, state, or hash changed",
  );
  assertCondition(
    input.previous === null ||
      (input.record.workflowId ===
        input.previous.workflowId &&
        input.record.taskHandle ===
          input.previous.taskHandle &&
        (input.record.action === "commit" ||
          canonicalize(
            input.record.metadata as unknown as JsonValue,
          ) ===
            canonicalize(
              input.previous.metadata as unknown as JsonValue,
            ))),
    "HASH_MISMATCH",
    "Authorship transition changed workflow or committed metadata",
  );
  assertDeclarationIntegrity(
    input.record.metadata.contaminationDeclaration,
  );
  if (input.record.action === "assign") {
    assertCondition(
      input.record.metadata.contentCommitment === null &&
        input.record.metadata.verifierCommitment === null &&
        input.record.blindReviewId === null &&
        input.record.reviewPacketHash === null &&
        input.record.blindedReview === null &&
        input.record.blindedDecision === null,
      "SCHEMA_INVALID",
      "Assignment contains premature committed or review fields",
    );
  }
  if (input.record.action === "commit") {
    assertSyntheticMetadataResearchEligible({
      metadata: input.record.metadata,
      historicalPolicy: input.historicalPolicy,
    });
  }
  const reviewRequired =
    input.record.action === "begin_blinded_review" ||
    input.record.action === "include" ||
    input.record.action === "reject";
  if (reviewRequired) {
    assertCondition(
      input.record.blindReviewId !== null &&
        input.record.reviewPacketHash !== null &&
        input.record.blindedReview !== null,
      "SCHEMA_INVALID",
      "Review transition lacks a blinded review binding",
    );
    verifyBlindedAuthorshipReview({
      record: input.record.blindedReview,
      contract: input.contract,
      schemas: input.schemas,
    });
    assertCondition(
      input.record.blindedReview.reviewPacketId ===
        input.record.blindReviewId &&
        input.record.blindedReview.recordHash ===
          input.record.reviewPacketHash,
      "HASH_MISMATCH",
      "Authorship transition binds another review packet",
    );
    assertReviewMatches({
      review: input.record.blindedReview,
      transition: input.record,
    });
  } else {
    assertCondition(
      input.record.blindReviewId === null &&
        input.record.reviewPacketHash === null &&
        input.record.blindedReview === null,
      "SCHEMA_INVALID",
      "Non-review transition contains a blinded review",
    );
  }
  const decisionRequired =
    input.record.action === "include" ||
    input.record.action === "reject";
  if (decisionRequired) {
    assertCondition(
      input.record.blindedDecision !== null &&
        input.record.blindedReview !== null,
      "SCHEMA_INVALID",
      "Final authorship transition lacks the blinded reviewer decision",
    );
    verifyBlindedAuthorshipDecision({
      record: input.record.blindedDecision,
      review: input.record.blindedReview,
      contract: input.contract,
      schemas: input.schemas,
    });
    assertCondition(
      input.record.blindedDecision.decision ===
        input.record.action &&
        input.record.blindedDecision
          .rejectionReasonCommitment ===
          input.record.rejectionReasonCommitment,
      "HASH_MISMATCH",
      "Final authorship transition changed the blinded reviewer decision",
    );
  } else {
    assertCondition(
      input.record.blindedDecision === null,
      "SCHEMA_INVALID",
      "Premature blinded reviewer decision",
    );
  }
  assertCondition(
    (input.record.action === "include" &&
      input.record.reviewDecision === "include" &&
      input.record.rejectionReasonCommitment === null) ||
      (input.record.action === "reject" &&
        input.record.reviewDecision === "reject" &&
        input.record.rejectionReasonCommitment !== null) ||
      (!["include", "reject"].includes(
        input.record.action,
      ) &&
        input.record.reviewDecision === null &&
        input.record.rejectionReasonCommitment === null),
    "SCHEMA_INVALID",
    "Authorship decision fields are inconsistent",
  );
  const principals = new PrincipalRegistry();
  principals.register(input.record.publicPrincipal);
  principals.verify(
    input.record.actor,
    transitionSignedBody(
      input.record,
    ) as unknown as JsonValue,
    input.record.attestation,
  );
}

export class IndependentAuthorshipLog {
  readonly #contract: EvaluatorVaultContract;
  readonly #schemas: SchemaRegistry;
  readonly #historicalPolicy:
    HistoricalPublicExposurePolicy;
  readonly #log: AppendOnlyLog<JsonValue>;
  #appendTail: Promise<void> = Promise.resolve();

  public constructor(input: {
    readonly root: string;
    readonly workflowId: string;
    readonly contract: EvaluatorVaultContract;
    readonly schemas: SchemaRegistry;
    readonly historicalPolicy:
      HistoricalPublicExposurePolicy;
  }) {
    this.#contract = input.contract;
    this.#schemas = input.schemas;
    this.#historicalPolicy = input.historicalPolicy;
    this.#log = new AppendOnlyLog<JsonValue>(
      path.join(input.root, "authorship"),
      `authorship.${input.workflowId}`,
    );
  }

  public async append(input: {
    readonly record:
      IndependentAuthorshipTransition;
  }): Promise<AppendOnlyRecord<JsonValue>> {
    const current = this.#appendTail.then(() =>
      this.#appendOne(input),
    );
    this.#appendTail = current.then(
      () => undefined,
      () => undefined,
    );
    return current;
  }

  async #appendOne(input: {
    readonly record:
      IndependentAuthorshipTransition;
  }): Promise<AppendOnlyRecord<JsonValue>> {
    const records = await this.#log.readAll();
    const priorSameId = records.find(
      (entry) =>
        (
          entry.payload as unknown as IndependentAuthorshipTransition
        ).transitionId === input.record.transitionId,
    );
    assertCondition(
      priorSameId === undefined ||
        (
          priorSameId.payload as unknown as IndependentAuthorshipTransition
        ).recordHash === input.record.recordHash,
      "CONFLICT",
      "Authorship transition ID was reused with different content",
    );
    if (priorSameId !== undefined) return priorSameId;
    const previous =
      (records.at(-1)?.payload as
        | IndependentAuthorshipTransition
        | undefined) ?? null;
    verifyIndependentAuthorshipTransition({
      record: input.record,
      previous,
      contract: this.#contract,
      schemas: this.#schemas,
      historicalPolicy: this.#historicalPolicy,
    });
    return this.#log.append(
      input.record as unknown as JsonValue,
    );
  }

  public async readAll(): Promise<
    readonly IndependentAuthorshipTransition[]
  > {
    const records = await this.#log.readAll();
    const output: IndependentAuthorshipTransition[] = [];
    let previous:
      | IndependentAuthorshipTransition
      | null = null;
    for (const entry of records) {
      const record =
        entry.payload as unknown as IndependentAuthorshipTransition;
      verifyIndependentAuthorshipTransition({
        record,
        previous,
        contract: this.#contract,
        schemas: this.#schemas,
        historicalPolicy: this.#historicalPolicy,
      });
      output.push(record);
      previous = record;
    }
    return output;
  }

  public async head(): Promise<
    IndependentAuthorshipTransition | null
  > {
    return (await this.readAll()).at(-1) ?? null;
  }
}
