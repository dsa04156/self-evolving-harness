import path from "node:path";

import { sha256, type JsonValue } from "../core/canonical.js";
import type { Clock } from "../core/determinism.js";
import {
  HarnessError,
  assertCondition,
} from "../core/errors.js";
import {
  SCHEMA_BASE_URL,
  type SchemaRegistry,
} from "../contracts/schema-registry.js";
import { AppendOnlyLog } from "../storage/append-only-log.js";
import type {
  Attestation,
  PrincipalIdentity,
  PrincipalRegistry,
  PrincipalSigner,
} from "../trust/identity.js";
import type {
  BudgetFreezeManifest,
  EvaluationPhaseId,
  MethodId,
  PhaseBudgetCaps,
} from "./budget-freeze.js";

export const PHASE_BUDGET_RECORD_SCHEMA_ID =
  `${SCHEMA_BASE_URL}phase-budget-record.schema.json`;

export interface PhaseBudgetAccountKey {
  readonly accountId: string;
  readonly track:
    | "track_a"
    | "track_b"
    | "provider_smoke"
    | "synthetic";
  readonly methodId: MethodId;
  readonly taskId: string;
  readonly candidateId: string | null;
  readonly phaseId: EvaluationPhaseId;
}

export interface PhaseBudgetUsage {
  readonly modelRequestAttempts: number;
  readonly completedModelCalls: number;
  readonly failedModelCalls: number;
  readonly cancelledModelCalls: number;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly reasoningTokens: number;
  readonly cachedInputTokens: number;
  readonly totalChargedTokens: number;
  readonly providerCostMicros: number;
  readonly toolAttempts: number;
  readonly feedbackEvents: number;
  readonly processCount: number;
  readonly outputBytes: number;
  readonly wallClockMillis: number;
}

export type BudgetDimension =
  | keyof PhaseBudgetCaps
  | "perRequestTokenCap"
  | "perRequestCostCapMicros";

export interface PhaseBudgetRecord {
  readonly schemaVersion: 1;
  readonly phaseBudgetRecordId: string;
  readonly protocolId: string;
  readonly budgetFreezeId: string;
  readonly account: PhaseBudgetAccountKey;
  readonly caps: PhaseBudgetCaps;
  readonly accountSequence: number;
  readonly eventType:
    | "opened"
    | "provider_reserved"
    | "provider_settled"
    | "tool_charged"
    | "feedback_charged"
    | "process_charged"
    | "output_charged"
    | "budget_denied"
    | "sealed";
  readonly requestId: string | null;
  readonly requestStatus:
    | null
    | "reserved"
    | "completed"
    | "failed"
    | "cancelled";
  readonly reservationTokens: number;
  readonly reservationCostMicros: number;
  readonly usage: PhaseBudgetUsage;
  readonly outstandingReservationTokens: number;
  readonly outstandingReservationCostMicros: number;
  readonly exhaustedDimension: BudgetDimension | null;
  readonly sealed: boolean;
  readonly occurredAt: string;
  readonly producer: PrincipalIdentity;
  readonly attestation: Attestation;
}

export interface ProviderCharge {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly reasoningTokens: number;
  readonly cachedInputTokens: number;
  readonly totalChargedTokens: number;
  readonly providerCostMicros: number;
}

type PhaseBudgetRecordBody = Omit<PhaseBudgetRecord, "attestation">;
type PhaseBudgetRecordCore = Omit<
  PhaseBudgetRecord,
  "phaseBudgetRecordId" | "attestation"
>;

const ZERO_USAGE: PhaseBudgetUsage = Object.freeze({
  modelRequestAttempts: 0,
  completedModelCalls: 0,
  failedModelCalls: 0,
  cancelledModelCalls: 0,
  inputTokens: 0,
  outputTokens: 0,
  reasoningTokens: 0,
  cachedInputTokens: 0,
  totalChargedTokens: 0,
  providerCostMicros: 0,
  toolAttempts: 0,
  feedbackEvents: 0,
  processCount: 0,
  outputBytes: 0,
  wallClockMillis: 0,
});

function bodyOf(record: PhaseBudgetRecord): PhaseBudgetRecordBody {
  const { attestation: _attestation, ...body } = record;
  return body;
}

function coreOf(record: PhaseBudgetRecord): PhaseBudgetRecordCore {
  const {
    phaseBudgetRecordId: _phaseBudgetRecordId,
    attestation: _attestation,
    ...core
  } = record;
  return core;
}

