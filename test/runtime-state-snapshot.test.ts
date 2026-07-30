import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  ArtifactStore,
  RuntimeStateSnapshotStore,
  SchemaRegistry,
  type RuntimeStateSnapshotIdentity,
} from "../src/index.js";

const digest = (character: string): string => `sha256:${character.repeat(64)}`;
const protocolId = `protocol-sha256:${"1".repeat(64)}`;
const harnessVersionId = `hv-sha256:${"2".repeat(64)}`;

async function temporaryDirectory(t: test.TestContext): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "seh-snapshot-"));
  t.after(async () => {
    await rm(directory, { recursive: true, force: true });
  });
  return directory;
}

test("runtime snapshot identity changes for every behavior-bearing state family", async (t) => {
  const root = await temporaryDirectory(t);
  const schemas = await SchemaRegistry.load(path.resolve("schemas"));
  const artifacts = new ArtifactStore(path.join(root, "artifacts"));
  await artifacts.initialize();
  const baseFilesystem = await artifacts.put(
    Buffer.from("base-fs"),
    "application/octet-stream",
  );
  const memoryManifest = await artifacts.putJson({ memory: "fixed" });
  const checkpoint = await artifacts.putJson({ checkpoint: 1 });
  const cacheManifest = await artifacts.putJson({ cache: "fixed" });
  const store = new RuntimeStateSnapshotStore({
    root,
    schemas,
    artifacts,
  });
  await store.initialize();
  const base: RuntimeStateSnapshotIdentity = {
    canonicalizationProfile: "seh-c14n-int-v1",
    protocolId,
    harnessVersionId,
    memory: { mode: "fresh_empty", manifest: null },
    workspace: {
      baseFilesystem,
      repositoryTreeHash: digest("3"),
      overlayMode: "fresh_copy_on_write",
      untrackedFilesAllowed: false,
    },
    environment: {
      containerImageDigest: digest("4"),
      toolchainDigest: digest("5"),
      os: "linux",
      architecture: "x86_64",
      locale: "C.UTF-8",
      timezone: "UTC",
      clockMode: "fixed_epoch",
      randomSeed: 17,
      environmentAllowlistHash: digest("6"),
    },
    checkpoint: { mode: "none", artifact: null },
    caches: {
      providerCacheMode: "disabled",
      runtimeCacheMode: "fresh_empty",
      manifest: null,
    },
    policyPins: {
      permissionPolicyHash: digest("7"),
      safetyPolicyHash: digest("8"),
      modelIdentityHash: digest("9"),
      budgetPolicyHash: digest("a"),
      networkPolicyHash: digest("b"),
    },
    inheritance: {
      descendantsMustInherit: true,
      rebindAllowed: false,
      pinnedFields: [
        "budgetAccountId",
        "datasetPermissions",
        "harnessVersionId",
        "modelIdentityHash",
        "principalDelegation",
        "protocolId",
        "runtimeStateSnapshotId",
      ],
    },
  };
  const baseline = await store.create(base);
  const variants: RuntimeStateSnapshotIdentity[] = [
    {
      ...base,
      memory: { mode: "fixed_readonly", manifest: memoryManifest },
    },
    {
      ...base,
      workspace: { ...base.workspace, repositoryTreeHash: digest("c") },
    },
    {
      ...base,
      environment: { ...base.environment, randomSeed: 18 },
    },
    {
      ...base,
      environment: {
        ...base.environment,
        environmentAllowlistHash: digest("d"),
      },
    },
    {
      ...base,
      checkpoint: { mode: "fixed", artifact: checkpoint },
    },
    {
      ...base,
      caches: {
        providerCacheMode: "disabled",
        runtimeCacheMode: "fixed_readonly",
        manifest: cacheManifest,
      },
    },
    {
      ...base,
      policyPins: { ...base.policyPins, permissionPolicyHash: digest("e") },
    },
  ];
  const variantIds = [];
  for (const variant of variants) {
    variantIds.push((await store.create(variant)).snapshotId);
  }
  assert.equal(new Set([baseline.snapshotId, ...variantIds]).size, 8);
  await store.verifyAll();

  const reloaded = new RuntimeStateSnapshotStore({
    root,
    schemas,
    artifacts,
  });
  await reloaded.initialize();
  assert.equal(
    reloaded.get(baseline.snapshotId).snapshotHash,
    baseline.snapshotHash,
  );
  await assert.rejects(
    store.create({
      ...base,
      memory: { mode: "fixed_readonly", manifest: null },
    }),
    /Memory mode and manifest disagree/u,
  );
});
