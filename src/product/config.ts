import { randomBytes } from "node:crypto";
import {
  access,
  mkdir,
  readFile,
  realpath,
  rename,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { parseStrictJson, sha256Text, type JsonValue } from "../core/canonical.js";
import { HarnessError, assertCondition } from "../core/errors.js";
import {
  isModelReasoningEffort,
  type ModelReasoningEffort,
} from "../domain/model.js";
import type { BudgetLimits } from "../domain/runtime.js";
import {
  reasoningEffortIsSupported,
  selectDefaultReasoningEffort,
} from "./model-profile.js";
import {
  OPENROUTER_ENDPOINT,
  productProviderCatalogEntry,
  type ProductProviderKind,
} from "./provider-registry.js";

export type ProductServiceTier =
  | "auto"
  | "default"
  | "flex"
  | "scale"
  | "priority";

export type ProductProviderConfig =
  | {
      readonly kind: "ollama";
      readonly model: string;
      readonly endpoint: string;
      readonly requestTimeoutMillis: number;
      readonly reasoningEffort: null;
    }
  | {
      readonly kind: "openai";
      readonly model: string;
      readonly reasoningEffort: ModelReasoningEffort | null;
      readonly serviceTier: ProductServiceTier;
    }
  | {
      readonly kind: "openrouter";
      readonly model: string;
      readonly endpoint: string;
      readonly requestTimeoutMillis: number;
      readonly reasoningEffort: ModelReasoningEffort | null;
    };

export type PermissionMode = "read-only" | "workspace-write";

export interface ProductConfig {
  readonly schemaVersion: 2;
  readonly workspaceRoot: string;
  readonly provider: ProductProviderConfig;
  readonly permissionMode: PermissionMode;
  readonly budget: BudgetLimits;
  readonly contextTokenLimit: number;
  readonly process: {
    readonly timeoutMillis: number;
    readonly maxOutputBytes: number;
    readonly maxCommandBytes: number;
  };
  readonly verification: {
    readonly commands: readonly string[];
    readonly timeoutMillis: number;
    readonly maxOutputBytes: number;
  };
}

export interface ProductStatePaths {
  readonly stateRoot: string;
  readonly projectId: string;
  readonly projectRoot: string;
  readonly configFile: string;
  readonly memoryRoot: string;
  readonly sessionsRoot: string;
  readonly skillsRoot: string;
  sessionDirectory(sessionId: string): string;
  sessionRuntimeRoot(sessionId: string): string;
}

export interface ProductConfigOverrides {
  readonly providerKind?: ProductProviderKind;
  readonly model?: string;
  readonly endpoint?: string;
  readonly reasoningEffort?: ModelReasoningEffort | null;
  readonly serviceTier?: ProductServiceTier;
  readonly permissionMode?: PermissionMode;
  readonly verificationCommands?: readonly string[];
}

const DEFAULT_OLLAMA_MODEL = "qwen2.5-coder:7b";
const DEFAULT_OLLAMA_ENDPOINT = "http://127.0.0.1:11434";

function record(value: JsonValue, detail: string): Record<string, JsonValue> {
  assertCondition(
    typeof value === "object" && value !== null && !Array.isArray(value),
    "SCHEMA_INVALID",
    detail,
  );
  return value;
}

function exactKeys(
  value: Record<string, JsonValue>,
  expected: readonly string[],
  detail: string,
): void {
  const actual = Object.keys(value).sort();
  const canonical = [...expected].sort();
  assertCondition(
    actual.length === canonical.length &&
      actual.every((key, index) => key === canonical[index]),
    "SCHEMA_INVALID",
    `${detail} has unknown or missing fields`,
  );
}

function exactKeysWithOptional(
  value: Record<string, JsonValue>,
  required: readonly string[],
  optional: readonly string[],
  detail: string,
): void {
  const actual = Object.keys(value);
  const allowed = new Set([...required, ...optional]);
  assertCondition(
    required.every((key) => Object.hasOwn(value, key)) &&
      actual.every((key) => allowed.has(key)),
    "SCHEMA_INVALID",
    `${detail} has unknown or missing fields`,
  );
}

function optionalReasoningEffort(
  value: JsonValue | undefined,
  name: string,
): ModelReasoningEffort | null {
  if (value === undefined || value === null) return null;
  assertCondition(
    typeof value === "string" && isModelReasoningEffort(value),
    "SCHEMA_INVALID",
    `${name} is not a supported reasoning effort`,
  );
  return value;
}

function defaultReasoningEffort(
  kind: ProductProviderKind,
  model: string,
): ModelReasoningEffort | null {
  if (kind === "ollama") return null;
  const capabilities = productProviderCatalogEntry(kind, model)?.reasoning;
  return capabilities === undefined ? null : selectDefaultReasoningEffort(capabilities);
}

function resolvedReasoningEffort(input: {
  readonly kind: ProductProviderKind;
  readonly model: string;
  readonly explicit: ModelReasoningEffort | null | undefined;
  readonly prior: ProductProviderConfig | null;
}): ModelReasoningEffort | null {
  if (input.kind === "ollama") {
    assertCondition(
      input.explicit === undefined || input.explicit === null,
      "SCHEMA_INVALID",
      "Ollama does not expose a portable reasoning-effort control",
    );
    return null;
  }
  const sameRoute =
    input.prior?.kind === input.kind && input.prior.model === input.model;
  const effort =
    input.explicit !== undefined
      ? input.explicit
      : sameRoute
        ? input.prior.reasoningEffort
        : defaultReasoningEffort(input.kind, input.model);
  if (effort === null) return null;
  // Direct OpenAI presets are pinned with this release. OpenRouter discovery is
  // live and may legitimately supersede the bundled example metadata.
  const capabilities =
    input.kind === "openai"
      ? productProviderCatalogEntry(input.kind, input.model)?.reasoning
      : undefined;
  assertCondition(
    capabilities === undefined || reasoningEffortIsSupported(capabilities, effort),
    "SCHEMA_INVALID",
    `${input.kind}/${input.model} does not advertise reasoning effort ${effort}`,
  );
  return effort;
}

function stringValue(value: JsonValue | undefined, name: string): string {
  assertCondition(
    typeof value === "string" && value.length > 0,
    "SCHEMA_INVALID",
    `${name} must be a non-empty string`,
  );
  return value;
}

function integerValue(
  value: JsonValue | undefined,
  name: string,
  minimum: number,
  maximum: number,
): number {
  assertCondition(
    Number.isSafeInteger(value) &&
      (value as number) >= minimum &&
      (value as number) <= maximum,
    "SCHEMA_INVALID",
    `${name} must be an integer between ${minimum} and ${maximum}`,
  );
  return value as number;
}

function parseBudget(value: JsonValue): BudgetLimits {
  const budget = record(value, "budget must be an object");
  exactKeys(
    budget,
    [
      "maxModelCalls",
      "maxInputTokens",
      "maxOutputTokens",
      "maxToolCalls",
      "maxWallClockMillis",
      "maxRetries",
      "maxDescendants",
    ],
    "budget",
  );
  return {
    maxModelCalls: integerValue(budget["maxModelCalls"], "maxModelCalls", 1, 1_000),
    maxInputTokens: integerValue(
      budget["maxInputTokens"],
      "maxInputTokens",
      1,
      100_000_000,
    ),
    maxOutputTokens: integerValue(
      budget["maxOutputTokens"],
      "maxOutputTokens",
      1,
      10_000_000,
    ),
    maxToolCalls: integerValue(budget["maxToolCalls"], "maxToolCalls", 0, 10_000),
    maxWallClockMillis: integerValue(
      budget["maxWallClockMillis"],
      "maxWallClockMillis",
      1_000,
      86_400_000,
    ),
    maxRetries: integerValue(budget["maxRetries"], "maxRetries", 0, 100),
    maxDescendants: integerValue(budget["maxDescendants"], "maxDescendants", 0, 100),
  };
}

function parseProvider(value: JsonValue): ProductProviderConfig {
  const provider = record(value, "provider must be an object");
  const kind = provider["kind"];
  if (kind === "ollama") {
    exactKeysWithOptional(
      provider,
      ["kind", "model", "endpoint", "requestTimeoutMillis"],
      ["reasoningEffort"],
      "Ollama provider",
    );
    assertCondition(
      optionalReasoningEffort(provider["reasoningEffort"], "provider.reasoningEffort") === null,
      "SCHEMA_INVALID",
      "Ollama reasoningEffort must be null",
    );
    const endpoint = stringValue(provider["endpoint"], "provider.endpoint");
    let url: URL;
    try {
      url = new URL(endpoint);
    } catch (error) {
      throw new HarnessError("SCHEMA_INVALID", "provider.endpoint is not a URL", {
        cause: error,
      });
    }
    assertCondition(
      (url.protocol === "http:" || url.protocol === "https:") &&
        url.username.length === 0 &&
        url.password.length === 0,
      "AUTHORIZATION_DENIED",
      "Ollama endpoint must be uncredentialed HTTP(S)",
    );
    return {
      kind,
      model: stringValue(provider["model"], "provider.model"),
      endpoint,
      requestTimeoutMillis: integerValue(
        provider["requestTimeoutMillis"],
        "provider.requestTimeoutMillis",
        1_000,
        86_400_000,
      ),
      reasoningEffort: null,
    };
  }
  if (kind === "openrouter") {
    exactKeysWithOptional(
      provider,
      ["kind", "model", "endpoint", "requestTimeoutMillis"],
      ["reasoningEffort"],
      "OpenRouter provider",
    );
    const endpoint = stringValue(provider["endpoint"], "provider.endpoint");
    let url: URL;
    try {
      url = new URL(endpoint);
    } catch (error) {
      throw new HarnessError("SCHEMA_INVALID", "provider.endpoint is not a URL", {
        cause: error,
      });
    }
    assertCondition(
      url.protocol === "https:" &&
        url.username.length === 0 &&
        url.password.length === 0 &&
        `${url.origin}${url.pathname.replace(/\/$/u, "")}` === OPENROUTER_ENDPOINT,
      "AUTHORIZATION_DENIED",
      `OpenRouter endpoint must be ${OPENROUTER_ENDPOINT}`,
    );
    const model = stringValue(provider["model"], "provider.model");
    const reasoningEffort = optionalReasoningEffort(
      provider["reasoningEffort"],
      "provider.reasoningEffort",
    );
    return {
      kind,
      model,
      endpoint: OPENROUTER_ENDPOINT,
      requestTimeoutMillis: integerValue(
        provider["requestTimeoutMillis"],
        "provider.requestTimeoutMillis",
        1_000,
        86_400_000,
      ),
      reasoningEffort,
    };
  }
  assertCondition(kind === "openai", "SCHEMA_INVALID", "Unknown provider kind");
  exactKeysWithOptional(
    provider,
    ["kind", "model", "serviceTier"],
    ["reasoningEffort"],
    "OpenAI provider",
  );
  const serviceTier = provider["serviceTier"];
  assertCondition(
    serviceTier === "auto" ||
      serviceTier === "default" ||
      serviceTier === "flex" ||
      serviceTier === "scale" ||
      serviceTier === "priority",
    "SCHEMA_INVALID",
    "Invalid OpenAI service tier",
  );
  const model = stringValue(provider["model"], "provider.model");
  const reasoningEffort = optionalReasoningEffort(
    provider["reasoningEffort"],
    "provider.reasoningEffort",
  );
  const capabilities = productProviderCatalogEntry(kind, model)?.reasoning;
  assertCondition(
    reasoningEffort === null ||
      capabilities === undefined ||
      reasoningEffortIsSupported(capabilities, reasoningEffort),
    "SCHEMA_INVALID",
    `${kind}/${model} does not advertise reasoning effort ${reasoningEffort ?? "auto"}`,
  );
  const catalogEntry = productProviderCatalogEntry(kind, model);
  assertCondition(
    serviceTier !== "priority" ||
      catalogEntry === null ||
      catalogEntry.serviceTiers?.some((tier) => tier.id === "priority") === true,
    "SCHEMA_INVALID",
    `${kind}/${model} does not advertise priority processing`,
  );
  return {
    kind,
    model,
    reasoningEffort,
    serviceTier,
  };
}

export function defaultProductConfig(
  workspaceRoot: string,
  overrides: ProductConfigOverrides = {},
): ProductConfig {
  const providerKind = overrides.providerKind ?? "ollama";
  const model = overrides.model ?? DEFAULT_OLLAMA_MODEL;
  assertCondition(
    overrides.endpoint === undefined || providerKind === "ollama",
    "AUTHORIZATION_DENIED",
    "--endpoint is supported only for the local Ollama provider",
  );
  assertCondition(
    overrides.serviceTier === undefined || providerKind === "openai",
    "SCHEMA_INVALID",
    "Service tier is supported only by the direct OpenAI provider",
  );
  assertCondition(
    providerKind !== "ollama" ||
      overrides.reasoningEffort === undefined ||
      overrides.reasoningEffort === null,
    "SCHEMA_INVALID",
    "Ollama does not expose a portable reasoning-effort control",
  );
  assertCondition(
    providerKind === "ollama" || overrides.model !== undefined,
    "SCHEMA_INVALID",
    `${providerKind} setup requires an explicit --model`,
  );
  return {
    schemaVersion: 2,
    workspaceRoot,
    provider:
      providerKind === "ollama"
        ? {
            kind: "ollama",
            model,
            endpoint: overrides.endpoint ?? DEFAULT_OLLAMA_ENDPOINT,
            requestTimeoutMillis: 10 * 60_000,
            reasoningEffort: null,
          }
        : providerKind === "openai"
          ? {
            kind: "openai",
            model,
            reasoningEffort: resolvedReasoningEffort({
              kind: "openai",
              model,
              explicit: overrides.reasoningEffort,
              prior: null,
            }),
            serviceTier: overrides.serviceTier ?? "default",
          }
          : {
              kind: "openrouter",
              model,
              endpoint: OPENROUTER_ENDPOINT,
              requestTimeoutMillis: 10 * 60_000,
              reasoningEffort: resolvedReasoningEffort({
                kind: "openrouter",
                model,
                explicit: overrides.reasoningEffort,
                prior: null,
              }),
            },
    permissionMode: overrides.permissionMode ?? "workspace-write",
    budget: {
      maxModelCalls: 32,
      maxInputTokens: 500_000,
      maxOutputTokens: 65_536,
      maxToolCalls: 64,
      maxWallClockMillis: 30 * 60_000,
      maxRetries: 2,
      maxDescendants: 4,
    },
    contextTokenLimit: 24_000,
    process: {
      timeoutMillis: 2 * 60_000,
      maxOutputBytes: 1024 * 1024,
      maxCommandBytes: 32 * 1024,
    },
    verification: {
      commands: [...(overrides.verificationCommands ?? [])],
      timeoutMillis: 10 * 60_000,
      maxOutputBytes: 1024 * 1024,
    },
  };
}

export function applyProductConfigOverrides(
  config: ProductConfig,
  overrides: ProductConfigOverrides,
): ProductConfig {
  const providerKind = overrides.providerKind ?? config.provider.kind;
  assertCondition(
    overrides.endpoint === undefined || providerKind === "ollama",
    "AUTHORIZATION_DENIED",
    "--endpoint is supported only for the local Ollama provider",
  );
  assertCondition(
    overrides.serviceTier === undefined || providerKind === "openai",
    "SCHEMA_INVALID",
    "Service tier is supported only by the direct OpenAI provider",
  );
  assertCondition(
    providerKind !== "ollama" ||
      overrides.reasoningEffort === undefined ||
      overrides.reasoningEffort === null,
    "SCHEMA_INVALID",
    "Ollama does not expose a portable reasoning-effort control",
  );
  let provider: ProductProviderConfig;
  if (providerKind === "ollama") {
    const prior = config.provider.kind === "ollama" ? config.provider : null;
    provider = {
      kind: "ollama",
      model: overrides.model ?? prior?.model ?? DEFAULT_OLLAMA_MODEL,
      endpoint: overrides.endpoint ?? prior?.endpoint ?? DEFAULT_OLLAMA_ENDPOINT,
      requestTimeoutMillis: prior?.requestTimeoutMillis ?? 10 * 60_000,
      reasoningEffort: null,
    };
  } else if (providerKind === "openai") {
    const prior = config.provider.kind === "openai" ? config.provider : null;
    const model = overrides.model ?? prior?.model;
    assertCondition(
      model !== undefined,
      "SCHEMA_INVALID",
      "Switching to OpenAI requires an explicit --model",
    );
    provider = {
      kind: "openai",
      model,
      reasoningEffort: resolvedReasoningEffort({
        kind: "openai",
        model,
        explicit: overrides.reasoningEffort,
        prior: config.provider,
      }),
      serviceTier:
        overrides.serviceTier ??
        (prior?.model === model ? prior.serviceTier : "default"),
    };
  } else {
    const prior = config.provider.kind === "openrouter" ? config.provider : null;
    const model = overrides.model ?? prior?.model;
    assertCondition(
      model !== undefined,
      "SCHEMA_INVALID",
      "Switching to OpenRouter requires an explicit --model",
    );
    provider = {
      kind: "openrouter",
      model,
      endpoint: OPENROUTER_ENDPOINT,
      requestTimeoutMillis: prior?.requestTimeoutMillis ?? 10 * 60_000,
      reasoningEffort: resolvedReasoningEffort({
        kind: "openrouter",
        model,
        explicit: overrides.reasoningEffort,
        prior: config.provider,
      }),
    };
  }
  return parseProductConfig({
    ...config,
    provider,
    permissionMode: overrides.permissionMode ?? config.permissionMode,
    verification: {
      ...config.verification,
      commands:
        overrides.verificationCommands === undefined
          ? config.verification.commands
          : [...overrides.verificationCommands],
    },
  } as unknown as JsonValue);
}

export function parseProductConfig(value: JsonValue): ProductConfig {
  const config = record(value, "config must be an object");
  exactKeys(
    config,
    [
      "schemaVersion",
      "workspaceRoot",
      "provider",
      "permissionMode",
      "budget",
      "contextTokenLimit",
      "process",
      "verification",
    ],
    "config",
  );
  const schemaVersion = config["schemaVersion"];
  assertCondition(
    schemaVersion === 1 || schemaVersion === 2,
    "SCHEMA_INVALID",
    "Unsupported config version",
  );
  const permissionMode = config["permissionMode"];
  assertCondition(
    permissionMode === "read-only" || permissionMode === "workspace-write",
    "SCHEMA_INVALID",
    "Invalid permission mode",
  );
  const processValue = record(config["process"] ?? null, "process must be an object");
  exactKeys(
    processValue,
    ["timeoutMillis", "maxOutputBytes", "maxCommandBytes"],
    "process",
  );
  const verification = record(
    config["verification"] ?? null,
    "verification must be an object",
  );
  exactKeys(
    verification,
    ["commands", "timeoutMillis", "maxOutputBytes"],
    "verification",
  );
  const commandsValue = verification["commands"];
  assertCondition(
    Array.isArray(commandsValue) && commandsValue.length <= 16,
    "SCHEMA_INVALID",
    "verification.commands must contain at most 16 commands",
  );
  const commands = commandsValue.map((command, index) => {
    assertCondition(
      typeof command === "string" && command.length > 0 && command.length <= 32 * 1024,
      "SCHEMA_INVALID",
      `verification command ${index} is invalid`,
    );
    return command;
  });
  const parsedBudget = parseBudget(config["budget"] ?? null);
  return {
    schemaVersion: 2,
    workspaceRoot: stringValue(config["workspaceRoot"], "workspaceRoot"),
    provider: parseProvider(config["provider"] ?? null),
    permissionMode,
    // A schema migration may normalize representation, but it must never widen
    // an existing user's frozen execution budget. New v2 configs default to
    // four descendants; legacy configs retain their explicit value.
    budget: parsedBudget,
    contextTokenLimit: integerValue(
      config["contextTokenLimit"],
      "contextTokenLimit",
      1_024,
      1_000_000,
    ),
    process: {
      timeoutMillis: integerValue(
        processValue["timeoutMillis"],
        "process.timeoutMillis",
        100,
        86_400_000,
      ),
      maxOutputBytes: integerValue(
        processValue["maxOutputBytes"],
        "process.maxOutputBytes",
        1_024,
        64 * 1024 * 1024,
      ),
      maxCommandBytes: integerValue(
        processValue["maxCommandBytes"],
        "process.maxCommandBytes",
        128,
        1024 * 1024,
      ),
    },
    verification: {
      commands,
      timeoutMillis: integerValue(
        verification["timeoutMillis"],
        "verification.timeoutMillis",
        100,
        86_400_000,
      ),
      maxOutputBytes: integerValue(
        verification["maxOutputBytes"],
        "verification.maxOutputBytes",
        1_024,
        64 * 1024 * 1024,
      ),
    },
  };
}

export async function resolveWorkspaceRoot(candidate: string): Promise<string> {
  const absolute = path.resolve(candidate);
  let resolved: string;
  try {
    resolved = await realpath(absolute);
  } catch (error) {
    throw new HarnessError("ARTIFACT_UNAVAILABLE", `Workspace does not exist: ${absolute}`, {
      cause: error,
    });
  }
  const metadata = await stat(resolved);
  assertCondition(metadata.isDirectory(), "AUTHORIZATION_DENIED", "Workspace must be a directory");
  return resolved;
}

export function productStatePaths(workspaceRoot: string): ProductStatePaths {
  const configuredRoot = process.env["SEH_STATE_DIR"];
  const stateRoot = path.resolve(
    configuredRoot ?? path.join(os.homedir(), ".local", "state", "self-evolving-harness"),
  );
  assertCondition(
    !pathIsWithin(workspaceRoot, stateRoot),
    "AUTHORIZATION_DENIED",
    "SEH state directory must be outside the selected workspace",
  );
  const projectId = sha256Text(workspaceRoot).slice("sha256:".length, "sha256:".length + 24);
  const projectRoot = path.join(stateRoot, "projects", projectId);
  const sessionsRoot = path.join(projectRoot, "sessions");
  return {
    stateRoot,
    projectId,
    projectRoot,
    configFile: path.join(projectRoot, "config.json"),
    memoryRoot: path.join(projectRoot, "memory"),
    sessionsRoot,
    skillsRoot: path.join(projectRoot, "skills"),
    sessionDirectory(sessionId: string) {
      return path.join(sessionsRoot, sessionId);
    },
    sessionRuntimeRoot(sessionId: string) {
      return path.join(sessionsRoot, sessionId, "runtime");
    },
  };
}

function pathIsWithin(parent: string, candidate: string): boolean {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate));
  return (
    relative === "" ||
    (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))
  );
}