function assertNonnegativeIntegers(
  value: Readonly<Record<string, number>>,
  label: string,
): void {
  for (const [name, entry] of Object.entries(value)) {
    assertCondition(
      Number.isSafeInteger(entry) && entry >= 0,
      "SCHEMA_INVALID",
      `${label}.${name} must be a nonnegative safe integer`,
    );
  }
}

function phaseCaps(
  manifest: BudgetFreezeManifest,
  phaseId: EvaluationPhaseId,
): PhaseBudgetCaps {
  const entry = manifest.phaseCaps.find(
    (candidate) => candidate.phaseId === phaseId,
  );
  assertCondition(
    entry !== undefined,
    "PROTOCOL_MISMATCH",
    `Budget freeze has no caps for phase ${phaseId}`,
  );
  return entry.caps;
}

function equalJson(left: JsonValue, right: JsonValue): boolean {
  return sha256(left) === sha256(right);
}

const USAGE_DIMENSIONS = Object.keys(
  ZERO_USAGE,
) as readonly (keyof PhaseBudgetUsage)[];

function usageDelta(
  previous: PhaseBudgetUsage,
  current: PhaseBudgetUsage,
  dimension: keyof PhaseBudgetUsage,
): number {
  return current[dimension] - previous[dimension];
}

function assertUsageTransition(input: {
  readonly previous: PhaseBudgetUsage;
  readonly current: PhaseBudgetUsage;
  readonly allowed: ReadonlySet<keyof PhaseBudgetUsage>;
}): void {
  assertNonnegativeIntegers(
    input.current as unknown as Readonly<Record<string, number>>,
    "usage",
  );
  for (const dimension of USAGE_DIMENSIONS) {
    const delta = usageDelta(
      input.previous,
      input.current,
      dimension,
    );
    assertCondition(
      delta >= 0,
      "HASH_MISMATCH",
      `Phase usage decreased at ${dimension}`,
    );
    assertCondition(
      input.allowed.has(dimension) || delta === 0,
      "HASH_MISMATCH",
      `Phase event changed unauthorized usage dimension ${dimension}`,
    );
  }
}

