import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  DeterministicClock,
  DeterministicIdFactory,
  FakeModelProvider,
  FakeTaskVerifier,
  SchemaRegistry,
  createStandaloneRuntime,
  passingVerification,
  type ModelResponse,
} from "../src/index.js";
import { deterministicPrincipal } from "./helpers/deterministic-principal.js";

const digest = (character: string): string => `sha256:${character.repeat(64)}`;
const protocolId = `protocol-sha256:${"1".repeat(64)}`;
const harnessVersionId = `hv-sha256:${"2".repeat(64)}`;
const snapshotId = `rss-sha256:${"3".repeat(64)}`;

function response(
  responseId: string,
  output: ModelResponse["output"],
): ModelResponse {
  return {
    responseId,
    modelIdentity: "fake:replay-v1",
    output,
    usage: {
      inputTokens: 9,
      outputTokens: 4,
      reasoningTokens: 0,
      cachedInputTokens: 0,
      totalTokens: 13,
    },
    providerMetadata: { deterministic: true },
  };
}

async function temporaryDirectory(t: test.TestContext): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "seh-replay-"));
  t.after(async () => {
    await rm(directory, { recursive: true, force: true });
  });
  return directory;
}

test("standalone factory replays an identical event chain in independent roots", async (t) => {
  const root = await temporaryDirectory(t);
  const schemas = await SchemaRegistry.load(path.resolve("schemas"));

  async function run(instanceRoot: string) {
    const provider = new FakeModelProvider([
      response("response-replay-write", [
        {
          kind: "tool_call",
          callId: "call-replay-write",
          toolName: "write",
          arguments: {
            path: "result.txt",
            content: "replay-ok\n",
            overwrite: false,
          },
          rawArguments:
            "{\"path\":\"result.txt\",\"content\":\"replay-ok\\n\",\"overwrite\":false}",
        },
      ]),
      response("response-replay-finish", [
        { kind: "assistant_message", text: "result.txt is ready." },
      ]),
    ]);
    const runtime = await createStandaloneRuntime({
      root: instanceRoot,
      schemas,
      provider,
      verifier: new FakeTaskVerifier(
        digest("9"),
        async ({ workspaceRoot }) => {
          assert.equal(
            await readFile(path.join(workspaceRoot, "result.txt"), "utf8"),
            "replay-ok\n",
          );
          return passingVerification();
        },
      ),
      sessionId: "session.replay.1",
      pins: {
        protocolId,
        harnessVersionId,
        runtimeStateSnapshotId: snapshotId,
        modelIdentityHash: digest("4"),
        permissionPolicyHash: digest("5"),
        safetyPolicyHash: digest("6"),
        budgetPolicyHash: digest("7"),
        budgetAccountId: "budget.replay.1",
        datasetPermissions: ["deterministic"],
      },
      modelIdentity: "fake:replay-v1",
      runtimeSigner: deterministicPrincipal({
        principalId: "runtime.replay",
        role: "runtime",
        implementationDigest: digest("8"),
        instanceId: "runtime.replay.instance",
        seedByte: 17,
      }),
      budgetLimits: {
        maxModelCalls: 4,
        maxInputTokens: 4096,
        maxOutputTokens: 1024,
        maxToolCalls: 2,
        maxWallClockMillis: 60_000,
        maxRetries: 0,
        maxDescendants: 0,
      },
      clock: new DeterministicClock(),
      ids: new DeterministicIdFactory(),
      prompt: {
        sections: [
          {
            sectionId: "identity",
            purpose: "identity",
            content: "Execute the deterministic replay fixture.",
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
            source: "tool_catalog",
            priority: 70,
            maxTokens: 1024,
            selection: "all_in_order",
          },
        ],
        overflowPolicy: "block",
      },
      allowedToolIds: ["filesystem.read", "filesystem.write"],
      memoryPolicy: {
        readableNamespaces: ["project_facts"],
        queryMode: "lexical",
        maxRecords: 2,
        maxTokens: 128,
        minimumScore: 0,
        tieBreak: "record_id_ascending",
      },
      initialMemory: [
        {
          namespace: "project_facts",
          content: "The replay fixture writes replay-ok.",
          authority: "operator_approved",
        },
      ],
    });
    const result = await runtime.run(
      "Write result.txt containing replay-ok followed by a newline.",
    );
    return {
      result,
      eventHashes: (await runtime.events.events()).map(
        (event) => event.eventHash,
      ),
    };
  }

  const first = await run(path.join(root, "first"));
  const second = await run(path.join(root, "second"));
  assert.equal(first.result.state, "completed");
  assert.equal(second.result.state, "completed");
  assert.equal(first.result.eventHeadHash, second.result.eventHeadHash);
  assert.deepEqual(first.eventHashes, second.eventHashes);
});
