import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import {
  lstat,
  mkdtemp,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  BudgetFreezeStore,
  DeterministicIdFactory,
  DeterministicClock,
  FakeModelProvider,
  HarnessError,
  PHASE_IDS,
  PrincipalRegistry,
  ProviderProxyEngine,
  ProviderSmokeManifestStore,
  SchemaRegistry,
  SecretRedactor,
  SystemClock,
  UnixProviderProxyClient,
  canonicalBytes,
  createProviderSmokeManifest,
  modelRequestHash,
  providerCostMicros,
  sha256,
  verifyProviderSmokeManifest,
  type BudgetFreezeCore,
  type BudgetFreezeManifest,
  type JsonValue,
  type ModelRequest,
  type ModelResponse,
  type PhaseBudgetCaps,
  type PrincipalSigner,
  type ProviderSmokeCore,
  type ProviderSmokeManifest,
} from "../src/index.js";
import { deterministicPrincipal } from "./helpers/deterministic-principal.js";

const digest = (character: string): string =>
  `sha256:${character.repeat(64)}`;

async function temporaryDirectory(
  t: test.TestContext,
): Promise<string> {
  const root = await mkdtemp(
    path.join(os.tmpdir(), "seh-provider-proxy-"),
  );
  t.after(async () => {
    await rm(root, { recursive: true, force: true });
  });
  return root;
}

