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
  SchemaRegistry,
  canonicalBytes,
  sha256,
  sha256Text,
  type JsonValue,
  type PrincipalRole,
  type PrincipalSigner,
} from "../src/index.js";
import { deterministicPrincipal } from "./helpers/deterministic-principal.js";

const roleUids = {
  protocol_author: 1301,
  benchmark_author: 1302,
  benchmark_reviewer: 1303,
  vault: 1304,
  evaluator: 1305,
  scorer: 1306,
  promoter: 1307,
  audit_store: 1308,
} as const;

type BoundaryRole = keyof typeof roleUids;

interface RoleProbe {
  readonly uid: number;
  readonly gid: number;
  readonly challenge: string;
  readonly challengeSignature: string;
  readonly effectiveCapabilities: string;
  readonly noNewPrivileges: string;
  readonly forbiddenReadsDenied: number;
  readonly forbiddenWritesDenied: number;
  readonly signalsDenied: number;
  readonly ptraceDenied: number;
  readonly networkDenied: string;
}

interface TransportEntry {
  readonly stage: string;
  readonly role: BoundaryRole;
  readonly transportAccepted: boolean;
  readonly peer: {
    readonly uid: number;
    readonly gid: number;
  };
  readonly verifiedServerPeer: {
    readonly uid: number;
    readonly gid: number;
  };
  readonly worker: {
    readonly ordinal: number;
    readonly returnCode: number;
  };
  readonly result: {
    readonly ok: boolean;
    readonly failure: {
      readonly code: string;
    } | null;
    readonly stateHead: string | null;
    readonly accessRecordHash: string | null;
    readonly transitionCount: number;
  } | null;
}

interface BoundaryEvidence {
  readonly schemaVersion: 1;
  readonly recordType:
    "body_free_evaluator_vault_os_boundary_evidence";
  readonly isolationClass:
    "os_enforced_subordinate_uids";
  readonly roleUids: Record<BoundaryRole, number>;
  readonly publicPrincipals: Record<
    BoundaryRole,
    {
      readonly identity: {
        readonly role: PrincipalRole;
      };
      readonly publicKeyPem: string;
    }
  >;
  readonly hostRoleUids: Record<BoundaryRole, number>;
  readonly keyOwners: Record<BoundaryRole, number>;
  readonly reviewerBoundary: {
    readonly inputFiles: readonly string[];
    readonly authorIdentityPresent: false;
    readonly rawTaskHandlePresent: false;
    readonly privateKeyPresent: false;
    readonly projectionHash: string;
  };
  readonly transport: {
    readonly serverUid: number;
    readonly socketOwnedByVault: true;
    readonly transactions: readonly TransportEntry[];
    readonly socketReplacementDenials: Record<
      Exclude<BoundaryRole, "vault">,
      {
        readonly unlinkDenied: string;
        readonly bindDenied: string;
      }
    >;
  };
  readonly vault: {
    readonly authoritativeJournal:
      "vault_state_cas_journal";
    readonly journalOwners: readonly number[];
    readonly journalFileCount: number;
    readonly stateHead: string;
    readonly unlockRaceSuccesses: number;
    readonly unlockRaceWorkerOrdinals: readonly number[];
    readonly freshDuplicateUnlockDenied: true;
    readonly exactRetryStable: true;
    readonly restartReconstructed: true;
    readonly crashRecovery: {
      readonly actualSigkillPhases: readonly string[];
      readonly crashWorkersUnacknowledged:
        readonly boolean[];
      readonly durableCommit: {
        readonly recoveredExactlyOnce: true;
        readonly transitionCount: number;
        readonly accessRecordHash: string;
      };
      readonly publishedHardlink: {
        readonly stagingObservedBeforeRecovery: true;
        readonly stagingRemovedAfterRecovery: true;
        readonly recoveredExactlyOnce: true;
        readonly transitionCount: number;
        readonly accessRecordHash: string;
      };
    };
  };
  readonly roleProbes: Record<BoundaryRole, RoleProbe>;
  readonly promoterProjection: {
    readonly recordHash: string;
    readonly scoreCommitment: string;
    readonly rawTaskHandlePresent: false;
    readonly vaultWriteCapabilityPresent: false;
  };
  readonly finalAudit: {
    readonly recordHash: string;
    readonly stateHead: string;
    readonly bodyPresent: false;
    readonly providerUsed: false;
    readonly researchEvidenceAuthorized: false;
    readonly promotionAuthorized: false;
  };
  readonly bodyAbsence: {
    readonly bodyPresent: false;
    readonly verifierLogicPresent: false;
    readonly labelsPresent: false;
    readonly pathsPresent: false;
    readonly bodyAccess:
      "none_in_body_free_contract_prototype";
  };
  readonly providerUsed: false;
  readonly researchEvidenceAuthorized: false;
  readonly promotionAuthorized: false;
  readonly evidenceHash: string;
}

