import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  ArtifactStore,
  HarnessComponentRegistry,
  SchemaRegistry,
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
});
