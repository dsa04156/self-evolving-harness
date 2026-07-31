import {
  canonicalize,
  sha256,
  type JsonValue,
} from "../core/canonical.js";
import { assertCondition } from "../core/errors.js";
import type { RuntimeEvent } from "../evidence/runtime-events.js";
import type { SemanticHarnessExecutionResult } from "./hfb-semantic-execution.js";

export interface LabelBlindObservation {
  readonly ordinal: number;
  readonly eventType: string;
  readonly epistemicClass:
    RuntimeEvent["epistemicClass"];
  readonly originClass:
    RuntimeEvent["origin"]["originClass"];
  readonly facts: Readonly<Record<string, JsonValue>>;
}

export interface LabelBlindAttributionInput {
  readonly schemaVersion: 1;
  readonly traceProjectionId: string;
  readonly outcome: {
    readonly state: "completed" | "blocked" | "terminated";
    readonly passed: boolean;
  };
  readonly workflow: {
    readonly fromClass: string;
    readonly trigger: string;
    readonly toClass: string;
    readonly terminal: boolean;
    readonly dispatchedActions: readonly string[];
  };
  readonly routing: {
    readonly taskClass: string;
    readonly riskClass: string;
    readonly targetKind: "primary" | "subagent";
  };
  readonly providerRequestMatches:
    readonly boolean[];
  readonly observations:
    readonly LabelBlindObservation[];
}

export interface LabelBlindAttributionCorpus {
  readonly schemaVersion: 1;
  readonly traces: readonly {
    readonly trace: LabelBlindAttributionInput;
    readonly occurrenceCount: number;
  }[];
  readonly corpusHash: string;
}

const EVENT_TYPES = new Set([
  "session_state_changed",
  "task_submitted",
  "context_constructed",
  "model_request_started",
  "model_response_received",
  "tool_call_requested",
  "tool_call_completed",
  "verification_completed",
  "runtime_failure_observed",
  "session_blocked",
]);
const CONTEXT_SOURCES = new Set([
  "task_input",
  "system_prompt",
  "tool_catalog",
  "session_events",
  "tool_results",
  "selected_memory",
  "selected_skills",
  "verification_feedback",
]);
const CONTEXT_REASONS = new Set([
  "selected",
  "source_disabled",
  "source_limit",
  "total_limit",
]);
const SESSION_STATES = new Set([
  "created",
  "initialized",
  "running",
  "waiting",
  "blocked",
  "recovering",
  "validating",
  "completed",
  "retired",
  "terminating",
  "terminated",
]);
const WORKFLOW_STATES = new Set([
  "start",
  "context",
  "model",
  "recover",
  "verify",
  "pre_job",
  "post_job",
  "complete",
  "blocked",
]);
const TOOL_NAMES = new Set([
  "read",
  "write",
  "edit",
  "bash",
  "git_status",
  "git_diff",
]);
const ERROR_CODES = new Set([
  "AUTHENTICATION_FAILED",
  "AUTHORIZATION_DENIED",
  "SCHEMA_INVALID",
  "HASH_MISMATCH",
  "REPLAY_DETECTED",
  "PAYLOAD_TOO_LARGE",
  "DEADLINE_EXCEEDED",
  "BUDGET_EXHAUSTED",
  "PROTOCOL_MISMATCH",
  "ARTIFACT_UNAVAILABLE",
  "PEER_CRASHED",
  "INVALID_STATE_TRANSITION",
  "TOOL_NOT_FOUND",
  "TOOL_EXECUTION_FAILED",
  "VERIFICATION_FAILED",
  "CONFLICT",
  "INTERNAL_ERROR",
]);

function knownString(
  value: JsonValue | undefined,
  allowed: ReadonlySet<string>,
  fallback = "other",
): string {
  return typeof value === "string" &&
    allowed.has(value)
    ? value
    : fallback;
}

function booleanValue(
  value: JsonValue | undefined,
): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function numericValue(
  value: JsonValue | undefined,
): number | null {
  return typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0
    ? value
    : null;
}

