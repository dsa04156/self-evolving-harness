import { access } from "node:fs/promises";
import { parseArgs } from "node:util";

import { RandomIdFactory, SystemClock } from "../core/determinism.js";
import { HarnessError, asHarnessError, assertCondition } from "../core/errors.js";
import {
  isModelReasoningEffort,
  type ModelReasoningEffort,
} from "../domain/model.js";
import type { RuntimeEvent } from "../evidence/runtime-events.js";
import { listOllamaModels } from "../providers/ollama-provider.js";
import { listOpenRouterModels } from "../providers/openrouter-catalog.js";
import { FilesystemMemory, type MemoryNamespace } from "../runtime/memory.js";
import { BubblewrapProcessRunner } from "../runtime/sandbox-process.js";
import {
  applyProductConfigOverrides,
  defaultProductConfig,
  loadProductConfig,
  productConfigExists,
  productStatePaths,
  resolveWorkspaceRoot,
  saveProductConfig,
  type PermissionMode,
  type ProductConfig,
  type ProductConfigOverrides,
  type ProductStatePaths,
} from "./config.js";
import { runCodingAgentTask } from "./coding-agent.js";
import { codingSkill, codingToolDescriptions } from "./defaults.js";
import {
  INTERACTIVE_CONTEXT_LIMIT_BYTES,
  RuntimeEventView,
  PRODUCT_CLI_VERSION,
  buildConversationalTask,
  interactiveHelp,
  parseInteractiveInput,
  permissionLabel,
  type ConversationTurn,
} from "./interactive.js";
import {
  ProductSessionStore,
  type ProductSessionRecord,
} from "./session-store.js";
import { renderShellCompletion } from "./shell-completion.js";
import {
  buildProductModelChoices,
  type ProductModelChoice,
} from "./model-catalog.js";
import {
  isProductProviderKind,
  productProviderCatalogEntry,
  productProviderDescriptor,
  type ProductProviderKind,
} from "./provider-registry.js";
import {
  ADVANCED_REASONING_CHOICE_ID,
  NO_REASONING_CAPABILITIES,
  buildReasoningEffortChoices,
  reasoningEffortIsSupported,
  selectDefaultReasoningEffort,
  type ModelReasoningCapabilities,
} from "./model-profile.js";
import {
  renderResponsePanel,
} from "./terminal-ui.js";
import {
  startFullscreenTui,
  type FullscreenTuiController,
  type FullscreenTuiStatus,
} from "./fullscreen-tui.js";

interface CommonCommandOptions {
  readonly workspace: string | undefined;
  readonly provider: string | undefined;
  readonly model: string | undefined;
  readonly endpoint: string | undefined;
  readonly effort: string | undefined;
  readonly fast: boolean | undefined;
  readonly readOnly: boolean | undefined;
  readonly write: boolean | undefined;
  readonly verify: readonly string[] | undefined;
}

function out(text: string): void {
  process.stdout.write(text);
}

function err(text: string): void {
  process.stderr.write(text);
}

function providerKind(value: string | undefined): ProductProviderKind | undefined {
  if (value === undefined) return undefined;
  assertCondition(
    isProductProviderKind(value),
    "SCHEMA_INVALID",
    "--provider must be openai, openrouter, or ollama",
  );
  return value;
}

function permissionMode(options: CommonCommandOptions): PermissionMode | undefined {
  assertCondition(
    !(options.readOnly === true && options.write === true),
    "SCHEMA_INVALID",
    "--read-only and --write are mutually exclusive",
  );
  if (options.readOnly === true) return "read-only";
  if (options.write === true) return "workspace-write";
  return undefined;
}

function modelReasoningEffort(
  value: string | undefined,
): ModelReasoningEffort | null | undefined {
  if (value === undefined) return undefined;
  if (value === "auto") return null;
  assertCondition(
    isModelReasoningEffort(value),
    "SCHEMA_INVALID",
    "--effort must be auto, none, minimal, low, medium, high, xhigh, or max",
  );
  return value;
}

function configOverrides(options: CommonCommandOptions): ProductConfigOverrides {
  const kind = providerKind(options.provider);
  const mode = permissionMode(options);
  const reasoningEffort = modelReasoningEffort(options.effort);
  return {
    ...(kind === undefined ? {} : { providerKind: kind }),
    ...(options.model === undefined ? {} : { model: options.model }),
    ...(options.endpoint === undefined ? {} : { endpoint: options.endpoint }),
    ...(reasoningEffort === undefined ? {} : { reasoningEffort }),
    ...(options.fast === true ? { serviceTier: "priority" as const } : {}),
    ...(mode === undefined ? {} : { permissionMode: mode }),
    ...(options.verify === undefined ? {} : { verificationCommands: options.verify }),
  };
}

async function workspaceAndPaths(candidate: string | undefined): Promise<{
  readonly workspaceRoot: string;
  readonly paths: ProductStatePaths;
}> {
  const workspaceRoot = await resolveWorkspaceRoot(candidate ?? process.cwd());
  return { workspaceRoot, paths: productStatePaths(workspaceRoot) };
}

async function configuredProject(
  options: CommonCommandOptions,
  autoInitialize: boolean,
): Promise<{
  readonly workspaceRoot: string;
  readonly paths: ProductStatePaths;
  readonly config: ProductConfig;
  readonly initialized: boolean;
}> {
  const { workspaceRoot, paths } = await workspaceAndPaths(options.workspace);
  const overrides = configOverrides(options);
  if (!(await productConfigExists(paths))) {
    assertCondition(
      autoInitialize,
      "ARTIFACT_UNAVAILABLE",
      "Project is not initialized. Run `seh init` in the workspace.",
    );
    const config = defaultProductConfig(workspaceRoot, overrides);
    await saveProductConfig(paths, config);
    return { workspaceRoot, paths, config, initialized: true };
  }
  const stored = await loadProductConfig(paths, workspaceRoot);
  return {
    workspaceRoot,
    paths,
    config: applyProductConfigOverrides(stored, overrides),
    initialized: false,
  };
}

type ConfiguredProject = Awaited<ReturnType<typeof configuredProject>>;

interface InteractiveShellStartup {
  readonly initialPrompt?: string;
  readonly resumeSessionId?: string;
  readonly resumeLatest?: boolean;
  readonly resumePicker?: boolean;
}

function terminalColorEnabled(): boolean {
  return (
    process.env["NO_COLOR"] === undefined &&
    process.stdout.isTTY === true &&
    process.stderr.isTTY === true
  );
}

