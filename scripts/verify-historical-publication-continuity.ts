import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import {
  HISTORICAL_PUBLICATION_ROOTS,
  assertPublicationContinuity,
  detectSecretPatternLabels,
  isEnvironmentArtifactPath,
  parseRemoteHeadObservation,
} from "../src/index.js";

const execFileAsync = promisify(execFile);
const CORRECTIVE_COMMIT =
  HISTORICAL_PUBLICATION_ROOTS[3]!.commit;
const PRIOR_PUBLIC_HEAD =
  "fef0a00b74e5f9e159ac8902a99aaefda8148187";

async function gitText(
  args: readonly string[],
  options: { readonly cwd?: string } = {},
): Promise<string> {
  const result = await execFileAsync("git", [...args], {
    cwd: options.cwd ?? process.cwd(),
    encoding: "utf8",
    maxBuffer: 128 * 1024 * 1024,
  });
  return result.stdout;
}

async function gitBytes(args: readonly string[]): Promise<Buffer> {
  const result = await execFileAsync("git", [...args], {
    cwd: process.cwd(),
    encoding: "buffer",
    maxBuffer: 128 * 1024 * 1024,
  });
  return result.stdout;
}

async function gitIsAncestor(
  ancestor: string,
  descendant: string,
): Promise<boolean> {
  try {
    await execFileAsync(
      "git",
      ["merge-base", "--is-ancestor", ancestor, descendant],
      { cwd: process.cwd() },
    );
    return true;
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === 1
    ) {
      return false;
    }
    throw error;
  }
}

async function verifyLiveContinuity(): Promise<{
  readonly remoteCommit: string;
  readonly localCommit: string;
  readonly newBlobCount: number;
  readonly newCommitCount: number;
}> {
  const remoteCommit = parseRemoteHeadObservation(
    await gitText([
      "ls-remote",
      "--heads",
      "origin",
      "main",
    ]),
  );
  const localCommit = (
    await gitText(["rev-parse", "HEAD"])
  ).trim();
  assertPublicationContinuity({
    requiredAncestorCommit: PRIOR_PUBLIC_HEAD,
    remoteCommit,
    localCommit,
    remoteDescendsFromRequiredAncestor: await gitIsAncestor(
      PRIOR_PUBLIC_HEAD,
      remoteCommit,
    ),
    localDescendsFromRemote: await gitIsAncestor(
      remoteCommit,
      localCommit,
    ),
  });

  const objectIds = new Set(
    (
      await gitText([
        "rev-list",
        "--objects",
        localCommit,
        remoteCommit,
        "--not",
        CORRECTIVE_COMMIT,
      ])
    )
      .trim()
      .split("\n")
      .filter((line) => line.length > 0)
      .map((line) => line.split(" ", 1)[0]!),
  );
  let newBlobCount = 0;
  let secretMatchCount = 0;
  for (const objectId of objectIds) {
    const type = (
      await gitText(["cat-file", "-t", objectId])
    ).trim();
    if (type !== "blob") continue;
    newBlobCount += 1;
    secretMatchCount += detectSecretPatternLabels(
      await gitBytes(["cat-file", "blob", objectId]),
    ).length;
  }

  const commits = new Set(
    (
      await gitText([
        "rev-list",
        localCommit,
        remoteCommit,
        "--not",
        CORRECTIVE_COMMIT,
      ])
    )
      .trim()
      .split("\n")
      .filter((line) => line.length > 0),
  );
  let environmentObservationCount = 0;
  for (const commit of commits) {
    const paths = (
      await gitText([
        "ls-tree",
        "-r",
        "-z",
        "--name-only",
        commit,
      ])
    )
      .split("\0")
      .filter((entry) => entry.length > 0);
    environmentObservationCount += paths.filter(
      isEnvironmentArtifactPath,
    ).length;
  }

  if (
    secretMatchCount !== 0 ||
    environmentObservationCount !== 0
  ) {
    throw new Error(
      "Post-corrective publication secret or environment-file scan failed",
    );
  }
  return {
    remoteCommit,
    localCommit,
    newBlobCount,
    newCommitCount: commits.size,
  };
}

async function replayImmutableHistoricalVerifier(): Promise<void> {
  const temporaryRoot = await mkdtemp(
    path.join(tmpdir(), "seh-publication-replay-"),
  );
  const replayRemote = path.join(temporaryRoot, "remote.git");
  const gitDirKey = "GIT_DIR";
  const gitWorkTreeKey = "GIT_WORK_TREE";
  const previous = {
    gitDir: process.env[gitDirKey],
    gitWorkTree: process.env[gitWorkTreeKey],
  };
  try {
    await gitText([
      "clone",
      "--bare",
      "--no-hardlinks",
      ".",
      replayRemote,
    ]);
    await gitText([
      "--git-dir",
      replayRemote,
      "update-ref",
      "refs/heads/main",
      CORRECTIVE_COMMIT,
    ]);
    await gitText([
      "--git-dir",
      replayRemote,
      "config",
      "remote.origin.url",
      replayRemote,
    ]);
    process.env[gitDirKey] = replayRemote;
    delete process.env[gitWorkTreeKey];
    await import(
      "./verify-historical-publication-governance.js"
    );
  } finally {
    for (const [key, value] of [
      [gitDirKey, previous.gitDir],
      [gitWorkTreeKey, previous.gitWorkTree],
    ] as const) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await rm(temporaryRoot, {
      recursive: true,
      force: true,
    });
  }
}

const continuity = await verifyLiveContinuity();
await replayImmutableHistoricalVerifier();

process.stdout.write(
  [
    "PASS_CONTINUITY",
    `corrective=${CORRECTIVE_COMMIT}`,
    `priorPublicHead=${PRIOR_PUBLIC_HEAD}`,
    `remote=${continuity.remoteCommit}`,
    `local=${continuity.localCommit}`,
    `postCorrectiveCommits=${continuity.newCommitCount}`,
    `postCorrectiveBlobs=${continuity.newBlobCount}`,
    "secrets=0",
    "environmentPaths=0",
  ].join(" ") + "\n",
);