export function assertPhaseBudgetSequenceContract(
  records: readonly PhaseBudgetRecord[],
  manifest: BudgetFreezeManifest,
): void {
  if (records.length === 0) return;
  const reservations = new Map<
    string,
    { readonly tokens: number; readonly costMicros: number }
  >();
  let previous: PhaseBudgetRecord | null = null;
  let exhaustedDimension: BudgetDimension | null = null;
  const producer = records[0]!.producer;

  for (const [index, record] of records.entries()) {
    assertCondition(
      equalJson(
        record.producer as unknown as JsonValue,
        producer as unknown as JsonValue,
      ),
      "AUTHENTICATION_FAILED",
      "Phase budget producer changed within one account",
    );
    assertCondition(
      record.producer.role === "operations_owner",
      "AUTHORIZATION_DENIED",
      "Phase budget record producer is not the operations owner",
    );
    assertCondition(
      record.sealed === (record.eventType === "sealed"),
      "INVALID_STATE_TRANSITION",
      "Only a sealed event may seal a phase budget account",
    );
    if (index === 0) {
      assertCondition(
        record.eventType === "opened" &&
          record.requestId === null &&
          record.requestStatus === null &&
          record.reservationTokens === 0 &&
          record.reservationCostMicros === 0 &&
          record.outstandingReservationTokens === 0 &&
          record.outstandingReservationCostMicros === 0 &&
          record.exhaustedDimension === null &&
          equalJson(
            record.usage as unknown as JsonValue,
            ZERO_USAGE as unknown as JsonValue,
          ),
        "INVALID_STATE_TRANSITION",
        "Phase budget ledger must begin with an empty opened record",
      );
      previous = record;
      continue;
    }

    assertCondition(
      previous !== null && !previous.sealed,
      "INVALID_STATE_TRANSITION",
      "Phase budget record follows a sealed record",
    );
    assertCondition(
      record.eventType !== "opened",
      "INVALID_STATE_TRANSITION",
      "Phase budget account can only be opened once",
    );
    if (exhaustedDimension !== null) {
      assertCondition(
        record.eventType === "provider_settled" ||
          record.eventType === "sealed",
        "INVALID_STATE_TRANSITION",
        "New phase work cannot start after budget exhaustion",
      );
    }
    assertCondition(
      Date.parse(record.occurredAt) >= Date.parse(previous.occurredAt),
      "HASH_MISMATCH",
      "Phase budget timestamps are not monotonic",
    );

    const allowed = new Set<keyof PhaseBudgetUsage>([
      "wallClockMillis",
    ]);
    switch (record.eventType) {
      case "provider_reserved": {
        allowed.add("modelRequestAttempts");
        assertCondition(
          record.requestId !== null &&
            record.requestStatus === "reserved" &&
            record.reservationTokens >= 1 &&
            record.reservationTokens <=
              manifest.perRequestTokenCap &&
            record.reservationCostMicros ===
              manifest.perRequestCostCapMicros &&
            !reservations.has(record.requestId),
          "INVALID_STATE_TRANSITION",
          "Invalid provider reservation transition",
        );
        assertCondition(
          usageDelta(
            previous.usage,
            record.usage,
            "modelRequestAttempts",
          ) === 1,
          "HASH_MISMATCH",
          "Provider reservation must charge exactly one attempt",
        );
        reservations.set(record.requestId, {
          tokens: record.reservationTokens,
          costMicros: record.reservationCostMicros,
        });
        assertCondition(
          record.usage.totalChargedTokens +
              [...reservations.values()].reduce(
                (sum, reservation) => sum + reservation.tokens,
                0,
              ) <=
              record.caps.totalChargedTokens &&
            record.usage.providerCostMicros +
              [...reservations.values()].reduce(
                (sum, reservation) =>
                  sum + reservation.costMicros,
                0,
              ) <=
              record.caps.providerCostMicros &&
            record.usage.modelRequestAttempts <=
              record.caps.providerModelRequestAttempts,
          "BUDGET_EXHAUSTED",
          "Admitted provider reservation exceeds a phase cap",
        );
        break;
      }
      case "provider_settled": {
        allowed.add("completedModelCalls");
        allowed.add("failedModelCalls");
        allowed.add("cancelledModelCalls");
        allowed.add("inputTokens");
        allowed.add("outputTokens");
        allowed.add("reasoningTokens");
        allowed.add("cachedInputTokens");
        allowed.add("totalChargedTokens");
        allowed.add("providerCostMicros");
        const reservation =
          record.requestId === null
            ? undefined
            : reservations.get(record.requestId);
        assertCondition(
          reservation !== undefined &&
            record.requestStatus !== null &&
            record.requestStatus !== "reserved" &&
            record.reservationTokens === reservation.tokens &&
            record.reservationCostMicros ===
              reservation.costMicros,
          "INVALID_STATE_TRANSITION",
          "Provider settlement has no matching reservation",
        );
        for (const status of [
          "completed",
          "failed",
          "cancelled",
        ] as const) {
          const dimension =
            `${status}ModelCalls` as keyof PhaseBudgetUsage;
          assertCondition(
            usageDelta(previous.usage, record.usage, dimension) ===
              (record.requestStatus === status ? 1 : 0),
            "HASH_MISMATCH",
            "Provider settlement terminal count mismatch",
          );
        }
        reservations.delete(record.requestId!);
        break;
      }
      case "tool_charged":
      case "feedback_charged": {
        const dimension =
          record.eventType === "tool_charged"
            ? "toolAttempts"
            : "feedbackEvents";
        allowed.add(dimension);
        assertCondition(
          usageDelta(previous.usage, record.usage, dimension) === 1,
          "HASH_MISMATCH",
          `${record.eventType} must charge exactly one unit`,
        );
        break;
      }
      case "process_charged":
      case "output_charged": {
        const dimension =
          record.eventType === "process_charged"
            ? "processCount"
            : "outputBytes";
        allowed.add(dimension);
        assertCondition(
          usageDelta(previous.usage, record.usage, dimension) >= 1,
          "HASH_MISMATCH",
          `${record.eventType} must charge a positive amount`,
        );
        break;
      }
      case "budget_denied":
        assertCondition(
          record.requestStatus === null &&
            record.reservationTokens === 0 &&
            record.reservationCostMicros === 0 &&
            record.exhaustedDimension !== null,
          "INVALID_STATE_TRANSITION",
          "Budget denial must identify an exhausted dimension",
        );
        break;
      case "sealed":
        assertCondition(
          record.requestId === null &&
            record.requestStatus === null &&
            record.reservationTokens === 0 &&
            record.reservationCostMicros === 0 &&
            reservations.size === 0,
          "INVALID_STATE_TRANSITION",
          "Sealed phase budget has invalid terminal state",
        );
        break;
      default:
        assertCondition(
          false,
          "INVALID_STATE_TRANSITION",
          "Unsupported phase budget event",
        );
    }

    if (
      record.eventType !== "provider_reserved" &&
      record.eventType !== "provider_settled" &&
      record.eventType !== "budget_denied"
    ) {
      assertCondition(
        record.requestId === null &&
          record.requestStatus === null &&
          record.reservationTokens === 0 &&
          record.reservationCostMicros === 0,
        "INVALID_STATE_TRANSITION",
        "Non-provider phase event contains provider reservation fields",
      );
    }
    assertUsageTransition({
      previous: previous.usage,
      current: record.usage,
      allowed,
    });
    const outstandingTokens = [...reservations.values()].reduce(
      (sum, reservation) => sum + reservation.tokens,
      0,
    );
    const outstandingCostMicros = [...reservations.values()].reduce(
      (sum, reservation) => sum + reservation.costMicros,
      0,
    );
    assertCondition(
      record.outstandingReservationTokens === outstandingTokens &&
        record.outstandingReservationCostMicros ===
          outstandingCostMicros,
      "HASH_MISMATCH",
      "Phase budget outstanding reservation totals mismatch",
    );
    if (exhaustedDimension !== null) {
      assertCondition(
        record.exhaustedDimension === exhaustedDimension,
        "INVALID_STATE_TRANSITION",
        "The first exhausted budget dimension must remain stable",
      );
    } else if (record.exhaustedDimension !== null) {
      assertCondition(
        record.eventType === "budget_denied" ||
          record.eventType === "provider_settled" ||
          record.eventType === "sealed",
        "INVALID_STATE_TRANSITION",
        "This phase event cannot exhaust a budget",
      );
      exhaustedDimension = record.exhaustedDimension;
    }
    previous = record;
  }
}