function printSession(record: ProductSessionRecord, json: boolean): void {
  if (json) {
    out(`${JSON.stringify(record, null, 2)}\n`);
    return;
  }
  out(renderResponsePanel({
    text: record.result?.finalText ?? "No final answer was produced.",
    state: record.state,
    sessionId: record.sessionId,
    modelCalls: record.result?.usage.modelCalls ?? null,
    toolCalls: record.result?.usage.toolCalls ?? null,
    totalTokens: record.result?.modelUsage.totalTokens ?? null,
    verificationPassed: record.result?.verification?.passed ?? null,
    verificationSummary: record.result?.verification?.summary ?? null,
    color: terminalColorEnabled(),
    columns: process.stdout.columns,
  }));
  if ((record.contextSessionIds?.length ?? 0) > 0) {
    out(`  thread context · ${record.contextSessionIds?.length ?? 0} prior session(s)\n`);
  }
  if (record.failure !== null) {
    out(`  failure · ${record.failure.code}: ${record.failure.detail}\n`);
  }
}

async function readTaskFromStdin(): Promise<string> {
  assertCondition(!process.stdin.isTTY, "SCHEMA_INVALID", "Provide a task after `seh run`");
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8").trim();
}

async function executeTask(input: {
  readonly project: ConfiguredProject;
  readonly task: string;
  readonly executionTask?: string;
  readonly contextSessionIds?: readonly string[];
  readonly parentSessionId?: string | null;
  readonly json: boolean;
  readonly quiet: boolean;
  readonly showProjectHeader?: boolean;
  readonly onRuntimeEvent?: (event: RuntimeEvent) => void | Promise<void>;
  readonly abortSignal?: AbortSignal;
}): Promise<ProductSessionRecord> {
  if (input.project.initialized && !input.json && input.showProjectHeader !== false) {
    err(`Initialized project config at ${input.project.paths.configFile}\n`);
  }
  if (!input.json && input.showProjectHeader !== false) {
    err(`SEH workspace: ${input.project.workspaceRoot}\n`);
    err(
      `Provider: ${input.project.config.provider.kind}/${input.project.config.provider.model}\n`,
    );
    err(
      `Reasoning: ${input.project.config.provider.reasoningEffort ?? "provider default"}${
        input.project.config.provider.kind === "openai" &&
        input.project.config.provider.serviceTier === "priority"
          ? " · FAST"
          : ""
      }\n`,
    );
    err(`Permissions: ${input.project.config.permissionMode} (shell network: denied)\n`);
  }
  const ownedController = input.abortSignal === undefined ? new AbortController() : null;
  const abortSignal = input.abortSignal ?? ownedController?.signal;
  const onSignal = (): void => ownedController?.abort();
  if (ownedController !== null) process.once("SIGINT", onSignal);
  const events = new RuntimeEventView({
    quiet: input.quiet || input.json || input.onRuntimeEvent !== undefined,
    color: terminalColorEnabled(),
    animated: process.stderr.isTTY === true && !input.quiet && !input.json,
  });
  try {
    return await runCodingAgentTask({
      workspaceRoot: input.project.workspaceRoot,
      paths: input.project.paths,
      config: input.project.config,
      task: input.task,
      ...(input.executionTask === undefined
        ? {}
        : { executionTask: input.executionTask }),
      ...(input.contextSessionIds === undefined
        ? {}
        : { contextSessionIds: input.contextSessionIds }),
      ...(input.parentSessionId === undefined
        ? {}
        : { parentSessionId: input.parentSessionId }),
      onEvent: async (event) => {
        events.render(event);
        await input.onRuntimeEvent?.(event);
      },
      ...(abortSignal === undefined ? {} : { abortSignal }),
    });
  } finally {
    events.close();
    if (ownedController !== null) process.removeListener("SIGINT", onSignal);
  }
}

async function initCommand(args: readonly string[]): Promise<number> {
  const parsed = parseArgs({
    args: [...args],
    options: {
      workspace: { type: "string" },
      provider: { type: "string" },
      model: { type: "string" },
      effort: { type: "string" },
      fast: { type: "boolean" },
      endpoint: { type: "string" },
      "read-only": { type: "boolean" },
      write: { type: "boolean" },
      verify: { type: "string", multiple: true },
      force: { type: "boolean" },
    },
    allowPositionals: false,
  });
  const common: CommonCommandOptions = {
    workspace: parsed.values.workspace,
    provider: parsed.values.provider,
    model: parsed.values.model,
    endpoint: parsed.values.endpoint,
    effort: parsed.values.effort,
    fast: parsed.values.fast,
    readOnly: parsed.values["read-only"],
    write: parsed.values.write,
    verify: parsed.values.verify,
  };
  const { workspaceRoot, paths } = await workspaceAndPaths(common.workspace);
  const config = defaultProductConfig(workspaceRoot, configOverrides(common));
  await saveProductConfig(paths, config, { overwrite: parsed.values.force === true });
  out(`Initialized Self-Evolving Harness\n`);
  out(`Workspace: ${workspaceRoot}\n`);
  out(`Config: ${paths.configFile}\n`);
  out(`Provider: ${config.provider.kind}/${config.provider.model}\n`);
  out(`Reasoning: ${config.provider.reasoningEffort ?? "provider default"}\n`);
  if (config.provider.kind === "openai") {
    out(`Fast: ${config.provider.serviceTier === "priority" ? "on" : "off"}\n`);
  }
  out(`Permissions: ${config.permissionMode}\n`);
  if (config.provider.kind === "ollama") {
    out(`\nNext:\n  ollama serve\n  ollama pull ${config.provider.model}\n  seh run "your task"\n`);
  } else {
    const credential = productProviderDescriptor(config.provider.kind).credentialEnvironmentVariable;
    out(`\nNext:\n  export ${credential}=...\n  seh run "your task"\n`);
  }
  return 0;
}

async function runCommand(args: readonly string[]): Promise<number> {
  const parsed = parseArgs({
    args: [...args],
    options: {
      workspace: { type: "string" },
      provider: { type: "string" },
      model: { type: "string" },
      effort: { type: "string" },
      fast: { type: "boolean" },
      endpoint: { type: "string" },
      "read-only": { type: "boolean" },
      write: { type: "boolean" },
      verify: { type: "string", multiple: true },
      json: { type: "boolean" },
      quiet: { type: "boolean", short: "q" },
    },
    allowPositionals: true,
  });
  const common: CommonCommandOptions = {
    workspace: parsed.values.workspace,
    provider: parsed.values.provider,
    model: parsed.values.model,
    endpoint: parsed.values.endpoint,
    effort: parsed.values.effort,
    fast: parsed.values.fast,
    readOnly: parsed.values["read-only"],
    write: parsed.values.write,
    verify: parsed.values.verify,
  };
  const task =
    parsed.positionals.length > 0
      ? parsed.positionals.join(" ")
      : await readTaskFromStdin();
  const project = await configuredProject(common, true);
  const record = await executeTask({
    project,
    task,
    json: parsed.values.json === true,
    quiet: parsed.values.quiet === true,
  });
  printSession(record, parsed.values.json === true);
  return record.state === "completed" ? 0 : 2;
}

