import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createPublicKey, verify } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  ArtifactStore,
  canonicalBytes,
  createCandidateHarnessBundle,
  GitWorktreeManager,
  HarnessComponentRegistry,
  PrincipalSigner,
  SchemaRegistry,
  type JsonValue,
} from "../src/index.js";

const protocolId = `protocol-sha256:${"d".repeat(64)}`;
const digest = (character: string): string => `sha256:${character.repeat(64)}`;
const pythonRoot =
  "/home/jinuk/.local/share/uv/python/cpython-3.13.14-linux-x86_64-gnu";
const hasUidMapHelpers =
  existsSync("/usr/bin/newuidmap") && existsSync("/usr/bin/newgidmap");
const requireOsBoundary = process.env["SEH_REQUIRE_OS_BOUNDARY"] === "1";

const roleUids = {
  operations: 1101,
  runtime: 1102,
  evaluator: 1103,
  promoter: 1104,
  audit: 1105,
} as const;

async function writeCanonical(file: string, value: JsonValue): Promise<void> {
  await writeFile(file, canonicalBytes(value), { mode: 0o600 });
}

async function restoreFixtureOwnership(root: string): Promise<void> {
  const script = [
    "import os,stat,sys",
    "root=sys.argv[1]",
    "for current,dirs,files in os.walk(root,topdown=False):",
    " for name in files:",
    "  path=os.path.join(current,name)",
    "  try: os.chown(path,0,0,follow_symlinks=False)",
    "  except FileNotFoundError: pass",
    " for name in dirs:",
    "  path=os.path.join(current,name)",
    "  try:",
    "   os.chown(path,0,0,follow_symlinks=False)",
    "   os.chmod(path,stat.S_IMODE(os.lstat(path).st_mode)|0o700)",
    "  except FileNotFoundError: pass",
    "os.chown(root,0,0,follow_symlinks=False)",
    "os.chmod(root,stat.S_IMODE(os.lstat(root).st_mode)|0o700)",
  ].join("\n");
  const child = spawn(
    "/usr/bin/rootlesskit",
    [
      "--subid-source=static",
      "/usr/bin/python3",
      "-c",
      script,
      root,
    ],
    {
      env: {
        PATH: "/usr/bin:/bin",
        LANG: "C.UTF-8",
        LC_ALL: "C.UTF-8",
        TZ: "UTC",
      },
      stdio: ["ignore", "ignore", "pipe"],
    },
  );
  const stderr: Buffer[] = [];
  child.stderr.on("data", (chunk: Buffer) => stderr.push(Buffer.from(chunk)));
  const exitCode = await new Promise<number | null>((resolve) =>
    child.once("close", resolve),
  );
  assert.equal(
    exitCode,
    0,
    `fixture ownership recovery failed: ${Buffer.concat(stderr).toString("utf8")}`,
  );
}

