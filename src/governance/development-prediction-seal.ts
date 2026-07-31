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
  verifyDevelopmentAttributionCommitment,
  type DevelopmentAttributionCommitment,
  type DevelopmentAttributionPredictionSet,
  type DevelopmentAttributionPrototypeManifest,
} from "../evaluation/development-attribution.js";
import type { LabelBlindAttributionCorpus } from "../evaluation/hfb-label-blind-adapter.js";
import {
  PrincipalRegistry,
  type Attestation,
  type PrincipalIdentity,
  type PrincipalSigner,
  type PublicPrincipal,
} from "../trust/identity.js";

export const DEVELOPMENT_PREDICTION_SEAL_SCHEMA_ID =
  `${SCHEMA_BASE_URL}development-prediction-seal.schema.json`;

export interface DevelopmentPredictionSealRecord {
  readonly schemaVersion: 1;
  readonly sealId: string;
  readonly recordType: "development_prediction_seal";
  readonly predictionCommitmentHash: string;
  readonly predictionSetHash: string;
  readonly prototypeManifestHash: string;
  readonly corpusHash: string;
  readonly commitmentSealedAt: string;
  readonly commitmentVerified: true;
  readonly durability: {
    readonly appendMode: "exclusive_create";
    readonly fileSyncRequired: true;
    readonly directorySyncRequired: true;
  };
  readonly scorerReleaseAllowed: true;
  readonly developmentOnly: true;
  readonly authorizedForResearchEvidence: false;
  readonly sealedAt: string;
  readonly sealedBy: PrincipalIdentity;
  readonly recordHash: string;
  readonly publicPrincipal: PublicPrincipal;
  readonly attestation: Attestation;
}

type SealCore = Omit<
  DevelopmentPredictionSealRecord,
  "recordHash" | "publicPrincipal" | "attestation"
>;
type SignedBody = Omit<
  DevelopmentPredictionSealRecord,
  "attestation"
>;

function parseTime(value: string, label: string): number {
  const parsed = Date.parse(value);
  assertCondition(
    Number.isFinite(parsed),
    "SCHEMA_INVALID",
    `${label} is not a valid timestamp`,
  );
  return parsed;
}

function sealCore(
  record: DevelopmentPredictionSealRecord,
): SealCore {
  const {
    recordHash: _recordHash,
    publicPrincipal: _publicPrincipal,
    attestation: _attestation,
    ...core
  } = record;
  return core;
}

function signedBody(
  record: DevelopmentPredictionSealRecord,
): SignedBody {
  const { attestation: _attestation, ...body } = record;
  return body;
}

export function createDevelopmentPredictionSeal(input: {
  readonly sealId: string;
  readonly commitment: DevelopmentAttributionCommitment;
  readonly predictionSet: DevelopmentAttributionPredictionSet;
  readonly manifest: DevelopmentAttributionPrototypeManifest;
  readonly corpus: LabelBlindAttributionCorpus;
  readonly sealedAt: string;
  readonly signer: PrincipalSigner;
  readonly schemas: SchemaRegistry;
}): DevelopmentPredictionSealRecord {
  assertCondition(
    input.signer.identity.role === "audit_store",
    "AUTHORIZATION_DENIED",
    "Only the audit authority may durably release a prediction seal",
  );
  verifyDevelopmentAttributionCommitment({
    commitment: input.commitment,
    predictionSet: input.predictionSet,
    manifest: input.manifest,
    corpus: input.corpus,
    schemas: input.schemas,
  });
  assertCondition(
    parseTime(input.sealedAt, "sealedAt") >=
      parseTime(
        input.commitment.sealedAt,
        "commitment.sealedAt",
      ),
    "INVALID_STATE_TRANSITION",
    "Audit seal cannot precede the proposer commitment",
  );
  const core: SealCore = {
    schemaVersion: 1,
    sealId: input.sealId,
    recordType: "development_prediction_seal",
    predictionCommitmentHash:
      input.commitment.commitmentHash,
    predictionSetHash:
      input.predictionSet.predictionSetHash,
    prototypeManifestHash: input.manifest.manifestHash,
    corpusHash: input.corpus.corpusHash,
    commitmentSealedAt: input.commitment.sealedAt,
    commitmentVerified: true,
    durability: {
      appendMode: "exclusive_create",
      fileSyncRequired: true,
      directorySyncRequired: true,
    },
    scorerReleaseAllowed: true,
    developmentOnly: true,
    authorizedForResearchEvidence: false,
    sealedAt: input.sealedAt,
    sealedBy: input.signer.identity,
  };
  const publicPrincipal = input.signer.exportPublic();
  const body: SignedBody = {
    ...core,
    recordHash: sha256(core as unknown as JsonValue),
    publicPrincipal,
  };
  const record: DevelopmentPredictionSealRecord = {
    ...body,
    attestation: input.signer.attest(
      body as unknown as JsonValue,
    ),
  };
  verifyDevelopmentPredictionSeal({
    record,
    commitment: input.commitment,
    predictionSet: input.predictionSet,
    manifest: input.manifest,
    corpus: input.corpus,
    schemas: input.schemas,
  });
  return record;
}

export function verifyDevelopmentPredictionSeal(input: {
  readonly record: DevelopmentPredictionSealRecord;
  readonly commitment: DevelopmentAttributionCommitment;
  readonly predictionSet: DevelopmentAttributionPredictionSet;
  readonly manifest: DevelopmentAttributionPrototypeManifest;
  readonly corpus: LabelBlindAttributionCorpus;
  readonly schemas: SchemaRegistry;
}): void {
  input.schemas.validate(
    DEVELOPMENT_PREDICTION_SEAL_SCHEMA_ID,
    input.record as unknown as JsonValue,
  );
  verifyDevelopmentAttributionCommitment({
    commitment: input.commitment,
    predictionSet: input.predictionSet,
    manifest: input.manifest,
    corpus: input.corpus,
    schemas: input.schemas,
  });
  assertCondition(
    input.record.predictionCommitmentHash ===
      input.commitment.commitmentHash &&
      input.record.predictionSetHash ===
        input.predictionSet.predictionSetHash &&
      input.record.prototypeManifestHash ===
        input.manifest.manifestHash &&
      input.record.corpusHash === input.corpus.corpusHash &&
      input.record.commitmentSealedAt ===
        input.commitment.sealedAt &&
      parseTime(input.record.sealedAt, "sealedAt") >=
        parseTime(
          input.commitment.sealedAt,
          "commitment.sealedAt",
        ),
    "HASH_MISMATCH",
    "Prediction seal does not bind the verified commitment",
  );
  assertCondition(
    input.record.sealedBy.role === "audit_store" &&
      canonicalize(input.record.publicPrincipal.identity) ===
        canonicalize(input.record.sealedBy),
    "AUTHORIZATION_DENIED",
    "Prediction seal is not signed by its audit authority",
  );
  assertCondition(
    input.record.recordHash ===
      sha256(sealCore(input.record) as unknown as JsonValue),
    "HASH_MISMATCH",
    "Prediction seal hash mismatch",
  );
  const principals = new PrincipalRegistry();
  principals.register(input.record.publicPrincipal);
  principals.verify(
    input.record.sealedBy,
    signedBody(input.record) as unknown as JsonValue,
    input.record.attestation,
  );
}
