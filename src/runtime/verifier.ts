import type { JsonValue } from "../core/canonical.js";
import type { VerificationResult } from "../domain/runtime.js";

export interface VerificationInput {
  readonly sessionId: string;
  readonly task: string;
  readonly proposedAnswer: string;
  readonly workspaceRoot: string;
}

export interface TaskVerifier {
  readonly verifierId: string;
  readonly verifierHash: string;
  verify(input: VerificationInput): Promise<VerificationResult>;
}

export class FakeTaskVerifier implements TaskVerifier {
  public readonly verifierId = "fake-verifier";
  public readonly verifierHash: string;
  readonly #verify: (input: VerificationInput) => VerificationResult | Promise<VerificationResult>;

  public constructor(
    verifierHash: string,
    verify: (input: VerificationInput) => VerificationResult | Promise<VerificationResult>,
  ) {
    this.verifierHash = verifierHash;
    this.#verify = verify;
  }

  public verify(input: VerificationInput): Promise<VerificationResult> {
    return Promise.resolve(this.#verify(input));
  }
}

export function passingVerification(summary = "deterministic verifier passed"): VerificationResult {
  const evidence: JsonValue = { passed: true };
  return { passed: true, summary, evidence, retryable: false };
}
