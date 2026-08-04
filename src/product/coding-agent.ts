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
import type {
  ProductConfig,
  ProductProviderConfig,
  ProductStatePaths,
} from "./config.js";
import { PRODUCT_RUNTIME_VERSION } from "./defaults.js";
import {
  PRODUCT_RUNTIME_CONTRACT_HASH,
  ProductHarnessRegistry,
} from "./harness-registry.js";
import { bundledSchemasPath } from "./resources.js";
import {
  ProductSessionStore,
  createProductSessionId,
  type ProductHarnessSelection,
  type ProductSessionLineageKind,
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
  readonly lineageKind?: ProductSessionLineageKind;
  readonly pinnedHarnessVersionId?: string;
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

function createProvider(provider: ProductProviderConfig): ProviderBinding {
  if (provider.kind === "ollama") {
    const modelIdentity = `ollama:${provider.model}`;
    return {
      provider: new OllamaProvider({
        model: provider.model,
        modelIdentity,
        baseUrl: provider.endpoint,
        requestTimeoutMillis: provider.requestTimeoutMillis,
      }),
      modelIdentity,
      secrets: {},
    };
  }
  if (provider.kind === "openrouter") {
    const apiKey = process.env["OPENROUTER_API_KEY"] ?? "";
    if (apiKey.length === 0) {
      throw new HarnessError(
        "AUTHENTICATION_FAILED",
        "OPENROUTER_API_KEY is not set. Select OpenAI with /model, or use Ollama for the no-key local path.",
      );
    }
    const modelIdentity = `openrouter:${provider.model}`;
    return {
      provider: OpenAICompatibleChatProvider.fromApiKey(apiKey, {
        providerId: "openrouter",
        apiModel: provider.model,
        modelIdentity,
        baseUrl: provider.endpoint,
        requestTimeoutMillis: provider.requestTimeoutMillis,
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
  const modelIdentity = `openai:${provider.model}`;
  return {
    provider: OpenAIResponsesProvider.fromApiKey(apiKey, {
      apiModel: provider.model,
      modelIdentity,
      serviceTier: provider.serviceTier,
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
  const parentSessionId = options.parentSessionId ?? null;
  const parent = parentSessionId === null ? null : await store.get(parentSessionId);
  if (parent !== null) {
    assertCondition(
      parent.workspaceRoot === options.workspaceRoot,
      "AUTHORIZATION_DENIED",
      "A continued session cannot cross workspace boundaries",
    );
  }
  const lineageKind = options.lineageKind ?? (parent === null ? "root" : "resume");
  assertCondition(
    (parent === null && lineageKind === "root") ||
      (parent !== null && (lineageKind === "resume" || lineageKind === "fork")),
    "SCHEMA_INVALID",
    "Session lineage does not match its parent",
  );
  const harnessRegistry = await ProductHarnessRegistry.open(options.paths);
  let harnessSelection: ProductHarnessSelection;
  let materialized;
  if (parent?.harnessVersionId !== undefined) {
    assertCondition(
      options.pinnedHarnessVersionId === undefined ||
        options.pinnedHarnessVersionId === parent.harnessVersionId,
      "AUTHORIZATION_DENIED",
      "Resume and fork must inherit the parent's exact HarnessVersion",
    );
    materialized = await harnessRegistry.resolve(parent.harnessVersionId);
    harnessSelection = "inherited";
  } else if (options.pinnedHarnessVersionId !== undefined) {
    materialized = await harnessRegistry.resolve(options.pinnedHarnessVersionId);
    harnessSelection = "explicit";
  } else {
    materialized = await harnessRegistry.materialize(
      options.config,
      options.additionalSkills ?? [],
    );
    harnessSelection = parent === null ? "current" : "legacy-current";
  }
  const harnessManifest = materialized.manifest;
  const executionConfig = materialized.execution;
  const threadId =
    lineageKind === "resume"
      ? (parent?.threadId ?? `thread.${parentSessionId!}`)
      : `thread.${sessionId}`;
  const forkedFromThreadId =
    lineageKind === "fork"
      ? (parent?.threadId ?? `thread.${parentSessionId!}`)
      : null;
  let record = await store.create({
    sessionId,
    parentSessionId,
    lineageKind,
    threadId,
    forkedFromThreadId,
    workspaceRoot: options.workspaceRoot,
    task,
    runtimeTaskHash: sha256({ task: executionTask }),
    contextSessionIds: options.contextSessionIds ?? [],
    provider: executionConfig.provider,
    activeSkillIds: executionConfig.skills
      .map((skill) => skill.skillId)
      .filter((skillId) => skillId !== "repository_task"),
    permissionMode: executionConfig.permissionMode,
    verificationCommands: executionConfig.verification.commands,
    harnessVersionId: harnessManifest.harnessVersionId,
    harnessManifestHash: harnessManifest.manifestHash,
    harnessClosureHash: harnessManifest.identity.behaviorClosure.closureHash,
    runtimeContractHash: harnessManifest.identity.requiredRuntimeContractHash,
    harnessSelection,
    createdAt: (options.now ?? new Date()).toISOString(),
  });

  try {
    const binding =
      options.providerOverride === undefined
        ? createProvider(executionConfig.provider)
        : {
            provider: options.providerOverride,
            modelIdentity: `${executionConfig.provider.kind}:${executionConfig.provider.model}`,
            secrets: {},
          };
    const modelIdentityHash = sha256({ modelIdentity: binding.modelIdentity });
    const protocolId = contentId("protocol-sha256", {
      protocol: PRODUCT_RUNTIME_VERSION,
      runtimeContractHash: PRODUCT_RUNTIME_CONTRACT_HASH,
      sessionContract: 2,
    });
    const harnessVersionId = harnessManifest.harnessVersionId;
    const runtimeStateSnapshotId = contentId("rss-sha256", {
      harnessVersionId,
      harnessManifestHash: harnessManifest.manifestHash,
      harnessClosureHash: harnessManifest.identity.behaviorClosure.closureHash,
      modelIdentityHash,
      permissionMode: executionConfig.permissionMode,
      budget: executionConfig.budget,
      workspaceRoot: options.workspaceRoot,
      verification: executionConfig.verification,
    } as unknown as JsonValue);
    const permissionPolicyHash = sha256({
      mode: executionConfig.permissionMode,
      allowedToolIds: executionConfig.allowedToolIds,
      workspaceRoot: options.workspaceRoot,
      shellNetwork: false,
    });
    const safetyPolicyHash = sha256({
      policy: "workspace-only-no-network-no-host-secrets-v1",
      stateOutsideWorkspace: true,
    });
    const budgetPolicyHash = sha256(executionConfig.budget as unknown as JsonValue);
    const signers = principals(sessionId, modelIdentityHash);
    const verifier =
      options.verifierOverride ??
      (await CodingTaskVerifier.create({
        workspaceRoot: options.workspaceRoot,
        commands: executionConfig.verification.commands,
        timeoutMillis: executionConfig.verification.timeoutMillis,
        maxOutputBytes: executionConfig.verification.maxOutputBytes,
        maxCommandBytes: executionConfig.process.maxCommandBytes,
        secrets: binding.secrets,
      }));
    const schemas = await SchemaRegistry.load(await bundledSchemasPath());
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
      ...(executionConfig.provider.reasoningEffort === null
        ? {}
        : { reasoningEffort: executionConfig.provider.reasoningEffort }),
      runtimeSigner: signers.runtime,
      operationsSigner: signers.operations,
      auditSigner: signers.audit,
      budgetLimits: executionConfig.budget,
      clock,
      ids,
      prompt: executionConfig.prompt,
      contextPolicy: executionConfig.contextPolicy,
      workflowPolicy: executionConfig.workflowPolicy,
      routingPolicy: executionConfig.routingPolicy,
      subagentPrompt: executionConfig.subagentPrompt,
      skills: executionConfig.skills,
      toolDescriptions: executionConfig.toolDescriptions,
      allowedToolIds: executionConfig.allowedToolIds,
      memoryPolicy: executionConfig.memoryPolicy,
      secrets: binding.secrets,
      processLimits: executionConfig.process,
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
