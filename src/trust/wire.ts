import { canonicalBytes, parseStrictJson, sha256, type JsonValue } from "../core/canonical.js";
import { HarnessError, assertCondition } from "../core/errors.js";
import type { Clock } from "../core/determinism.js";
import type { ArtifactReference } from "../domain/components.js";
import { SCHEMA_BASE_URL, type SchemaRegistry } from "../contracts/schema-registry.js";
import {
  type Attestation,
  type PrincipalIdentity,
  type PrincipalRegistry,
  type PrincipalRole,
  type PrincipalSigner,
} from "./identity.js";

export const WIRE_SCHEMA_ID = `${SCHEMA_BASE_URL}wire-envelope.schema.json`;
export const MAX_WIRE_FRAME_BYTES = 1024 * 1024;

export type WireMessageType =
  | "session.control"
  | "runtime.event_batch"
  | "runtime.child_delegation"
  | "provider.request"
  | "provider.response"
  | "evaluator.request"
  | "evaluator.result"
  | "promoter.request"
  | "promoter.decision"
  | "deployment.compare_and_swap"
  | "audit.append"
  | "audit.acknowledge";

export interface WireResult {
  readonly status: "request" | "ok" | "error";
  readonly error: {
    readonly code: string;
    readonly retryable: boolean;
    readonly safeDetail: string;
  } | null;
}

export interface WireEnvelope {
  readonly schemaVersion: 1;
  readonly wireProtocolVersion: "seh-wire/1";
  readonly protocolId: string;
  readonly messageId: string;
  readonly correlationId: string;
  readonly causationId: string | null;
  readonly sender: PrincipalIdentity;
  readonly recipientRole: PrincipalRole;
  readonly messageType: WireMessageType;
  readonly sentAt: string;
  readonly expiresAt: string;
  readonly senderSequence: number;
  readonly nonce: string;
  readonly payloadSchemaId: string;
  readonly payloadHash: string;
  readonly payloadSizeBytes: number;
  readonly payload: { readonly [key: string]: JsonValue };
  readonly artifactRefs: readonly ArtifactReference[];
  readonly result: WireResult;
  readonly attestation: Attestation;
}

type UnsignedEnvelope = Omit<WireEnvelope, "attestation">;

interface AuthorityRule {
  readonly senders: readonly PrincipalRole[];
  readonly recipients: readonly PrincipalRole[];
}

const AUTHORITY: Readonly<Record<WireMessageType, AuthorityRule>> = Object.freeze({
  "session.control": {
    senders: ["operations_owner", "human_operator"],
    recipients: ["runtime"],
  },
  "runtime.event_batch": { senders: ["runtime"], recipients: ["audit_store"] },
  "runtime.child_delegation": { senders: ["runtime"], recipients: ["runtime"] },
  "provider.request": {
    senders: ["runtime"],
    recipients: ["model_provider_proxy", "fake_provider"],
  },
  "provider.response": {
    senders: ["model_provider_proxy", "fake_provider"],
    recipients: ["runtime"],
  },
  "evaluator.request": {
    senders: ["operations_owner"],
    recipients: ["evaluator"],
  },
  "evaluator.result": {
    senders: ["evaluator"],
    recipients: ["operations_owner", "promoter", "audit_store"],
  },
  "promoter.request": {
    senders: ["operations_owner"],
    recipients: ["promoter"],
  },
  "promoter.decision": {
    senders: ["promoter"],
    recipients: ["operations_owner", "audit_store"],
  },
  "deployment.compare_and_swap": {
    senders: ["promoter"],
    recipients: ["operations_owner"],
  },
  "audit.append": {
    senders: [
      "runtime",
      "operations_owner",
      "proposer",
      "evaluator",
      "promoter",
      "model_provider_proxy",
      "fake_provider",
    ],
    recipients: ["audit_store"],
  },
  "audit.acknowledge": {
    senders: ["audit_store"],
    recipients: [
      "runtime",
      "operations_owner",
      "proposer",
      "evaluator",
      "promoter",
      "model_provider_proxy",
      "fake_provider",
    ],
  },
});

