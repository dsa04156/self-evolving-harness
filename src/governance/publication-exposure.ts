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
  PrincipalRegistry,
  type Attestation,
  type PrincipalIdentity,
  type PrincipalSigner,
  type PublicPrincipal,
} from "../trust/identity.js";

export const PUBLISHED_ARTIFACT_INVENTORY_SCHEMA_ID =
  `${SCHEMA_BASE_URL}published-artifact-inventory.schema.json`;
export const PUBLICATION_DEVIATION_SCHEMA_ID =
  `${SCHEMA_BASE_URL}publication-deviation-record.schema.json`;
export const PUBLIC_EXPOSURE_LEDGER_SCHEMA_ID =
  `${SCHEMA_BASE_URL}public-exposure-ledger.schema.json`;
export const PUBLICATION_REMEDIATION_CLOSURE_SCHEMA_ID =
  `${SCHEMA_BASE_URL}publication-remediation-closure.schema.json`;

export const PUBLIC_EXPOSURE_ALLOWED_USES = [
  "public_development",
  "governance_audit",
  "development_archive",
] as const;

export const PUBLIC_EXPOSURE_RESTRICTED_USES = [
  "held_out",
  "sealed",
  "temporal_holdout",
  "gate",
  "final",
  "confirmatory",
  "research_selection",
  "promotion",
  "research_evidence",
  "claim_table",
] as const;

export const PUBLIC_EXPOSURE_ARTIFACT_CLASSES = [
  "development_fixture",
  "development_corpus",
  "development_oracle",
  "development_prototype",
  "development_prediction",
  "development_score",
  "development_candidate",
  "development_execution",
  "development_evaluation",
  "development_receipt",
  "development_quarantine",
  "development_documentation",
  "published_source",
] as const;

export type PublicExposureAllowedUse =
  (typeof PUBLIC_EXPOSURE_ALLOWED_USES)[number];
export type PublicExposureRestrictedUse =
  (typeof PUBLIC_EXPOSURE_RESTRICTED_USES)[number];
export type PublicExposureUseClass =
  | PublicExposureAllowedUse
  | PublicExposureRestrictedUse;
export type PublicExposureArtifactClass =
  (typeof PUBLIC_EXPOSURE_ARTIFACT_CLASSES)[number];

export interface PermanentPublicEligibility {
  readonly publicDevelopment: true;
  readonly eligibleForHeldOut: false;
  readonly eligibleForSealed: false;
  readonly eligibleForTemporalHoldout: false;
  readonly eligibleForGate: false;
  readonly eligibleForFinal: false;
  readonly confirmatory: false;
  readonly authorizedForResearchEvidence: false;
  readonly authorizedForPromotion: false;
}

export const PERMANENT_PUBLIC_ELIGIBILITY: PermanentPublicEligibility =
  Object.freeze({
    publicDevelopment: true,
    eligibleForHeldOut: false,
    eligibleForSealed: false,
    eligibleForTemporalHoldout: false,
    eligibleForGate: false,
    eligibleForFinal: false,
    confirmatory: false,
    authorizedForResearchEvidence: false,
    authorizedForPromotion: false,
  });

export interface PublishedArtifactInventoryEntry {
  readonly path: string;
  readonly mode: string;
  readonly objectType: "blob";
  readonly objectId: string;
  readonly sizeBytes: number;
  readonly contentSha256: string;
}

export interface PublishedArtifactInventory {
  readonly schemaVersion: 1;
  readonly inventoryId: string;
  readonly recordType: "published_artifact_inventory";
  readonly repository: {
    readonly url: string;
    readonly owner: string;
    readonly remoteName: string;
    readonly branch: string;
  };
  readonly snapshotCommit: string;
  readonly snapshotTree: string;
  readonly entries: readonly PublishedArtifactInventoryEntry[];
  readonly entryCount: number;
  readonly createdAt: string;
  readonly inventoryHash: string;
}

type InventoryCore = Omit<
  PublishedArtifactInventory,
  "inventoryHash"
>;

function inventoryCore(
  record: PublishedArtifactInventory,
): InventoryCore {
  const { inventoryHash: _inventoryHash, ...core } = record;
  return core;
}

function normalizeInventoryEntries(
  entries: readonly PublishedArtifactInventoryEntry[],
): readonly PublishedArtifactInventoryEntry[] {
  const normalized = [...entries].sort((left, right) =>
    left.path.localeCompare(right.path),
  );
  assertCondition(
    normalized.length > 0 &&
      normalized.length ===
        new Set(normalized.map((entry) => entry.path)).size &&
      normalized.length ===
        new Set(
          normalized.map(
            (entry) => `${entry.objectId}:${entry.path}`,
          ),
        ).size,
    "SCHEMA_INVALID",
    "Published inventory paths must be unique and non-empty",
  );
  return normalized;
}

export function createPublishedArtifactInventory(input: {
  readonly inventoryId: string;
  readonly repository: PublishedArtifactInventory["repository"];
  readonly snapshotCommit: string;
  readonly snapshotTree: string;
  readonly entries: readonly PublishedArtifactInventoryEntry[];
  readonly createdAt: string;
  readonly schemas: SchemaRegistry;
}): PublishedArtifactInventory {
  const entries = normalizeInventoryEntries(input.entries);
  const core: InventoryCore = {
    schemaVersion: 1,
    inventoryId: input.inventoryId,
    recordType: "published_artifact_inventory",
    repository: input.repository,
    snapshotCommit: input.snapshotCommit,
    snapshotTree: input.snapshotTree,
    entries,
    entryCount: entries.length,
    createdAt: input.createdAt,
  };
  const inventory: PublishedArtifactInventory = {
    ...core,
    inventoryHash: sha256(core as unknown as JsonValue),
  };
  verifyPublishedArtifactInventory({
    inventory,
    schemas: input.schemas,
  });
  return inventory;
}

