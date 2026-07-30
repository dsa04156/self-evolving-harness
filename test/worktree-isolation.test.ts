import assert from "node:assert/strict";
import { access, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { GitWorktreeManager } from "../src/index.js";

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
  const frozen = await manager.freeze(candidate);
  assert.equal(frozen.baseCommit, frozen.headCommit);
  assert.match(frozen.statusPorcelainV2, /candidate-isolation-marker\.txt/u);
});
