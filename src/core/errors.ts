export type HarnessErrorCode =
  | "AUTHENTICATION_FAILED"
  | "AUTHORIZATION_DENIED"
  | "SCHEMA_INVALID"
  | "HASH_MISMATCH"
  | "REPLAY_DETECTED"
  | "PAYLOAD_TOO_LARGE"
  | "DEADLINE_EXCEEDED"
  | "BUDGET_EXHAUSTED"
  | "PROTOCOL_MISMATCH"
  | "ARTIFACT_UNAVAILABLE"
  | "PEER_CRASHED"
  | "INVALID_STATE_TRANSITION"
  | "TOOL_NOT_FOUND"
  | "TOOL_EXECUTION_FAILED"
  | "VERIFICATION_FAILED"
  | "CONFLICT"
  | "INTERNAL_ERROR";

export class HarnessError extends Error {
  public readonly code: HarnessErrorCode;
  public readonly retryable: boolean;
  public readonly safeDetail: string;
  public readonly causeValue: unknown;

  public constructor(
    code: HarnessErrorCode,
    safeDetail: string,
    options: { retryable?: boolean; cause?: unknown } = {},
  ) {
    super(`${code}: ${safeDetail}`, { cause: options.cause });
    this.name = "HarnessError";
    this.code = code;
    this.retryable = options.retryable ?? false;
    this.safeDetail = safeDetail.slice(0, 1000);
    this.causeValue = options.cause;
  }
}

export function asHarnessError(error: unknown): HarnessError {
  if (error instanceof HarnessError) {
    return error;
  }
  if (error instanceof Error) {
    return new HarnessError("INTERNAL_ERROR", error.message, { cause: error });
  }
  return new HarnessError("INTERNAL_ERROR", "Unknown failure", { cause: error });
}

export function assertCondition(
  condition: unknown,
  code: HarnessErrorCode,
  safeDetail: string,
): asserts condition {
  if (!condition) {
    throw new HarnessError(code, safeDetail);
  }
}
