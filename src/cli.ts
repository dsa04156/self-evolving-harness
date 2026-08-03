#!/usr/bin/env node

import { access, mkdir, mkdtemp, readFile } from "node:fs/promises";
import path from "node:path";

import {
  DeterministicClock,
  DeterministicIdFactory,
  FakeModelProvider,
  FakeTaskVerifier,
  HarnessError,
  PrincipalSigner,
  SchemaRegistry,
  createManagedStandaloneRuntime,
  passingVerification,
  productUsage,
  runProductCommand,
  sha256,
  type ModelResponse,
} from "./index.js";

function digest(label: string): string {
  return sha256({ label });
}

function response(
  responseId: string,
  output: ModelResponse["output"],
): ModelResponse {
  return {
    responseId,
    modelIdentity: "fake:deterministic-demo-v1",
    output,
    usage: {
      inputTokens: 10,
      outputTokens: 5,
      reasoningTokens: 0,
      cachedInputTokens: 0,
      totalTokens: 15,
    },
    providerMetadata: { deterministic: true },
  };
}

async function assertPathDoesNotExist(candidate: string): Promise<void> {
  try {
    await access(candidate);
  } catch {
    return;
  }
  throw new HarnessError(
    "CONFLICT",
    `Refusing to reuse existing demo root ${candidate}`,
  );
}

async function demo(explicitRoot: string | undefined): Promise<void> {
  const localState = path.resolve(".seh");
  await mkdir(localState, { recursive: true, mode: 0o700 });
  const root =
    explicitRoot === undefined
      ? await mkdtemp(path.join(localState, "demo-"))
      : path.resolve(explicitRoot);
  if (explicitRoot !== undefined) {
    await assertPathDoesNotExist(root);
    await mkdir(root, { recursive: false, mode: 0o700 });
  }
  const schemas = await SchemaRegistry.load(path.resolve("schemas"));
  const clock = new DeterministicClock();
  const ids = new DeterministicIdFactory();
  const runtimeSigner = PrincipalSigner.generate({
    principalId: "runtime.cli-demo",
    role: "runtime",
    implementationDigest: digest("runtime.cli-demo"),
    instanceId: "runtime.cli-demo.instance",
  });
  const operationsSigner = PrincipalSigner.generate({
    principalId: "operations.cli-demo",
    role: "operations_owner",
    implementationDigest: digest("operations.cli-demo"),
    instanceId: "operations.cli-demo.instance",
  });
  const auditSigner = PrincipalSigner.generate({
    principalId: "audit.cli-demo",
    role: "audit_store",
    implementationDigest: digest("audit.cli-demo"),
    instanceId: "audit.cli-demo.instance",
  });
  const provider = new FakeModelProvider([
    response("response-demo-write", [
      {
        kind: "tool_call",
        callId: "call-demo-write",
        toolName: "write",
        arguments: {
          path: "demo-output.txt",
          content: "harness-ok\n",
          overwrite: false,
        },
        rawArguments:
          "{\"path\":\"demo-output.txt\",\"content\":\"harness-ok\\n\",\"overwrite\":false}",
      },
    ]),
    response("response-demo-complete", [
      {
        kind: "assistant_message",
        text: "Created and verified demo-output.txt.",
      },
    ]),
  ]);
  const verifier = new FakeTaskVerifier(
    digest("verifier.cli-demo"),
    async ({ workspaceRoot }) => {
      const content = await readFile(
        path.join(workspaceRoot, "demo-output.txt"),
        "utf8",
      );
      if (content !== "harness-ok\n") {
        return {
          passed: false,
          summary: "demo-output.txt does not match the deterministic contract",
          evidence: { observedHash: digest(content) },
          retryable: false,
        };
      }
      return passingVerification("demo artifact matches the deterministic contract");
    },
  );
  const runtime = await createManagedStandaloneRuntime({
    root,
    schemas,
    provider,
    verifier,
    sessionId: "session.cli-demo.1",
    pins: {
      protocolId: `protocol-sha256:${digest("protocol.cli-demo").slice(7)}`,
      harnessVersionId: `hv-sha256:${digest("harness.cli-demo").slice(7)}`,
      runtimeStateSnapshotId: `rss-sha256:${digest("snapshot.cli-demo").slice(7)}`,
      modelIdentityHash: digest("fake:deterministic-demo-v1"),
      permissionPolicyHash: digest("permission.cli-demo"),
      safetyPolicyHash: digest("safety.cli-demo"),
      budgetPolicyHash: digest("budget.cli-demo"),
      budgetAccountId: "budget.cli-demo.1",
      datasetPermissions: ["deterministic"],
    },
    modelIdentity: "fake:deterministic-demo-v1",
    runtimeSigner,
    operationsSigner,
    auditSigner,
    budgetLimits: {
      maxModelCalls: 4,
      maxInputTokens: 4096,
      maxOutputTokens: 1024,
      maxToolCalls: 2,
      maxWallClockMillis: 60_000,
      maxRetries: 0,
      maxDescendants: 0,
    },
    clock,
    ids,
    prompt: {
      sections: [
        {
          sectionId: "identity",
          purpose: "identity",
          content: "You are the deterministic standalone harness demo agent.",
        },
        {
          sectionId: "completion",
          purpose: "completion",
          content: "Finish only after the external verifier is invoked.",
        },
      ],
    },
    contextPolicy: {
      totalTokenLimit: 2048,
      sources: [
        {
          source: "system_prompt",
          priority: 100,
          maxTokens: 512,
          selection: "all_in_order",
        },
        {
          source: "task_input",
          priority: 90,
          maxTokens: 512,
          selection: "all_in_order",
        },
        {
          source: "selected_memory",
          priority: 80,
          maxTokens: 256,
          selection: "deterministic_rank",
        },
        {
          source: "selected_skills",
          priority: 70,
          maxTokens: 256,
          selection: "all_in_order",
        },
        {
          source: "tool_catalog",
          priority: 60,
          maxTokens: 1024,
          selection: "all_in_order",
        },
      ],
      overflowPolicy: "block",
    },
    skills: [
      {
        schemaVersion: 1,
        language: "seh.skill.v1",
        skillId: "deterministic_file_write",
        summary: "Create the requested file and rely on external verification.",
        allowedToolIds: ["filesystem.write"],
        steps: [
          {
            stepId: "write",
            kind: "tool_guidance",
            instruction: "Use the write tool with the exact requested bytes.",
            toolId: "filesystem.write",
          },
        ],
        completionChecks: ["The external verifier reports success."],
      },
    ],
    allowedToolIds: ["filesystem.read", "filesystem.write"],
    memoryPolicy: {
      readableNamespaces: ["project_facts"],
      queryMode: "lexical",
      maxRecords: 4,
      maxTokens: 256,
      minimumScoreMicros: 0,
      tieBreak: "record_id_ascending",
    },
    initialMemory: [
      {
        namespace: "project_facts",
        content: "The deterministic demo artifact must contain harness-ok.",
        authority: "operator_approved",
      },
    ],
  });
  const execution = await runtime.execute(
    "Create demo-output.txt containing exactly harness-ok followed by a newline.",
  );
  await runtime.verify();
  const result = execution.result;
  process.stdout.write(
    `${JSON.stringify(
      {
        root,
        workspaceRoot: runtime.kernel.workspaceRoot,
        state: result.state,
        sessionState: execution.finalize?.state ?? execution.submit.state,
        verificationPassed: result.verification?.passed ?? false,
        modelCalls: result.usage.modelCalls,
        toolCalls: result.usage.toolCalls,
        eventCount: result.eventCount,
        eventHeadHash: result.eventHeadHash,
        evidenceReceipts: execution.start.evidence.length +
          execution.submit.evidence.length +
          (execution.finalize?.evidence.length ?? 0),
      },
      null,
      2,
    )}\n`,
  );
  if (
    result.state !== "completed" ||
    result.verification?.passed !== true ||
    execution.finalize?.state !== "retired"
  ) {
    process.exitCode = 1;
  }
}

