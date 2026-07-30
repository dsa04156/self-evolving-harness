import type { JsonValue } from "../core/canonical.js";
import type { ModelUsage } from "./model.js";

export type SessionState =
  | "created"
  | "initialized"
  | "running"
  | "waiting"
  | "blocked"
  | "recovering"
  | "validating"
  | "completed"
  | "retired"
  | "terminating"
  | "terminated";

export type HarnessQualificationState =
  | "draft"
  | "candidate"
  | "statically_validated"
  | "evaluating"
  | "canary"
  | "approved"
  | "rejected"
  | "retired";

export type EpistemicClass = "recorded_observation" | "verifier_outcome" | "inference";

export interface BudgetLimits {
  readonly maxModelCalls: number;
  readonly maxInputTokens: number;
  readonly maxOutputTokens: number;
  readonly maxToolCalls: number;
  readonly maxWallClockMillis: number;
  readonly maxRetries: number;
  readonly maxDescendants: number;
}

export interface BudgetUsage {
  modelCalls: number;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  cachedInputTokens: number;
  toolCalls: number;
  retries: number;
  descendants: number;
  wallClockMillis: number;
}

export interface SessionPins {
  readonly protocolId: string;
  readonly harnessVersionId: string;
  readonly runtimeStateSnapshotId: string;
  readonly modelIdentityHash: string;
  readonly permissionPolicyHash: string;
  readonly safetyPolicyHash: string;
  readonly budgetPolicyHash: string;
  readonly budgetAccountId: string;
  readonly datasetPermissions: readonly string[];
}

export interface ToolCallRequest {
  readonly callId: string;
  readonly toolName: string;
  readonly arguments: JsonValue;
}

export interface ToolExecutionResult {
  readonly callId: string;
  readonly toolName: string;
  readonly ok: boolean;
  readonly output: JsonValue;
  readonly artifactHashes: readonly string[];
  readonly durationMillis: number;
  readonly errorCode?: string;
}

export interface VerificationResult {
  readonly passed: boolean;
  readonly summary: string;
  readonly evidence: JsonValue;
  readonly retryable: boolean;
}

export interface AgentRunResult {
  readonly sessionId: string;
  readonly state: Extract<SessionState, "completed" | "blocked" | "terminated">;
  readonly finalText: string | null;
  readonly verification: VerificationResult | null;
  readonly usage: Readonly<BudgetUsage>;
  readonly modelUsage: Readonly<ModelUsage>;
  readonly eventHeadHash: string;
  readonly eventCount: number;
  readonly terminationReason?: TerminationReason;
}

export type TerminationReason =
  | "initialization_failure"
  | "user_cancellation"
  | "budget_exhaustion"
  | "deadline_expiry"
  | "verifier_failure"
  | "security_violation"
  | "process_crash"
  | "unrecoverable_recovery"
  | "host_enforced_shutdown";

export interface TerminationDescriptor {
  readonly terminationTransactionId: string;
  readonly initiatingRecordId: string;
  readonly preTerminationState: Exclude<
    SessionState,
    "retired" | "terminating" | "terminated"
  >;
  readonly initiatingPrincipal: string;
  readonly reason: TerminationReason;
}
