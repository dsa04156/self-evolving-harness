import { randomUUID } from "node:crypto";

export interface Clock {
  now(): Date;
  monotonicNanos(): bigint;
}

export class SystemClock implements Clock {
  public now(): Date {
    return new Date();
  }

  public monotonicNanos(): bigint {
    return process.hrtime.bigint();
  }
}

export class DeterministicClock implements Clock {
  #currentMillis: number;
  #currentNanos: bigint;
  readonly #stepMillis: number;
  readonly #stepNanos: bigint;

  public constructor(
    start = "2026-01-01T00:00:00.000Z",
    options: { stepMillis?: number; stepNanos?: bigint } = {},
  ) {
    this.#currentMillis = Date.parse(start);
    this.#currentNanos = 0n;
    this.#stepMillis = options.stepMillis ?? 1;
    this.#stepNanos = options.stepNanos ?? 1_000_000n;
  }

  public now(): Date {
    const result = new Date(this.#currentMillis);
    this.#currentMillis += this.#stepMillis;
    return result;
  }

  public monotonicNanos(): bigint {
    const result = this.#currentNanos;
    this.#currentNanos += this.#stepNanos;
    return result;
  }
}

export interface IdFactory {
  next(prefix: string): string;
}

export class RandomIdFactory implements IdFactory {
  public next(prefix: string): string {
    return `${prefix}-${randomUUID()}`;
  }
}

export class DeterministicIdFactory implements IdFactory {
  #counter: number;

  public constructor(start = 0) {
    this.#counter = start;
  }

  public next(prefix: string): string {
    const value = this.#counter;
    this.#counter += 1;
    return `${prefix}-${value.toString().padStart(8, "0")}`;
  }
}
