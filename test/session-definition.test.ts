import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import {
  createSignedSessionDefinition,
  PrincipalRegistry,
  SchemaRegistry,
  sha256,
  verifySignedSessionDefinition,
  type JsonValue,
  type SessionPins,
  type SignedSessionDefinition,
} from "../src/index.js";
import { deterministicPrincipal } from "./helpers/deterministic-principal.js";

const protocolId = `protocol-sha256:${"1".repeat(64)}`;
const digest = (character: string): string =>
  `sha256:${character.repeat(64)}`;

function definitionCore(
  definition: SignedSessionDefinition,
): JsonValue {
  const {
    sessionDefinitionHash: _sessionDefinitionHash,
    attestation: _attestation,
    ...core
  } = definition;
  return core as unknown as JsonValue;
}

test("the complete session definition is signed and every field is covered", async () => {
  const schemas = await SchemaRegistry.load(path.resolve("schemas"));
  const signer = deterministicPrincipal({
    principalId: "operations.session-definition",
    role: "operations_owner",
    implementationDigest: digest("a"),
    instanceId: "operations.session-definition.instance",
    seedByte: 41,
  });
  const principals = new PrincipalRegistry();
  principals.register(signer.exportPublic());
  const pins: SessionPins = {
    protocolId,
    harnessVersionId: `hv-sha256:${"2".repeat(64)}`,
    runtimeStateSnapshotId: `rss-sha256:${"3".repeat(64)}`,
    modelIdentityHash: digest("4"),
    permissionPolicyHash: digest("5"),
    safetyPolicyHash: digest("6"),
    budgetPolicyHash: digest("7"),
    budgetAccountId: "budget.session-definition.1",
    datasetPermissions: ["deterministic"],
  };
  const definition = createSignedSessionDefinition({
    sessionId: "session.definition.1",
    pins,
    createdAt: "2026-07-31T00:00:00.000Z",
    signer,
    schemas,
  });
  verifySignedSessionDefinition({
    definition,
    expectedProtocolId: protocolId,
    schemas,
    principals,
  });

  const mutations: Array<
    (value: SignedSessionDefinition) => SignedSessionDefinition
  > = [
    (value) => ({ ...value, sessionId: "session.definition.2" }),
    (value) => ({
      ...value,
      createdAt: "2026-07-31T00:00:01.000Z",
    }),
    (value) => ({
      ...value,
      pins: {
        ...value.pins,
        protocolId: `protocol-sha256:${"8".repeat(64)}`,
      },
    }),
    (value) => ({
      ...value,
      pins: {
        ...value.pins,
        harnessVersionId: `hv-sha256:${"9".repeat(64)}`,
      },
    }),
    (value) => ({
      ...value,
      pins: {
        ...value.pins,
        runtimeStateSnapshotId: `rss-sha256:${"a".repeat(64)}`,
      },
    }),
    (value) => ({
      ...value,
      pins: { ...value.pins, modelIdentityHash: digest("b") },
    }),
    (value) => ({
      ...value,
      pins: { ...value.pins, permissionPolicyHash: digest("c") },
    }),
    (value) => ({
      ...value,
      pins: { ...value.pins, safetyPolicyHash: digest("d") },
    }),
    (value) => ({
      ...value,
      pins: { ...value.pins, budgetPolicyHash: digest("e") },
    }),
    (value) => ({
      ...value,
      pins: {
        ...value.pins,
        budgetAccountId: "budget.session-definition.2",
      },
    }),
    (value) => ({
      ...value,
      pins: { ...value.pins, datasetPermissions: ["mine"] },
    }),
    (value) => ({
      ...value,
      createdBy: {
        ...value.createdBy,
        implementationDigest: digest("f"),
      },
    }),
  ];
  for (const mutate of mutations) {
    const mutated = mutate(structuredClone(definition));
    const rehashed: SignedSessionDefinition = {
      ...mutated,
      sessionDefinitionHash: sha256(definitionCore(mutated)),
    };
    assert.throws(() =>
      verifySignedSessionDefinition({
        definition: rehashed,
        expectedProtocolId: protocolId,
        schemas,
        principals,
      }),
    );
  }

  assert.throws(() =>
    verifySignedSessionDefinition({
      definition: {
        ...definition,
        sessionDefinitionHash: digest("0"),
      },
      expectedProtocolId: protocolId,
      schemas,
      principals,
    }),
  );
  assert.throws(() =>
    verifySignedSessionDefinition({
      definition: {
        ...definition,
        attestation: {
          ...definition.attestation,
          signature: "A".repeat(definition.attestation.signature.length),
        },
      },
      expectedProtocolId: protocolId,
      schemas,
      principals,
    }),
  );
  assert.throws(() =>
    createSignedSessionDefinition({
      sessionId: "session.definition.unsorted",
      pins: {
        ...pins,
        datasetPermissions: ["mine", "deterministic"],
      },
      createdAt: "2026-07-31T00:00:00.000Z",
      signer,
      schemas,
    }),
  );
});