function asJsonObject(value: JsonValue): { readonly [key: string]: JsonValue } {
  assertCondition(
    typeof value === "object" && value !== null && !Array.isArray(value),
    "SCHEMA_INVALID",
    "Wire envelope must be a JSON object",
  );
  return value;
}

function envelopeIdentity(envelope: WireEnvelope): UnsignedEnvelope {
  const { attestation: _attestation, ...identity } = envelope;
  return identity;
}

export function assertMessageAuthority(
  sender: PrincipalRole,
  recipient: PrincipalRole,
  messageType: WireMessageType,
): void {
  const rule = AUTHORITY[messageType];
  assertCondition(
    rule.senders.includes(sender) && rule.recipients.includes(recipient),
    "AUTHORIZATION_DENIED",
    `${sender} cannot send ${messageType} to ${recipient}`,
  );
}

export function createWireEnvelope(input: {
  protocolId: string;
  messageId: string;
  correlationId: string;
  causationId: string | null;
  recipientRole: PrincipalRole;
  messageType: WireMessageType;
  sentAt: string;
  expiresAt: string;
  senderSequence: number;
  nonce: string;
  payloadSchemaId: string;
  payload: { readonly [key: string]: JsonValue };
  artifactRefs?: readonly ArtifactReference[];
  result?: WireResult;
  signer: PrincipalSigner;
  schemas: SchemaRegistry;
}): WireEnvelope {
  assertMessageAuthority(input.signer.identity.role, input.recipientRole, input.messageType);
  input.schemas.validate(input.payloadSchemaId, input.payload);
  const payloadBytes = canonicalBytes(input.payload);
  assertCondition(
    payloadBytes.byteLength <= MAX_WIRE_FRAME_BYTES,
    "PAYLOAD_TOO_LARGE",
    "Wire payload exceeds 1 MiB",
  );
  const unsigned: UnsignedEnvelope = {
    schemaVersion: 1,
    wireProtocolVersion: "seh-wire/1",
    protocolId: input.protocolId,
    messageId: input.messageId,
    correlationId: input.correlationId,
    causationId: input.causationId,
    sender: input.signer.identity,
    recipientRole: input.recipientRole,
    messageType: input.messageType,
    sentAt: input.sentAt,
    expiresAt: input.expiresAt,
    senderSequence: input.senderSequence,
    nonce: input.nonce,
    payloadSchemaId: input.payloadSchemaId,
    payloadHash: sha256(input.payload),
    payloadSizeBytes: payloadBytes.byteLength,
    payload: input.payload,
    artifactRefs: input.artifactRefs ?? [],
    result: input.result ?? { status: "request", error: null },
  };
  const envelope: WireEnvelope = {
    ...unsigned,
    attestation: input.signer.attest(unsigned as unknown as JsonValue),
  };
  input.schemas.validate(WIRE_SCHEMA_ID, envelope as unknown as JsonValue);
  assertCondition(
    canonicalBytes(envelope).byteLength <= MAX_WIRE_FRAME_BYTES,
    "PAYLOAD_TOO_LARGE",
    "Wire envelope exceeds 1 MiB",
  );
  return envelope;
}

export class ReplayGuard {
  readonly #lastSequence = new Map<string, number>();
  readonly #nonces = new Set<string>();

