import assert from "node:assert/strict";
import test from "node:test";

import {
  RuntimeEventView,
  buildConversationalTask,
  interactiveBanner,
  parseInteractiveInput,
  resolveProductCliInvocation,
  defaultProductConfig,
  type ConversationTurn,
  type RuntimeEvent,
} from "../src/index.js";

test("interactive input distinguishes tasks, escaped slashes, and commands", () => {
  assert.deepEqual(parseInteractiveInput("  "), { kind: "empty" });
  assert.deepEqual(parseInteractiveInput("fix the tests"), {
    kind: "task",
    text: "fix the tests",
  });
  assert.deepEqual(parseInteractiveInput("//api route"), {
    kind: "task",
    text: "/api route",
  });
  assert.deepEqual(parseInteractiveInput("/RESUME session.1 finish it"), {
    kind: "command",
    name: "resume",
    argument: "session.1 finish it",
  });
});

test("top-level CLI follows interactive prompt and explicit print routing", () => {
  assert.deepEqual(resolveProductCliInvocation([], true), { command: "chat", args: [] });
  assert.deepEqual(resolveProductCliInvocation([], false), { command: "run", args: [] });
  assert.deepEqual(resolveProductCliInvocation(["fix", "the", "tests"], true), {
    command: "chat",
    args: ["fix", "the", "tests"],
  });
  assert.deepEqual(resolveProductCliInvocation(["fix", "the", "tests"], false), {
    command: "run",
    args: ["fix", "the", "tests"],
  });
  assert.deepEqual(resolveProductCliInvocation(["-p", "fix tests"], true), {
    command: "run",
    args: ["fix tests"],
  });
  assert.deepEqual(resolveProductCliInvocation(["--continue", "next"], true), {
    command: "continue",
    args: ["next"],
  });
  assert.deepEqual(resolveProductCliInvocation(["doctor"], true), {
    command: "doctor",
    args: [],
  });
});

test("conversation context is bounded, newest-first selected, and explicitly untrusted", () => {
  const turns: ConversationTurn[] = Array.from({ length: 10 }, (_, index) => ({
    sessionId: `session.${index}`,
    user: `request-${index}`,
    assistant: `answer-${index}-${"x".repeat(800)}`,
  }));
  const rendered = buildConversationalTask("Now add the regression test", turns, 8 * 1024);
  assert.ok(Buffer.byteLength(rendered, "utf8") <= 8 * 1024);
  assert.match(rendered, /untrusted historical context/u);
  assert.match(rendered, /session\.9/u);
  assert.doesNotMatch(rendered, /session\.0/u);
  assert.match(rendered, /Current user request:\nNow add the regression test/u);
  assert.equal(buildConversationalTask("standalone task", []), "standalone task");
});

test("conversation context falls back to the intact current request when the bound is full", () => {
  const current = "z".repeat(2_048);
  const rendered = buildConversationalTask(
    current,
    [{ sessionId: "session.prior", user: "before", assistant: "done" }],
    1_024,
  );
  assert.equal(rendered, current);
});

test("interactive banner reports runtime authority without requiring color", () => {
  const config = defaultProductConfig("/workspace", {
    model: "test-model",
    permissionMode: "read-only",
    verificationCommands: ["npm test"],
  });
  const banner = interactiveBanner({ workspaceRoot: "/workspace", config, color: false });
  assert.match(banner, /SEH 0\.3\.0/u);
  assert.match(banner, /read-only · shell network denied/u);
  assert.match(banner, /verification 1 command/u);
  assert.doesNotMatch(banner, /\u001B/u);
});

test("runtime event view renders model, tool, and verification progress", () => {
  const output: string[] = [];
  const times = [1_000, 2_250];
  const view = new RuntimeEventView({
    color: false,
    write: (text) => output.push(text),
    now: () => times.shift() ?? 2_250,
  });
  const event = (eventType: string, payload: RuntimeEvent["payload"]): RuntimeEvent =>
    ({ eventType, payload }) as RuntimeEvent;
  view.render(event("model_request_started", {}));
  view.render(event("model_response_received", {}));
  view.render(event("tool_call_requested", { toolName: "read" }));
  view.render(event("tool_call_completed", {
    toolName: "read",
    ok: true,
    durationMillis: 12,
  }));
  view.render(event("verification_completed", { passed: true }));
  assert.equal(
    output.join(""),
    "  ● thinking\n  ✓ model response · 1.25s\n  → tool read\n  ✓ tool read · 12ms\n  ✓ verification\n",
  );
});
