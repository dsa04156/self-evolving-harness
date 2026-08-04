import path from "node:path";

import { sha256, type JsonValue } from "../core/canonical.js";
import { assertCondition } from "../core/errors.js";
import { SchemaRegistry } from "../contracts/schema-registry.js";
import type { HarnessVersionManifest } from "../domain/components.js";
import type { BudgetLimits } from "../domain/runtime.js";
import { HarnessComponentRegistry } from "../harness/component-registry.js";
import type { ContextPolicy, PromptPayload } from "../runtime/context.js";
import type { MemoryRetrievalPolicy } from "../runtime/memory.js";
import type { DeclarativeRoutingPolicy } from "../runtime/routing.js";
import type { DeclarativeSkill } from "../runtime/skills.js";
import type { ToolDescriptionBinding } from "../runtime/tools.js";
import type { DeclarativeWorkflowPolicy } from "../runtime/workflow.js";
import { ArtifactStore } from "../storage/artifact-store.js";
import { registerBuiltinTools } from "../tools/builtins.js";
import type {
  PermissionMode,
  ProductConfig,
  ProductProviderConfig,
  ProductStatePaths,
} from "./config.js";
import {
  PRODUCT_RUNTIME_VERSION,
  allowedToolIds,
  codingContextPolicy,
  codingMemoryPolicy,
  codingPrompt,
  codingRoutingPolicy,
  codingSkill,
  codingSubagentPrompt,
  codingToolDescriptions,
  codingWorkflowPolicy,
} from "./defaults.js";
import { bundledConfigsPath, bundledSchemasPath } from "./resources.js";

const PRODUCT_COMPONENT_VERSION = "0.8.0";

export const PRODUCT_RUNTIME_CONTRACT_HASH = sha256({
  contract: "seh.product-runtime-contract.v1",
  productRuntime: PRODUCT_RUNTIME_VERSION,
  authority: "seh-native-runtime",
  executionLoop: "context-model-tools-verification-v1",
  workflowRuntime: "closed-declarative-workflow-v1",
  routingRuntime: "closed-declarative-routing-v1",
  eventAuthority: "runtime-event-stream-v1",
  forbiddenBackends: ["codex", "codex-app-server", "gajae-code", "opencode"],
});

export interface ProductExecutionConfig {
  readonly provider: ProductProviderConfig;
  readonly permissionMode: PermissionMode;
  readonly budget: BudgetLimits;
  readonly process: ProductConfig["process"];
  readonly verification: ProductConfig["verification"];
  readonly prompt: PromptPayload;
  readonly contextPolicy: ContextPolicy;
  readonly memoryPolicy: MemoryRetrievalPolicy;
  readonly skills: readonly DeclarativeSkill[];
  readonly toolDescriptions: readonly ToolDescriptionBinding[];
  readonly allowedToolIds: readonly string[];
  readonly workflowPolicy: DeclarativeWorkflowPolicy;
  readonly routingPolicy: DeclarativeRoutingPolicy;
  readonly subagentPrompt: PromptPayload;
}

export interface MaterializedProductHarness {
  readonly manifest: HarnessVersionManifest;
  readonly execution: ProductExecutionConfig;
}

interface ComponentSpec {
  readonly slotId: string;
  readonly componentId: string;
  readonly typeEntryId: string;
  readonly payloadLanguage: string;
  readonly payload: JsonValue;
  readonly capabilityIds: readonly string[];
  readonly dependencySlots?: readonly string[];
}

function record(value: JsonValue, detail: string): Record<string, JsonValue> {
  assertCondition(
    typeof value === "object" && value !== null && !Array.isArray(value),
    "SCHEMA_INVALID",
    detail,
  );
  return value;
}

function array(value: JsonValue | undefined, detail: string): JsonValue[] {
  assertCondition(Array.isArray(value), "SCHEMA_INVALID", detail);
  return value;
}

function string(value: JsonValue | undefined, detail: string): string {
  assertCondition(typeof value === "string" && value.length > 0, "SCHEMA_INVALID", detail);
  return value;
}

function integer(value: JsonValue | undefined, detail: string): number {
  assertCondition(Number.isSafeInteger(value), "SCHEMA_INVALID", detail);
  return value as number;
}

