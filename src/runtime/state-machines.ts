import { sha256 } from "../core/canonical.js";
import { assertCondition } from "../core/errors.js";
import type {
  HarnessQualificationState,
  SessionState,
  TerminationDescriptor,
  TerminationReason,
} from "../domain/runtime.js";

const SESSION_TRANSITIONS: Readonly<Record<SessionState, readonly SessionState[]>> = Object.freeze({
  created: ["initialized", "retired", "terminating"],
  initialized: ["running", "blocked", "terminating"],
  running: ["waiting", "validating", "blocked", "recovering", "terminating"],
  waiting: ["running", "blocked", "recovering", "terminating"],
  blocked: ["recovering", "terminating"],
  recovering: ["initialized", "running", "blocked", "terminating"],
  validating: ["completed", "running", "blocked", "terminating"],
  completed: ["retired", "terminating"],
  terminating: ["terminated"],
  retired: [],
  terminated: [],
});

const HARNESS_TRANSITIONS: Readonly<
  Record<HarnessQualificationState, readonly HarnessQualificationState[]>
> = Object.freeze({
  draft: ["candidate", "rejected"],
  candidate: ["statically_validated", "rejected"],
  statically_validated: ["evaluating", "rejected"],
  evaluating: ["canary", "rejected"],
  canary: ["approved", "rejected"],
  approved: ["retired"],
  rejected: ["retired"],
  retired: [],
});

export class SessionStateMachine {
  #state: SessionState;
  #terminationDescriptor: TerminationDescriptor | null = null;

  public constructor(initialState: "created" | "initialized" | "running" = "created") {
    this.#state = initialState;
  }

  public get state(): SessionState {
    return this.#state;
  }

  public get terminationDescriptor(): TerminationDescriptor | null {
    return this.#terminationDescriptor;
  }

  public transition(to: SessionState): void {
    assertCondition(
      SESSION_TRANSITIONS[this.#state].includes(to),
      "INVALID_STATE_TRANSITION",
      `Session cannot transition ${this.#state} → ${to}`,
    );
    assertCondition(
      to !== "terminating" && to !== "terminated",
      "INVALID_STATE_TRANSITION",
      "Use the termination transaction methods",
    );
    this.#state = to;
  }

  public beginTermination(input: {
    terminationTransactionId: string;
    initiatingRecordId: string;
    initiatingPrincipal: string;
    reason: TerminationReason;
  }): TerminationDescriptor {
    const from = this.#state;
    assertCondition(
      SESSION_TRANSITIONS[from].includes("terminating"),
      "INVALID_STATE_TRANSITION",
      `Session cannot terminate from ${from}`,
    );
    assertCondition(
      from !== "retired" && from !== "terminated" && from !== "terminating",
      "INVALID_STATE_TRANSITION",
      "Session is already terminal",
    );
    const descriptor: TerminationDescriptor = {
      ...input,
      preTerminationState: from,
    };
    this.#terminationDescriptor = descriptor;
    this.#state = "terminating";
    return descriptor;
  }

  public completeTermination(descriptor: TerminationDescriptor): void {
    assertCondition(this.#state === "terminating", "INVALID_STATE_TRANSITION", "Not terminating");
    assertCondition(
      sha256(descriptor) === sha256(this.#terminationDescriptor),
      "HASH_MISMATCH",
      "Termination descriptor changed",
    );
    this.#state = "terminated";
  }
}

export class HarnessQualificationStateMachine {
  #state: HarnessQualificationState = "draft";

  public get state(): HarnessQualificationState {
    return this.#state;
  }

  public transition(to: HarnessQualificationState): void {
    assertCondition(
      HARNESS_TRANSITIONS[this.#state].includes(to),
      "INVALID_STATE_TRANSITION",
      `Harness cannot transition ${this.#state} → ${to}`,
    );
    this.#state = to;
  }
}
