import type { Clock } from "../core/determinism.js";
import { HarnessError, assertCondition } from "../core/errors.js";
import type { ModelUsage } from "../domain/model.js";
import type { BudgetLimits, BudgetUsage } from "../domain/runtime.js";

function emptyUsage(): BudgetUsage {
  return {
    modelCalls: 0,
    inputTokens: 0,
    outputTokens: 0,
    reasoningTokens: 0,
    cachedInputTokens: 0,
    toolCalls: 0,
    retries: 0,
    descendants: 0,
    wallClockMillis: 0,
  };
}

export class BudgetAccount {
  readonly limits: BudgetLimits;
  readonly #clock: Clock;
  readonly #parent: BudgetAccount | null;
  readonly #startedNanos: bigint;
  readonly #usage = emptyUsage();
  #sealed = false;

  public constructor(
    limits: BudgetLimits,
    clock: Clock,
    parent: BudgetAccount | null = null,
  ) {
    for (const [name, value] of Object.entries(limits)) {
      assertCondition(
        Number.isSafeInteger(value) && value >= 0,
        "SCHEMA_INVALID",
        `Invalid budget limit ${name}`,
      );
    }
    if (parent !== null) {
      for (const key of Object.keys(limits) as (keyof BudgetLimits)[]) {
        assertCondition(
          limits[key] <= parent.limits[key],
          "AUTHORIZATION_DENIED",
          `Delegated budget ${key} exceeds its parent`,
        );
      }
    }
    this.limits = limits;
    this.#clock = clock;
    this.#parent = parent;
    this.#startedNanos = clock.monotonicNanos();
  }

  public reserveModelCall(): void {
    this.#assertOpen();
    this.assertTime();
    assertCondition(
      this.#usage.modelCalls < this.limits.maxModelCalls,
      "BUDGET_EXHAUSTED",
      "Model-call budget exhausted",
    );
    this.#parent?.reserveModelCall();
    this.#usage.modelCalls += 1;
  }

  public chargeModelUsage(usage: ModelUsage): void {
    this.#assertOpen();
    for (const [name, value] of Object.entries(usage)) {
      assertCondition(
        Number.isSafeInteger(value) && value >= 0,
        "SCHEMA_INVALID",
        `Provider returned invalid usage ${name}`,
      );
    }
    assertCondition(
      this.#usage.inputTokens + usage.inputTokens <= this.limits.maxInputTokens,
      "BUDGET_EXHAUSTED",
      "Input-token budget exhausted",
    );
    assertCondition(
      this.#usage.outputTokens + usage.outputTokens <= this.limits.maxOutputTokens,
      "BUDGET_EXHAUSTED",
      "Output-token budget exhausted",
    );
    this.#parent?.chargeModelUsage(usage);
    this.#usage.inputTokens += usage.inputTokens;
    this.#usage.outputTokens += usage.outputTokens;
    this.#usage.reasoningTokens += usage.reasoningTokens;
    this.#usage.cachedInputTokens += usage.cachedInputTokens;
  }

  public reserveToolCall(): void {
    this.#assertOpen();
    this.assertTime();
    assertCondition(
      this.#usage.toolCalls < this.limits.maxToolCalls,
      "BUDGET_EXHAUSTED",
      "Tool-call budget exhausted",
    );
    this.#parent?.reserveToolCall();
    this.#usage.toolCalls += 1;
  }

  public reserveRetry(): void {
    this.#assertOpen();
    this.assertTime();
    assertCondition(
      this.#usage.retries < this.limits.maxRetries,
      "BUDGET_EXHAUSTED",
      "Retry budget exhausted",
    );
    this.#parent?.reserveRetry();
    this.#usage.retries += 1;
  }

  public reserveDescendant(): void {
    this.#assertOpen();
    this.assertTime();
    assertCondition(
      this.#usage.descendants < this.limits.maxDescendants,
      "BUDGET_EXHAUSTED",
      "Descendant budget exhausted",
    );
    this.#parent?.reserveDescendant();
    this.#usage.descendants += 1;
  }

  public assertTime(): void {
    const elapsed = this.#elapsedMillis();
    this.#usage.wallClockMillis = elapsed;
    if (elapsed > this.limits.maxWallClockMillis) {
      throw new HarnessError("DEADLINE_EXCEEDED", "Session wall-clock budget exhausted");
    }
    this.#parent?.assertTime();
  }

  public snapshot(): Readonly<BudgetUsage> {
    if (!this.#sealed) {
      this.#usage.wallClockMillis = this.#elapsedMillis();
    }
    return Object.freeze({ ...this.#usage });
  }

  public seal(): Readonly<BudgetUsage> {
    if (this.#sealed) return this.snapshot();
    this.#usage.wallClockMillis = this.#elapsedMillis();
    this.#sealed = true;
    return this.snapshot();
  }

  #elapsedMillis(): number {
    const delta = this.#clock.monotonicNanos() - this.#startedNanos;
    return Number(delta / 1_000_000n);
  }

  #assertOpen(): void {
    assertCondition(!this.#sealed, "INVALID_STATE_TRANSITION", "Budget account is sealed");
  }
}