const hasOsBoundaryPrerequisites =
  existsSync("/usr/bin/rootlesskit") &&
  existsSync("/usr/bin/bwrap") &&
  existsSync("/usr/bin/newuidmap") &&
  existsSync("/usr/bin/newgidmap");
const requireOsBoundary =
  process.env[
    "SEH_REQUIRE_EVALUATOR_VAULT_OS_BOUNDARY"
  ] === "1";
const pythonRoot =
  "/home/jinuk/.local/share/uv/python/cpython-3.13.14-linux-x86_64-gnu";

async function writeCanonical(
  file: string,
  value: JsonValue,
): Promise<void> {
  await writeFile(file, canonicalBytes(value), {
    mode: 0o600,
  });
}

function boundarySigner(
  role: BoundaryRole,
  seedByte: number,
): PrincipalSigner {
  return deterministicPrincipal({
    principalId: `${role}.body-free-os`,
    role: role as PrincipalRole,
    implementationDigest: sha256Text(
      `body-free-os.${role}.implementation`,
    ),
    instanceId: `${role}.body-free-os.instance`,
    seedByte,
  });
}

function transaction(
  evidence: BoundaryEvidence,
  stage: string,
): TransportEntry {
  const entry = evidence.transport.transactions.find(
    (candidate) => candidate.stage === stage,
  );
  assert.ok(entry, `missing transport stage ${stage}`);
  return entry;
}

function transactionResult(
  evidence: BoundaryEvidence,
  stage: string,
): NonNullable<TransportEntry["result"]> {
  const result = transaction(evidence, stage).result;
  assert.ok(result, `transport stage ${stage} has no result`);
  return result;
}