function statusText(record: ProductSessionRecord): string {
  const serviceTier = record.executionProfile?.serviceTier;
  const lines = [
    `Session: ${record.sessionId}`,
    `State: ${record.state}`,
    `Created: ${record.createdAt}`,
    `Provider: ${record.provider.kind}/${record.provider.model}`,
    `Reasoning: ${record.executionProfile?.reasoningEffort ?? "provider default"}`,
    ...(serviceTier === null || serviceTier === undefined
      ? []
      : [`Service tier: ${serviceTier}`]),
    `Permissions: ${record.permissionMode}`,
    `Workspace: ${record.workspaceRoot}`,
    `Task: ${record.task}`,
  ];
  if (record.parentSessionId !== null) lines.push(`Parent: ${record.parentSessionId}`);
  if (record.runtimeTaskHash !== undefined) lines.push(`Runtime task hash: ${record.runtimeTaskHash}`);
  if ((record.contextSessionIds?.length ?? 0) > 0) {
    lines.push(`Thread context sessions: ${record.contextSessionIds?.join(", ") ?? ""}`);
  }
  if (record.result !== null) {
    lines.push(`Lifecycle: ${record.result.lifecycleState}`);
    lines.push(`Events: ${record.result.eventCount}`);
    lines.push(
      `Usage: ${record.result.usage.modelCalls} model / ${record.result.usage.toolCalls} tool / ${record.result.modelUsage.totalTokens} tokens`,
    );
    lines.push(
      `Verification: ${record.result.verification?.passed === true ? "passed" : "not passed"}`,
    );
  }
  if (record.failure !== null) lines.push(`Failure: ${record.failure.code}: ${record.failure.detail}`);
  return `${lines.join("\n")}\n`;
}

async function sessionsCommand(args: readonly string[]): Promise<number> {
  const parsed = parseArgs({
    args: [...args],
    options: {
      workspace: { type: "string" },
      json: { type: "boolean" },
      limit: { type: "string" },
    },
    allowPositionals: false,
  });
  const { workspaceRoot, paths } = await workspaceAndPaths(parsed.values.workspace);
  await loadProductConfig(paths, workspaceRoot);
  const limit = parsed.values.limit === undefined ? 20 : Number(parsed.values.limit);
  assertCondition(Number.isSafeInteger(limit) && limit > 0, "SCHEMA_INVALID", "--limit is invalid");
  const records = (await new ProductSessionStore(paths).list()).slice(0, limit);
  if (parsed.values.json === true) {
    out(`${JSON.stringify(records, null, 2)}\n`);
    return 0;
  }
  if (records.length === 0) {
    out("No sessions.\n");
    return 0;
  }
  for (const record of records) {
    out(
      `${record.sessionId}  ${record.state.padEnd(10)}  ${record.provider.kind}/${record.provider.model}  ${record.task.slice(0, 72)}\n`,
    );
  }
  return 0;
}

async function statusCommand(args: readonly string[]): Promise<number> {
  const parsed = parseArgs({
    args: [...args],
    options: {
      workspace: { type: "string" },
      json: { type: "boolean" },
    },
    allowPositionals: true,
  });
  assertCondition(parsed.positionals.length <= 1, "SCHEMA_INVALID", "status accepts one session ID");
  const { workspaceRoot, paths } = await workspaceAndPaths(parsed.values.workspace);
  await loadProductConfig(paths, workspaceRoot);
  const store = new ProductSessionStore(paths);
  const record =
    parsed.positionals[0] === undefined
      ? await store.latest()
      : await store.get(parsed.positionals[0]);
  assertCondition(record !== null, "ARTIFACT_UNAVAILABLE", "No sessions exist for this workspace");
  out(parsed.values.json === true ? `${JSON.stringify(record, null, 2)}\n` : statusText(record));
  return record.state === "completed" ? 0 : 2;
}

async function resumeCommand(args: readonly string[]): Promise<number> {
  const parsed = parseArgs({
    args: [...args],
    options: {
      workspace: { type: "string" },
      provider: { type: "string" },
      model: { type: "string" },
      effort: { type: "string" },
      fast: { type: "boolean" },
      endpoint: { type: "string" },
      "read-only": { type: "boolean" },
      write: { type: "boolean" },
      verify: { type: "string", multiple: true },
      json: { type: "boolean" },
      quiet: { type: "boolean", short: "q" },
      last: { type: "boolean" },
    },
    allowPositionals: true,
  });
  const useLatest = parsed.values.last === true;
  assertCondition(
    !(useLatest && parsed.positionals.length > 0),
    "SCHEMA_INVALID",
    "--last does not accept a session ID or guidance",
  );
  const sessionId = useLatest ? undefined : parsed.positionals[0];
  const common: CommonCommandOptions = {
    workspace: parsed.values.workspace,
    provider: parsed.values.provider,
    model: parsed.values.model,
    endpoint: parsed.values.endpoint,
    effort: parsed.values.effort,
    fast: parsed.values.fast,
    readOnly: parsed.values["read-only"],
    write: parsed.values.write,
    verify: parsed.values.verify,
  };
  const project = await configuredProject(common, false);
  if (
    process.stdin.isTTY === true &&
    process.stdout.isTTY === true &&
    parsed.values.json !== true
  ) {
    return runInteractiveShell(project, parsed.values.quiet === true, {
      ...(sessionId === undefined ? {} : { resumeSessionId: sessionId }),
      ...(useLatest ? { resumeLatest: true } : {}),
      ...(sessionId === undefined && !useLatest ? { resumePicker: true } : {}),
      ...(parsed.positionals.length <= 1
        ? {}
        : { initialPrompt: parsed.positionals.slice(1).join(" ").trim() }),
    });
  }
  assertCondition(
    sessionId !== undefined || useLatest,
    "SCHEMA_INVALID",
    "non-interactive resume requires a session ID or --last",
  );
  const store = new ProductSessionStore(project.paths);
  const prior = useLatest ? await store.latest() : await store.get(sessionId as string);
  assertCondition(prior !== null, "ARTIFACT_UNAVAILABLE", "No sessions exist for this workspace");
  const guidance = parsed.positionals.slice(1).join(" ").trim();
  const task = [
    "Resume a prior coding-agent task as a new auditable session.",
    `Original task:\n${prior.task}`,
    `Prior state: ${prior.state}`,
    `Prior answer:\n${(prior.result?.finalText ?? "No prior final answer.").slice(0, 8_000)}`,
    prior.failure === null
      ? "Prior failure: none recorded"
      : `Prior failure: ${prior.failure.code}: ${prior.failure.detail}`,
    guidance.length === 0 ? "Inspect the current workspace and finish the original task." : `New guidance:\n${guidance}`,
  ].join("\n\n");
  const record = await executeTask({
    project,
    task,
    parentSessionId: prior.sessionId,
    contextSessionIds: [prior.sessionId],
    json: parsed.values.json === true,
    quiet: parsed.values.quiet === true,
  });
  printSession(record, parsed.values.json === true);
  return record.state === "completed" ? 0 : 2;
}