export function verifyPublishedArtifactInventory(input: {
  readonly inventory: PublishedArtifactInventory;
  readonly schemas: SchemaRegistry;
}): void {
  input.schemas.validate(
    PUBLISHED_ARTIFACT_INVENTORY_SCHEMA_ID,
    input.inventory as unknown as JsonValue,
  );
  const normalized = normalizeInventoryEntries(
    input.inventory.entries,
  );
  assertCondition(
    canonicalize(normalized as unknown as JsonValue) ===
      canonicalize(
        input.inventory.entries as unknown as JsonValue,
      ) &&
      input.inventory.entryCount ===
        input.inventory.entries.length &&
      input.inventory.inventoryHash ===
        sha256(
          inventoryCore(input.inventory) as unknown as JsonValue,
        ),
    "HASH_MISMATCH",
    "Published artifact inventory changed",
  );
}

export interface PublicationDeviationRecord {
  readonly schemaVersion: 1;
  readonly deviationId: string;
  readonly recordType: "publication_deviation";
  readonly governanceDomainId: string;
  readonly priorDecision: {
    readonly round: "03RRR";
    readonly decision: "APPROVE";
    readonly responsePath: string;
    readonly responseSha256: string;
  };
  readonly dispositionDecision: {
    readonly round: "03RRRR";
    readonly decision: "REVISE";
    readonly responsePath: string;
    readonly responseSha256: string;
  };
  readonly userAuthorization: {
    readonly instructionText: string;
    readonly instructionSha256: string;
    readonly source: "conversation_user_message";
    readonly timestampAvailability: "not_recorded";
  };
  readonly repository: PublishedArtifactInventory["repository"];
  readonly publishedRefs: readonly {
    readonly refName: "refs/heads/main";
    readonly commit: string;
    readonly tree: string;
    readonly publishedAt: string;
    readonly observationSource:
      "local_remote_tracking_reflog";
  }[];
  readonly implementationSource: {
    readonly commit: string;
    readonly tree: string;
  };
  readonly evidenceCheckpoint: {
    readonly commit: string;
    readonly tree: string;
  };
  readonly inventory: {
    readonly inventoryId: string;
    readonly inventoryHash: string;
    readonly snapshotCommit: string;
    readonly snapshotTree: string;
    readonly entryCount: number;
    readonly path: string;
  };
  readonly secretScan: {
    readonly scannedScopes: readonly string[];
    readonly patterns: readonly string[];
    readonly result: "no_actual_secret_match";
    readonly falsePositiveLiterals: readonly string[];
    readonly environmentFilesFound: 0;
    readonly privateKeysPublished: false;
  };
  readonly exceededAuthorization: string;
  readonly accompanyingActions: {
    readonly providerCall: false;
    readonly researchExecution: false;
    readonly gateOrFinalAccess: false;
    readonly promotion: false;
    readonly deployment: false;
    readonly credentialPublication: false;
  };
  readonly permanentConsequence: {
    readonly publicExposureIrreversible: true;
    readonly historyRewriteDoesNotRestoreSecrecy: true;
    readonly repositoryDeletionDoesNotRestoreSecrecy: true;
    readonly publishedArtifactsRequireExposureLedger: true;
  };
  readonly remediation: {
    readonly status: "in_progress";
    readonly requiredActions: readonly string[];
  };
  readonly recordedAt: string;
  readonly recordedBy: PrincipalIdentity;
  readonly recordHash: string;
  readonly publicPrincipal: PublicPrincipal;
  readonly attestation: Attestation;
}

export type PublicationDeviationUnsignedInput = Omit<
  PublicationDeviationRecord,
  | "schemaVersion"
  | "recordType"
  | "recordedBy"
  | "recordHash"
  | "publicPrincipal"
  | "attestation"
>;

type PublicationDeviationCore = Omit<
  PublicationDeviationRecord,
  "recordHash" | "publicPrincipal" | "attestation"
>;
type PublicationDeviationSignedBody = Omit<
  PublicationDeviationRecord,
  "attestation"
>;

function deviationCore(
  record: PublicationDeviationRecord,
): PublicationDeviationCore {
  const {
    recordHash: _recordHash,
    publicPrincipal: _publicPrincipal,
    attestation: _attestation,
    ...core
  } = record;
  return core;
}

function deviationSignedBody(
  record: PublicationDeviationRecord,
): PublicationDeviationSignedBody {
  const { attestation: _attestation, ...body } = record;
  return body;
}

function assertProtocolAuthor(input: {
  readonly signer: PrincipalSigner;
  readonly action: string;
}): void {
  assertCondition(
    input.signer.identity.role === "protocol_author",
    "AUTHORIZATION_DENIED",
    `Only a protocol author may ${input.action}`,
  );
}

function verifySignedProtocolAuthorRecord(input: {
  readonly identity: PrincipalIdentity;
  readonly publicPrincipal: PublicPrincipal;
  readonly signedBody: JsonValue;
  readonly attestation: Attestation;
  readonly recordHash: string;
  readonly expectedRecordHash: string;
  readonly label: string;
}): void {
  assertCondition(
    input.identity.role === "protocol_author",
    "AUTHORIZATION_DENIED",
    `${input.label} is not signed by a protocol author`,
  );
  assertCondition(
    canonicalize(
      input.publicPrincipal.identity as unknown as JsonValue,
    ) === canonicalize(input.identity as unknown as JsonValue) &&
      input.recordHash === input.expectedRecordHash,
    "HASH_MISMATCH",
    `${input.label} identity or record hash changed`,
  );
  const principals = new PrincipalRegistry();
  principals.register(input.publicPrincipal);
  principals.verify(
    input.identity,
    input.signedBody,
    input.attestation,
  );
}

