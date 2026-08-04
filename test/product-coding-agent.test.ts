import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  FakeModelProvider,
  FakeTaskVerifier,
  FilesystemMemory,
  HarnessError,
  ProductSessionStore,
  RandomIdFactory,
  SystemClock,
  defaultProductConfig,
  applyProductConfigOverrides,
  passingVerification,
  runCodingAgentTask,
  sha256,
  type ModelResponse,
  type ProductStatePaths,
} from "../src/index.js";

function response(
  responseId: string,
  output: ModelResponse["output"],
): ModelResponse {
  return {
    responseId,
    modelIdentity: "ollama:test-coder",
    output,
    usage: {
      inputTokens: 12,
      outputTokens: 6,
      reasoningTokens: 0,
      cachedInputTokens: 0,
      totalTokens: 18,
    },
    providerMetadata: { deterministic: true },
  };
}

function paths(stateRoot: string): ProductStatePaths {
  const projectRoot = path.join(stateRoot, "project");
  const sessionsRoot = path.join(projectRoot, "sessions");
  return {
    stateRoot,
    projectId: "test-project",
    projectRoot,
    configFile: path.join(projectRoot, "config.json"),
    memoryRoot: path.join(projectRoot, "memory"),
    sessionsRoot,
    skillsRoot: path.join(projectRoot, "skills"),
    sessionDirectory(sessionId) {
      return path.join(sessionsRoot, sessionId);
    },
    sessionRuntimeRoot(sessionId) {
      return path.join(sessionsRoot, sessionId, "runtime");
    },
  };
}

test("product coding agent edits the bound repository and persists session memory outside it", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "seh-product-agent-"));
  const workspace = path.join(root, "workspace");
  const stateRoot = path.join(root, "state");
  await mkdir(workspace, { recursive: true });
  await writeFile(path.join(workspace, "input.txt"), "before\n", "utf8");
  t.after(async () => rm(root, { recursive: true, force: true }));
  const config = defaultProductConfig(workspace, {
    providerKind: "ollama",
    model: "test-coder",
  });
  const provider = new FakeModelProvider([
    response("response.product.write", [
      {
        kind: "tool_call",
        callId: "call.product.write",
        toolName: "write",
        arguments: { path: "result.txt", content: "usable-agent\n", overwrite: false },
        rawArguments:
          '{"path":"result.txt","content":"usable-agent\\n","overwrite":false}',
      },
    ]),
    response("response.product.done", [
      {
        kind: "assistant_message",
        text: "Created result.txt and reviewed the requested change.",
      },
    ]),
  ]);
  const observedEvents: string[] = [];
  const statePaths = paths(stateRoot);
  const record = await runCodingAgentTask({
    workspaceRoot: workspace,
    paths: statePaths,
    config,
    task: "Create result.txt containing usable-agent.",
    executionTask: "THREAD CONTEXT\nCurrent request: Create result.txt containing usable-agent.",
    providerOverride: provider,
    verifierOverride: new FakeTaskVerifier(sha256({ verifier: "product-test" }), () =>
      passingVerification("product verifier passed"),
    ),
    onEvent(event) {
      observedEvents.push(event.eventType);
    },
    now: new Date("2026-08-03T00:00:00.000Z"),
  });

  assert.equal(await readFile(path.join(workspace, "result.txt"), "utf8"), "usable-agent\n");
  assert.equal(record.state, "completed");
  assert.equal(record.task, "Create result.txt containing usable-agent.");
  assert.equal(
    record.runtimeTaskHash,
    sha256({ task: "THREAD CONTEXT\nCurrent request: Create result.txt containing usable-agent." }),
  );
  assert.deepEqual(record.contextSessionIds, []);
  assert.equal(record.result?.lifecycleState, "retired");
  assert.equal(record.result?.verification?.passed, true);
  assert.ok(observedEvents.includes("tool_call_requested"));
  assert.ok(observedEvents.includes("verification_completed"));
  assert.equal(provider.requests[0]?.modelIdentity, "ollama:test-coder");
  assert.equal(
    provider.requests[0]?.input.some(
      (item) => item.kind === "text" && item.content.includes("THREAD CONTEXT"),
    ),
    true,
  );
  assert.equal(provider.requests[0]?.tools.some((tool) => tool.name === "write"), true);

  const stored = await new ProductSessionStore(statePaths).get(record.sessionId);
  assert.equal(stored.metadataHash, record.metadataHash);

  const followUpTask = "Now report that the requested artifact exists.";
  const followUpExecutionTask = `Prior answer: ${record.result?.finalText ?? ""}\nCurrent request: ${followUpTask}`;
  const followUp = await runCodingAgentTask({
    workspaceRoot: workspace,
    paths: statePaths,
    config,
    task: followUpTask,
    executionTask: followUpExecutionTask,
    parentSessionId: record.sessionId,
    contextSessionIds: [record.sessionId],
    providerOverride: new FakeModelProvider([
      response("response.product.follow-up", [
        { kind: "assistant_message", text: "Confirmed the prior artifact context." },
      ]),
    ]),
    verifierOverride: new FakeTaskVerifier(sha256({ verifier: "follow-up-test" }), () =>
      passingVerification("follow-up verifier passed"),
    ),
    now: new Date("2026-08-03T00:01:00.000Z"),
  });
  assert.equal(followUp.parentSessionId, record.sessionId);
  assert.deepEqual(followUp.contextSessionIds, [record.sessionId]);
  assert.equal(followUp.runtimeTaskHash, sha256({ task: followUpExecutionTask }));
  const summaries = await new FilesystemMemory(
    statePaths.memoryRoot,
    new SystemClock(),
    new RandomIdFactory(),
  ).list(["session_summaries"]);
  assert.equal(summaries.length, 2);
  assert.equal(summaries[0]?.authority, "untrusted_context");
  await assert.rejects(
    () => new ProductSessionStore(statePaths).get("a/../../outside"),
    (error: unknown) => error instanceof HarnessError && error.code === "SCHEMA_INVALID",
  );
  await assert.rejects(() => readFile(path.join(workspace, ".seh", "session.json"), "utf8"));
});

test("selected reasoning and service tier are pinned to a new product session", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "seh-product-profile-"));
  const workspace = path.join(root, "workspace");
  await mkdir(workspace, { recursive: true });
  t.after(async () => rm(root, { recursive: true, force: true }));

  const config = applyProductConfigOverrides(
    defaultProductConfig(workspace, {
      providerKind: "openai",
      model: "gpt-5.6-sol",
    }),
    { reasoningEffort: "xhigh", serviceTier: "priority" },
  );
  const provider = new FakeModelProvider([
    {
      ...response("response.product.profile", [
        { kind: "assistant_message", text: "Profile pinned." },
      ]),
      modelIdentity: "openai:gpt-5.6-sol",
    },
  ]);
  const statePaths = paths(path.join(root, "state"));
  const record = await runCodingAgentTask({
    workspaceRoot: workspace,
    paths: statePaths,
    config,
    task: "Report the selected execution profile.",
    providerOverride: provider,
    verifierOverride: new FakeTaskVerifier(sha256({ verifier: "profile-test" }), () =>
      passingVerification("profile verifier passed"),
    ),
    now: new Date("2026-08-04T03:00:00.000Z"),
  });

  assert.equal(provider.requests[0]?.reasoningEffort, "xhigh");
  assert.deepEqual(record.executionProfile, {
    reasoningEffort: "xhigh",
    serviceTier: "priority",
  });
  assert.deepEqual(
    (await new ProductSessionStore(statePaths).get(record.sessionId)).executionProfile,
    record.executionProfile,
  );
});
