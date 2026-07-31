import assert from "node:assert/strict";
import {
  spawn,
} from "node:child_process";
import {
  existsSync,
} from "node:fs";
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
import {
  deterministicPrincipal,
} from "./helpers/deterministic-principal.js";

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

const scenarios = [
  "normal",
  "evaluator_crash",
  "vault_crash",
  "timeout",
  "capability_rejection",
  "response_loss",
] as const;

type BoundaryRole = keyof typeof roleUids;
type ScenarioName = (typeof scenarios)[number];

interface EvidenceScenario {
  readonly scenario: ScenarioName;
  readonly descriptor: {
    readonly deliveryGuarantee:
      "at_most_once_abort_on_uncertain_delivery";
    readonly recordHash: string;
    readonly taskHandleCommitment: string;
    readonly authorCommitmentHash: string;
    readonly includedTransitionHash: string;
    readonly admittedVaultStateHead: string;
    readonly unlockCapabilityHash: string;
    readonly plaintextCommitment: string;
    readonly keyCommitment: string;
    readonly ciphertextCommitment: string;
  };
  readonly capability: {
    readonly capabilityHash: string;
    readonly authorCommitmentHash: string;
    readonly reusableDecryptionAuthority: false;
  };
  readonly request: {
    readonly requestHash: string;
  };
  readonly reserveResult: {
    readonly ok: boolean;
    readonly failure: {
      readonly code: string;
    } | null;
    readonly transition: {
      readonly recordHash: string;
    };
  };
  readonly materializeResult: {
    readonly ok: boolean;
  } | null;
  readonly consumer: {
    readonly returnCode: number | null;
    readonly timedOut: boolean;
    readonly responseLost: boolean;
    readonly receiptProduced: boolean;
  };
  readonly consumerReceipt: {
    readonly recordHash: string;
    readonly readOnlyMaterialization: true;
    readonly encryptionKeyPresent: false;
    readonly reusableDecryptionAuthorityPresent: false;
  } | null;
  readonly cleanupResult: {
    readonly state: "cleaned";
    readonly transition: {
      readonly cleanupReason: string;
      readonly keyDestroyed: true;
      readonly ciphertextDestroyed: true;
      readonly plaintextCleanupConfirmed: true;
    };
  };
  readonly leakageScan: {
    readonly repositoryPayloadMatches: 0;
    readonly repositoryKeyMatches: 0;
    readonly retainedStatePayloadMatches: 0;
    readonly retainedStateKeyMatches: 0;
    readonly logPayloadMatches: 0;
    readonly logKeyMatches: 0;
    readonly processArgumentPayloadMatches: 0;
    readonly processArgumentKeyMatches: 0;
    readonly keyFilePresentAfterCleanup: false;
    readonly ciphertextFilePresentAfterCleanup: false;
    readonly plaintextFilePresentAfterCleanup: false;
  };
  readonly transitions: readonly {
    readonly action: string;
    readonly decision: string;
  }[];
  readonly roleDenials: Record<
    Exclude<BoundaryRole, "vault">,
    {
      readonly forbiddenReadsDenied: number;
      readonly forbiddenWritesDenied: number;
    }
  > | null;
  readonly exactRetry: {
    readonly reservationStable: true;
    readonly secondMaterializationDenied: true;
    readonly failureCode: "REPLAY_DETECTED";
    readonly plaintextFilePresent: false;
  } | null;
  readonly freshCapabilityReuse: readonly {
    readonly condition: string;
    readonly correctlySignedFreshRequest: true;
    readonly failureCode: "REPLAY_DETECTED";
    readonly newlyCommitted: true;
    readonly denialTransitionHash: string;
    readonly denialReason:
      "consumed_capability_reuse";
    readonly statePreservingDenial: true;
    readonly transitionCountBefore: number;
    readonly transitionCountAfter: number;
    readonly exactRetryFailureCode:
      "REPLAY_DETECTED";
    readonly exactRetryNewlyCommitted: false;
    readonly exactRetryTransitionHash: string;
    readonly exactRetryTransitionCountBefore: number;
    readonly exactRetryTransitionCountAfter: number;
    readonly reservationCount: 1;
    readonly materializationCount: number;
    readonly secondReservationAppended: false;
    readonly secondMaterializationBegan: false;
  }[];
  readonly residuals: {
    readonly keyFilePresent: false;
    readonly ciphertextFilePresent: false;
    readonly plaintextFilePresent: false;
  };
}

