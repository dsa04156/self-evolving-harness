import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  ArtifactStore,
  HarnessComponentRegistry,
  HarnessError,
  PRODUCT_RUNTIME_CONTRACT_HASH,
  ProductHarnessRegistry,
  SchemaRegistry,
  applyProductConfigOverrides,
  defaultProductConfig,
  sha256,
  type ProductStatePaths,
} from "../src/index.js";

function paths(stateRoot: string): ProductStatePaths {
  const projectRoot = path.join(stateRoot, "project");
  const sessionsRoot = path.join(projectRoot, "sessions");
  return {
    stateRoot,
    projectId: "harness-registry-test",
    projectRoot,
    configFile: path.join(projectRoot, "config.json"),
    memoryRoot: path.join(projectRoot, "memory"),
    sessionsRoot,
    skillsRoot: path.join(projectRoot, "skills"),
    sessionDirectory(sessionId) {
      return path.join(sessionsRoot, sessionId);
    },
    sessionRuntimeRoot(sessionId) {
      return path.join(sessionsRoot, sessionId, "runtime");
    },
  };
}

test("product settings materialize to an idempotent typed HarnessVersion closure", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "seh-product-harness-"));
  const workspace = path.join(root, "workspace");
  await mkdir(workspace, { recursive: true });
  t.after(async () => rm(root, { recursive: true, force: true }));

  const statePaths = paths(path.join(root, "state"));
  const registry = await ProductHarnessRegistry.open(statePaths);
  const config = defaultProductConfig(workspace, {
    providerKind: "ollama",
    model: "test-coder",
  });
  const first = await registry.materialize(config);
  const repeated = await registry.materialize(config);
  assert.equal(first.manifest.harnessVersionId, repeated.manifest.harnessVersionId);
  assert.equal(
    first.manifest.identity.requiredRuntimeContractHash,
    PRODUCT_RUNTIME_CONTRACT_HASH,
  );
  const slots = new Set(
    first.manifest.identity.componentBindings.map((binding) => binding.slotId),
  );
  for (const required of [
    "system_prompt",
    "context_policy",
    "memory_retrieval_policy",
    "workflow_policy",
    "routing_policy",
    "subagent_prompt",
    "permission_policy",
    "safety_policy",
    "budget_policy",
    "model_identity",
    "verification_policy",
    "evaluator",
    "trace_collector",
    "middleware",
  ]) {
    assert.ok(slots.has(required), `missing product harness slot ${required}`);
  }
  assert.ok([...slots].some((slot) => slot.startsWith("tool_implementation.")));
  assert.ok([...slots].some((slot) => slot.startsWith("tool_description.")));

  const resolved = await registry.resolve(first.manifest.harnessVersionId);
  assert.equal(resolved.execution.provider.model, "test-coder");
  assert.equal(resolved.execution.permissionMode, "workspace-write");
  assert.equal(resolved.execution.workflowPolicy.language, "seh.workflow.v1");
  assert.equal(resolved.execution.routingPolicy.language, "seh.routing-policy.v1");

  const changed = await registry.materialize(
    applyProductConfigOverrides(config, { permissionMode: "read-only" }),
  );
  assert.notEqual(changed.manifest.harnessVersionId, first.manifest.harnessVersionId);
  assert.equal(changed.execution.permissionMode, "read-only");
  assert.ok(
    changed.execution.allowedToolIds.every(
      (toolId) => !["filesystem.write", "filesystem.edit", "shell.bash"].includes(toolId),
    ),
  );

  const reopened = await ProductHarnessRegistry.open(statePaths);
  const fromDisk = await reopened.resolve(first.manifest.harnessVersionId);
  assert.equal(fromDisk.manifest.manifestHash, first.manifest.manifestHash);
  assert.equal(
    fromDisk.manifest.identity.behaviorClosure.closureHash,
    first.manifest.identity.behaviorClosure.closureHash,
  );

  const profiled = await registry.materialize(
    applyProductConfigOverrides(
      defaultProductConfig(workspace, {
        providerKind: "openai",
        model: "gpt-5.6-sol",
      }),
      { reasoningEffort: "xhigh", serviceTier: "priority" },
    ),
  );
  const recoveredProfile = await registry.resolve(profiled.manifest.harnessVersionId);
  assert.deepEqual(recoveredProfile.execution.provider, {
    kind: "openai",
    model: "gpt-5.6-sol",
    reasoningEffort: "xhigh",
    serviceTier: "priority",
  });
});

test("product resolution rejects another runtime contract and a misbound tool description", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "seh-product-harness-reject-"));
  const workspace = path.join(root, "workspace");
  await mkdir(workspace, { recursive: true });
  t.after(async () => rm(root, { recursive: true, force: true }));

  const statePaths = paths(path.join(root, "state"));
  const productRegistry = await ProductHarnessRegistry.open(statePaths);
  const materialized = await productRegistry.materialize(
    defaultProductConfig(workspace, {
      providerKind: "ollama",
      model: "test-coder",
    }),
  );
  const registryRoot = path.join(statePaths.projectRoot, "harness-registry");
  const schemas = await SchemaRegistry.load(path.resolve("schemas"));
  const rawRegistry = new HarnessComponentRegistry({
    root: registryRoot,
    schemas,
    artifacts: new ArtifactStore(path.join(registryRoot, "artifacts")),
  });
  await rawRegistry.initialize(path.resolve("configs/component-type-registry.json"));
  const bindings = materialized.manifest.identity.componentBindings.map((binding) => ({
    slotId: binding.slotId,
    componentManifestId: binding.component.componentManifestId,
  }));

  const wrongContract = await rawRegistry.createHarness({
    semanticVersion: "0.8.0+wrong-runtime-contract",
    requiredRuntimeContractHash: sha256({ runtime: "not-seh-product-runtime" }),
    bindings,
  });
  const descriptionBindings = bindings.filter((binding) =>
    binding.slotId.startsWith("tool_description."),
  );
  assert.ok(descriptionBindings.length >= 2);
  const target = descriptionBindings[0]!;
  const source = descriptionBindings[1]!;
  const misbound = await rawRegistry.createHarness({
    semanticVersion: "0.8.0+misbound-tool-description",
    requiredRuntimeContractHash: PRODUCT_RUNTIME_CONTRACT_HASH,
    bindings: bindings.map((binding) =>
      binding.slotId === target.slotId
        ? { ...binding, componentManifestId: source.componentManifestId }
        : binding,
    ),
  });

  const reopened = await ProductHarnessRegistry.open(statePaths);
  await assert.rejects(
    () => reopened.resolve(wrongContract.harnessVersionId),
    (error: unknown) =>
      error instanceof HarnessError && error.code === "PROTOCOL_MISMATCH",
  );
  await assert.rejects(
    () => reopened.resolve(misbound.harnessVersionId),
    (error: unknown) =>
      error instanceof HarnessError && error.code === "PROTOCOL_MISMATCH",
  );
});