async function waitForSocket(file: string): Promise<void> {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    try {
      if ((await lstat(file)).isSocket()) return;
    } catch {
      // The provider front has not bound yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`provider socket did not appear: ${file}`);
}

function caps(
  overrides: Partial<PhaseBudgetCaps> = {},
): PhaseBudgetCaps {
  return {
    providerModelRequestAttempts: 1,
    totalChargedTokens: 100,
    providerCostMicros: 100,
    toolAttempts: 0,
    feedbackEvents: 0,
    wallClockMillis: 10_000,
    processCount: 1,
    outputBytes: 100_000,
    ...overrides,
  };
}

function budgetCore(input: {
  readonly protocolId: string;
  readonly modelIdentityHash: string;
  readonly permissionPolicyHash: string;
}): Omit<
  BudgetFreezeCore,
  "schemaVersion" | "hashDomain" | "createdBy"
> {
  return {
    protocolId: input.protocolId,
    scope: "provider_smoke",
    datasetPermissions: ["deterministic"],
    modelIdentityHash: input.modelIdentityHash,
    toolSetHash: digest("1"),
    environmentHash: digest("2"),
    permissionPolicyHash: input.permissionPolicyHash,
    methods: ["B0"],
    rolloutSeeds: [1729],
    solverSlots: [{ methodId: "B0", slots: 1 }],
    phaseCaps: PHASE_IDS.map((phaseId) => ({
      phaseId,
      caps: caps(),
    })),
    perRequestTokenCap: 100,
    perRequestCostCapMicros: 100,
    sourceConfigHash: digest("3"),
    supersedesBudgetFreezeId: null,
    createdAt: "2026-07-31T00:00:00.000Z",
  };
}

function syntheticRequest(): ModelRequest {
  return {
    requestId: "provider-request.synthetic-smoke.1",
    modelIdentity: "fake:model-smoke-v1",
    instructions:
      "This is a synthetic transport check. Return SYNTHETIC_OK.",
    input: [
      {
        kind: "text",
        role: "user",
        content: "Synthetic non-benchmark input.",
      },
    ],
    tools: [],
    maxOutputTokens: 32,
    reasoningEffort: "none",
  };
}

function smokeCore(input: {
  readonly protocolId: string;
  readonly budgetFreeze: BudgetFreezeManifest;
  readonly proxy: PrincipalSigner;
  readonly redactor: SecretRedactor;
  readonly request: ModelRequest;
}): Omit<
  ProviderSmokeCore,
  "schemaVersion" | "hashDomain" | "createdBy"
> {
  const modelIdentityHash = sha256(
    input.request.modelIdentity,
  );
  return {
    protocolId: input.protocolId,
    budgetFreezeId: input.budgetFreeze.budgetFreezeId,
    purpose: "synthetic_non_benchmark_provider_smoke",
    syntheticTaskId: "synthetic.provider.transport.1",
    modelRequestHash: modelRequestHash(input.request),
    provider: {
      providerId: "fake-provider",
      apiOrigin: "none",
      apiPath: "none",
      apiModel: "fake-model-smoke-v1",
      modelIdentity: input.request.modelIdentity,
      modelIdentityHash,
      serviceTier: null,
      reasoningEffort: "none",
      maxOutputTokens: input.request.maxOutputTokens,
      store: false,
      parallelToolCalls: false,
      toolCount: 0,
      pricing: {
        currency: "USD",
        inputMicrosPerMillionTokens: 1_000_000,
        cachedInputMicrosPerMillionTokens: 1_000_000,
        cacheWriteMicrosPerMillionTokens: 2_000_000,
        outputMicrosPerMillionTokens: 3_000_000,
        reasoningIncludedInOutput: true,
        sourceHash: digest("4"),
        effectiveAt: "2026-07-31T00:00:00.000Z",
      },
    },
    credentialPrincipal: input.proxy.identity,
    credentialSlotId: "fake.synthetic.none",
    egress: {
      transport: "none",
      allowedHost: "none",
      allowedPort: 0,
      tlsServerName: "none",
      maxTunnelBytes: 0,
      brokerImplementationHash: digest("5"),
      policyHash: digest("6"),
    },
    caps: {
      providerCallAttempts: 1,
      totalChargedTokens: 100,
      providerCostMicros: 100,
      wallClockMillis: 10_000,
      requestBytes: 10_000,
      responseBytes: 100_000,
    },
    permissionPolicyHash:
      input.budgetFreeze.permissionPolicyHash,
    redactionPolicyHash: input.redactor.scannerHash,
    proxyImplementationHash:
      input.proxy.identity.implementationDigest,
    sourceConfigHash: digest("7"),
    createdAt: "2026-07-31T00:00:01.000Z",
  };
}

async function fixture(t: test.TestContext): Promise<{
  readonly root: string;
  readonly protocolId: string;
  readonly schemas: SchemaRegistry;
  readonly principals: PrincipalRegistry;
  readonly protocolAuthor: PrincipalSigner;
  readonly proxy: PrincipalSigner;
  readonly redactor: SecretRedactor;
  readonly budgetFreeze: BudgetFreezeManifest;
  readonly request: ModelRequest;
  readonly manifest: ProviderSmokeManifest;
}> {
  const root = await temporaryDirectory(t);
  const protocolId = `protocol-sha256:${"8".repeat(64)}`;
  const schemas = await SchemaRegistry.load(path.resolve("schemas"));
  const principals = new PrincipalRegistry();
  const protocolAuthor = deterministicPrincipal({
    principalId: "protocol.author.provider-smoke",
    role: "protocol_author",
    implementationDigest: digest("9"),
    instanceId: "protocol.author.provider-smoke.instance",
    seedByte: 61,
  });
  const proxy = deterministicPrincipal({
    principalId: "provider.proxy.synthetic",
    role: "fake_provider",
    implementationDigest: digest("a"),
    instanceId: "provider.proxy.synthetic.instance",
    modelIdentityHash: sha256("fake:model-smoke-v1"),
    seedByte: 62,
  });
  principals.register(protocolAuthor.exportPublic());
  principals.register(proxy.exportPublic());
  const request = syntheticRequest();
  const permissionPolicyHash = digest("b");
  const budgetStore = new BudgetFreezeStore({
    root,
    protocolId,
    schemas,
    principals,
    signer: protocolAuthor,
  });
  await budgetStore.initialize();
  const budgetFreeze = await budgetStore.freeze(
    budgetCore({
      protocolId,
      modelIdentityHash: sha256(request.modelIdentity),
      permissionPolicyHash,
    }),
  );
  const redactor = new SecretRedactor({
    openai_api_key: "sk-synthetic-secret",
  });
  const smokeStore = new ProviderSmokeManifestStore({
    root,
    protocolId,
    budgetFreeze,
    schemas,
    principals,
    signer: protocolAuthor,
  });
  await smokeStore.initialize();
  const manifest = await smokeStore.freeze(
    smokeCore({
      protocolId,
      budgetFreeze,
      proxy,
      redactor,
      request,
    }),
  );
  return {
    root,
    protocolId,
    schemas,
    principals,
    protocolAuthor,
    proxy,
    redactor,
    budgetFreeze,
    request,
    manifest,
  };
}

function response(
  outputText = "SYNTHETIC_OK sk-synthetic-secret",
): ModelResponse {
  return {
    responseId: "response.synthetic.1",
    modelIdentity: "fake:model-smoke-v1",
    output: [
      {
        kind: "assistant_message",
        text: outputText,
      },
      {
        kind: "provider_state",
        providerItem: {
          encrypted: "not-retained-by-smoke-normalization",
        },
      },
    ],
    usage: {
      inputTokens: 10,
      outputTokens: 5,
      reasoningTokens: 2,
      cachedInputTokens: 1,
      cacheWriteTokens: 2,
      totalTokens: 15,
    },
    providerMetadata: {
      upstreamSecretEcho: "sk-synthetic-secret",
    },
  };
}

test("provider smoke freeze and proxy execution are exact, redacted and replayable", async (t) => {
  const value = await fixture(t);
  verifyProviderSmokeManifest({
    manifest: value.manifest,
    expectedProtocolId: value.protocolId,
    budgetFreeze: value.budgetFreeze,
    schemas: value.schemas,
    principals: value.principals,
  });
  assert.equal(
    providerCostMicros(
      response().usage,
      value.manifest.provider.pricing,
    ),
    27,
  );
  const provider = new FakeModelProvider([response()]);
  const engine = new ProviderProxyEngine({
    root: value.root,
    manifest: value.manifest,
    phaseAccountId: "phase-account.provider-smoke.1",
    provider,
    signer: value.proxy,
    principals: value.principals,
    schemas: value.schemas,
    clock: new DeterministicClock(),
    redactor: value.redactor,
  });
  await engine.initialize();
  const result = await engine.execute(value.request);
  assert.equal(result.receipt.status, "completed");
  assert.equal(result.receipt.usage.providerCostMicros, 27);
  assert.equal(
    result.response?.output[0]?.kind === "assistant_message"
      ? result.response.output[0].text
      : null,
    "SYNTHETIC_OK [REDACTED:openai_api_key]",
  );
  assert.deepEqual(result.receipt.redaction.appliedRuleIds, [
    "openai_api_key",
  ]);
  assert.doesNotMatch(
    JSON.stringify(result),
    /sk-synthetic-secret/u,
  );
  assert.equal(provider.requests.length, 1);
  assert.equal(
    (await engine.execute(value.request)).receipt
      .providerCallReceiptId,
    result.receipt.providerCallReceiptId,
  );
  assert.equal(provider.requests.length, 1);

  const restarted = new ProviderProxyEngine({
    root: value.root,
    manifest: value.manifest,
    phaseAccountId: "phase-account.provider-smoke.1",
    provider,
    signer: value.proxy,
    principals: value.principals,
    schemas: value.schemas,
    clock: new DeterministicClock(),
    redactor: value.redactor,
  });
  await restarted.initialize();
  assert.equal(
    (await restarted.execute(value.request)).receipt
      .providerCallReceiptId,
    result.receipt.providerCallReceiptId,
  );
  await assert.rejects(
    restarted.execute({
      ...value.request,
      instructions: "This mutation is not frozen.",
    }),
    /frozen synthetic request/u,
  );

  const forged = {
    ...value.manifest,
    provider: {
      ...value.manifest.provider,
      apiModel: "fake-model-forged",
    },
  };
  assert.throws(() =>
    verifyProviderSmokeManifest({
      manifest: forged,
      expectedProtocolId: value.protocolId,
      budgetFreeze: value.budgetFreeze,
      schemas: value.schemas,
      principals: value.principals,
    }),
  );
});

test("provider failures redact errors and charge the full frozen reservation", async (t) => {
  const value = await fixture(t);
  const provider = new FakeModelProvider([
    () => {
      throw new HarnessError(
        "INTERNAL_ERROR",
        "upstream failed with sk-synthetic-secret",
      );
    },
  ]);
  const engine = new ProviderProxyEngine({
    root: path.join(value.root, "failure"),
    manifest: value.manifest,
    phaseAccountId: "phase-account.provider-smoke.failure",
    provider,
    signer: value.proxy,
    principals: value.principals,
    schemas: value.schemas,
    clock: new DeterministicClock(),
    redactor: value.redactor,
  });
  await engine.initialize();
  const result = await engine.execute(value.request);
  assert.equal(result.receipt.status, "failed");
  assert.equal(result.response, null);
  assert.deepEqual(result.receipt.usage, {
    usageAvailable: false,
    inputTokens: 0,
    cachedInputTokens: 0,
    cacheWriteTokens: 0,
    outputTokens: 0,
    reasoningTokens: 0,
    providerTotalTokens: 0,
    totalChargedTokens: 100,
    providerCostMicros: 100,
    costBasis: "full_reservation_no_usage",
  });
  assert.match(
    result.receipt.error?.safeDetail ?? "",
    /\[REDACTED:openai_api_key\]/u,
  );
  assert.doesNotMatch(
    JSON.stringify(result),
    /sk-synthetic-secret/u,
  );
});

test("provider overage yields a signed budget-exhausted result without response release", async (t) => {
  const value = await fixture(t);
  const over = response("SYNTHETIC_TOO_LARGE");
  const provider = new FakeModelProvider([
    {
      ...over,
      usage: {
        ...over.usage,
        inputTokens: 70,
        cachedInputTokens: 0,
        cacheWriteTokens: 0,
        outputTokens: 40,
        reasoningTokens: 10,
        totalTokens: 110,
      },
    },
  ]);
  const engine = new ProviderProxyEngine({
    root: path.join(value.root, "overage"),
    manifest: value.manifest,
    phaseAccountId: "phase-account.provider-smoke.overage",
    provider,
    signer: value.proxy,
    principals: value.principals,
    schemas: value.schemas,
    clock: new DeterministicClock(),
    redactor: value.redactor,
  });
  await engine.initialize();
  const result = await engine.execute(value.request);
  assert.equal(result.receipt.status, "budget_exhausted");
  assert.equal(result.receipt.usage.totalChargedTokens, 110);
  assert.equal(result.receipt.error?.code, "BUDGET_EXHAUSTED");
  assert.equal(result.response, null);
  assert.match(
    result.receipt.providerCallReceiptId,
    /^pcr-sha256:[a-f0-9]{64}$/u,
  );
  assert.equal(
    sha256(
      result.receipt.producer as unknown as JsonValue,
    ),
    sha256(
      value.proxy.identity as unknown as JsonValue,
    ),
  );
});

test("runtime reaches the credential-owning provider only through the authenticated Unix boundary", async (t) => {
  const value = await fixture(t);
  const runtime = deterministicPrincipal({
    principalId: "runtime.provider-wire",
    role: "runtime",
    implementationDigest: digest("c"),
    instanceId: "runtime.provider-wire.instance",
    seedByte: 63,
  });
  value.principals.register(runtime.exportPublic());
  const privateKeyPath = path.join(
    value.root,
    "proxy-private.pem",
  );
  const credentialPath = path.join(
    value.root,
    "provider-secret",
  );
  const serviceState = path.join(value.root, "service-state");
  const socketPath = path.join(value.root, "provider.sock");
  const configPath = path.join(
    value.root,
    "provider-service.json",
  );
  await writeFile(
    privateKeyPath,
    value.proxy.exportPrivatePem(),
    { mode: 0o600 },
  );
  await writeFile(
    credentialPath,
    "sk-synthetic-secret\n",
    { mode: 0o600 },
  );
  const phaseAccountId = "phase-account.provider-wire.1";
  await writeFile(
    configPath,
    canonicalBytes({
      schemaVersion: 1,
      protocolId: value.protocolId,
      phaseAccountId,
      stateRoot: serviceState,
      schemaDirectory: path.resolve("schemas"),
      budgetFreeze:
        value.budgetFreeze as unknown as JsonValue,
      smokeManifest: value.manifest as unknown as JsonValue,
      protocolAuthor:
        value.protocolAuthor.exportPublic() as unknown as JsonValue,
      runtime: runtime.exportPublic() as unknown as JsonValue,
      proxy: value.proxy.exportPublic() as unknown as JsonValue,
      proxyPrivateKeyPath: privateKeyPath,
      credentialPath,
      credentialSlotId: value.manifest.credentialSlotId,
      upstream: {
        mode: "fake",
        responseId: "response.external-provider.1",
        outputText: "SYNTHETIC_EXTERNAL_OK",
        echoCredential: true,
        usage: {
          inputTokens: 10,
          outputTokens: 5,
          reasoningTokens: 2,
          cachedInputTokens: 1,
          cacheWriteTokens: 2,
          totalTokens: 15,
        },
      },
    }),
    { mode: 0o600 },
  );
  const front = spawn(
    "/usr/bin/python3",
    [
      "-I",
      path.resolve("evaluator/provider_unix_front.py"),
      "--socket",
      socketPath,
      "--expected-client-uid",
      String(process.getuid!()),
      "--expected-client-gid",
      String(process.getgid!()),
      "--timeout-millis",
      "15000",
      "--socket-mode",
      "600",
      "--",
      process.execPath,
      "--import",
      "tsx",
      path.resolve("scripts/provider-proxy-service.ts"),
      configPath,
    ],
    {
      stdio: ["ignore", "ignore", "pipe"],
      env: {
        PATH: "/usr/bin:/bin",
        LANG: "C.UTF-8",
        LC_ALL: "C.UTF-8",
        TZ: "UTC",
      },
    },
  );
  const frontErrors: Buffer[] = [];
  front.stderr.on("data", (chunk: Buffer) =>
    frontErrors.push(Buffer.from(chunk)),
  );
  t.after(() => {
    if (front.exitCode === null) front.kill("SIGKILL");
  });
  await waitForSocket(socketPath);
  const client = new UnixProviderProxyClient({
    protocolId: value.protocolId,
    manifest: value.manifest,
    phaseAccountId,
    endpoint: {
      socketPath,
      expectedProviderUid: process.getuid!(),
      expectedProviderGid: process.getgid!(),
      pythonExecutable: "/usr/bin/python3",
      relayScriptPath: path.resolve(
        "evaluator/unix_peer_relay.py",
      ),
    },
    schemas: value.schemas,
    runtimeSigner: runtime,
    providerPrincipal: value.proxy.exportPublic(),
    principals: value.principals,
    clock: new SystemClock(),
    ids: new DeterministicIdFactory(),
  });
  await client.start();
  const result = await client.executeWithReceipt(value.request);
  assert.equal(result.receipt.status, "completed");
  assert.equal(
    result.response?.output[0]?.kind === "assistant_message"
      ? result.response.output[0].text
      : null,
    "SYNTHETIC_EXTERNAL_OK [REDACTED:openai_api_key]",
  );
  assert.doesNotMatch(
    JSON.stringify(result),
    /sk-synthetic-secret/u,
  );
  assert.equal(
    client.lastReceipt?.providerCallReceiptId,
    result.receipt.providerCallReceiptId,
  );
  await client.stop();
  const exitCode = await new Promise<number | null>((resolve) =>
    front.once("close", resolve),
  );
  assert.equal(
    exitCode,
    0,
    Buffer.concat(frontErrors).toString("utf8"),
  );
});
