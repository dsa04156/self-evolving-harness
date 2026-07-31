import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import {
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  canonicalBytes,
  parseStrictJson,
  sha256,
  sha256Text,
  type JsonValue,
} from "../src/index.js";

const evidencePath = path.resolve(
  "architect/evidence/evaluator-vault-os-boundary/evidence.json",
);
const verifierPath = path.resolve(
  "scripts/verify-evaluator-vault-os-boundary.ts",
);

type MutableObject = Record<string, unknown>;

async function runVerifier(
  file: string,
): Promise<{
  readonly code: number | null;
  readonly stdout: string;
  readonly stderr: string;
}> {
  const child = spawn(
    process.execPath,
    [
      "--import",
      "tsx",
      verifierPath,
      file,
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
  child.stdout.on("data", (chunk: Buffer) =>
    stdout.push(Buffer.from(chunk)),
  );
  child.stderr.on("data", (chunk: Buffer) =>
    stderr.push(Buffer.from(chunk)),
  );
  const code = await new Promise<number | null>(
    (resolve, reject) => {
      const timer = setTimeout(() => {
        child.kill("SIGKILL");
        reject(new Error("evidence verifier timed out"));
      }, 30_000);
      child.once("close", (value) => {
        clearTimeout(timer);
        resolve(value);
      });
    },
  );
  return {
    code,
    stdout: Buffer.concat(stdout).toString("utf8"),
    stderr: Buffer.concat(stderr).toString("utf8"),
  };
}

function objectAt(
  root: MutableObject,
  key: string,
): MutableObject {
  const value = root[key];
  assert.ok(
    typeof value === "object" &&
      value !== null &&
      !Array.isArray(value),
  );
  return value as MutableObject;
}

function arrayAt(
  root: MutableObject,
  key: string,
): MutableObject[] {
  const value = root[key];
  assert.ok(Array.isArray(value));
  return value as MutableObject[];
}

function resealEvidence(value: MutableObject): void {
  const {
    evidenceHash: _evidenceHash,
    ...core
  } = value;
  value["evidenceHash"] = sha256(
    core as unknown as JsonValue,
  );
}

test(
  "standalone OS-boundary verifier rejects rehashed signed-record tampering",
  async (t) => {
    const root = await mkdtemp(
      path.join(os.tmpdir(), "seh-vault-evidence-"),
    );
    t.after(async () => {
      await rm(root, { recursive: true, force: true });
    });
    const original = parseStrictJson(
      await readFile(evidencePath, "utf8"),
    );
    const baseline = await runVerifier(evidencePath);
    assert.equal(baseline.code, 0, baseline.stderr);
    assert.equal(
      JSON.parse(baseline.stdout).verified,
      true,
    );

    const mutationCases: readonly {
      readonly name: string;
      readonly mutate: (value: MutableObject) => void;
    }[] = [
      {
        name: "promoter-score",
        mutate: (value) => {
          objectAt(
            value,
            "promoterProjection",
          )["scoreCommitment"] = sha256Text(
            "tampered-promoter-score",
          );
        },
      },
      {
        name: "role-challenge",
        mutate: (value) => {
          const probes = objectAt(value, "roleProbes");
          const evaluator = objectAt(
            probes,
            "evaluator",
          );
          evaluator["challenge"] =
            `${String(evaluator["challenge"])}.tampered`;
        },
      },
      {
        name: "vault-access-record",
        mutate: (value) => {
          const transport = objectAt(
            value,
            "transport",
          );
          const score = arrayAt(
            transport,
            "transactions",
          ).find(
            (entry) => entry["stage"] === "score",
          );
          assert.ok(score);
          const result = objectAt(score, "result");
          const outcome = objectAt(result, "outcome");
          const accessRecord = objectAt(
            outcome,
            "accessRecord",
          );
          accessRecord["reasonCode"] =
            "TAMPERED_ALLOWED";
        },
      },
    ];

    for (const mutation of mutationCases) {
      const changed = structuredClone(
        original,
      ) as unknown as MutableObject;
      mutation.mutate(changed);
      resealEvidence(changed);
      const file = path.join(
        root,
        `${mutation.name}.json`,
      );
      await writeFile(
        file,
        canonicalBytes(
          changed as unknown as JsonValue,
        ),
        { mode: 0o600 },
      );
      const result = await runVerifier(file);
      assert.notEqual(
        result.code,
        0,
        `${mutation.name} unexpectedly verified`,
      );
    }
  },
);