async function assertPhysicalStateBoundary(
  paths: ProductStatePaths,
  workspaceRoot: string,
): Promise<void> {
  const [physicalWorkspace, physicalProjectState] = await Promise.all([
    realpath(workspaceRoot),
    realpath(paths.projectRoot),
  ]);
  assertCondition(
    !pathIsWithin(physicalWorkspace, physicalProjectState),
    "AUTHORIZATION_DENIED",
    "SEH state directory resolves inside the selected workspace",
  );
}

async function initializeStateDirectories(paths: ProductStatePaths): Promise<void> {
  await mkdir(paths.stateRoot, { recursive: true, mode: 0o700 });
  await mkdir(paths.projectRoot, { recursive: true, mode: 0o700 });
  await mkdir(paths.memoryRoot, { recursive: true, mode: 0o700 });
  await mkdir(paths.sessionsRoot, { recursive: true, mode: 0o700 });
  await mkdir(paths.skillsRoot, { recursive: true, mode: 0o700 });
}

export async function saveProductConfig(
  paths: ProductStatePaths,
  config: ProductConfig,
  options: { readonly overwrite?: boolean } = {},
): Promise<void> {
  parseProductConfig(config as unknown as JsonValue);
  await initializeStateDirectories(paths);
  await assertPhysicalStateBoundary(paths, config.workspaceRoot);
  const bytes = `${JSON.stringify(config, null, 2)}\n`;
  if (options.overwrite !== true) {
    try {
      await writeFile(paths.configFile, bytes, { encoding: "utf8", mode: 0o600, flag: "wx" });
      return;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") {
        throw new HarnessError(
          "CONFLICT",
          `Project is already initialized at ${paths.configFile}; use --force to replace config`,
        );
      }
      throw error;
    }
  }
  const temporary = `${paths.configFile}.${randomBytes(12).toString("hex")}.tmp`;
  await writeFile(temporary, bytes, { encoding: "utf8", mode: 0o600, flag: "wx" });
  try {
    await rename(temporary, paths.configFile);
  } catch (error) {
    await unlink(temporary).catch(() => undefined);
    throw error;
  }
}

export async function loadProductConfig(
  paths: ProductStatePaths,
  expectedWorkspaceRoot: string,
): Promise<ProductConfig> {
  let text: string;
  try {
    text = await readFile(paths.configFile, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new HarnessError(
        "ARTIFACT_UNAVAILABLE",
        "Project is not initialized. Run `seh init` in the workspace.",
      );
    }
    throw error;
  }
  const config = parseProductConfig(parseStrictJson(text));
  assertCondition(
    config.workspaceRoot === expectedWorkspaceRoot,
    "PROTOCOL_MISMATCH",
    "Project config is bound to a different canonical workspace",
  );
  await assertPhysicalStateBoundary(paths, expectedWorkspaceRoot);
  return config;
}

export async function productConfigExists(paths: ProductStatePaths): Promise<boolean> {
  try {
    await access(paths.configFile);
    return true;
  } catch {
    return false;
  }
}

export const PRODUCT_DEFAULTS = Object.freeze({
  ollamaModel: DEFAULT_OLLAMA_MODEL,
  ollamaEndpoint: DEFAULT_OLLAMA_ENDPOINT,
});