test(
  "subordinate UIDs enforce role keys, authenticated sockets, namespaces and denials",
  {
    skip:
      hasUidMapHelpers || requireOsBoundary
        ? false
        : "uidmap package is required for the OS-boundary evidence track",
  },
  async (t) => {
    assert.equal(
      hasUidMapHelpers,
      true,
      "SEH_REQUIRE_OS_BOUNDARY=1 forbids a skipped uidmap prerequisite",
    );
    const root = await mkdtemp(path.join(os.tmpdir(), "seh-os-principals-"));
    const schemas = await SchemaRegistry.load(path.resolve("schemas"));
    const components = new HarnessComponentRegistry({
      root: path.join(root, "candidate-registry"),
      schemas,
      artifacts: new ArtifactStore(
        path.join(root, "candidate-registry-artifacts"),
      ),
      requiredSlotIds: ["permission", "system_prompt"],
    });
    await components.initialize(
      path.resolve("configs/component-type-registry.json"),
    );
    const permission = await components.createComponent({
      componentId: "component.permission-policy",
      semanticVersion: "1.0.0",
      typeEntryId: "type.permission-policy",
      payloadLanguage: "seh.policy-json.v1",
      payload: {
        schemaVersion: 1,
        language: "seh.policy-json.v1",
        policyType: "PermissionPolicy",
        policy: { fixed: true },
      },
      capabilityIds: ["permission.authorize"],
    });
    const parentPrompt = await components.createComponent({
      componentId: "component.system-prompt",
      semanticVersion: "1.0.0",
      typeEntryId: "type.system-prompt",
      payloadLanguage: "seh.prompt-markdown.v1",
      payload: {
        schemaVersion: 1,
        language: "seh.prompt-markdown.v1",
        sections: [
          {
            sectionId: "identity",
            purpose: "identity",
            content: "Answer deterministically.",
          },
        ],
        contextBindings: ["task_input"],
      },
      capabilityIds: ["prompt.instruct.primary"],
    });
    const candidatePrompt = await components.createComponent({
      componentId: "component.system-prompt",
      semanticVersion: "1.0.1",
      typeEntryId: "type.system-prompt",
      payloadLanguage: "seh.prompt-markdown.v1",
      payload: {
        schemaVersion: 1,
        language: "seh.prompt-markdown.v1",
        sections: [
          {
            sectionId: "identity",
            purpose: "identity",
            content: "Answer deterministically and verify the result.",
          },
        ],
        contextBindings: ["task_input"],
      },
      capabilityIds: ["prompt.instruct.primary"],
    });
    const parentHarness = await components.createHarness({
      semanticVersion: "1.0.0",
      requiredRuntimeContractHash: digest("c"),
      bindings: [
        {
          slotId: "permission",
          componentManifestId: permission.componentManifestId,
        },
        {
          slotId: "system_prompt",
          componentManifestId: parentPrompt.componentManifestId,
        },
      ],
    });
    const candidateHarness = await components.createHarness({
      semanticVersion: "1.0.1",
      requiredRuntimeContractHash: digest("c"),
      bindings: [
        {
          slotId: "permission",
          componentManifestId: permission.componentManifestId,
        },
        {
          slotId: "system_prompt",
          componentManifestId: candidatePrompt.componentManifestId,
        },
      ],
    });
    const worktrees = new GitWorktreeManager(
      path.resolve("."),
      path.join(root, "worktrees"),
    );
    const candidate = await worktrees.create("gate2r-os-candidate");
    const candidateBundle = await createCandidateHarnessBundle({
      protocolId,
      parentHarnessVersionId: parentHarness.harnessVersionId,
      candidate: candidateHarness,
      sourceBaseCommit: candidate.baseCommit,
      registry: components,
      schemas,
    });
    const candidateCommit = await worktrees.commitCandidateBundle(
      candidate,
      candidateBundle.bundleId,
      canonicalBytes(candidateBundle as unknown as JsonValue),
    );
    const frozen = await worktrees.freeze(candidate);
    const snapshot = await worktrees.materializeSnapshot(
      frozen,
      path.join(root, "candidate-snapshot"),
    );
    const snapshotDescriptor = worktrees.snapshotDescriptor(frozen);
    schemas.validate(
      "https://self-evolving-harness.local/schemas/filesystem-snapshot.schema.json",
      snapshotDescriptor as unknown as JsonValue,
    );
    t.after(async () => {
      await restoreFixtureOwnership(root);
      await worktrees.disposeMaterializedSnapshot(snapshot).catch(() => undefined);
      await worktrees.dispose(candidate).catch(() => undefined);
      await rm(root, { recursive: true, force: true });
    });
    for (const directory of [
      "ipc",
      "public",
      ...Object.keys(roleUids).map((role) => `vault/${role}`),
      ...Object.keys(roleUids).map((role) => `state/${role}`),
    ]) {
      await mkdir(path.join(root, directory), { recursive: true, mode: 0o700 });
    }
    const signers = {
      operations: PrincipalSigner.generate({
        principalId: "operations.os-boundary",
        role: "operations_owner",
        implementationDigest: digest("1"),
        instanceId: "operations.os-boundary.instance",
      }),
      runtime: PrincipalSigner.generate({
        principalId: "runtime.os-boundary",
        role: "runtime",
        implementationDigest: digest("2"),
        instanceId: "runtime.os-boundary.instance",
      }),
      evaluator: PrincipalSigner.generate({
        principalId: "evaluator.os-boundary",
        role: "evaluator",
        implementationDigest: digest("3"),
        instanceId: "evaluator.os-boundary.instance",
      }),
      promoter: PrincipalSigner.generate({
        principalId: "promoter.os-boundary",
        role: "promoter",
        implementationDigest: digest("4"),
        instanceId: "promoter.os-boundary.instance",
      }),
      audit: PrincipalSigner.generate({
        principalId: "audit.os-boundary",
        role: "audit_store",
        implementationDigest: digest("5"),
        instanceId: "audit.os-boundary.instance",
      }),
    };
    for (const [role, signer] of Object.entries(signers)) {
      await writeFile(
        path.join(root, "vault", role, "private.pem"),
        signer.exportPrivatePem(),
        { mode: 0o600 },
      );
      await writeFile(
        path.join(root, "public", `${role}-public.pem`),
        signer.exportPublic().publicKeyPem,
        { mode: 0o600 },
      );
    }
    await writeFile(path.join(root, "public", "protocol-id"), protocolId, {
      mode: 0o600,
    });
    await writeCanonical(
      path.join(root, "public", "candidate-snapshot.json"),
      snapshotDescriptor as unknown as JsonValue,
    );
    await writeCanonical(
      path.join(root, "public", "audit.json"),
      {
        auditIdentity: signers.audit.identity as unknown as JsonValue,
        auditKeyId: signers.audit.keyId,
        operationsIdentity:
          signers.operations.identity as unknown as JsonValue,
        operationsKeyId: signers.operations.keyId,
        protocolId,
      },
    );
    await writeCanonical(
      path.join(root, "public", "evaluator.json"),
      {
        evaluatorIdentity:
          signers.evaluator.identity as unknown as JsonValue,
        evaluatorKeyId: signers.evaluator.keyId,
        operationsIdentity:
          signers.operations.identity as unknown as JsonValue,
        operationsKeyId: signers.operations.keyId,
        protocolId,
        candidateFilesystemSnapshotHash:
          snapshotDescriptor.filesystemSnapshotHash,
        candidateBundleId: candidateBundle.bundleId,
        candidateHarnessVersionId: candidateHarness.harnessVersionId,
      },
    );
    await writeCanonical(
      path.join(root, "public", "operations.json"),
      {
        protocolId,
        stateRoot: "/state",
        schemaDirectory: "/opt/seh/schemas",
        pythonExecutable: "/opt/python/bin/python3.13",
        relayScriptPath: "/opt/seh/evaluator/unix_peer_relay.py",
        auditSocketPath: "/run/ipc/audit.sock",
        evaluatorSocketPath: "/run/ipc/evaluator.sock",
        expectedAuditUid: roleUids.audit,
        expectedAuditGid: roleUids.audit,
        expectedEvaluatorUid: roleUids.evaluator,
        expectedEvaluatorGid: roleUids.evaluator,
        candidateFilesystemSnapshotHash:
          snapshotDescriptor.filesystemSnapshotHash,
        candidateBundleId: candidateBundle.bundleId,
        parentHarnessVersionId: parentHarness.harnessVersionId,
        candidateHarnessVersionId: candidateHarness.harnessVersionId,
        operations: {
          ...signers.operations.exportPublic(),
          privateKeyPath: "/run/keys/private.pem",
        } as unknown as JsonValue,
        audit: signers.audit.exportPublic() as unknown as JsonValue,
        evaluator: signers.evaluator.exportPublic() as unknown as JsonValue,
        outputPath: "/state/result.json",
      },
    );
    const child = spawn(
      "/usr/bin/rootlesskit",
      [
        "--subid-source=static",
        "--net=none",
        "--pidns",
        "--reaper=true",
        "/usr/bin/python3",
        path.resolve("evaluator/os_principal_gate.py"),
        "--root",
        root,
        "--repository",
        path.resolve("."),
        "--python-root",
        pythonRoot,
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
    child.stdout.on("data", (chunk: Buffer) => stdout.push(Buffer.from(chunk)));
    child.stderr.on("data", (chunk: Buffer) => stderr.push(Buffer.from(chunk)));
    const exitCode = await new Promise<number | null>((resolve, reject) => {
      const timer = setTimeout(() => {
        child.kill("SIGKILL");
        reject(new Error("OS-principal evidence track exceeded 120 seconds"));
      }, 120_000);
      child.once("close", (code) => {
        clearTimeout(timer);
        resolve(code);
      });
    });
    const errorText = Buffer.concat(stderr).toString("utf8");
    assert.equal(exitCode, 0, errorText);
    const outputLines = Buffer.concat(stdout)
      .toString("utf8")
      .trim()
      .split("\n");
    const evidence = JSON.parse(outputLines.at(-1)!) as {
      isolationClass: string;
      roleUids: Record<string, number>;
      hostRoleUids: Record<string, number>;
      roleProbes: Record<
        string,
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
        isolationClass: string;
        nodeVersion: string;
        operationsUid: number;
        auditPeer: { uid: number };
        evaluatorPeer: { uid: number };
        candidateFilesystemSnapshotHash: string;
        candidateBundleId: string;
        candidateHarnessVersionId: string;
        passToFailCount: number;
        failToPassCount: number;
      };
      adversarial: { mode: string; rejectedWithoutFinalResult: boolean }[];
      wrongUidRejected: boolean;
      wrongServerUidRejected: boolean;
      unauthorizedSocketConnectDenied: boolean;
      candidateFilesystemSnapshot: {
        filesystemSnapshotHash: string;
        headCommit: string;
        treeHash: string;
        entryCount: number;
      };
      auditPrivateOwner: number;
      evaluatorPrivateOwner: number;
    };
    assert.equal(evidence.isolationClass, "os_enforced_subordinate_uids");
    assert.deepEqual(evidence.roleUids, roleUids);
    assert.equal(new Set(Object.values(evidence.hostRoleUids)).size, 5);
    assert.ok(
      Object.values(evidence.hostRoleUids).every(
        (uid) => uid !== process.getuid!(),
      ),
    );
    assert.equal(evidence.integration.isolationClass, "os_enforced_external");
    assert.equal(evidence.integration.nodeVersion, "v24.18.1");
    assert.equal(evidence.integration.operationsUid, roleUids.operations);
    assert.equal(evidence.integration.auditPeer.uid, roleUids.audit);
    assert.equal(evidence.integration.evaluatorPeer.uid, roleUids.evaluator);
    assert.equal(
      evidence.integration.candidateFilesystemSnapshotHash,
      snapshotDescriptor.filesystemSnapshotHash,
    );
    assert.equal(
      evidence.integration.candidateBundleId,
      candidateBundle.bundleId,
    );
    assert.equal(
      evidence.integration.candidateHarnessVersionId,
      candidateHarness.harnessVersionId,
    );
    assert.equal(frozen.headCommit, candidateCommit.candidateCommit);
    assert.equal(evidence.integration.passToFailCount, 0);
    assert.equal(evidence.integration.failToPassCount, 1);
    assert.equal(evidence.auditPrivateOwner, roleUids.audit);
    assert.equal(evidence.evaluatorPrivateOwner, roleUids.evaluator);
    for (const [role, uid] of Object.entries(roleUids)) {
      const probe = evidence.roleProbes[role]!;
      assert.equal(probe.uid, uid);
      assert.equal(
        probe.challenge,
        `seh-os-principal:${role}:${protocolId}`,
      );
      assert.equal(
        verify(
          null,
          Buffer.from(probe.challenge, "utf8"),
          createPublicKey(
            signers[role as keyof typeof signers].exportPublic().publicKeyPem,
          ),
          Buffer.from(probe.challengeSignature, "base64url"),
        ),
        true,
      );
      assert.equal(probe.effectiveCapabilities, "0000000000000000");
      assert.equal(probe.noNewPrivileges, "1");
      assert.equal(probe.forbiddenReadsDenied, 4);
      assert.equal(probe.forbiddenWritesDenied, 4);
      assert.ok(probe.signalsDenied >= 1);
      assert.equal(probe.ptraceDenied, probe.signalsDenied);
      assert.notEqual(probe.networkDenied, "");
    }
    assert.equal(evidence.adversarial.length, 12);
    assert.ok(
      evidence.adversarial.every(
        (item) => item.rejectedWithoutFinalResult,
      ),
    );
    assert.equal(evidence.wrongUidRejected, true);
    assert.equal(evidence.wrongServerUidRejected, true);
    assert.equal(evidence.unauthorizedSocketConnectDenied, true);
    assert.deepEqual(evidence.candidateFilesystemSnapshot, {
      filesystemSnapshotHash: snapshotDescriptor.filesystemSnapshotHash,
      headCommit: snapshotDescriptor.headCommit,
      treeHash: snapshotDescriptor.treeHash,
      entryCount: snapshotDescriptor.entries.length,
    });
    const evidenceOutput = process.env["SEH_OS_EVIDENCE_OUTPUT"];
    if (evidenceOutput !== undefined) {
      const resolvedOutput = path.resolve(evidenceOutput);
      await mkdir(path.dirname(resolvedOutput), { recursive: true, mode: 0o700 });
      await writeFile(
        resolvedOutput,
        canonicalBytes(evidence as unknown as JsonValue),
        { mode: 0o600 },
      );
      await writeFile(
        path.join(
          path.dirname(resolvedOutput),
          "candidate-filesystem-snapshot.json",
        ),
        canonicalBytes(snapshotDescriptor as unknown as JsonValue),
        { mode: 0o600 },
      );
    }
  },
);