function policyPayload(policyType: string, policy: JsonValue): JsonValue {
  return {
    schemaVersion: 1,
    language: "seh.policy-json.v1",
    policyType,
    policy,
  };
}

function json(value: unknown): JsonValue {
  return structuredClone(value) as JsonValue;
}

function promptPayload(prompt: PromptPayload): JsonValue {
  return json({
    schemaVersion: 1,
    language: "seh.prompt-markdown.v1",
    sections: prompt.sections,
    contextBindings: [
      "task_input",
      "tool_catalog",
      "selected_memory",
      "selected_skills",
      "verification_feedback",
    ],
  });
}

function subagentPromptPayload(prompt: PromptPayload): JsonValue {
  return json({
    schemaVersion: 1,
    language: "seh.prompt-markdown.v1",
    sections: prompt.sections,
    contextBindings: ["task_input", "tool_catalog", "selected_memory", "selected_skills"],
  });
}

function contextPayload(policy: ContextPolicy): JsonValue {
  return json({
    schemaVersion: 1,
    language: "seh.context-policy.v1",
    ...policy,
  });
}

function memoryPayload(policy: MemoryRetrievalPolicy): JsonValue {
  return json({
    schemaVersion: 2,
    language: "seh.memory-retrieval-policy.v1",
    ...policy,
  });
}

function immutableArtifact(
  kind:
    | "runtime_module"
    | "tool_implementation"
    | "evaluator_binary"
    | "trace_collector"
    | "middleware",
  identityHash: string,
  entrypoint: string,
): JsonValue {
  return {
    schemaVersion: 1,
    language: "seh.immutable-artifact.v1",
    kind,
    artifact: {
      contentHash: identityHash,
      mediaType: "application/octet-stream",
      sizeBytes: 0,
    },
    entrypoint,
    toolchainDigest: PRODUCT_RUNTIME_CONTRACT_HASH,
  };
}

function versionFor(value: JsonValue): string {
  return `${PRODUCT_COMPONENT_VERSION}+${sha256(value).slice("sha256:".length, 19)}`;
}

function executionFromConfig(
  config: ProductConfig,
  additionalSkills: readonly DeclarativeSkill[],
): ProductExecutionConfig {
  const coordinationEnabled = config.budget.maxDescendants > 0;
  const grantedToolIds = allowedToolIds(config.permissionMode, coordinationEnabled);
  const skills = [codingSkill(config.permissionMode, coordinationEnabled), ...additionalSkills];
  assertCondition(
    new Set(skills.map((skill) => skill.skillId)).size === skills.length,
    "CONFLICT",
    "Active skills contain a duplicate skill ID",
  );
  assertCondition(
    skills.every((skill) =>
      skill.allowedToolIds.every((toolId) => grantedToolIds.includes(toolId)),
    ),
    "AUTHORIZATION_DENIED",
    "An active skill requests a tool outside the session grant",
  );
  return {
    provider: structuredClone(config.provider),
    permissionMode: config.permissionMode,
    budget: structuredClone(config.budget),
    process: structuredClone(config.process),
    verification: structuredClone(config.verification),
    prompt: codingPrompt(config.permissionMode, coordinationEnabled),
    contextPolicy: codingContextPolicy(config.contextTokenLimit),
    memoryPolicy: codingMemoryPolicy(),
    skills,
    toolDescriptions: codingToolDescriptions(config.permissionMode, coordinationEnabled),
    allowedToolIds: grantedToolIds,
    workflowPolicy: codingWorkflowPolicy(),
    routingPolicy: codingRoutingPolicy(coordinationEnabled),
    subagentPrompt: codingSubagentPrompt(),
  };
}

