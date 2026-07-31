import { sha256, type JsonValue } from "../core/canonical.js";
import { assertCondition } from "../core/errors.js";

export type WorkflowAction =
  | "construct_context"
  | "model_turn"
  | "retrieve_memory"
  | "invoke_skill"
  | "request_tool"
  | "spawn_subagent"
  | "wait_job"
  | "verify"
  | "emit_completion"
  | "emit_block";

export type WorkflowTrigger =
  | "action_succeeded"
  | "action_failed"
  | "tool_result"
  | "job_completed"
  | "job_failed"
  | "verification_passed"
  | "verification_failed"
  | "budget_exhausted"
  | "permission_denied";

export type WorkflowGuard =
  | "always"
  | "retry_remaining"
  | "no_retry_remaining"
  | "evidence_complete"
  | "evidence_incomplete";

export interface DeclarativeWorkflowPolicy {
  readonly schemaVersion: 1;
  readonly language: "seh.workflow.v1";
  readonly entryState: string;
  readonly states: readonly {
    readonly stateId: string;
    readonly actions: readonly {
      readonly action: WorkflowAction;
      readonly targetId: string | null;
    }[];
  }[];
  readonly transitions: readonly {
    readonly from: string;
    readonly trigger: WorkflowTrigger;
    readonly guard: WorkflowGuard;
    readonly to: string;
  }[];
  readonly terminalStates: readonly string[];
}

export interface WorkflowGuardFacts {
  readonly retryRemaining: boolean;
  readonly evidenceComplete: boolean;
}

export interface WorkflowDispatchReceipt {
  readonly from: string;
  readonly trigger: WorkflowTrigger;
  readonly selectedGuard: WorkflowGuard;
  readonly to: string;
  readonly terminal: boolean;
  readonly dispatchedActions: readonly {
    readonly action: WorkflowAction;
    readonly targetId: string | null;
    readonly outputHash: string;
  }[];
  readonly receiptHash: string;
}

export type WorkflowActionHandlers = Readonly<
  Record<
    WorkflowAction,
    (input: {
      readonly stateId: string;
      readonly targetId: string | null;
    }) => JsonValue | Promise<JsonValue>
  >
>;

function guardPasses(
  guard: WorkflowGuard,
  facts: WorkflowGuardFacts,
): boolean {
  switch (guard) {
    case "always":
      return true;
    case "retry_remaining":
      return facts.retryRemaining;
    case "no_retry_remaining":
      return !facts.retryRemaining;
    case "evidence_complete":
      return facts.evidenceComplete;
    case "evidence_incomplete":
      return !facts.evidenceComplete;
  }
}

export class ClosedWorkflowRuntime {
  readonly #policy: DeclarativeWorkflowPolicy;
  readonly #stateById = new Map<
    string,
    DeclarativeWorkflowPolicy["states"][number]
  >();

  public constructor(policy: DeclarativeWorkflowPolicy) {
    this.#policy = policy;
    for (const state of policy.states) {
      assertCondition(
        !this.#stateById.has(state.stateId),
        "SCHEMA_INVALID",
        `Duplicate workflow state ${state.stateId}`,
      );
      this.#stateById.set(state.stateId, state);
    }
    assertCondition(
      this.#stateById.has(policy.entryState),
      "SCHEMA_INVALID",
      "Workflow entry state does not exist",
    );
    assertCondition(
      policy.terminalStates.length > 0 &&
        policy.terminalStates.every((stateId) =>
          this.#stateById.has(stateId),
        ),
      "SCHEMA_INVALID",
      "Workflow terminal state does not exist",
    );
    for (const transition of policy.transitions) {
      assertCondition(
        this.#stateById.has(transition.from) &&
          this.#stateById.has(transition.to),
        "SCHEMA_INVALID",
        "Workflow transition references an unknown state",
      );
    }
  }

  public get entryState(): string {
    return this.#policy.entryState;
  }

  public async dispatch(input: {
    readonly from: string;
    readonly trigger: WorkflowTrigger;
    readonly facts: WorkflowGuardFacts;
    readonly handlers: WorkflowActionHandlers;
  }): Promise<WorkflowDispatchReceipt> {
    assertCondition(
      this.#stateById.has(input.from),
      "INVALID_STATE_TRANSITION",
      `Unknown workflow state ${input.from}`,
    );
    const eligible = this.#policy.transitions.filter(
      (transition) =>
        transition.from === input.from &&
        transition.trigger === input.trigger &&
        guardPasses(transition.guard, input.facts),
    );
    assertCondition(
      eligible.length === 1,
      "INVALID_STATE_TRANSITION",
      eligible.length === 0
        ? "No workflow transition matched"
        : "Multiple workflow transitions matched",
    );
    const transition = eligible[0]!;
    const destination = this.#stateById.get(transition.to)!;
    const dispatchedActions: WorkflowDispatchReceipt["dispatchedActions"][number][] =
      [];
    for (const action of destination.actions) {
      const output = await input.handlers[action.action]({
        stateId: destination.stateId,
        targetId: action.targetId,
      });
      dispatchedActions.push({
        action: action.action,
        targetId: action.targetId,
        outputHash: sha256(output),
      });
    }
    const core = {
      from: input.from,
      trigger: input.trigger,
      selectedGuard: transition.guard,
      to: transition.to,
      terminal: this.#policy.terminalStates.includes(transition.to),
      dispatchedActions,
    };
    return {
      ...core,
      receiptHash: sha256(core),
    };
  }
}
