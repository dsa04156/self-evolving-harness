import { TextDecoder } from "node:util";

import { sha256Bytes, type JsonValue } from "../core/canonical.js";
import { HarnessError, assertCondition } from "../core/errors.js";
import type {
  ImmutableToolImplementation,
  JsonObject,
  ToolExecutionContext,
} from "../runtime/tools.js";

const MAX_FILE_BYTES = 1024 * 1024;
const IMPLEMENTATION_PREFIX = "sha256:";
const UTF8 = new TextDecoder("utf-8", { fatal: true });

function stringArgument(argumentsValue: JsonObject, name: string): string {
  const value = argumentsValue[name];
  assertCondition(typeof value === "string", "SCHEMA_INVALID", `${name} must be a string`);
  return value;
}

function booleanArgument(argumentsValue: JsonObject, name: string): boolean {
  const value = argumentsValue[name];
  assertCondition(typeof value === "boolean", "SCHEMA_INVALID", `${name} must be boolean`);
  return value;
}

function integerArgument(argumentsValue: JsonObject, name: string): number {
  const value = argumentsValue[name];
  assertCondition(Number.isSafeInteger(value), "SCHEMA_INVALID", `${name} must be an integer`);
  return value as number;
}

function implementationHash(id: string): string {
  return `${IMPLEMENTATION_PREFIX}${sha256Bytes(Buffer.from(`seh-tool-v1:${id}`, "utf8"))}`;
}

const PATH_PROPERTY: JsonValue = {
  type: "string",
  minLength: 1,
  maxLength: 4096,
  pattern: "^(?!/)(?!.*(?:^|/)\\.\\.(?:/|$))(?!.*\\\\).+$",
};

export function createReadTool(): ImmutableToolImplementation {
  return {
    toolId: "filesystem.read",
    name: "read",
    implementationHash: implementationHash("filesystem.read"),
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["path"],
      properties: { path: PATH_PROPERTY },
    },
    async execute(argumentsValue, context): Promise<JsonValue> {
      const relativePath = stringArgument(argumentsValue, "path");
      const bytes = await context.workspace.readFile(relativePath, MAX_FILE_BYTES);
      let content: string;
      try {
        content = UTF8.decode(bytes);
      } catch (error) {
        throw new HarnessError("SCHEMA_INVALID", "File is not valid UTF-8", { cause: error });
      }
      return {
        path: relativePath,
        content,
        sizeBytes: bytes.byteLength,
        contentHash: `sha256:${sha256Bytes(bytes)}`,
      };
    },
  };
}

export function createWriteTool(): ImmutableToolImplementation {
  return {
    toolId: "filesystem.write",
    name: "write",
    implementationHash: implementationHash("filesystem.write"),
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["path", "content", "overwrite"],
      properties: {
        path: PATH_PROPERTY,
        content: { type: "string", maxLength: MAX_FILE_BYTES },
        overwrite: { type: "boolean" },
      },
    },
    async execute(argumentsValue, context): Promise<JsonValue> {
      const relativePath = stringArgument(argumentsValue, "path");
      const content = stringArgument(argumentsValue, "content");
      const overwrite = booleanArgument(argumentsValue, "overwrite");
      const bytes = Buffer.from(content, "utf8");
      await context.workspace.writeFile(relativePath, bytes, {
        overwrite,
        maxBytes: MAX_FILE_BYTES,
        ...(context.abortSignal === undefined
          ? {}
          : { abortSignal: context.abortSignal }),
      });
      return {
        path: relativePath,
        sizeBytes: bytes.byteLength,
        contentHash: `sha256:${sha256Bytes(bytes)}`,
      };
    },
  };
}

