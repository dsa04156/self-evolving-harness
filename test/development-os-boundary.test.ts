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
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  PrincipalSigner,
  SchemaRegistry,
  canonicalBytes,
  parseStrictJson,
  sha256Text,
  type DevelopmentAttributionLabel,
  type DevelopmentOracleJoinEntry,
  type JsonValue,
  type LabelBlindAttributionCorpus,
} from "../src/index.js";

const hasUidMapHelpers =
  existsSync("/usr/bin/newuidmap") &&
  existsSync("/usr/bin/newgidmap");
const requireOsBoundary =
  process.env["SEH_REQUIRE_DEVELOPMENT_OS_BOUNDARY"] ===
  "1";
const pythonRoot =
  "/home/jinuk/.local/share/uv/python/cpython-3.13.14-linux-x86_64-gnu";

const roleUids = {
  attributor: 1201,
  committer: 1202,
  scorer: 1203,
  proposer: 1204,
  operations: 1205,
  runtime: 1206,
  evaluator: 1207,
  audit: 1208,
} as const;

async function writeCanonical(
  file: string,
  value: JsonValue,
): Promise<void> {
  await writeFile(file, canonicalBytes(value), {
    mode: 0o600,
  });
}

function generateSigner(
  roleName: keyof typeof roleUids,
): PrincipalSigner {
  const roles = {
    attributor: "proposer",
    committer: "proposer",
    scorer: "evaluator",
    proposer: "proposer",
    operations: "operations_owner",
    runtime: "runtime",
    evaluator: "evaluator",
    audit: "audit_store",
  } as const;
  return PrincipalSigner.generate({
    principalId:
      `${roles[roleName]}.development-os.${roleName}`,
    role: roles[roleName],
    implementationDigest: sha256Text(
      `development-os.${roleName}.implementation`,
    ),
    instanceId:
      `${roles[roleName]}.development-os.${roleName}.instance`,
  });
}

function oracleJoin(
  corpus: LabelBlindAttributionCorpus,
): readonly DevelopmentOracleJoinEntry[] {
  const labels: readonly DevelopmentAttributionLabel[] = [
    "SystemPrompt",
    "ContextPolicy",
    "MemoryRetrievalPolicy",
    "Skill",
    "WorkflowPolicy",
    "RoutingPolicy",
    "SubagentPrompt",
    "ToolDescription",
  ];
  const entries: DevelopmentOracleJoinEntry[] = [];
  let ordinal = 0;
  for (const trace of corpus.traces) {
    for (
      let occurrence = 0;
      occurrence < trace.occurrenceCount;
      occurrence += 1
    ) {
      entries.push({
        caseId:
          `development-os-case-${String(ordinal).padStart(2, "0")}`,
        traceProjectionId:
          trace.trace.traceProjectionId,
        targetComponentType:
          labels[ordinal % labels.length]!,
        oracleRecordHash: sha256Text(
          `development-os-oracle-${ordinal}`,
        ),
      });
      ordinal += 1;
    }
  }
  return entries;
}

