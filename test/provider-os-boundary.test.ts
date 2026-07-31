import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import {
  createPublicKey,
  verify,
} from "node:crypto";
import { existsSync } from "node:fs";
import {
  mkdir,
  mkdtemp,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  PHASE_IDS,
  PrincipalRegistry,
  SchemaRegistry,
  SecretRedactor,
  canonicalBytes,
  createBudgetFreezeManifest,
  createProviderSmokeManifest,
  modelRequestHash,
  sha256,
  verifyProviderCallReceipt,
  type JsonValue,
  type ModelRequest,
  type PhaseBudgetCaps,
} from "../src/index.js";
import { deterministicPrincipal } from "./helpers/deterministic-principal.js";

const digest = (character: string): string =>
  `sha256:${character.repeat(64)}`;
const protocolId = `protocol-sha256:${"e".repeat(64)}`;
const hasUidMapHelpers =
  existsSync("/usr/bin/newuidmap") &&
  existsSync("/usr/bin/newgidmap");
const requireOsBoundary =
  process.env["SEH_REQUIRE_OS_BOUNDARY"] === "1";
const roleUids = {
  runtime: 1102,
  provider: 1106,
} as const;

function caps(): PhaseBudgetCaps {
  return {
    providerModelRequestAttempts: 1,
    totalChargedTokens: 100,
    providerCostMicros: 100,
    toolAttempts: 0,
    feedbackEvents: 0,
    wallClockMillis: 10_000,
    processCount: 1,
    outputBytes: 100_000,
  };
}

function request(): ModelRequest {
  return {
    requestId: "provider-request.os-boundary.1",
    modelIdentity: "fake:model-os-boundary-v1",
    instructions:
      "Synthetic transport check. Return SYNTHETIC_OS_OK.",
    input: [
      {
        kind: "text",
        role: "user",
        content: "Synthetic non-benchmark OS-boundary input.",
      },
    ],
    tools: [],
    maxOutputTokens: 32,
    reasoningEffort: "none",
  };
}

