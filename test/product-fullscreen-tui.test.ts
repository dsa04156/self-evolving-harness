import assert from "node:assert/strict";
import test from "node:test";

import { render } from "ink-testing-library";
import { createElement } from "react";

import {
  CUSTOM_MODEL_CHOICE_ID,
  FullscreenTuiApp,
  FullscreenTuiController,
  buildProductModelChoices,
  customModelChoiceId,
  buildTranscriptLines,
  type FullscreenTuiStatus,
} from "../src/index.js";

const status: FullscreenTuiStatus = {
  version: "0.7.0",
  workspaceRoot: "/workspace/example",
  provider: "openai",
  model: "test-coder",
  reasoningEffort: "high",
  fastMode: true,
  permissionMode: "workspace-write",
  verificationCount: 2,
  coordinationLimit: 4,
  activeSkillIds: ["review"],
  threadNumber: 3,
  recentSessions: [
    {
      sessionId: "session.1234567890",
      state: "completed",
      task: "Fix the session recovery regression",
    },
  ],
};

async function renderCycle(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve));
}

test("full-screen TUI exposes product status, home, and an enabled composer", async () => {
  const controller = new FullscreenTuiController(status);
  const answer = controller.question();
  const view = render(createElement(FullscreenTuiApp, { controller }));
  await renderCycle();

  const frame = view.lastFrame() ?? "";
  assert.match(frame, /SELF-EVOLVING CODING AGENT/u);
  assert.match(frame, /example/u);
  assert.match(frame, /openai\/test-coder/u);
  assert.match(frame, /HIGH/u);
  assert.match(frame, /FAST/u);
  assert.match(frame, /WORKSPACE WRITE/u);
  assert.match(frame, /TASK EXECUTION/u);
  assert.match(frame, /HARNESS EVOLUTION/u);
  assert.match(frame, /IMMUTABLE TRUST/u);
  assert.match(frame, /LOCKED/u);
  assert.match(frame, /Fix the session recovery regression/u);
  assert.match(frame, /❯/u);

  controller.submit(null);
  assert.equal(await answer, null);
  view.unmount();
  view.cleanup();
});

test("slash opens the command palette and Tab completes the selected command", async () => {
  const controller = new FullscreenTuiController(status);
  const answer = controller.question();
  const view = render(createElement(FullscreenTuiApp, { controller }));

  view.stdin.write("/");
  await renderCycle();
  assert.match(view.lastFrame() ?? "", /\/help\s+Show every interactive command/u);
  assert.match(view.lastFrame() ?? "", /Tab complete/u);

  view.stdin.write("\t");
  await renderCycle();
  view.stdin.write("\r");
  assert.equal(await answer, "/help");
  view.unmount();
  view.cleanup();
});

test("composer accepts Shift+Enter multiline input", async () => {
  const controller = new FullscreenTuiController(status);
  const answer = controller.question();
  const view = render(createElement(FullscreenTuiApp, { controller }));

  view.stdin.write("first line");
  view.stdin.write("\u001B[13;2u");
  view.stdin.write("second line");
  await renderCycle();
  view.stdin.write("\r");
  assert.equal(await answer, "first line\nsecond line");
  view.unmount();
  view.cleanup();
});

test("Ctrl-L returns to the home screen without closing the composer", async () => {
  const controller = new FullscreenTuiController(status);
  controller.appendMessage("assistant", "A prior response");
  const answer = controller.question();
  const view = render(createElement(FullscreenTuiApp, { controller }));

  view.stdin.write("\u000C");
  await renderCycle();
  const frame = view.lastFrame() ?? "";
  assert.match(frame, /Ready in example/u);
  assert.match(frame, /Returned to the workspace home/u);
  assert.doesNotMatch(frame, /A prior response/u);

  view.stdin.write("\u0004");
  assert.equal(await answer, null);
  view.unmount();
  view.cleanup();
});

test("session picker is an overlay with keyboard selection", async () => {
  const controller = new FullscreenTuiController(status);
  const selected = controller.select("Resume a durable session", [
    { id: "session.one", label: "First task", description: "completed" },
    { id: "session.two", label: "Second task", description: "blocked" },
  ]);
  const view = render(createElement(FullscreenTuiApp, { controller }));
  await renderCycle();

  assert.match(view.lastFrame() ?? "", /Resume a durable session/u);
  assert.match(view.lastFrame() ?? "", /First task/u);
  assert.match(view.lastFrame() ?? "", /Second task/u);

  view.stdin.write("\u001B[B");
  await renderCycle();
  view.stdin.write("\r");
  assert.equal(await selected, "session.two");
  view.unmount();
  view.cleanup();
});

