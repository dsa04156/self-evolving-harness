import { spawn } from "node:child_process";
import { execFile } from "node:child_process";
import {
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import {
  PROVIDER_PROXY_RESULT_SCHEMA_ID,
  PrincipalRegistry,
  PrincipalSigner,
  SchemaRegistry,
  SecretRedactor,
  canonicalBytes,
  createRealProviderSmokeArtifacts,
  implementationAtCommitHash,
  loadAndVerifyRealProviderSmokePlan,
  parseStrictJson,
  realProviderPermissionPolicyHash,
  sha256,
  sha256Bytes,
  verifyBudgetFreezeManifest,
  verifyProviderCallReceipt,
  verifyProviderSmokeManifest,
  type JsonValue,
  type ProviderProxyResult,
  type PublicPrincipal,
  type RealProviderSmokePlan,
} from "../src/index.js";

const execFileAsync = promisify(execFile);
const EVIDENCE_SCHEMA =
  "https://self-evolving-harness.local/schemas/real-provider-smoke-evidence.schema.json";
const DEFAULT_PLAN =
  "configs/provider-smoke.openai-luna.json";
const DEFAULT_OUTPUT =
  "architect/evidence/gate3/real-provider-smoke";
const MAX_PROCESS_OUTPUT_BYTES = 1024 * 1024;

interface Arguments {
  readonly mode: "validate" | "run";
  readonly planPath: string;
  readonly outputDirectory: string;
}

interface GateEvidence {
  readonly schemaVersion: 1;
  readonly isolationClass:
    "os_enforced_provider_proxy_with_credential_blind_egress";
  readonly uidMap: string;
  readonly roleUids: {
    readonly runtime: 1102;
    readonly provider: 1106;
    readonly egress: 1107;
  };
  readonly hostRoleUids: {
    readonly runtime: number;
    readonly provider: number;
    readonly egress: number;
  };
  readonly roleProbes: {
    readonly runtime: {
      readonly networkDenied: string;
    };
    readonly provider: {
      readonly networkDenied: string;
    };
  };
  readonly integration: {
    readonly runtimeUid: 1102;
    readonly providerPeer: {
      readonly uid: 1106;
      readonly gid: 1106;
    };
    readonly forbiddenCredentialReadDenied: true;
    readonly result: ProviderProxyResult;
  };
  readonly providerPrivateOwner: 1106;
  readonly providerCredentialOwner: 1106;
  readonly runtimePrivateOwner: 1102;
  readonly egressBroker: {
    readonly credentialMount: false;
    readonly tlsTermination: false;
    readonly allowedHost: "api.openai.com";
    readonly allowedPort: 443;
    readonly implementationHash: string;
    readonly policyHash: string;
    readonly stdoutBytes: number;
  };
}

function argumentsFrom(argv: readonly string[]): Arguments {
  let mode: Arguments["mode"] | null = null;
  let planPath = DEFAULT_PLAN;
  let outputDirectory = DEFAULT_OUTPUT;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--validate-plan") {
      if (mode !== null) throw new Error("choose one smoke mode");
      mode = "validate";
    } else if (argument === "--run") {
      if (mode !== null) throw new Error("choose one smoke mode");
      mode = "run";
    } else if (argument === "--plan") {
      const value = argv[index + 1];
      if (value === undefined) throw new Error("--plan needs a path");
      planPath = value;
      index += 1;
    } else if (argument === "--output-directory") {
      const value = argv[index + 1];
      if (value === undefined) {
        throw new Error("--output-directory needs a path");
      }
      outputDirectory = value;
      index += 1;
    } else {
      throw new Error(`unknown argument: ${argument}`);
    }
  }
  if (mode === null) {
    throw new Error("use --validate-plan or --run");
  }
  return { mode, planPath, outputDirectory };
}

