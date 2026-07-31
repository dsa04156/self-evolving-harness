import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  ObservableOutcomeVerifier,
  WorkspacePathGuard,
  sha256Text,
} from "../src/index.js";

test("outcome verifier observes answer and workspace without harness identity", async (t) => {
  const root = await mkdtemp(
    path.join(os.tmpdir(), "seh-observable-verifier-"),
  );
  t.after(async () => rm(root, { recursive: true, force: true }));
  const workspace = new WorkspacePathGuard(root);
  await workspace.initialize();
  await workspace.writeFile(
    "result.txt",
    Buffer.from("DONE", "utf8"),
    { overwrite: false, maxBytes: 1024 },
  );
  const verifier = new ObservableOutcomeVerifier({
    schemaVersion: 1,
    requiredFinalText: "SEMANTIC_OK",
    requiredFiles: [
      {
        path: "result.txt",
        contentHash: sha256Text("DONE"),
      },
    ],
  });

  const passed = await verifier.verify({
    sessionId: "session-a",
    task: "task",
    proposedAnswer: "SEMANTIC_OK",
    workspaceRoot: root,
  });
  const failed = await verifier.verify({
    sessionId: "session-b",
    task: "same task",
    proposedAnswer: "SEMANTIC_REJECTED",
    workspaceRoot: root,
  });

  assert.equal(passed.passed, true);
  assert.equal(failed.passed, false);
  assert.equal(
    JSON.stringify(passed.evidence).includes("harnessVersion"),
    false,
  );
});