async function doctorCommand(args: readonly string[]): Promise<number> {
  const parsed = parseArgs({
    args: [...args],
    options: { workspace: { type: "string" } },
    allowPositionals: false,
  });
  const { workspaceRoot, paths } = await workspaceAndPaths(parsed.values.workspace);
  const config = await loadProductConfig(paths, workspaceRoot);
  let healthy = true;
  out(`✓ workspace ${workspaceRoot}\n`);
  out(`✓ config ${paths.configFile}\n`);
  try {
    await access("/usr/bin/bwrap");
    out("✓ sandbox /usr/bin/bwrap\n");
  } catch {
    healthy = false;
    out("✗ sandbox: /usr/bin/bwrap is unavailable\n");
  }
  if (config.provider.kind === "ollama") {
    try {
      const models = await listOllamaModels(config.provider.endpoint);
      out(`✓ Ollama ${config.provider.endpoint}\n`);
      const installed = models.includes(config.provider.model);
      if (installed) {
        out(`✓ model ${config.provider.model}\n`);
      } else {
        healthy = false;
        out(`✗ model ${config.provider.model} is not installed\n`);
        out(`  Run: ollama pull ${config.provider.model}\n`);
      }
    } catch (error) {
      healthy = false;
      const failure = error instanceof HarnessError ? error.safeDetail : "Ollama probe failed";
      out(`✗ provider: ${failure}\n`);
      out("  Install/start Ollama, then run `ollama serve`.\n");
    }
  } else {
    const descriptor = productProviderDescriptor(config.provider.kind);
    const credential = descriptor.credentialEnvironmentVariable;
    assertCondition(credential !== null, "SCHEMA_INVALID", "Remote provider has no credential slot");
    if ((process.env[credential] ?? "").length > 0) {
      out(`✓ ${credential} is present (value not read or displayed)\n`);
    } else {
      healthy = false;
      out(`✗ ${credential} is absent\n`);
    }
    if (config.provider.kind === "openrouter") {
      try {
        const models = await listOpenRouterModels({ timeoutMillis: 2_500 });
        out(`✓ OpenRouter catalog ${models.length} tool-capable models\n`);
        if (!models.some((model) => model.modelId === config.provider.model)) {
          out(`! model ${config.provider.model} was not found in the live catalog\n`);
        }
      } catch (error) {
        healthy = false;
        const failure = error instanceof HarnessError ? error.safeDetail : "OpenRouter catalog probe failed";
        out(`✗ provider catalog: ${failure}\n`);
      }
    }
  }
  out(`✓ state is outside the workspace at ${paths.projectRoot}\n`);
  return healthy ? 0 : 2;
}

async function configCommand(args: readonly string[]): Promise<number> {
  const parsed = parseArgs({
    args: [...args],
    options: { workspace: { type: "string" } },
    allowPositionals: false,
  });
  const { workspaceRoot, paths } = await workspaceAndPaths(parsed.values.workspace);
  const config = await loadProductConfig(paths, workspaceRoot);
  out(`${JSON.stringify({ configFile: paths.configFile, ...config }, null, 2)}\n`);
  return 0;
}

const USER_MEMORY_NAMESPACES: readonly MemoryNamespace[] = [
  "project_facts",
  "user_preferences",
  "accepted_lessons",
];

async function memoryCommand(args: readonly string[]): Promise<number> {
  const parsed = parseArgs({
    args: [...args],
    options: {
      workspace: { type: "string" },
      namespace: { type: "string", short: "n" },
      json: { type: "boolean" },
    },
    allowPositionals: true,
  });
  const action = parsed.positionals[0] ?? "list";
  const { workspaceRoot, paths } = await workspaceAndPaths(parsed.values.workspace);
  await loadProductConfig(paths, workspaceRoot);
  const memory = new FilesystemMemory(paths.memoryRoot, new SystemClock(), new RandomIdFactory());
  if (action === "add") {
    const namespace = parsed.values.namespace ?? "project_facts";
    assertCondition(
      USER_MEMORY_NAMESPACES.includes(namespace as MemoryNamespace),
      "SCHEMA_INVALID",
      `--namespace must be one of ${USER_MEMORY_NAMESPACES.join(", ")}`,
    );
    const content = parsed.positionals.slice(1).join(" ").trim();
    assertCondition(content.length > 0, "SCHEMA_INVALID", "memory add requires content");
    const record = await memory.write({
      namespace: namespace as MemoryNamespace,
      content,
      authority: "operator_approved",
      producerId: "human_operator.cli",
    });
    out(`${JSON.stringify(record, null, 2)}\n`);
    return 0;
  }
  assertCondition(action === "list", "SCHEMA_INVALID", "memory action must be add or list");
  const records = await memory.list([
    ...USER_MEMORY_NAMESPACES,
    "session_summaries",
  ]);
  if (parsed.values.json === true) out(`${JSON.stringify(records, null, 2)}\n`);
  else if (records.length === 0) out("No memory records.\n");
  else {
    for (const record of records) {
      out(`${record.recordId}  ${record.namespace}  ${record.authority}\n${record.content}\n\n`);
    }
  }
  return 0;
}

async function interactiveMemoryText(paths: ProductStatePaths): Promise<string> {
  const records = (
    await new FilesystemMemory(
      paths.memoryRoot,
      new SystemClock(),
      new RandomIdFactory(),
    ).list([...USER_MEMORY_NAMESPACES, "session_summaries"])
  ).slice(-20);
  if (records.length === 0) {
    return "No memory records.";
  }
  return records
    .map((record) => `${record.namespace} · ${record.authority}\n${record.content}`)
    .join("\n\n");
}

async function interactiveDiffText(
  project: ConfiguredProject,
  staged: boolean,
): Promise<string> {
  const runner = new BubblewrapProcessRunner(project.workspaceRoot, {
    timeoutMillis: Math.min(project.config.process.timeoutMillis, 30_000),
    maxOutputBytes: Math.min(project.config.process.maxOutputBytes, 512 * 1024),
    maxCommandBytes: project.config.process.maxCommandBytes,
    environment: {},
  });
  await runner.initialize();
  const result = await runner.runExecutable("/usr/bin/git", [
    "-c",
    "core.pager=cat",
    "-c",
    "pager.diff=false",
    "--no-optional-locks",
    "diff",
    "--no-ext-diff",
    "--no-color",
    "--src-prefix=a/",
    "--dst-prefix=b/",
    ...(staged ? ["--cached"] : []),
  ]);
  if (result.exitCode !== 0) {
    throw new HarnessError(
      "TOOL_EXECUTION_FAILED",
      result.stderr.trim() || "Git diff failed inside the sandbox",
    );
  }
  return result.stdout.length === 0 ? "No diff." : result.stdout;
}