export function verifyPhaseBudgetRecord(input: {
  readonly record: PhaseBudgetRecord;
  readonly expectedProtocolId: string;
  readonly expectedManifest: BudgetFreezeManifest;
  readonly expectedAccount: PhaseBudgetAccountKey;
  readonly expectedCaps: PhaseBudgetCaps;
  readonly expectedSequence: number;
  readonly schemas: SchemaRegistry;
  readonly principals: PrincipalRegistry;
}): void {
  input.schemas.validate(
    PHASE_BUDGET_RECORD_SCHEMA_ID,
    input.record as unknown as JsonValue,
  );
  assertCondition(
    input.record.protocolId === input.expectedProtocolId &&
      input.record.budgetFreezeId ===
        input.expectedManifest.budgetFreezeId &&
      input.record.accountSequence === input.expectedSequence &&
      equalJson(
        input.record.account as unknown as JsonValue,
        input.expectedAccount as unknown as JsonValue,
      ) &&
      equalJson(
        input.record.caps as unknown as JsonValue,
        input.expectedCaps as unknown as JsonValue,
      ),
    "PROTOCOL_MISMATCH",
    "Phase budget record does not match its frozen account",
  );
  assertCondition(
    input.record.phaseBudgetRecordId ===
      `pbr-sha256:${sha256(coreOf(input.record) as unknown as JsonValue).slice(7)}`,
    "HASH_MISMATCH",
    "Phase budget record content identity mismatch",
  );
  input.principals.verify(
    input.record.producer,
    bodyOf(input.record) as unknown as JsonValue,
    input.record.attestation,
  );
}

export class PhaseBudgetAccount {
  readonly #protocolId: string;
  readonly #manifest: BudgetFreezeManifest;
  readonly #account: PhaseBudgetAccountKey;
  readonly #caps: PhaseBudgetCaps;
  readonly #schemas: SchemaRegistry;
  readonly #principals: PrincipalRegistry;
  readonly #signer: PrincipalSigner;
  readonly #clock: Clock;
  readonly #log: AppendOnlyLog<JsonValue>;
  readonly #startedNanos: bigint;
  #baseWallClockMillis = 0;
  #usage: PhaseBudgetUsage = { ...ZERO_USAGE };
  #sequence = 0;
  #sealed = false;
  #exhaustedDimension: BudgetDimension | null = null;
  #outstandingReservationTokens = 0;
  #outstandingReservationCostMicros = 0;
  #reservations = new Map<
    string,
    { readonly tokens: number; readonly costMicros: number }
  >();
  #queue: Promise<void> = Promise.resolve();

