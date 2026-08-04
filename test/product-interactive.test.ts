import assert from "node:assert/strict";
import { PassThrough } from "node:stream";
import test from "node:test";
import type { ReadStream, WriteStream } from "node:tty";

import {
  RuntimeEventView,
  TerminalLineEditor,
  buildConversationalTask,
  interactiveBanner,
  parseInteractiveInput,
  renderHomeScreen,
  renderResponsePanel,
  resolveProductCliInvocation,
  slashCommandSuggestions,
  terminalCellWidth,
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
  assert.deepEqual(parseInteractiveInput("/fork session.1 try another path"), {
    kind: "command",
    name: "fork",
    argument: "session.1 try another path",
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
  assert.deepEqual(resolveProductCliInvocation(["thread", "session.1"], true), {
    command: "thread",
    args: ["session.1"],
  });
  assert.deepEqual(resolveProductCliInvocation(["--json", "doctor"], false), {
    command: "doctor",
    args: ["--json"],
  });
  assert.deepEqual(
    resolveProductCliInvocation(["--workspace", "/repo", "models", "--limit", "5"], false),
    {
      command: "models",
      args: ["--workspace", "/repo", "--limit", "5"],
    },
  );
  assert.deepEqual(resolveProductCliInvocation(["--write", "fix", "the", "tests"], false), {
    command: "run",
    args: ["--write", "fix", "the", "tests"],
  });
  assert.deepEqual(resolveProductCliInvocation(["--workspace", "/repo"], true), {
    command: "chat",
    args: ["--workspace", "/repo"],
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
  assert.match(banner, /SEH 0\.9\.0/u);
  assert.match(banner, /reasoning\s+provider default/u);
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

test("slash command palette opens on slash and narrows by name or alias", () => {
  const all = slashCommandSuggestions("/");
  assert.ok(all.length >= 12);
  assert.equal(all[0]?.name, "help");
  assert.equal(slashCommandSuggestions("/res")[0]?.name, "resume");
  assert.equal(slashCommandSuggestions("/for")[0]?.name, "fork");
  assert.equal(slashCommandSuggestions("/turn")[0]?.name, "thread");
  assert.equal(slashCommandSuggestions("/q")[0]?.name, "exit");
  assert.deepEqual(slashCommandSuggestions("/resume session"), []);
});

test("home screen makes workspace state and slash discovery visible", () => {
  const config = defaultProductConfig("/workspace", {
    model: "test-model",
    permissionMode: "workspace-write",
    verificationCommands: ["npm test"],
  });
  const screen = renderHomeScreen({
    version: "0.7.0",
    workspaceRoot: "/workspace",
    config,
    recentSessions: [{ sessionId: "session.123456", state: "completed", task: "Fix login" }],
    color: false,
    columns: 100,
  });
  assert.match(screen, /SELF-EVOLVING CODING AGENT/u);
  assert.match(screen, /WORKSPACE\s+\/workspace/u);
  assert.match(screen, /WORKSPACE WRITE · shell network denied/u);
  assert.match(screen, /Fix login/u);
  assert.match(screen, /type \/ to open the command palette/iu);
});

test("terminal width accounts for Korean and ANSI styling", () => {
  assert.equal(terminalCellWidth("abc"), 3);
  assert.equal(terminalCellWidth("한글"), 4);
  assert.equal(terminalCellWidth("\u001B[36mSEH\u001B[0m"), 3);
});

test("response panel keeps the answer readable and summarizes durable evidence", () => {
  const panel = renderResponsePanel({
    text: "Implemented the fix.",
    state: "completed",
    sessionId: "session.1234567890",
    modelCalls: 2,
    toolCalls: 4,
    totalTokens: 1234,
    verificationPassed: true,
    verificationSummary: "npm test passed",
    color: false,
    columns: 100,
  });
  assert.match(panel, /SEH RESPONSE/u);
  assert.match(panel, /Implemented the fix\./u);
  assert.match(panel, /✓ completed · verify passed · 2 model · 4 tools · 1,234 tokens/u);
});

test("terminal editor exposes slash choices and accepts tab completion", async () => {
  const input = new PassThrough();
  const output = new PassThrough();
  let rendered = "";
  output.on("data", (chunk: Buffer) => {
    rendered += chunk.toString("utf8");
  });
  const editor = new TerminalLineEditor({
    input: input as unknown as ReadStream,
    output: output as unknown as WriteStream,
    color: false,
  });
  const answer = editor.question("seh > ");
  input.write("/");
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.match(rendered, /\/help\s+Show every interactive command/u);
  input.write("\t");
  input.write("\r");
  assert.equal(await answer, "/help");
  editor.close();
});