test("picker filters choices as the user types", async () => {
  const controller = new FullscreenTuiController(status);
  const selected = controller.select("Select model · OPENAI", [
    { id: "gpt-one", label: "First model", description: "flagship" },
    { id: "gpt-two", label: "Second model", description: "fast" },
  ]);
  const view = render(createElement(FullscreenTuiApp, { controller }));

  view.stdin.write("second");
  await renderCycle();
  const frame = view.lastFrame() ?? "";
  assert.match(frame, /Second model/u);
  assert.doesNotMatch(frame, /First model/u);
  assert.match(frame, /1\/2/u);

  view.stdin.write("\r");
  assert.equal(await selected, "gpt-two");
  view.unmount();
  view.cleanup();
});

test("composer can be opened with an initial model ID", async () => {
  const controller = new FullscreenTuiController(status);
  controller.setNotice("Model changed for this session");
  const answer = controller.question("custom-coder-v2");
  const view = render(createElement(FullscreenTuiApp, { controller }));
  await renderCycle();

  assert.match(view.lastFrame() ?? "", /custom-coder-v2/u);
  assert.match(view.lastFrame() ?? "", /Model changed for this session/u);
  view.stdin.write("\r");
  assert.equal(await answer, "custom-coder-v2");
  view.unmount();
  view.cleanup();
});

test("model catalog orders current, discovered, examples, and custom entry", () => {
  const choices = buildProductModelChoices({
    provider: {
      kind: "ollama",
      model: "current-coder:latest",
      endpoint: "http://127.0.0.1:11434",
      requestTimeoutMillis: 1_000,
      reasoningEffort: null,
    },
    discoveredModels: ["zeta:latest", "current-coder:latest", "alpha:latest"],
  });

  assert.equal(choices[0]?.modelId, "current-coder:latest");
  assert.equal(choices[0]?.source, "current");
  assert.deepEqual(
    choices.slice(1, 3).map((choice) => choice.modelId),
    ["alpha:latest", "zeta:latest"],
  );
  assert.ok(choices.some((choice) => choice.modelId === "qwen3-coder:30b"));
  assert.equal(
    choices.find((choice) => choice.providerKind === "ollama" && choice.source === "custom")?.id,
    customModelChoiceId("ollama"),
  );
  assert.ok(choices.some((choice) => choice.providerKind === "openrouter"));
  assert.ok(choices.some((choice) => choice.providerKind === "openai"));
  assert.ok(choices.some((choice) => choice.id.startsWith(CUSTOM_MODEL_CHOICE_ID)));
});

test("OpenAI model catalog exposes role-preserving examples without claiming access", () => {
  const choices = buildProductModelChoices({
    provider: {
      kind: "openai",
      model: "gpt-5.6-terra",
      reasoningEffort: "medium",
      serviceTier: "default",
    },
  });

  assert.equal(choices[0]?.modelId, "gpt-5.6-terra");
  assert.ok(choices.some((choice) => choice.modelId === "gpt-5.6-sol"));
  assert.ok(choices.some((choice) => choice.modelId === "gpt-5.6-luna"));
  assert.ok(choices.length > 35);
  assert.ok(
    choices
      .filter(
        (choice) => choice.providerKind === "openai" && choice.source === "example",
      )
      .every((choice) => choice.description.includes("requires OPENAI_API_KEY")),
  );
  assert.ok(
    choices.some(
      (choice) =>
        choice.providerKind === "openrouter" &&
        choice.modelId === "anthropic/claude-sonnet-5",
    ),
  );
});

test("transcript is flattened into terminal-width rows without losing the tail", () => {
  const text = "가나다라마바사아자차카타파하-abcdefghijklmnopqrstuvwxyz-END";
  const lines = buildTranscriptLines(
    [{ messageId: 1, role: "assistant", text }],
    24,
  );
  const body = lines
    .filter((line) => line.key.includes(":body:"))
    .map((line) => line.text)
    .join("");

  assert.ok(lines.length > 4);
  assert.match(body, /END/u);
});

test("controller publishes runtime activity and durable transcript cards", async () => {
  const controller = new FullscreenTuiController(status);
  const view = render(createElement(FullscreenTuiApp, { controller }));
  controller.appendMessage("user", "Inspect the repository");
  controller.appendMessage("tool", "✓ read", { meta: "4ms" });
  controller.appendMessage("assistant", "The repository is healthy.", {
    meta: "completed · verify passed",
  });
  controller.setActivity({ kind: "verifying", label: "Running npm test…" });
  await renderCycle();

  const frame = view.lastFrame() ?? "";
  assert.match(frame, /Inspect the repository/u);
  assert.match(frame, /✓ read/u);
  assert.match(frame, /The repository is healthy\./u);
  assert.match(frame, /Running npm test/u);
  assert.match(frame, /Ctrl-C interrupt/u);
  view.unmount();
  view.cleanup();
});
