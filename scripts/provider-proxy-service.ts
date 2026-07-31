import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  DeterministicIdFactory,
  FakeModelProvider,
  PrincipalRegistry,
  PrincipalSigner,
  ProviderProxyEngine,
  ProviderProxyStdioServer,
  SchemaRegistry,
  SecretRedactor,
  SystemClock,
  createOpenAIProviderViaConnect,
  parseStrictJson,
  readProtectedUtf8,
  verifyBudgetFreezeManifest,
  verifyProviderSmokeManifest,
  type BudgetFreezeManifest,
  type JsonValue,
  type ModelProvider,
  type ProviderSmokeManifest,
  type PublicPrincipal,
} from "../src/index.js";

const CONFIG_SCHEMA =
  "https://self-evolving-harness.local/schemas/provider-proxy-service-config.schema.json";

interface ProviderProxyServiceConfig {
  readonly schemaVersion: 1;
  readonly protocolId: string;
  readonly phaseAccountId: string;
  readonly stateRoot: string;
  readonly schemaDirectory: string;
  readonly budgetFreeze: BudgetFreezeManifest;
  readonly smokeManifest: ProviderSmokeManifest;
  readonly protocolAuthor: PublicPrincipal;
  readonly runtime: PublicPrincipal;
  readonly proxy: PublicPrincipal;
  readonly proxyPrivateKeyPath: string;
  readonly credentialPath: string;
  readonly credentialSlotId: string;
  readonly upstream:
    | {
        readonly mode: "fake";
        readonly responseId: string;
        readonly outputText: string;
        readonly echoCredential: boolean;
        readonly usage: {
          readonly inputTokens: number;
          readonly outputTokens: number;
          readonly reasoningTokens: number;
          readonly cachedInputTokens: number;
          readonly cacheWriteTokens: number;
          readonly totalTokens: number;
        };
      }
    | {
        readonly mode: "openai_connect";
        readonly egressSocketPath: string;
      };
}

function asConfig(value: JsonValue): ProviderProxyServiceConfig {
  return value as unknown as ProviderProxyServiceConfig;
}

async function loadConfig(
  configPath: string,
): Promise<{
  readonly config: ProviderProxyServiceConfig;
  readonly schemas: SchemaRegistry;
}> {
  const source = await readFile(configPath, "utf8");
  const value = parseStrictJson(source);
  const provisional = asConfig(value);
  const schemas = await SchemaRegistry.load(
    path.resolve(provisional.schemaDirectory),
  );
  schemas.validate(CONFIG_SCHEMA, value);
  return { config: provisional, schemas };
}

function fakeProvider(
  config: ProviderProxyServiceConfig,
  credential: string,
): ModelProvider {
  if (config.upstream.mode !== "fake") {
    throw new Error("fake provider config mismatch");
  }
  const outputText = config.upstream.echoCredential
    ? `${config.upstream.outputText} ${credential}`
    : config.upstream.outputText;
  return new FakeModelProvider([
    {
      responseId: config.upstream.responseId,
      modelIdentity:
        config.smokeManifest.provider.modelIdentity,
      output: [
        {
          kind: "assistant_message",
          text: outputText,
        },
      ],
      usage: config.upstream.usage,
      providerMetadata: { source: "external-fake-proxy" },
    },
  ]);
}

