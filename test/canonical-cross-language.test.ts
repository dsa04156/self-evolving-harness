import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import test from "node:test";

import {
  canonicalize,
  parseCanonicalJson,
  parseStrictJson,
  sha256,
  type JsonValue,
} from "../src/index.js";

const execFileAsync = promisify(execFile);
const PYTHON =
  "/home/jinuk/.local/share/uv/python/cpython-3.13.14-linux-x86_64-gnu/bin/python3.13";

interface CanonicalCorpus {
  readonly profile: "seh-c14n-int-v1";
  readonly valid: readonly {
    readonly id: string;
    readonly value: JsonValue;
    readonly canonical: string;
    readonly sha256: string;
  }[];
  readonly invalid: readonly {
    readonly id: string;
    readonly json: string;
  }[];
}

function asCorpus(value: JsonValue): CanonicalCorpus {
  return value as unknown as CanonicalCorpus;
}

test("TypeScript and Python share the integer-only canonical profile", async () => {
  const corpusPath = path.resolve("test/fixtures/canonical-profile-v1.json");
  const corpus = asCorpus(parseStrictJson(await readFile(corpusPath, "utf8")));
  assert.equal(corpus.profile, "seh-c14n-int-v1");

  for (const vector of corpus.valid) {
    assert.equal(canonicalize(vector.value), vector.canonical, vector.id);
    assert.equal(sha256(vector.value), vector.sha256, vector.id);
    assert.deepEqual(parseCanonicalJson(vector.canonical), vector.value, vector.id);
  }
  for (const vector of corpus.invalid) {
    assert.throws(() => parseCanonicalJson(vector.json), vector.id);
  }

  const { stdout, stderr } = await execFileAsync(
    PYTHON,
    ["-I", path.resolve("evaluator/external_evaluator.py"), "--canonical-corpus", corpusPath],
    {
      cwd: path.resolve("."),
      env: {
        PATH: "/usr/bin:/bin",
        LANG: "C.UTF-8",
        LC_ALL: "C.UTF-8",
        PYTHONHASHSEED: "0",
        PYTHONDONTWRITEBYTECODE: "1",
      },
      maxBuffer: 1024 * 1024,
    },
  );
  assert.equal(stderr, "");
  assert.ok(stdout.endsWith("\n"));
  const result = parseCanonicalJson(stdout.slice(0, -1)) as unknown as {
    readonly profile: string;
    readonly valid: readonly {
      readonly id: string;
      readonly canonical: string;
      readonly sha256: string;
    }[];
    readonly invalid: readonly {
      readonly id: string;
      readonly rejected: boolean;
    }[];
  };
  assert.equal(result.profile, corpus.profile);
  assert.deepEqual(
    result.valid,
    corpus.valid.map(({ id, canonical, sha256: digest }) => ({
      id,
      canonical,
      sha256: digest,
    })),
  );
  assert.deepEqual(
    result.invalid,
    corpus.invalid.map(({ id }) => ({ id, rejected: true })),
  );
});