export function createPublicationDeviationRecord(input: {
  readonly value: PublicationDeviationUnsignedInput;
  readonly inventory: PublishedArtifactInventory;
  readonly signer: PrincipalSigner;
  readonly schemas: SchemaRegistry;
}): PublicationDeviationRecord {
  assertProtocolAuthor({
    signer: input.signer,
    action: "sign a publication deviation",
  });
  verifyPublishedArtifactInventory({
    inventory: input.inventory,
    schemas: input.schemas,
  });
  assertCondition(
    input.value.inventory.inventoryId ===
      input.inventory.inventoryId &&
      input.value.inventory.inventoryHash ===
        input.inventory.inventoryHash &&
      input.value.inventory.snapshotCommit ===
        input.inventory.snapshotCommit &&
      input.value.inventory.snapshotTree ===
        input.inventory.snapshotTree &&
      input.value.inventory.entryCount ===
        input.inventory.entryCount &&
      canonicalize(
        input.value.repository as unknown as JsonValue,
      ) ===
        canonicalize(
          input.inventory.repository as unknown as JsonValue,
        ),
    "HASH_MISMATCH",
    "Publication deviation does not bind the supplied inventory",
  );
  const core: PublicationDeviationCore = {
    schemaVersion: 1,
    deviationId: input.value.deviationId,
    recordType: "publication_deviation",
    governanceDomainId: input.value.governanceDomainId,
    priorDecision: input.value.priorDecision,
    dispositionDecision: input.value.dispositionDecision,
    userAuthorization: input.value.userAuthorization,
    repository: input.value.repository,
    publishedRefs: input.value.publishedRefs,
    implementationSource: input.value.implementationSource,
    evidenceCheckpoint: input.value.evidenceCheckpoint,
    inventory: input.value.inventory,
    secretScan: input.value.secretScan,
    exceededAuthorization: input.value.exceededAuthorization,
    accompanyingActions: input.value.accompanyingActions,
    permanentConsequence: input.value.permanentConsequence,
    remediation: input.value.remediation,
    recordedAt: input.value.recordedAt,
    recordedBy: input.signer.identity,
  };
  const publicPrincipal = input.signer.exportPublic();
  const body: PublicationDeviationSignedBody = {
    ...core,
    recordHash: sha256(core as unknown as JsonValue),
    publicPrincipal,
  };
  const record: PublicationDeviationRecord = {
    ...body,
    attestation: input.signer.attest(
      body as unknown as JsonValue,
    ),
  };
  verifyPublicationDeviationRecord({
    record,
    inventory: input.inventory,
    schemas: input.schemas,
  });
  return record;
}

export function verifyPublicationDeviationRecord(input: {
  readonly record: PublicationDeviationRecord;
  readonly inventory: PublishedArtifactInventory;
  readonly schemas: SchemaRegistry;
}): void {
  input.schemas.validate(
    PUBLICATION_DEVIATION_SCHEMA_ID,
    input.record as unknown as JsonValue,
  );
  verifyPublishedArtifactInventory({
    inventory: input.inventory,
    schemas: input.schemas,
  });
  assertCondition(
    input.record.inventory.inventoryId ===
      input.inventory.inventoryId &&
      input.record.inventory.inventoryHash ===
        input.inventory.inventoryHash &&
      input.record.inventory.snapshotCommit ===
        input.inventory.snapshotCommit &&
      input.record.inventory.snapshotTree ===
        input.inventory.snapshotTree &&
      input.record.inventory.entryCount ===
        input.inventory.entryCount &&
      input.record.implementationSource.commit ===
        "88e39cdebf1df4db7688fff592363f5f867533ce" &&
      input.record.implementationSource.tree ===
        "ccb20381cc3308cb71954789614144575870eb83" &&
      input.record.evidenceCheckpoint.commit ===
        "a5d82564cece5ecb776a27c86512c3ec56f32787" &&
      input.record.evidenceCheckpoint.tree ===
        "1bbc1a7623460cf52907758e7ee93149e18a0aec" &&
      input.record.priorDecision.responseSha256 ===
        "sha256:ac0637a0c8a17ff77c9db732ed4b2632acc825526f7b632c8ff57d89074370e3" &&
      input.record.dispositionDecision.responseSha256 ===
        "sha256:deab2175380d472a8581ab4baed07af8518fde3ffa0a90a6457bb03a234db9cf" &&
      input.record.userAuthorization.instructionSha256 ===
        sha256Text(
          input.record.userAuthorization.instructionText,
        ),
    "HASH_MISMATCH",
    "Publication deviation source or inventory binding changed",
  );
  const refs = input.record.publishedRefs;
  assertCondition(
    refs.length === 3 &&
      refs.every(
        (entry, index) =>
          index === 0 ||
          refs[index - 1]!.publishedAt < entry.publishedAt,
      ) &&
      refs.at(-1)?.commit ===
        input.inventory.snapshotCommit &&
      refs.at(-1)?.tree === input.inventory.snapshotTree,
    "SCHEMA_INVALID",
    "Publication ref history must be complete and chronological",
  );
  verifySignedProtocolAuthorRecord({
    identity: input.record.recordedBy,
    publicPrincipal: input.record.publicPrincipal,
    signedBody:
      deviationSignedBody(input.record) as unknown as JsonValue,
    attestation: input.record.attestation,
    recordHash: input.record.recordHash,
    expectedRecordHash: sha256(
      deviationCore(input.record) as unknown as JsonValue,
    ),
    label: "Publication deviation",
  });
}