  public constructor(input: {
    readonly root: string;
    readonly protocolId: string;
    readonly manifest: BudgetFreezeManifest;
    readonly account: PhaseBudgetAccountKey;
    readonly schemas: SchemaRegistry;
    readonly principals: PrincipalRegistry;
    readonly signer: PrincipalSigner;
    readonly clock: Clock;
  }) {
    assertCondition(
      input.manifest.protocolId === input.protocolId,
      "PROTOCOL_MISMATCH",
      "Phase account protocol differs from its budget freeze",
    );
    assertCondition(
      input.manifest.methods.includes(input.account.methodId),
      "PROTOCOL_MISMATCH",
      "Phase account method is not frozen",
    );
    assertCondition(
      input.signer.identity.role === "operations_owner",
      "AUTHORIZATION_DENIED",
      "Only the operations owner can maintain phase budgets",
    );
    this.#protocolId = input.protocolId;
    this.#manifest = input.manifest;
    this.#account = input.account;
    this.#caps = phaseCaps(input.manifest, input.account.phaseId);
    this.#schemas = input.schemas;
    this.#principals = input.principals;
    this.#signer = input.signer;
    this.#clock = input.clock;
    this.#startedNanos = input.clock.monotonicNanos();
    this.#log = new AppendOnlyLog<JsonValue>(
      path.join(input.root, "budgets"),
      `phase.${input.account.accountId}`,
    );
  }

  public async initialize(): Promise<void> {
    await this.#withLock(async () => {
      const records = await this.#readAndVerify();
      if (records.length === 0) {
        await this.#append({
          eventType: "opened",
          requestId: null,
          requestStatus: null,
          reservationTokens: 0,
          reservationCostMicros: 0,
          exhaustedDimension: null,
          sealed: false,
        });
        return;
      }
      const last = records.at(-1)!;
      this.#usage = { ...last.usage };
      this.#sequence = records.length;
      this.#sealed = last.sealed;
      this.#exhaustedDimension = last.exhaustedDimension;
      this.#outstandingReservationTokens =
        last.outstandingReservationTokens;
      this.#outstandingReservationCostMicros =
        last.outstandingReservationCostMicros;
      this.#baseWallClockMillis = last.usage.wallClockMillis;
      this.#reservations = this.#reconstructReservations(records);
      assertCondition(
        [...this.#reservations.values()].reduce(
          (sum, value) => sum + value.tokens,
          0,
        ) === this.#outstandingReservationTokens,
        "HASH_MISMATCH",
        "Outstanding provider reservations do not reconstruct",
      );
      assertCondition(
        [...this.#reservations.values()].reduce(
          (sum, value) => sum + value.costMicros,
          0,
        ) === this.#outstandingReservationCostMicros,
        "HASH_MISMATCH",
        "Outstanding provider cost reservations do not reconstruct",
      );
    });
  }

  public async reserveProviderRequest(
    requestId: string,
    reservationTokens: number,
  ): Promise<void> {
    await this.#withLock(async () => {
      await this.#assertNewWorkAndTime();
      assertCondition(
        !this.#reservations.has(requestId),
        "CONFLICT",
        "Provider request ID is already reserved",
      );
      assertCondition(
        Number.isSafeInteger(reservationTokens) &&
          reservationTokens >= 1,
        "SCHEMA_INVALID",
        "Provider reservation must be a positive safe integer",
      );
      if (reservationTokens > this.#manifest.perRequestTokenCap) {
        await this.#deny("perRequestTokenCap", requestId);
      }
      if (
        this.#usage.modelRequestAttempts + 1 >
        this.#caps.providerModelRequestAttempts
      ) {
        await this.#deny("providerModelRequestAttempts", requestId);
      }
      if (
        this.#usage.totalChargedTokens +
          this.#outstandingReservationTokens +
          reservationTokens >
        this.#caps.totalChargedTokens
      ) {
        await this.#deny("totalChargedTokens", requestId);
      }
      if (
        this.#usage.providerCostMicros +
          this.#outstandingReservationCostMicros +
          this.#manifest.perRequestCostCapMicros >
        this.#caps.providerCostMicros
      ) {
        await this.#deny("providerCostMicros", requestId);
      }
      this.#usage = {
        ...this.#usage,
        modelRequestAttempts:
          this.#usage.modelRequestAttempts + 1,
      };
      this.#reservations.set(requestId, {
        tokens: reservationTokens,
        costMicros: this.#manifest.perRequestCostCapMicros,
      });
      this.#outstandingReservationTokens += reservationTokens;
      this.#outstandingReservationCostMicros +=
        this.#manifest.perRequestCostCapMicros;
      await this.#append({
        eventType: "provider_reserved",
        requestId,
        requestStatus: "reserved",
        reservationTokens,
        reservationCostMicros:
          this.#manifest.perRequestCostCapMicros,
        exhaustedDimension: null,
        sealed: false,
      });
    });
  }

  public async settleProviderRequest(input: {
    readonly requestId: string;
    readonly status: "completed" | "failed" | "cancelled";
    readonly usage: ProviderCharge | null;
    readonly observedTotalTokens?: number;
  }): Promise<void> {
    await this.#withLock(async () => {
      this.#assertOpen();
      const reservation = this.#reservations.get(input.requestId);
      assertCondition(
        reservation !== undefined,
        "CONFLICT",
        "Provider request has no outstanding reservation",
      );
      if (input.status === "completed") {
        assertCondition(
          input.usage !== null,
          "SCHEMA_INVALID",
          "Completed provider request requires usage",
        );
      }
      const observed = input.observedTotalTokens ?? 0;
      assertCondition(
        Number.isSafeInteger(observed) && observed >= 0,
        "SCHEMA_INVALID",
        "Observed provider tokens must be a nonnegative safe integer",
      );
      const reported = input.usage ?? {
        inputTokens: 0,
        outputTokens: 0,
        reasoningTokens: 0,
        cachedInputTokens: 0,
          totalChargedTokens: reservation.tokens,
          providerCostMicros: 0,
      };
      assertNonnegativeIntegers(
        reported as unknown as Readonly<Record<string, number>>,
        "providerUsage",
      );
      const chargedTokens =
        input.usage === null
          ? reservation.tokens
          : Math.max(reported.totalChargedTokens, observed);
      this.#reservations.delete(input.requestId);
      this.#outstandingReservationTokens -= reservation.tokens;
      this.#outstandingReservationCostMicros -=
        reservation.costMicros;
      this.#usage = {
        ...this.#usage,
        completedModelCalls:
          this.#usage.completedModelCalls +
          (input.status === "completed" ? 1 : 0),
        failedModelCalls:
          this.#usage.failedModelCalls +
          (input.status === "failed" ? 1 : 0),
        cancelledModelCalls:
          this.#usage.cancelledModelCalls +
          (input.status === "cancelled" ? 1 : 0),
        inputTokens: this.#usage.inputTokens + reported.inputTokens,
        outputTokens:
          this.#usage.outputTokens + reported.outputTokens,
        reasoningTokens:
          this.#usage.reasoningTokens + reported.reasoningTokens,
        cachedInputTokens:
          this.#usage.cachedInputTokens +
          reported.cachedInputTokens,
        totalChargedTokens:
          this.#usage.totalChargedTokens + chargedTokens,
        providerCostMicros:
          this.#usage.providerCostMicros +
          reported.providerCostMicros,
      };
      let exhausted: BudgetDimension | null =
        this.#exhaustedDimension;
      if (
        exhausted === null &&
        chargedTokens > reservation.tokens
      ) {
        exhausted = "perRequestTokenCap";
      } else if (
        exhausted === null &&
        reported.providerCostMicros > reservation.costMicros
      ) {
        exhausted = "perRequestCostCapMicros";
      } else if (
        exhausted === null &&
        this.#usage.totalChargedTokens >
        this.#caps.totalChargedTokens
      ) {
        exhausted = "totalChargedTokens";
      } else if (
        exhausted === null &&
        this.#usage.providerCostMicros >
        this.#caps.providerCostMicros
      ) {
        exhausted = "providerCostMicros";
      }
      if (exhausted !== null) {
        this.#exhaustedDimension = exhausted;
      }
      await this.#append({
        eventType: "provider_settled",
        requestId: input.requestId,
        requestStatus: input.status,
        reservationTokens: reservation.tokens,
        reservationCostMicros: reservation.costMicros,
        exhaustedDimension: exhausted,
        sealed: false,
      });
      if (exhausted !== null) {
        throw new HarnessError(
          "BUDGET_EXHAUSTED",
          `Provider settlement exhausted ${exhausted}`,
        );
      }
    });
  }

  public async chargeToolAttempt(): Promise<void> {
    await this.#chargeCount("toolAttempts", "tool_charged");
  }

  public async chargeFeedbackEvent(): Promise<void> {
    await this.#chargeCount(
      "feedbackEvents",
      "feedback_charged",
    );
  }

  public async chargeProcess(count = 1): Promise<void> {
    await this.#chargeAmount(
      "processCount",
      "process_charged",
      count,
    );
  }

  public async chargeOutputBytes(bytes: number): Promise<void> {
    await this.#chargeAmount(
      "outputBytes",
      "output_charged",
      bytes,
    );
  }

  public async seal(): Promise<PhaseBudgetRecord> {
    return this.#withLock(async () => {
      if (this.#sealed) {
        return (await this.#readAndVerify()).at(-1)!;
      }
      assertCondition(
        this.#reservations.size === 0,
        "INVALID_STATE_TRANSITION",
        "Cannot seal a phase account with unsettled provider requests",
      );
      this.#usage = {
        ...this.#usage,
        wallClockMillis: this.#elapsedMillis(),
      };
      if (
        this.#exhaustedDimension === null &&
        this.#usage.wallClockMillis > this.#caps.wallClockMillis
      ) {
        this.#exhaustedDimension = "wallClockMillis";
      }
      this.#sealed = true;
      return this.#append({
        eventType: "sealed",
        requestId: null,
        requestStatus: null,
        reservationTokens: 0,
        reservationCostMicros: 0,
        exhaustedDimension: this.#exhaustedDimension,
        sealed: true,
      });
    });
  }

  public snapshot(): {
    readonly usage: PhaseBudgetUsage;
    readonly outstandingReservationTokens: number;
    readonly outstandingReservationCostMicros: number;
    readonly exhaustedDimension: BudgetDimension | null;
    readonly sealed: boolean;
  } {
    return {
      usage: { ...this.#usage },
      outstandingReservationTokens:
        this.#outstandingReservationTokens,
      outstandingReservationCostMicros:
        this.#outstandingReservationCostMicros,
      exhaustedDimension: this.#exhaustedDimension,
      sealed: this.#sealed,
    };
  }

  public async records(): Promise<PhaseBudgetRecord[]> {
    return this.#readAndVerify();
  }

  async #chargeCount(
    dimension: "toolAttempts" | "feedbackEvents",
    eventType: "tool_charged" | "feedback_charged",
  ): Promise<void> {
    await this.#chargeAmount(dimension, eventType, 1);
  }

  async #chargeAmount(
    dimension:
      | "toolAttempts"
      | "feedbackEvents"
      | "processCount"
      | "outputBytes",
    eventType:
      | "tool_charged"
      | "feedback_charged"
      | "process_charged"
      | "output_charged",
    amount: number,
  ): Promise<void> {
    await this.#withLock(async () => {
      await this.#assertNewWorkAndTime();
      assertCondition(
        Number.isSafeInteger(amount) && amount >= 1,
        "SCHEMA_INVALID",
        `${dimension} charge must be a positive safe integer`,
      );
      if (this.#usage[dimension] + amount > this.#caps[dimension]) {
        await this.#deny(dimension, null);
      }
      this.#usage = {
        ...this.#usage,
        [dimension]: this.#usage[dimension] + amount,
      };
      await this.#append({
        eventType,
        requestId: null,
        requestStatus: null,
        reservationTokens: 0,
        reservationCostMicros: 0,
        exhaustedDimension: null,
        sealed: false,
      });
    });
  }

  async #assertNewWorkAndTime(): Promise<void> {
    this.#assertOpen();
    if (this.#exhaustedDimension !== null) {
      throw new HarnessError(
        "BUDGET_EXHAUSTED",
        `Phase budget already exhausted ${this.#exhaustedDimension}`,
      );
    }
    const elapsed = this.#elapsedMillis();
    this.#usage = { ...this.#usage, wallClockMillis: elapsed };
    if (elapsed > this.#caps.wallClockMillis) {
      await this.#deny("wallClockMillis", null);
    }
  }

  #assertOpen(): void {
    assertCondition(
      !this.#sealed,
      "INVALID_STATE_TRANSITION",
      "Phase budget account is sealed",
    );
  }

  async #deny(
    dimension: BudgetDimension,
    requestId: string | null,
  ): Promise<never> {
    this.#exhaustedDimension = dimension;
    await this.#append({
      eventType: "budget_denied",
      requestId,
      requestStatus: null,
      reservationTokens: 0,
      reservationCostMicros: 0,
      exhaustedDimension: dimension,
      sealed: false,
    });
    throw new HarnessError(
      "BUDGET_EXHAUSTED",
      `Phase budget exhausted ${dimension}`,
    );
  }

  async #append(input: {
    readonly eventType: PhaseBudgetRecord["eventType"];
    readonly requestId: string | null;
    readonly requestStatus: PhaseBudgetRecord["requestStatus"];
    readonly reservationTokens: number;
    readonly reservationCostMicros: number;
    readonly exhaustedDimension: BudgetDimension | null;
    readonly sealed: boolean;
  }): Promise<PhaseBudgetRecord> {
    const core: PhaseBudgetRecordCore = {
      schemaVersion: 1,
      protocolId: this.#protocolId,
      budgetFreezeId: this.#manifest.budgetFreezeId,
      account: this.#account,
      caps: this.#caps,
      accountSequence: this.#sequence,
      eventType: input.eventType,
      requestId: input.requestId,
      requestStatus: input.requestStatus,
      reservationTokens: input.reservationTokens,
      reservationCostMicros: input.reservationCostMicros,
      usage: { ...this.#usage },
      outstandingReservationTokens:
        this.#outstandingReservationTokens,
      outstandingReservationCostMicros:
        this.#outstandingReservationCostMicros,
      exhaustedDimension: input.exhaustedDimension,
      sealed: input.sealed,
      occurredAt: this.#clock.now().toISOString(),
      producer: this.#signer.identity,
    };
    const body: PhaseBudgetRecordBody = {
      ...core,
      phaseBudgetRecordId:
        `pbr-sha256:${sha256(core as unknown as JsonValue).slice(7)}`,
    };
    const record: PhaseBudgetRecord = {
      ...body,
      attestation: this.#signer.attest(
        body as unknown as JsonValue,
      ),
    };
    this.#schemas.validate(
      PHASE_BUDGET_RECORD_SCHEMA_ID,
      record as unknown as JsonValue,
    );
    await this.#log.append(record as unknown as JsonValue);
    this.#sequence += 1;
    return record;
  }

  async #readAndVerify(): Promise<PhaseBudgetRecord[]> {
    const records = (await this.#log.readAll()).map(
      (record) => record.payload as unknown as PhaseBudgetRecord,
    );
    for (const [index, record] of records.entries()) {
      verifyPhaseBudgetRecord({
        record,
        expectedProtocolId: this.#protocolId,
        expectedManifest: this.#manifest,
        expectedAccount: this.#account,
        expectedCaps: this.#caps,
        expectedSequence: index,
        schemas: this.#schemas,
        principals: this.#principals,
      });
    }
    assertPhaseBudgetSequenceContract(records, this.#manifest);
    return records;
  }

  #reconstructReservations(
    records: readonly PhaseBudgetRecord[],
  ): Map<
    string,
    { readonly tokens: number; readonly costMicros: number }
  > {
    const reservations = new Map<
      string,
      { readonly tokens: number; readonly costMicros: number }
    >();
    for (const record of records) {
      if (
        record.eventType === "provider_reserved" &&
        record.requestId !== null
      ) {
        assertCondition(
          !reservations.has(record.requestId),
          "HASH_MISMATCH",
          "Duplicate provider reservation in phase ledger",
        );
        reservations.set(record.requestId, {
          tokens: record.reservationTokens,
          costMicros: record.reservationCostMicros,
        });
      } else if (
        record.eventType === "provider_settled" &&
        record.requestId !== null
      ) {
        assertCondition(
          reservations.delete(record.requestId),
          "HASH_MISMATCH",
          "Provider settlement has no reservation",
        );
      }
    }
    return reservations;
  }

  #elapsedMillis(): number {
    const elapsed =
      Number(
        (this.#clock.monotonicNanos() - this.#startedNanos) /
          1_000_000n,
      ) + this.#baseWallClockMillis;
    assertCondition(
      Number.isSafeInteger(elapsed) && elapsed >= 0,
      "INTERNAL_ERROR",
      "Phase wall clock is outside the safe integer domain",
    );
    return elapsed;
  }

  async #withLock<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.#queue.then(operation, operation);
    this.#queue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
}
