import assert from "node:assert/strict";
import { execFile as execFileCallback } from "node:child_process";
import {
  access,
  chmod,
  link,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";

import {
  canonicalBytes,
  GitWorktreeManager,
  SchemaRegistry,
  type JsonValue,
} from "../src/index.js";

const execFile = promisify(execFileCallback);

test("candidate Git worktree is filesystem-isolated from the active checkout", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "seh-worktrees-"));
  const manager = new GitWorktreeManager(path.resolve("."), root);
  await manager.initialize();
  const candidate = await manager.create("candidate-test-001");
  t.after(async () => {
    await manager.dispose(candidate).catch(() => undefined);
    await rm(root, { recursive: true, force: true });
  });
  const marker = "candidate-isolation-marker.txt";
  await writeFile(path.join(candidate.path, marker), "candidate only\n", "utf8");
  await assert.rejects(access(path.resolve(marker)));
  await assert.rejects(
    manager.freeze(candidate),
    /not an exact clean committed snapshot/u,
  );
  await rm(path.join(candidate.path, marker));

  const ignoredDirectory = path.join(candidate.path, "node_modules");
  await mkdir(ignoredDirectory, { recursive: true });
  await writeFile(path.join(ignoredDirectory, "ignored.txt"), "ignored\n", "utf8");
  await assert.rejects(
    manager.freeze(candidate),
    /not an exact clean committed snapshot/u,
  );
  await rm(ignoredDirectory, { recursive: true, force: true });

  await symlink("package.json", path.join(candidate.path, "candidate-link"));
  await assert.rejects(
    manager.freeze(candidate),
    /not an exact clean committed snapshot/u,
  );
  await rm(path.join(candidate.path, "candidate-link"));

  const externalHardlink = path.join(root, "package-hardlink.json");
  await link(path.join(candidate.path, "package.json"), externalHardlink);
  await assert.rejects(manager.freeze(candidate), /Hard-linked tracked file/u);
  await rm(externalHardlink);

  const frozen = await manager.freeze(candidate);
  assert.equal(frozen.baseCommit, frozen.headCommit);
  assert.equal(frozen.statusPorcelainV2, "");
  assert.match(frozen.filesystemSnapshotHash, /^sha256:[a-f0-9]{64}$/u);
  const descriptor = manager.snapshotDescriptor(frozen);
  assert.equal(
    descriptor.filesystemSnapshotHash,
    frozen.filesystemSnapshotHash,
  );
  const schemas = await SchemaRegistry.load(path.resolve("schemas"));
  schemas.validate(
    "https://self-evolving-harness.local/schemas/filesystem-snapshot.schema.json",
    descriptor as unknown as JsonValue,
  );
  const snapshot = await manager.materializeSnapshot(
    frozen,
    path.join(root, "snapshots", "candidate-test-001"),
  );
  const descriptorPath = path.join(root, "candidate-snapshot.json");
  await writeFile(
    descriptorPath,
    canonicalBytes(descriptor as unknown as JsonValue),
    { mode: 0o600 },
  );
  const verifyScript = [
    "import importlib.util,sys",
    "s=importlib.util.spec_from_file_location('seh_evaluator',sys.argv[1])",
    "m=importlib.util.module_from_spec(s)",
    "s.loader.exec_module(m)",
    "print(m.verify_filesystem_snapshot(sys.argv[2],sys.argv[3],sys.argv[4]))",
  ].join(";");
  const verifySnapshot = () =>
    execFile(
      "/usr/bin/python3",
      [
        "-I",
        "-c",
        verifyScript,
        path.resolve("evaluator/external_evaluator.py"),
        snapshot.path,
        descriptorPath,
        descriptor.filesystemSnapshotHash,
      ],
      { encoding: "utf8", timeout: 10_000 },
    );
  assert.equal(
    (await verifySnapshot()).stdout.trim(),
    descriptor.filesystemSnapshotHash,
  );
  assert.equal(snapshot.filesystemSnapshotHash, frozen.filesystemSnapshotHash);
  const originalPackage = await readFile(path.join(candidate.path, "package.json"), "utf8");
  assert.equal(
    await readFile(path.join(snapshot.path, "package.json"), "utf8"),
    originalPackage,
  );
  await chmod(path.join(snapshot.path, "package.json"), 0o600);
  await assert.rejects(verifySnapshot(), /snapshot file bytes or mode changed/u);
  await chmod(path.join(snapshot.path, "package.json"), 0o400);
  assert.equal(
    (await verifySnapshot()).stdout.trim(),
    descriptor.filesystemSnapshotHash,
  );

  await writeFile(path.join(candidate.path, "package.json"), `${originalPackage}\n`, "utf8");
  await assert.rejects(
    manager.materializeSnapshot(
      frozen,
      path.join(root, "snapshots", "substituted"),
    ),
    /changed after snapshot verification/u,
  );
  assert.equal(
    await readFile(path.join(snapshot.path, "package.json"), "utf8"),
    originalPackage,
  );
  await manager.disposeMaterializedSnapshot(snapshot);
});