test(
  "provider credential and signing authority live under a distinct subordinate UID",
  {
    skip:
      hasUidMapHelpers || requireOsBoundary
        ? false
        : "uidmap package is required for provider OS-boundary evidence",
  },
  async (t) => {
    assert.equal(
      hasUidMapHelpers,
      true,
      "SEH_REQUIRE_OS_BOUNDARY=1 forbids a skipped uidmap prerequisite",
    );
    const root = await mkdtemp(
      path.join(os.tmpdir(), "seh-provider-os-"),
    );
    t.after(async () => {
      await rm(root, { recursive: true, force: true });
    });
    for (const directory of [
      "ipc",
      "public",
      "vault/runtime",
      "vault/provider",
      "state/runtime",
      "state/provider",
    ]) {
      await mkdir(path.join(root, directory), {
        recursive: true,
        mode: 0o700,
      });
    }
    const schemas = await SchemaRegistry.load(
      path.resolve("schemas"),
    );
    const protocolAuthor = deterministicPrincipal({
      principalId: "protocol.author.provider-os",
      role: "protocol_author",
      implementationDigest: digest("1"),
      instanceId: "protocol.author.provider-os.instance",
      seedByte: 71,
    });
    const runtime = deterministicPrincipal({
      principalId: "runtime.provider-os",
      role: "runtime",
      implementationDigest: digest("2"),
      instanceId: "runtime.provider-os.instance",
      seedByte: 72,
    });
    const modelIdentityHash = sha256(
      "fake:model-os-boundary-v1",
    );
    const provider = deterministicPrincipal({
      principalId: "provider.proxy.os",
      role: "model_provider_proxy",
      implementationDigest: digest("3"),
      instanceId: "provider.proxy.os.instance",
      modelIdentityHash,
      seedByte: 73,
    });
    const principals = new PrincipalRegistry();
    for (const principal of [
      protocolAuthor,
      runtime,
      provider,
    ]) {
      principals.register(principal.exportPublic());
    }
    const permissionPolicyHash = digest("4");
    const budgetFreeze = createBudgetFreezeManifest({
      core: {
        protocolId,
        scope: "provider_smoke",
        datasetPermissions: ["deterministic"],
        modelIdentityHash,
        toolSetHash: digest("5"),
        environmentHash: digest("6"),
        permissionPolicyHash,
        methods: ["B0"],
        rolloutSeeds: [1729],
        solverSlots: [{ methodId: "B0", slots: 1 }],
        phaseCaps: PHASE_IDS.map((phaseId) => ({
          phaseId,
          caps: caps(),
        })),
        perRequestTokenCap: 100,
        perRequestCostCapMicros: 100,
        sourceConfigHash: digest("7"),
        supersedesBudgetFreezeId: null,
        createdAt: "2026-07-31T00:00:00.000Z",
      },
      signer: protocolAuthor,
      schemas,
    });
    const syntheticRequest = request();
    const secret = "sk-os-boundary-synthetic-secret";
    const redactor = new SecretRedactor({
      openai_api_key: secret,
    });
    const smokeManifest = createProviderSmokeManifest({
      core: {
        protocolId,
        budgetFreezeId: budgetFreeze.budgetFreezeId,
        purpose: "synthetic_non_benchmark_provider_smoke",
        syntheticTaskId: "synthetic.provider.os-boundary",
        modelRequestHash: modelRequestHash(syntheticRequest),
        provider: {
          providerId: "fake-provider",
          apiOrigin: "none",
          apiPath: "none",
          apiModel: "fake-model-os-boundary-v1",
          modelIdentity: syntheticRequest.modelIdentity,
          modelIdentityHash,
          serviceTier: null,
          reasoningEffort: "none",
          maxOutputTokens: 32,
          store: false,
          parallelToolCalls: false,
          toolCount: 0,
          reportedModelPolicy: "none",
          pricing: {
            currency: "USD",
            inputMicrosPerMillionTokens: 1_000_000,
            cachedInputMicrosPerMillionTokens: 1_000_000,
            cacheWriteMicrosPerMillionTokens: 2_000_000,
            outputMicrosPerMillionTokens: 3_000_000,
            reasoningIncludedInOutput: true,
            sourceHash: digest("8"),
            effectiveAt: "2026-07-31T00:00:00.000Z",
          },
        },
        credentialPrincipal: provider.identity,
        credentialSlotId: "provider.os.synthetic",
        egress: {
          transport: "none",
          allowedHost: "none",
          allowedPort: 0,
          tlsServerName: "none",
          maxTunnelBytes: 0,
          brokerImplementationHash: digest("9"),
          policyHash: digest("a"),
        },
        caps: {
          providerCallAttempts: 1,
          totalChargedTokens: 100,
          providerCostMicros: 100,
          wallClockMillis: 10_000,
          requestBytes: 10_000,
          responseBytes: 100_000,
        },
        permissionPolicyHash,
        redactionPolicyHash: redactor.scannerHash,
        proxyImplementationHash:
          provider.identity.implementationDigest,
        sourceConfigHash: digest("b"),
        createdAt: "2026-07-31T00:00:01.000Z",
      },
      budgetFreeze,
      signer: protocolAuthor,
      schemas,
    });
    await writeFile(
      path.join(root, "vault", "runtime", "private.pem"),
      runtime.exportPrivatePem(),
      { mode: 0o600 },
    );
    await writeFile(
      path.join(root, "vault", "provider", "private.pem"),
      provider.exportPrivatePem(),
      { mode: 0o600 },
    );
    await writeFile(
      path.join(
        root,
        "vault",
        "provider",
        "provider-secret",
      ),
      `${secret}\n`,
      { mode: 0o600 },
    );
    const phaseAccountId = "phase-account.provider-os.1";
    await writeFile(
      path.join(root, "public", "provider-service.json"),
      canonicalBytes({
        schemaVersion: 1,
        protocolId,
        phaseAccountId,
        stateRoot: "/state",
        schemaDirectory: "/opt/seh/schemas",
        budgetFreeze: budgetFreeze as unknown as JsonValue,
        smokeManifest:
          smokeManifest as unknown as JsonValue,
        protocolAuthor:
          protocolAuthor.exportPublic() as unknown as JsonValue,
        runtime: runtime.exportPublic() as unknown as JsonValue,
        proxy: provider.exportPublic() as unknown as JsonValue,
        proxyPrivateKeyPath: "/run/keys/private.pem",
        credentialPath: "/run/keys/provider-secret",
        credentialSlotId: smokeManifest.credentialSlotId,
        upstream: {
          mode: "fake",
          responseId: "response.provider-os.1",
          outputText: "SYNTHETIC_OS_OK",
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
    await writeFile(
      path.join(root, "public", "provider-runtime.json"),
      canonicalBytes({
        protocolId,
        phaseAccountId,
        schemaDirectory: "/opt/seh/schemas",
        socketPath: "/run/ipc/provider.sock",
        relayScriptPath:
          "/opt/seh/evaluator/unix_peer_relay.py",
        expectedProviderUid: roleUids.provider,
        expectedProviderGid: roleUids.provider,
        runtime: runtime.exportPublic() as unknown as JsonValue,
        runtimePrivateKeyPath:
          "/vault/runtime/private.pem",
        proxy: provider.exportPublic() as unknown as JsonValue,
        protocolAuthor:
          protocolAuthor.exportPublic() as unknown as JsonValue,
        budgetFreeze: budgetFreeze as unknown as JsonValue,
        smokeManifest:
          smokeManifest as unknown as JsonValue,
        request: syntheticRequest as unknown as JsonValue,
        forbiddenCredentialPath:
          "/vault/provider/provider-secret",
        outputPath: "/state/result.json",
      }),
      { mode: 0o600 },
    );
    const child = spawn(
      "/usr/bin/rootlesskit",
      [
        "--subid-source=static",
        "--net=none",
        "--pidns",
        "--reaper=true",
        "/usr/bin/python3",
        path.resolve("evaluator/provider_os_gate.py"),
        "--root",
        root,
        "--repository",
        path.resolve("."),
        "--node-executable",
        process.execPath,
      ],
      {
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
    child.stdout.on("data", (chunk: Buffer) =>
      stdout.push(Buffer.from(chunk)),
    );
    child.stderr.on("data", (chunk: Buffer) =>
      stderr.push(Buffer.from(chunk)),
    );
    const exitCode = await new Promise<number | null>(
      (resolve, reject) => {
        const timer = setTimeout(() => {
          child.kill("SIGKILL");
          reject(
            new Error(
              "provider OS-boundary track exceeded 90 seconds",
            ),
          );
        }, 90_000);
        child.once("close", (code) => {
          clearTimeout(timer);
          resolve(code);
        });
      },
    );
    const errorText = Buffer.concat(stderr).toString("utf8");
    assert.equal(exitCode, 0, errorText);
    const evidence = JSON.parse(
      Buffer.concat(stdout)
        .toString("utf8")
        .trim()
        .split("\n")
        .at(-1)!,
    ) as {
      isolationClass: string;
      roleUids: Record<string, number>;
      hostRoleUids: Record<string, number>;
      providerPrivateOwner: number;
      providerCredentialOwner: number;
      runtimePrivateOwner: number;
      roleProbes: Record<
        "runtime" | "provider",
        {
          uid: number;
          challenge: string;
          challengeSignature: string;
          effectiveCapabilities: string;
          noNewPrivileges: string;
          forbiddenReadsDenied: number;
          forbiddenWritesDenied: number;
          signalsDenied: number;
          ptraceDenied: number;
          networkDenied: string;
        }
      >;
      integration: {
        runtimeUid: number;
        providerPeer: { uid: number; gid: number };
        forbiddenCredentialReadDenied: boolean;
        result: {
          receipt: Parameters<
            typeof verifyProviderCallReceipt
          >[0]["receipt"];
          response: {
            output: {
              kind: string;
              text: string;
            }[];
          };
        };
      };
    };
    assert.equal(
      evidence.isolationClass,
      "os_enforced_provider_proxy",
    );
    assert.deepEqual(evidence.roleUids, roleUids);
    assert.equal(
      new Set(Object.values(evidence.hostRoleUids)).size,
      2,
    );
    assert.ok(
      Object.values(evidence.hostRoleUids).every(
        (uid) => uid !== process.getuid!(),
      ),
    );
    assert.equal(evidence.providerPrivateOwner, roleUids.provider);
    assert.equal(
      evidence.providerCredentialOwner,
      roleUids.provider,
    );
    assert.equal(evidence.runtimePrivateOwner, roleUids.runtime);
    assert.equal(evidence.integration.runtimeUid, roleUids.runtime);
    assert.equal(
      evidence.integration.providerPeer.uid,
      roleUids.provider,
    );
    assert.equal(
      evidence.integration.providerPeer.gid,
      roleUids.provider,
    );
    assert.equal(
      evidence.integration.forbiddenCredentialReadDenied,
      true,
    );
    assert.equal(
      evidence.integration.result.response.output[0]?.text,
      "SYNTHETIC_OS_OK [REDACTED:openai_api_key]",
    );
    assert.doesNotMatch(
      JSON.stringify(evidence),
      new RegExp(secret, "u"),
    );
    verifyProviderCallReceipt({
      receipt: evidence.integration.result.receipt,
      manifest: smokeManifest,
      expectedPhaseAccountId: phaseAccountId,
      schemas,
      principals,
    });
    for (const role of ["runtime", "provider"] as const) {
      const probe = evidence.roleProbes[role];
      assert.equal(probe.uid, roleUids[role]);
      assert.equal(probe.effectiveCapabilities, "0000000000000000");
      assert.equal(probe.noNewPrivileges, "1");
      assert.ok(probe.forbiddenReadsDenied >= 1);
      assert.ok(probe.forbiddenWritesDenied >= 1);
      assert.equal(probe.signalsDenied, 1);
      assert.equal(probe.ptraceDenied, 1);
      assert.ok(probe.networkDenied.length > 0);
      assert.equal(
        verify(
          null,
          Buffer.from(probe.challenge, "utf8"),
          createPublicKey(
            (role === "runtime"
              ? runtime
              : provider
            ).exportPublic().publicKeyPem,
          ),
          Buffer.from(
            probe.challengeSignature,
            "base64url",
          ),
        ),
        true,
      );
    }
    const evidenceOutput =
      process.env["SEH_PROVIDER_OS_EVIDENCE_OUTPUT"];
    if (evidenceOutput !== undefined) {
      const sourceCommit =
        process.env["SEH_PROVIDER_OS_SOURCE_COMMIT"];
      assert.match(
        sourceCommit ?? "",
        /^[a-f0-9]{40}$/u,
        "provider OS evidence requires its exact source commit",
      );
      const resolvedOutput = path.resolve(evidenceOutput);
      await mkdir(path.dirname(resolvedOutput), {
        recursive: true,
        mode: 0o700,
      });
      await writeFile(
        resolvedOutput,
        canonicalBytes({
          ...evidence,
          sourceCommit,
          protocolId,
          budgetFreezeId: budgetFreeze.budgetFreezeId,
          providerSmokeManifestId:
            smokeManifest.providerSmokeManifestId,
        } as unknown as JsonValue),
        { mode: 0o600 },
      );
      await writeFile(
        path.join(
          path.dirname(resolvedOutput),
          "provider-smoke-manifest.json",
        ),
        canonicalBytes(smokeManifest as unknown as JsonValue),
        { mode: 0o600 },
      );
      await writeFile(
        path.join(
          path.dirname(resolvedOutput),
          "provider-budget-freeze.json",
        ),
        canonicalBytes(budgetFreeze as unknown as JsonValue),
        { mode: 0o600 },
      );
      await writeFile(
        path.join(
          path.dirname(resolvedOutput),
          "provider-synthetic-request.json",
        ),
        canonicalBytes(
          syntheticRequest as unknown as JsonValue,
        ),
        { mode: 0o600 },
      );
    }
  },
);
