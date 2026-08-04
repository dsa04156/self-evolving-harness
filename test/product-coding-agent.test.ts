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
  productSkillCatalog,
  runCodingAgentTask,
  selectProductSkills,
  sha256,
  type ModelProvider,
  type ModelRequest,
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
  assert.match(record.result?.harnessVersionId ?? "", /^hv-sha256:[a-f0-9]{64}$/u);
  assert.match(record.result?.runtimeStateSnapshotId ?? "", /^rss-sha256:[a-f0-9]{64}$/u);
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

test("product runtime delegates a bounded subtask and returns child evidence to the parent", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "seh-product-subagent-"));
  const workspace = path.join(root, "workspace");
  await mkdir(workspace, { recursive: true });
  t.after(async () => rm(root, { recursive: true, force: true }));

  let parentCalls = 0;
  let childCalls = 0;
  const requests: ModelRequest[] = [];
  const provider: ModelProvider = {
    providerId: "fake-coordination-provider",
    async generate(request): Promise<ModelResponse> {
      requests.push(request);
      const child = request.instructions.includes("bounded child agent");
      if (child) {
        childCalls += 1;
        return response(`response.child.${childCalls}`, [
          {
            kind: "assistant_message",
            text: "Child inspected the delegated scope and found no blocking issue.",
          },
        ]);
      }
      parentCalls += 1;
      if (parentCalls === 1) {
        return response("response.parent.spawn", [
          {
            kind: "tool_call",
            callId: "call.parent.spawn",
            toolName: "spawn_agent",
            arguments: { task: "Inspect the repository independently and report one finding." },
            rawArguments:
              '{"task":"Inspect the repository independently and report one finding."}',
          },
        ]);
      }
      const latestToolOutput = [...request.input]
        .reverse()
        .find((item) => item.kind === "tool_output");
      assert.ok(latestToolOutput !== undefined);
      assert.equal(
        typeof latestToolOutput.output === "object" && latestToolOutput.output !== null,
        true,
      );
      const output = latestToolOutput.output as Record<string, unknown>;
      if (parentCalls === 2) {
        assert.equal(output["kind"], "subagent");
        assert.equal(typeof output["id"], "string");
        return response("response.parent.wait", [
          {
            kind: "tool_call",
            callId: "call.parent.wait",
            toolName: "wait_job",
            arguments: { id: output["id"] as string },
            rawArguments: JSON.stringify({ id: output["id"] }),
          },
        ]);
      }
      assert.equal(output["state"], "completed");
      const childResult = output["result"] as Record<string, unknown>;
      assert.equal(childResult["finalText"], "Child inspected the delegated scope and found no blocking issue.");
      return response("response.parent.done", [
        {
          kind: "assistant_message",
          text: "Integrated the completed child-agent evidence.",
        },
      ]);
    },
  };

  const statePaths = paths(path.join(root, "state"));
  const record = await runCodingAgentTask({
    workspaceRoot: workspace,
    paths: statePaths,
    config: defaultProductConfig(workspace, {
      providerKind: "ollama",
      model: "test-coder",
    }),
    task: "Use a child agent to inspect the repository and integrate its evidence.",
    providerOverride: provider,
    verifierOverride: new FakeTaskVerifier(sha256({ verifier: "subagent-test" }), () =>
      passingVerification("parent and child verification passed"),
    ),
    now: new Date("2026-08-04T04:00:00.000Z"),
  });

  assert.equal(record.state, "completed");
  assert.equal(record.result?.finalText, "Integrated the completed child-agent evidence.");
  assert.equal(record.result?.usage.descendants, 1);
  assert.equal(parentCalls, 3);
  assert.equal(childCalls, 1);
  assert.equal(
    requests[0]?.tools.some((tool) => tool.name === "spawn_agent"),
    true,
  );
  assert.equal(
    requests.find((request) => request.instructions.includes("bounded child agent"))?.tools
      .some((tool) => tool.name === "spawn_agent"),
    false,
  );
});