function recentSessionsText(records: readonly ProductSessionRecord[]): string {
  if (records.length === 0) {
    return "No sessions.";
  }
  return records
    .map(
      (record) =>
        `${record.sessionId}  ${record.state.padEnd(10)}  ${record.task.replace(/\s+/gu, " ").slice(0, 80)}`,
    )
    .join("\n");
}

function splitFirstArgument(value: string): { readonly first: string; readonly rest: string } {
  const trimmed = value.trim();
  const separator = trimmed.search(/\s/u);
  return separator === -1
    ? { first: trimmed, rest: "" }
    : { first: trimmed.slice(0, separator), rest: trimmed.slice(separator).trim() };
}

async function selectFullscreenSession(
  terminal: FullscreenTuiController,
  store: ProductSessionStore,
): Promise<ProductSessionRecord | null> {
  const records = (await store.list()).slice(0, 20);
  assertCondition(records.length > 0, "ARTIFACT_UNAVAILABLE", "No sessions exist for this workspace");
  const selected = await terminal.select(
    "Resume a durable session",
    records.map((record) => ({
      id: record.sessionId,
      label: record.task.replace(/\s+/gu, " ").slice(0, 72),
      description: `${record.state} · ${record.sessionId.slice(-12)}`,
    })),
  );
  return selected === null ? null : await store.get(selected);
}

async function selectableModels(
  project: ConfiguredProject,
): Promise<{
  readonly choices: readonly ProductModelChoice[];
  readonly discoveryWarning: string | null;
}> {
  const ollamaEndpoint =
    project.config.provider.kind === "ollama"
      ? project.config.provider.endpoint
      : (productProviderDescriptor("ollama").endpoint ?? "http://127.0.0.1:11434");
  const [ollama, openrouter] = await Promise.allSettled([
    listOllamaModels(ollamaEndpoint, { timeoutMillis: 700 }),
    listOpenRouterModels({
      ...((process.env["OPENROUTER_API_KEY"] ?? "").length === 0
        ? {}
        : { apiKey: process.env["OPENROUTER_API_KEY"] as string }),
      timeoutMillis: 2_500,
    }),
  ]);
  const warnings: string[] = [];
  if (openrouter.status === "rejected") {
    warnings.push(asHarnessError(openrouter.reason).safeDetail);
  }
  return {
    choices: buildProductModelChoices({
      provider: project.config.provider,
      discoveredByProvider: {
        ...(ollama.status === "fulfilled"
          ? {
              ollama: ollama.value.map((modelId) => ({
                modelId,
                name: modelId,
                description: "installed locally",
              })),
            }
          : {}),
        ...(openrouter.status === "fulfilled"
          ? { openrouter: openrouter.value }
          : {}),
      },
    }),
    discoveryWarning: warnings.length === 0 ? null : warnings.join(" · "),
  };
}

function bundledReasoningCapabilities(
  providerKind: ProductProviderKind,
  modelId: string,
): ModelReasoningCapabilities {
  return (
    productProviderCatalogEntry(providerKind, modelId)?.reasoning ??
    NO_REASONING_CAPABILITIES
  );
}

async function selectReasoningEffort(
  terminal: FullscreenTuiController,
  input: {
    readonly providerKind: ProductProviderKind;
    readonly modelId: string;
    readonly capabilities: ModelReasoningCapabilities;
    readonly current: ModelReasoningEffort | null;
  },
): Promise<ModelReasoningEffort | null | undefined> {
  if (input.capabilities.supportedEfforts.length === 0) return null;
  const standardChoices = buildReasoningEffortChoices({
    capabilities: input.capabilities,
    current: input.current,
  });
  const selected = await terminal.select(
    `Reasoning effort · ${input.providerKind}/${input.modelId}`,
    standardChoices,
    "Only levels advertised by this model · choose More reasoning for Max · Esc cancel",
  );
  if (selected === null) return undefined;
  if (selected === ADVANCED_REASONING_CHOICE_ID) {
    const advancedChoices = buildReasoningEffortChoices({
      capabilities: input.capabilities,
      current: input.current,
      advanced: true,
    });
    const advanced = await terminal.select(
      `Advanced reasoning · ${input.providerKind}/${input.modelId}`,
      advancedChoices,
      "Max is slower and can use more tokens · Ultra is not a single-model provider effort · Esc cancel",
    );
    if (advanced === null) return undefined;
    assertCondition(
      isModelReasoningEffort(advanced) &&
        advancedChoices.some((choice) => choice.effort === advanced),
      "SCHEMA_INVALID",
      "Unknown advanced reasoning-effort selection",
    );
    return advanced;
  }
  assertCondition(
    isModelReasoningEffort(selected) &&
      input.capabilities.supportedEfforts.includes(selected),
    "SCHEMA_INVALID",
    "Unknown reasoning-effort selection",
  );
  return selected;
}

