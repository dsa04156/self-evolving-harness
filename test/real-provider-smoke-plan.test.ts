import assert from "node:assert/strict";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  DeterministicClock,
  HarnessError,
  PHASE_IDS,
  PrincipalRegistry,
  ProviderProxyEngine,
  SchemaRegistry,
  SecretRedactor,
  createRealProviderSmokeArtifacts,
  implementationAtCommitHash,
  loadAndVerifyRealProviderSmokePlan,
  realProviderEgressPolicyHash,
  realProviderPermissionPolicyHash,
  sha256,
  verifyBudgetFreezeManifest,
  verifyProviderSmokeManifest,
  type ModelProvider,
} from "../src/index.js";
import { deterministicPrincipal } from "./helpers/deterministic-principal.js";

const planPath = "configs/provider-smoke.openai-luna.json";
const pricingPath =
  "configs/provider-pricing.openai-gpt-5.6-luna.json";
const brokerPath = "evaluator/egress_connect_broker.py";

async function fixture(
  t: test.TestContext,
): Promise<{
  readonly root: string;
  readonly schemas: SchemaRegistry;
}> {
  const root = await mkdtemp(
    path.join(os.tmpdir(), "seh-real-smoke-plan-"),
  );
  t.after(async () => {
    await rm(root, { recursive: true, force: true });
  });
  await mkdir(path.join(root, "configs"), {
    recursive: true,
  });
  await mkdir(path.join(root, "evaluator"), {
    recursive: true,
  });
  for (const relativePath of [
    planPath,
    pricingPath,
    brokerPath,
  ]) {
    await copyFile(
      path.resolve(relativePath),
      path.join(root, relativePath),
    );
  }
  return {
    root,
    schemas: await SchemaRegistry.load(
      path.resolve("schemas"),
    ),
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  assert.equal(
    typeof value === "object" &&
      value !== null &&
      !Array.isArray(value),
    true,
  );
  return value as Record<string, unknown>;
}

async function mutateJson(
  file: string,
  mutate: (value: Record<string, unknown>) => void,
): Promise<void> {
  const value = asRecord(
    JSON.parse(await readFile(file, "utf8")),
  );
  mutate(value);
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
}

test("real provider smoke plan recomputes every external pin", async (t) => {
  const { root, schemas } = await fixture(t);
  const verified =
    await loadAndVerifyRealProviderSmokePlan({
      repositoryRoot: root,
      planPath,
      schemas,
    });

  assert.match(
    verified.planHash,
    /^sha256:[a-f0-9]{64}$/u,
  );
  assert.equal(
    verified.plan.provider.pricing.sourceHash,
    verified.pricingSourceHash,
  );
  assert.equal(
    verified.plan.egress.brokerImplementationHash,
    verified.brokerImplementationHash,
  );
  assert.equal(
    verified.plan.egress.policyHash,
    verified.egressPolicyHash,
  );
  assert.equal(
    verified.egressPolicyHash,
    realProviderEgressPolicyHash(verified.plan.egress),
  );
  assert.equal(
    verified.plan.datasetPermissions.join(","),
    "deterministic",
  );
  assert.equal(verified.plan.noHarnessMutation, true);
});

test("real provider artifacts freeze one signed deterministic-only call", async (t) => {
  const { root, schemas } = await fixture(t);
  const verifiedPlan =
    await loadAndVerifyRealProviderSmokePlan({
      repositoryRoot: root,
      planPath,
      schemas,
    });
  const sourceCommit = "a".repeat(40);
  const protocolAuthor = deterministicPrincipal({
    principalId: "protocol.author.real-smoke",
    role: "protocol_author",
    implementationDigest: implementationAtCommitHash({
      role: "protocol_author",
      sourceCommit,
    }),
    instanceId: "protocol.author.real-smoke.instance",
    seedByte: 91,
  });
  const proxyImplementationHash =
    implementationAtCommitHash({
      role: "model_provider_proxy",
      sourceCommit,
    });
  const providerProxy = deterministicPrincipal({
    principalId: "provider.proxy.real-smoke",
    role: "model_provider_proxy",
    implementationDigest: proxyImplementationHash,
    instanceId: "provider.proxy.real-smoke.instance",
    modelIdentityHash: sha256(
      verifiedPlan.plan.provider.modelIdentity,
    ),
    seedByte: 92,
  });
  const redactor = new SecretRedactor({
    openai_api_key: "sk-test-only-never-used",
  });
  const permissionPolicyHash =
    realProviderPermissionPolicyHash(verifiedPlan.plan);
  const artifacts = createRealProviderSmokeArtifacts({
    verifiedPlan,
    pins: {
      sourceCommit,
      environmentHash:
        `sha256:${"b".repeat(64)}`,
      permissionPolicyHash,
      proxyImplementationHash,
      createdAt: "2026-07-31T00:00:01.000Z",
    },
    protocolAuthor,
    providerProxy,
    redactionPolicyHash: redactor.scannerHash,
    schemas,
  });
  const principals = new PrincipalRegistry();
  principals.register(protocolAuthor.exportPublic());
  principals.register(providerProxy.exportPublic());

  verifyBudgetFreezeManifest({
    manifest: artifacts.budgetFreeze,
    expectedProtocolId: artifacts.protocolId,
    schemas,
    principals,
  });
  verifyProviderSmokeManifest({
    manifest: artifacts.smokeManifest,
    expectedProtocolId: artifacts.protocolId,
    budgetFreeze: artifacts.budgetFreeze,
    schemas,
    principals,
  });
  assert.deepEqual(
    artifacts.budgetFreeze.datasetPermissions,
    ["deterministic"],
  );
  assert.deepEqual(artifacts.budgetFreeze.methods, ["B0"]);
  assert.equal(
    artifacts.smokeManifest.caps.providerCallAttempts,
    1,
  );
  assert.equal(
    artifacts.smokeManifest.sourceConfigHash,
    verifiedPlan.planHash,
  );
  assert.deepEqual(
    artifacts.budgetFreeze.phaseCaps
      .filter((entry) => entry.phaseId !== "provider_smoke")
      .map((entry) => entry.caps),
    PHASE_IDS.filter(
      (phaseId) => phaseId !== "provider_smoke",
    ).map(() => ({
      providerModelRequestAttempts: 0,
      totalChargedTokens: 0,
      providerCostMicros: 0,
      toolAttempts: 0,
      feedbackEvents: 0,
      wallClockMillis: 0,
      processCount: 0,
      outputBytes: 0,
    })),
  );

  const providerWithReportedModel = (
    reportedModel: string,
  ): ModelProvider => ({
    providerId: "openai-responses",
    async generate() {
      return {
        responseId: `response.${reportedModel}`,
        modelIdentity:
          verifiedPlan.plan.provider.modelIdentity,
        output: [
          {
            kind: "assistant_message",
            text: verifiedPlan.plan.expectedOutput,
          },
        ],
        usage: {
          inputTokens: 10,
          outputTokens: 5,
          reasoningTokens: 0,
          cachedInputTokens: 0,
          cacheWriteTokens: 0,
          totalTokens: 15,
        },
        providerMetadata: {
          provider: "openai",
          requestedApiModel:
            verifiedPlan.plan.provider.apiModel,
          reportedModel,
        },
      };
    },
  });
  const accepted = new ProviderProxyEngine({
    root: path.join(root, "provider-accepted"),
    manifest: artifacts.smokeManifest,
    phaseAccountId: artifacts.phaseAccountId,
    provider: providerWithReportedModel(
      "gpt-5.6-luna-2026-07-31",
    ),
    signer: providerProxy,
    principals,
    schemas,
    clock: new DeterministicClock(),
    redactor,
  });
  await accepted.initialize();
  const acceptedResult = await accepted.execute(
    artifacts.request,
  );
  assert.equal(acceptedResult.receipt.status, "completed");
  assert.equal(
    acceptedResult.response?.providerMetadata[
      "reportedModel"
    ],
    "gpt-5.6-luna-2026-07-31",
  );

  const rejected = new ProviderProxyEngine({
    root: path.join(root, "provider-rejected"),
    manifest: artifacts.smokeManifest,
    phaseAccountId: artifacts.phaseAccountId,
    provider: providerWithReportedModel("different-model"),
    signer: providerProxy,
    principals,
    schemas,
    clock: new DeterministicClock(),
    redactor,
  });
  await rejected.initialize();
  const rejectedResult = await rejected.execute(
    artifacts.request,
  );
  assert.equal(rejectedResult.receipt.status, "failed");
  assert.equal(
    rejectedResult.receipt.error?.code,
    "PROTOCOL_MISMATCH",
  );
  assert.equal(rejectedResult.response, null);
});

test("real provider smoke plan rejects model and cap drift", async (t) => {
  const { root, schemas } = await fixture(t);
  const file = path.join(root, planPath);
  await mutateJson(file, (value) => {
    const provider = asRecord(value["provider"]);
    provider["apiModel"] = "changed-model";
    const caps = asRecord(value["caps"]);
    caps["totalChargedTokens"] = 257;
  });

  await assert.rejects(
    loadAndVerifyRealProviderSmokePlan({
      repositoryRoot: root,
      planPath,
      schemas,
    }),
    (error: unknown) =>
      error instanceof HarnessError &&
      error.code === "SCHEMA_INVALID",
  );
});

test("real provider smoke plan rejects pricing-source drift", async (t) => {
  const { root, schemas } = await fixture(t);
  await mutateJson(path.join(root, pricingPath), (value) => {
    value["outputMicrosPerMillionTokens"] = 6_000_001;
  });

  await assert.rejects(
    loadAndVerifyRealProviderSmokePlan({
      repositoryRoot: root,
      planPath,
      schemas,
    }),
    (error: unknown) =>
      error instanceof HarnessError &&
      (error.code === "SCHEMA_INVALID" ||
        error.code === "HASH_MISMATCH"),
  );
});

test("real provider smoke plan rejects broker byte drift", async (t) => {
  const { root, schemas } = await fixture(t);
  const file = path.join(root, brokerPath);
  await writeFile(
    file,
    `${await readFile(file, "utf8")}\n# uncommitted drift\n`,
  );

  await assert.rejects(
    loadAndVerifyRealProviderSmokePlan({
      repositoryRoot: root,
      planPath,
      schemas,
    }),
    (error: unknown) =>
      error instanceof HarnessError &&
      error.code === "HASH_MISMATCH",
  );
});

test("real provider smoke plan rejects policy-hash drift", async (t) => {
  const { root, schemas } = await fixture(t);
  await mutateJson(path.join(root, planPath), (value) => {
    const egress = asRecord(value["egress"]);
    egress["policyHash"] =
      `sha256:${"0".repeat(64)}`;
  });

  await assert.rejects(
    loadAndVerifyRealProviderSmokePlan({
      repositoryRoot: root,
      planPath,
      schemas,
    }),
    (error: unknown) =>
      error instanceof HarnessError &&
      (error.code === "SCHEMA_INVALID" ||
        error.code === "HASH_MISMATCH"),
  );
});

test("real provider smoke plan rejects symlinked artifacts", async (t) => {
  const { root, schemas } = await fixture(t);
  const broker = path.join(root, brokerPath);
  const target = path.join(root, "broker-target.py");
  await copyFile(broker, target);
  await rm(broker);
  await symlink(target, broker);

  await assert.rejects(
    loadAndVerifyRealProviderSmokePlan({
      repositoryRoot: root,
      planPath,
      schemas,
    }),
    (error: unknown) =>
      error instanceof HarnessError &&
      error.code === "AUTHORIZATION_DENIED",
  );
});
