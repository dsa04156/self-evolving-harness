import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  FakeModelProvider,
  FakeTaskVerifier,
  OpenAICompatibleChatProvider,
  applyProductConfigOverrides,
  buildProductModelChoices,
  defaultProductConfig,
  passingVerification,
  runCodingAgentTask,
  sha256,
  type ModelResponse,
  type ProductStatePaths,
} from "../src/index.js";

function paths(stateRoot: string): ProductStatePaths {
  const projectRoot = path.join(stateRoot, "project");
  const sessionsRoot = path.join(projectRoot, "sessions");
  return {
    stateRoot,
    projectId: "openrouter-integration",
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

function openRouterClient(observed: Record<string, unknown>[]) {
  let call = 0;
  return {
    chat: {
      completions: {
        async create(params: Record<string, unknown>) {
          observed.push(params);
          call += 1;
          if (call === 1) {
            return {
              id: "chatcmpl-registry-tool",
              model: "vendor/coder-2026-08-01",
              choices: [{
                index: 0,
                finish_reason: "tool_calls",
                message: {
                  role: "assistant",
                  content: null,
                  refusal: null,
                  tool_calls: [{
                    id: "call-registry-write",
                    type: "function",
                    function: {
                      name: "write",
                      arguments: JSON.stringify({
                        path: "registry-result.txt",
                        content: "registry-to-runtime\n",
                        overwrite: false,
                      }),
                    },
                  }],
                },
              }],
              usage: { prompt_tokens: 40, completion_tokens: 12, total_tokens: 52 },
            };
          }
          return {
            id: "chatcmpl-registry-final",
            model: "vendor/coder-2026-08-01",
            choices: [{
              index: 0,
              finish_reason: "stop",
              message: {
                role: "assistant",
                content: "Created registry-result.txt through the SEH tool loop.",
                refusal: null,
              },
            }],
            usage: { prompt_tokens: 55, completion_tokens: 8, total_tokens: 63 },
          };
        },
      },
    },
  } as unknown as ConstructorParameters<typeof OpenAICompatibleChatProvider>[0];
}

function finalResponse(modelIdentity: string, text: string): ModelResponse {
  return {
    responseId: "response.switched-provider",
    modelIdentity,
    output: [{ kind: "assistant_message", text }],
    usage: {
      inputTokens: 10,
      outputTokens: 4,
      reasoningTokens: 0,
      cachedInputTokens: 0,
      totalTokens: 14,
    },
    providerMetadata: { deterministic: true },
  };
}

test("selected OpenRouter registry row reaches the SEH tool loop and verifier", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "seh-openrouter-registry-"));
  const workspace = path.join(root, "workspace");
  await mkdir(workspace, { recursive: true });
  t.after(async () => rm(root, { recursive: true, force: true }));

  const initial = defaultProductConfig(workspace);
  const choices = buildProductModelChoices({
    provider: initial.provider,
    discoveredByProvider: {
      openrouter: [{ modelId: "vendor/coder", name: "Vendor Coder", description: "tools" }],
    },
  });
  const selected = choices.find(
    (choice) =>
      choice.providerKind === "openrouter" &&
      choice.modelId === "vendor/coder" &&
      choice.source === "discovered",
  );
  assert.ok(selected);
  const config = applyProductConfigOverrides(initial, {
    providerKind: selected.providerKind,
    model: selected.modelId as string,
  });
  assert.deepEqual(config.provider, {
    kind: "openrouter",
    model: "vendor/coder",
    endpoint: "https://openrouter.ai/api/v1",
    requestTimeoutMillis: 600_000,
    reasoningEffort: null,
  });

  const observed: Record<string, unknown>[] = [];
  const adapter = new OpenAICompatibleChatProvider(openRouterClient(observed), {
    providerId: "openrouter",
    apiModel: "vendor/coder",
    modelIdentity: "openrouter:vendor/coder",
    baseUrl: "https://openrouter.ai/api/v1",
  });
  const record = await runCodingAgentTask({
    workspaceRoot: workspace,
    paths: paths(path.join(root, "state")),
    config,
    task: "Create registry-result.txt.",
    executionTask: "Current request: Create registry-result.txt.",
    providerOverride: adapter,
    verifierOverride: new FakeTaskVerifier(sha256({ verifier: "registry-route" }), () =>
      passingVerification("registry route verifier passed"),
    ),
    now: new Date("2026-08-04T00:00:00.000Z"),
  });

  assert.equal(await readFile(path.join(workspace, "registry-result.txt"), "utf8"), "registry-to-runtime\n");
  assert.deepEqual(record.provider, { kind: "openrouter", model: "vendor/coder" });
  assert.deepEqual(record.executionProfile, {
    reasoningEffort: null,
    serviceTier: null,
  });
  assert.equal(record.state, "completed");
  assert.equal(record.result?.verification?.passed, true);
  assert.equal(record.result?.usage.modelCalls, 2);
  assert.equal(record.result?.usage.toolCalls, 1);
  assert.equal(observed.length, 2);
  const secondMessages = observed[1]?.["messages"] as { role: string }[];
  assert.deepEqual(secondMessages.map((message) => message.role), [
    "system",
    "user",
    "assistant",
    "tool",
  ]);
});

