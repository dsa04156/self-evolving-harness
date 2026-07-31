import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  DeterministicIdFactory,
  PrincipalRegistry,
  PrincipalSigner,
  SchemaRegistry,
  SystemClock,
  UnixProviderProxyClient,
  canonicalBytes,
  parseStrictJson,
  readProtectedUtf8,
  verifyBudgetFreezeManifest,
  verifyProviderSmokeManifest,
  type BudgetFreezeManifest,
  type JsonValue,
  type ModelRequest,
  type ProviderSmokeManifest,
  type PublicPrincipal,
} from "../src/index.js";

interface ProviderOsRuntimeConfig {
  readonly protocolId: string;
  readonly phaseAccountId: string;
  readonly schemaDirectory: string;
  readonly socketPath: string;
  readonly relayScriptPath: string;
  readonly expectedProviderUid: number;
  readonly expectedProviderGid: number;
  readonly runtime: PublicPrincipal;
  readonly runtimePrivateKeyPath: string;
  readonly proxy: PublicPrincipal;
  readonly protocolAuthor: PublicPrincipal;
  readonly budgetFreeze: BudgetFreezeManifest;
  readonly smokeManifest: ProviderSmokeManifest;
  readonly request: ModelRequest;
  readonly forbiddenCredentialPath: string;
  readonly outputPath: string;
}

function asConfig(value: JsonValue): ProviderOsRuntimeConfig {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value)
  ) {
    throw new Error("provider runtime config is not an object");
  }
  return value as unknown as ProviderOsRuntimeConfig;
}

async function forbiddenCredentialDenied(
  file: string,
): Promise<boolean> {
  try {
    await readFile(file);
    return false;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    return code === "EACCES" || code === "EPERM";
  }
}

async function main(): Promise<void> {
  const source = process.argv[2];
  if (source === undefined) {
    throw new Error("provider runtime config path is required");
  }
  const config = asConfig(
    parseStrictJson(
      await readFile(path.resolve(source), "utf8"),
    ),
  );
  const uid = process.getuid?.();
  const gid = process.getgid?.();
  if (uid === undefined || gid === undefined) {
    throw new Error("provider runtime requires POSIX credentials");
  }
  const privateKeyPem = await readProtectedUtf8({
    file: config.runtimePrivateKeyPath,
    expectedUid: uid,
    expectedGid: gid,
    maxBytes: 16 * 1024,
  });
  const runtimeSigner = PrincipalSigner.import({
    identity: config.runtime.identity,
    keyId: config.runtime.keyId,
    privateKeyPem,
    publicKeyPem: config.runtime.publicKeyPem,
  });
  const schemas = await SchemaRegistry.load(
    config.schemaDirectory,
  );
  const principals = new PrincipalRegistry();
  for (const principal of [
    config.runtime,
    config.proxy,
    config.protocolAuthor,
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
  const client = new UnixProviderProxyClient({
    protocolId: config.protocolId,
    manifest: config.smokeManifest,
    phaseAccountId: config.phaseAccountId,
    endpoint: {
      socketPath: config.socketPath,
      expectedProviderUid: config.expectedProviderUid,
      expectedProviderGid: config.expectedProviderGid,
      pythonExecutable: "/usr/bin/python3",
      relayScriptPath: config.relayScriptPath,
    },
    schemas,
    runtimeSigner,
    providerPrincipal: config.proxy,
    principals,
    clock: new SystemClock(),
    ids: new DeterministicIdFactory(),
  });
  try {
    await client.start();
    const peer = client.peerCredentials;
    const result = await client.executeWithReceipt(config.request);
    await writeFile(
      config.outputPath,
      canonicalBytes({
        schemaVersion: 1,
        runtimeUid: uid,
        runtimeGid: gid,
        providerPeer: peer as unknown as JsonValue,
        forbiddenCredentialReadDenied:
          await forbiddenCredentialDenied(
            config.forbiddenCredentialPath,
          ),
        result: result as unknown as JsonValue,
      }),
      { mode: 0o600 },
    );
  } finally {
    await client.stop();
  }
}

await main();
