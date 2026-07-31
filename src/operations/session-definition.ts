import { sha256, type JsonValue } from "../core/canonical.js";
import { assertCondition } from "../core/errors.js";
import {
  SCHEMA_BASE_URL,
  type SchemaRegistry,
} from "../contracts/schema-registry.js";
import type { SessionPins } from "../domain/runtime.js";
import type {
  Attestation,
  PrincipalIdentity,
  PrincipalRegistry,
  PrincipalSigner,
} from "../trust/identity.js";

export const SESSION_DEFINITION_SCHEMA_ID =
  `${SCHEMA_BASE_URL}session-definition.schema.json`;

export interface SessionDefinitionCore {
  readonly schemaVersion: 2;
  readonly sessionId: string;
  readonly pins: SessionPins;
  readonly createdAt: string;
  readonly createdBy: PrincipalIdentity;
}

export interface SignedSessionDefinition extends SessionDefinitionCore {
  readonly sessionDefinitionHash: string;
  readonly attestation: Attestation;
}

type SignedSessionDefinitionBody = Omit<
  SignedSessionDefinition,
  "attestation"
>;

function coreOf(
  definition: SignedSessionDefinition,
): SessionDefinitionCore {
  const {
    sessionDefinitionHash: _sessionDefinitionHash,
    attestation: _attestation,
    ...core
  } = definition;
  return core;
}

function signedBodyOf(
  definition: SignedSessionDefinition,
): SignedSessionDefinitionBody {
  const { attestation: _attestation, ...body } = definition;
  return body;
}

function assertCanonicalDatasetPermissions(pins: SessionPins): void {
  const permissions = [...pins.datasetPermissions];
  const sorted = [...new Set(permissions)].sort();
  assertCondition(
    permissions.length > 0 &&
      permissions.length === sorted.length &&
      permissions.every((permission, index) => permission === sorted[index]),
    "SCHEMA_INVALID",
    "Session dataset permissions must be non-empty, unique, and sorted",
  );
}

export function createSignedSessionDefinition(input: {
  readonly sessionId: string;
  readonly pins: SessionPins;
  readonly createdAt: string;
  readonly signer: PrincipalSigner;
  readonly schemas: SchemaRegistry;
}): SignedSessionDefinition {
  assertCondition(
    input.signer.identity.role === "operations_owner",
    "AUTHORIZATION_DENIED",
    "Only the operations owner can create a session definition",
  );
  assertCanonicalDatasetPermissions(input.pins);
  const core: SessionDefinitionCore = {
    schemaVersion: 2,
    sessionId: input.sessionId,
    pins: input.pins,
    createdAt: input.createdAt,
    createdBy: input.signer.identity,
  };
  const body: SignedSessionDefinitionBody = {
    ...core,
    sessionDefinitionHash: sha256(core as unknown as JsonValue),
  };
  const definition: SignedSessionDefinition = {
    ...body,
    attestation: input.signer.attest(body as unknown as JsonValue),
  };
  input.schemas.validate(
    SESSION_DEFINITION_SCHEMA_ID,
    definition as unknown as JsonValue,
  );
  return definition;
}

export function verifySignedSessionDefinition(input: {
  readonly definition: SignedSessionDefinition;
  readonly expectedProtocolId: string;
  readonly schemas: SchemaRegistry;
  readonly principals: PrincipalRegistry;
}): void {
  input.schemas.validate(
    SESSION_DEFINITION_SCHEMA_ID,
    input.definition as unknown as JsonValue,
  );
  assertCanonicalDatasetPermissions(input.definition.pins);
  assertCondition(
    input.definition.pins.protocolId === input.expectedProtocolId,
    "PROTOCOL_MISMATCH",
    "Session definition protocol differs from the control plane",
  );
  assertCondition(
    input.definition.createdBy.role === "operations_owner",
    "AUTHORIZATION_DENIED",
    "Session definition was not created by the operations owner",
  );
  assertCondition(
    input.definition.sessionDefinitionHash ===
      sha256(coreOf(input.definition) as unknown as JsonValue),
    "HASH_MISMATCH",
    "Session definition hash mismatch",
  );
  input.principals.verify(
    input.definition.createdBy,
    signedBodyOf(input.definition) as unknown as JsonValue,
    input.definition.attestation,
  );
}

export function asSignedSessionDefinition(
  value: JsonValue,
): SignedSessionDefinition {
  return value as unknown as SignedSessionDefinition;
}