function asGateEvidence(value: JsonValue): GateEvidence {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value)
  ) {
    throw new Error("real-provider OS gate emitted no object");
  }
  return value as unknown as GateEvidence;
}

async function commandOutput(
  executable: string,
  args: readonly string[],
): Promise<string> {
  const result = await execFileAsync(executable, [...args], {
    cwd: path.resolve("."),
    env: {
      PATH: "/usr/bin:/bin",
      LANG: "C.UTF-8",
      LC_ALL: "C.UTF-8",
      TZ: "UTC",
    },
    maxBuffer: MAX_PROCESS_OUTPUT_BYTES,
  });
  return result.stdout.trim();
}

async function assertCleanGitTree(): Promise<string> {
  const dirty = await commandOutput("/usr/bin/git", [
    "status",
    "--porcelain=v1",
    "--untracked-files=all",
  ]);
  if (dirty !== "") {
    throw new Error(
      "real provider smoke requires a clean, committed worktree",
    );
  }
  const commit = await commandOutput("/usr/bin/git", [
    "rev-parse",
    "HEAD",
  ]);
  if (!/^[a-f0-9]{40}$/u.test(commit)) {
    throw new Error("git did not return an exact source commit");
  }
  return commit;
}

function pathWithin(
  root: string,
  candidate: string,
): boolean {
  const relative = path.relative(root, candidate);
  return (
    relative !== "" &&
    relative !== ".." &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)
  );
}

async function assertSourceStillPinned(input: {
  readonly repositoryRoot: string;
  readonly sourceCommit: string;
  readonly outputDirectory: string;
}): Promise<void> {
  const observedCommit = await commandOutput("/usr/bin/git", [
    "rev-parse",
    "HEAD",
  ]);
  if (observedCommit !== input.sourceCommit) {
    throw new Error(
      "source commit changed after the smoke was frozen",
    );
  }
  const status = await commandOutput("/usr/bin/git", [
    "status",
    "--porcelain=v1",
    "--untracked-files=all",
  ]);
  const outputInsideRepository = pathWithin(
    input.repositoryRoot,
    input.outputDirectory,
  );
  const allowedPrefix = outputInsideRepository
    ? `${path
        .relative(
          input.repositoryRoot,
          input.outputDirectory,
        )
        .split(path.sep)
        .join("/")}/`
    : null;
  for (const line of status.split("\n").filter(Boolean)) {
    if (
      allowedPrefix !== null &&
      line.startsWith(`?? ${allowedPrefix}`)
    ) {
      continue;
    }
    throw new Error(
      "source tree changed after the smoke was frozen",
    );
  }
}

async function environmentHash(
  sourceCommit: string,
): Promise<string> {
  const packageLock = await readFile(
    path.resolve("package-lock.json"),
  );
  const [rootlesskit, bubblewrap] = await Promise.all([
    commandOutput("/usr/bin/rootlesskit", ["--version"]),
    commandOutput("/usr/bin/bwrap", ["--version"]),
  ]);
  return sha256({
    hashDomain: "RealProviderSmokeEnvironment.v1",
    sourceCommit,
    node: process.version,
    platform: process.platform,
    architecture: process.arch,
    rootlesskit,
    bubblewrap,
    packageLockHash:
      `sha256:${sha256Bytes(packageLock)}`,
  });
}

function publicPrincipalArray(
  principals: readonly PrincipalSigner[],
): readonly PublicPrincipal[] {
  return principals.map((principal) =>
    principal.exportPublic(),
  );
}

async function writeCanonical(
  file: string,
  value: JsonValue,
): Promise<void> {
  await writeFile(file, canonicalBytes(value), {
    mode: 0o600,
  });
}

