import path from "node:path";

import { type JsonValue } from "../core/canonical.js";
import type { Clock, IdFactory } from "../core/determinism.js";
import { HarnessError, asHarnessError, assertCondition } from "../core/errors.js";
import type { AgentRunResult, BudgetLimits, SessionPins } from "../domain/runtime.js";
import { AppendOnlyLog } from "../storage/append-only-log.js";
import type { ArtifactStore } from "../storage/artifact-store.js";
import type { BudgetAccount } from "./budget.js";
import type {
  BubblewrapProcessRunner,
  SandboxProcessResult,
} from "./sandbox-process.js";

export type DescendantKind = "subagent" | "backend_job";
export type DescendantState =
  | "created"
  | "running"
  | "completed"
  | "failed"
  | "cancelled"
  | "orphan_reaped";

interface DescendantRecord {
  readonly schemaVersion: 1;
  readonly recordId: string;
  readonly descendantId: string;
  readonly parentSessionId: string;
  readonly kind: DescendantKind;
  readonly state: DescendantState;
  readonly pins: SessionPins;
  readonly budgetSlice: BudgetLimits;
  readonly permissionToolIds: readonly string[];
  readonly createdAt: string;
  readonly artifactHash: string | null;
  readonly failureCode: string | null;
}

export interface DescendantHandle {
  readonly descendantId: string;
  readonly kind: DescendantKind;
  readonly state: DescendantState;
}

type SubagentExecutor = (
  input: {
    descendantId: string;
    task: string;
    pins: SessionPins;
    budgetSlice: BudgetLimits;
    permissionToolIds: readonly string[];
  },
  abortSignal: AbortSignal,
) => Promise<AgentRunResult>;

function asRecord(value: JsonValue): DescendantRecord {
  return value as unknown as DescendantRecord;
}

function assertBudgetSlice(parent: BudgetLimits, child: BudgetLimits): void {
  for (const key of Object.keys(parent) as (keyof BudgetLimits)[]) {
    assertCondition(
      child[key] >= 0 && child[key] <= parent[key],
      "AUTHORIZATION_DENIED",
      `Descendant budget ${key} exceeds its parent`,
    );
  }
}

export class DescendantManager {
  readonly #parentSessionId: string;
  readonly #pins: SessionPins;
  readonly #parentLimits: BudgetLimits;
  readonly #permissionCeiling: readonly string[];
  readonly #parentBudget: BudgetAccount;
  readonly #runner: BubblewrapProcessRunner;
  readonly #artifacts: ArtifactStore;
  readonly #clock: Clock;
  readonly #ids: IdFactory;
  readonly #log: AppendOnlyLog<JsonValue>;
  readonly #controllers = new Map<string, AbortController>();
  readonly #live = new Map<string, Promise<DescendantRecord>>();