  public accept(sender: PrincipalIdentity, sequence: number, nonce: string): void {
    const channel = `${sender.principalId}\0${sender.instanceId}`;
    const expected = (this.#lastSequence.get(channel) ?? -1) + 1;
    assertCondition(
      sequence === expected,
      "REPLAY_DETECTED",
      `Expected sender sequence ${expected}, received ${sequence}`,
    );
    const nonceKey = `${channel}\0${nonce}`;
    assertCondition(!this.#nonces.has(nonceKey), "REPLAY_DETECTED", "Nonce was already used");
    this.#lastSequence.set(channel, sequence);
    this.#nonces.add(nonceKey);
  }
}

export function verifyWireEnvelope(
  envelope: WireEnvelope,
  options: {
    schemas: SchemaRegistry;
    principals: PrincipalRegistry;
    replayGuard: ReplayGuard;
    clock: Clock;
    expectedProtocolId: string;
    expectedRecipientRole: PrincipalRole;
    maxFutureSkewMillis?: number;
  },
): void {
  options.schemas.validate(WIRE_SCHEMA_ID, envelope as unknown as JsonValue);
  assertCondition(
    envelope.protocolId === options.expectedProtocolId,
    "PROTOCOL_MISMATCH",
    "Wire protocol manifest mismatch",
  );
  assertCondition(
    envelope.recipientRole === options.expectedRecipientRole,
    "AUTHORIZATION_DENIED",
    "Envelope was addressed to another role",
  );
  assertMessageAuthority(envelope.sender.role, envelope.recipientRole, envelope.messageType);
  const payloadBytes = canonicalBytes(envelope.payload);
  assertCondition(
    envelope.payloadHash === sha256(envelope.payload),
    "HASH_MISMATCH",
    "Wire payload hash mismatch",
  );
  assertCondition(
    envelope.payloadSizeBytes === payloadBytes.byteLength,
    "HASH_MISMATCH",
    "Wire payload size mismatch",
  );
  options.schemas.validate(envelope.payloadSchemaId, envelope.payload);

  const now = options.clock.now().getTime();
  const sentAt = Date.parse(envelope.sentAt);
  const expiresAt = Date.parse(envelope.expiresAt);
  assertCondition(Number.isFinite(sentAt) && Number.isFinite(expiresAt), "SCHEMA_INVALID", "Bad time");
  assertCondition(expiresAt >= sentAt, "SCHEMA_INVALID", "Expiry precedes sent time");
  assertCondition(
    sentAt <= now + (options.maxFutureSkewMillis ?? 30_000),
    "AUTHENTICATION_FAILED",
    "Envelope comes from the future",
  );
  assertCondition(expiresAt >= now, "DEADLINE_EXCEEDED", "Wire envelope has expired");
  options.principals.verify(
    envelope.sender,
    envelopeIdentity(envelope) as unknown as JsonValue,
    envelope.attestation,
  );
  options.replayGuard.accept(envelope.sender, envelope.senderSequence, envelope.nonce);
}

export function encodeWireFrame(envelope: WireEnvelope): Buffer {
  const body = canonicalBytes(envelope);
  assertCondition(
    body.byteLength <= MAX_WIRE_FRAME_BYTES,
    "PAYLOAD_TOO_LARGE",
    "Wire envelope exceeds 1 MiB",
  );
  const frame = Buffer.allocUnsafe(4 + body.byteLength);
  frame.writeUInt32BE(body.byteLength, 0);
  body.copy(frame, 4);
  return frame;
}

export function decodeWireFrame(frame: Uint8Array): WireEnvelope {
  assertCondition(frame.byteLength >= 6, "SCHEMA_INVALID", "Truncated wire frame");
  const bytes = Buffer.from(frame);
  const length = bytes.readUInt32BE(0);
  assertCondition(length <= MAX_WIRE_FRAME_BYTES, "PAYLOAD_TOO_LARGE", "Frame exceeds 1 MiB");
  assertCondition(bytes.byteLength === length + 4, "SCHEMA_INVALID", "Wire frame length mismatch");
  const body = bytes.subarray(4);
  const parsed = parseStrictJson(body.toString("utf8"));
  const object = asJsonObject(parsed);
  assertCondition(
    Buffer.compare(body, canonicalBytes(object)) === 0,
    "SCHEMA_INVALID",
    "Wire frame is not in canonical JSON form",
  );
  return object as unknown as WireEnvelope;
}

export function unknownWireMessageType(value: string): never {
  throw new HarnessError("AUTHORIZATION_DENIED", `Unknown wire message type ${value}`);
}