export interface PublicExposureArtifact {
  readonly exposureId: string;
  readonly artifactClass: PublicExposureArtifactClass;
  readonly artifactId: string;
  readonly sourceKind: "git_blob" | "embedded_record";
  readonly path: string | null;
  readonly gitBlobId: string | null;
  readonly contentHash: string;
  readonly aliases: readonly string[];
  readonly dependencies: readonly string[];
  readonly provenanceReferences: readonly string[];
  readonly eligibility: PermanentPublicEligibility;
}

export interface PublicExposureLedger {
  readonly schemaVersion: 1;
  readonly ledgerId: string;
  readonly recordType: "public_exposure_ledger";
  readonly governanceDomainId: string;
  readonly deviationId: string;
  readonly deviationRecordHash: string;
  readonly repository: PublishedArtifactInventory["repository"];
  readonly inventory: {
    readonly inventoryId: string;
    readonly inventoryHash: string;
    readonly snapshotCommit: string;
    readonly snapshotTree: string;
  };
  readonly artifacts: readonly PublicExposureArtifact[];
  readonly propagationPolicy: {
    readonly matchExposureId: true;
    readonly matchArtifactId: true;
    readonly matchPath: true;
    readonly matchGitBlobId: true;
    readonly matchContentHash: true;
    readonly matchAlias: true;
    readonly traverseDependencies: true;
    readonly traverseWrappers: true;
    readonly traverseProvenance: true;
    readonly protocolVersionCannotReset: true;
    readonly historyRewriteCannotReset: true;
    readonly repositoryDeletionCannotReset: true;
    readonly defaultRestrictedUse: "deny";
  };
  readonly allowedUseClasses:
    readonly PublicExposureAllowedUse[];
  readonly prohibitedUseClasses:
    readonly PublicExposureRestrictedUse[];
  readonly createdAt: string;
  readonly recordedBy: PrincipalIdentity;
  readonly ledgerHash: string;
  readonly publicPrincipal: PublicPrincipal;
  readonly attestation: Attestation;
}

type PublicExposureLedgerCore = Omit<
  PublicExposureLedger,
  "ledgerHash" | "publicPrincipal" | "attestation"
>;
type PublicExposureLedgerSignedBody = Omit<
  PublicExposureLedger,
  "attestation"
>;

function ledgerCore(
  record: PublicExposureLedger,
): PublicExposureLedgerCore {
  const {
    ledgerHash: _ledgerHash,
    publicPrincipal: _publicPrincipal,
    attestation: _attestation,
    ...core
  } = record;
  return core;
}

function ledgerSignedBody(
  record: PublicExposureLedger,
): PublicExposureLedgerSignedBody {
  const { attestation: _attestation, ...body } = record;
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
    `Public exposure has duplicate ${label}`,
  );
  return sorted;
}

function normalizeExposureArtifact(
  input: Omit<
    PublicExposureArtifact,
    "eligibility"
  > & {
    readonly eligibility?: PermanentPublicEligibility;
  },
): PublicExposureArtifact {
  assertCondition(
    PUBLIC_EXPOSURE_ARTIFACT_CLASSES.includes(
      input.artifactClass,
    ),
    "SCHEMA_INVALID",
    "Unknown public-exposure artifact class",
  );
  return {
    exposureId: input.exposureId,
    artifactClass: input.artifactClass,
    artifactId: input.artifactId,
    sourceKind: input.sourceKind,
    path: input.path,
    gitBlobId: input.gitBlobId,
    contentHash: input.contentHash,
    aliases: sortedUnique(input.aliases, "alias"),
    dependencies: sortedUnique(
      input.dependencies,
      "dependency",
    ),
    provenanceReferences: sortedUnique(
      input.provenanceReferences,
      "provenance reference",
    ),
    eligibility: PERMANENT_PUBLIC_ELIGIBILITY,
  };
}

export function createPublicExposureLedger(input: {
  readonly ledgerId: string;
  readonly governanceDomainId: string;
  readonly deviation: PublicationDeviationRecord;
  readonly inventory: PublishedArtifactInventory;
  readonly artifacts: readonly (
    Omit<PublicExposureArtifact, "eligibility"> & {
      readonly eligibility?: PermanentPublicEligibility;
    }
  )[];
  readonly createdAt: string;
  readonly signer: PrincipalSigner;
  readonly schemas: SchemaRegistry;
}): PublicExposureLedger {
  assertProtocolAuthor({
    signer: input.signer,
    action: "sign a public-exposure ledger",
  });
  verifyPublicationDeviationRecord({
    record: input.deviation,
    inventory: input.inventory,
    schemas: input.schemas,
  });
  const artifacts = input.artifacts
    .map(normalizeExposureArtifact)
    .sort((left, right) =>
      left.exposureId.localeCompare(right.exposureId),
    );
  const exposureIds = artifacts.map(
    (artifact) => artifact.exposureId,
  );
  assertCondition(
    artifacts.length > 0 &&
      exposureIds.length === new Set(exposureIds).size,
    "SCHEMA_INVALID",
    "Public-exposure ledger requires unique artifacts",
  );
  const core: PublicExposureLedgerCore = {
    schemaVersion: 1,
    ledgerId: input.ledgerId,
    recordType: "public_exposure_ledger",
    governanceDomainId: input.governanceDomainId,
    deviationId: input.deviation.deviationId,
    deviationRecordHash: input.deviation.recordHash,
    repository: input.deviation.repository,
    inventory: {
      inventoryId: input.inventory.inventoryId,
      inventoryHash: input.inventory.inventoryHash,
      snapshotCommit: input.inventory.snapshotCommit,
      snapshotTree: input.inventory.snapshotTree,
    },
    artifacts,
    propagationPolicy: {
      matchExposureId: true,
      matchArtifactId: true,
      matchPath: true,
      matchGitBlobId: true,
      matchContentHash: true,
      matchAlias: true,
      traverseDependencies: true,
      traverseWrappers: true,
      traverseProvenance: true,
      protocolVersionCannotReset: true,
      historyRewriteCannotReset: true,
      repositoryDeletionCannotReset: true,
      defaultRestrictedUse: "deny",
    },
    allowedUseClasses: PUBLIC_EXPOSURE_ALLOWED_USES,
    prohibitedUseClasses: PUBLIC_EXPOSURE_RESTRICTED_USES,
    createdAt: input.createdAt,
    recordedBy: input.signer.identity,
  };
  const publicPrincipal = input.signer.exportPublic();
  const body: PublicExposureLedgerSignedBody = {
    ...core,
    ledgerHash: sha256(core as unknown as JsonValue),
    publicPrincipal,
  };
  const record: PublicExposureLedger = {
    ...body,
    attestation: input.signer.attest(
      body as unknown as JsonValue,
    ),
  };
  verifyPublicExposureLedger({
    record,
    deviation: input.deviation,
    inventory: input.inventory,
    schemas: input.schemas,
  });
  return record;
}