test("selected workflow skills enter model context and immutable session metadata", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "seh-product-skill-"));
  const workspace = path.join(root, "workspace");
  await mkdir(workspace, { recursive: true });
  t.after(async () => rm(root, { recursive: true, force: true }));

  const selected = selectProductSkills(["review", "parallel-research"], "workspace-write", true);
  const provider = new FakeModelProvider([
    (request) => {
      assert.match(request.instructions, /Skill review:/u);
      assert.match(request.instructions, /Skill parallel-research:/u);
      return response("response.product.skills", [
        { kind: "assistant_message", text: "Applied the selected workflow skills." },
      ]);
    },
  ]);
  const statePaths = paths(path.join(root, "state"));
  const record = await runCodingAgentTask({
    workspaceRoot: workspace,
    paths: statePaths,
    config: defaultProductConfig(workspace, {
      providerKind: "ollama",
      model: "test-coder",
    }),
    task: "Review the current repository structure.",
    additionalSkills: selected,
    providerOverride: provider,
    verifierOverride: new FakeTaskVerifier(sha256({ verifier: "skill-test" }), () =>
      passingVerification("skill context verified"),
    ),
    now: new Date("2026-08-04T05:00:00.000Z"),
  });

  assert.deepEqual(record.activeSkillIds, ["parallel-research", "review"]);
  assert.deepEqual(
    (await new ProductSessionStore(statePaths).get(record.sessionId)).activeSkillIds,
    ["parallel-research", "review"],
  );
  const readOnlyDebug = productSkillCatalog("read-only", true).find(
    (skill) => skill.skillId === "debug",
  );
  assert.ok(readOnlyDebug !== undefined);
  assert.equal(readOnlyDebug.allowedToolIds.includes("shell.bash"), false);
  assert.equal(
    productSkillCatalog("workspace-write", false).some(
      (skill) => skill.skillId === "parallel-research",
    ),
    false,
  );
});

test("product runtime owns background shell jobs and returns sandbox evidence", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "seh-product-job-"));
  const workspace = path.join(root, "workspace");
  await mkdir(workspace, { recursive: true });
  t.after(async () => rm(root, { recursive: true, force: true }));

  let call = 0;
  const provider: ModelProvider = {
    providerId: "fake-job-provider",
    async generate(request): Promise<ModelResponse> {
      call += 1;
      if (call === 1) {
        assert.equal(request.tools.some((tool) => tool.name === "start_job"), true);
        return response("response.job.start", [
          {
            kind: "tool_call",
            callId: "call.job.start",
            toolName: "start_job",
            arguments: { command: "printf 'job-ok\\n' > background.txt" },
            rawArguments: '{"command":"printf \'job-ok\\n\' > background.txt"}',
          },
        ]);
      }
      const latest = [...request.input].reverse().find((item) => item.kind === "tool_output");
      assert.ok(latest !== undefined);
      const output = latest.output as Record<string, unknown>;
      if (call === 2) {
        assert.equal(output["kind"], "backend_job");
        return response("response.job.wait", [
          {
            kind: "tool_call",
            callId: "call.job.wait",
            toolName: "wait_job",
            arguments: { id: output["id"] as string },
            rawArguments: JSON.stringify({ id: output["id"] }),
          },
        ]);
      }
      assert.equal(output["state"], "completed");
      assert.equal((output["result"] as Record<string, unknown>)["exitCode"], 0);
      return response("response.job.done", [
        { kind: "assistant_message", text: "Background job completed in the sandbox." },
      ]);
    },
  };
  const record = await runCodingAgentTask({
    workspaceRoot: workspace,
    paths: paths(path.join(root, "state")),
    config: defaultProductConfig(workspace, {
      providerKind: "ollama",
      model: "test-coder",
    }),
    task: "Run the requested background command and wait for its evidence.",
    providerOverride: provider,
    verifierOverride: new FakeTaskVerifier(sha256({ verifier: "job-test" }), () =>
      passingVerification("backend job verified"),
    ),
    now: new Date("2026-08-04T06:00:00.000Z"),
  });

  assert.equal(record.state, "completed");
  assert.equal(record.result?.usage.descendants, 1);
  assert.equal(await readFile(path.join(workspace, "background.txt"), "utf8"), "job-ok\n");
});