function usage(): void {
  process.stdout.write(productUsage());
}

async function main(): Promise<void> {
  const [command = "help", ...arguments_] = process.argv.slice(2);
  if (command === "version" || command === "--version" || command === "-V") {
    process.stdout.write("0.2.0\n");
    return;
  }
  if (command === "help" || command === "--help" || command === "-h") {
    usage();
    return;
  }
  if (arguments_.includes("--help") || arguments_.includes("-h")) {
    usage();
    return;
  }
  if (command === "check-schemas") {
    const schemas = await SchemaRegistry.load(path.resolve("schemas"));
    schemas.assertAllCompiled();
    process.stdout.write(
      `${JSON.stringify({ compiledSchemas: schemas.schemaIds.length })}\n`,
    );
    return;
  }
  if (command === "demo") {
    const rootFlag = arguments_.indexOf("--root");
    const explicitRoot =
      rootFlag === -1 ? undefined : arguments_[rootFlag + 1];
    if (rootFlag !== -1 && explicitRoot === undefined) {
      throw new HarnessError("SCHEMA_INVALID", "--root requires a path");
    }
    await demo(explicitRoot);
    return;
  }
  process.exitCode = await runProductCommand(command, arguments_);
}

main().catch((error: unknown) => {
  const message =
    error instanceof HarnessError
      ? `${error.code}: ${error.safeDetail}`
      : error instanceof Error
        ? error.message
        : "Unknown CLI failure";
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