export function verifyPublicExposureLedger(input: {
  readonly record: PublicExposureLedger;
  readonly deviation: PublicationDeviationRecord;
  readonly inventory: PublishedArtifactInventory;
  readonly schemas: SchemaRegistry;
}): void {
  input.schemas.validate(
    PUBLIC_EXPOSURE_LEDGER_SCHEMA_ID,
    input.record as unknown as JsonValue,
  );
  verifyPublicationDeviationRecord({
    record: input.deviation,
    inventory: input.inventory,
    schemas: input.schemas,
  });
  assertCondition(
    input.record.deviationId ===
      input.deviation.deviationId &&
      input.record.deviationRecordHash ===
        input.deviation.recordHash &&
      input.record.inventory.inventoryId ===
        input.inventory.inventoryId &&
      input.record.inventory.inventoryHash ===
        input.inventory.inventoryHash &&
      input.record.inventory.snapshotCommit ===
        input.inventory.snapshotCommit &&
      input.record.inventory.snapshotTree ===
        input.inventory.snapshotTree &&
      canonicalize(
        input.record.repository as unknown as JsonValue,
      ) ===
        canonicalize(
          input.deviation.repository as unknown as JsonValue,
        ),
    "HASH_MISMATCH",
    "Public-exposure ledger binding changed",
  );
  const artifacts = input.record.artifacts
    .map(normalizeExposureArtifact)
    .sort((left, right) =>
      left.exposureId.localeCompare(right.exposureId),
    );
  assertCondition(
    artifacts.length ===
      new Set(
        artifacts.map((artifact) => artifact.exposureId),
      ).size &&
      canonicalize(artifacts as unknown as JsonValue) ===
        canonicalize(
          input.record.artifacts as unknown as JsonValue,
        ),
    "SCHEMA_INVALID",
    "Public-exposure artifacts must be unique and canonically ordered",
  );
  const tokens = new Map<string, string>();
  for (const artifact of artifacts) {
    assertCondition(
      canonicalize(artifact as unknown as JsonValue) ===
        canonicalize(
          input.record.artifacts.find(
            (candidate) =>
              candidate.exposureId === artifact.exposureId,
          ) as unknown as JsonValue,
        ),
      "HASH_MISMATCH",
      "Public artifact eligibility or ordering changed",
    );
    for (const token of [
      artifact.exposureId,
      artifact.artifactId,
      artifact.path,
      artifact.gitBlobId,
      artifact.contentHash,
      ...artifact.aliases,
    ]) {
      if (token === null) continue;
      const prior = tokens.get(token);
      assertCondition(
        prior === undefined ||
          prior === artifact.exposureId,
        "CONFLICT",
        "Public-exposure token identifies multiple artifacts",
      );
      tokens.set(token, artifact.exposureId);
    }
  }
  assertCondition(
    canonicalize(
      input.record.allowedUseClasses as unknown as JsonValue,
    ) ===
      canonicalize(
        PUBLIC_EXPOSURE_ALLOWED_USES as unknown as JsonValue,
      ) &&
      canonicalize(
        input.record.prohibitedUseClasses as unknown as JsonValue,
      ) ===
        canonicalize(
          PUBLIC_EXPOSURE_RESTRICTED_USES as unknown as JsonValue,
        ),
    "HASH_MISMATCH",
    "Public-exposure use matrix changed",
  );
  verifySignedProtocolAuthorRecord({
    identity: input.record.recordedBy,
    publicPrincipal: input.record.publicPrincipal,
    signedBody:
      ledgerSignedBody(input.record) as unknown as JsonValue,
    attestation: input.record.attestation,
    recordHash: input.record.ledgerHash,
    expectedRecordHash: sha256(
      ledgerCore(input.record) as unknown as JsonValue,
    ),
    label: "Public-exposure ledger",
  });
}

export interface PublicExposureGraphNode {
  readonly nodeId: string;
  readonly contentHash: string | null;
  readonly gitBlobId: string | null;
  readonly path: string | null;
  readonly aliases: readonly string[];
  readonly dependencies: readonly string[];
  readonly wrappers: readonly string[];
  readonly provenanceReferences: readonly string[];
}

