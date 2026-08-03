import path from "node:path";

import { sha256, type JsonValue } from "../core/canonical.js";
import type { Clock, IdFactory } from "../core/determinism.js";
import { HarnessError, asHarnessError, assertCondition } from "../core/errors.js";
import { SCHEMA_BASE_URL, type SchemaRegistry } from "../contracts/schema-registry.js";
import type { AgentRunResult, BudgetLimits, SessionPins } from "../domain/runtime.js";
import { AppendOnlyLog } from "../storage/append-only-log.js";
import type { ArtifactStore } from "../storage/artifact-store.js";
import type { BudgetAccount } from "./budget.js";
import type {
  BubblewrapProcessRunner,
  SandboxProcessResult,
} from "./sandbox-process.js";
import type { HarnessReferenceLedger } from "../evolution/reference-ledger.js";
import {
  PrincipalRegistry,
  type Attestation,
  type PrincipalIdentity,
  type PrincipalSigner,
} from "../trust/identity.js";

export const DESCENDANT_RECORD_SCHEMA_ID =
  `${SCHEMA_BASE_URL}descendant-record.schema.json`;

export type DescendantKind = "subagent" | "backend_job";
export type DescendantState =
  | "created"
  | "running"
  | "completed"
  | "failed"
  | "cancelled"
  | "orphan_reaped";

