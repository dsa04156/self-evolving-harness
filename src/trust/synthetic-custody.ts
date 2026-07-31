import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";

import {
  canonicalBytes,
  canonicalize,
  sha256,
  sha256Bytes,
  type JsonValue,
} from "../core/canonical.js";
import {
  HarnessError,
  asHarnessError,
  assertCondition,
  type HarnessErrorCode,
} from "../core/errors.js";
import {
  SCHEMA_BASE_URL,
  type SchemaRegistry,
} from "../contracts/schema-registry.js";
import {
  CasAppendOnlyLog,
  type CasAppendOnlyRecord,
} from "../storage/cas-append-only-log.js";
import {
  PrincipalRegistry,
  type Attestation,
  type PrincipalIdentity,
  type PrincipalSigner,
  type PublicPrincipal,
} from "./identity.js";
import type {
  EvaluatorVaultContract,
} from "./evaluator-vault-contract.js";

export const SYNTHETIC_CUSTODY_ENVELOPE_SCHEMA_ID =
  `${SCHEMA_BASE_URL}synthetic-custody-envelope.schema.json`;
export const SYNTHETIC_CUSTODY_DESCRIPTOR_SCHEMA_ID =
  `${SCHEMA_BASE_URL}synthetic-custody-descriptor.schema.json`;
export const SYNTHETIC_CUSTODY_CAPABILITY_SCHEMA_ID =
  `${SCHEMA_BASE_URL}synthetic-custody-capability.schema.json`;
export const SYNTHETIC_CUSTODY_RELEASE_REQUEST_SCHEMA_ID =
  `${SCHEMA_BASE_URL}synthetic-custody-release-request.schema.json`;
export const SYNTHETIC_CUSTODY_TRANSITION_SCHEMA_ID =
  `${SCHEMA_BASE_URL}synthetic-custody-transition.schema.json`;
export const SYNTHETIC_CUSTODY_EVALUATOR_RECEIPT_SCHEMA_ID =
  `${SCHEMA_BASE_URL}synthetic-custody-evaluator-receipt.schema.json`;

export const SYNTHETIC_CUSTODY_PAYLOAD_LENGTH = 64;

export type SyntheticCustodyState =
  | "sealed"
  | "release_reserved"
  | "materialization_started"
  | "cleaned";

export type SyntheticCustodyAction =
  | "seal"
  | "reserve_release"
  | "begin_materialization"
  | "deny_release"
  | "cleanup";

export type SyntheticCustodyCleanupReason =
  | "normal_completion"
  | "evaluator_crash"
  | "vault_crash_recovery"
  | "timeout"
  | "capability_rejection"
  | "response_loss";

export interface SyntheticCustodyAad {
  readonly schemaVersion: 1;
  readonly recordType: "synthetic_custody_aad";
  readonly custodyId: string;
  readonly protocolId: string;
  readonly contractId: string;
  readonly contractHash: string;
  readonly taskHandleCommitment: string;
  readonly authorCommitmentHash: string;
  readonly includedTransitionHash: string;
  readonly admittedVaultStateHead: string;
  readonly unlockCapabilityHash: string;
  readonly plaintextCommitment: string;
  readonly payloadLength: 64;
}

export interface SyntheticCustodyEnvelope {
  readonly schemaVersion: 1;
  readonly recordType: "synthetic_custody_envelope";
  readonly algorithm: "aes-256-gcm";
  readonly custodyId: string;
  readonly aad: SyntheticCustodyAad;
  readonly nonce: string;
  readonly ciphertext: string;
  readonly authenticationTag: string;
  readonly ciphertextCommitment: string;
  readonly envelopeHash: string;
}

export interface SyntheticCustodyDescriptor {
  readonly schemaVersion: 1;
  readonly recordType: "synthetic_custody_descriptor";
  readonly custodyId: string;
  readonly protocolId: string;
  readonly contractId: string;
  readonly contractHash: string;
  readonly taskHandleCommitment: string;
  readonly authorCommitmentHash: string;
  readonly includedTransitionHash: string;
  readonly admittedVaultStateHead: string;
  readonly unlockCapabilityHash: string;
  readonly payloadClass:
    "fixed_inert_bytes_no_research_semantics";
  readonly payloadLength: 64;
  readonly plaintextCommitment: string;
  readonly keyCommitment: string;
  readonly ciphertextCommitment: string;
  readonly envelopeHash: string;
  readonly encryptionAlgorithm: "aes-256-gcm";
  readonly keyAuthority:
    "vault_exclusive_ephemeral_test_root";
  readonly createdAt: string;
  readonly createdBy: PrincipalIdentity;
  readonly recordHash: string;
  readonly publicPrincipal: PublicPrincipal;
  readonly attestation: Attestation;
}

export interface SyntheticCustodyCapability {
  readonly schemaVersion: 1;
  readonly recordType: "synthetic_custody_capability";
  readonly capabilityId: string;
  readonly custodyId: string;
  readonly protocolId: string;
  readonly contractId: string;
  readonly contractHash: string;
  readonly descriptorHash: string;
  readonly taskHandleCommitment: string;
  readonly includedTransitionHash: string;
  readonly admittedVaultStateHead: string;
  readonly unlockCapabilityHash: string;
  readonly plaintextCommitment: string;
  readonly recipient: PrincipalIdentity;
  readonly allowedAction: "materialize_once";
  readonly singleUse: true;
  readonly reusableDecryptionAuthority: false;
  readonly issuedAt: string;
  readonly expiresAt: string;
  readonly nonce: string;
  readonly issuedBy: PrincipalIdentity;
  readonly capabilityHash: string;
  readonly publicPrincipal: PublicPrincipal;
  readonly attestation: Attestation;
}

export interface SyntheticCustodyReleaseRequest {
  readonly schemaVersion: 1;
  readonly recordType:
    "synthetic_custody_release_request";
  readonly requestId: string;
  readonly protocolId: string;
  readonly contractId: string;
  readonly contractHash: string;
  readonly custodyId: string;
  readonly descriptorHash: string;
  readonly capability: SyntheticCustodyCapability;
  readonly senderSequence: number;
  readonly nonce: string;
  readonly requestedAt: string;
  readonly actor: PrincipalIdentity;
  readonly requestHash: string;
  readonly publicPrincipal: PublicPrincipal;
  readonly attestation: Attestation;
}

export interface SyntheticCustodyTransition {
  readonly schemaVersion: 1;
  readonly recordType: "synthetic_custody_transition";
  readonly transitionId: string;
  readonly protocolId: string;
  readonly contractId: string;
  readonly contractHash: string;
  readonly custodyId: string;
  readonly descriptorHash: string;
  readonly taskHandleCommitment: string;
  readonly includedTransitionHash: string;
  readonly admittedVaultStateHead: string;
  readonly unlockCapabilityHash: string;
  readonly plaintextCommitment: string;
  readonly payloadLength: 64;
  readonly priorTransitionHash: string | null;
  readonly priorJournalHead: string | null;
  readonly action: SyntheticCustodyAction;
  readonly requestCommitment: string | null;
  readonly capabilityCommitment: string | null;
  readonly releaseId: string | null;
  readonly stateBefore: SyntheticCustodyState | null;
  readonly stateAfter: SyntheticCustodyState;
  readonly stateSuccessor: boolean;
  readonly decision: "allowed" | "denied";
  readonly reasonCode: string;
  readonly cleanupReason:
    SyntheticCustodyCleanupReason | null;
  readonly keyReleased: false;
  readonly ciphertextReleased: false;
  readonly plaintextRetained: false;
  readonly keyDestroyed: boolean;
  readonly ciphertextDestroyed: boolean;
  readonly plaintextCleanupConfirmed: boolean;
  readonly occurredAt: string;
  readonly recordedBy: PrincipalIdentity;
  readonly recordHash: string;
  readonly publicPrincipal: PublicPrincipal;
  readonly attestation: Attestation;
}

