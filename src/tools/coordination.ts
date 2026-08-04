import { sha256Bytes, type JsonValue } from "../core/canonical.js";
import { assertCondition } from "../core/errors.js";
import type {
  ImmutableToolImplementation,
  JsonObject,
  ToolExecutionContext,
} from "../runtime/tools.js";

const IMPLEMENTATION_PREFIX = "sha256:";

function implementationHash(id: string): string {
  return `${IMPLEMENTATION_PREFIX}${sha256Bytes(Buffer.from(`seh-tool-v1:${id}`, "utf8"))}`;
}

function stringArgument(argumentsValue: JsonObject, name: string): string {
  const value = argumentsValue[name];
  assertCondition(typeof value === "string", "SCHEMA_INVALID", `${name} must be a string`);
  return value;
}

function coordination(context: ToolExecutionContext) {
  assertCondition(
    context.coordination !== undefined,
    "AUTHORIZATION_DENIED",
    "This runtime has no descendant coordination authority",
  );
  return context.coordination;
}

const DESCENDANT_ID: JsonValue = {
  type: "string",
  minLength: 1,
  maxLength: 256,
  pattern: "^[A-Za-z0-9._:-]+$",
};

export const COORDINATION_TOOL_IDS = Object.freeze([
  "agent.spawn",
  "backend-job.start",
  "descendant.wait",
  "descendant.list",
  "descendant.cancel",
] as const);

export function createSpawnAgentTool(): ImmutableToolImplementation {
  return {
    toolId: "agent.spawn",
    name: "spawn_agent",
    implementationHash: implementationHash("agent.spawn"),
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["task"],
      properties: {
        task: { type: "string", minLength: 1, maxLength: 64 * 1024 },
      },
    },
    execute(argumentsValue, context): Promise<JsonValue> {
      return coordination(context).spawnAgent(
        stringArgument(argumentsValue, "task"),
        context.abortSignal,
      );
    },
  };
}

export function createStartJobTool(): ImmutableToolImplementation {
  return {
    toolId: "backend-job.start",
    name: "start_job",
    implementationHash: implementationHash("backend-job.start"),
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["command"],
      properties: {
        command: { type: "string", minLength: 1, maxLength: 32 * 1024 },
      },
    },
    execute(argumentsValue, context): Promise<JsonValue> {
      return coordination(context).startJob(
        stringArgument(argumentsValue, "command"),
        context.abortSignal,
      );
    },
  };
}

export function createWaitDescendantTool(): ImmutableToolImplementation {
  return {
    toolId: "descendant.wait",
    name: "wait_job",
    implementationHash: implementationHash("descendant.wait"),
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["id"],
      properties: { id: DESCENDANT_ID },
    },
    execute(argumentsValue, context): Promise<JsonValue> {
      return coordination(context).wait(
        stringArgument(argumentsValue, "id"),
        context.abortSignal,
      );
    },
  };
}

export function createListDescendantsTool(): ImmutableToolImplementation {
  return {
    toolId: "descendant.list",
    name: "list_jobs",
    implementationHash: implementationHash("descendant.list"),
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: [],
      properties: {},
    },
    execute(_argumentsValue, context): Promise<JsonValue> {
      return coordination(context).list();
    },
  };
}

export function createCancelDescendantTool(): ImmutableToolImplementation {
  return {
    toolId: "descendant.cancel",
    name: "cancel_job",
    implementationHash: implementationHash("descendant.cancel"),
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["id"],
      properties: { id: DESCENDANT_ID },
    },
    execute(argumentsValue, context): Promise<JsonValue> {
      return coordination(context).cancel(stringArgument(argumentsValue, "id"));
    },
  };
}

export function createCoordinationTools(): readonly ImmutableToolImplementation[] {
  return [
    createSpawnAgentTool(),
    createStartJobTool(),
    createWaitDescendantTool(),
    createListDescendantsTool(),
    createCancelDescendantTool(),
  ];
}