async function runInteractiveShell(
  project: ConfiguredProject,
  quiet: boolean,
  startup: InteractiveShellStartup = {},
): Promise<number> {
  let activeProject = project;
  let latest: ProductSessionRecord | null = null;
  let turns: ConversationTurn[] = [];
  let threadNumber = 1;
  let activeReasoningCapabilities = bundledReasoningCapabilities(
    activeProject.config.provider.kind,
    activeProject.config.provider.model,
  );
  const store = new ProductSessionStore(activeProject.paths);
  const tuiStatus = async (): Promise<FullscreenTuiStatus> => {
    const recentSessions = (await store.list()).slice(0, 5).map((record) => ({
      sessionId: record.sessionId,
      state: record.state,
      task: record.task,
    }));
    return {
      version: PRODUCT_CLI_VERSION,
      workspaceRoot: activeProject.workspaceRoot,
      provider: activeProject.config.provider.kind,
      model: activeProject.config.provider.model,
      reasoningEffort: activeProject.config.provider.reasoningEffort,
      fastMode:
        activeProject.config.provider.kind === "openai" &&
        activeProject.config.provider.serviceTier === "priority",
      permissionMode: activeProject.config.permissionMode,
      verificationCount: activeProject.config.verification.commands.length,
      threadNumber,
      recentSessions,
    };
  };
  const terminal = startFullscreenTui(await tuiStatus());
  const refreshStatus = async (): Promise<void> => terminal.updateStatus(await tuiStatus());
  if (activeProject.initialized) {
    terminal.setNotice(`Initialized project policy · ${activeProject.paths.configFile}`);
  }
  const loadPrior = (prior: ProductSessionRecord): void => {
    latest = prior;
    turns = [{
      sessionId: prior.sessionId,
      user: prior.task,
      assistant: prior.result?.finalText ?? "No final answer was produced.",
    }];
    terminal.appendMessage(
      "system",
      `Loaded ${prior.sessionId}. The prior answer is bounded thread context, not a retry or HarnessVersion evolution.`,
      { title: "SESSION" },
    );
  };
  const renderRuntimeEvent = (event: RuntimeEvent): void => {
    if (event.eventType === "model_request_started") {
      terminal.setActivity({ kind: "thinking", label: "Thinking…" });
      return;
    }
    if (event.eventType === "model_response_received") {
      terminal.setActivity({ kind: "thinking", label: "Processing model response…" });
      return;
    }
    if (event.eventType === "tool_call_requested") {
      const tool = event.payload["toolName"];
      terminal.setActivity({
        kind: "tool",
        label: `Running ${typeof tool === "string" ? tool : "tool"}…`,
      });
      return;
    }
    if (event.eventType === "tool_call_completed") {
      const tool = event.payload["toolName"];
      const ok = event.payload["ok"] === true;
      const duration = event.payload["durationMillis"];
      terminal.appendMessage(
        "tool",
        `${ok ? "✓" : "✗"} ${typeof tool === "string" ? tool : "tool"}`,
        {
          title: "TOOL",
          ...(typeof duration === "number" ? { meta: `${duration}ms` } : {}),
        },
      );
      terminal.setActivity({ kind: "thinking", label: "Continuing…" });
      return;
    }
    if (event.eventType === "verification_completed") {
      const passed = event.payload["passed"] === true;
      terminal.appendMessage("tool", `${passed ? "✓" : "✗"} verification`, {
        title: "VERIFY",
        meta: passed ? "passed" : "failed",
      });
      terminal.setActivity(null);
      return;
    }
    if (event.eventType === "session_blocked") {
      terminal.setActivity({ kind: "recovering", label: "Session blocked" });
    }
  };
  const runTurn = async (task: string): Promise<void> => {
    terminal.appendMessage("user", task);
    const abortController = new AbortController();
    terminal.setInterruptHandler(() => abortController.abort());
    terminal.setActivity({ kind: "thinking", label: "Building context…" });
    try {
      const record = await executeTask({
        project: activeProject,
        task,
        executionTask: buildConversationalTask(task, turns),
        contextSessionIds: turns.map((turn) => turn.sessionId),
        parentSessionId: latest?.sessionId ?? null,
        json: false,
        quiet,
        showProjectHeader: false,
        onRuntimeEvent: renderRuntimeEvent,
        abortSignal: abortController.signal,
      });
      latest = record;
      turns = [
        ...turns,
        {
          sessionId: record.sessionId,
          user: task,
          assistant: record.result?.finalText ?? "No final answer was produced.",
        },
      ].slice(-8);
      const usage = record.result;
      const verification = usage?.verification;
      const meta = usage === null
        ? `${record.state} · ${record.sessionId.slice(-12)}`
        : [
            record.state,
            verification == null ? "verify advisory" : `verify ${verification.passed ? "passed" : "failed"}`,
            `${usage.usage.modelCalls} model`,
            `${usage.usage.toolCalls} tools`,
            `${usage.modelUsage.totalTokens.toLocaleString("en-US")} tokens`,
          ].join(" · ");
      terminal.appendMessage(
        record.failure === null ? "assistant" : "error",
        record.result?.finalText ?? record.failure?.detail ?? "No final answer was produced.",
        { meta },
      );
      await refreshStatus();
    } finally {
      terminal.setInterruptHandler(null);
      terminal.setActivity(null);
    }
  };
  const safelyRunTurn = async (task: string): Promise<void> => {
    try {
      await runTurn(task);
    } catch (error) {
      const failure = asHarnessError(error);
      terminal.appendMessage("error", failure.safeDetail, {
        title: failure.code,
      });
      terminal.setActivity(null);
    }
  };
  try {
    let startupPrior: ProductSessionRecord | null = null;
    if (startup.resumeSessionId !== undefined) {
      startupPrior = await store.get(startup.resumeSessionId);
    } else if (startup.resumeLatest === true) {
      startupPrior = await store.latest();
      assertCondition(startupPrior !== null, "ARTIFACT_UNAVAILABLE", "No sessions exist for this workspace");
    } else if (startup.resumePicker === true) {
      startupPrior = await selectFullscreenSession(terminal, store);
      if (startupPrior === null) {
        terminal.setNotice("Resume cancelled");
      }
    }
    if (startupPrior !== null) loadPrior(startupPrior);
    if ((startup.initialPrompt?.trim().length ?? 0) > 0) {
      await safelyRunTurn(startup.initialPrompt as string);
    }

    while (true) {
      const response = await terminal.question();
      if (response === null) break;
      const parsedInput = parseInteractiveInput(response);
      if (parsedInput.kind === "empty") continue;
      if (parsedInput.kind === "task") {
        await safelyRunTurn(parsedInput.text);
        continue;
      }

      const { name, argument } = parsedInput;
      try {
        if (name === "exit" || name === "quit" || name === "q") break;
        if (name === "help" || name === "?") {
          terminal.appendMessage("system", interactiveHelp(), { title: "COMMANDS" });
        } else if (name === "new") {
          turns = [];
          latest = null;
          threadNumber += 1;
          terminal.clearMessages();
          await refreshStatus();
          terminal.setNotice(`Started thread ${threadNumber} · workspace memory unchanged`);
        } else if (name === "status") {
          const record = latest ?? (await store.latest());
          terminal.appendMessage("system", record === null ? "No sessions." : statusText(record), {
            title: "STATUS",
          });
        } else if (name === "sessions") {
          terminal.appendMessage(
            "system",
            recentSessionsText((await store.list()).slice(0, 10)),
            { title: "SESSIONS" },
          );
        } else if (name === "resume") {
          let prior: ProductSessionRecord | null;
          let guidance = "";
          if (argument === "") {
            prior = await selectFullscreenSession(terminal, store);
          } else if (argument === "--last") {
            prior = await store.latest();
            assertCondition(prior !== null, "ARTIFACT_UNAVAILABLE", "No sessions exist for this workspace");
          } else {
            const split = splitFirstArgument(argument);
            prior = await store.get(split.first);
            guidance = split.rest;
          }
          if (prior !== null) {
            loadPrior(prior);
            if (guidance.length > 0) await safelyRunTurn(guidance);
          }
        } else if (name === "model" || name === "models") {
          if (argument.length === 0) {
            terminal.setActivity({ kind: "thinking", label: "Discovering available models…" });
            const catalog = await selectableModels(activeProject);
            terminal.setActivity(null);
            const selectedId = await terminal.select(
              `Model registry · ${catalog.choices.length} routes`,
              catalog.choices.map((choice) => ({
                id: choice.id,
                label: choice.label,
                description: choice.description,
              })),
              "type provider or model · ↑↓ select · Enter apply · Esc cancel",
            );
            if (selectedId === null) {
              terminal.setNotice("Model selection cancelled");
              continue;
            }
            const selectedChoice = catalog.choices.find((choice) => choice.id === selectedId);
            assertCondition(selectedChoice !== undefined, "SCHEMA_INVALID", "Unknown model selection");
            let modelId = selectedChoice?.modelId ?? null;
            if (selectedChoice.source === "custom") {
              terminal.setNotice(
                `Enter an exact ${selectedChoice.providerKind} model ID · Enter apply · Ctrl-D cancel`,
              );
              modelId = (await terminal.question())?.trim() ?? null;
              if (modelId === null || modelId.length === 0) {
                terminal.setNotice("Model selection cancelled");
                continue;
              }
            }
            assertCondition(modelId !== null, "SCHEMA_INVALID", "Selected model has no model ID");
            const selectedReasoning = await selectReasoningEffort(terminal, {
              providerKind: selectedChoice.providerKind,
              modelId,
              capabilities: selectedChoice.reasoning,
              current:
                selectedChoice.providerKind === activeProject.config.provider.kind &&
                modelId === activeProject.config.provider.model
                  ? activeProject.config.provider.reasoningEffort
                  : selectDefaultReasoningEffort(selectedChoice.reasoning),
            });
            if (selectedReasoning === undefined) {
              terminal.setNotice("Model selection cancelled");
              continue;
            }
            activeProject = {
              ...activeProject,
              config: applyProductConfigOverrides(activeProject.config, {
                providerKind: selectedChoice.providerKind,
                model: modelId,
                reasoningEffort: selectedReasoning,
              }),
            };
            activeReasoningCapabilities = selectedChoice.reasoning;
            await saveProductConfig(activeProject.paths, activeProject.config, {
              overwrite: true,
            });
            await refreshStatus();
            const availability = selectedChoice?.source === "example"
              ? " · example; provider access or installation is still required"
              : "";
            const discovery = catalog.discoveryWarning === null
              ? ""
              : ` · discovery unavailable: ${catalog.discoveryWarning}`;
            terminal.setNotice(
              `Model: ${selectedChoice.providerKind}/${modelId} · reasoning ${
                selectedReasoning ?? "provider default"
              } · saved for following sessions${availability}${discovery}`,
            );
          } else {
            const capabilities = bundledReasoningCapabilities(
              activeProject.config.provider.kind,
              argument,
            );
            activeProject = {
              ...activeProject,
              config: applyProductConfigOverrides(activeProject.config, { model: argument }),
            };
            activeReasoningCapabilities = capabilities;
            await saveProductConfig(activeProject.paths, activeProject.config, {
              overwrite: true,
            });
            await refreshStatus();
            terminal.setNotice(
              `Model: ${activeProject.config.provider.kind}/${argument} · reasoning ${
                activeProject.config.provider.reasoningEffort ?? "provider default"
              } · saved for following sessions`,
            );
          }
        } else if (name === "effort" || name === "reasoning") {
          assertCondition(
            activeProject.config.provider.kind !== "ollama",
            "SCHEMA_INVALID",
            "The Ollama adapter does not expose a portable reasoning-effort control",
          );
          let effort: ModelReasoningEffort | null;
          if (argument.length === 0) {
            assertCondition(
              activeReasoningCapabilities.supportedEfforts.length > 0,
              "ARTIFACT_UNAVAILABLE",
              "This custom model has no advertised reasoning metadata; use /effort LEVEL only if its provider documents support",
            );
            const selected = await selectReasoningEffort(terminal, {
              providerKind: activeProject.config.provider.kind,
              modelId: activeProject.config.provider.model,
              capabilities: activeReasoningCapabilities,
              current: activeProject.config.provider.reasoningEffort,
            });
            if (selected === undefined) {
              terminal.setNotice("Reasoning selection cancelled");
              continue;
            }
            effort = selected;
          } else if (argument === "auto") {
            effort = null;
          } else {
            assertCondition(
              isModelReasoningEffort(argument),
              "SCHEMA_INVALID",
              "Reasoning must be auto, none, minimal, low, medium, high, xhigh, or max",
            );
            assertCondition(
              reasoningEffortIsSupported(activeReasoningCapabilities, argument),
              "SCHEMA_INVALID",
              `${activeProject.config.provider.model} does not advertise reasoning effort ${argument}`,
            );
            effort = argument;
          }
          activeProject = {
            ...activeProject,
            config: applyProductConfigOverrides(activeProject.config, {
              reasoningEffort: effort,
            }),
          };
          await saveProductConfig(activeProject.paths, activeProject.config, {
            overwrite: true,
          });
          await refreshStatus();
          terminal.setNotice(
            `Reasoning: ${effort ?? "provider default"} · saved for following sessions`,
          );
        } else if (name === "fast") {
          assertCondition(
            activeProject.config.provider.kind === "openai",
            "SCHEMA_INVALID",
            "Fast mode is available only for direct OpenAI routes",
          );
          const supportsPriority =
            productProviderCatalogEntry(
              "openai",
              activeProject.config.provider.model,
            )?.serviceTiers?.some((tier) => tier.id === "priority") === true;
          assertCondition(
            supportsPriority,
            "ARTIFACT_UNAVAILABLE",
            `${activeProject.config.provider.model} does not advertise OpenAI priority processing`,
          );
          assertCondition(
            argument === "" || argument === "on" || argument === "off",
            "SCHEMA_INVALID",
            "/fast accepts on or off",
          );
          const enable =
            argument === "on" ||
            (argument === "" && activeProject.config.provider.serviceTier !== "priority");
          activeProject = {
            ...activeProject,
            config: applyProductConfigOverrides(activeProject.config, {
              serviceTier: enable ? "priority" : "default",
            }),
          };
          await saveProductConfig(activeProject.paths, activeProject.config, {
            overwrite: true,
          });
          await refreshStatus();
          terminal.setNotice(
            `Fast mode: ${enable ? "ON · OpenAI priority processing" : "OFF · default service tier"} · applies to next task session`,
          );
        } else if (name === "permissions") {
          terminal.appendMessage("system", permissionLabel(activeProject.config.permissionMode), {
            title: "PERMISSIONS",
          });
        } else if (name === "read-only" || name === "write") {
          const mode: PermissionMode = name === "read-only" ? "read-only" : "workspace-write";
          activeProject = {
            ...activeProject,
            config: applyProductConfigOverrides(activeProject.config, { permissionMode: mode }),
          };
          await refreshStatus();
          terminal.setNotice(`Permissions: ${permissionLabel(mode)} · ephemeral`);
        } else if (name === "verify") {
          if (activeProject.config.verification.commands.length === 0) {
            terminal.appendMessage(
              "system",
              "Verification is advisory; no external command is configured.",
              { title: "VERIFY" },
            );
          } else {
            terminal.appendMessage(
              "system",
              activeProject.config.verification.commands
                .map((command, index) => `${index + 1}. ${command}`)
                .join("\n"),
              { title: "VERIFY" },
            );
          }
        } else if (name === "diff") {
          assertCondition(
            argument === "" || argument === "--staged",
            "SCHEMA_INVALID",
            "/diff accepts only --staged",
          );
          terminal.appendMessage(
            "system",
            await interactiveDiffText(activeProject, argument === "--staged"),
            { title: argument === "--staged" ? "STAGED DIFF" : "DIFF" },
          );
        } else if (name === "review") {
          const priorProject = activeProject;
          activeProject = {
            ...activeProject,
            config: applyProductConfigOverrides(activeProject.config, {
              permissionMode: "read-only",
            }),
          };
          try {
            const focus = argument.length === 0 ? "correctness, regressions, security, and missing tests" : argument;
            await safelyRunTurn(
              `Review the current workspace changes for ${focus}. Do not modify files. Lead with concrete findings, then summarize residual risk.`,
            );
          } finally {
            activeProject = priorProject;
          }
        } else if (name === "tools") {
          terminal.appendMessage(
            "system",
            codingToolDescriptions(activeProject.config.permissionMode)
              .map((tool) => `${tool.name.padEnd(12)} ${tool.description}`)
              .join("\n"),
            { title: "TOOLS" },
          );
        } else if (name === "skills") {
          const skill = codingSkill(activeProject.config.permissionMode);
          terminal.appendMessage(
            "system",
            [
              `${skill.skillId}\n${skill.summary}`,
              ...skill.steps.map((step) => `${step.stepId.padEnd(10)} ${step.instruction}`),
            ].join("\n"),
            { title: "SKILLS" },
          );
        } else if (name === "context") {
          terminal.appendMessage(
            "system",
            [
              `Thread turns: ${turns.length}/8`,
              `Conversation context: ${INTERACTIVE_CONTEXT_LIMIT_BYTES.toLocaleString("en-US")} bytes maximum`,
              `Model context policy: ${activeProject.config.contextTokenLimit.toLocaleString("en-US")} tokens`,
              "Prior turns are untrusted context and cannot widen authority.",
            ].join("\n"),
            { title: "CONTEXT" },
          );
        } else if (name === "memory") {
          terminal.appendMessage("system", await interactiveMemoryText(activeProject.paths), {
            title: "MEMORY",
          });
        } else if (name === "paste") {
          terminal.setNotice("Paste directly into the composer · Shift+Enter inserts a newline");
        } else if (name === "clear" || name === "home") {
          terminal.clearMessages();
          await refreshStatus();
        } else {
          terminal.appendMessage("error", `Unknown command /${name}. Type / to browse commands.`, {
            title: "COMMAND",
          });
        }
      } catch (error) {
        const failure = asHarnessError(error);
        terminal.appendMessage("error", failure.safeDetail, { title: failure.code });
      }
    }
  } finally {
    await terminal.close();
  }
  return 0;
}