test(
  "eight OS principals execute a body-free evaluator-vault lifecycle",
  {
    skip:
      hasOsBoundaryPrerequisites || requireOsBoundary
        ? false
        : "rootlesskit, bubblewrap, and uidmap are required",
    timeout: 360_000,
  },
  async (t) => {
    assert.equal(
      hasOsBoundaryPrerequisites,
      true,
      "required evaluator-vault OS boundary cannot skip prerequisites",
    );
    assert.equal(
      existsSync(pythonRoot),
      true,
      "pinned Python 3.13 runtime is missing",
    );
    const root = await mkdtemp(
      path.join(os.tmpdir(), "seh-evaluator-vault-os-"),
    );
    t.after(async () => {
      await rm(root, { recursive: true, force: true });
    });
    for (const directory of [
      "public",
      "source",
      ...Object.keys(roleUids).map(
        (role) => `keys/${role}`,
      ),
    ]) {
      await mkdir(path.join(root, directory), {
        recursive: true,
        mode: 0o700,
      });
    }

    const signers = Object.fromEntries(
      Object.keys(roleUids).map((role, ordinal) => [
        role,
        boundarySigner(
          role as BoundaryRole,
          81 + ordinal,
        ),
      ]),
    ) as Record<BoundaryRole, PrincipalSigner>;
    for (const [role, signer] of Object.entries(
      signers,
    ) as [BoundaryRole, PrincipalSigner][]) {
      await writeFile(
        path.join(root, "keys", role, "private.pem"),
        signer.exportPrivatePem(),
        { mode: 0o600 },
      );
      await writeCanonical(
        path.join(root, "public", `${role}.json`),
        signer.exportPublic() as unknown as JsonValue,
      );
    }
    await writeCanonical(
      path.join(root, "public", "principals.json"),
      Object.fromEntries(
        Object.entries(signers).map(
          ([role, signer]) => [
            role,
            signer.exportPublic(),
          ],
        ),
      ) as unknown as JsonValue,
    );
    const rogueEvaluator = deterministicPrincipal({
      principalId: "evaluator.body-free-os.rogue",
      role: "evaluator",
      implementationDigest: sha256Text(
        "body-free-os.rogue-evaluator.implementation",
      ),
      instanceId:
        "evaluator.body-free-os.rogue.instance",
      seedByte: 89,
    });
    await writeCanonical(
      path.join(root, "public", "rogue-evaluator.json"),
      rogueEvaluator.exportPublic() as unknown as JsonValue,
    );
    await writeFile(
      path.join(
        root,
        "source",
        "rogue-evaluator-private.pem",
      ),
      rogueEvaluator.exportPrivatePem(),
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
        path.resolve(
          "evaluator/evaluator_vault_os_gate.py",
        ),
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
              "evaluator-vault OS boundary exceeded 330 seconds",
            ),
          );
        }, 330_000);
        child.once("close", (code) => {
          clearTimeout(timer);
          resolve(code);
        });
      },
    );
    const errorText =
      Buffer.concat(stderr).toString("utf8");
    assert.equal(exitCode, 0, errorText);
    const lines = Buffer.concat(stdout)
      .toString("utf8")
      .trim()
      .split("\n");
    const evidence = JSON.parse(
      lines.at(-1)!,
    ) as BoundaryEvidence;
    const schemas = await SchemaRegistry.load(
      path.resolve("schemas"),
    );
    schemas.validate(
      "https://self-evolving-harness.local/schemas/body-free-evaluator-vault-os-boundary-evidence.schema.json",
      evidence as unknown as JsonValue,
    );

    assert.equal(
      evidence.isolationClass,
      "os_enforced_subordinate_uids",
    );
    assert.deepEqual(evidence.roleUids, roleUids);
    assert.deepEqual(evidence.keyOwners, roleUids);
    assert.equal(
      new Set(
        Object.values(evidence.hostRoleUids),
      ).size,
      8,
    );
    assert.ok(
      Object.values(evidence.hostRoleUids).every(
        (uid) => uid !== process.getuid!(),
      ),
    );

    assert.deepEqual(
      evidence.reviewerBoundary.inputFiles,
      [
        "config.json",
        "own-public.json",
        "review.json",
        "reviewer-projection.json",
      ],
    );
    assert.equal(
      evidence.reviewerBoundary.authorIdentityPresent,
      false,
    );
    assert.equal(
      evidence.reviewerBoundary.rawTaskHandlePresent,
      false,
    );
    assert.equal(
      evidence.reviewerBoundary.privateKeyPresent,
      false,
    );

    assert.equal(
      evidence.transport.transactions.length,
      20,
    );
    for (const entry of evidence.transport.transactions) {
      assert.equal(entry.transportAccepted, true);
      assert.equal(entry.peer.uid, roleUids[entry.role]);
      assert.equal(entry.peer.gid, roleUids[entry.role]);
      assert.equal(
        entry.verifiedServerPeer.uid,
        roleUids.vault,
      );
      assert.equal(
        entry.verifiedServerPeer.gid,
        roleUids.vault,
      );
    }
    const expectedFailures = {
      early_evaluate: "INVALID_STATE_TRANSITION",
      protocol_mismatch: "PROTOCOL_MISMATCH",
      capability_substitution: "HASH_MISMATCH",
      wrong_key: "AUTHENTICATION_FAILED",
      fresh_duplicate_unlock:
        "INVALID_STATE_TRANSITION",
      scorer_wrong_evaluate: "AUTHORIZATION_DENIED",
      author_wrong_audit: "AUTHORIZATION_DENIED",
      promoter_wrong_score: "AUTHORIZATION_DENIED",
    } as const;
    for (const [stage, code] of Object.entries(
      expectedFailures,
    )) {
      assert.equal(
        transactionResult(evidence, stage).failure?.code,
        code,
      );
    }
    assert.equal(
      transactionResult(evidence, "create").ok,
      true,
    );
    assert.equal(
      transactionResult(evidence, "seal").ok,
      true,
    );
    assert.equal(
      transactionResult(evidence, "evaluate").ok,
      true,
    );
    assert.equal(
      transactionResult(evidence, "score").ok,
      true,
    );
    assert.equal(
      transactionResult(evidence, "audit").ok,
      true,
    );
    assert.equal(
      transactionResult(evidence, "evaluate")
        .accessRecordHash,
      transactionResult(
        evidence,
        "evaluate_exact_retry",
      ).accessRecordHash,
    );
    assert.notEqual(
      transactionResult(evidence, "evaluate").stateHead,
      transactionResult(
        evidence,
        "evaluate_exact_retry",
      ).stateHead,
      "retry must expose the newer authoritative fence head",
    );

    assert.equal(evidence.vault.unlockRaceSuccesses, 1);
    assert.equal(
      new Set(
        evidence.vault.unlockRaceWorkerOrdinals,
      ).size,
      2,
    );
    assert.deepEqual(
      evidence.vault.journalOwners,
      [roleUids.vault],
    );
    assert.ok(evidence.vault.journalFileCount >= 2);
    assert.match(
      evidence.vault.stateHead,
      /^sha256:[a-f0-9]{64}$/u,
    );
    assert.equal(
      evidence.finalAudit.stateHead,
      evidence.vault.stateHead,
    );
    for (const stage of [
      "crash_after_durable_commit",
      "crash_during_hardlink_append",
    ]) {
      const crashed = transaction(evidence, stage);
      assert.equal(crashed.result, null);
      assert.notEqual(crashed.worker.returnCode, 0);
    }
    assert.deepEqual(
      evidence.vault.crashRecovery.actualSigkillPhases,
      [
        "after_durable_commit_before_release",
        "during_state_append",
      ],
    );
    assert.deepEqual(
      evidence.vault.crashRecovery
        .crashWorkersUnacknowledged,
      [true, true],
    );
    assert.equal(
      evidence.vault.crashRecovery.durableCommit
        .recoveredExactlyOnce,
      true,
    );
    assert.equal(
      evidence.vault.crashRecovery.publishedHardlink
        .stagingObservedBeforeRecovery,
      true,
    );
    assert.equal(
      evidence.vault.crashRecovery.publishedHardlink
        .stagingRemovedAfterRecovery,
      true,
    );
    assert.equal(
      evidence.vault.crashRecovery.publishedHardlink
        .recoveredExactlyOnce,
      true,
    );

    for (const [role, uid] of Object.entries(
      roleUids,
    ) as [BoundaryRole, number][]) {
      const probe = evidence.roleProbes[role];
      assert.equal(probe.uid, uid);
      assert.equal(probe.gid, uid);
      assert.equal(
        probe.effectiveCapabilities,
        "0000000000000000",
      );
      assert.equal(probe.noNewPrivileges, "1");
      assert.notEqual(probe.networkDenied, "");
      const expectedForbidden =
        7 +
        (role === "benchmark_author" ? 0 : 1) +
        (role === "vault" ? 0 : 1) +
        (role === "vault" ? 0 : 1);
      assert.equal(
        probe.forbiddenReadsDenied,
        expectedForbidden,
      );
      assert.equal(
        probe.forbiddenWritesDenied,
        expectedForbidden,
      );
      assert.equal(
        probe.signalsDenied,
        role === "vault" ? 0 : 1,
      );
      assert.equal(
        probe.ptraceDenied,
        probe.signalsDenied,
      );
      assert.equal(
        verify(
          null,
          Buffer.from(probe.challenge, "utf8"),
          createPublicKey(
            signers[role].exportPublic().publicKeyPem,
          ),
          Buffer.from(
            probe.challengeSignature,
            "base64url",
          ),
        ),
        true,
      );
    }
    assert.equal(
      Object.keys(
        evidence.transport.socketReplacementDenials,
      ).length,
      7,
    );
    for (const denial of Object.values(
      evidence.transport.socketReplacementDenials,
    )) {
      assert.notEqual(
        denial.unlinkDenied,
        "unexpected_success",
      );
      assert.notEqual(
        denial.bindDenied,
        "unexpected_success",
      );
    }

    assert.equal(
      evidence.promoterProjection.rawTaskHandlePresent,
      false,
    );
    assert.equal(
      evidence.promoterProjection
        .vaultWriteCapabilityPresent,
      false,
    );
    assert.deepEqual(evidence.bodyAbsence, {
      bodyPresent: false,
      verifierLogicPresent: false,
      labelsPresent: false,
      pathsPresent: false,
      bodyAccess:
        "none_in_body_free_contract_prototype",
    });
    assert.equal(evidence.providerUsed, false);
    assert.equal(
      evidence.researchEvidenceAuthorized,
      false,
    );
    assert.equal(evidence.promotionAuthorized, false);
    assert.equal(
      JSON.stringify(evidence).includes(
        `opaque-task-sha256:${"8".repeat(64)}`,
      ),
      false,
    );

    const {
      evidenceHash,
      ...evidenceCore
    } = evidence;
    assert.equal(
      evidenceHash,
      sha256(evidenceCore as unknown as JsonValue),
    );

    const evidenceOutput =
      process.env[
        "SEH_EVALUATOR_VAULT_OS_EVIDENCE_OUTPUT"
      ];
    if (evidenceOutput !== undefined) {
      const resolved = path.resolve(evidenceOutput);
      await mkdir(path.dirname(resolved), {
        recursive: true,
        mode: 0o700,
      });
      await writeCanonical(
        resolved,
        evidence as unknown as JsonValue,
      );
    }
  },
);