export function createEditTool(): ImmutableToolImplementation {
  return {
    toolId: "filesystem.edit",
    name: "edit",
    implementationHash: implementationHash("filesystem.edit"),
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["path", "oldText", "newText", "expectedOccurrences"],
      properties: {
        path: PATH_PROPERTY,
        oldText: { type: "string", minLength: 1, maxLength: MAX_FILE_BYTES },
        newText: { type: "string", maxLength: MAX_FILE_BYTES },
        expectedOccurrences: { type: "integer", minimum: 1, maximum: 1000 },
      },
    },
    async execute(argumentsValue, context): Promise<JsonValue> {
      const relativePath = stringArgument(argumentsValue, "path");
      const oldText = stringArgument(argumentsValue, "oldText");
      const newText = stringArgument(argumentsValue, "newText");
      const expectedOccurrences = integerArgument(argumentsValue, "expectedOccurrences");
      const originalBytes = await context.workspace.readFile(relativePath, MAX_FILE_BYTES);
      let original: string;
      try {
        original = UTF8.decode(originalBytes);
      } catch (error) {
        throw new HarnessError("SCHEMA_INVALID", "File is not valid UTF-8", { cause: error });
      }
      const observed = original.split(oldText).length - 1;
      assertCondition(
        observed === expectedOccurrences,
        "CONFLICT",
        `Expected ${expectedOccurrences} occurrences, found ${observed}`,
      );
      const edited = original.split(oldText).join(newText);
      const editedBytes = Buffer.from(edited, "utf8");
      await context.workspace.writeFile(relativePath, editedBytes, {
        overwrite: true,
        maxBytes: MAX_FILE_BYTES,
        ...(context.abortSignal === undefined
          ? {}
          : { abortSignal: context.abortSignal }),
      });
      return {
        path: relativePath,
        replacements: observed,
        beforeHash: `sha256:${sha256Bytes(originalBytes)}`,
        afterHash: `sha256:${sha256Bytes(editedBytes)}`,
      };
    },
  };
}

export function createBashTool(): ImmutableToolImplementation {
  return {
    toolId: "shell.bash",
    name: "bash",
    implementationHash: implementationHash("shell.bash"),
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["command"],
      properties: {
        command: { type: "string", minLength: 1, maxLength: 32768 },
      },
    },
    async execute(argumentsValue, context): Promise<JsonValue> {
      const result = await context.processRunner.runShell(
        stringArgument(argumentsValue, "command"),
        context.abortSignal,
      );
      return {
        exitCode: result.exitCode,
        signal: result.signal,
        stdout: result.stdout,
        stderr: result.stderr,
        timedOut: result.timedOut,
      };
    },
  };
}

async function runGit(
  args: readonly string[],
  context: ToolExecutionContext,
): Promise<JsonValue> {
  const result = await context.processRunner.runExecutable(
    "/usr/bin/git",
    [
      "-c",
      "core.pager=cat",
      "-c",
      "pager.status=false",
      "-c",
      "pager.diff=false",
      "--no-optional-locks",
      ...args,
    ],
    context.abortSignal,
  );
  return {
    exitCode: result.exitCode,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

export function createGitStatusTool(): ImmutableToolImplementation {
  return {
    toolId: "git.status",
    name: "git_status",
    implementationHash: implementationHash("git.status"),
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: [],
      properties: {},
    },
    async execute(_argumentsValue, context): Promise<JsonValue> {
      return runGit(["status", "--porcelain=v2", "--untracked-files=all"], context);
    },
  };
}

export function createGitDiffTool(): ImmutableToolImplementation {
  return {
    toolId: "git.diff",
    name: "git_diff",
    implementationHash: implementationHash("git.diff"),
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["staged"],
      properties: {
        staged: { type: "boolean" },
      },
    },
    async execute(argumentsValue, context): Promise<JsonValue> {
      const staged = booleanArgument(argumentsValue, "staged");
      return runGit(
        [
          "diff",
          "--no-ext-diff",
          "--no-color",
          "--src-prefix=a/",
          "--dst-prefix=b/",
          ...(staged ? ["--cached"] : []),
        ],
        context,
      );
    },
  };
}

export function registerBuiltinTools(
  register: (tool: ImmutableToolImplementation) => void,
): readonly ImmutableToolImplementation[] {
  const tools = [
    createReadTool(),
    createWriteTool(),
    createEditTool(),
    createBashTool(),
    createGitStatusTool(),
    createGitDiffTool(),
  ];
  tools.forEach(register);
  return tools;
}