async function chatCommand(
  args: readonly string[],
  startup: InteractiveShellStartup = {},
): Promise<number> {
  const parsed = parseArgs({
    args: [...args],
    options: {
      workspace: { type: "string" },
      provider: { type: "string" },
      model: { type: "string" },
      effort: { type: "string" },
      fast: { type: "boolean" },
      endpoint: { type: "string" },
      "read-only": { type: "boolean" },
      write: { type: "boolean" },
      verify: { type: "string", multiple: true },
      quiet: { type: "boolean", short: "q" },
    },
    allowPositionals: true,
  });
  assertCondition(
    process.stdin.isTTY === true && process.stdout.isTTY === true,
    "SCHEMA_INVALID",
    "interactive mode requires a terminal; use `seh run` or `seh exec` instead",
  );
  const common: CommonCommandOptions = {
    workspace: parsed.values.workspace,
    provider: parsed.values.provider,
    model: parsed.values.model,
    endpoint: parsed.values.endpoint,
    effort: parsed.values.effort,
    fast: parsed.values.fast,
    readOnly: parsed.values["read-only"],
    write: parsed.values.write,
    verify: parsed.values.verify,
  };
  const project = await configuredProject(common, true);
  const prompt = parsed.positionals.join(" ").trim();
  return runInteractiveShell(project, parsed.values.quiet === true, {
    ...startup,
    ...(startup.initialPrompt !== undefined || prompt.length === 0
      ? {}
      : { initialPrompt: prompt }),
  });
}

