import { access } from "node:fs/promises";
import { parseArgs } from "node:util";
import * as readline from "node:readline/promises";

import { RandomIdFactory, SystemClock } from "../core/determinism.js";
import { HarnessError, asHarnessError, assertCondition } from "../core/errors.js";
import { listOllamaModels } from "../providers/ollama-provider.js";
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
import {
  RuntimeEventView,
  buildConversationalTask,
  interactiveBanner,
  interactiveHelp,
  parseInteractiveInput,
  permissionLabel,
  type ConversationTurn,
} from "./interactive.js";
import {
  ProductSessionStore,
  type ProductSessionRecord,
} from "./session-store.js";

interface CommonCommandOptions {
  readonly workspace: string | undefined;
  readonly provider: string | undefined;
  readonly model: string | undefined;
  readonly endpoint: string | undefined;
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

function providerKind(value: string | undefined): "ollama" | "openai" | undefined {
  if (value === undefined) return undefined;
  assertCondition(
    value === "ollama" || value === "openai",
    "SCHEMA_INVALID",
    "--provider must be ollama or openai",
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

function configOverrides(options: CommonCommandOptions): ProductConfigOverrides {
  const kind = providerKind(options.provider);
  const mode = permissionMode(options);
  return {
    ...(kind === undefined ? {} : { providerKind: kind }),
    ...(options.model === undefined ? {} : { model: options.model }),
    ...(options.endpoint === undefined ? {} : { endpoint: options.endpoint }),
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
  return process.env["NO_COLOR"] === undefined && process.stderr.isTTY === true;
}

function printSession(record: ProductSessionRecord, json: boolean): void {
  if (json) {
    out(`${JSON.stringify(record, null, 2)}\n`);
    return;
  }
  out(`\n${record.result?.finalText ?? "No final answer was produced."}\n`);
  out(`\nSession: ${record.sessionId}\n`);
  out(`State: ${record.state}\n`);
  if ((record.contextSessionIds?.length ?? 0) > 0) {
    out(`Thread context: ${record.contextSessionIds?.length ?? 0} prior session(s)\n`);
  }
  if (record.result?.verification !== null && record.result?.verification !== undefined) {
    out(
      `Verification: ${record.result.verification.passed ? "passed" : "failed"} — ${record.result.verification.summary}\n`,
    );
  }
  if (record.failure !== null) {
    out(`Failure: ${record.failure.code}: ${record.failure.detail}\n`);
  }
  if (record.result !== null) {
    out(
      `Usage: ${record.result.usage.modelCalls} model / ${record.result.usage.toolCalls} tool / ${record.result.modelUsage.totalTokens} tokens\n`,
    );
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
}): Promise<ProductSessionRecord> {
  if (input.project.initialized && !input.json && input.showProjectHeader !== false) {
    err(`Initialized project config at ${input.project.paths.configFile}\n`);
  }
  if (!input.json && input.showProjectHeader !== false) {
    err(`SEH workspace: ${input.project.workspaceRoot}\n`);
    err(
      `Provider: ${input.project.config.provider.kind}/${input.project.config.provider.model}\n`,
    );
    err(`Permissions: ${input.project.config.permissionMode} (shell network: denied)\n`);
  }
  const controller = new AbortController();
  const onSignal = (): void => controller.abort();
  process.once("SIGINT", onSignal);
  const events = new RuntimeEventView({
    quiet: input.quiet || input.json,
    color: terminalColorEnabled(),
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
      onEvent: events.render,
      abortSignal: controller.signal,
    });
  } finally {
    process.removeListener("SIGINT", onSignal);
  }
}

async function initCommand(args: readonly string[]): Promise<number> {
  const parsed = parseArgs({
    args: [...args],
    options: {
      workspace: { type: "string" },
      provider: { type: "string" },
      model: { type: "string" },
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
  out(`Permissions: ${config.permissionMode}\n`);
  if (config.provider.kind === "ollama") {
    out(`\nNext:\n  ollama serve\n  ollama pull ${config.provider.model}\n  seh run "your task"\n`);
  } else {
    out(`\nNext:\n  export OPENAI_API_KEY=...\n  seh run "your task"\n`);
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
  const lines = [
    `Session: ${record.sessionId}`,
    `State: ${record.state}`,
    `Created: ${record.createdAt}`,
    `Provider: ${record.provider.kind}/${record.provider.model}`,
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
  } else if ((process.env["OPENAI_API_KEY"] ?? "").length > 0) {
    out("✓ OPENAI_API_KEY is present (value not read or displayed)\n");
  } else {
    healthy = false;
    out("✗ OPENAI_API_KEY is absent\n");
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

async function printInteractiveMemory(paths: ProductStatePaths): Promise<void> {
  const records = (
    await new FilesystemMemory(
      paths.memoryRoot,
      new SystemClock(),
      new RandomIdFactory(),
    ).list([...USER_MEMORY_NAMESPACES, "session_summaries"])
  ).slice(-20);
  if (records.length === 0) {
    out("No memory records.\n");
    return;
  }
  for (const record of records) {
    out(`${record.namespace} · ${record.authority}\n${record.content}\n\n`);
  }
}

async function printInteractiveDiff(
  project: ConfiguredProject,
  staged: boolean,
): Promise<void> {
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
  out(result.stdout.length === 0 ? "No diff.\n" : result.stdout);
}

function printRecentSessions(records: readonly ProductSessionRecord[]): void {
  if (records.length === 0) {
    out("No sessions.\n");
    return;
  }
  for (const record of records) {
    out(
      `${record.sessionId}  ${record.state.padEnd(10)}  ${record.task.replace(/\s+/gu, " ").slice(0, 64)}\n`,
    );
  }
}

function splitFirstArgument(value: string): { readonly first: string; readonly rest: string } {
  const trimmed = value.trim();
  const separator = trimmed.search(/\s/u);
  return separator === -1
    ? { first: trimmed, rest: "" }
    : { first: trimmed.slice(0, separator), rest: trimmed.slice(separator).trim() };
}

async function readPastedTask(
  terminal: readline.Interface,
  color: boolean,
): Promise<string> {
  out("Paste the task below. Finish with a line containing only `.`.\n");
  const lines: string[] = [];
  const continuationPrompt = color ? "\u001B[2m… \u001B[0m" : "… ";
  while (true) {
    const line = await terminal.question(continuationPrompt);
    if (line === ".") break;
    lines.push(line);
  }
  return lines.join("\n").trim();
}

async function selectInteractiveSession(
  terminal: readline.Interface,
  store: ProductSessionStore,
): Promise<ProductSessionRecord | null> {
  const records = (await store.list()).slice(0, 20);
  assertCondition(records.length > 0, "ARTIFACT_UNAVAILABLE", "No sessions exist for this workspace");
  out("Resume a session\n");
  records.forEach((record, index) => {
    const task = record.task.replace(/\s+/gu, " ").slice(0, 68);
    out(`  ${String(index + 1).padStart(2)}. ${record.state.padEnd(10)} ${task}\n`);
  });
  const answer = (await terminal.question("Select [1], session ID, or q: ")).trim();
  if (answer.toLowerCase() === "q") return null;
  if (answer === "") return records[0] ?? null;
  const numeric = Number(answer);
  if (Number.isSafeInteger(numeric) && numeric >= 1 && numeric <= records.length) {
    return records[numeric - 1] ?? null;
  }
  const matches = records.filter((record) => record.sessionId.startsWith(answer));
  assertCondition(matches.length === 1, "SCHEMA_INVALID", "Session selection is invalid or ambiguous");
  return matches[0] ?? null;
}

async function runInteractiveShell(
  project: ConfiguredProject,
  quiet: boolean,
  startup: InteractiveShellStartup = {},
): Promise<number> {
  let activeProject = project;
  const color = terminalColorEnabled();
  if (activeProject.initialized) {
    err(`Initialized project config at ${activeProject.paths.configFile}\n`);
  }
  out(interactiveBanner({
    workspaceRoot: activeProject.workspaceRoot,
    config: activeProject.config,
    color,
  }));
  const terminal = readline.createInterface({ input: process.stdin, output: process.stdout });
  let latest: ProductSessionRecord | null = null;
  let turns: ConversationTurn[] = [];
  let threadNumber = 1;
  const store = new ProductSessionStore(activeProject.paths);
  const loadPrior = (prior: ProductSessionRecord): void => {
    latest = prior;
    turns = [{
      sessionId: prior.sessionId,
      user: prior.task,
      assistant: prior.result?.finalText ?? "No final answer was produced.",
    }];
    out(`Loaded ${prior.sessionId} into thread ${threadNumber}. This is context, not evolution.\n`);
  };
  const runTurn = async (task: string): Promise<void> => {
    const record = await executeTask({
      project: activeProject,
      task,
      executionTask: buildConversationalTask(task, turns),
      contextSessionIds: turns.map((turn) => turn.sessionId),
      parentSessionId: latest?.sessionId ?? null,
      json: false,
      quiet,
      showProjectHeader: false,
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
    printSession(record, false);
  };
  const safelyRunTurn = async (task: string): Promise<void> => {
    try {
      await runTurn(task);
    } catch (error) {
      const failure = asHarnessError(error);
      err(`${failure.code}: ${failure.safeDetail}\n`);
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
      startupPrior = await selectInteractiveSession(terminal, store);
      if (startupPrior === null) {
        out("Resume cancelled.\n");
        return 0;
      }
    }
    if (startupPrior !== null) loadPrior(startupPrior);
    if ((startup.initialPrompt?.trim().length ?? 0) > 0) {
      await safelyRunTurn(startup.initialPrompt as string);
    }

    while (true) {
      const prompt = color
        ? `\u001B[1;36mseh:${threadNumber} ›\u001B[0m `
        : `seh:${threadNumber} > `;
      const parsedInput = parseInteractiveInput(await terminal.question(prompt));
      if (parsedInput.kind === "empty") continue;
      if (parsedInput.kind === "task") {
        await safelyRunTurn(parsedInput.text);
        continue;
      }

      const { name, argument } = parsedInput;
      try {
        if (name === "exit" || name === "quit" || name === "q") break;
        if (name === "help" || name === "?") {
          out(`${interactiveHelp()}\n`);
        } else if (name === "new") {
          turns = [];
          latest = null;
          threadNumber += 1;
          out(`Started thread ${threadNumber}. Workspace memory is unchanged.\n`);
        } else if (name === "status") {
          const record = latest ?? (await store.latest());
          out(record === null ? "No sessions.\n" : statusText(record));
        } else if (name === "sessions") {
          printRecentSessions((await store.list()).slice(0, 10));
        } else if (name === "resume") {
          let prior: ProductSessionRecord | null;
          let guidance = "";
          if (argument === "") {
            prior = await selectInteractiveSession(terminal, store);
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
        } else if (name === "model") {
          if (argument.length === 0) {
            out(`${activeProject.config.provider.kind}/${activeProject.config.provider.model}\n`);
          } else {
            activeProject = {
              ...activeProject,
              config: applyProductConfigOverrides(activeProject.config, { model: argument }),
            };
            out(`Model for following turns: ${activeProject.config.provider.kind}/${argument} (not persisted)\n`);
          }
        } else if (name === "permissions") {
          out(`${permissionLabel(activeProject.config.permissionMode)}\n`);
        } else if (name === "read-only" || name === "write") {
          const mode: PermissionMode = name === "read-only" ? "read-only" : "workspace-write";
          activeProject = {
            ...activeProject,
            config: applyProductConfigOverrides(activeProject.config, { permissionMode: mode }),
          };
          out(`Permissions for following turns: ${permissionLabel(mode)} (not persisted)\n`);
        } else if (name === "verify") {
          if (activeProject.config.verification.commands.length === 0) {
            out("Verification is advisory; no external command is configured.\n");
          } else {
            activeProject.config.verification.commands.forEach((command, index) =>
              out(`${index + 1}. ${command}\n`),
            );
          }
        } else if (name === "diff") {
          assertCondition(
            argument === "" || argument === "--staged",
            "SCHEMA_INVALID",
            "/diff accepts only --staged",
          );
          await printInteractiveDiff(activeProject, argument === "--staged");
        } else if (name === "memory") {
          await printInteractiveMemory(activeProject.paths);
        } else if (name === "paste") {
          const task = await readPastedTask(terminal, color);
          if (task.length > 0) await safelyRunTurn(task);
        } else if (name === "clear") {
          out("\u001Bc");
        } else {
          err(`Unknown command /${name}. Type /help.\n`);
        }
      } catch (error) {
        const failure = asHarnessError(error);
        err(`${failure.code}: ${failure.safeDetail}\n`);
      }
    }
  } finally {
    terminal.close();
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

export function productUsage(): string {
  return [
    "Self-Evolving Harness (seh)",
    "",
    "Usage:",
    "  seh --version",
    "  seh                              Start the interactive coding agent",
    "  seh [OPTIONS] \"task\"             Start interactively with an initial prompt",
    "  seh init [--provider ollama|openai] [--model MODEL] [--read-only]",
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
    "",
    "Common options:",
    "  --workspace PATH     Workspace to inspect or modify (default: current directory)",
    "  --provider NAME      ollama (no key) or openai",
    "  --model MODEL        Provider model name",
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
  throw new HarnessError("SCHEMA_INVALID", `Unknown command ${command}`);
}
