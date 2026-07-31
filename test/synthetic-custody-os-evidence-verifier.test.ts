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
  "architect/evidence/synthetic-custody-os-boundary/evidence.json",
);
const verifierPath = path.resolve(
  "scripts/verify-synthetic-custody-os-boundary.ts",
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
    ["--import", "tsx", verifierPath, file],
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
        reject(
          new Error(
            "synthetic custody evidence verifier timed out",
          ),
        );
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
  "standalone synthetic-custody verifier rejects rehashed nested tampering",
  async (t) => {
    const root = await mkdtemp(
      path.join(
        os.tmpdir(),
        "seh-synthetic-custody-evidence-",
      ),
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
        name: "descriptor-binding",
        mutate: (value) => {
          const normal = arrayAt(
            value,
            "scenarios",
          )[0]!;
          objectAt(
            normal,
            "descriptor",
          )["plaintextCommitment"] = sha256Text(
            "tampered-plaintext-commitment",
          );
        },
      },
      {
        name: "transition-disposition",
        mutate: (value) => {
          const normal = arrayAt(
            value,
            "scenarios",
          )[0]!;
          arrayAt(
            normal,
            "transitions",
          )[1]!["reasonCode"] = "TAMPERED_ALLOWED";
        },
      },
      {
        name: "role-receipt-process",
        mutate: (value) => {
          const receipt = arrayAt(
            value,
            "roleReceipts",
          )[0]!;
          objectAt(receipt, "process")["uid"] = 1305;
        },
      },
      {
        name: "projection-source",
        mutate: (value) => {
          objectAt(
            value,
            "scorerProjection",
          )["sourceReceiptHash"] = sha256Text(
            "tampered-source-receipt",
          );
        },
      },
      {
        name: "final-audit-lineage",
        mutate: (value) => {
          const audit = objectAt(value, "finalAudit");
          const hashes = audit[
            "transitionHashes"
          ] as unknown[];
          assert.ok(Array.isArray(hashes));
          hashes[0] = sha256Text(
            "tampered-transition-lineage",
          );
        },
      },
      {
        name: "fresh-replay-request-signature",
        mutate: (value) => {
          const normal = arrayAt(
            value,
            "scenarios",
          )[0]!;
          const fresh = arrayAt(
            normal,
            "freshCapabilityReuse",
          )[0]!;
          objectAt(
            fresh,
            "request",
          )["senderSequence"] = 999_999;
        },
      },
      {
        name: "fresh-denial-lineage",
        mutate: (value) => {
          const normal = arrayAt(
            value,
            "scenarios",
          )[0]!;
          const fresh = arrayAt(
            normal,
            "freshCapabilityReuse",
          )[0]!;
          fresh["denialTransitionHash"] =
            sha256Text(
              "tampered-fresh-denial-lineage",
            );
        },
      },
      {
        name: "fresh-exact-retry-disposition",
        mutate: (value) => {
          const normal = arrayAt(
            value,
            "scenarios",
          )[0]!;
          const fresh = arrayAt(
            normal,
            "freshCapabilityReuse",
          )[0]!;
          fresh["exactRetryTransitionHash"] =
            sha256Text(
              "tampered-exact-retry-transition",
            );
        },
      },
      {
        name: "fresh-exact-retry-count",
        mutate: (value) => {
          const normal = arrayAt(
            value,
            "scenarios",
          )[0]!;
          const fresh = arrayAt(
            normal,
            "freshCapabilityReuse",
          )[0]!;
          fresh["exactRetryTransitionCountAfter"] =
            Number(
              fresh[
                "exactRetryTransitionCountAfter"
              ],
            ) + 1;
        },
      },
      {
        name: "crash-terminal-history",
        mutate: (value) => {
          const crash = arrayAt(
            value,
            "crashCases",
          )[0]!;
          crash["terminalTransitionHash"] =
            sha256Text(
              "tampered-crash-terminal-transition",
            );
        },
      },
      {
        name: "deny-release-recovery-count",
        mutate: (value) => {
          const crash = arrayAt(
            value,
            "crashCases",
          )[1]!;
          crash["reservationCountAfterRecovery"] = 1;
        },
      },
      {
        name: "deny-materialization-recovery-count",
        mutate: (value) => {
          const crash = arrayAt(
            value,
            "crashCases",
          )[3]!;
          crash[
            "materializationCountAfterRecovery"
          ] = 0;
        },
      },
      {
        name: "adversarial-denial-lineage",
        mutate: (value) => {
          const attack = arrayAt(
            value,
            "adversarialCases",
          )[0]!;
          attack["denialTransitionHash"] =
            sha256Text(
              "tampered-adversarial-denial",
            );
        },
      },
      {
        name: "adversarial-request-attestation",
        mutate: (value) => {
          const attack = arrayAt(
            value,
            "adversarialCases",
          ).at(-1)!;
          const request = objectAt(attack, "request");
          objectAt(
            request,
            "attestation",
          )["signature"] =
            "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
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