async function prepareRoot(input: {
  readonly root: string;
  readonly apiKey: string;
  readonly protocolAuthor: PrincipalSigner;
  readonly runtime: PrincipalSigner;
  readonly provider: PrincipalSigner;
  readonly artifacts: ReturnType<
    typeof createRealProviderSmokeArtifacts
  >;
}): Promise<void> {
  for (const directory of [
    "ipc",
    "public",
    "vault/runtime",
    "vault/provider",
    "state/runtime",
    "state/provider",
  ]) {
    await mkdir(path.join(input.root, directory), {
      recursive: true,
      mode: 0o700,
    });
  }
  await writeFile(
    path.join(input.root, "vault", "runtime", "private.pem"),
    input.runtime.exportPrivatePem(),
    { mode: 0o600 },
  );
  await writeFile(
    path.join(input.root, "vault", "provider", "private.pem"),
    input.provider.exportPrivatePem(),
    { mode: 0o600 },
  );
  await writeFile(
    path.join(
      input.root,
      "vault",
      "provider",
      "provider-secret",
    ),
    `${input.apiKey}\n`,
    { mode: 0o600 },
  );
  const publicPrincipals = publicPrincipalArray([
    input.protocolAuthor,
    input.runtime,
    input.provider,
  ]);
  const [protocolAuthor, runtime, proxy] =
    publicPrincipals;
  await writeCanonical(
    path.join(
      input.root,
      "public",
      "provider-service.json",
    ),
    {
      schemaVersion: 1,
      protocolId: input.artifacts.protocolId,
      phaseAccountId: input.artifacts.phaseAccountId,
      stateRoot: "/state",
      schemaDirectory: "/opt/seh/schemas",
      budgetFreeze:
        input.artifacts.budgetFreeze as unknown as JsonValue,
      smokeManifest:
        input.artifacts.smokeManifest as unknown as JsonValue,
      protocolAuthor:
        protocolAuthor as unknown as JsonValue,
      runtime: runtime as unknown as JsonValue,
      proxy: proxy as unknown as JsonValue,
      proxyPrivateKeyPath: "/run/keys/private.pem",
      credentialPath: "/run/keys/provider-secret",
      credentialSlotId:
        input.artifacts.smokeManifest.credentialSlotId,
      upstream: {
        mode: "openai_connect",
        egressSocketPath: "/run/ipc/egress.sock",
      },
    },
  );
  await writeCanonical(
    path.join(
      input.root,
      "public",
      "provider-runtime.json",
    ),
    {
      protocolId: input.artifacts.protocolId,
      phaseAccountId: input.artifacts.phaseAccountId,
      schemaDirectory: "/opt/seh/schemas",
      socketPath: "/run/ipc/provider.sock",
      relayScriptPath:
        "/opt/seh/evaluator/unix_peer_relay.py",
      expectedProviderUid: 1106,
      expectedProviderGid: 1106,
      runtime: runtime as unknown as JsonValue,
      runtimePrivateKeyPath: "/vault/runtime/private.pem",
      proxy: proxy as unknown as JsonValue,
      protocolAuthor:
        protocolAuthor as unknown as JsonValue,
      budgetFreeze:
        input.artifacts.budgetFreeze as unknown as JsonValue,
      smokeManifest:
        input.artifacts.smokeManifest as unknown as JsonValue,
      request: input.artifacts.request as unknown as JsonValue,
      forbiddenCredentialPath:
        "/vault/provider/provider-secret",
      outputPath: "/state/result.json",
    },
  );
}