function componentSpecs(execution: ProductExecutionConfig): ComponentSpec[] {
  const specs: ComponentSpec[] = [];
  const implementationById = new Map(
    registerBuiltinTools(() => undefined).map((tool) => [tool.toolId, tool]),
  );
  for (const description of execution.toolDescriptions) {
    const implementation = implementationById.get(description.toolId);
    assertCondition(
      implementation !== undefined &&
        implementation.implementationHash === description.implementationHash &&
        sha256(implementation.inputSchema) === description.inputSchemaHash,
      "PROTOCOL_MISMATCH",
      `Tool binding does not match the immutable implementation: ${description.toolId}`,
    );
    const implementationSlot = `tool_implementation.${description.toolId}`;
    specs.push({
      slotId: implementationSlot,
      componentId: `product.tool-implementation.${description.toolId}`,
      typeEntryId: "type.tool-implementation",
      payloadLanguage: "seh.immutable-artifact.v1",
      payload: immutableArtifact(
        "tool_implementation",
        implementation.implementationHash,
        `seh/builtin/${description.toolId}`,
      ),
      capabilityIds: ["tool.execute"],
    });
    specs.push({
      slotId: `tool_description.${description.toolId}`,
      componentId: `product.tool-description.${description.toolId}`,
      typeEntryId: "type.tool-description",
      payloadLanguage: "seh.tool-description.v1",
      payload: {
        schemaVersion: 1,
        language: "seh.tool-description.v1",
        toolId: description.toolId,
        implementationSchemaHash: description.inputSchemaHash,
        summary: description.description,
        usageNotes: [],
        parameterDescriptions: [],
      },
      capabilityIds: ["tool.describe.existing"],
      dependencySlots: [implementationSlot],
    });
  }
  const toolDescriptionSlots = execution.toolDescriptions.map(
    (description) => `tool_description.${description.toolId}`,
  );
  specs.push(
    {
      slotId: "system_prompt",
      componentId: "product.system-prompt",
      typeEntryId: "type.system-prompt",
      payloadLanguage: "seh.prompt-markdown.v1",
      payload: promptPayload(execution.prompt),
      capabilityIds: ["prompt.instruct.primary"],
    },
    {
      slotId: "context_policy",
      componentId: "product.context-policy",
      typeEntryId: "type.context-policy",
      payloadLanguage: "seh.context-policy.v1",
      payload: contextPayload(execution.contextPolicy),
      capabilityIds: [
        "context.read.memory",
        "context.read.session",
        "context.read.skills",
        "context.read.task",
        "context.read.tool-catalog",
        "context.read.tool-results",
        "context.read.verification",
      ],
      dependencySlots: toolDescriptionSlots,
    },
    {
      slotId: "memory_retrieval_policy",
      componentId: "product.memory-retrieval-policy",
      typeEntryId: "type.memory-retrieval-policy",
      payloadLanguage: "seh.memory-retrieval-policy.v1",
      payload: memoryPayload(execution.memoryPolicy),
      capabilityIds: execution.memoryPolicy.readableNamespaces.map(
        (namespace) => `memory.read.${namespace.replaceAll("_", "-")}`,
      ),
    },
    {
      slotId: "subagent_prompt",
      componentId: "product.subagent-prompt",
      typeEntryId: "type.subagent-prompt",
      payloadLanguage: "seh.prompt-markdown.v1",
      payload: subagentPromptPayload(execution.subagentPrompt),
      capabilityIds: ["prompt.instruct.subagent"],
    },
  );
  for (const skill of execution.skills) {
    specs.push({
      slotId: `skill.${skill.skillId}`,
      componentId: `product.skill.${skill.skillId}`,
      typeEntryId: "type.skill",
      payloadLanguage: "seh.skill.v1",
      payload: skill as unknown as JsonValue,
      capabilityIds: ["skill.guide", "skill.reference.existing-tool"],
      dependencySlots: skill.allowedToolIds.map((toolId) => `tool_description.${toolId}`),
    });
  }
  const skillSlots = execution.skills.map((skill) => `skill.${skill.skillId}`);
  specs.push(
    {
      slotId: "routing_policy",
      componentId: "product.routing-policy",
      typeEntryId: "type.routing-policy",
      payloadLanguage: "seh.routing-policy.v1",
      payload: execution.routingPolicy as unknown as JsonValue,
      capabilityIds: ["routing.select.primary", "routing.select.subagent"],
      dependencySlots: ["subagent_prompt"],
    },
    {
      slotId: "workflow_policy",
      componentId: "product.workflow-policy",
      typeEntryId: "type.workflow-policy",
      payloadLanguage: "seh.workflow.v1",
      payload: execution.workflowPolicy as unknown as JsonValue,
      capabilityIds: ["workflow.dispatch.closed-action"],
      dependencySlots: ["routing_policy", "subagent_prompt", ...skillSlots],
    },
    {
      slotId: "permission_policy",
      componentId: "product.permission-policy",
      typeEntryId: "type.permission-policy",
      payloadLanguage: "seh.policy-json.v1",
      payload: policyPayload("PermissionPolicy", json({
        mode: execution.permissionMode,
        allowedToolIds: execution.allowedToolIds,
        workspaceBoundary: "session_workspace_root",
        shellNetwork: false,
        processLimits: execution.process,
      })),
      capabilityIds: ["permission.authorize"],
    },
    {
      slotId: "safety_policy",
      componentId: "product.safety-policy",
      typeEntryId: "type.safety-policy",
      payloadLanguage: "seh.policy-json.v1",
      payload: policyPayload("SafetyPolicy", {
        profile: "workspace-only-no-network-no-host-secrets-v1",
        untrustedRepositoryContent: true,
        redactProviderSecrets: true,
      }),
      capabilityIds: ["safety.authorize"],
    },
    {
      slotId: "budget_policy",
      componentId: "product.budget-policy",
      typeEntryId: "type.budget-policy",
      payloadLanguage: "seh.policy-json.v1",
      payload: policyPayload("BudgetPolicy", execution.budget as unknown as JsonValue),
      capabilityIds: ["budget.enforce"],
    },
    {
      slotId: "model_identity",
      componentId: "product.model-identity",
      typeEntryId: "type.model-identity",
      payloadLanguage: "seh.policy-json.v1",
      payload: policyPayload("ModelIdentity", execution.provider as unknown as JsonValue),
      capabilityIds: ["model.invoke.pinned"],
    },
    {
      slotId: "verification_policy",
      componentId: "product.verification-policy",
      typeEntryId: "type.verification-policy",
      payloadLanguage: "seh.policy-json.v1",
      payload: policyPayload(
        "VerificationPolicy",
        execution.verification as unknown as JsonValue,
      ),
      capabilityIds: ["verification.request"],
    },
    {
      slotId: "recovery_policy",
      componentId: "product.recovery-policy",
      typeEntryId: "type.recovery-policy",
      payloadLanguage: "seh.policy-json.v1",
      payload: policyPayload("RecoveryPolicy", {
        retryBudget: execution.budget.maxRetries,
        strategy: "verify-classify-reenter-context-v1",
      }),
      capabilityIds: ["recovery.classify", "recovery.resume"],
    },
    {
      slotId: "audit_policy",
      componentId: "product.audit-policy",
      typeEntryId: "type.audit-policy",
      payloadLanguage: "seh.policy-json.v1",
      payload: policyPayload("AuditPolicy", {
        appendOnly: true,
        hashChain: "sha256",
        authority: "signed-runtime-events",
      }),
      capabilityIds: ["audit.append", "audit.verify"],
    },
    {
      slotId: "memory_policy",
      componentId: "product.memory-policy",
      typeEntryId: "type.memory-policy",
      payloadLanguage: "seh.policy-json.v1",
      payload: policyPayload("MemoryPolicy", {
        storage: "filesystem",
        crossSession: true,
        authority: "untrusted_context",
      }),
      capabilityIds: ["memory.admin"],
    },
    {
      slotId: "subagent_configuration",
      componentId: "product.subagent-configuration",
      typeEntryId: "type.subagent-configuration",
      payloadLanguage: "seh.policy-json.v1",
      payload: policyPayload("SubagentConfiguration", {
        maxDescendants: execution.budget.maxDescendants,
        recursiveDelegation: false,
        permissionWidening: false,
      }),
      capabilityIds: ["subagent.configure"],
      dependencySlots: ["subagent_prompt"],
    },
    {
      slotId: "evaluator",
      componentId: "product.evaluator",
      typeEntryId: "type.evaluator",
      payloadLanguage: "seh.immutable-artifact.v1",
      payload: immutableArtifact(
        "evaluator_binary",
        sha256({ module: "seh-external-evaluator-v1" }),
        "seh/evaluator/external-process",
      ),
      capabilityIds: ["evaluation.read.opaque-task", "evaluation.write.result"],
    },
    {
      slotId: "trace_collector",
      componentId: "product.trace-collector",
      typeEntryId: "type.trace-collector",
      payloadLanguage: "seh.immutable-artifact.v1",
      payload: immutableArtifact(
        "trace_collector",
        sha256({ module: "seh-runtime-event-stream-v1" }),
        "seh/evidence/runtime-event-stream",
      ),
      capabilityIds: ["trace.collect"],
    },
    {
      slotId: "middleware",
      componentId: "product.middleware",
      typeEntryId: "type.middleware",
      payloadLanguage: "seh.immutable-artifact.v1",
      payload: immutableArtifact(
        "middleware",
        sha256({ module: "seh-product-runtime-middleware-v1" }),
        "seh/runtime/middleware",
      ),
      capabilityIds: ["runtime.middleware"],
    },
  );
  return specs;
}