export interface PublicExposureAdmission {
  readonly useClass: PublicExposureAllowedUse;
  readonly exposureIds: readonly string[];
  readonly admissionHash: string;
}

function collectStrings(
  value: JsonValue,
  output: Set<string>,
): void {
  if (typeof value === "string") {
    output.add(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectStrings(item, output);
    return;
  }
  if (typeof value === "object" && value !== null) {
    for (const item of Object.values(value)) {
      collectStrings(item, output);
    }
  }
}

export class PublicExposurePolicy {
  readonly #byToken = new Map<
    string,
    PublicExposureArtifact
  >();

  public constructor(input: {
    readonly ledgers: readonly PublicExposureLedger[];
    readonly deviations: readonly PublicationDeviationRecord[];
    readonly inventory: PublishedArtifactInventory;
    readonly schemas: SchemaRegistry;
  }) {
    assertCondition(
      input.ledgers.length > 0 &&
        input.deviations.length > 0,
      "SCHEMA_INVALID",
      "Public-exposure policy requires signed governance records",
    );
    const deviationById = new Map(
      input.deviations.map((record) => [
        record.deviationId,
        record,
      ]),
    );
    for (const ledger of input.ledgers) {
      const deviation = deviationById.get(
        ledger.deviationId,
      );
      assertCondition(
        deviation !== undefined,
        "HASH_MISMATCH",
        "Public ledger has no governing deviation",
      );
      verifyPublicExposureLedger({
        record: ledger,
        deviation,
        inventory: input.inventory,
        schemas: input.schemas,
      });
      for (const artifact of ledger.artifacts) {
        for (const token of [
          artifact.exposureId,
          artifact.artifactId,
          artifact.path,
          artifact.gitBlobId,
          artifact.contentHash,
          ...artifact.aliases,
        ]) {
          if (token === null) continue;
          const prior = this.#byToken.get(token);
          assertCondition(
            prior === undefined ||
              prior.exposureId === artifact.exposureId,
            "CONFLICT",
            "Conflicting public-exposure ledgers",
          );
          this.#byToken.set(token, artifact);
        }
      }
    }
  }

  public assertPayloadAllowed(input: {
    readonly useClass: PublicExposureUseClass;
    readonly payload: JsonValue;
    readonly protocolId?: string;
    readonly resetClaims?: {
      readonly newProtocolClearsExposure?: boolean;
      readonly historyRewriteRestoresSecrecy?: boolean;
      readonly repositoryDeletionRestoresSecrecy?: boolean;
    };
  }): PublicExposureAdmission | null {
    const references = new Set<string>();
    collectStrings(input.payload, references);
    return this.assertGraphAllowed({
      useClass: input.useClass,
      rootReferences: [...references],
      nodes: [],
      ...(input.protocolId === undefined
        ? {}
        : { protocolId: input.protocolId }),
      ...(input.resetClaims === undefined
        ? {}
        : { resetClaims: input.resetClaims }),
    });
  }

  public assertGraphAllowed(input: {
    readonly useClass: PublicExposureUseClass;
    readonly rootReferences: readonly string[];
    readonly nodes: readonly PublicExposureGraphNode[];
    readonly protocolId?: string;
    readonly resetClaims?: {
      readonly newProtocolClearsExposure?: boolean;
      readonly historyRewriteRestoresSecrecy?: boolean;
      readonly repositoryDeletionRestoresSecrecy?: boolean;
    };
  }): PublicExposureAdmission | null {
    assertCondition(
      (
        [
          ...PUBLIC_EXPOSURE_ALLOWED_USES,
          ...PUBLIC_EXPOSURE_RESTRICTED_USES,
        ] as readonly string[]
      ).includes(input.useClass),
      "SCHEMA_INVALID",
      "Unknown public-exposure use class",
    );
    const reset = input.resetClaims;
    assertCondition(
      reset?.newProtocolClearsExposure !== true &&
        reset?.historyRewriteRestoresSecrecy !== true &&
        reset?.repositoryDeletionRestoresSecrecy !== true,
      "AUTHORIZATION_DENIED",
      "Protocol changes, history rewrites, and repository deletion cannot restore secrecy",
    );
    const nodeByToken = new Map<
      string,
      PublicExposureGraphNode
    >();
    for (const node of input.nodes) {
      for (const token of [
        node.nodeId,
        node.contentHash,
        node.gitBlobId,
        node.path,
        ...node.aliases,
      ]) {
        if (token === null) continue;
        const prior = nodeByToken.get(token);
        assertCondition(
          prior === undefined || prior === node,
          "CONFLICT",
          "Submitted public-exposure graph has ambiguous aliases",
        );
        nodeByToken.set(token, node);
      }
    }
    const queue = [...input.rootReferences];
    const visited = new Set<string>();
    const exposures = new Map<
      string,
      PublicExposureArtifact
    >();
    while (queue.length > 0) {
      const token = queue.shift()!;
      if (visited.has(token)) continue;
      visited.add(token);
      const artifact = this.#byToken.get(token);
      if (artifact !== undefined) {
        exposures.set(artifact.exposureId, artifact);
        queue.push(
          ...artifact.dependencies,
          ...artifact.provenanceReferences,
        );
      }
      const node = nodeByToken.get(token);
      if (node !== undefined) {
        queue.push(
          node.nodeId,
          ...(node.contentHash === null
            ? []
            : [node.contentHash]),
          ...(node.gitBlobId === null
            ? []
            : [node.gitBlobId]),
          ...(node.path === null ? [] : [node.path]),
          ...node.aliases,
          ...node.dependencies,
          ...node.wrappers,
          ...node.provenanceReferences,
        );
      }
    }
    if (exposures.size === 0) return null;
    assertCondition(
      PUBLIC_EXPOSURE_ALLOWED_USES.includes(
        input.useClass as PublicExposureAllowedUse,
      ) &&
        !PUBLIC_EXPOSURE_RESTRICTED_USES.includes(
          input.useClass as PublicExposureRestrictedUse,
        ),
      "AUTHORIZATION_DENIED",
      `Public development artifacts cannot be used for ${input.useClass}`,
    );
    const exposureIds = [...exposures.keys()].sort();
    const useClass =
      input.useClass as PublicExposureAllowedUse;
    return {
      useClass,
      exposureIds,
      admissionHash: sha256({
        useClass,
        exposureIds,
        protocolId: input.protocolId ?? null,
      }),
    };
  }
}

export interface PublicationRemediationClosureRecord {
  readonly schemaVersion: 1;
  readonly closureId: string;
  readonly recordType:
    "publication_remediation_closure";
  readonly governanceDomainId: string;
  readonly deviationId: string;
  readonly deviationRecordHash: string;
  readonly correctiveDecision: {
    readonly round: "03RRRR";
    readonly decision: "REVISE";
    readonly responsePath: string;
    readonly responseSha256: string;
  };
  readonly inventoryHash: string;
  readonly publicExposureLedgerId: string;
  readonly publicExposureLedgerHash: string;
  readonly validatorEvidence: {
    readonly implementationPath: string;
    readonly implementationSha256: string;
    readonly testPath: string;
    readonly testSha256: string;
    readonly verifierPath: string;
    readonly verifierSha256: string;
  };
  readonly remediation: {
    readonly originalDeviationWasModified: false;
    readonly originalStatusObserved: "in_progress";
    readonly closureStatus:
      "closed_by_append_only_record";
    readonly completedActions: readonly string[];
    readonly outstandingActions: readonly [];
  };
  readonly claimBoundary: {
    readonly publicationGovernanceClosed: true;
    readonly publicDevelopmentArtifactsPermanent: true;
    readonly heldOutEligibilityRestored: false;
    readonly researchEvidenceAuthorized: false;
    readonly promotionAuthorized: false;
    readonly providerUsed: false;
    readonly selfImprovementClaim: false;
  };
  readonly closedAt: string;
  readonly recordedBy: PrincipalIdentity;
  readonly recordHash: string;
  readonly publicPrincipal: PublicPrincipal;
  readonly attestation: Attestation;
}

export type PublicationRemediationClosureUnsignedInput = Omit<
  PublicationRemediationClosureRecord,
  | "schemaVersion"
  | "recordType"
  | "recordedBy"
  | "recordHash"
  | "publicPrincipal"
  | "attestation"
>;

type PublicationClosureCore = Omit<
  PublicationRemediationClosureRecord,
  "recordHash" | "publicPrincipal" | "attestation"
>;
type PublicationClosureSignedBody = Omit<
  PublicationRemediationClosureRecord,
  "attestation"
>;

function publicationClosureCore(
  record: PublicationRemediationClosureRecord,
): PublicationClosureCore {
  const {
    recordHash: _recordHash,
    publicPrincipal: _publicPrincipal,
    attestation: _attestation,
    ...core
  } = record;
  return core;
}

function publicationClosureSignedBody(
  record: PublicationRemediationClosureRecord,
): PublicationClosureSignedBody {
  const { attestation: _attestation, ...body } = record;
  return body;
}

export function createPublicationRemediationClosure(input: {
  readonly value: PublicationRemediationClosureUnsignedInput;
  readonly deviation: PublicationDeviationRecord;
  readonly ledger: PublicExposureLedger;
  readonly inventory: PublishedArtifactInventory;
  readonly signer: PrincipalSigner;
  readonly schemas: SchemaRegistry;
}): PublicationRemediationClosureRecord {
  assertProtocolAuthor({
    signer: input.signer,
    action: "sign a publication remediation closure",
  });
  verifyPublicExposureLedger({
    record: input.ledger,
    deviation: input.deviation,
    inventory: input.inventory,
    schemas: input.schemas,
  });
  assertCondition(
    input.value.deviationId ===
      input.deviation.deviationId &&
      input.value.deviationRecordHash ===
        input.deviation.recordHash &&
      input.value.governanceDomainId ===
        input.deviation.governanceDomainId &&
      input.value.inventoryHash ===
        input.inventory.inventoryHash &&
      input.value.publicExposureLedgerId ===
        input.ledger.ledgerId &&
      input.value.publicExposureLedgerHash ===
        input.ledger.ledgerHash &&
      input.deviation.remediation.status ===
        "in_progress",
    "HASH_MISMATCH",
    "Publication closure does not bind deviation, inventory, and ledger",
  );
  const core: PublicationClosureCore = {
    schemaVersion: 1,
    closureId: input.value.closureId,
    recordType: "publication_remediation_closure",
    governanceDomainId: input.value.governanceDomainId,
    deviationId: input.value.deviationId,
    deviationRecordHash:
      input.value.deviationRecordHash,
    correctiveDecision: input.value.correctiveDecision,
    inventoryHash: input.value.inventoryHash,
    publicExposureLedgerId:
      input.value.publicExposureLedgerId,
    publicExposureLedgerHash:
      input.value.publicExposureLedgerHash,
    validatorEvidence: input.value.validatorEvidence,
    remediation: input.value.remediation,
    claimBoundary: input.value.claimBoundary,
    closedAt: input.value.closedAt,
    recordedBy: input.signer.identity,
  };
  const publicPrincipal = input.signer.exportPublic();
  const body: PublicationClosureSignedBody = {
    ...core,
    recordHash: sha256(core as unknown as JsonValue),
    publicPrincipal,
  };
  const record: PublicationRemediationClosureRecord = {
    ...body,
    attestation: input.signer.attest(
      body as unknown as JsonValue,
    ),
  };
  verifyPublicationRemediationClosure({
    record,
    deviation: input.deviation,
    ledger: input.ledger,
    inventory: input.inventory,
    schemas: input.schemas,
  });
  return record;
}

export function verifyPublicationRemediationClosure(input: {
  readonly record: PublicationRemediationClosureRecord;
  readonly deviation: PublicationDeviationRecord;
  readonly ledger: PublicExposureLedger;
  readonly inventory: PublishedArtifactInventory;
  readonly schemas: SchemaRegistry;
}): void {
  input.schemas.validate(
    PUBLICATION_REMEDIATION_CLOSURE_SCHEMA_ID,
    input.record as unknown as JsonValue,
  );
  verifyPublicExposureLedger({
    record: input.ledger,
    deviation: input.deviation,
    inventory: input.inventory,
    schemas: input.schemas,
  });
  assertCondition(
    input.record.deviationId ===
      input.deviation.deviationId &&
      input.record.deviationRecordHash ===
        input.deviation.recordHash &&
      input.record.inventoryHash ===
        input.inventory.inventoryHash &&
      input.record.publicExposureLedgerId ===
        input.ledger.ledgerId &&
      input.record.publicExposureLedgerHash ===
        input.ledger.ledgerHash &&
      canonicalize(
        input.record.correctiveDecision as unknown as JsonValue,
      ) ===
        canonicalize(
          input.deviation
            .dispositionDecision as unknown as JsonValue,
        ) &&
      input.deviation.remediation.status ===
        "in_progress" &&
      input.record.remediation
        .originalDeviationWasModified === false &&
      input.record.remediation.originalStatusObserved ===
        "in_progress" &&
      input.record.remediation.closureStatus ===
        "closed_by_append_only_record" &&
      input.record.remediation.outstandingActions.length ===
        0,
    "INVALID_STATE_TRANSITION",
    "Publication closure does not preserve append-only governance",
  );
  verifySignedProtocolAuthorRecord({
    identity: input.record.recordedBy,
    publicPrincipal: input.record.publicPrincipal,
    signedBody:
      publicationClosureSignedBody(
        input.record,
      ) as unknown as JsonValue,
    attestation: input.record.attestation,
    recordHash: input.record.recordHash,
    expectedRecordHash: sha256(
      publicationClosureCore(
        input.record,
      ) as unknown as JsonValue,
    ),
    label: "Publication remediation closure",
  });
}

export class PublicationDeviationLog {
  readonly #schemas: SchemaRegistry;
  readonly #inventory: PublishedArtifactInventory;
  readonly #log: AppendOnlyLog<JsonValue>;

  public constructor(input: {
    readonly root: string;
    readonly schemas: SchemaRegistry;
    readonly inventory: PublishedArtifactInventory;
  }) {
    this.#schemas = input.schemas;
    this.#inventory = input.inventory;
    this.#log = new AppendOnlyLog<JsonValue>(
      path.join(input.root, "governance"),
      "governance.publication-deviations",
    );
  }

  public async append(
    record: PublicationDeviationRecord,
  ): Promise<AppendOnlyRecord<JsonValue>> {
    verifyPublicationDeviationRecord({
      record,
      inventory: this.#inventory,
      schemas: this.#schemas,
    });
    const records = await this.#log.readAll();
    const prior = records.find(
      (entry) =>
        (
          entry.payload as unknown as PublicationDeviationRecord
        ).deviationId === record.deviationId,
    );
    assertCondition(
      prior === undefined ||
        (
          prior.payload as unknown as PublicationDeviationRecord
        ).recordHash === record.recordHash,
      "CONFLICT",
      "Publication deviation ID was reused with different content",
    );
    if (prior !== undefined) return prior;
    return this.#log.append(record as unknown as JsonValue);
  }
}

