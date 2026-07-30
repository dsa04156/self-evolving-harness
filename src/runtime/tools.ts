import { Ajv2020, type ValidateFunction } from "ajv/dist/2020.js";

import { canonicalBytes, sha256, type JsonValue } from "../core/canonical.js";
import { HarnessError, asHarnessError, assertCondition } from "../core/errors.js";
import type { ModelTool } from "../domain/model.js";
import type { ToolCallRequest, ToolExecutionResult } from "../domain/runtime.js";
import type { ArtifactStore } from "../storage/artifact-store.js";
import type { BudgetAccount } from "./budget.js";
import type { BubblewrapProcessRunner } from "./sandbox-process.js";
import type { WorkspacePathGuard } from "./path-guard.js";

export type JsonObject = { readonly [key: string]: JsonValue };

function assertToolAuthority(abortSignal?: AbortSignal): void {
  if (abortSignal?.aborted === true) {
    throw new HarnessError("DEADLINE_EXCEEDED", "Tool authority was revoked");
  }
}

export interface ToolExecutionContext {
  readonly workspace: WorkspacePathGuard;
  readonly processRunner: BubblewrapProcessRunner;
  readonly abortSignal?: AbortSignal;
}

export interface ImmutableToolImplementation {
  readonly toolId: string;
  readonly name: string;
  readonly implementationHash: string;
  readonly inputSchema: JsonObject;
  execute(argumentsValue: JsonObject, context: ToolExecutionContext): Promise<JsonValue>;
}

export interface ToolDescriptionBinding {
  readonly toolId: string;
  readonly name: string;
  readonly description: string;
  readonly implementationHash: string;
  readonly inputSchemaHash: string;
}

interface RegisteredTool {
  readonly implementation: ImmutableToolImplementation;
  readonly validator: ValidateFunction;
  readonly inputSchemaHash: string;
}

export interface ToolPermissionPolicy {
  readonly policyHash: string;
  readonly allowedToolIds: readonly string[];
}

export class ToolRegistry {
  readonly #toolsById = new Map<string, RegisteredTool>();
  readonly #toolIdByName = new Map<string, string>();
  #sealed = false;

