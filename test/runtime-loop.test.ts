import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  AgentExecutionLoop,
  ArtifactStore,
  BubblewrapProcessRunner,
  BudgetAccount,
  ContextBuilder,
  DescendantManager,
  DeterministicClock,
  DeterministicIdFactory,
  FakeModelProvider,
  FakeTaskVerifier,
  PrincipalSigner,
  RuntimeEventStream,
  SchemaRegistry,
  SecretRedactor,
  ToolExecutor,
  ToolRegistry,
  WorkspacePathGuard,
  createBashTool,
  passingVerification,
  registerBuiltinTools,
  sha256,
  type BudgetLimits,
  type ModelResponse,
  type SessionPins,
} from "../src/index.js";

const hash = (character: string): string => `sha256:${character.repeat(64)}`;
const protocolId = `protocol-sha256:${"1".repeat(64)}`;
const harnessVersionId = `hv-sha256:${"2".repeat(64)}`;
const snapshotId = `rss-sha256:${"3".repeat(64)}`;

const LIMITS: BudgetLimits = {
  maxModelCalls: 8,
  maxInputTokens: 10_000,
  maxOutputTokens: 10_000,
  maxToolCalls: 8,
  maxWallClockMillis: 100_000,
  maxRetries: 2,
  maxDescendants: 0,
};

function response(
  responseId: string,
  output: ModelResponse["output"],
): ModelResponse {
  return {
    responseId,
    modelIdentity: "fake:model-v1",
    output,
    usage: {
      inputTokens: 10,
      outputTokens: 5,
      reasoningTokens: 0,
      cachedInputTokens: 0,
      totalTokens: 15,
    },
    providerMetadata: { deterministic: true },
  };
}

async function temporaryDirectory(t: test.TestContext): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "seh-runtime-"));
  t.after(async () => {
    await rm(directory, { recursive: true, force: true });
  });
  return directory;
}

test("standalone loop performs model → tool → model → verifier deterministically", async (t) => {
  const root = await temporaryDirectory(t);
  const workspaceRoot = path.join(root, "workspace");
  const schemas = await SchemaRegistry.load(path.resolve("schemas"));
  const clock = new DeterministicClock();
  const ids = new DeterministicIdFactory();
  const signer = PrincipalSigner.generate({
    principalId: "runtime.loop",
    role: "runtime",
    implementationDigest: hash("4"),
    instanceId: "runtime.loop.instance",
  });
  const pins: SessionPins = {
    protocolId,
    harnessVersionId,
    runtimeStateSnapshotId: snapshotId,
    modelIdentityHash: hash("5"),
    permissionPolicyHash: hash("6"),
    safetyPolicyHash: hash("7"),
    budgetPolicyHash: hash("8"),
    budgetAccountId: "budget.loop.1",
    datasetPermissions: ["deterministic"],
  };
  const workspace = new WorkspacePathGuard(workspaceRoot);
  await workspace.initialize();
  const processRunner = new BubblewrapProcessRunner(workspaceRoot, {
    timeoutMillis: 2_000,
    maxOutputBytes: 64 * 1024,
    maxCommandBytes: 32 * 1024,
    environment: {},
  });
  await processRunner.initialize();
  const artifacts = new ArtifactStore(path.join(root, "artifacts"));
  await artifacts.initialize();
  const budget = new BudgetAccount(LIMITS, clock);
  const registry = new ToolRegistry();
  const implementations = registerBuiltinTools((tool) => registry.register(tool));
  registry.seal();
  const descriptions = implementations.map((tool) => ({
    toolId: tool.toolId,
    name: tool.name,
    description: `Deterministic ${tool.name} implementation.`,
    implementationHash: tool.implementationHash,
    inputSchemaHash: sha256(tool.inputSchema),
  }));
  const toolExecutor = new ToolExecutor({
    registry,
    permissions: {
      policyHash: pins.permissionPolicyHash,
      allowedToolIds: implementations.map((tool) => tool.toolId),
    },
    budget,
    artifacts,
    context: { workspace, processRunner },
    clock,
  });
  const events = new RuntimeEventStream({
    root: path.join(root, "events"),
    sessionId: "session.loop.1",
    pins,
    producer: signer.identity,
    clock,
    ids,
    schemas,
    redactor: new SecretRedactor({ test_secret: "do-not-record" }),
  });
  const provider = new FakeModelProvider([
    response("response-1", [
      {
        kind: "tool_call",
        callId: "call-write-1",
        toolName: "write",
        arguments: {
          path: "answer.txt",
          content: "done\n",
          overwrite: false,
        },
        rawArguments: '{"path":"answer.txt","content":"done\\n","overwrite":false}',
      },
    ]),
    response("response-2", [
      {
        kind: "assistant_message",
        text: "The file has been created and verified.",
      },
    ]),
  ]);
  const verifier = new FakeTaskVerifier(hash("9"), async ({ workspaceRoot: verifierRoot }) => {
    assert.equal(await readFile(path.join(verifierRoot, "answer.txt"), "utf8"), "done\n");
    return passingVerification();
  });
  const loop = new AgentExecutionLoop({
    configuration: {
      sessionId: "session.loop.1",
      pins,
      modelIdentity: "fake:model-v1",
      maxOutputTokensPerCall: 512,
      workspaceRoot,
      prompt: {
        sections: [
          {
            sectionId: "identity",
            purpose: "identity",
            content: "You are a deterministic coding agent.",
          },
        ],
      },
      skills: [],
      toolDescriptions: descriptions,
    },
    provider,
    tools: registry,
    toolExecutor,
    context: new ContextBuilder({
      totalTokenLimit: 4096,
      sources: [
        { source: "system_prompt", priority: 100, maxTokens: 1024, selection: "all_in_order" },
        { source: "task_input", priority: 90, maxTokens: 1024, selection: "all_in_order" },
        { source: "tool_catalog", priority: 80, maxTokens: 1024, selection: "all_in_order" },
      ],
      overflowPolicy: "block",
    }),
    verifier,
    events,
    budget,
    clock,
    ids,
    runtimeIdentity: signer.identity,
  });

  const result = await loop.run("Create answer.txt containing done.");
  assert.equal(result.state, "completed");
  assert.equal(result.verification?.passed, true);
  assert.equal(result.usage.modelCalls, 2);
  assert.equal(result.usage.toolCalls, 1);
  assert.equal(provider.requests.length, 2);
  assert.equal(await readFile(path.join(workspaceRoot, "answer.txt"), "utf8"), "done\n");
  assert.ok(result.eventCount >= 10);
  assert.match(result.eventHeadHash, /^sha256:[a-f0-9]{64}$/u);
});

