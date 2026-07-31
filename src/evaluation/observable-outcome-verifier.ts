import {
  sha256,
  sha256Text,
  type JsonValue,
} from "../core/canonical.js";
import { assertCondition } from "../core/errors.js";
import type { VerificationResult } from "../domain/runtime.js";
import { WorkspacePathGuard } from "../runtime/path-guard.js";
import type {
  TaskVerifier,
  VerificationInput,
} from "../runtime/verifier.js";

export interface ObservableOutcomeContract {
  readonly schemaVersion: 1;
  readonly requiredFinalText: string;
  readonly requiredFiles: readonly {
    readonly path: string;
    readonly contentHash: string;
  }[];
}

/**
 * Immutable evaluator used by deterministic development fixtures. It observes
 * only the proposed answer and workspace state; harness IDs and component
 * identities are deliberately absent from its contract.
 */
export class ObservableOutcomeVerifier implements TaskVerifier {
  public readonly verifierId = "observable-outcome-verifier-v1";
  public readonly verifierHash: string;
  readonly #contract: ObservableOutcomeContract;

  public constructor(contract: ObservableOutcomeContract) {
    assertCondition(
      contract.requiredFinalText.length > 0,
      "SCHEMA_INVALID",
      "Outcome contract requires non-empty final text",
    );
    assertCondition(
      new Set(contract.requiredFiles.map((file) => file.path)).size ===
        contract.requiredFiles.length,
      "SCHEMA_INVALID",
      "Outcome contract has duplicate file paths",
    );
    for (const file of contract.requiredFiles) {
      assertCondition(
        /^sha256:[a-f0-9]{64}$/u.test(file.contentHash),
        "SCHEMA_INVALID",
        "Outcome contract file hash is malformed",
      );
    }
    this.#contract = structuredClone(contract);
    this.verifierHash = sha256(
      contract as unknown as JsonValue,
    );
  }

  public async verify(
    input: VerificationInput,
  ): Promise<VerificationResult> {
    const failures: {
      readonly observation: "final_text" | "file";
      readonly path: string | null;
      readonly observedHash: string | null;
      readonly requiredHash: string;
    }[] = [];
    const requiredTextHash = sha256Text(
      this.#contract.requiredFinalText,
    );
    const observedTextHash = sha256Text(input.proposedAnswer);
    if (input.proposedAnswer !== this.#contract.requiredFinalText) {
      failures.push({
        observation: "final_text",
        path: null,
        observedHash: observedTextHash,
        requiredHash: requiredTextHash,
      });
    }

    const workspace = new WorkspacePathGuard(input.workspaceRoot);
    await workspace.initialize();
    for (const requiredFile of this.#contract.requiredFiles) {
      let observedHash: string | null = null;
      try {
        observedHash = sha256Text(
          (
            await workspace.readFile(
              requiredFile.path,
              1024 * 1024,
            )
          ).toString("utf8"),
        );
      } catch {
        observedHash = null;
      }
      if (observedHash !== requiredFile.contentHash) {
        failures.push({
          observation: "file",
          path: requiredFile.path,
          observedHash,
          requiredHash: requiredFile.contentHash,
        });
      }
    }

    const passed = failures.length === 0;
    return {
      passed,
      summary: passed
        ? "Observable outcome contract passed"
        : "Observable outcome contract failed",
      evidence: {
        contractHash: this.verifierHash,
        observedFinalTextHash: observedTextHash,
        requiredFinalTextHash: requiredTextHash,
        failures,
      },
      retryable: false,
    };
  }
}
