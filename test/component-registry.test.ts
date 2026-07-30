import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  ArtifactStore,
  BoundedMutationEngine,
  HarnessError,
  DeterministicClock,
  DeterministicIdFactory,
  HarnessComponentRegistry,
  PrincipalSigner,
  SchemaRegistry,
  contentId,
  sha256,
} from "../src/index.js";

const runtimeContractHash = `sha256:${"a".repeat(64)}`;

async function temporaryDirectory(t: test.TestContext): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "seh-registry-"));
  t.after(async () => {
    await rm(directory, { recursive: true, force: true });
  });
  return directory;
}

function prompt(content: string) {
  return {
    schemaVersion: 1,
    language: "seh.prompt-markdown.v1",
    sections: [{ sectionId: "identity", purpose: "identity", content }],
    contextBindings: ["task_input"],
  };
}

function permissionPolicy(label: string) {
  return {
    schemaVersion: 1,
    language: "seh.policy-json.v1",
    policyType: "PermissionPolicy",
    policy: { label },
  };
}

test("versioned component graph permits bounded mutable changes and exposes immutable diffs", async (t) => {
  const root = await temporaryDirectory(t);
  const schemas = await SchemaRegistry.load(path.resolve("schemas"));
  const artifacts = new ArtifactStore(path.join(root, "artifacts"));
  const registry = new HarnessComponentRegistry({
    root: path.join(root, "registry"),
    schemas,
    artifacts,
    requiredSlotIds: ["permission", "system_prompt"],
  });
  await registry.initialize(path.resolve("configs/component-type-registry.json"));

  const promptV1 = await registry.createComponent({
    componentId: "component.system-prompt",
    semanticVersion: "1.0.0",
    typeEntryId: "type.system-prompt",
    payloadLanguage: "seh.prompt-markdown.v1",
    payload: prompt("Act carefully."),
    capabilityIds: ["prompt.instruct.primary"],
  });
  const permissionV1 = await registry.createComponent({
    componentId: "component.permission-policy",
    semanticVersion: "1.0.0",
    typeEntryId: "type.permission-policy",
    payloadLanguage: "seh.policy-json.v1",
    payload: permissionPolicy("fixed-v1"),
    capabilityIds: ["permission.authorize"],
  });
  const {
    behaviorClosure: _promptClosure,
    componentIntrinsicId: promptIntrinsicId,
    ...promptIntrinsicIdentity
  } = promptV1.identity;
  assert.equal(
    promptIntrinsicId,
    contentId("ci-sha256", promptIntrinsicIdentity),
  );
  assert.equal(
    promptV1.componentManifestId,
    contentId("cm-sha256", promptV1.identity),
  );
  assert.deepEqual(promptV1.identity.payload.capabilityIds, [
    "prompt.instruct.primary",
  ]);
  assert.equal(
    promptV1.identity.payload.capabilityDigest,
    sha256({ capabilityIds: ["prompt.instruct.primary"] }),
  );

  const reidentify = (manifest: typeof promptV1): void => {
    const {
      behaviorClosure: _closure,
      componentIntrinsicId: _intrinsicId,
      ...intrinsic
    } = manifest.identity;
    (manifest.identity as { componentIntrinsicId: string }).componentIntrinsicId =
      contentId("ci-sha256", intrinsic);
    (manifest as { componentManifestId: string }).componentManifestId =
      contentId("cm-sha256", manifest.identity);
  };
  const badDigest = structuredClone(promptV1);
  (badDigest.identity.payload as { capabilityDigest: string }).capabilityDigest =
    `sha256:${"0".repeat(64)}`;
  reidentify(badDigest);
  await assert.rejects(
    registry.validateDetachedComponent(badDigest, prompt("Act carefully.")),
    (error: unknown) =>
      error instanceof HarnessError && error.code === "HASH_MISMATCH",
  );

  const absentCapabilityPreimage = structuredClone(promptV1) as unknown as {
    identity: { payload: { capabilityIds?: string[] } };
  };
  delete absentCapabilityPreimage.identity.payload.capabilityIds;
  await assert.rejects(
    registry.validateDetachedComponent(
      absentCapabilityPreimage as unknown as typeof promptV1,
      prompt("Act carefully."),
    ),
    (error: unknown) =>
      error instanceof HarnessError && error.code === "SCHEMA_INVALID",
  );

  const duplicateCapability = structuredClone(promptV1);
  (
    duplicateCapability.identity.payload as unknown as { capabilityIds: string[] }
  ).capabilityIds = [
    "prompt.instruct.primary",
    "prompt.instruct.primary",
  ];
  await assert.rejects(
    registry.validateDetachedComponent(
      duplicateCapability,
      prompt("Act carefully."),
    ),
    (error: unknown) =>
      error instanceof HarnessError && error.code === "SCHEMA_INVALID",
  );

  const unsortedCapability = structuredClone(promptV1);
  (
    unsortedCapability.identity.payload as unknown as { capabilityIds: string[] }
  ).capabilityIds = [
    "prompt.instruct.primary",
    "permission.authorize",
  ];
  (
    unsortedCapability.identity.payload as { capabilityDigest: string }
  ).capabilityDigest = sha256({
    capabilityIds: unsortedCapability.identity.payload.capabilityIds,
  });
  reidentify(unsortedCapability);
  await assert.rejects(
    registry.validateDetachedComponent(
      unsortedCapability,
      prompt("Act carefully."),
    ),
    (error: unknown) =>
      error instanceof HarnessError && error.code === "HASH_MISMATCH",
  );

  const forbiddenCapability = structuredClone(promptV1);
  (
    forbiddenCapability.identity.payload as unknown as {
      capabilityIds: string[];
    }
  ).capabilityIds = [
    "permission.authorize",
  ];
  (
    forbiddenCapability.identity.payload as { capabilityDigest: string }
  ).capabilityDigest = sha256({
    capabilityIds: ["permission.authorize"],
  });
  reidentify(forbiddenCapability);
  await assert.rejects(
    registry.validateDetachedComponent(
      forbiddenCapability,
      prompt("Act carefully."),
    ),
    (error: unknown) =>
      error instanceof HarnessError && error.code === "AUTHORIZATION_DENIED",
  );

  const exposedCopy = registry.getComponent(promptV1.componentManifestId);
  (
    exposedCopy.identity.payload as unknown as { capabilityIds: string[] }
  ).capabilityIds = [];
  assert.deepEqual(
    registry.getComponent(promptV1.componentManifestId).identity.payload
      .capabilityIds,
    ["prompt.instruct.primary"],
  );
  const parent = await registry.createHarness({
    semanticVersion: "1.0.0",
    requiredRuntimeContractHash: runtimeContractHash,
    bindings: [
      { slotId: "system_prompt", componentManifestId: promptV1.componentManifestId },
      { slotId: "permission", componentManifestId: permissionV1.componentManifestId },
    ],
  });
  const promptV2 = await registry.createComponent({
    componentId: "component.system-prompt",
    semanticVersion: "1.1.0",
    typeEntryId: "type.system-prompt",
    payloadLanguage: "seh.prompt-markdown.v1",
    payload: prompt("Act carefully and verify the result."),
    capabilityIds: ["prompt.instruct.primary"],
  });
  const boundedCandidate = await registry.createHarness({
    semanticVersion: "1.1.0",
    requiredRuntimeContractHash: runtimeContractHash,
    bindings: [
      { slotId: "system_prompt", componentManifestId: promptV2.componentManifestId },
      { slotId: "permission", componentManifestId: permissionV1.componentManifestId },
    ],
  });
  const boundedDiff = registry.diffHarnesses(
    parent.harnessVersionId,
    boundedCandidate.harnessVersionId,
  );
  assert.equal(boundedDiff.changed.length, 1);
  assert.equal(boundedDiff.changed[0]?.mutableClass, "mutable");
  assert.equal(boundedDiff.immutableDiffCount, 0);

  const permissionV2 = await registry.createComponent({
    componentId: "component.permission-policy",
    semanticVersion: "2.0.0",
    typeEntryId: "type.permission-policy",
    payloadLanguage: "seh.policy-json.v1",
    payload: permissionPolicy("changed-v2"),
    capabilityIds: ["permission.authorize"],
  });
  const forbiddenCandidate = await registry.createHarness({
    semanticVersion: "2.0.0",
    requiredRuntimeContractHash: runtimeContractHash,
    bindings: [
      { slotId: "system_prompt", componentManifestId: promptV2.componentManifestId },
      { slotId: "permission", componentManifestId: permissionV2.componentManifestId },
    ],
  });
  assert.equal(
    registry.diffHarnesses(parent.harnessVersionId, forbiddenCandidate.harnessVersionId)
      .immutableDiffCount,
    1,
  );

  const reloaded = new HarnessComponentRegistry({
    root: path.join(root, "registry"),
    schemas,
    artifacts,
    requiredSlotIds: ["permission", "system_prompt"],
  });
  await reloaded.initialize(path.resolve("configs/component-type-registry.json"));
  assert.equal(
    reloaded.getHarness(boundedCandidate.harnessVersionId).manifestHash,
    boundedCandidate.manifestHash,
  );

  const proposer = PrincipalSigner.generate({
    principalId: "proposer.mutation",
    role: "proposer",
    implementationDigest: `sha256:${"b".repeat(64)}`,
    instanceId: "proposer.mutation.instance",
  });
  const mutation = new BoundedMutationEngine({
    root,
    protocolId: `protocol-sha256:${"c".repeat(64)}`,
    registry,
    schemas,
    clock: new DeterministicClock(),
    ids: new DeterministicIdFactory(),
    proposer: proposer.identity,
  });
  const mutationInput = {
    parentHarnessVersionId: parent.harnessVersionId,
    candidateSemanticVersion: "1.0.1",
    attributionMode: "guided" as const,
    attributionResultId: "attribution-001",
    causeClass: "single_fault" as const,
    primaryFailureMechanism: "The prompt omitted an explicit verification instruction.",
    targets: [
      {
        componentManifestId: promptV1.componentManifestId,
        nextSemanticVersion: "1.0.1",
        operations: [
          {
            op: "replace" as const,
            path: "/sections/0/content",
            value: "Act carefully and verify the result.",
          },
        ],
        semanticOperations: ["prompt.section.replaced"],
      },
    ],
    predictedFix: "The agent will verify its result before completion.",
    predictedRegressions: ["The additional check may use more context tokens."],
    passingBehaviorPreservation: ["task-contract-001"],
    predictionMetadata: {
      sourceEventIds: ["event-source-001"],
      sourceReceiptIds: [],
      confidenceMicros: 800_000,
      alternativeExplanations: ["The verifier could be overly strict."],
      producerIdentity: proposer.identity,
      method: "deterministic-test-attribution",
    },
  };
  const proposed = await mutation.propose(mutationInput);
  const proposalDiff = registry.diffHarnesses(
    parent.harnessVersionId,
    proposed.candidate.harnessVersionId,
  );
  assert.equal(proposalDiff.changed.length, 1);
  assert.equal(proposed.proposal.immutableDiffCount, 0);
  await mutation.setDisposition(proposed.proposal.mutationProposalId, "rejected");
  await assert.rejects(mutation.propose(mutationInput), /duplicates rejected proposal/u);
});