function promptFromPayload(value: JsonValue): PromptPayload {
  const payload = record(value, "Prompt payload is not an object");
  return {
    sections: array(payload["sections"], "Prompt sections are missing").map((section) => {
      const entry = record(section, "Prompt section is not an object");
      const purpose = string(entry["purpose"], "Prompt section purpose is invalid");
      assertCondition(
        [
          "identity",
          "system_rules",
          "task_method",
          "tool_guidance",
          "completion",
          "recovery",
          "subagent_role",
        ].includes(purpose),
        "SCHEMA_INVALID",
        "Prompt section purpose is invalid",
      );
      return {
        sectionId: string(entry["sectionId"], "Prompt section ID is invalid"),
        purpose: purpose as PromptPayload["sections"][number]["purpose"],
        content: string(entry["content"], "Prompt section content is invalid"),
      };
    }),
  };
}

function policyFromPayload(value: JsonValue, expectedType: string): Record<string, JsonValue> {
  const payload = record(value, `${expectedType} payload is not an object`);
  assertCondition(
    payload["policyType"] === expectedType,
    "PROTOCOL_MISMATCH",
    `Expected ${expectedType} component`,
  );
  return record(payload["policy"] ?? null, `${expectedType} policy is not an object`);
}

function budgetFromPolicy(value: Record<string, JsonValue>): BudgetLimits {
  return {
    maxModelCalls: integer(value["maxModelCalls"], "Invalid model-call budget"),
    maxInputTokens: integer(value["maxInputTokens"], "Invalid input-token budget"),
    maxOutputTokens: integer(value["maxOutputTokens"], "Invalid output-token budget"),
    maxToolCalls: integer(value["maxToolCalls"], "Invalid tool-call budget"),
    maxWallClockMillis: integer(value["maxWallClockMillis"], "Invalid wall-clock budget"),
    maxRetries: integer(value["maxRetries"], "Invalid retry budget"),
    maxDescendants: integer(value["maxDescendants"], "Invalid descendant budget"),
  };
}

