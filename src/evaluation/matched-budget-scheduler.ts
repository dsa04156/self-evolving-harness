import { sha256, type JsonValue } from "../core/canonical.js";
import type { Clock } from "../core/determinism.js";
import { asHarnessError, assertCondition } from "../core/errors.js";
import type { SchemaRegistry } from "../contracts/schema-registry.js";
import type {
  PrincipalRegistry,
  PrincipalSigner,
} from "../trust/identity.js";
import {
  TRACK_A_MATCHED_METHODS,
  type BudgetFreezeManifest,
  type MethodId,
  type PhaseBudgetCaps,
} from "./budget-freeze.js";
import {
  PhaseBudgetAccount,
  type PhaseBudgetAccountKey,
  type PhaseBudgetUsage,
} from "./phase-budget.js";

export interface TrackASlot {
  readonly slotIndex: number;
  readonly rolloutSeed: number;
}

export interface TrackAMethodPlan {
  readonly methodId: MethodId;
  readonly modelIdentityHash: string;
  readonly toolSetHash: string;
  readonly environmentHash: string;
  readonly permissionPolicyHash: string;
  readonly budgetFreezeId: string;
  readonly caps: PhaseBudgetCaps;
  readonly slots: readonly TrackASlot[];
}

export interface TrackASlotOutcome {
  readonly methodId: MethodId;
  readonly slotIndex: number;
  readonly rolloutSeed: number;
  readonly status:
    | "success"
    | "failed"
    | "budget_exhausted";
  readonly value: JsonValue | null;
  readonly errorCode: string | null;
  readonly feedbackReleased: boolean;
  readonly usageAfter: PhaseBudgetUsage;
}

export interface TrackAMethodResult {
  readonly methodId: MethodId;
  readonly outcomes: readonly TrackASlotOutcome[];
  readonly finalUsage: PhaseBudgetUsage;
  readonly sealed: true;
  readonly exhaustedDimension: string | null;
}

export type TrackASlotExecutor = (input: {
  readonly methodId: MethodId;
  readonly slot: TrackASlot;
  readonly account: PhaseBudgetAccount;
  readonly priorFeedback: readonly TrackASlotOutcome[];
}) => Promise<JsonValue>;

function trackACaps(
  manifest: BudgetFreezeManifest,
): PhaseBudgetCaps {
  const entry = manifest.phaseCaps.find(
    (candidate) =>
      candidate.phaseId === "track_a_task_search",
  );
  assertCondition(
    entry !== undefined,
    "PROTOCOL_MISMATCH",
    "Matched-budget scheduler requires track_a_task_search caps",
  );
  return entry.caps;
}

function accountId(input: {
  readonly protocolId: string;
  readonly budgetFreezeId: string;
  readonly taskId: string;
  readonly methodId: MethodId;
}): string {
  return `phase-account.${sha256(input as unknown as JsonValue).slice(7, 39)}`;
}

export class MatchedBudgetScheduler {
  readonly #root: string;
  readonly #protocolId: string;
  readonly #manifest: BudgetFreezeManifest;
  readonly #schemas: SchemaRegistry;
  readonly #principals: PrincipalRegistry;
  readonly #signer: PrincipalSigner;
  readonly #clock: Clock;
  readonly #caps: PhaseBudgetCaps;

  public constructor(input: {
    readonly root: string;
    readonly protocolId: string;
    readonly manifest: BudgetFreezeManifest;
    readonly schemas: SchemaRegistry;
    readonly principals: PrincipalRegistry;
    readonly signer: PrincipalSigner;
    readonly clock: Clock;
  }) {
    assertCondition(
      input.manifest.protocolId === input.protocolId,
      "PROTOCOL_MISMATCH",
      "Scheduler protocol differs from budget freeze",
    );
    assertCondition(
      input.manifest.scope === "synthetic_gate3_readiness",
      "AUTHORIZATION_DENIED",
      "Gate 3 readiness scheduler accepts synthetic freeze scope only",
    );
    assertCondition(
      input.manifest.datasetPermissions.length === 1 &&
        input.manifest.datasetPermissions[0] === "deterministic",
      "AUTHORIZATION_DENIED",
      "Gate 3 readiness scheduler cannot access research splits",
    );
    const requiredMethods: readonly MethodId[] = [
      "B0",
      ...TRACK_A_MATCHED_METHODS,
    ];
    assertCondition(
      requiredMethods.every((method) =>
        input.manifest.methods.includes(method),
      ),
      "PROTOCOL_MISMATCH",
      "Budget freeze omits a mandatory Track A method",
    );
    this.#root = input.root;
    this.#protocolId = input.protocolId;
    this.#manifest = input.manifest;
    this.#schemas = input.schemas;
    this.#principals = input.principals;
    this.#signer = input.signer;
    this.#clock = input.clock;
    this.#caps = trackACaps(input.manifest);
  }