async function continueCommand(args: readonly string[]): Promise<number> {
  return chatCommand(args, { resumeLatest: true });
}

async function completionCommand(args: readonly string[]): Promise<number> {
  assertCondition(args.length === 1, "SCHEMA_INVALID", "completion requires bash, zsh, or fish");
  out(renderShellCompletion(args[0] ?? ""));
  return 0;
}

export function productUsage(): string {
  return [
    "Self-Evolving Harness (seh)",
    "",
    "Usage:",
    "  seh --version",
    "  seh                              Start the interactive coding agent",
    "  seh [OPTIONS] \"task\"             Start interactively with an initial prompt",
    "  seh init [--provider NAME] [--model MODEL] [--effort LEVEL] [--fast] [--read-only]",
    "  seh run [OPTIONS] \"task\"          Run one task non-interactively",
    "  seh exec [OPTIONS] \"task\"         Alias for `seh run`",
    "  seh chat [OPTIONS]               Start the interactive coding agent",
    "  seh continue [OPTIONS] [prompt]  Continue the latest session",
    "  seh sessions [--limit N]",
    "  seh status [SESSION_ID]",
    "  seh resume [SESSION_ID] [guidance] [--last]",
    "  seh doctor",
    "  seh config",
    "  seh memory add [-n NAMESPACE] \"fact\"",
    "  seh memory list",
    "  seh completion bash|zsh|fish",
    "",
    "Common options:",
    "  --workspace PATH     Workspace to inspect or modify (default: current directory)",
    "  --provider NAME      openai, openrouter (250+ tool models), or ollama (local)",
    "  --model MODEL        Provider model name",
    "  --effort LEVEL       auto, none, minimal, low, medium, high, xhigh, or max",
    "  --fast               OpenAI priority processing when the model supports it",
    "  --endpoint URL       Ollama endpoint",
    "  --read-only          Disable write/edit/bash tools",
    "  --write              Enable workspace write tools",
    "  --verify COMMAND     External sandboxed verification command; repeatable",
    "  --json               Machine-readable output where supported",
    "",
    "Legacy/research commands:",
    "  seh demo             No-network deterministic managed-runtime demo",
    "  seh check-schemas    Compile every frozen JSON Schema",
    "",
  ].join("\n");
}

export async function runProductCommand(
  command: string,
  args: readonly string[],
): Promise<number> {
  if (command === "init") return initCommand(args);
  if (command === "run" || command === "exec") return runCommand(args);
  if (command === "chat") return chatCommand(args);
  if (command === "continue") return continueCommand(args);
  if (command === "sessions") return sessionsCommand(args);
  if (command === "status") return statusCommand(args);
  if (command === "resume") return resumeCommand(args);
  if (command === "doctor") return doctorCommand(args);
  if (command === "config") return configCommand(args);
  if (command === "memory") return memoryCommand(args);
  if (command === "completion") return completionCommand(args);
  throw new HarnessError("SCHEMA_INVALID", `Unknown command ${command}`);
}
