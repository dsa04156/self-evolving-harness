import { access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { sha256, type JsonValue } from "../core/canonical.js";
import { RandomIdFactory, SystemClock } from "../core/determinism.js";
import { HarnessError, asHarnessError, assertCondition } from "../core/errors.js";
import { SchemaRegistry } from "../contracts/schema-registry.js";
import type { ModelProvider } from "../domain/model.js";
import type { RuntimeEvent } from "../evidence/runtime-events.js";
import { OllamaProvider } from "../providers/ollama-provider.js";
import { OpenAICompatibleChatProvider } from "../providers/openai-compatible-chat-provider.js";
import { OpenAIResponsesProvider } from "../providers/openai-responses-provider.js";
import { createManagedStandaloneRuntime } from "../runtime/managed.js";
import { CodingTaskVerifier } from "../runtime/coding-verifier.js";
import type { DeclarativeSkill } from "../runtime/skills.js";
import type { TaskVerifier } from "../runtime/verifier.js";
import { PrincipalSigner } from "../trust/identity.js";
import type { ProductConfig, ProductStatePaths } from "./config.js";
import {
  PRODUCT_RUNTIME_VERSION,
  allowedToolIds,
  codingContextPolicy,
  codingPrompt,
  codingSkill,
  codingToolDescriptions,
} from "./defaults.js";
import {
  ProductSessionStore,
  createProductSessionId,
  type ProductSessionRecord,
} from "./session-store.js";

export interface CodingAgentRunOptions {
  readonly workspaceRoot: string;
  readonly paths: ProductStatePaths;
  readonly config: ProductConfig;
  readonly task: string;
  /** Optional bounded thread context sent to the model while `task` stays human-facing. */
  readonly executionTask?: string;
  readonly contextSessionIds?: readonly string[];
  readonly parentSessionId?: string | null;
  readonly providerOverride?: ModelProvider;
  readonly verifierOverride?: TaskVerifier;
  readonly additionalSkills?: readonly DeclarativeSkill[];
  readonly onEvent?: (event: RuntimeEvent) => void | Promise<void>;
  readonly abortSignal?: AbortSignal;
  readonly now?: Date;
}

interface ProviderBinding {
  readonly provider: ModelProvider;
  readonly modelIdentity: string;
  readonly secrets: Readonly<Record<string, string>>;
}

function contentId(prefix: "protocol-sha256" | "hv-sha256" | "rss-sha256", value: JsonValue): string {
  return `${prefix}:${sha256(value).slice("sha256:".length)}`;
}

async function schemasPath(): Promise<string> {
  const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
  const configured = process.env["SEH_SCHEMAS_DIR"];
  const candidates = [
    ...(configured === undefined ? [] : [path.resolve(configured)]),
    path.resolve(moduleDirectory, "../../schemas"),
    path.resolve(moduleDirectory, "../../../schemas"),
  ];
  for (const candidate of candidates) {
    try {
      await access(path.join(candidate, "common.schema.json"));
      return candidate;
    } catch {
      // Try the next source/dist layout.
    }
  }
  throw new HarnessError(
    "ARTIFACT_UNAVAILABLE",
    "Cannot locate bundled schemas; reinstall the seh package or set SEH_SCHEMAS_DIR",
  );
}

function createProvider(config: ProductConfig): ProviderBinding {
  if (config.provider.kind === "ollama") {
    const modelIdentity = `ollama:${config.provider.model}`;
    return {
      provider: new OllamaProvider({
        model: config.provider.model,
        modelIdentity,
        baseUrl: config.provider.endpoint,
        requestTimeoutMillis: config.provider.requestTimeoutMillis,
      }),
      modelIdentity,
      secrets: {},
    };
  }
  if (config.provider.kind === "openrouter") {
    const apiKey = process.env["OPENROUTER_API_KEY"] ?? "";
    if (apiKey.length === 0) {
      throw new HarnessError(
        "AUTHENTICATION_FAILED",
        "OPENROUTER_API_KEY is not set. Select OpenAI with /model, or use Ollama for the no-key local path.",
      );
    }
    const modelIdentity = `openrouter:${config.provider.model}`;
    return {
      provider: OpenAICompatibleChatProvider.fromApiKey(apiKey, {
        providerId: "openrouter",
        apiModel: config.provider.model,
        modelIdentity,
        baseUrl: config.provider.endpoint,
        requestTimeoutMillis: config.provider.requestTimeoutMillis,
        defaultHeaders: {
          "X-OpenRouter-Title": "Self-Evolving Harness",
        },
      }),
      modelIdentity,
      secrets: { OPENROUTER_API_KEY: apiKey },
    };
  }
  const apiKey = process.env["OPENAI_API_KEY"] ?? "";
  if (apiKey.length === 0) {
    throw new HarnessError(
      "AUTHENTICATION_FAILED",
      "OPENAI_API_KEY is not set. Select OpenRouter with /model, or use Ollama for the no-key local path.",
    );
  }
  const modelIdentity = `openai:${config.provider.model}`;
  return {
    provider: OpenAIResponsesProvider.fromApiKey(apiKey, {
      apiModel: config.provider.model,
      modelIdentity,
      serviceTier: config.provider.serviceTier,
    }),
    modelIdentity,
    secrets: { OPENAI_API_KEY: apiKey },
  };
}

function principals(sessionId: string, modelIdentityHash: string): {
  readonly runtime: PrincipalSigner;
  readonly operations: PrincipalSigner;
  readonly audit: PrincipalSigner;
} {
  const implementationDigest = sha256({ productRuntime: PRODUCT_RUNTIME_VERSION });
  return {
    runtime: PrincipalSigner.generate({
      principalId: `runtime.${sessionId}`,
      role: "runtime",
      implementationDigest,
      instanceId: `runtime.${sessionId}.instance`,
      modelIdentityHash,
    }),
    operations: PrincipalSigner.generate({
      principalId: `operations.${sessionId}`,
      role: "operations_owner",
      implementationDigest,
      instanceId: `operations.${sessionId}.instance`,
    }),
    audit: PrincipalSigner.generate({
      principalId: `audit.${sessionId}`,
      role: "audit_store",
      implementationDigest,
      instanceId: `audit.${sessionId}.instance`,
    }),
  };
}

function safeFailureFromEvents(events: readonly RuntimeEvent[]): {
  readonly code: string;
  readonly detail: string;
} | null {
  const failure = [...events]
    .reverse()
    .find((event) => event.eventType === "runtime_failure_observed");
  if (failure === undefined) return null;
  const code = failure.payload["code"];
  const detail = failure.payload["detail"];
  return {
    code: typeof code === "string" ? code : "RUNTIME_FAILURE",
    detail: typeof detail === "string" ? detail : "The runtime blocked without a safe detail.",
  };
}

function sessionSummary(record: ProductSessionRecord): string {
  const finalText = record.result?.finalText ?? "No final answer was produced.";
  return [
    `Session ${record.sessionId}`,
    `Task: ${record.task.slice(0, 2_000)}`,
    `State: ${record.state}`,
    `Result: ${finalText.slice(0, 4_000)}`,
  ].join("\n");
}

export async function runCodingAgentTask(
  options: CodingAgentRunOptions,
): Promise<ProductSessionRecord> {
  const task = options.task.trim();
  const executionTask = (options.executionTask ?? task).trim();
  if (task.length === 0) {
    throw new HarnessError("SCHEMA_INVALID", "Task is empty");
  }
  if (
    Buffer.byteLength(task, "utf8") > 256 * 1024 ||
    Buffer.byteLength(executionTask, "utf8") > 256 * 1024
  ) {
    throw new HarnessError("PAYLOAD_TOO_LARGE", "Task exceeds 256 KiB");
  }
  const clock = new SystemClock();
  const ids = new RandomIdFactory();
  const sessionId = createProductSessionId(options.now);
  const store = new ProductSessionStore(options.paths);
  let record = await store.create({
    sessionId,
    ...(options.parentSessionId === undefined
      ? {}
      : { parentSessionId: options.parentSessionId }),
    workspaceRoot: options.workspaceRoot,
    task,
    runtimeTaskHash: sha256({ task: executionTask }),
    contextSessionIds: options.contextSessionIds ?? [],
    provider: options.config.provider,
    activeSkillIds: (options.additionalSkills ?? []).map((skill) => skill.skillId),
    permissionMode: options.config.permissionMode,
    verificationCommands: options.config.verification.commands,
    createdAt: (options.now ?? new Date()).toISOString(),
  });

  try {
    const binding =
      options.providerOverride === undefined
        ? createProvider(options.config)
        : {
            provider: options.providerOverride,
            modelIdentity: `${options.config.provider.kind}:${options.config.provider.model}`,
            secrets: {},
          };
    const modelIdentityHash = sha256({ modelIdentity: binding.modelIdentity });
    const coordinationEnabled = options.config.budget.maxDescendants > 0;
    const prompt = codingPrompt(options.config.permissionMode, coordinationEnabled);
    const skill = codingSkill(options.config.permissionMode, coordinationEnabled);
    const toolDescriptions = codingToolDescriptions(
      options.config.permissionMode,
      coordinationEnabled,
    );
    const contextPolicy = codingContextPolicy(options.config.contextTokenLimit);
    const grantedToolIds = allowedToolIds(
      options.config.permissionMode,
      coordinationEnabled,
    );
    const skills = [skill, ...(options.additionalSkills ?? [])];
    assertCondition(
      new Set(skills.map((candidate) => candidate.skillId)).size === skills.length,
      "CONFLICT",
      "Active skills contain a duplicate skill ID",
    );
    assertCondition(
      skills.every((candidate) =>
        candidate.allowedToolIds.every((toolId) => grantedToolIds.includes(toolId)),
      ),
      "AUTHORIZATION_DENIED",
      "An active skill requests a tool outside the session grant",
    );
    const protocolId = contentId("protocol-sha256", {
      protocol: PRODUCT_RUNTIME_VERSION,
      sessionContract: 1,
    });
    const harnessVersionId = contentId("hv-sha256", {
      productRuntime: PRODUCT_RUNTIME_VERSION,
      prompt,
      skills,
      toolDescriptions,
      contextPolicy,
      provider: options.config.provider,
    } as unknown as JsonValue);
    const runtimeStateSnapshotId = contentId("rss-sha256", {
      harnessVersionId,
      modelIdentityHash,
      permissionMode: options.config.permissionMode,
      budget: options.config.budget,
      workspaceRoot: options.workspaceRoot,
      verification: options.config.verification,
    } as unknown as JsonValue);
    const permissionPolicyHash = sha256({
      mode: options.config.permissionMode,
      allowedToolIds: grantedToolIds,
      workspaceRoot: options.workspaceRoot,
      shellNetwork: false,
    });
    const safetyPolicyHash = sha256({
      policy: "workspace-only-no-network-no-host-secrets-v1",
      stateOutsideWorkspace: true,
    });
    const budgetPolicyHash = sha256(options.config.budget as unknown as JsonValue);
    const signers = principals(sessionId, modelIdentityHash);
    const verifier =
      options.verifierOverride ??
      (await CodingTaskVerifier.create({
        workspaceRoot: options.workspaceRoot,
        commands: options.config.verification.commands,
        timeoutMillis: options.config.verification.timeoutMillis,
        maxOutputBytes: options.config.verification.maxOutputBytes,
        maxCommandBytes: options.config.process.maxCommandBytes,
        secrets: binding.secrets,
      }));
    const schemas = await SchemaRegistry.load(await schemasPath());
    const runtime = await createManagedStandaloneRuntime({
      root: options.paths.sessionRuntimeRoot(sessionId),
      workspaceRoot: options.workspaceRoot,
      memoryRoot: options.paths.memoryRoot,
      schemas,
      provider: binding.provider,
      verifier,
      sessionId,
      pins: {
        protocolId,
        harnessVersionId,
        runtimeStateSnapshotId,
        modelIdentityHash,
        permissionPolicyHash,
        safetyPolicyHash,
        budgetPolicyHash,
        budgetAccountId: `budget.${sessionId}`,
        datasetPermissions: ["user_workspace"],
      },
      modelIdentity: binding.modelIdentity,
      ...(options.config.provider.reasoningEffort === null
        ? {}
        : { reasoningEffort: options.config.provider.reasoningEffort }),
      runtimeSigner: signers.runtime,
      operationsSigner: signers.operations,
      auditSigner: signers.audit,
      budgetLimits: options.config.budget,
      clock,
      ids,
      prompt,
      contextPolicy,
      skills,
      toolDescriptions,
      allowedToolIds: grantedToolIds,
      memoryPolicy: {
        readableNamespaces: [
          "project_facts",
          "user_preferences",
          "accepted_lessons",
          "session_summaries",
        ],
        queryMode: "fixed_hybrid",
        hybridLexicalWeightMicros: 750_000,
        maxRecords: 12,
        maxTokens: 4_096,
        minimumScoreMicros: 1,
        tieBreak: "created_at_then_record_id",
      },
      secrets: binding.secrets,
      processLimits: options.config.process,
      ...(options.onEvent === undefined ? {} : { onEvent: options.onEvent }),
    });

    record = await store.update(sessionId, (previous) => ({
      ...coreWithoutHash(previous),
      state: "running",
      updatedAt: new Date().toISOString(),
    }));

    let interrupt: Promise<unknown> | null = null;
    const onAbort = (): void => {
      if (interrupt !== null) return;
      interrupt = runtime.operations.interrupt(sessionId).catch(() => undefined);
    };
    const execution = await (async () => {
      options.abortSignal?.addEventListener("abort", onAbort, { once: true });
      try {
        const executionPromise = runtime.execute(executionTask);
        if (options.abortSignal?.aborted === true) onAbort();
        const result = await executionPromise;
        if (interrupt !== null) await interrupt;
        return result;
      } finally {
        options.abortSignal?.removeEventListener("abort", onAbort);
      }
    })();
    await runtime.verify();
    const events = await runtime.kernel.events.events();
    const lifecycleState = execution.finalize?.state ?? execution.submit.state;
    const productState = execution.result.state;
    record = await store.update(sessionId, (previous) => ({
      ...coreWithoutHash(previous),
      state: productState,
      updatedAt: new Date().toISOString(),
      result: {
        state: execution.result.state,
        finalText: execution.result.finalText,
        verification: execution.result.verification,
        usage: execution.result.usage,
        modelUsage: execution.result.modelUsage,
        eventHeadHash: execution.result.eventHeadHash,
        eventCount: execution.result.eventCount,
        lifecycleState,
        terminationReason: execution.result.terminationReason ?? null,
        protocolId,
        harnessVersionId,
        runtimeStateSnapshotId,
      },
      failure:
        execution.result.state === "completed" ? null : safeFailureFromEvents(events),
    }));
    await runtime.kernel.memory.write({
      namespace: "session_summaries",
      content: sessionSummary(record),
      authority: "untrusted_context",
      producerId: signers.runtime.identity.principalId,
      sourceEventIds: events.slice(-8).map((event) => event.eventId),
    });
    return record;
  } catch (error) {
    const failure = asHarnessError(error);
    record = await store.update(sessionId, (previous) => ({
      ...coreWithoutHash(previous),
      state: "failed",
      updatedAt: new Date().toISOString(),
      failure: { code: failure.code, detail: failure.safeDetail },
    }));
    throw new HarnessError(failure.code, `${failure.safeDetail} (session ${record.sessionId})`, {
      retryable: failure.retryable,
      cause: error,
    });
  }
}

function coreWithoutHash(
  record: ProductSessionRecord,
): Omit<ProductSessionRecord, "metadataHash"> {
  const { metadataHash: _metadataHash, ...core } = record;
  return core;
}