async function runGate(input: {
  readonly root: string;
  readonly timeoutMillis: number;
  readonly apiKey: string;
}): Promise<GateEvidence> {
  const child = spawn(
    "/usr/bin/rootlesskit",
    [
      "--subid-source=static",
      "--net=host",
      "--pidns",
      "--reaper=true",
      "/usr/bin/python3",
      path.resolve("evaluator/provider_real_smoke_gate.py"),
      "--root",
      input.root,
      "--repository",
      path.resolve("."),
      "--node-executable",
      process.execPath,
    ],
    {
      cwd: path.resolve("."),
      env: {
        PATH: "/usr/bin:/bin",
        LANG: "C.UTF-8",
        LC_ALL: "C.UTF-8",
        TZ: "UTC",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  let outputBytes = 0;
  const collect = (target: Buffer[], chunk: Buffer): void => {
    outputBytes += chunk.byteLength;
    if (outputBytes > MAX_PROCESS_OUTPUT_BYTES) {
      child.kill("SIGKILL");
      return;
    }
    target.push(Buffer.from(chunk));
  };
  child.stdout.on("data", (chunk: Buffer) =>
    collect(stdout, chunk),
  );
  child.stderr.on("data", (chunk: Buffer) =>
    collect(stderr, chunk),
  );
  const exitCode = await new Promise<number | null>(
    (resolve, reject) => {
      const timeout = setTimeout(() => {
        child.kill("SIGKILL");
        reject(
          new Error("real-provider OS gate exceeded its cap"),
        );
      }, input.timeoutMillis + 30_000);
      child.once("close", (code) => {
        clearTimeout(timeout);
        resolve(code);
      });
    },
  );
  const stdoutText = Buffer.concat(stdout).toString("utf8");
  const stderrText = Buffer.concat(stderr).toString("utf8");
  if (
    stdoutText.includes(input.apiKey) ||
    stderrText.includes(input.apiKey)
  ) {
    throw new Error(
      "provider credential appeared in subprocess output",
    );
  }
  if (outputBytes > MAX_PROCESS_OUTPUT_BYTES) {
    throw new Error("real-provider OS gate output exceeded cap");
  }
  if (exitCode !== 0) {
    throw new Error(
      `real-provider OS gate failed; stderrHash=${sha256(stderrText)}`,
    );
  }
  const lastLine = stdoutText
    .trim()
    .split("\n")
    .at(-1);
  if (lastLine === undefined) {
    throw new Error("real-provider OS gate emitted no evidence");
  }
  return asGateEvidence(parseStrictJson(lastLine));
}

function outputText(result: ProviderProxyResult): string | null {
  if (result.response === null) return null;
  if (result.response.output.length !== 1) return null;
  const item = result.response.output[0];
  return item?.kind === "assistant_message"
    ? item.text
    : null;
}

function assertGateEvidence(input: {
  readonly gate: GateEvidence;
  readonly plan: RealProviderSmokePlan;
}): void {
  const gate = input.gate;
  const hostUids = Object.values(gate.hostRoleUids);
  if (
    gate.isolationClass !==
      "os_enforced_provider_proxy_with_credential_blind_egress" ||
    gate.roleUids.runtime !== 1102 ||
    gate.roleUids.provider !== 1106 ||
    gate.roleUids.egress !== 1107 ||
    new Set(hostUids).size !== 3 ||
    hostUids.includes(process.getuid!()) ||
    gate.providerPrivateOwner !== 1106 ||
    gate.providerCredentialOwner !== 1106 ||
    gate.runtimePrivateOwner !== 1102 ||
    gate.integration.runtimeUid !== 1102 ||
    gate.integration.providerPeer.uid !== 1106 ||
    gate.integration.providerPeer.gid !== 1106 ||
    gate.integration.forbiddenCredentialReadDenied !== true ||
    gate.roleProbes.runtime.networkDenied.length === 0 ||
    gate.roleProbes.provider.networkDenied.length === 0 ||
    gate.egressBroker.credentialMount !== false ||
    gate.egressBroker.tlsTermination !== false ||
    gate.egressBroker.allowedHost !==
      input.plan.egress.allowedHost ||
    gate.egressBroker.allowedPort !==
      input.plan.egress.allowedPort ||
    gate.egressBroker.implementationHash !==
      input.plan.egress.brokerImplementationHash ||
    gate.egressBroker.policyHash !==
      input.plan.egress.policyHash ||
    gate.egressBroker.stdoutBytes !== 0
  ) {
    throw new Error(
      "real-provider OS gate evidence violates the frozen isolation contract",
    );
  }
}

async function validateOnly(
  repositoryRoot: string,
  argumentsValue: Arguments,
  schemas: SchemaRegistry,
): Promise<void> {
  const verified = await loadAndVerifyRealProviderSmokePlan({
    repositoryRoot,
    planPath: argumentsValue.planPath,
    schemas,
  });
  process.stdout.write(
    `${JSON.stringify({
      status: "validated_no_call",
      planHash: verified.planHash,
      pricingSourceHash: verified.pricingSourceHash,
      brokerImplementationHash:
        verified.brokerImplementationHash,
      egressPolicyHash: verified.egressPolicyHash,
      datasetPermissions:
        verified.plan.datasetPermissions,
      noHarnessMutation:
        verified.plan.noHarnessMutation,
      credentialInspected: false,
      networkCallAttempted: false,
    })}\n`,
  );
}

async function run(
  repositoryRoot: string,
  argumentsValue: Arguments,
  schemas: SchemaRegistry,
): Promise<void> {
  const verified = await loadAndVerifyRealProviderSmokePlan({
    repositoryRoot,
    planPath: argumentsValue.planPath,
    schemas,
  });
  const credential =
    process.env[
      verified.plan.credentialEnvironmentVariable
    ];
  if (
    credential === undefined ||
    credential.length === 0 ||
    credential.length > 16 * 1024 ||
    credential.trim() !== credential ||
    credential.includes("\0")
  ) {
    throw new Error(
      "OPENAI_API_KEY is absent or has an invalid protected-file format",
    );
  }
  delete process.env[
    verified.plan.credentialEnvironmentVariable
  ];
  const sourceCommit = await assertCleanGitTree();
  const startedAt = new Date().toISOString();
  const environment = await environmentHash(sourceCommit);
  const permissionPolicyHash =
    realProviderPermissionPolicyHash(verified.plan);
  const protocolAuthor = PrincipalSigner.generate({
    principalId: "protocol.author.real-provider-smoke",
    role: "protocol_author",
    implementationDigest: implementationAtCommitHash({
      role: "protocol_author",
      sourceCommit,
    }),
    instanceId: `protocol.author.real-provider-smoke.${sourceCommit.slice(0, 12)}`,
  });
  const runtime = PrincipalSigner.generate({
    principalId: "runtime.real-provider-smoke",
    role: "runtime",
    implementationDigest: implementationAtCommitHash({
      role: "runtime",
      sourceCommit,
    }),
    instanceId: `runtime.real-provider-smoke.${sourceCommit.slice(0, 12)}`,
  });
  const proxyImplementationHash =
    implementationAtCommitHash({
      role: "model_provider_proxy",
      sourceCommit,
    });
  const provider = PrincipalSigner.generate({
    principalId: "provider.proxy.real-provider-smoke",
    role: "model_provider_proxy",
    implementationDigest: proxyImplementationHash,
    instanceId: `provider.proxy.real-provider-smoke.${sourceCommit.slice(0, 12)}`,
    modelIdentityHash: sha256(
      verified.plan.provider.modelIdentity,
    ),
  });
  const redactor = new SecretRedactor({
    openai_api_key: credential,
  });
  const artifacts = createRealProviderSmokeArtifacts({
    verifiedPlan: verified,
    pins: {
      sourceCommit,
      environmentHash: environment,
      permissionPolicyHash,
      proxyImplementationHash,
      createdAt: startedAt,
    },
    protocolAuthor,
    providerProxy: provider,
    redactionPolicyHash: redactor.scannerHash,
    schemas,
  });
  const principals = new PrincipalRegistry();
  for (const principal of [
    protocolAuthor,
    runtime,
    provider,
  ]) {
    principals.register(principal.exportPublic());
  }
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
  const outputDirectory = path.resolve(
    argumentsValue.outputDirectory,
  );
  const outputRelative = path
    .relative(repositoryRoot, outputDirectory)
    .split(path.sep)
    .join("/");
  const evidenceNamespace =
    "architect/evidence/gate3/real-provider-smoke";
  if (
    pathWithin(repositoryRoot, outputDirectory) &&
    outputRelative !== evidenceNamespace &&
    !outputRelative.startsWith(`${evidenceNamespace}/`)
  ) {
    throw new Error(
      "in-repository smoke output must stay under the Gate 3 evidence namespace",
    );
  }
  await mkdir(path.dirname(outputDirectory), {
    recursive: true,
    mode: 0o700,
  });
  if (
    (await realpath(path.dirname(outputDirectory))) !==
    path.resolve(path.dirname(outputDirectory))
  ) {
    throw new Error(
      "real-provider evidence parent must not resolve through a symlink",
    );
  }
  await mkdir(outputDirectory, {
    recursive: false,
    mode: 0o700,
  });
  const publicPrincipals = publicPrincipalArray([
    protocolAuthor,
    runtime,
    provider,
  ]);
  await writeCanonical(
    path.join(outputDirectory, "pre-call-bundle.json"),
    {
      schemaVersion: 1,
      status: "frozen_before_call",
      sourceCommit,
      planHash: verified.planHash,
      protocolId: artifacts.protocolId,
      phaseAccountId: artifacts.phaseAccountId,
      budgetFreeze:
        artifacts.budgetFreeze as unknown as JsonValue,
      smokeManifest:
        artifacts.smokeManifest as unknown as JsonValue,
      request: artifacts.request as unknown as JsonValue,
      publicPrincipals:
        publicPrincipals as unknown as JsonValue,
      createdAt: startedAt,
    },
  );
  await assertSourceStillPinned({
    repositoryRoot,
    sourceCommit,
    outputDirectory,
  });
  const root = await mkdtemp(
    path.join(os.tmpdir(), "seh-real-provider-smoke-"),
  );
  try {
    await prepareRoot({
      root,
      apiKey: credential,
      protocolAuthor,
      runtime,
      provider,
      artifacts,
    });
    await assertSourceStillPinned({
      repositoryRoot,
      sourceCommit,
      outputDirectory,
    });
    const gate = await runGate({
      root,
      timeoutMillis:
        verified.plan.caps.wallClockMillis,
      apiKey: credential,
    });
    await assertSourceStillPinned({
      repositoryRoot,
      sourceCommit,
      outputDirectory,
    });
    assertGateEvidence({
      gate,
      plan: verified.plan,
    });
    schemas.validate(
      PROVIDER_PROXY_RESULT_SCHEMA_ID,
      gate.integration.result as unknown as JsonValue,
    );
    verifyProviderCallReceipt({
      receipt: gate.integration.result.receipt,
      manifest: artifacts.smokeManifest,
      expectedPhaseAccountId: artifacts.phaseAccountId,
      schemas,
      principals,
    });
    const observedText = outputText(
      gate.integration.result,
    );
    const expectedOutputMatched =
      observedText === verified.plan.expectedOutput;
    const providerStatus =
      gate.integration.result.receipt.status;
    const status =
      providerStatus !== "completed"
        ? "provider_failed"
        : expectedOutputMatched
          ? "completed"
          : "output_mismatch";
    const completedAt = new Date().toISOString();
    const rawGateEvidenceHash = sha256(
      gate as unknown as JsonValue,
    );
    const evidence = {
      schemaVersion: 1,
      evidenceType: "real_provider_smoke",
      status,
      purpose: verified.plan.purpose,
      sourceCommit,
      planHash: verified.planHash,
      protocolId: artifacts.protocolId,
      budgetFreezeId:
        artifacts.budgetFreeze.budgetFreezeId,
      providerSmokeManifestId:
        artifacts.smokeManifest
          .providerSmokeManifestId,
      phaseAccountId: artifacts.phaseAccountId,
      modelIdentity:
        verified.plan.provider.modelIdentity,
      reproducibilityTier:
        verified.plan.reproducibilityTier,
      noBenchmarkData: true,
      noHarnessMutation: true,
      requestAttemptCount: 1,
      expectedOutput: verified.plan.expectedOutput,
      expectedOutputMatched,
      providerStatus,
      result:
        gate.integration.result as unknown as JsonValue,
      isolation: {
        isolationClass: gate.isolationClass,
        roleUids: gate.roleUids,
        hostRoleUids: gate.hostRoleUids,
        providerPrivateOwner:
          gate.providerPrivateOwner,
        providerCredentialOwner:
          gate.providerCredentialOwner,
        runtimePrivateOwner:
          gate.runtimePrivateOwner,
        runtimeCredentialReadDenied:
          gate.integration
            .forbiddenCredentialReadDenied,
        runtimeDirectNetworkDenied:
          gate.roleProbes.runtime.networkDenied.length >
          0,
        providerDirectNetworkDenied:
          gate.roleProbes.provider.networkDenied.length >
          0,
        providerPeer: gate.integration.providerPeer,
        egressCredentialMount:
          gate.egressBroker.credentialMount,
        egressTlsTermination:
          gate.egressBroker.tlsTermination,
        egressAllowedHost:
          gate.egressBroker.allowedHost,
        egressAllowedPort:
          gate.egressBroker.allowedPort,
        egressImplementationHash:
          gate.egressBroker.implementationHash,
        egressPolicyHash:
          gate.egressBroker.policyHash,
        rawGateEvidenceHash,
      },
      secretScanPassed: true,
      startedAt,
      completedAt,
    } as const;
    const serialized = canonicalBytes(evidence);
    if (serialized.includes(Buffer.from(credential, "utf8"))) {
      throw new Error(
        "provider credential appeared in public evidence",
      );
    }
    schemas.validate(
      EVIDENCE_SCHEMA,
      evidence as unknown as JsonValue,
    );
    await writeCanonical(
      path.join(
        outputDirectory,
        "real-provider-smoke-evidence.json",
      ),
      evidence as unknown as JsonValue,
    );
    await writeCanonical(
      path.join(
        outputDirectory,
        "raw-os-gate-evidence.json",
      ),
      gate as unknown as JsonValue,
    );
    await assertSourceStillPinned({
      repositoryRoot,
      sourceCommit,
      outputDirectory,
    });
    process.stdout.write(
      `${JSON.stringify({
        status,
        evidence: path.join(
          outputDirectory,
          "real-provider-smoke-evidence.json",
        ),
        providerCallReceiptId:
          gate.integration.result.receipt
            .providerCallReceiptId,
        totalChargedTokens:
          gate.integration.result.receipt.usage
            .totalChargedTokens,
        providerCostMicros:
          gate.integration.result.receipt.usage
            .providerCostMicros,
      })}\n`,
    );
    if (status !== "completed") {
      process.exitCode = 2;
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function main(): Promise<void> {
  const argumentsValue = argumentsFrom(process.argv.slice(2));
  const repositoryRoot = path.resolve(".");
  const schemas = await SchemaRegistry.load(
    path.join(repositoryRoot, "schemas"),
  );
  if (argumentsValue.mode === "validate") {
    await validateOnly(
      repositoryRoot,
      argumentsValue,
      schemas,
    );
    return;
  }
  const oldMask = process.umask(0o077);
  try {
    await run(repositoryRoot, argumentsValue, schemas);
  } finally {
    process.umask(oldMask);
  }
}

await main().catch((error: unknown) => {
  const safe =
    error instanceof Error
      ? error.message.slice(0, 1000)
      : "unknown failure";
  process.stderr.write(
    `real provider smoke failed: ${safe}\n`,
  );
  process.exitCode = 2;
});