  public planTrackA(taskId: string): readonly TrackAMethodPlan[] {
    return this.#manifest.methods
      .filter(
        (method): method is MethodId =>
          method === "B0" ||
          (TRACK_A_MATCHED_METHODS as readonly MethodId[]).includes(
            method,
          ),
      )
      .map((methodId) => {
        const slotCount = this.#manifest.solverSlots.find(
          (entry) => entry.methodId === methodId,
        )!.slots;
        return {
          methodId,
          modelIdentityHash: this.#manifest.modelIdentityHash,
          toolSetHash: this.#manifest.toolSetHash,
          environmentHash: this.#manifest.environmentHash,
          permissionPolicyHash:
            this.#manifest.permissionPolicyHash,
          budgetFreezeId: this.#manifest.budgetFreezeId,
          caps: this.#caps,
          slots: this.#manifest.rolloutSeeds
            .slice(0, slotCount)
            .map((rolloutSeed, slotIndex) => ({
              slotIndex,
              rolloutSeed,
            })),
        };
      });
  }

  public async executeTrackA(input: {
    readonly taskId: string;
    readonly execute: TrackASlotExecutor;
  }): Promise<readonly TrackAMethodResult[]> {
    const results: TrackAMethodResult[] = [];
    for (const plan of this.planTrackA(input.taskId)) {
      const account = this.#account(input.taskId, plan.methodId);
      await account.initialize();
      const outcomes =
        plan.methodId === "B1"
          ? await Promise.all(
              plan.slots.map((slot) =>
                this.#executeSlot({
                  plan,
                  slot,
                  account,
                  priorFeedback: [],
                  execute: input.execute,
                }),
              ),
            )
          : await this.#executeSequential({
              plan,
              account,
              execute: input.execute,
            });
      await account.seal();
      const final = account.snapshot();
      results.push({
        methodId: plan.methodId,
        outcomes,
        finalUsage: final.usage,
        sealed: true,
        exhaustedDimension: final.exhaustedDimension,
      });
    }
    return results;
  }

  async #executeSequential(input: {
    readonly plan: TrackAMethodPlan;
    readonly account: PhaseBudgetAccount;
    readonly execute: TrackASlotExecutor;
  }): Promise<TrackASlotOutcome[]> {
    const outcomes: TrackASlotOutcome[] = [];
    const feedback: TrackASlotOutcome[] = [];
    for (const slot of input.plan.slots) {
      if (
        input.account.snapshot().sealed ||
        input.account.snapshot().exhaustedDimension !== null
      ) {
        outcomes.push({
          methodId: input.plan.methodId,
          slotIndex: slot.slotIndex,
          rolloutSeed: slot.rolloutSeed,
          status: "budget_exhausted",
          value: null,
          errorCode: "BUDGET_EXHAUSTED",
          feedbackReleased: false,
          usageAfter: input.account.snapshot().usage,
        });
        continue;
      }
      const outcome = await this.#executeSlot({
        plan: input.plan,
        slot,
        account: input.account,
        priorFeedback: feedback,
        execute: input.execute,
      });
      outcomes.push(outcome);
      if (outcome.feedbackReleased) feedback.push(outcome);
    }
    return outcomes;
  }

  async #executeSlot(input: {
    readonly plan: TrackAMethodPlan;
    readonly slot: TrackASlot;
    readonly account: PhaseBudgetAccount;
    readonly priorFeedback: readonly TrackASlotOutcome[];
    readonly execute: TrackASlotExecutor;
  }): Promise<TrackASlotOutcome> {
    let status: TrackASlotOutcome["status"] = "success";
    let value: JsonValue | null = null;
    let errorCode: string | null = null;
    try {
      value = await input.execute({
        methodId: input.plan.methodId,
        slot: input.slot,
        account: input.account,
        priorFeedback: input.priorFeedback,
      });
    } catch (error) {
      const harnessError = asHarnessError(error);
      status =
        harnessError.code === "BUDGET_EXHAUSTED"
          ? "budget_exhausted"
          : "failed";
      errorCode = harnessError.code;
    }
    let feedbackReleased = input.plan.methodId === "B0";
    if (input.plan.methodId !== "B0") {
      try {
        await input.account.chargeFeedbackEvent();
        feedbackReleased = true;
      } catch (error) {
        const harnessError = asHarnessError(error);
        if (harnessError.code === "BUDGET_EXHAUSTED") {
          status = "budget_exhausted";
        }
        errorCode ??= harnessError.code;
      }
    }
    return {
      methodId: input.plan.methodId,
      slotIndex: input.slot.slotIndex,
      rolloutSeed: input.slot.rolloutSeed,
      status,
      value,
      errorCode,
      feedbackReleased,
      usageAfter: input.account.snapshot().usage,
    };
  }

  #account(
    taskId: string,
    methodId: MethodId,
  ): PhaseBudgetAccount {
    const account: PhaseBudgetAccountKey = {
      accountId: accountId({
        protocolId: this.#protocolId,
        budgetFreezeId: this.#manifest.budgetFreezeId,
        taskId,
        methodId,
      }),
      track: "track_a",
      methodId,
      taskId,
      candidateId: null,
      phaseId: "track_a_task_search",
    };
    return new PhaseBudgetAccount({
      root: this.#root,
      protocolId: this.#protocolId,
      manifest: this.#manifest,
      account,
      schemas: this.#schemas,
      principals: this.#principals,
      signer: this.#signer,
      clock: this.#clock,
    });
  }
}