export interface SyntheticCustodyEvaluatorReceipt {
  readonly schemaVersion: 1;
  readonly recordType:
    "synthetic_custody_evaluator_receipt";
  readonly receiptId: string;
  readonly protocolId: string;
  readonly contractHash: string;
  readonly custodyId: string;
  readonly descriptorHash: string;
  readonly releaseId: string;
  readonly observedPlaintextCommitment: string;
  readonly observedPayloadLength: 64;
  readonly readOnlyMaterialization: true;
  readonly encryptionKeyPresent: false;
  readonly ciphertextPresent: false;
  readonly reusableDecryptionAuthorityPresent: false;
  readonly taskBodyPresent: false;
  readonly verifierLogicPresent: false;
  readonly modelPromptPresent: false;
  readonly consumedAt: string;
  readonly consumedBy: PrincipalIdentity;
  readonly recordHash: string;
  readonly publicPrincipal: PublicPrincipal;
  readonly attestation: Attestation;
}

type DescriptorCore = Omit<
  SyntheticCustodyDescriptor,
  "recordHash" | "publicPrincipal" | "attestation"
>;
type DescriptorSignedBody = Omit<
  SyntheticCustodyDescriptor,
  "attestation"
>;
type CapabilityCore = Omit<
  SyntheticCustodyCapability,
  "capabilityHash" | "publicPrincipal" | "attestation"
>;
type CapabilitySignedBody = Omit<
  SyntheticCustodyCapability,
  "attestation"
>;
type RequestCore = Omit<
  SyntheticCustodyReleaseRequest,
  "requestHash" | "publicPrincipal" | "attestation"
>;
type RequestSignedBody = Omit<
  SyntheticCustodyReleaseRequest,
  "attestation"
>;
type TransitionCore = Omit<
  SyntheticCustodyTransition,
  "recordHash" | "publicPrincipal" | "attestation"
>;
type TransitionSignedBody = Omit<
  SyntheticCustodyTransition,
  "attestation"
>;
type EvaluatorReceiptCore = Omit<
  SyntheticCustodyEvaluatorReceipt,
  "recordHash" | "publicPrincipal" | "attestation"
>;
type EvaluatorReceiptSignedBody = Omit<
  SyntheticCustodyEvaluatorReceipt,
  "attestation"
>;

function byteCommitment(
  bytes: Uint8Array,
): `sha256:${string}` {
  return `sha256:${sha256Bytes(bytes)}`;
}

function assertHash(
  value: string,
  label: string,
): void {
  assertCondition(
    /^sha256:[a-f0-9]{64}$/u.test(value),
    "SCHEMA_INVALID",
    `${label} is not a SHA-256 commitment`,
  );
}

function parseTimestamp(
  value: string,
  label: string,
): number {
  const parsed = Date.parse(value);
  assertCondition(
    Number.isFinite(parsed),
    "SCHEMA_INVALID",
    `${label} is not a timestamp`,
  );
  return parsed;
}

function samePrincipal(
  left: PublicPrincipal,
  right: PublicPrincipal,
): boolean {
  return (
    canonicalize(left as unknown as JsonValue) ===
    canonicalize(right as unknown as JsonValue)
  );
}

function assertSigner(
  signer: PrincipalSigner,
  expected: PublicPrincipal,
  label: string,
): void {
  assertCondition(
    samePrincipal(signer.exportPublic(), expected),
    "AUTHENTICATION_FAILED",
    `${label} signer is not the frozen principal`,
  );
}

function descriptorCore(
  record: SyntheticCustodyDescriptor,
): DescriptorCore {
  const {
    recordHash: _recordHash,
    publicPrincipal: _publicPrincipal,
    attestation: _attestation,
    ...core
  } = record;
  return core;
}

function descriptorSignedBody(
  record: SyntheticCustodyDescriptor,
): DescriptorSignedBody {
  const { attestation: _attestation, ...body } = record;
  return body;
}

function capabilityCore(
  record: SyntheticCustodyCapability,
): CapabilityCore {
  const {
    capabilityHash: _capabilityHash,
    publicPrincipal: _publicPrincipal,
    attestation: _attestation,
    ...core
  } = record;
  return core;
}

function capabilitySignedBody(
  record: SyntheticCustodyCapability,
): CapabilitySignedBody {
  const { attestation: _attestation, ...body } = record;
  return body;
}

function requestCore(
  record: SyntheticCustodyReleaseRequest,
): RequestCore {
  const {
    requestHash: _requestHash,
    publicPrincipal: _publicPrincipal,
    attestation: _attestation,
    ...core
  } = record;
  return core;
}

function requestSignedBody(
  record: SyntheticCustodyReleaseRequest,
): RequestSignedBody {
  const { attestation: _attestation, ...body } = record;
  return body;
}

function transitionCore(
  record: SyntheticCustodyTransition,
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
  record: SyntheticCustodyTransition,
): TransitionSignedBody {
  const { attestation: _attestation, ...body } = record;
  return body;
}

function evaluatorReceiptCore(
  record: SyntheticCustodyEvaluatorReceipt,
): EvaluatorReceiptCore {
  const {
    recordHash: _recordHash,
    publicPrincipal: _publicPrincipal,
    attestation: _attestation,
    ...core
  } = record;
  return core;
}

function evaluatorReceiptSignedBody(
  record: SyntheticCustodyEvaluatorReceipt,
): EvaluatorReceiptSignedBody {
  const { attestation: _attestation, ...body } = record;
  return body;
}

function registryWith(
  principal: PublicPrincipal,
): PrincipalRegistry {
  const registry = new PrincipalRegistry();
  registry.register(principal);
  return registry;
}

export function fixedInertSyntheticPayload(): Buffer {
  const payload = Buffer.alloc(
    SYNTHETIC_CUSTODY_PAYLOAD_LENGTH,
  );
  for (
    let index = 0;
    index < payload.length;
    index += 1
  ) {
    payload[index] = (index * 73 + 19) % 256;
  }
  return payload;
}