export class ProductHarnessRegistry {
  readonly #registry: HarnessComponentRegistry;

  private constructor(registry: HarnessComponentRegistry) {
    this.#registry = registry;
  }

  public static async open(paths: ProductStatePaths): Promise<ProductHarnessRegistry> {
    const schemas = await SchemaRegistry.load(await bundledSchemasPath());
    const root = path.join(paths.projectRoot, "harness-registry");
    const registry = new HarnessComponentRegistry({
      root,
      schemas,
      artifacts: new ArtifactStore(path.join(root, "artifacts")),
    });
    await registry.initialize(
      path.join(await bundledConfigsPath(), "component-type-registry.json"),
    );
    return new ProductHarnessRegistry(registry);
  }

  public async materialize(
    config: ProductConfig,
    additionalSkills: readonly DeclarativeSkill[] = [],
  ): Promise<MaterializedProductHarness> {
    const execution = executionFromConfig(config, additionalSkills);
    const specs = componentSpecs(execution);
    const manifestIdBySlot = new Map<string, string>();
    const remaining = new Map(specs.map((spec) => [spec.slotId, spec]));
    while (remaining.size > 0) {
      let progressed = false;
      for (const [slotId, spec] of [...remaining.entries()].sort(([left], [right]) =>
        left.localeCompare(right),
      )) {
        const dependencySlots = spec.dependencySlots ?? [];
        if (!dependencySlots.every((dependency) => manifestIdBySlot.has(dependency))) continue;
        const identity = {
          typeEntryId: spec.typeEntryId,
          payload: spec.payload,
          capabilityIds: spec.capabilityIds,
          dependencies: dependencySlots.map((dependency) => manifestIdBySlot.get(dependency)!),
        } as unknown as JsonValue;
        const component = await this.#registry.createComponent({
          componentId: spec.componentId,
          semanticVersion: versionFor(identity),
          typeEntryId: spec.typeEntryId,
          payloadLanguage: spec.payloadLanguage,
          payload: spec.payload,
          capabilityIds: spec.capabilityIds,
          dependencyManifestIds: dependencySlots.map(
            (dependency) => manifestIdBySlot.get(dependency)!,
          ),
        });
        manifestIdBySlot.set(slotId, component.componentManifestId);
        remaining.delete(slotId);
        progressed = true;
      }
      assertCondition(progressed, "SCHEMA_INVALID", "Product component dependency cycle");
    }
    const bindingIdentity = [...manifestIdBySlot.entries()].sort(([left], [right]) =>
      left.localeCompare(right),
    );
    const manifest = await this.#registry.createHarness({
      semanticVersion: versionFor(bindingIdentity as unknown as JsonValue),
      requiredRuntimeContractHash: PRODUCT_RUNTIME_CONTRACT_HASH,
      bindings: bindingIdentity.map(([slotId, componentManifestId]) => ({
        slotId,
        componentManifestId,
      })),
    });
    return { manifest, execution };
  }

  public async resolve(harnessVersionId: string): Promise<MaterializedProductHarness> {
    const manifest = this.#registry.getHarness(harnessVersionId);
    assertCondition(
      manifest.identity.requiredRuntimeContractHash === PRODUCT_RUNTIME_CONTRACT_HASH,
      "PROTOCOL_MISMATCH",
      "Pinned HarnessVersion requires another runtime contract",
    );
    const payloadBySlot = new Map<string, JsonValue>();
    const manifestIdBySlot = new Map<string, string>();
    for (const binding of manifest.identity.componentBindings) {
      manifestIdBySlot.set(binding.slotId, binding.component.componentManifestId);
      payloadBySlot.set(
        binding.slotId,
        await this.#registry.getPayload(binding.component.componentManifestId),
      );
    }
    const required = (slotId: string): JsonValue => {
      const value = payloadBySlot.get(slotId);
      assertCondition(value !== undefined, "SCHEMA_INVALID", `Harness is missing ${slotId}`);
      return value;
    };
    const permission = policyFromPayload(required("permission_policy"), "PermissionPolicy");
    const model = policyFromPayload(required("model_identity"), "ModelIdentity");
    const budget = budgetFromPolicy(policyFromPayload(required("budget_policy"), "BudgetPolicy"));
    const verification = policyFromPayload(
      required("verification_policy"),
      "VerificationPolicy",
    );
    const mode = string(permission["mode"], "Permission mode is missing");
    assertCondition(
      mode === "read-only" || mode === "workspace-write",
      "SCHEMA_INVALID",
      "Pinned permission mode is invalid",
    );
    const allowedIds = array(
      permission["allowedToolIds"],
      "Pinned tool grant is invalid",
    ).map((value) => string(value, "Pinned tool ID is invalid"));
    const process = record(permission["processLimits"] ?? null, "Process limits are missing");
    const provider = model as unknown as ProductProviderConfig;
    assertCondition(
      provider.kind === "ollama" || provider.kind === "openai" || provider.kind === "openrouter",
      "SCHEMA_INVALID",
      "Pinned provider kind is invalid",
    );
    const implementationById = new Map(
      registerBuiltinTools(() => undefined).map((tool) => [tool.toolId, tool]),
    );
    const toolDescriptions: ToolDescriptionBinding[] = [];
    for (const toolId of allowedIds) {
      const payload = record(
        required(`tool_description.${toolId}`),
        `Tool description is invalid: ${toolId}`,
      );
      const implementation = implementationById.get(toolId);
      assertCondition(implementation !== undefined, "TOOL_NOT_FOUND", `Unknown pinned tool ${toolId}`);
      const implementationPayload = record(
        required(`tool_implementation.${toolId}`),
        `Tool implementation descriptor is invalid: ${toolId}`,
      );
      const implementationArtifact = record(
        implementationPayload["artifact"] ?? null,
        `Tool implementation artifact is invalid: ${toolId}`,
      );
      assertCondition(
        implementationPayload["kind"] === "tool_implementation" &&
          implementationArtifact["contentHash"] === implementation.implementationHash &&
          implementationPayload["entrypoint"] === `seh/builtin/${toolId}`,
        "PROTOCOL_MISMATCH",
        `Pinned tool implementation differs from this runtime: ${toolId}`,
      );
      const descriptionManifestId = manifestIdBySlot.get(`tool_description.${toolId}`)!;
      const implementationManifestId = manifestIdBySlot.get(`tool_implementation.${toolId}`)!;
      assertCondition(
        this.#registry.dependencyIdsFor(descriptionManifestId).includes(
          implementationManifestId,
        ),
        "PROTOCOL_MISMATCH",
        `Tool description is not bound to its implementation: ${toolId}`,
      );
      const implementationSchemaHash = string(
        payload["implementationSchemaHash"],
        `Tool schema hash is missing: ${toolId}`,
      );
      assertCondition(
        implementationSchemaHash === sha256(implementation.inputSchema),
        "PROTOCOL_MISMATCH",
        `Pinned tool schema differs from this runtime: ${toolId}`,
      );
      toolDescriptions.push({
        toolId,
        name: implementation.name,
        description: string(payload["summary"], `Tool summary is missing: ${toolId}`),
        implementationHash: implementation.implementationHash,
        inputSchemaHash: implementationSchemaHash,
      });
    }
    const skills = [...payloadBySlot.entries()]
      .filter(([slotId]) => slotId.startsWith("skill."))
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([, payload]) => payload as unknown as DeclarativeSkill);
    const context = record(required("context_policy"), "Context policy is invalid");
    const memory = record(
      required("memory_retrieval_policy"),
      "Memory retrieval policy is invalid",
    );
    const { schemaVersion: _contextSchema, language: _contextLanguage, ...contextPolicy } =
      context;
    const { schemaVersion: _memorySchema, language: _memoryLanguage, ...memoryPolicy } =
      memory;
    const execution: ProductExecutionConfig = {
      provider: structuredClone(provider),
      permissionMode: mode,
      budget,
      process: {
        timeoutMillis: integer(process["timeoutMillis"], "Invalid process timeout"),
        maxOutputBytes: integer(process["maxOutputBytes"], "Invalid process output limit"),
        maxCommandBytes: integer(process["maxCommandBytes"], "Invalid process command limit"),
      },
      verification: {
        commands: array(verification["commands"], "Verification commands are invalid").map(
          (value) => string(value, "Verification command is invalid"),
        ),
        timeoutMillis: integer(verification["timeoutMillis"], "Invalid verification timeout"),
        maxOutputBytes: integer(
          verification["maxOutputBytes"],
          "Invalid verification output limit",
        ),
      },
      prompt: promptFromPayload(required("system_prompt")),
      contextPolicy: contextPolicy as unknown as ContextPolicy,
      memoryPolicy: memoryPolicy as unknown as MemoryRetrievalPolicy,
      skills,
      toolDescriptions,
      allowedToolIds: allowedIds,
      workflowPolicy: required("workflow_policy") as unknown as DeclarativeWorkflowPolicy,
      routingPolicy: required("routing_policy") as unknown as DeclarativeRoutingPolicy,
      subagentPrompt: promptFromPayload(required("subagent_prompt")),
    };
    const expectedToolIds = execution.toolDescriptions.map((description) => description.toolId).sort();
    assertCondition(
      JSON.stringify([...execution.allowedToolIds].sort()) === JSON.stringify(expectedToolIds),
      "PROTOCOL_MISMATCH",
      "Pinned tool descriptions do not match the permission grant",
    );
    return { manifest, execution };
  }

  public getManifest(harnessVersionId: string): HarnessVersionManifest {
    return this.#registry.getHarness(harnessVersionId);
  }
}