function upstreamProvider(
  config: ProviderProxyServiceConfig,
  credential: string,
): ModelProvider {
  if (config.upstream.mode === "fake") {
    return fakeProvider(config, credential);
  }
  const manifest = config.smokeManifest;
  if (
    manifest.provider.providerId !== "openai-responses" ||
    manifest.provider.apiOrigin !==
      "https://api.openai.com:443" ||
    manifest.provider.apiPath !== "/v1/responses" ||
    manifest.egress.transport !==
      "unix_connect_allowlist" ||
    manifest.egress.allowedHost !== "api.openai.com" ||
    manifest.egress.allowedPort !== 443 ||
    manifest.egress.tlsServerName !== "api.openai.com"
  ) {
    throw new Error("OpenAI CONNECT manifest is inconsistent");
  }
  return createOpenAIProviderViaConnect({
    apiKey: credential,
    providerOptions: {
      apiModel: manifest.provider.apiModel,
      modelIdentity: manifest.provider.modelIdentity,
      ...(manifest.provider.serviceTier === null
        ? {}
        : { serviceTier: manifest.provider.serviceTier }),
    },
    transport: {
      egressSocketPath:
        config.upstream.egressSocketPath,
      allowedHost: manifest.egress.allowedHost,
      allowedPort: manifest.egress.allowedPort,
      tlsServerName: manifest.egress.tlsServerName,
      apiPath: manifest.provider.apiPath,
      timeoutMillis: manifest.caps.wallClockMillis,
      maxRequestBytes: manifest.caps.requestBytes,
      maxResponseBytes: manifest.caps.responseBytes,
    },
  });
}

async function main(): Promise<void> {
  const configPath = process.argv[2];
  if (configPath === undefined) {
    throw new Error(
      "usage: provider-proxy-service <config.json>",
    );
  }
  const { config, schemas } = await loadConfig(
    path.resolve(configPath),
  );
  const uid = process.getuid?.();
  const gid = process.getgid?.();
  if (uid === undefined || gid === undefined) {
    throw new Error("provider proxy requires POSIX credentials");
  }
  const privateKeyPem = await readProtectedUtf8({
    file: path.resolve(config.proxyPrivateKeyPath),
    expectedUid: uid,
    expectedGid: gid,
    maxBytes: 16 * 1024,
  });
  const credentialSource = await readProtectedUtf8({
    file: path.resolve(config.credentialPath),
    expectedUid: uid,
    expectedGid: gid,
    maxBytes: 16 * 1024,
  });
  const credential = credentialSource.trim();
  if (
    credential.length === 0 ||
    credentialSource.trimEnd() !== credential
  ) {
    throw new Error("provider credential format is invalid");
  }
  if (
    config.credentialSlotId !==
      config.smokeManifest.credentialSlotId
  ) {
    throw new Error("provider credential slot is not frozen");
  }
  const signer = PrincipalSigner.import({
    identity: config.proxy.identity,
    keyId: config.proxy.keyId,
    privateKeyPem,
    publicKeyPem: config.proxy.publicKeyPem,
  });
  const principals = new PrincipalRegistry();
  for (const principal of [
    config.protocolAuthor,
    config.runtime,
    config.proxy,
  ]) {
    principals.register(principal);
  }
  verifyBudgetFreezeManifest({
    manifest: config.budgetFreeze,
    expectedProtocolId: config.protocolId,
    schemas,
    principals,
  });
  verifyProviderSmokeManifest({
    manifest: config.smokeManifest,
    expectedProtocolId: config.protocolId,
    budgetFreeze: config.budgetFreeze,
    schemas,
    principals,
  });
  const redactor = new SecretRedactor({
    openai_api_key: credential,
  });
  const provider = upstreamProvider(config, credential);
  const clock = new SystemClock();
  const engine = new ProviderProxyEngine({
    root: path.resolve(config.stateRoot),
    manifest: config.smokeManifest,
    phaseAccountId: config.phaseAccountId,
    provider,
    signer,
    principals,
    schemas,
    clock,
    redactor,
  });
  await engine.initialize();
  const server = new ProviderProxyStdioServer({
    protocolId: config.protocolId,
    manifest: config.smokeManifest,
    phaseAccountId: config.phaseAccountId,
    engine,
    schemas,
    proxySigner: signer,
    runtimePrincipal: config.runtime,
    principals,
    clock,
    ids: new DeterministicIdFactory(),
  });
  await server.serve();
}

await main().catch(() => {
  process.stderr.write("provider proxy service failed\n");
  process.exitCode = 2;
});