export function createEncryptedSyntheticCustody(input: {
  readonly custodyId: string;
  readonly taskHandleCommitment: string;
  readonly authorCommitmentHash: string;
  readonly includedTransitionHash: string;
  readonly admittedVaultStateHead: string;
  readonly unlockCapabilityHash: string;
  readonly payload: Uint8Array;
  readonly createdAt: string;
  readonly signer: PrincipalSigner;
  readonly contract: EvaluatorVaultContract;
  readonly schemas: SchemaRegistry;
  readonly key?: Uint8Array;
  readonly nonce?: Uint8Array;
}): {
  readonly key: Buffer;
  readonly envelope: SyntheticCustodyEnvelope;
  readonly descriptor: SyntheticCustodyDescriptor;
} {
  assertSigner(
    input.signer,
    input.contract.principalMatrix.vault,
    "Synthetic custody",
  );
  assertCondition(
    input.payload.byteLength ===
      SYNTHETIC_CUSTODY_PAYLOAD_LENGTH,
    "SCHEMA_INVALID",
    "Synthetic custody payload must contain exactly 64 inert bytes",
  );
  for (const [value, label] of [
    [input.taskHandleCommitment, "task handle"],
    [input.authorCommitmentHash, "author commitment"],
    [input.includedTransitionHash, "included transition"],
    [input.admittedVaultStateHead, "vault state head"],
    [input.unlockCapabilityHash, "unlock capability"],
  ] as const) {
    assertHash(value, label);
  }
  parseTimestamp(input.createdAt, "createdAt");
  const key = Buffer.from(
    input.key ?? randomBytes(32),
  );
  const nonce = Buffer.from(
    input.nonce ?? randomBytes(12),
  );
  assertCondition(
    key.length === 32 && nonce.length === 12,
    "SCHEMA_INVALID",
    "AES-256-GCM requires a 32-byte key and 12-byte nonce",
  );
  const plaintextCommitment = byteCommitment(
    input.payload,
  );
  const aad: SyntheticCustodyAad = {
    schemaVersion: 1,
    recordType: "synthetic_custody_aad",
    custodyId: input.custodyId,
    protocolId: input.contract.protocolId,
    contractId: input.contract.contractId,
    contractHash: input.contract.contractHash,
    taskHandleCommitment:
      input.taskHandleCommitment,
    authorCommitmentHash:
      input.authorCommitmentHash,
    includedTransitionHash:
      input.includedTransitionHash,
    admittedVaultStateHead:
      input.admittedVaultStateHead,
    unlockCapabilityHash:
      input.unlockCapabilityHash,
    plaintextCommitment,
    payloadLength: SYNTHETIC_CUSTODY_PAYLOAD_LENGTH,
  };
  const cipher = createCipheriv(
    "aes-256-gcm",
    key,
    nonce,
  );
  cipher.setAAD(canonicalBytes(aad));
  const ciphertext = Buffer.concat([
    cipher.update(input.payload),
    cipher.final(),
  ]);
  const authenticationTag = cipher.getAuthTag();
  const envelopeCore = {
    schemaVersion: 1 as const,
    recordType:
      "synthetic_custody_envelope" as const,
    algorithm: "aes-256-gcm" as const,
    custodyId: input.custodyId,
    aad,
    nonce: nonce.toString("base64url"),
    ciphertext: ciphertext.toString("base64url"),
    authenticationTag:
      authenticationTag.toString("base64url"),
    ciphertextCommitment:
      byteCommitment(ciphertext),
  };
  const envelope: SyntheticCustodyEnvelope = {
    ...envelopeCore,
    envelopeHash: sha256(
      envelopeCore as unknown as JsonValue,
    ),
  };
  input.schemas.validate(
    SYNTHETIC_CUSTODY_ENVELOPE_SCHEMA_ID,
    envelope as unknown as JsonValue,
  );
  const core: DescriptorCore = {
    schemaVersion: 1,
    recordType: "synthetic_custody_descriptor",
    custodyId: input.custodyId,
    protocolId: input.contract.protocolId,
    contractId: input.contract.contractId,
    contractHash: input.contract.contractHash,
    taskHandleCommitment:
      input.taskHandleCommitment,
    authorCommitmentHash:
      input.authorCommitmentHash,
    includedTransitionHash:
      input.includedTransitionHash,
    admittedVaultStateHead:
      input.admittedVaultStateHead,
    unlockCapabilityHash:
      input.unlockCapabilityHash,
    payloadClass:
      "fixed_inert_bytes_no_research_semantics",
    payloadLength: SYNTHETIC_CUSTODY_PAYLOAD_LENGTH,
    plaintextCommitment,
    keyCommitment: byteCommitment(key),
    ciphertextCommitment:
      envelope.ciphertextCommitment,
    envelopeHash: envelope.envelopeHash,
    encryptionAlgorithm: "aes-256-gcm",
    keyAuthority:
      "vault_exclusive_ephemeral_test_root",
    createdAt: input.createdAt,
    createdBy: input.signer.identity,
  };
  const publicPrincipal =
    input.signer.exportPublic();
  const body: DescriptorSignedBody = {
    ...core,
    recordHash: sha256(
      core as unknown as JsonValue,
    ),
    publicPrincipal,
  };
  const descriptor: SyntheticCustodyDescriptor = {
    ...body,
    attestation: input.signer.attest(
      body as unknown as JsonValue,
    ),
  };
  verifySyntheticCustodyDescriptor({
    record: descriptor,
    contract: input.contract,
    schemas: input.schemas,
  });
  return { key, envelope, descriptor };
}

export function verifySyntheticCustodyDescriptor(input: {
  readonly record: SyntheticCustodyDescriptor;
  readonly contract: EvaluatorVaultContract;
  readonly schemas: SchemaRegistry;
}): void {
  input.schemas.validate(
    SYNTHETIC_CUSTODY_DESCRIPTOR_SCHEMA_ID,
    input.record as unknown as JsonValue,
  );
  assertCondition(
    input.record.protocolId ===
      input.contract.protocolId &&
      input.record.contractId ===
        input.contract.contractId &&
      input.record.contractHash ===
        input.contract.contractHash,
    "PROTOCOL_MISMATCH",
    "Synthetic custody descriptor belongs to another contract",
  );
  assertCondition(
    samePrincipal(
      input.record.publicPrincipal,
      input.contract.principalMatrix.vault,
    ) &&
      canonicalize(
        input.record.createdBy as unknown as JsonValue,
      ) ===
        canonicalize(
          input.contract.principalMatrix.vault
            .identity as unknown as JsonValue,
        ),
    "AUTHENTICATION_FAILED",
    "Synthetic custody descriptor is not vault-authored",
  );
  const core = descriptorCore(input.record);
  assertCondition(
    input.record.recordHash ===
      sha256(core as unknown as JsonValue),
    "HASH_MISMATCH",
    "Synthetic custody descriptor hash mismatch",
  );
  registryWith(input.record.publicPrincipal).verify(
    input.record.createdBy,
    descriptorSignedBody(
      input.record,
    ) as unknown as JsonValue,
    input.record.attestation,
  );
}

export function decryptSyntheticCustody(input: {
  readonly key: Uint8Array;
  readonly envelope: SyntheticCustodyEnvelope;
  readonly descriptor: SyntheticCustodyDescriptor;
  readonly contract: EvaluatorVaultContract;
  readonly schemas: SchemaRegistry;
}): Buffer {
  verifySyntheticCustodyDescriptor({
    record: input.descriptor,
    contract: input.contract,
    schemas: input.schemas,
  });
  input.schemas.validate(
    SYNTHETIC_CUSTODY_ENVELOPE_SCHEMA_ID,
    input.envelope as unknown as JsonValue,
  );
  const {
    envelopeHash: _envelopeHash,
    ...envelopeCore
  } = input.envelope;
  const ciphertext = Buffer.from(
    input.envelope.ciphertext,
    "base64url",
  );
  assertCondition(
    input.envelope.envelopeHash ===
      sha256(envelopeCore as unknown as JsonValue) &&
      input.envelope.envelopeHash ===
        input.descriptor.envelopeHash &&
      byteCommitment(ciphertext) ===
        input.envelope.ciphertextCommitment &&
      input.envelope.ciphertextCommitment ===
        input.descriptor.ciphertextCommitment,
    "HASH_MISMATCH",
    "Synthetic custody envelope commitment mismatch",
  );
  const expectedAad: SyntheticCustodyAad = {
    schemaVersion: 1,
    recordType: "synthetic_custody_aad",
    custodyId: input.descriptor.custodyId,
    protocolId: input.descriptor.protocolId,
    contractId: input.descriptor.contractId,
    contractHash: input.descriptor.contractHash,
    taskHandleCommitment:
      input.descriptor.taskHandleCommitment,
    authorCommitmentHash:
      input.descriptor.authorCommitmentHash,
    includedTransitionHash:
      input.descriptor.includedTransitionHash,
    admittedVaultStateHead:
      input.descriptor.admittedVaultStateHead,
    unlockCapabilityHash:
      input.descriptor.unlockCapabilityHash,
    plaintextCommitment:
      input.descriptor.plaintextCommitment,
    payloadLength: input.descriptor.payloadLength,
  };
  assertCondition(
    canonicalize(
      input.envelope.aad as unknown as JsonValue,
    ) ===
      canonicalize(
        expectedAad as unknown as JsonValue,
      ),
    "HASH_MISMATCH",
    "Synthetic custody authenticated data changed",
  );
  assertCondition(
    input.key.byteLength === 32,
    "AUTHENTICATION_FAILED",
    "Synthetic custody key has the wrong length",
  );
  assertCondition(
    byteCommitment(input.key) ===
      input.descriptor.keyCommitment,
    "AUTHENTICATION_FAILED",
    "Synthetic custody key commitment mismatch",
  );
  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      input.key,
      Buffer.from(input.envelope.nonce, "base64url"),
    );
    decipher.setAAD(canonicalBytes(expectedAad));
    decipher.setAuthTag(
      Buffer.from(
        input.envelope.authenticationTag,
        "base64url",
      ),
    );
    const plaintext = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);
    assertCondition(
      plaintext.length ===
        input.descriptor.payloadLength &&
        byteCommitment(plaintext) ===
          input.descriptor.plaintextCommitment,
      "HASH_MISMATCH",
      "Synthetic custody plaintext commitment mismatch",
    );
    return plaintext;
  } catch (error) {
    if (error instanceof HarnessError) throw error;
    throw new HarnessError(
      "AUTHENTICATION_FAILED",
      "Synthetic custody envelope authentication failed",
      { cause: error },
    );
  }
}

