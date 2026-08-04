import assert from "node:assert/strict";
import test from "node:test";

import {
  ClosedRoutingRuntime,
  ClosedWorkflowRuntime,
  HarnessError,
  classifyDelegatedTask,
  codingRoutingPolicy,
  type DeclarativeRoutingPolicy,
  type DeclarativeWorkflowPolicy,
  type WorkflowActionHandlers,
} from "../src/index.js";

const workflow: DeclarativeWorkflowPolicy = {
  schemaVersion: 1,
  language: "seh.workflow.v1",
  entryState: "start",
  states: [
    {
      stateId: "start",
      actions: [{ action: "construct_context", targetId: null }],
    },
    {
      stateId: "context",
      actions: [
        { action: "retrieve_memory", targetId: "project" },
        { action: "model_turn", targetId: null },
      ],
    },
    {
      stateId: "blocked",
      actions: [{ action: "emit_block", targetId: null }],
    },
  ],
  transitions: [
    {
      from: "start",
      trigger: "action_succeeded",
      guard: "always",
      to: "context",
    },
    {
      from: "start",
      trigger: "action_failed",
      guard: "no_retry_remaining",
      to: "blocked",
    },
  ],
  terminalStates: ["blocked"],
};

const handlers: WorkflowActionHandlers = {
  construct_context: () => ({ handler: "construct_context" }),
  model_turn: () => ({ handler: "model_turn" }),
  retrieve_memory: ({ targetId }) => ({
    handler: "retrieve_memory",
    targetId,
  }),
  invoke_skill: () => ({ handler: "invoke_skill" }),
  request_tool: () => ({ handler: "request_tool" }),
  spawn_subagent: () => ({ handler: "spawn_subagent" }),
  wait_job: () => ({ handler: "wait_job" }),
  verify: () => ({ handler: "verify" }),
  emit_completion: () => ({ handler: "emit_completion" }),
  emit_block: () => ({ handler: "emit_block" }),
};

test("closed workflow resolves one guard and dispatches destination handlers", async () => {
  const runtime = new ClosedWorkflowRuntime(workflow);
  const receipt = await runtime.dispatch({
    from: runtime.entryState,
    trigger: "action_succeeded",
    facts: { retryRemaining: true, evidenceComplete: true },
    handlers,
  });
  assert.equal(receipt.to, "context");
  assert.deepEqual(
    receipt.dispatchedActions.map((action) => action.action),
    ["retrieve_memory", "model_turn"],
  );
  assert.match(receipt.receiptHash, /^sha256:[a-f0-9]{64}$/u);
});

test("closed workflow fails on absent or ambiguous transitions", async () => {
  const runtime = new ClosedWorkflowRuntime(workflow);
  await assert.rejects(
    runtime.dispatch({
      from: "context",
      trigger: "verification_passed",
      facts: { retryRemaining: false, evidenceComplete: true },
      handlers,
    }),
    (error: unknown) =>
      error instanceof HarnessError &&
      error.code === "INVALID_STATE_TRANSITION",
  );
  assert.throws(
    () =>
      new ClosedWorkflowRuntime({
        ...workflow,
        states: [...workflow.states, workflow.states[0]!],
      }),
    (error: unknown) =>
      error instanceof HarnessError && error.code === "SCHEMA_INVALID",
  );
});

test("closed routing uses priority then stable rule ID and a default", () => {
  const policy: DeclarativeRoutingPolicy = {
    schemaVersion: 1,
    language: "seh.routing-policy.v1",
    rules: [
      {
        ruleId: "rule_b",
        priority: 50,
        match: { taskClass: "code_change", riskClass: "low" },
        target: { kind: "subagent", routeId: "route.b" },
      },
      {
        ruleId: "rule_a",
        priority: 50,
        match: { taskClass: "code_change", riskClass: "low" },
        target: { kind: "subagent", routeId: "route.a" },
      },
    ],
    defaultTarget: { kind: "primary", routeId: "route.primary" },
  };
  const runtime = new ClosedRoutingRuntime(policy);
  const matched = runtime.select({
    taskClass: "code_change",
    riskClass: "low",
  });
  assert.equal(matched.selectedRuleId, "rule_a");
  assert.equal(matched.target.routeId, "route.a");
  const fallback = runtime.select({
    taskClass: "analysis",
    riskClass: "high",
  });
  assert.equal(fallback.selectedRuleId, null);
  assert.equal(fallback.target.kind, "primary");
  assert.notEqual(matched.receiptHash, fallback.receiptHash);
});

test("product routing delegates bounded work and retains high-risk work on the primary", () => {
  const runtime = new ClosedRoutingRuntime(codingRoutingPolicy(true));
  const inspection = classifyDelegatedTask(
    "Inspect the repository independently and report one finding.",
  );
  assert.deepEqual(inspection, { taskClass: "analysis", riskClass: "low" });
  assert.equal(runtime.select(inspection).target.kind, "subagent");

  const dangerous = classifyDelegatedTask(
    "Deploy to production and force-push while reading credentials.",
  );
  assert.equal(dangerous.riskClass, "high");
  const selected = runtime.select(dangerous);
  assert.equal(selected.target.kind, "primary");
  assert.equal(selected.target.routeId, "primary-session");
});