  public register(implementation: ImmutableToolImplementation): void {
    assertCondition(!this.#sealed, "CONFLICT", "Tool registry is sealed");
    assertCondition(!this.#toolsById.has(implementation.toolId), "CONFLICT", "Duplicate tool ID");
    assertCondition(!this.#toolIdByName.has(implementation.name), "CONFLICT", "Duplicate tool name");
    const ajv = new Ajv2020({
      allErrors: true,
      coerceTypes: false,
      removeAdditional: false,
      strict: true,
      strictRequired: false,
      strictTypes: false,
      useDefaults: false,
    });
    const validator = ajv.compile(implementation.inputSchema);
    this.#toolsById.set(implementation.toolId, {
      implementation,
      validator,
      inputSchemaHash: sha256(implementation.inputSchema),
    });
    this.#toolIdByName.set(implementation.name, implementation.toolId);
  }

  public seal(): void {
    assertCondition(this.#toolsById.size > 0, "SCHEMA_INVALID", "Cannot seal empty tool registry");
    this.#sealed = true;
  }

  public modelCatalog(descriptions: readonly ToolDescriptionBinding[]): readonly ModelTool[] {
    assertCondition(this.#sealed, "INTERNAL_ERROR", "Tool registry must be sealed");
    const seen = new Set<string>();
    return descriptions.map((description) => {
      assertCondition(!seen.has(description.toolId), "SCHEMA_INVALID", "Duplicate tool description");
      seen.add(description.toolId);
      const registered = this.#toolsById.get(description.toolId);
      assertCondition(registered !== undefined, "TOOL_NOT_FOUND", "Description has no implementation");
      assertCondition(
        registered.implementation.name === description.name,
        "HASH_MISMATCH",
        "Tool description name mismatch",
      );
      assertCondition(
        registered.implementation.implementationHash === description.implementationHash,
        "HASH_MISMATCH",
        "Tool implementation binding mismatch",
      );
      assertCondition(
        registered.inputSchemaHash === description.inputSchemaHash,
        "HASH_MISMATCH",
        "Tool input-schema binding mismatch",
      );
      return {
        toolId: description.toolId,
        name: description.name,
        description: description.description,
        inputSchema: registered.implementation.inputSchema,
        strict: true,
      };
    });
  }

  public resolveByName(name: string): RegisteredTool {
    const toolId = this.#toolIdByName.get(name);
    const registered = toolId === undefined ? undefined : this.#toolsById.get(toolId);
    if (registered === undefined) {
      throw new HarnessError("TOOL_NOT_FOUND", `Unknown tool ${name}`);
    }
    return registered;
  }

  public hasToolId(toolId: string): boolean {
    return this.#toolsById.has(toolId);
  }
}

export class ToolExecutor {
  readonly #registry: ToolRegistry;
  readonly #permissions: ToolPermissionPolicy;
  readonly #budget: BudgetAccount;
  readonly #artifacts: ArtifactStore;
  readonly #context: ToolExecutionContext;
  readonly #clock: { monotonicNanos(): bigint };

  public constructor(input: {
    registry: ToolRegistry;
    permissions: ToolPermissionPolicy;
    budget: BudgetAccount;
    artifacts: ArtifactStore;
    context: ToolExecutionContext;
    clock: { monotonicNanos(): bigint };
  }) {
    this.#registry = input.registry;
    this.#permissions = input.permissions;
    this.#budget = input.budget;
    this.#artifacts = input.artifacts;
    this.#context = input.context;
    this.#clock = input.clock;
  }

  public async execute(
    call: ToolCallRequest,
    abortSignal?: AbortSignal,
  ): Promise<ToolExecutionResult> {
    const started = this.#clock.monotonicNanos();
    let registered: RegisteredTool;
    try {
      assertToolAuthority(abortSignal);
      registered = this.#registry.resolveByName(call.toolName);
      assertCondition(
        this.#permissions.allowedToolIds.includes(registered.implementation.toolId),
        "AUTHORIZATION_DENIED",
        `Tool ${call.toolName} is outside the session grant`,
      );
      assertCondition(
        typeof call.arguments === "object" &&
          call.arguments !== null &&
          !Array.isArray(call.arguments),
        "SCHEMA_INVALID",
        "Tool arguments must be an object",
      );
      assertCondition(
        registered.validator(call.arguments),
        "SCHEMA_INVALID",
        registered.validator.errors?.map((error) => error.message).join("; ") ??
          "Invalid tool arguments",
      );
      this.#budget.reserveToolCall();
      const output = await registered.implementation.execute(
        call.arguments as JsonObject,
        {
          ...this.#context,
          ...(abortSignal === undefined ? {} : { abortSignal }),
        },
      );
      assertToolAuthority(abortSignal);
      const artifact = await this.#artifacts.putJson(output);
      const elapsed = Number((this.#clock.monotonicNanos() - started) / 1_000_000n);
      return {
        callId: call.callId,
        toolName: call.toolName,
        ok: true,
        output,
        artifactHashes: [artifact.contentHash],
        durationMillis: elapsed,
      };
    } catch (error) {
      const failure = asHarnessError(error);
      if (abortSignal?.aborted === true) throw failure;
      const elapsed = Number((this.#clock.monotonicNanos() - started) / 1_000_000n);
      const safeOutput: JsonValue = {
        error: {
          code: failure.code,
          detail: failure.safeDetail,
          retryable: failure.retryable,
        },
      };
      await this.#artifacts.put(canonicalBytes(safeOutput), "application/json");
      return {
        callId: call.callId,
        toolName: call.toolName,
        ok: false,
        output: safeOutput,
        artifactHashes: [],
        durationMillis: elapsed,
        errorCode: failure.code,
      };
    }
  }
}