export function createSyntheticCustodyCapability(input: {
  readonly capabilityId: string;
  readonly descriptor: SyntheticCustodyDescriptor;
  readonly issuedAt: string;
  readonly expiresAt: string;
  readonly nonce: string;
  readonly signer: PrincipalSigner;
  readonly contract: EvaluatorVaultContract;
  readonly schemas: SchemaRegistry;
}): SyntheticCustodyCapability {
  verifySyntheticCustodyDescriptor({
    record: input.descriptor,
    contract: input.contract,
    schemas: input.schemas,
  });
  assertSigner(
    input.signer,
    input.contract.principalMatrix.vault,
    "Synthetic custody capability",
  );
  assertCondition(
    parseTimestamp(input.issuedAt, "issuedAt") <
      parseTimestamp(input.expiresAt, "expiresAt"),
    "SCHEMA_INVALID",
    "Synthetic custody capability expiry must follow issuance",
  );
  const core: CapabilityCore = {
    schemaVersion: 1,
    recordType: "synthetic_custody_capability",
    capabilityId: input.capabilityId,
    custodyId: input.descriptor.custodyId,
    protocolId: input.descriptor.protocolId,
    contractId: input.descriptor.contractId,
    contractHash: input.descriptor.contractHash,
    descriptorHash: input.descriptor.recordHash,
    taskHandleCommitment:
      input.descriptor.taskHandleCommitment,
    includedTransitionHash:
      input.descriptor.includedTransitionHash,
    admittedVaultStateHead:
      input.descriptor.admittedVaultStateHead,
    unlockCapabilityHash:
      input.descriptor.unlockCapabilityHash,
    plaintextCommitment:
      input.descriptor.plaintextCommitment,
    recipient:
      input.contract.principalMatrix.evaluator
        .identity,
    allowedAction: "materialize_once",
    singleUse: true,
    reusableDecryptionAuthority: false,
    issuedAt: input.issuedAt,
    expiresAt: input.expiresAt,
    nonce: input.nonce,
    issuedBy: input.signer.identity,
  };
  const publicPrincipal =
    input.signer.exportPublic();
  const body: CapabilitySignedBody = {
    ...core,
    capabilityHash: sha256(
      core as unknown as JsonValue,
    ),
    publicPrincipal,
  };
  const capability: SyntheticCustodyCapability = {
    ...body,
    attestation: input.signer.attest(
      body as unknown as JsonValue,
    ),
  };
  verifySyntheticCustodyCapability({
    record: capability,
    descriptor: input.descriptor,
    now: input.issuedAt,
    contract: input.contract,
    schemas: input.schemas,
  });
  return capability;
}

export function verifySyntheticCustodyCapability(input: {
  readonly record: SyntheticCustodyCapability;
  readonly descriptor: SyntheticCustodyDescriptor;
  readonly now: string;
  readonly contract: EvaluatorVaultContract;
  readonly schemas: SchemaRegistry;
}): void {
  input.schemas.validate(
    SYNTHETIC_CUSTODY_CAPABILITY_SCHEMA_ID,
    input.record as unknown as JsonValue,
  );
  verifySyntheticCustodyDescriptor({
    record: input.descriptor,
    contract: input.contract,
    schemas: input.schemas,
  });
  const core = capabilityCore(input.record);
  assertCondition(
    input.record.capabilityHash ===
      sha256(core as unknown as JsonValue),
    "HASH_MISMATCH",
    "Synthetic custody capability hash mismatch",
  );
  assertCondition(
    samePrincipal(
      input.record.publicPrincipal,
      input.contract.principalMatrix.vault,
    ) &&
      canonicalize(
        input.record.issuedBy as unknown as JsonValue,
      ) ===
        canonicalize(
          input.contract.principalMatrix.vault
            .identity as unknown as JsonValue,
        ),
    "AUTHENTICATION_FAILED",
    "Synthetic custody capability is not vault-issued",
  );
  const bindingMatches =
    input.record.custodyId ===
      input.descriptor.custodyId &&
    input.record.protocolId ===
      input.descriptor.protocolId &&
    input.record.contractId ===
      input.descriptor.contractId &&
    input.record.contractHash ===
      input.descriptor.contractHash &&
    input.record.descriptorHash ===
      input.descriptor.recordHash &&
    input.record.taskHandleCommitment ===
      input.descriptor.taskHandleCommitment &&
    input.record.includedTransitionHash ===
      input.descriptor.includedTransitionHash &&
    input.record.admittedVaultStateHead ===
      input.descriptor.admittedVaultStateHead &&
    input.record.unlockCapabilityHash ===
      input.descriptor.unlockCapabilityHash &&
    input.record.plaintextCommitment ===
      input.descriptor.plaintextCommitment &&
    canonicalize(
      input.record.recipient as unknown as JsonValue,
    ) ===
      canonicalize(
        input.contract.principalMatrix.evaluator
          .identity as unknown as JsonValue,
      );
  assertCondition(
    bindingMatches,
    "AUTHORIZATION_DENIED",
    "Synthetic custody capability binding mismatch",
  );
  const now = parseTimestamp(input.now, "now");
  assertCondition(
    now >=
      parseTimestamp(
        input.record.issuedAt,
        "issuedAt",
      ) &&
      now <=
        parseTimestamp(
          input.record.expiresAt,
          "expiresAt",
        ),
    "AUTHORIZATION_DENIED",
    "Synthetic custody capability is not currently valid",
  );
  registryWith(input.record.publicPrincipal).verify(
    input.record.issuedBy,
    capabilitySignedBody(
      input.record,
    ) as unknown as JsonValue,
    input.record.attestation,
  );
}