export interface DescendantRecord {
  readonly schemaVersion: 2;
  readonly recordId: string;
  readonly descendantId: string;
  readonly parentSessionId: string;
  readonly kind: DescendantKind;
  readonly state: DescendantState;
  readonly pins: SessionPins;
  readonly budgetSlice: BudgetLimits;
  readonly permissionToolIds: readonly string[];
  readonly taskHash: string;
  readonly createdAt: string;
  readonly artifactHash: string | null;
  readonly failureCode: string | null;
  readonly delegatedBy: PrincipalIdentity;
  readonly attestation: Attestation;
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
  readonly #schemas: SchemaRegistry;
  readonly #recordSigner: PrincipalSigner;
  readonly #principals = new PrincipalRegistry();
  readonly #log: AppendOnlyLog<JsonValue>;
  readonly #references: HarnessReferenceLedger | null;
  readonly #referenceSigner: PrincipalSigner | null;
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
    schemas: SchemaRegistry;
    recordSigner: PrincipalSigner;
    references?: HarnessReferenceLedger;
    referenceSigner?: PrincipalSigner;
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
    this.#schemas = input.schemas;
    this.#recordSigner = input.recordSigner;
    assertCondition(
      input.recordSigner.identity.role === "runtime",
      "AUTHORIZATION_DENIED",
      "Descendant records require a runtime principal",
    );
    this.#principals.register(input.recordSigner.exportPublic());
    assertCondition(
      (input.references === undefined) === (input.referenceSigner === undefined),
      "SCHEMA_INVALID",
      "Descendant reference ledger and signer must be configured together",
    );
    this.#references = input.references ?? null;
    this.#referenceSigner = input.referenceSigner ?? null;
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
    const taskHash = sha256({ task: input.task });
    const controller = new AbortController();
    this.#controllers.set(descendantId, controller);
    await this.#acquireHold(descendantId);
    await this.#append({
      descendantId,
      kind: "subagent",
      state: "created",
      budgetSlice: input.budgetSlice,
      permissionToolIds: input.permissionToolIds,
      taskHash,
      artifactHash: null,
      failureCode: null,
    });
    await this.#append({
      descendantId,
      kind: "subagent",
      state: "running",
      budgetSlice: input.budgetSlice,
      permissionToolIds: input.permissionToolIds,
      taskHash,
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
        const record = await this.#append({
          descendantId,
          kind: "subagent",
          state: result.state === "completed" ? "completed" : "failed",
          budgetSlice: input.budgetSlice,
          permissionToolIds: input.permissionToolIds,
          taskHash,
          artifactHash: artifact.contentHash,
          failureCode: result.state === "completed" ? null : result.terminationReason ?? result.state,
        });
        await this.#releaseHold(descendantId);
        return record;
      })
      .catch(async (error: unknown) => {
        const failure = asHarnessError(error);
        const record = await this.#append({
          descendantId,
          kind: "subagent",
          state: controller.signal.aborted ? "cancelled" : "failed",
          budgetSlice: input.budgetSlice,
          permissionToolIds: input.permissionToolIds,
          taskHash,
          artifactHash: null,
          failureCode: failure.code,
        });
        await this.#releaseHold(descendantId);
        return record;
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
    const taskHash = sha256({ command: input.command });
    const controller = new AbortController();
    this.#controllers.set(descendantId, controller);
    await this.#acquireHold(descendantId);
    await this.#append({
      descendantId,
      kind: "backend_job",
      state: "created",
      budgetSlice: input.budgetSlice,
      permissionToolIds: permissions,
      taskHash,
      artifactHash: null,
      failureCode: null,
    });
    await this.#append({
      descendantId,
      kind: "backend_job",
      state: "running",
      budgetSlice: input.budgetSlice,
      permissionToolIds: permissions,
      taskHash,
      artifactHash: null,
      failureCode: null,
    });
    const execution = this.#runner
      .runShell(input.command, controller.signal)
      .then(async (result: SandboxProcessResult) => {
        const artifact = await this.#artifacts.putJson(result as unknown as JsonValue);
        const record = await this.#append({
          descendantId,
          kind: "backend_job",
          state: result.exitCode === 0 && !result.timedOut ? "completed" : "failed",
          budgetSlice: input.budgetSlice,
          permissionToolIds: permissions,
          taskHash,
          artifactHash: artifact.contentHash,
          failureCode:
            result.exitCode === 0 && !result.timedOut
              ? null
              : result.timedOut
                ? "DEADLINE_EXCEEDED"
                : `EXIT_${result.exitCode ?? "SIGNAL"}`,
        });
        await this.#releaseHold(descendantId);
        return record;
      })
      .catch(async (error: unknown) => {
        const failure = asHarnessError(error);
        const record = await this.#append({
          descendantId,
          kind: "backend_job",
          state: controller.signal.aborted ? "cancelled" : "failed",
          budgetSlice: input.budgetSlice,
          permissionToolIds: permissions,
          taskHash,
          artifactHash: null,
          failureCode: failure.code,
        });
        await this.#releaseHold(descendantId);
        return record;
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
          taskHash: record.taskHash,
          artifactHash: null,
          failureCode: "PEER_CRASHED",
        });
        reaped.push({
          descendantId: terminal.descendantId,
          kind: terminal.kind,
          state: terminal.state,
        });
        await this.#releaseHold(record.descendantId);
      }
    }
    return reaped;
  }

  public async records(descendantId?: string): Promise<DescendantRecord[]> {
    const records = (await this.#log.readAll()).map((record) => asRecord(record.payload));
    const latest = new Map<string, DescendantRecord>();
    const recordIds = new Set<string>();
    for (const record of records) {
      this.#schemas.validate(
        DESCENDANT_RECORD_SCHEMA_ID,
        record as unknown as JsonValue,
      );
      assertCondition(!recordIds.has(record.recordId), "CONFLICT", "Duplicate descendant record ID");
      recordIds.add(record.recordId);
      assertCondition(
        record.parentSessionId === this.#parentSessionId &&
          sha256(record.pins as unknown as JsonValue) ===
            sha256(this.#pins as unknown as JsonValue),
        "PROTOCOL_MISMATCH",
        "Descendant record changed its parent or inherited pins",
      );
      const { attestation: _attestation, ...signedBody } = record;
      this.#principals.verify(
        record.delegatedBy,
        signedBody as unknown as JsonValue,
        record.attestation,
      );
      const previous = latest.get(record.descendantId);
      if (previous === undefined) {
        assertCondition(record.state === "created", "INVALID_STATE_TRANSITION", "Descendant must start in created");
      } else {
        assertCondition(
          previous.kind === record.kind &&
            previous.taskHash === record.taskHash &&
            sha256(previous.budgetSlice as unknown as JsonValue) ===
              sha256(record.budgetSlice as unknown as JsonValue) &&
            sha256(previous.permissionToolIds as unknown as JsonValue) ===
              sha256(record.permissionToolIds as unknown as JsonValue),
          "PROTOCOL_MISMATCH",
          "Descendant delegation changed after creation",
        );
        const allowed =
          previous.state === "created"
            ? ["running", "failed", "cancelled", "orphan_reaped"]
            : previous.state === "running"
              ? ["completed", "failed", "cancelled", "orphan_reaped"]
              : [];
        assertCondition(
          allowed.includes(record.state),
          "INVALID_STATE_TRANSITION",
          `Descendant cannot transition ${previous.state} → ${record.state}`,
        );
      }
      latest.set(record.descendantId, record);
    }
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
    taskHash: string;
    artifactHash: string | null;
    failureCode: string | null;
  }): Promise<DescendantRecord> {
    const signedBody = {
      schemaVersion: 2 as const,
      recordId: this.#ids.next("descendant-record"),
      descendantId: input.descendantId,
      parentSessionId: this.#parentSessionId,
      kind: input.kind,
      state: input.state,
      pins: this.#pins,
      budgetSlice: input.budgetSlice,
      permissionToolIds: [...input.permissionToolIds].sort(),
      taskHash: input.taskHash,
      createdAt: this.#clock.now().toISOString(),
      artifactHash: input.artifactHash,
      failureCode: input.failureCode,
      delegatedBy: this.#recordSigner.identity,
    };
    const record: DescendantRecord = {
      ...signedBody,
      attestation: this.#recordSigner.attest(signedBody as unknown as JsonValue),
    };
    this.#schemas.validate(
      DESCENDANT_RECORD_SCHEMA_ID,
      record as unknown as JsonValue,
    );
    await this.#log.append(record as unknown as JsonValue);
    return record;
  }

  async #acquireHold(descendantId: string): Promise<void> {
    if (this.#references === null || this.#referenceSigner === null) return;
    await this.#references.acquire({
      holdId: `hold.descendant.${descendantId}`,
      harnessVersionId: this.#pins.harnessVersionId,
      holdKind: "live_descendant",
      subjectId: descendantId,
      signer: this.#referenceSigner,
    });
  }

  async #releaseHold(descendantId: string): Promise<void> {
    if (this.#references === null || this.#referenceSigner === null) return;
    const holdId = `hold.descendant.${descendantId}`;
    const active = (await this.#references.activeHolds()).some(
      (hold) => hold.holdId === holdId,
    );
    if (!active) return;
    await this.#references.release({
      holdId,
      harnessVersionId: this.#pins.harnessVersionId,
      holdKind: "live_descendant",
      subjectId: descendantId,
      signer: this.#referenceSigner,
    });
  }
}