  public constructor(input: {
    root: string;
    parentSessionId: string;
    pins: SessionPins;
    parentLimits: BudgetLimits;
    permissionCeiling: readonly string[];
    parentBudget: BudgetAccount;
    runner: BubblewrapProcessRunner;
    artifacts: ArtifactStore;
    clock: Clock;
    ids: IdFactory;
  }) {
    this.#parentSessionId = input.parentSessionId;
    this.#pins = input.pins;
    this.#parentLimits = input.parentLimits;
    this.#permissionCeiling = [...input.permissionCeiling].sort();
    this.#parentBudget = input.parentBudget;
    this.#runner = input.runner;
    this.#artifacts = input.artifacts;
    this.#clock = input.clock;
    this.#ids = input.ids;
    this.#log = new AppendOnlyLog<JsonValue>(
      path.join(input.root, "descendants"),
      `descendants.${input.parentSessionId}`,
    );
  }

  public async spawnSubagent(input: {
    task: string;
    budgetSlice: BudgetLimits;
    permissionToolIds: readonly string[];
    executor: SubagentExecutor;
  }): Promise<DescendantHandle> {
    this.#assertDelegation(input.budgetSlice, input.permissionToolIds);
    this.#parentBudget.reserveDescendant();
    const descendantId = this.#ids.next("subagent");
    const controller = new AbortController();
    this.#controllers.set(descendantId, controller);
    await this.#append({
      descendantId,
      kind: "subagent",
      state: "created",
      budgetSlice: input.budgetSlice,
      permissionToolIds: input.permissionToolIds,
      artifactHash: null,
      failureCode: null,
    });
    await this.#append({
      descendantId,
      kind: "subagent",
      state: "running",
      budgetSlice: input.budgetSlice,
      permissionToolIds: input.permissionToolIds,
      artifactHash: null,
      failureCode: null,
    });
    const execution = input
      .executor(
        {
          descendantId,
          task: input.task,
          pins: this.#pins,
          budgetSlice: input.budgetSlice,
          permissionToolIds: [...input.permissionToolIds],
        },
        controller.signal,
      )
      .then(async (result) => {
        const artifact = await this.#artifacts.putJson(result as unknown as JsonValue);
        return this.#append({
          descendantId,
          kind: "subagent",
          state: result.state === "completed" ? "completed" : "failed",
          budgetSlice: input.budgetSlice,
          permissionToolIds: input.permissionToolIds,
          artifactHash: artifact.contentHash,
          failureCode: result.state === "completed" ? null : result.terminationReason ?? result.state,
        });
      })
      .catch(async (error: unknown) => {
        const failure = asHarnessError(error);
        return this.#append({
          descendantId,
          kind: "subagent",
          state: controller.signal.aborted ? "cancelled" : "failed",
          budgetSlice: input.budgetSlice,
          permissionToolIds: input.permissionToolIds,
          artifactHash: null,
          failureCode: failure.code,
        });
      })
      .finally(() => {
        this.#controllers.delete(descendantId);
        this.#live.delete(descendantId);
      });
    this.#live.set(descendantId, execution);
    return { descendantId, kind: "subagent", state: "running" };
  }

  public async startBackendJob(input: {
    command: string;
    budgetSlice: BudgetLimits;
    permissionToolIds?: readonly string[];
  }): Promise<DescendantHandle> {
    const permissions = input.permissionToolIds ?? ["shell.bash"];
    this.#assertDelegation(input.budgetSlice, permissions);
    assertCondition(
      permissions.includes("shell.bash"),
      "AUTHORIZATION_DENIED",
      "Backend shell job needs shell.bash permission",
    );
    this.#parentBudget.reserveDescendant();
    const descendantId = this.#ids.next("backend-job");
    const controller = new AbortController();
    this.#controllers.set(descendantId, controller);
    await this.#append({
      descendantId,
      kind: "backend_job",
      state: "created",
      budgetSlice: input.budgetSlice,
      permissionToolIds: permissions,
      artifactHash: null,
      failureCode: null,
    });
    await this.#append({
      descendantId,
      kind: "backend_job",
      state: "running",
      budgetSlice: input.budgetSlice,
      permissionToolIds: permissions,
      artifactHash: null,
      failureCode: null,
    });
    const execution = this.#runner
      .runShell(input.command, controller.signal)
      .then(async (result: SandboxProcessResult) => {
        const artifact = await this.#artifacts.putJson(result as unknown as JsonValue);
        return this.#append({
          descendantId,
          kind: "backend_job",
          state: result.exitCode === 0 && !result.timedOut ? "completed" : "failed",
          budgetSlice: input.budgetSlice,
          permissionToolIds: permissions,
          artifactHash: artifact.contentHash,
          failureCode:
            result.exitCode === 0 && !result.timedOut
              ? null
              : result.timedOut
                ? "DEADLINE_EXCEEDED"
                : `EXIT_${result.exitCode ?? "SIGNAL"}`,
        });
      })
      .catch(async (error: unknown) => {
        const failure = asHarnessError(error);
        return this.#append({
          descendantId,
          kind: "backend_job",
          state: controller.signal.aborted ? "cancelled" : "failed",
          budgetSlice: input.budgetSlice,
          permissionToolIds: permissions,
          artifactHash: null,
          failureCode: failure.code,
        });
      })
      .finally(() => {
        this.#controllers.delete(descendantId);
        this.#live.delete(descendantId);
      });
    this.#live.set(descendantId, execution);
    return { descendantId, kind: "backend_job", state: "running" };
  }

  public async wait(descendantId: string): Promise<DescendantHandle> {
    const live = this.#live.get(descendantId);
    if (live !== undefined) {
      const record = await live;
      return { descendantId, kind: record.kind, state: record.state };
    }
    const latest = (await this.records(descendantId)).at(-1);
    if (latest === undefined) {
      throw new HarnessError("ARTIFACT_UNAVAILABLE", `Unknown descendant ${descendantId}`);
    }
    return { descendantId, kind: latest.kind, state: latest.state };
  }

  public async cancel(descendantId: string): Promise<DescendantHandle> {
    const controller = this.#controllers.get(descendantId);
    if (controller !== undefined) controller.abort();
    return this.wait(descendantId);
  }

  public async terminateAll(): Promise<void> {
    for (const controller of this.#controllers.values()) controller.abort();
    await Promise.allSettled([...this.#live.values()]);
  }

  public async recoverOrphans(): Promise<DescendantHandle[]> {
    const byId = new Map<string, DescendantRecord>();
    for (const record of await this.records()) byId.set(record.descendantId, record);
    const reaped: DescendantHandle[] = [];
    for (const record of byId.values()) {
      if (
        (record.state === "created" || record.state === "running") &&
        !this.#live.has(record.descendantId)
      ) {
        const terminal = await this.#append({
          descendantId: record.descendantId,
          kind: record.kind,
          state: "orphan_reaped",
          budgetSlice: record.budgetSlice,
          permissionToolIds: record.permissionToolIds,
          artifactHash: null,
          failureCode: "PEER_CRASHED",
        });
        reaped.push({
          descendantId: terminal.descendantId,
          kind: terminal.kind,
          state: terminal.state,
        });
      }
    }
    return reaped;
  }

  public async records(descendantId?: string): Promise<DescendantRecord[]> {
    const records = (await this.#log.readAll()).map((record) => asRecord(record.payload));
    return descendantId === undefined
      ? records
      : records.filter((record) => record.descendantId === descendantId);
  }

  #assertDelegation(budgetSlice: BudgetLimits, permissionToolIds: readonly string[]): void {
    assertBudgetSlice(this.#parentLimits, budgetSlice);
    assertCondition(
      permissionToolIds.every((toolId) => this.#permissionCeiling.includes(toolId)),
      "AUTHORIZATION_DENIED",
      "Descendant requested a tool outside its parent permission ceiling",
    );
  }

  async #append(input: {
    descendantId: string;
    kind: DescendantKind;
    state: DescendantState;
    budgetSlice: BudgetLimits;
    permissionToolIds: readonly string[];
    artifactHash: string | null;
    failureCode: string | null;
  }): Promise<DescendantRecord> {
    const record: DescendantRecord = {
      schemaVersion: 1,
      recordId: this.#ids.next("descendant-record"),
      descendantId: input.descendantId,
      parentSessionId: this.#parentSessionId,
      kind: input.kind,
      state: input.state,
      pins: this.#pins,
      budgetSlice: input.budgetSlice,
      permissionToolIds: [...input.permissionToolIds].sort(),
      createdAt: this.#clock.now().toISOString(),
      artifactHash: input.artifactHash,
      failureCode: input.failureCode,
    };
    await this.#log.append(record as unknown as JsonValue);
    return record;
  }
}