export function createSyntheticCustodyReleaseRequest(input: {
  readonly requestId: string;
  readonly descriptor: SyntheticCustodyDescriptor;
  readonly capability: SyntheticCustodyCapability;
  readonly senderSequence: number;
  readonly nonce: string;
  readonly requestedAt: string;
  readonly signer: PrincipalSigner;
  readonly contract: EvaluatorVaultContract;
  readonly schemas: SchemaRegistry;
}): SyntheticCustodyReleaseRequest {
  verifySyntheticCustodyCapability({
    record: input.capability,
    descriptor: input.descriptor,
    now: input.capability.issuedAt,
    contract: input.contract,
    schemas: input.schemas,
  });
  assertSigner(
    input.signer,
    input.contract.principalMatrix.evaluator,
    "Synthetic custody request",
  );
  assertCondition(
    Number.isSafeInteger(input.senderSequence) &&
      input.senderSequence >= 0,
    "SCHEMA_INVALID",
    "Synthetic custody sender sequence is invalid",
  );
  const core: RequestCore = {
    schemaVersion: 1,
    recordType:
      "synthetic_custody_release_request",
    requestId: input.requestId,
    protocolId: input.descriptor.protocolId,
    contractId: input.descriptor.contractId,
    contractHash: input.descriptor.contractHash,
    custodyId: input.descriptor.custodyId,
    descriptorHash: input.descriptor.recordHash,
    capability: input.capability,
    senderSequence: input.senderSequence,
    nonce: input.nonce,
    requestedAt: input.requestedAt,
    actor: input.signer.identity,
  };
  const publicPrincipal =
    input.signer.exportPublic();
  const body: RequestSignedBody = {
    ...core,
    requestHash: sha256(
      core as unknown as JsonValue,
    ),
    publicPrincipal,
  };
  const request: SyntheticCustodyReleaseRequest = {
    ...body,
    attestation: input.signer.attest(
      body as unknown as JsonValue,
    ),
  };
  verifySyntheticCustodyReleaseRequest({
    record: request,
    descriptor: input.descriptor,
    now: input.capability.issuedAt,
    contract: input.contract,
    schemas: input.schemas,
  });
  return request;
}

export function verifySyntheticCustodyReleaseRequest(input: {
  readonly record: SyntheticCustodyReleaseRequest;
  readonly descriptor: SyntheticCustodyDescriptor;
  readonly now: string;
  readonly contract: EvaluatorVaultContract;
  readonly schemas: SchemaRegistry;
}): void {
  input.schemas.validate(
    SYNTHETIC_CUSTODY_RELEASE_REQUEST_SCHEMA_ID,
    input.record as unknown as JsonValue,
  );
  verifySyntheticCustodyCapability({
    record: input.record.capability,
    descriptor: input.descriptor,
    now: input.now,
    contract: input.contract,
    schemas: input.schemas,
  });
  const core = requestCore(input.record);
  assertCondition(
    input.record.requestHash ===
      sha256(core as unknown as JsonValue),
    "HASH_MISMATCH",
    "Synthetic custody request hash mismatch",
  );
  assertCondition(
    input.record.protocolId ===
      input.descriptor.protocolId &&
      input.record.contractId ===
        input.descriptor.contractId &&
      input.record.contractHash ===
        input.descriptor.contractHash &&
      input.record.custodyId ===
        input.descriptor.custodyId &&
      input.record.descriptorHash ===
        input.descriptor.recordHash,
    "PROTOCOL_MISMATCH",
    "Synthetic custody request binding mismatch",
  );
  assertCondition(
    samePrincipal(
      input.record.publicPrincipal,
      input.contract.principalMatrix.evaluator,
    ) &&
      canonicalize(
        input.record.actor as unknown as JsonValue,
      ) ===
        canonicalize(
          input.contract.principalMatrix.evaluator
            .identity as unknown as JsonValue,
        ),
    "AUTHENTICATION_FAILED",
    "Synthetic custody request is not evaluator-authored",
  );
  registryWith(input.record.publicPrincipal).verify(
    input.record.actor,
    requestSignedBody(
      input.record,
    ) as unknown as JsonValue,
    input.record.attestation,
  );
}

export function createSyntheticCustodyEvaluatorReceipt(input: {
  readonly receiptId: string;
  readonly descriptor: SyntheticCustodyDescriptor;
  readonly releaseId: string;
  readonly observedPayload: Uint8Array;
  readonly consumedAt: string;
  readonly signer: PrincipalSigner;
  readonly contract: EvaluatorVaultContract;
  readonly schemas: SchemaRegistry;
}): SyntheticCustodyEvaluatorReceipt {
  verifySyntheticCustodyDescriptor({
    record: input.descriptor,
    contract: input.contract,
    schemas: input.schemas,
  });
  assertSigner(
    input.signer,
    input.contract.principalMatrix.evaluator,
    "Synthetic custody evaluator receipt",
  );
  assertCondition(
    input.observedPayload.byteLength ===
      input.descriptor.payloadLength &&
      byteCommitment(input.observedPayload) ===
        input.descriptor.plaintextCommitment,
    "HASH_MISMATCH",
    "Evaluator observed the wrong inert payload",
  );
  parseTimestamp(input.consumedAt, "consumedAt");
  const core: EvaluatorReceiptCore = {
    schemaVersion: 1,
    recordType:
      "synthetic_custody_evaluator_receipt",
    receiptId: input.receiptId,
    protocolId: input.descriptor.protocolId,
    contractHash: input.descriptor.contractHash,
    custodyId: input.descriptor.custodyId,
    descriptorHash: input.descriptor.recordHash,
    releaseId: input.releaseId,
    observedPlaintextCommitment:
      input.descriptor.plaintextCommitment,
    observedPayloadLength:
      SYNTHETIC_CUSTODY_PAYLOAD_LENGTH,
    readOnlyMaterialization: true,
    encryptionKeyPresent: false,
    ciphertextPresent: false,
    reusableDecryptionAuthorityPresent: false,
    taskBodyPresent: false,
    verifierLogicPresent: false,
    modelPromptPresent: false,
    consumedAt: input.consumedAt,
    consumedBy: input.signer.identity,
  };
  const publicPrincipal =
    input.signer.exportPublic();
  const body: EvaluatorReceiptSignedBody = {
    ...core,
    recordHash: sha256(
      core as unknown as JsonValue,
    ),
    publicPrincipal,
  };
  const receipt: SyntheticCustodyEvaluatorReceipt = {
    ...body,
    attestation: input.signer.attest(
      body as unknown as JsonValue,
    ),
  };
  verifySyntheticCustodyEvaluatorReceipt({
    record: receipt,
    descriptor: input.descriptor,
    releaseId: input.releaseId,
    contract: input.contract,
    schemas: input.schemas,
  });
  return receipt;
}

export function verifySyntheticCustodyEvaluatorReceipt(input: {
  readonly record: SyntheticCustodyEvaluatorReceipt;
  readonly descriptor: SyntheticCustodyDescriptor;
  readonly releaseId: string;
  readonly contract: EvaluatorVaultContract;
  readonly schemas: SchemaRegistry;
}): void {
  input.schemas.validate(
    SYNTHETIC_CUSTODY_EVALUATOR_RECEIPT_SCHEMA_ID,
    input.record as unknown as JsonValue,
  );
  verifySyntheticCustodyDescriptor({
    record: input.descriptor,
    contract: input.contract,
    schemas: input.schemas,
  });
  const core = evaluatorReceiptCore(input.record);
  assertCondition(
    input.record.recordHash ===
      sha256(core as unknown as JsonValue) &&
      input.record.protocolId ===
        input.descriptor.protocolId &&
      input.record.contractHash ===
        input.descriptor.contractHash &&
      input.record.custodyId ===
        input.descriptor.custodyId &&
      input.record.descriptorHash ===
        input.descriptor.recordHash &&
      input.record.releaseId === input.releaseId &&
      input.record.observedPlaintextCommitment ===
        input.descriptor.plaintextCommitment,
    "HASH_MISMATCH",
    "Synthetic custody evaluator receipt binding mismatch",
  );
  assertCondition(
    samePrincipal(
      input.record.publicPrincipal,
      input.contract.principalMatrix.evaluator,
    ),
    "AUTHENTICATION_FAILED",
    "Synthetic custody receipt is not evaluator-authored",
  );
  registryWith(input.record.publicPrincipal).verify(
    input.record.consumedBy,
    evaluatorReceiptSignedBody(
      input.record,
    ) as unknown as JsonValue,
    input.record.attestation,
  );
}

