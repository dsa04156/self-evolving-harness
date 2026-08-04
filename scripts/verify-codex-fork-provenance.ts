import { execFile } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import {
  SchemaRegistry,
  parseStrictJson,
  type JsonValue,
} from "../src/index.js";

const execFileAsync = promisify(execFile);
const PROVENANCE_PATH = "docs/research/codex-fork-provenance.json";
const SCHEMA_ID =
  "https://self-evolving-harness.local/schemas/codex-fork-provenance.schema.json";

interface ModifiedFile {
  readonly path: string;
}

interface CodexForkProvenance {
  readonly upstream: {
    readonly commit: string;
    readonly commitTree: string;
    readonly noticePath: string;
    readonly licensePath: string;
  };
  readonly import: {
    readonly prefix: string;
    readonly mergeCommit: string;
    readonly importedTree: string;
  };
  readonly standaloneBaseline: {
    readonly commit: string;
    readonly tag: string;
  };
  readonly modifiedFiles: readonly ModifiedFile[];
}

async function git(args: readonly string[]): Promise<string> {
  const result = await execFileAsync("git", [...args], {
    cwd: process.cwd(),
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
  return result.stdout.trim();
}

function lines(value: string): readonly string[] {
  return value.length === 0
    ? []
    : value.split("\n").filter((entry) => entry.length > 0);
}

const document = parseStrictJson(
  await readFile(PROVENANCE_PATH, "utf8"),
) as unknown as CodexForkProvenance;
const schemas = await SchemaRegistry.load(path.resolve("schemas"));
schemas.validate(SCHEMA_ID, document as unknown as JsonValue);

await Promise.all([
  access(document.upstream.noticePath),
  access(document.upstream.licensePath),
]);

const upstreamTree = await git([
  "rev-parse",
  `${document.upstream.commit}^{tree}`,
]);
const importedTree = await git([
  "rev-parse",
  `${document.import.mergeCommit}:${document.import.prefix}`,
]);
if (
  upstreamTree !== document.upstream.commitTree ||
  importedTree !== document.import.importedTree ||
  upstreamTree !== importedTree
) {
  throw new Error("Codex upstream/import tree identity failed");
}

await git([
  "merge-base",
  "--is-ancestor",
  document.import.mergeCommit,
  "HEAD",
]);
const tagCommit = await git([
  "rev-list",
  "-n",
  "1",
  document.standaloneBaseline.tag,
]);
if (tagCommit !== document.standaloneBaseline.commit) {
  throw new Error("Standalone tag no longer resolves to its frozen commit");
}

const tracked = lines(
  await git([
    "diff",
    "--name-only",
    document.import.mergeCommit,
    "--",
    document.import.prefix,
  ]),
);
const untracked = lines(
  await git([
    "ls-files",
    "--others",
    "--exclude-standard",
    document.import.prefix,
  ]),
);
const actual = [...new Set([...tracked, ...untracked])].sort();
const declared = [...new Set(document.modifiedFiles.map((entry) => entry.path))].sort();
if (JSON.stringify(actual) !== JSON.stringify(declared)) {
  throw new Error(
    `Codex modification ledger drifted. actual=${JSON.stringify(actual)} declared=${JSON.stringify(declared)}`,
  );
}

console.log(
  JSON.stringify({
    ok: true,
    upstreamCommit: document.upstream.commit,
    upstreamTree,
    importMergeCommit: document.import.mergeCommit,
    modifiedFileCount: declared.length,
    standaloneCommit: document.standaloneBaseline.commit,
  }),
);