function contextFacts(
  event: RuntimeEvent,
): Readonly<Record<string, JsonValue>> {
  const entries = Array.isArray(event.payload["entries"])
    ? event.payload["entries"]
    : [];
  const counts = new Map<string, number>();
  let selectedEstimatedTokens = 0;
  for (const entry of entries) {
    if (
      typeof entry !== "object" ||
      entry === null ||
      Array.isArray(entry)
    ) {
      continue;
    }
    const source = knownString(
      entry["source"],
      CONTEXT_SOURCES,
    );
    const reason = knownString(
      entry["reason"],
      CONTEXT_REASONS,
    );
    const selected =
      booleanValue(entry["selected"]) === true;
    const key =
      `${source}:${reason}:${selected ? "selected" : "omitted"}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
    if (selected) {
      selectedEstimatedTokens +=
        numericValue(entry["estimatedTokens"]) ?? 0;
    }
  }
  return {
    selectedEstimatedTokens,
    entryCounts: Object.fromEntries(
      [...counts.entries()].sort(([left], [right]) =>
        left.localeCompare(right),
      ),
    ),
  };
}

function responseFacts(
  event: RuntimeEvent,
): Readonly<Record<string, JsonValue>> {
  const output = Array.isArray(event.payload["output"])
    ? event.payload["output"]
    : [];
  const kinds: string[] = [];
  const tools: string[] = [];
  for (const item of output) {
    if (
      typeof item !== "object" ||
      item === null ||
      Array.isArray(item)
    ) {
      continue;
    }
    const kind =
      item["kind"] === "assistant_message" ||
      item["kind"] === "tool_call" ||
      item["kind"] === "provider_state"
        ? item["kind"]
        : "other";
    kinds.push(kind);
    if (kind === "tool_call") {
      tools.push(
        knownString(item["toolName"], TOOL_NAMES),
      );
    }
  }
  return {
    outputKinds: kinds,
    requestedTools: tools,
  };
}

function safeEventType(eventType: string): string {
  return EVENT_TYPES.has(eventType)
    ? eventType
    : "other_runtime_event";
}

function eventFacts(
  event: RuntimeEvent,
): Readonly<Record<string, JsonValue>> {
  switch (safeEventType(event.eventType)) {
    case "session_state_changed":
      return {
        from: knownString(
          event.payload["from"],
          SESSION_STATES,
        ),
        to: knownString(
          event.payload["to"],
          SESSION_STATES,
        ),
      };
    case "context_constructed":
      return contextFacts(event);
    case "model_response_received":
      return responseFacts(event);
    case "tool_call_requested":
      return {
        toolName: knownString(
          event.payload["toolName"],
          TOOL_NAMES,
        ),
      };
    case "tool_call_completed":
      return {
        toolName: knownString(
          event.payload["toolName"],
          TOOL_NAMES,
        ),
        ok: booleanValue(event.payload["ok"]),
        errorCode:
          event.payload["errorCode"] === null
            ? null
            : knownString(
                event.payload["errorCode"],
                ERROR_CODES,
                "UNCLASSIFIED",
              ),
      };
    case "verification_completed":
      return {
        passed: booleanValue(
          event.payload["passed"],
        ),
        retryable: booleanValue(
          event.payload["retryable"],
        ),
      };
    case "runtime_failure_observed":
      return {
        code: knownString(
          event.payload["code"],
          ERROR_CODES,
          "UNCLASSIFIED",
        ),
        retryable: booleanValue(
          event.payload["retryable"],
        ),
      };
    case "session_blocked":
      return {
        failureCode: knownString(
          event.payload["failureCode"],
          ERROR_CODES,
          "UNCLASSIFIED",
        ),
      };
    case "task_submitted":
    case "model_request_started":
    case "other_runtime_event":
      return {};
    default:
      return {};
  }
}

function workflowStateClass(value: string): string {
  return WORKFLOW_STATES.has(value) ? value : "other";
}

function traceCore(
  result: SemanticHarnessExecutionResult,
): Omit<
  LabelBlindAttributionInput,
  "traceProjectionId"
> {
  return {
    schemaVersion: 1,
    outcome: {
      state: result.state,
      passed: result.passed,
    },
    workflow: {
      fromClass: workflowStateClass(
        result.workflowReceipt.from,
      ),
      trigger: result.workflowReceipt.trigger,
      toClass: workflowStateClass(
        result.workflowReceipt.to,
      ),
      terminal: result.workflowReceipt.terminal,
      dispatchedActions:
        result.workflowReceipt.dispatchedActions.map(
          (entry) => entry.action,
        ),
    },
    routing: {
      taskClass: result.routingReceipt.taskClass,
      riskClass: result.routingReceipt.riskClass,
      targetKind:
        result.routingReceipt.target.kind,
    },
    providerRequestMatches:
      result.providerObservations.map(
        (entry) => entry.matched,
      ),
    observations: result.runtimeEvents.map(
      (event, ordinal) => ({
        ordinal,
        eventType: safeEventType(event.eventType),
        epistemicClass: event.epistemicClass,
        originClass: event.origin.originClass,
        facts: eventFacts(event),
      }),
    ),
  };
}

/**
 * Projects raw execution evidence into the only representation available to
 * attribution/proposal code. Opaque IDs, hashes, task text, paths, provider
 * metadata, verifier summaries/evidence, component identities, and oracle
 * labels are intentionally discarded.
 */
export function toLabelBlindAttributionInput(
  result: SemanticHarnessExecutionResult,
): LabelBlindAttributionInput {
  const core = traceCore(result);
  return {
    ...core,
    traceProjectionId:
      `lbti-sha256:${sha256(
        core as unknown as JsonValue,
      ).slice("sha256:".length)}`,
  };
}

export function buildLabelBlindAttributionCorpus(
  results: readonly SemanticHarnessExecutionResult[],
): LabelBlindAttributionCorpus {
  const grouped = new Map<
    string,
    {
      readonly trace: LabelBlindAttributionInput;
      count: number;
    }
  >();
  for (const result of results) {
    const trace = toLabelBlindAttributionInput(result);
    const existing = grouped.get(
      trace.traceProjectionId,
    );
    if (existing === undefined) {
      grouped.set(trace.traceProjectionId, {
        trace,
        count: 1,
      });
    } else {
      existing.count += 1;
    }
  }
  const traces = [...grouped.values()]
    .sort((left, right) =>
      left.trace.traceProjectionId.localeCompare(
        right.trace.traceProjectionId,
      ),
    )
    .map((entry) => ({
      trace: entry.trace,
      occurrenceCount: entry.count,
    }));
  const core = {
    schemaVersion: 1 as const,
    traces,
  };
  return {
    ...core,
    corpusHash: sha256(core as unknown as JsonValue),
  };
}

export function assertLabelBlindBoundary(
  value:
    | LabelBlindAttributionInput
    | LabelBlindAttributionCorpus,
  forbiddenValues: readonly string[],
): void {
  const serialized = canonicalize(
    value as unknown as JsonValue,
  );
  for (const forbidden of forbiddenValues) {
    assertCondition(
      forbidden.length > 0,
      "SCHEMA_INVALID",
      "Forbidden leakage token is empty",
    );
    assertCondition(
      !serialized.includes(forbidden),
      "AUTHORIZATION_DENIED",
      "Label-blind attribution boundary leaked forbidden data",
    );
  }
}
