import {
  sha256,
  type JsonValue,
} from "../core/canonical.js";
import {
  HarnessError,
  assertCondition,
} from "../core/errors.js";
import type {
  ModelOutputItem,
  ModelProvider,
  ModelRequest,
  ModelResponse,
  ModelUsage,
} from "../domain/model.js";

export interface CanonicalModelRequestProjection {
  readonly modelIdentity: string;
  readonly instructions: string;
  readonly input: ModelRequest["input"];
  readonly tools: ModelRequest["tools"];
  readonly maxOutputTokens: number;
  readonly reasoningEffort: ModelRequest["reasoningEffort"] | null;
}

export interface CanonicalRequestTableRow {
  readonly requestProjectionHash: string;
  readonly output: readonly ModelOutputItem[];
  readonly usage?: ModelUsage;
}

export interface CanonicalRequestObservation {
  readonly requestProjectionHash: string;
  readonly matched: boolean;
}

const ZERO_USAGE: ModelUsage = Object.freeze({
  inputTokens: 0,
  outputTokens: 0,
  reasoningTokens: 0,
  cachedInputTokens: 0,
  totalTokens: 0,
});

const DEFAULT_REJECTION_OUTPUT: readonly ModelOutputItem[] = Object.freeze([
  Object.freeze({
    kind: "assistant_message" as const,
    text: "SEMANTIC_REJECTED",
  }),
]);

export function canonicalModelRequestProjection(
  request: ModelRequest,
): CanonicalModelRequestProjection {
  return {
    modelIdentity: request.modelIdentity,
    instructions: request.instructions,
    input: structuredClone(request.input),
    tools: structuredClone(request.tools),
    maxOutputTokens: request.maxOutputTokens,
    reasoningEffort: request.reasoningEffort ?? null,
  };
}

export function canonicalModelRequestProjectionHash(
  request: ModelRequest,
): string {
  return sha256(
    canonicalModelRequestProjection(request) as unknown as JsonValue,
  );
}

function cloneOutput(
  output: readonly ModelOutputItem[],
): readonly ModelOutputItem[] {
  return structuredClone(output);
}

function cloneUsage(usage: ModelUsage): ModelUsage {
  return { ...usage };
}

export class CanonicalRequestTableProvider implements ModelProvider {
  public readonly providerId = "canonical-request-table-fake-v1";
  public readonly observations: CanonicalRequestObservation[] = [];
  readonly #rows = new Map<string, CanonicalRequestTableRow>();
  readonly #fallbackOutput: readonly ModelOutputItem[];
  readonly #fallbackUsage: ModelUsage;

  public constructor(input: {
    readonly rows: readonly CanonicalRequestTableRow[];
    readonly fallbackOutput?: readonly ModelOutputItem[];
    readonly fallbackUsage?: ModelUsage;
  }) {
    for (const row of input.rows) {
      assertCondition(
        /^sha256:[a-f0-9]{64}$/u.test(row.requestProjectionHash),
        "SCHEMA_INVALID",
        "Request-table row has a malformed projection hash",
      );
      assertCondition(
        !this.#rows.has(row.requestProjectionHash),
        "CONFLICT",
        "Request-table projection hashes must be unique",
      );
      assertCondition(
        row.output.length > 0,
        "SCHEMA_INVALID",
        "Request-table row output is empty",
      );
      this.#rows.set(row.requestProjectionHash, structuredClone(row));
    }
    this.#fallbackOutput = cloneOutput(
      input.fallbackOutput ?? DEFAULT_REJECTION_OUTPUT,
    );
    this.#fallbackUsage = cloneUsage(input.fallbackUsage ?? ZERO_USAGE);
  }

  public async generate(request: ModelRequest): Promise<ModelResponse> {
    if (request.abortSignal?.aborted === true) {
      throw new HarnessError(
        "DEADLINE_EXCEEDED",
        "Canonical request-table provider request aborted",
      );
    }
    const requestProjectionHash =
      canonicalModelRequestProjectionHash(request);
    const row = this.#rows.get(requestProjectionHash);
    const matched = row !== undefined;
    this.observations.push({ requestProjectionHash, matched });
    const output = cloneOutput(
      row?.output ?? this.#fallbackOutput,
    );
    const usage = cloneUsage(row?.usage ?? this.#fallbackUsage);
    return {
      responseId: `response-${requestProjectionHash.slice("sha256:".length, 18)}`,
      modelIdentity: request.modelIdentity,
      output,
      usage,
      providerMetadata: {
        providerKind: "deterministic_request_table",
        requestProjectionHash,
        matched,
      },
    };
  }
}