interface CustodyEvidence {
  readonly isolationClass:
    "os_enforced_subordinate_uids";
  readonly ephemeralStorage: {
    readonly filesystemType: "tmpfs";
    readonly pathRetained: false;
    readonly plaintextNamesRetained: false;
  };
  readonly roleUids: Record<BoundaryRole, number>;
  readonly hostRoleUids: Record<
    BoundaryRole,
    number
  >;
  readonly keyOwners: Record<BoundaryRole, number>;
  readonly binding: {
    readonly taskHandleCommitment: string;
    readonly authorCommitmentHash: string;
    readonly includedTransitionHash: string;
    readonly admittedVaultStateHead: string;
    readonly unlockCapabilityHash: string;
  };
  readonly reviewerBoundary: {
    readonly inputFiles: readonly string[];
    readonly custodyDescriptorPresent: false;
    readonly ciphertextMetadataPresent: false;
    readonly authorIdentityPresent: false;
    readonly rawTaskHandlePresent: false;
    readonly privateKeyPresent: false;
  };
  readonly scenarios: readonly EvidenceScenario[];
  readonly crashCases: readonly {
    readonly boundary: string;
    readonly deliveryGuarantee:
      "at_most_once_abort_on_uncertain_delivery";
    readonly evaluatorPlaintextMounted: false;
    readonly evaluatorReceiptProduced: false;
    readonly beginCleanupCount: 1;
    readonly cleanupCount: 1;
    readonly denialCount: number;
    readonly reservationCountBeforeRecovery: number;
    readonly reservationCountAfterRecovery: number;
    readonly materializationCountBeforeRecovery: number;
    readonly materializationCountAfterRecovery: number;
    readonly duplicateMaterializationCount: 0;
    readonly leakageScan:
      EvidenceScenario["leakageScan"];
    readonly residuals:
      EvidenceScenario["residuals"];
  }[];
  readonly adversarialCases: readonly {
    readonly attackId: string;
    readonly correctlySignedRequest: true;
    readonly evaluatorPlaintextMounted: false;
    readonly evaluatorReceiptProduced: false;
    readonly denialCode: string;
    readonly cleanupReason: string;
    readonly leakageScan:
      EvidenceScenario["leakageScan"];
    readonly residuals:
      EvidenceScenario["residuals"];
  }[];
  readonly scorerProjection: {
    readonly projectionClass:
      "scorer_commitments_only";
    readonly ciphertextPresent: false;
    readonly keyPresent: false;
    readonly plaintextPresent: false;
  };
  readonly promoterProjection: {
    readonly projectionClass:
      "promoter_commitments_only";
    readonly ciphertextPresent: false;
    readonly keyPresent: false;
    readonly plaintextPresent: false;
  };
  readonly finalAudit: {
    readonly providerUsed: false;
    readonly researchEvidenceAuthorized: false;
    readonly promotionAuthorized: false;
  };
  readonly bodyAbsence: Record<string, false>;
  readonly providerUsed: false;
  readonly researchEvidenceAuthorized: false;
  readonly promotionAuthorized: false;
  readonly repositoryPushPerformed: false;
  readonly evidenceHash: string;
}

const prerequisites =
  existsSync("/usr/bin/rootlesskit") &&
  existsSync("/usr/bin/bwrap") &&
  existsSync("/usr/bin/newuidmap") &&
  existsSync("/usr/bin/newgidmap");
const requireBoundary =
  process.env[
    "SEH_REQUIRE_SYNTHETIC_CUSTODY_OS_BOUNDARY"
  ] === "1";
const pythonRoot =
  "/home/jinuk/.local/share/uv/python/cpython-3.13.14-linux-x86_64-gnu";

function boundarySigner(
  role: BoundaryRole,
  seedByte: number,
): PrincipalSigner {
  return deterministicPrincipal({
    principalId: `${role}.synthetic-custody-os`,
    role: role as PrincipalRole,
    implementationDigest: sha256Text(
      `synthetic-custody-os.${role}.implementation`,
    ),
    instanceId:
      `${role}.synthetic-custody-os.instance`,
    seedByte,
  });
}