test("bash tool runs in a no-network filesystem sandbox", async (t) => {
  const root = await temporaryDirectory(t);
  const workspace = new WorkspacePathGuard(root);
  await workspace.initialize();
  const runner = new BubblewrapProcessRunner(root, {
    timeoutMillis: 2_000,
    maxOutputBytes: 64 * 1024,
    maxCommandBytes: 32 * 1024,
    environment: {},
  });
  await runner.initialize();
  const result = await createBashTool().execute(
    {
      command:
        "test \"$(pwd)\" = /workspace && test ! -e /home/jinuk/.ssh && test ! -e /root/.ssh && echo isolated",
    },
    { workspace, processRunner: runner },
  );
  assert.deepEqual(result, {
    exitCode: 0,
    signal: null,
    stdout: "isolated\n",
    stderr: "",
    timedOut: false,
  });
});

test("descendants inherit pins and cannot widen budget or permissions", async (t) => {
  const root = await temporaryDirectory(t);
  const workspace = new WorkspacePathGuard(root);
  await workspace.initialize();
  const runner = new BubblewrapProcessRunner(root, {
    timeoutMillis: 2_000,
    maxOutputBytes: 64 * 1024,
    maxCommandBytes: 32 * 1024,
    environment: {},
  });
  await runner.initialize();
  const artifacts = new ArtifactStore(path.join(root, "artifacts"));
  await artifacts.initialize();
  const clock = new DeterministicClock();
  const pins: SessionPins = {
    protocolId,
    harnessVersionId,
    runtimeStateSnapshotId: snapshotId,
    modelIdentityHash: hash("5"),
    permissionPolicyHash: hash("6"),
    safetyPolicyHash: hash("7"),
    budgetPolicyHash: hash("8"),
    budgetAccountId: "budget.descendants.1",
    datasetPermissions: ["deterministic"],
  };
  const limits: BudgetLimits = { ...LIMITS, maxDescendants: 2 };
  const manager = new DescendantManager({
    root,
    parentSessionId: "session.descendants.1",
    pins,
    parentLimits: limits,
    permissionCeiling: ["filesystem.read", "shell.bash"],
    parentBudget: new BudgetAccount(limits, clock),
    runner,
    artifacts,
    clock,
    ids: new DeterministicIdFactory(),
  });
  await assert.rejects(
    manager.startBackendJob({
      command: "true",
      budgetSlice: { ...limits, maxModelCalls: limits.maxModelCalls + 1 },
    }),
    /exceeds its parent/u,
  );
  await assert.rejects(
    manager.spawnSubagent({
      task: "forbidden",
      budgetSlice: { ...limits, maxDescendants: 0 },
      permissionToolIds: ["filesystem.write"],
      executor: async () => {
        throw new Error("must not execute");
      },
    }),
    /permission ceiling/u,
  );
  const job = await manager.startBackendJob({
    command: "printf job-ok",
    budgetSlice: {
      ...limits,
      maxModelCalls: 0,
      maxInputTokens: 0,
      maxOutputTokens: 0,
      maxToolCalls: 1,
      maxRetries: 0,
      maxDescendants: 0,
    },
  });
  const completed = await manager.wait(job.descendantId);
  assert.equal(completed.state, "completed");
  const records = await manager.records(job.descendantId);
  assert.deepEqual(records.at(-1)?.pins, pins);
  assert.equal(records.at(-1)?.artifactHash?.startsWith("sha256:"), true);
});
