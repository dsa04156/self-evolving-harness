import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  ContextBuilder,
  HarnessError,
  WorkspacePathGuard,
  type ContextPolicy,
  type ModelTool,
} from "../src/index.js";

const READ_TOOL: ModelTool = {
  toolId: "filesystem.read",
  name: "read",
  description: "Read a relative file.",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    required: ["path"],
    properties: { path: { type: "string" } },
  },
  strict: true,
};

function policy(
  sources: ContextPolicy["sources"],
): ContextPolicy {
  return {
    totalTokenLimit: 1024,
    sources,
    overflowPolicy: "drop_lowest_priority",
  };
}

test("tool_catalog selection controls the model-visible tool catalog", () => {
  const common = {
    task: "Inspect input.txt.",
    prompt: { sections: [] },
    transcript: [],
    memory: [],
    skills: [],
    verificationFeedback: null,
    tools: [READ_TOOL],
  } as const;

  const selected = new ContextBuilder(
    policy([
      {
        source: "task_input",
        priority: 100,
        maxTokens: 128,
        selection: "all_in_order",
      },
      {
        source: "tool_catalog",
        priority: 90,
        maxTokens: 128,
        selection: "all_in_order",
      },
    ]),
  ).construct(common);
  const omitted = new ContextBuilder(
    policy([
      {
        source: "task_input",
        priority: 100,
        maxTokens: 128,
        selection: "all_in_order",
      },
    ]),
  ).construct(common);

  assert.deepEqual(selected.tools, [READ_TOOL]);
  assert.deepEqual(omitted.tools, []);
  assert.equal(
    omitted.manifest.entries.find(
      (entry) => entry.source === "tool_catalog",
    )?.reason,
    "source_disabled",
  );
});

test("missing workspace reads have root-independent safe errors", async (t) => {
  const root = await mkdtemp(
    path.join(os.tmpdir(), "seh-path-error-"),
  );
  t.after(async () =>
    rm(root, { recursive: true, force: true }),
  );
  const workspace = new WorkspacePathGuard(root);
  await workspace.initialize();
  await assert.rejects(
    workspace.readFile("missing.txt", 1024),
    (error: unknown) =>
      error instanceof HarnessError &&
      error.code === "ARTIFACT_UNAVAILABLE" &&
      error.safeDetail === "missing.txt is unavailable" &&
      !error.safeDetail.includes(root),
  );
});

test("tool_results and session_events are not appended outside policy selection", () => {
  const constructed = new ContextBuilder(
    policy([
      {
        source: "task_input",
        priority: 100,
        maxTokens: 128,
        selection: "all_in_order",
      },
    ]),
  ).construct({
    task: "Return only the current task.",
    prompt: { sections: [] },
    transcript: [
      {
        kind: "text",
        role: "assistant",
        content: "stale transcript",
      },
      {
        kind: "tool_output",
        callId: "call-1",
        output: { content: "secret tool output" },
        isError: false,
      },
    ],
    memory: [],
    skills: [],
    verificationFeedback: null,
    tools: [],
  });

  assert.deepEqual(constructed.input, [
    {
      kind: "text",
      role: "user",
      content: "Return only the current task.",
    },
  ]);
});

test("selected skills render their bound immutable tool IDs", () => {
  const constructed = new ContextBuilder(
    policy([
      {
        source: "selected_skills",
        priority: 100,
        maxTokens: 256,
        selection: "all_in_order",
      },
    ]),
  ).construct({
    task: "task",
    prompt: { sections: [] },
    transcript: [],
    memory: [],
    skills: [
      {
        schemaVersion: 1,
        language: "seh.skill.v1",
        skillId: "inspect",
        summary: "Inspect the file.",
        allowedToolIds: ["filesystem.read"],
        steps: [
          {
            stepId: "read",
            kind: "tool_guidance",
            instruction: "Read before editing.",
            toolId: "filesystem.read",
          },
        ],
        completionChecks: [],
      },
    ],
    verificationFeedback: null,
    tools: [],
  });

  assert.match(
    constructed.instructions,
    /\[tool_guidance tool=filesystem\.read\]/u,
  );
});