async function writeCanonical(
  file: string,
  value: JsonValue,
): Promise<void> {
  await writeFile(file, canonicalBytes(value), {
    mode: 0o600,
  });
}

function scenario(
  evidence: CustodyEvidence,
  name: ScenarioName,
): EvidenceScenario {
  const found = evidence.scenarios.find(
    (entry) => entry.scenario === name,
  );
  assert.ok(found);
  return found;
}

test(
  "eight OS principals enforce encrypted one-time synthetic custody and cleanup",
  {
    skip:
      prerequisites || requireBoundary
        ? false
        : "rootlesskit, bubblewrap, and uidmap are required",
    timeout: 480_000,
  },
  async (t) => {
    assert.equal(
      prerequisites,
      true,
      "required synthetic custody OS boundary cannot skip prerequisites",
    );
    assert.equal(existsSync(pythonRoot), true);
    const root = await mkdtemp(
      path.join(
        os.tmpdir(),
        "seh-synthetic-custody-os-",
      ),
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
          151 + ordinal,
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

    const child = spawn(
      "/usr/bin/rootlesskit",
      [
        "--subid-source=static",
        "--net=none",
        "--pidns",
        "--reaper=true",
        "/usr/bin/python3",
        path.resolve(
          "evaluator/synthetic_custody_os_gate.py",
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
          PYTHONDONTWRITEBYTECODE: "1",
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
              "synthetic custody OS boundary exceeded 450 seconds",
            ),
          );
        }, 450_000);
        child.once("close", (code) => {
          clearTimeout(timer);
          resolve(code);
        });
      },
    );
    const errorText =
      Buffer.concat(stderr).toString("utf8");
    assert.equal(exitCode, 0, errorText);
    const evidence = JSON.parse(
      Buffer.concat(stdout)
        .toString("utf8")
        .trim()
        .split("\n")
        .at(-1)!,
    ) as CustodyEvidence;
    const schemas = await SchemaRegistry.load(
      path.resolve("schemas"),
    );
    schemas.validate(
      "https://self-evolving-harness.local/schemas/synthetic-custody-os-boundary-evidence.schema.json",
      evidence as unknown as JsonValue,
    );

    assert.deepEqual(evidence.roleUids, roleUids);
    assert.deepEqual(evidence.keyOwners, roleUids);
    assert.equal(
      new Set(
        Object.values(evidence.hostRoleUids),
      ).size,
      8,
    );
    assert.deepEqual(evidence.ephemeralStorage, {
      filesystemType: "tmpfs",
      pathRetained: false,
      plaintextNamesRetained: false,
    });
    assert.deepEqual(
      evidence.reviewerBoundary.inputFiles,
      [
        "config.json",
        "own-public.json",
        "review.json",
        "reviewer-projection.json",
      ],
    );
    assert.deepEqual(
      evidence.scenarios.map((entry) => entry.scenario),
      scenarios,
    );
    assert.equal(
      new Set(
        evidence.scenarios.map(
          (entry) =>
            entry.descriptor.plaintextCommitment,
        ),
      ).size,
      1,
      "all scenarios must use the same fixed inert payload",
    );
    assert.equal(
      new Set(
        evidence.scenarios.map(
          (entry) =>
            entry.descriptor.keyCommitment,
        ),
      ).size,
      scenarios.length,
    );
    assert.equal(
      new Set(
        evidence.scenarios.map(
          (entry) =>
            entry.descriptor.ciphertextCommitment,
        ),
      ).size,
      scenarios.length,
    );
    for (const entry of evidence.scenarios) {
      assert.equal(
        entry.descriptor.deliveryGuarantee,
        "at_most_once_abort_on_uncertain_delivery",
      );
      assert.equal(
        entry.descriptor.taskHandleCommitment,
        evidence.binding.taskHandleCommitment,
      );
      assert.equal(
        entry.descriptor.authorCommitmentHash,
        evidence.binding.authorCommitmentHash,
      );
      assert.equal(
        entry.descriptor.includedTransitionHash,
        evidence.binding.includedTransitionHash,
      );
      assert.equal(
        entry.descriptor.admittedVaultStateHead,
        evidence.binding.admittedVaultStateHead,
      );
      assert.equal(
        entry.descriptor.unlockCapabilityHash,
        evidence.binding.unlockCapabilityHash,
      );
      assert.equal(
        entry.capability.reusableDecryptionAuthority,
        false,
      );
      assert.equal(
        entry.capability.authorCommitmentHash,
        entry.descriptor.authorCommitmentHash,
      );
      assert.equal(entry.cleanupResult.state, "cleaned");
      assert.deepEqual(entry.residuals, {
        keyFilePresent: false,
        ciphertextFilePresent: false,
        plaintextFilePresent: false,
      });
      assert.deepEqual(
        Object.values(entry.leakageScan).filter(
          (value) => value === 0,
        ).length,
        8,
      );
      assert.equal(
        entry.leakageScan.keyFilePresentAfterCleanup,
        false,
      );
      assert.equal(
        entry.leakageScan
          .ciphertextFilePresentAfterCleanup,
        false,
      );
      assert.equal(
        entry.leakageScan
          .plaintextFilePresentAfterCleanup,
        false,
      );
      const starts = entry.transitions.filter(
        (transition) =>
          transition.action ===
          "begin_materialization",
      );
      assert.equal(
        starts.length,
        entry.scenario ===
          "capability_rejection"
          ? 0
          : 1,
      );
    }
    assert.deepEqual(
      evidence.crashCases.map(
        (entry) => entry.boundary,
      ),
      [
        "after_reservation_commit",
        "after_deny_release",
        "after_materialization_start",
        "after_deny_materialization",
        "after_plaintext_delete",
        "after_private_delete",
        "after_cleanup_commit",
      ],
    );
    for (const crash of evidence.crashCases) {
      assert.equal(crash.evaluatorPlaintextMounted, false);
      assert.equal(crash.evaluatorReceiptProduced, false);
      assert.equal(crash.beginCleanupCount, 1);
      assert.equal(crash.cleanupCount, 1);
      assert.equal(
        crash.reservationCountBeforeRecovery,
        crash.reservationCountAfterRecovery,
      );
      assert.equal(
        crash.materializationCountBeforeRecovery,
        crash.materializationCountAfterRecovery,
      );
      assert.equal(
        crash.duplicateMaterializationCount,
        0,
      );
      assert.deepEqual(crash.residuals, {
        keyFilePresent: false,
        ciphertextFilePresent: false,
        plaintextFilePresent: false,
      });
      assert.equal(
        Object.values(crash.leakageScan).filter(
          (value) => value === 0,
        ).length,
        8,
      );
    }
    assert.equal(evidence.adversarialCases.length, 21);
    assert.deepEqual(
      evidence.adversarialCases
        .filter((entry) =>
          entry.attackId.startsWith("envelope."),
        )
        .map((entry) => entry.attackId),
      [
        "envelope.ciphertext",
        "envelope.authentication_tag",
        "envelope.nonce",
        "envelope.aad_custody_id",
        "envelope.aad_protocol_id",
        "envelope.aad_contract_id",
        "envelope.aad_contract_hash",
        "envelope.aad_task_handle",
        "envelope.aad_author_commitment",
        "envelope.aad_included_transition",
        "envelope.aad_admitted_state",
        "envelope.aad_unlock_capability",
        "envelope.aad_plaintext_commitment",
        "envelope.aad_payload_length",
        "envelope.aad_delivery_guarantee",
        "envelope.envelope_swap",
      ],
    );
    for (const attack of evidence.adversarialCases) {
      assert.equal(attack.correctlySignedRequest, true);
      assert.equal(
        attack.evaluatorPlaintextMounted,
        false,
      );
      assert.equal(
        attack.evaluatorReceiptProduced,
        false,
      );
      assert.ok(
        [
          "AUTHENTICATION_FAILED",
          "AUTHORIZATION_DENIED",
          "HASH_MISMATCH",
          "SCHEMA_INVALID",
        ].includes(attack.denialCode),
      );
      assert.deepEqual(attack.residuals, {
        keyFilePresent: false,
        ciphertextFilePresent: false,
        plaintextFilePresent: false,
      });
    }
    assert.deepEqual(
      evidence.scenarios
        .flatMap(
          (entry) => entry.freshCapabilityReuse,
        )
        .map((entry) => entry.condition)
        .sort(),
      [
        "cleanup_completion",
        "normal_completion",
        "response_loss",
        "vault_restart",
      ],
    );
    for (const reuse of evidence.scenarios.flatMap(
      (entry) => entry.freshCapabilityReuse,
    )) {
      assert.equal(reuse.newlyCommitted, true);
      assert.equal(
        reuse.denialReason,
        "consumed_capability_reuse",
      );
      assert.equal(reuse.statePreservingDenial, true);
      assert.equal(
        reuse.transitionCountAfter,
        reuse.transitionCountBefore + 1,
      );
      assert.equal(
        reuse.exactRetryTransitionHash,
        reuse.denialTransitionHash,
      );
      assert.equal(
        reuse.exactRetryTransitionCountBefore,
        reuse.exactRetryTransitionCountAfter,
      );
    }

    const normal = scenario(evidence, "normal");
    assert.ok(normal.consumerReceipt);
    assert.equal(
      normal.consumerReceipt.readOnlyMaterialization,
      true,
    );
    assert.ok(normal.roleDenials);
    assert.equal(
      Object.keys(normal.roleDenials).length,
      7,
    );
    for (const denial of Object.values(
      normal.roleDenials,
    )) {
      assert.equal(denial.forbiddenReadsDenied, 4);
      assert.equal(denial.forbiddenWritesDenied, 4);
    }
    assert.deepEqual(normal.exactRetry, {
      reservationStable: true,
      reservationTransitionHash:
        normal.reserveResult.transition.recordHash,
      secondMaterializationDenied: true,
      failureCode: "REPLAY_DETECTED",
      plaintextFilePresent: false,
    });
    assert.notEqual(
      scenario(evidence, "evaluator_crash").consumer
        .returnCode,
      0,
    );
    assert.equal(
      scenario(evidence, "vault_crash")
        .materializeResult,
      null,
    );
    assert.equal(
      scenario(evidence, "vault_crash")
        .cleanupResult.transition.cleanupReason,
      "vault_crash_recovery",
    );
    assert.equal(
      scenario(evidence, "timeout").consumer.timedOut,
      true,
    );
    const rejected = scenario(
      evidence,
      "capability_rejection",
    );
    assert.equal(rejected.reserveResult.ok, false);
    assert.equal(
      rejected.reserveResult.failure?.code,
      "AUTHORIZATION_DENIED",
    );
    assert.equal(rejected.materializeResult, null);
    const lost = scenario(evidence, "response_loss");
    assert.equal(lost.consumer.responseLost, true);
    assert.equal(lost.consumer.receiptProduced, false);
    assert.equal(lost.consumerReceipt, null);

    assert.equal(
      evidence.scorerProjection.projectionClass,
      "scorer_commitments_only",
    );
    assert.equal(
      evidence.promoterProjection.projectionClass,
      "promoter_commitments_only",
    );
    for (const projection of [
      evidence.scorerProjection,
      evidence.promoterProjection,
    ]) {
      assert.equal(projection.ciphertextPresent, false);
      assert.equal(projection.keyPresent, false);
      assert.equal(projection.plaintextPresent, false);
    }
    assert.equal(evidence.providerUsed, false);
    assert.equal(
      evidence.researchEvidenceAuthorized,
      false,
    );
    assert.equal(evidence.promotionAuthorized, false);
    assert.equal(
      evidence.repositoryPushPerformed,
      false,
    );
    assert.ok(
      Object.values(evidence.bodyAbsence).every(
        (value) => value === false,
      ),
    );
    const serialized = canonicalBytes(
      evidence as unknown as JsonValue,
    ).toString("utf8");
    assert.equal(
      serialized.includes(
        `opaque-task-sha256:${"d".repeat(64)}`,
      ),
      false,
    );
    assert.equal(
      serialized.includes("BEGIN PRIVATE KEY"),
      false,
    );
    const {
      evidenceHash,
      ...core
    } = evidence;
    assert.equal(
      evidenceHash,
      sha256(core as unknown as JsonValue),
    );

    const output =
      process.env[
        "SEH_SYNTHETIC_CUSTODY_OS_EVIDENCE_OUTPUT"
      ];
    if (output !== undefined) {
      const resolved = path.resolve(output);
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