interface RecoveredSyntheticCustodyJournal {
  readonly entries: readonly {
    readonly journal:
      CasAppendOnlyRecord<JsonValue>;
    readonly transition:
      SyntheticCustodyTransition;
  }[];
  readonly state: SyntheticCustodyState | null;
  readonly head: string | null;
  readonly latestTransition:
    SyntheticCustodyTransition | null;
  readonly requests: ReadonlyMap<
    string,
    SyntheticCustodyTransition
  >;
  readonly materializationTransition:
    SyntheticCustodyTransition | null;
  readonly cleanupTransition:
    SyntheticCustodyTransition | null;
}

export interface SyntheticCustodyJournalDisposition {
  readonly transition: SyntheticCustodyTransition;
  readonly journalHead: string;
  readonly newlyCommitted: boolean;
  readonly failure: {
    readonly code: HarnessErrorCode;
    readonly safeDetail: string;
  } | null;
}

function transitionFailure(
  transition: SyntheticCustodyTransition,
): SyntheticCustodyJournalDisposition["failure"] {
  if (transition.decision === "allowed") return null;
  const allowedCodes = new Set<HarnessErrorCode>([
    "AUTHENTICATION_FAILED",
    "AUTHORIZATION_DENIED",
    "SCHEMA_INVALID",
    "HASH_MISMATCH",
    "REPLAY_DETECTED",
    "PROTOCOL_MISMATCH",
    "INVALID_STATE_TRANSITION",
    "CONFLICT",
  ]);
  assertCondition(
    allowedCodes.has(
      transition.reasonCode as HarnessErrorCode,
    ),
    "HASH_MISMATCH",
    "Synthetic custody denial has an unknown reason",
  );
  return {
    code:
      transition.reasonCode as HarnessErrorCode,
    safeDetail:
      "Synthetic custody release was denied",
  };
}

function isLegalSuccessor(
  action: SyntheticCustodyAction,
  before: SyntheticCustodyState | null,
  after: SyntheticCustodyState,
  cleanupReason:
    SyntheticCustodyCleanupReason | null,
): boolean {
  switch (action) {
    case "seal":
      return before === null && after === "sealed";
    case "reserve_release":
      return (
        before === "sealed" &&
        after === "release_reserved"
      );
    case "begin_materialization":
      return (
        before === "release_reserved" &&
        after === "materialization_started"
      );
    case "cleanup":
      return (
        (before === "materialization_started" &&
          after === "cleaned" &&
          cleanupReason !== "capability_rejection") ||
        (before === "sealed" &&
          after === "cleaned" &&
          cleanupReason === "capability_rejection")
      );
    case "deny_release":
      return false;
  }
}

export function verifySyntheticCustodyTransition(input: {
  readonly record: SyntheticCustodyTransition;
  readonly descriptor: SyntheticCustodyDescriptor;
  readonly priorTransitionHash: string | null;
  readonly priorJournalHead: string | null;
  readonly contract: EvaluatorVaultContract;
  readonly schemas: SchemaRegistry;
}): void {
  input.schemas.validate(
    SYNTHETIC_CUSTODY_TRANSITION_SCHEMA_ID,
    input.record as unknown as JsonValue,
  );
  verifySyntheticCustodyDescriptor({
    record: input.descriptor,
    contract: input.contract,
    schemas: input.schemas,
  });
  const core = transitionCore(input.record);
  assertCondition(
    input.record.recordHash ===
      sha256(core as unknown as JsonValue),
    "HASH_MISMATCH",
    "Synthetic custody transition hash mismatch",
  );
  assertCondition(
    samePrincipal(
      input.record.publicPrincipal,
      input.contract.principalMatrix.vault,
    ) &&
      canonicalize(
        input.record.recordedBy as unknown as JsonValue,
      ) ===
        canonicalize(
          input.contract.principalMatrix.vault
            .identity as unknown as JsonValue,
        ),
    "AUTHENTICATION_FAILED",
    "Synthetic custody transition is not vault-authored",
  );
  assertCondition(
    input.record.protocolId ===
      input.descriptor.protocolId &&
      input.record.contractId ===
        input.descriptor.contractId &&
      input.record.contractHash ===
        input.descriptor.contractHash &&
      input.record.custodyId ===
        input.descriptor.custodyId &&
      input.record.descriptorHash ===
        input.descriptor.recordHash &&
      input.record.taskHandleCommitment ===
        input.descriptor.taskHandleCommitment &&
      input.record.includedTransitionHash ===
        input.descriptor.includedTransitionHash &&
      input.record.admittedVaultStateHead ===
        input.descriptor.admittedVaultStateHead &&
      input.record.unlockCapabilityHash ===
        input.descriptor.unlockCapabilityHash &&
      input.record.plaintextCommitment ===
        input.descriptor.plaintextCommitment &&
      input.record.payloadLength ===
        input.descriptor.payloadLength &&
      input.record.priorTransitionHash ===
        input.priorTransitionHash &&
      input.record.priorJournalHead ===
        input.priorJournalHead,
    "HASH_MISMATCH",
    "Synthetic custody transition binding changed",
  );
  registryWith(input.record.publicPrincipal).verify(
    input.record.recordedBy,
    transitionSignedBody(
      input.record,
    ) as unknown as JsonValue,
    input.record.attestation,
  );
}

export class SyntheticCustodyJournal {
  readonly #descriptor: SyntheticCustodyDescriptor;
  readonly #contract: EvaluatorVaultContract;
  readonly #signer: PrincipalSigner;
  readonly #schemas: SchemaRegistry;
  readonly #log: CasAppendOnlyLog<JsonValue>;