test("provider switch applies to a new session without replaying provider-bound history", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "seh-provider-switch-"));
  const workspace = path.join(root, "workspace");
  const statePaths = paths(path.join(root, "state"));
  await mkdir(workspace, { recursive: true });
  t.after(async () => rm(root, { recursive: true, force: true }));

  const openrouter = applyProductConfigOverrides(defaultProductConfig(workspace), {
    providerKind: "openrouter",
    model: "vendor/coder",
  });
  const observed: Record<string, unknown>[] = [];
  const first = await runCodingAgentTask({
    workspaceRoot: workspace,
    paths: statePaths,
    config: openrouter,
    task: "Create the first artifact.",
    executionTask: "Current request: Create the first artifact.",
    providerOverride: new OpenAICompatibleChatProvider(openRouterClient(observed), {
      providerId: "openrouter",
      apiModel: "vendor/coder",
      modelIdentity: "openrouter:vendor/coder",
      baseUrl: "https://openrouter.ai/api/v1",
    }),
    verifierOverride: new FakeTaskVerifier(sha256({ verifier: "before-switch" }), () =>
      passingVerification("first provider verifier passed"),
    ),
    now: new Date("2026-08-04T00:01:00.000Z"),
  });
  assert.equal(first.state, "completed");
  assert.equal(observed.length, 2);

  const ollama = applyProductConfigOverrides(openrouter, {
    providerKind: "ollama",
    model: "switch-target",
  });
  const nextProvider = new FakeModelProvider([
    finalResponse("ollama:switch-target", "Continued from bounded plain-text context."),
  ]);
  const priorAnswer = first.result?.finalText ?? "";
  const second = await runCodingAgentTask({
    workspaceRoot: workspace,
    paths: statePaths,
    config: ollama,
    task: "Continue after switching provider.",
    executionTask: `Prior answer (untrusted text): ${priorAnswer}\nCurrent request: Continue after switching provider.`,
    parentSessionId: first.sessionId,
    contextSessionIds: [first.sessionId],
    providerOverride: nextProvider,
    verifierOverride: new FakeTaskVerifier(sha256({ verifier: "after-switch" }), () =>
      passingVerification("second provider verifier passed"),
    ),
    now: new Date("2026-08-04T00:02:00.000Z"),
  });

  assert.notEqual(second.sessionId, first.sessionId);
  assert.equal(second.parentSessionId, first.sessionId);
  assert.deepEqual(second.provider, { kind: "ollama", model: "switch-target" });
  assert.equal(second.state, "completed");
  assert.equal(nextProvider.requests.length, 1);
  assert.equal(
    nextProvider.requests[0]?.input.some((item) => item.kind === "provider_item"),
    false,
  );
  assert.equal(
    nextProvider.requests[0]?.input.some((item) => item.kind === "tool_output"),
    false,
  );
  assert.equal(
    nextProvider.requests[0]?.input.some(
      (item) => item.kind === "text" && item.content.includes(priorAnswer),
    ),
    true,
  );
});