export class PublicationRemediationClosureLog {
  readonly #schemas: SchemaRegistry;
  readonly #inventory: PublishedArtifactInventory;
  readonly #deviation: PublicationDeviationRecord;
  readonly #ledger: PublicExposureLedger;
  readonly #log: AppendOnlyLog<JsonValue>;

  public constructor(input: {
    readonly root: string;
    readonly schemas: SchemaRegistry;
    readonly inventory: PublishedArtifactInventory;
    readonly deviation: PublicationDeviationRecord;
    readonly ledger: PublicExposureLedger;
  }) {
    this.#schemas = input.schemas;
    this.#inventory = input.inventory;
    this.#deviation = input.deviation;
    this.#ledger = input.ledger;
    this.#log = new AppendOnlyLog<JsonValue>(
      path.join(input.root, "governance"),
      "governance.publication-remediation-closures",
    );
  }

  public async append(
    record: PublicationRemediationClosureRecord,
  ): Promise<AppendOnlyRecord<JsonValue>> {
    verifyPublicationRemediationClosure({
      record,
      deviation: this.#deviation,
      ledger: this.#ledger,
      inventory: this.#inventory,
      schemas: this.#schemas,
    });
    const records = await this.#log.readAll();
    const prior = records.find(
      (entry) =>
        (
          entry.payload as unknown as PublicationRemediationClosureRecord
        ).closureId === record.closureId,
    );
    assertCondition(
      prior === undefined ||
        (
          prior.payload as unknown as PublicationRemediationClosureRecord
        ).recordHash === record.recordHash,
      "CONFLICT",
      "Publication closure ID was reused with different content",
    );
    if (prior !== undefined) return prior;
    return this.#log.append(record as unknown as JsonValue);
  }
}