  public constructor(input: {
    readonly root: string;
    readonly descriptor: SyntheticCustodyDescriptor;
    readonly contract: EvaluatorVaultContract;
    readonly signer: PrincipalSigner;
    readonly schemas: SchemaRegistry;
  }) {
    verifySyntheticCustodyDescriptor({
      record: input.descriptor,
      contract: input.contract,
      schemas: input.schemas,
    });
    assertSigner(
      input.signer,
      input.contract.principalMatrix.vault,
      "Synthetic custody journal",
    );
    this.#descriptor = input.descriptor;
    this.#contract = input.contract;
    this.#signer = input.signer;
    this.#schemas = input.schemas;
    this.#log = new CasAppendOnlyLog<JsonValue>(
      input.root,
      `synthetic-custody.${input.descriptor.custodyId}`,
    );
  }

  public async initialize(
    occurredAt: string,
  ): Promise<SyntheticCustodyJournalDisposition> {
    for (let attempt = 0; attempt < 32; attempt += 1) {
      const snapshot = await this.#recover();
      if (snapshot.entries.length > 0) {
        const first = snapshot.entries[0]!;
        return {
          transition: first.transition,
          journalHead: snapshot.head!,
          newlyCommitted: false,
          failure: transitionFailure(first.transition),
        };
      }
      const transition = this.#createTransition({
        sequence: 0,
        priorTransitionHash: null,
        priorJournalHead: null,
        action: "seal",
        requestCommitment: null,
        capabilityCommitment: null,
        releaseId: null,
        stateBefore: null,
        stateAfter: "sealed",
        stateSuccessor: true,
        decision: "allowed",
        reasonCode: "ALLOWED",
        cleanupReason: null,
        occurredAt,
      });
      try {
        return await this.#append(
          snapshot,
          transition,
        );
      } catch (error) {
        if (
          asHarnessError(error).code !== "CONFLICT"
        ) {
          throw error;
        }
      }
    }
    throw new HarnessError(
      "CONFLICT",
      "Synthetic custody journal initialization contended repeatedly",
      { retryable: true },
    );
  }

  public async reserve(
    request: SyntheticCustodyReleaseRequest,
  ): Promise<SyntheticCustodyJournalDisposition> {
    const requestCommitment = sha256(
      request as unknown as JsonValue,
    );
    for (let attempt = 0; attempt < 32; attempt += 1) {
      const snapshot = await this.#recover();
      const prior = snapshot.requests.get(
        requestCommitment,
      );
      if (prior !== undefined) {
        return {
          transition: prior,
          journalHead: snapshot.head!,
          newlyCommitted: false,
          failure: transitionFailure(prior),
        };
      }
      let failure: HarnessError | null = null;
      try {
        verifySyntheticCustodyReleaseRequest({
          record: request,
          descriptor: this.#descriptor,
          now: request.requestedAt,
          contract: this.#contract,
          schemas: this.#schemas,
        });
        assertCondition(
          snapshot.state === "sealed",
          "REPLAY_DETECTED",
          "Synthetic custody capability cannot authorize another release",
        );
      } catch (error) {
        failure = asHarnessError(error);
      }
      const allowed = failure === null;
      const releaseId = allowed
        ? `custody-release:${request.requestHash.slice(7, 39)}`
        : null;
      const transition = this.#createTransition({
        sequence: snapshot.entries.length,
        priorTransitionHash:
          snapshot.latestTransition?.recordHash ?? null,
        priorJournalHead: snapshot.head,
        action: allowed
          ? "reserve_release"
          : "deny_release",
        requestCommitment,
        capabilityCommitment:
          request.capability.capabilityHash,
        releaseId,
        stateBefore: snapshot.state,
        stateAfter: allowed
          ? "release_reserved"
          : (snapshot.state ?? "sealed"),
        stateSuccessor: allowed,
        decision: allowed ? "allowed" : "denied",
        reasonCode: failure?.code ?? "ALLOWED",
        cleanupReason: null,
        occurredAt: request.requestedAt,
      });
      try {
        const appended = await this.#append(
          snapshot,
          transition,
        );
        return {
          ...appended,
          failure:
            failure === null
              ? null
              : {
                  code: failure.code,
                  safeDetail: failure.safeDetail,
                },
        };
      } catch (error) {
        if (
          asHarnessError(error).code !== "CONFLICT"
        ) {
          throw error;
        }
      }
    }
    throw new HarnessError(
      "CONFLICT",
      "Synthetic custody reservation contended repeatedly",
      { retryable: true },
    );
  }

  public async beginMaterialization(input: {
    readonly request: SyntheticCustodyReleaseRequest;
    readonly occurredAt: string;
  }): Promise<SyntheticCustodyJournalDisposition> {
    verifySyntheticCustodyReleaseRequest({
      record: input.request,
      descriptor: this.#descriptor,
      now: input.request.requestedAt,
      contract: this.#contract,
      schemas: this.#schemas,
    });
    const requestCommitment = sha256(
      input.request as unknown as JsonValue,
    );
    for (let attempt = 0; attempt < 32; attempt += 1) {
      const snapshot = await this.#recover();
      const reservation = snapshot.requests.get(
        requestCommitment,
      );
      assertCondition(
        reservation?.action ===
          "reserve_release" &&
          reservation.decision === "allowed" &&
          reservation.releaseId !== null,
        "AUTHORIZATION_DENIED",
        "Synthetic custody request has no durable reservation",
      );
      if (
        snapshot.materializationTransition !== null
      ) {
        return {
          transition:
            snapshot.materializationTransition,
          journalHead: snapshot.head!,
          newlyCommitted: false,
          failure: {
            code: "REPLAY_DETECTED",
            safeDetail:
              "Synthetic custody materialization was already started",
          },
        };
      }
      assertCondition(
        snapshot.state === "release_reserved",
        "INVALID_STATE_TRANSITION",
        "Synthetic custody is not reserved for materialization",
      );
      const transition = this.#createTransition({
        sequence: snapshot.entries.length,
        priorTransitionHash:
          snapshot.latestTransition?.recordHash ?? null,
        priorJournalHead: snapshot.head,
        action: "begin_materialization",
        requestCommitment,
        capabilityCommitment:
          input.request.capability.capabilityHash,
        releaseId: reservation.releaseId,
        stateBefore: snapshot.state,
        stateAfter: "materialization_started",
        stateSuccessor: true,
        decision: "allowed",
        reasonCode: "ALLOWED",
        cleanupReason: null,
        occurredAt: input.occurredAt,
      });
      try {
        return await this.#append(
          snapshot,
          transition,
        );
      } catch (error) {
        if (
          asHarnessError(error).code !== "CONFLICT"
        ) {
          throw error;
        }
      }
    }
    throw new HarnessError(
      "CONFLICT",
      "Synthetic custody materialization contended repeatedly",
      { retryable: true },
    );
  }

  public async cleanup(input: {
    readonly reason: SyntheticCustodyCleanupReason;
    readonly occurredAt: string;
    readonly request?:
      SyntheticCustodyReleaseRequest;
  }): Promise<SyntheticCustodyJournalDisposition> {
    for (let attempt = 0; attempt < 32; attempt += 1) {
      const snapshot = await this.#recover();
      if (snapshot.cleanupTransition !== null) {
        return {
          transition: snapshot.cleanupTransition,
          journalHead: snapshot.head!,
          newlyCommitted: false,
          failure: null,
        };
      }
      const requestCommitment =
        input.request === undefined
          ? null
          : sha256(
              input.request as unknown as JsonValue,
            );
      const capabilityCommitment =
        input.request?.capability.capabilityHash ??
        null;
      let releaseId: string | null = null;
      if (requestCommitment !== null) {
        releaseId =
          snapshot.requests.get(
            requestCommitment,
          )?.releaseId ?? null;
      }
      releaseId ??=
        snapshot.materializationTransition
          ?.releaseId ?? null;
      assertCondition(
        isLegalSuccessor(
          "cleanup",
          snapshot.state,
          "cleaned",
          input.reason,
        ),
        "INVALID_STATE_TRANSITION",
        "Synthetic custody cleanup does not match its state",
      );
      if (input.reason === "capability_rejection") {
        assertCondition(
          [...snapshot.requests.values()].some(
            (transition) =>
              transition.action ===
                "deny_release" &&
              transition.decision === "denied",
          ),
          "AUTHORIZATION_DENIED",
          "Capability-rejection cleanup requires a durable denial",
        );
      }
      const transition = this.#createTransition({
        sequence: snapshot.entries.length,
        priorTransitionHash:
          snapshot.latestTransition?.recordHash ?? null,
        priorJournalHead: snapshot.head,
        action: "cleanup",
        requestCommitment,
        capabilityCommitment,
        releaseId,
        stateBefore: snapshot.state,
        stateAfter: "cleaned",
        stateSuccessor: true,
        decision: "allowed",
        reasonCode: "ALLOWED",
        cleanupReason: input.reason,
        occurredAt: input.occurredAt,
      });
      try {
        return await this.#append(
          snapshot,
          transition,
        );
      } catch (error) {
        if (
          asHarnessError(error).code !== "CONFLICT"
        ) {
          throw error;
        }
      }
    }
    throw new HarnessError(
      "CONFLICT",
      "Synthetic custody cleanup contended repeatedly",
      { retryable: true },
    );
  }

  public async readTransitions(): Promise<
    readonly SyntheticCustodyTransition[]
  > {
    return (await this.#recover()).entries.map(
      (entry) => entry.transition,
    );
  }

  public async readHead(): Promise<string | null> {
    return (await this.#recover()).head;
  }

  public async state(): Promise<
    SyntheticCustodyState | null
  > {
    return (await this.#recover()).state;
  }

  #createTransition(input: {
    readonly sequence: number;
    readonly priorTransitionHash: string | null;
    readonly priorJournalHead: string | null;
    readonly action: SyntheticCustodyAction;
    readonly requestCommitment: string | null;
    readonly capabilityCommitment: string | null;
    readonly releaseId: string | null;
    readonly stateBefore:
      SyntheticCustodyState | null;
    readonly stateAfter: SyntheticCustodyState;
    readonly stateSuccessor: boolean;
    readonly decision: "allowed" | "denied";
    readonly reasonCode: string;
    readonly cleanupReason:
      SyntheticCustodyCleanupReason | null;
    readonly occurredAt: string;
  }): SyntheticCustodyTransition {
    parseTimestamp(input.occurredAt, "occurredAt");
    const cleaned = input.action === "cleanup";
    const core: TransitionCore = {
      schemaVersion: 1,
      recordType: "synthetic_custody_transition",
      transitionId:
        `custody-transition:${input.sequence
          .toString()
          .padStart(8, "0")}`,
      protocolId: this.#descriptor.protocolId,
      contractId: this.#descriptor.contractId,
      contractHash: this.#descriptor.contractHash,
      custodyId: this.#descriptor.custodyId,
      descriptorHash: this.#descriptor.recordHash,
      taskHandleCommitment:
        this.#descriptor.taskHandleCommitment,
      includedTransitionHash:
        this.#descriptor.includedTransitionHash,
      admittedVaultStateHead:
        this.#descriptor.admittedVaultStateHead,
      unlockCapabilityHash:
        this.#descriptor.unlockCapabilityHash,
      plaintextCommitment:
        this.#descriptor.plaintextCommitment,
      payloadLength: this.#descriptor.payloadLength,
      priorTransitionHash:
        input.priorTransitionHash,
      priorJournalHead: input.priorJournalHead,
      action: input.action,
      requestCommitment:
        input.requestCommitment,
      capabilityCommitment:
        input.capabilityCommitment,
      releaseId: input.releaseId,
      stateBefore: input.stateBefore,
      stateAfter: input.stateAfter,
      stateSuccessor: input.stateSuccessor,
      decision: input.decision,
      reasonCode: input.reasonCode,
      cleanupReason: input.cleanupReason,
      keyReleased: false,
      ciphertextReleased: false,
      plaintextRetained: false,
      keyDestroyed: cleaned,
      ciphertextDestroyed: cleaned,
      plaintextCleanupConfirmed: cleaned,
      occurredAt: input.occurredAt,
      recordedBy: this.#signer.identity,
    };
    const publicPrincipal =
      this.#signer.exportPublic();
    const body: TransitionSignedBody = {
      ...core,
      recordHash: sha256(
        core as unknown as JsonValue,
      ),
      publicPrincipal,
    };
    const transition: SyntheticCustodyTransition = {
      ...body,
      attestation: this.#signer.attest(
        body as unknown as JsonValue,
      ),
    };
    verifySyntheticCustodyTransition({
      record: transition,
      descriptor: this.#descriptor,
      priorTransitionHash:
        input.priorTransitionHash,
      priorJournalHead: input.priorJournalHead,
      contract: this.#contract,
      schemas: this.#schemas,
    });
    return transition;
  }

  async #append(
    snapshot: RecoveredSyntheticCustodyJournal,
    transition: SyntheticCustodyTransition,
  ): Promise<SyntheticCustodyJournalDisposition> {
    const appended = await this.#log.appendExpected({
      expectedHeadHash: snapshot.head,
      payload: transition as unknown as JsonValue,
    });
    await this.#log.synchronize();
    const recovered = await this.#recover();
    assertCondition(
      recovered.head === appended.recordHash &&
        recovered.latestTransition?.recordHash ===
          transition.recordHash,
      "HASH_MISMATCH",
      "Synthetic custody transition is not the durable head",
    );
    return {
      transition,
      journalHead: appended.recordHash,
      newlyCommitted: true,
      failure: transitionFailure(transition),
    };
  }

  async #recover(): Promise<RecoveredSyntheticCustodyJournal> {
    await this.#log.synchronize();
    const journalRecords =
      await this.#log.readAll();
    const entries: {
      readonly journal:
        CasAppendOnlyRecord<JsonValue>;
      readonly transition:
        SyntheticCustodyTransition;
    }[] = [];
    const requests = new Map<
      string,
      SyntheticCustodyTransition
    >();
    let state: SyntheticCustodyState | null = null;
    let latestTransition:
      SyntheticCustodyTransition | null = null;
    let materializationTransition:
      SyntheticCustodyTransition | null = null;
    let cleanupTransition:
      SyntheticCustodyTransition | null = null;

    for (const journal of journalRecords) {
      const transition =
        journal.payload as unknown as SyntheticCustodyTransition;
      verifySyntheticCustodyTransition({
        record: transition,
        descriptor: this.#descriptor,
        priorTransitionHash:
          latestTransition?.recordHash ?? null,
        priorJournalHead:
          journal.previousRecordHash,
        contract: this.#contract,
        schemas: this.#schemas,
      });
      assertCondition(
        transition.transitionId ===
          `custody-transition:${entries.length
            .toString()
            .padStart(8, "0")}` &&
          transition.stateBefore === state,
        "HASH_MISMATCH",
        "Synthetic custody transition does not extend its state",
      );
      if (transition.stateSuccessor) {
        assertCondition(
          transition.decision === "allowed" &&
            isLegalSuccessor(
              transition.action,
              transition.stateBefore,
              transition.stateAfter,
              transition.cleanupReason,
            ),
          "INVALID_STATE_TRANSITION",
          "Synthetic custody successor is illegal",
        );
        state = transition.stateAfter;
      } else {
        assertCondition(
          transition.action === "deny_release" &&
            transition.decision === "denied" &&
            transition.stateAfter === state &&
            transition.releaseId === null &&
            transition.cleanupReason === null,
          "INVALID_STATE_TRANSITION",
          "Synthetic custody non-successor is not a denial",
        );
      }
      if (
        transition.requestCommitment !== null &&
        (transition.action === "reserve_release" ||
          transition.action === "deny_release")
      ) {
        assertCondition(
          !requests.has(
            transition.requestCommitment,
          ),
          "REPLAY_DETECTED",
          "Synthetic custody journal duplicated a request disposition",
        );
        requests.set(
          transition.requestCommitment,
          transition,
        );
      }
      if (
        transition.action ===
        "begin_materialization"
      ) {
        assertCondition(
          materializationTransition === null,
          "REPLAY_DETECTED",
          "Synthetic custody journal contains multiple materializations",
        );
        materializationTransition = transition;
      }
      if (transition.action === "cleanup") {
        assertCondition(
          cleanupTransition === null,
          "REPLAY_DETECTED",
          "Synthetic custody journal contains multiple cleanup transitions",
        );
        cleanupTransition = transition;
      }
      entries.push({ journal, transition });
      latestTransition = transition;
    }
    return {
      entries,
      state,
      head:
        journalRecords.at(-1)?.recordHash ?? null,
      latestTransition,
      requests,
      materializationTransition,
      cleanupTransition,
    };
  }
}