test(
  "eight subordinate UIDs enforce prediction-before-label and isolated runtime evaluation",
  {
    skip:
      hasUidMapHelpers || requireOsBoundary
        ? false
        : "uidmap is required for the development OS-boundary track",
    timeout: 240_000,
  },
  async (t) => {
    assert.equal(
      hasUidMapHelpers,
      true,
      "required development OS boundary cannot skip uidmap",
    );
    assert.equal(
      existsSync(pythonRoot),
      true,
      "pinned Python 3.13 runtime is missing",
    );
    const root = await mkdtemp(
      path.join(os.tmpdir(), "seh-development-os-"),
    );
    t.after(async () => {
      await rm(root, { recursive: true, force: true });
    });
    for (const directory of [
      "public",
      "source",
      "vault",
      ...Object.keys(roleUids).map(
        (role) => `vault/${role}`,
      ),
    ]) {
      await mkdir(path.join(root, directory), {
        recursive: true,
        mode: 0o700,
      });
    }
    const signers = Object.fromEntries(
      Object.keys(roleUids).map((role) => [
        role,
        generateSigner(role as keyof typeof roleUids),
      ]),
    ) as Record<keyof typeof roleUids, PrincipalSigner>;
    for (const [role, signer] of Object.entries(
      signers,
    )) {
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
    await writeCanonical(
      path.join(root, "public", "principals.json"),
      Object.fromEntries(
        Object.entries(signers).map(([role, value]) => [
          role,
          value.exportPublic(),
        ]),
      ) as unknown as JsonValue,
    );
    const protocolId =
      `protocol-sha256:${"e".repeat(64)}`;
    await writeFile(
      path.join(root, "public", "protocol-id"),
      protocolId,
      { mode: 0o600 },
    );
    const corpus = parseStrictJson(
      await readFile(
        path.resolve(
          "benchmarks/harness-fault-bench/semantic/mine/label-blind-corpus.json",
        ),
        "utf8",
      ),
    ) as unknown as LabelBlindAttributionCorpus;
    await writeCanonical(
      path.join(root, "source", "corpus.json"),
      corpus as unknown as JsonValue,
    );
    await writeCanonical(
      path.join(root, "source", "oracle-join.json"),
      oracleJoin(corpus) as unknown as JsonValue,
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
          "evaluator/development_boundary_gate.py",
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
              "development OS boundary exceeded 220 seconds",
            ),
          );
        }, 220_000);
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
    const evidence = JSON.parse(lines.at(-1)!) as {
      isolationClass: string;
      roleUids: Record<string, number>;
      publicPrincipals: Record<
        string,
        {
          publicKeyPem: string;
        }
      >;
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
          networkDenied: string;
        }
      >;
      keyOwners: Record<string, number>;
      earlyScorerSocketAbsent: boolean;
      predictionSeal: {
        commitmentVerified: boolean;
        durability: {
          appendMode: string;
          fileSyncRequired: boolean;
          directorySyncRequired: boolean;
        };
      };
      scorerRelease: {
        accepted: {
          accepted: boolean;
          reportHash: string;
        };
        adversarial: {
          mode: string;
          response: {
            accepted: boolean;
            errorCode: string;
          };
        }[];
        oracleMountRoles: string[];
        proposerReceivedScorerOutput: boolean;
      };
      actualRuntimeEvaluation: {
        sourceClass: string;
        aggregate: {
          taskCount: number;
          parentPassCount: number;
          candidatePassCount: number;
          passToFailCount: number;
          failToPassCount: number;
          researchMetric: boolean;
          promotionSignal: boolean;
        };
      };
      finalAudit: {
        researchEvidenceAuthorized: boolean;
        promotionAuthorized: boolean;
        providerUsed: boolean;
        oracleMountRoles: string[];
      };
      providerUsed: boolean;
      researchEvidenceAuthorized: boolean;
      promotionAuthorized: boolean;
    };
    const schemas = await SchemaRegistry.load(
      path.resolve("schemas"),
    );
    schemas.validate(
      "https://self-evolving-harness.local/schemas/development-process-boundary-evidence.schema.json",
      evidence as unknown as JsonValue,
    );
    assert.equal(
      evidence.isolationClass,
      "os_enforced_subordinate_uids",
    );
    assert.deepEqual(evidence.roleUids, roleUids);
    assert.equal(
      new Set(Object.values(evidence.hostRoleUids)).size,
      8,
    );
    assert.deepEqual(evidence.keyOwners, roleUids);
    for (const [role, uid] of Object.entries(roleUids)) {
      const probe = evidence.roleProbes[role]!;
      assert.equal(probe.uid, uid);
      assert.equal(
        probe.effectiveCapabilities,
        "0000000000000000",
      );
      assert.equal(probe.noNewPrivileges, "1");
      assert.equal(probe.forbiddenReadsDenied, 7);
      assert.equal(probe.forbiddenWritesDenied, 7);
      assert.notEqual(probe.networkDenied, "");
      assert.equal(
        verify(
          null,
          Buffer.from(
            evidence.roleProbes[role]!.challenge,
            "utf8",
          ),
          createPublicKey(
            evidence.publicPrincipals[role]!
              .publicKeyPem,
          ),
          Buffer.from(
            evidence.roleProbes[role]!
              .challengeSignature,
            "base64url",
          ),
        ),
        true,
      );
    }
    assert.equal(evidence.earlyScorerSocketAbsent, true);
    assert.equal(
      evidence.predictionSeal.commitmentVerified,
      true,
    );
    assert.deepEqual(evidence.predictionSeal.durability, {
      appendMode: "exclusive_create",
      fileSyncRequired: true,
      directorySyncRequired: true,
    });
    assert.equal(
      evidence.scorerRelease.accepted.accepted,
      true,
    );
    assert.equal(
      evidence.scorerRelease.adversarial.length,
      7,
    );
    assert.ok(
      evidence.scorerRelease.adversarial.every(
        (entry) => entry.response.accepted === false,
      ),
    );
    assert.deepEqual(
      evidence.scorerRelease.oracleMountRoles,
      ["scorer"],
    );
    assert.equal(
      evidence.scorerRelease.proposerReceivedScorerOutput,
      false,
    );
    assert.equal(
      evidence.actualRuntimeEvaluation.sourceClass,
      "derived_from_actual_standalone_runtime_evidence",
    );
    assert.deepEqual(
      evidence.actualRuntimeEvaluation.aggregate,
      {
        taskCount: 2,
        parentPassCount: 1,
        candidatePassCount: 2,
        passToFailCount: 0,
        failToPassCount: 1,
        researchMetric: false,
        promotionSignal: false,
      },
    );
    assert.deepEqual(
      evidence.finalAudit.oracleMountRoles,
      ["scorer"],
    );
    assert.equal(
      evidence.finalAudit.researchEvidenceAuthorized,
      false,
    );
    assert.equal(
      evidence.finalAudit.promotionAuthorized,
      false,
    );
    assert.equal(evidence.finalAudit.providerUsed, false);
    assert.equal(evidence.providerUsed, false);
    assert.equal(
      evidence.researchEvidenceAuthorized,
      false,
    );
    assert.equal(evidence.promotionAuthorized, false);

    const evidenceOutput =
      process.env[
        "SEH_DEVELOPMENT_BOUNDARY_EVIDENCE_OUTPUT"
      ];
    if (evidenceOutput !== undefined) {
      await mkdir(path.dirname(path.resolve(evidenceOutput)), {
        recursive: true,
        mode: 0o700,
      });
      await writeCanonical(
        path.resolve(evidenceOutput),
        evidence as unknown as JsonValue,
      );
    }
  },
);
