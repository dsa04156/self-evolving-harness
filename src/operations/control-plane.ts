import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";

import { type JsonValue } from "../core/canonical.js";
import type { Clock, IdFactory } from "../core/determinism.js";
import { HarnessError, assertCondition } from "../core/errors.js";
import { SCHEMA_BASE_URL, type SchemaRegistry } from "../contracts/schema-registry.js";
import type {
  AgentRunResult,
  SessionPins,
  SessionState,
  TerminationReason,
} from "../domain/runtime.js";
import type { EvidenceReceipt, EvidenceReceiptStore } from "../evidence/receipts.js";
import { AppendOnlyLog } from "../storage/append-only-log.js";
import type { ArtifactStore } from "../storage/artifact-store.js";
import {
  PrincipalRegistry,
  type PrincipalSigner,
} from "../trust/identity.js";
import type { HarnessReferenceLedger } from "../evolution/reference-ledger.js";
import type { SessionLifecycleStore } from "./session-lifecycle.js";
import {
  asSignedSessionDefinition,
  createSignedSessionDefinition,
  verifySignedSessionDefinition,
  type SignedSessionDefinition,
} from "./session-definition.js";

export const OPERATION_RESPONSE_SCHEMA_ID = `${SCHEMA_BASE_URL}operation-response.schema.json`;

export type Operation =
  | "start"
  | "submit"
  | "observe"
  | "interrupt"
  | "terminate"
  | "resume"
  | "recover"
  | "validate"
  | "finalize"
  | "retire"
  | "events"
  | "artifacts";

export type NextAction = Exclude<Operation, "start">;

export interface OperationResponse {
  readonly schemaVersion: 1;
  readonly operation: Operation;
  readonly subjectId: string;
  readonly state: SessionState;
  readonly evidence: readonly {
    readonly receiptId: string;
    readonly receiptHash: string;
  }[];
  readonly nextAllowedActions: readonly NextAction[];
  readonly data?: JsonValue;
}

type SessionExecutor = (task: string, abortSignal: AbortSignal) => Promise<AgentRunResult>;

export type TerminationCrashStage = "initiated" | "final_receipt" | "completed";

export class SimulatedTerminationCrash extends Error {
  public readonly stage: TerminationCrashStage;

  public constructor(stage: TerminationCrashStage) {
    super(`Simulated process crash after durable termination stage ${stage}`);
    this.name = "SimulatedTerminationCrash";
    this.stage = stage;
  }
}

const NEXT_ACTIONS: Readonly<Record<SessionState, readonly NextAction[]>> = Object.freeze({
  created: ["observe", "terminate", "validate", "events", "artifacts"],
  initialized: ["submit", "observe", "terminate", "validate", "events", "artifacts"],
  running: ["observe", "interrupt", "terminate", "validate", "events", "artifacts"],
  waiting: ["observe", "interrupt", "terminate", "resume", "validate", "events", "artifacts"],
  blocked: ["observe", "terminate", "recover", "validate", "events", "artifacts"],
  recovering: ["observe", "interrupt", "terminate", "validate", "events", "artifacts"],
  validating: ["observe", "interrupt", "terminate", "validate", "events", "artifacts"],
  completed: ["observe", "terminate", "validate", "finalize", "retire", "events", "artifacts"],
  retired: ["observe", "validate", "events", "artifacts"],
  terminating: ["observe", "validate", "events", "artifacts"],
  terminated: ["observe", "validate", "events", "artifacts"],
});

export class OperationsControlPlane {
  readonly #protocolId: string;
  readonly #schemas: SchemaRegistry;
  readonly #lifecycle: SessionLifecycleStore;
  readonly #receipts: EvidenceReceiptStore;
  readonly #artifacts: ArtifactStore;
  readonly #signer: PrincipalSigner;
  readonly #principals = new PrincipalRegistry();
  readonly #clock: Clock;
  readonly #references: HarnessReferenceLedger | null;
  readonly #crashAfterTerminationStage: TerminationCrashStage | null;
  readonly #definitions: AppendOnlyLog<JsonValue>;
  readonly #sessions = new Map<string, SignedSessionDefinition>();
  readonly #abortControllers = new Map<string, AbortController>();
  readonly #activeExecutions = new Map<string, Promise<AgentRunResult>>();
  readonly #terminationRequests = new Set<string>();
  readonly #stateQueues = new Map<string, Promise<void>>();

  public constructor(input: {
    root: string;
    protocolId: string;
    schemas: SchemaRegistry;
    lifecycle: SessionLifecycleStore;
    receipts: EvidenceReceiptStore;
    artifacts: ArtifactStore;
    signer: PrincipalSigner;
    clock: Clock;
    ids: IdFactory;
    references?: HarnessReferenceLedger;
    crashAfterTerminationStage?: TerminationCrashStage;
  }) {
    assertCondition(
      input.signer.identity.role === "operations_owner",
      "AUTHORIZATION_DENIED",
      "Operations control plane requires operations-owner identity",
    );
    this.#protocolId = input.protocolId;
    this.#schemas = input.schemas;
    this.#lifecycle = input.lifecycle;
    this.#receipts = input.receipts;
    this.#artifacts = input.artifacts;
    this.#signer = input.signer;
    this.#principals.register(input.signer.exportPublic());
    this.#clock = input.clock;
    this.#references = input.references ?? null;
    this.#crashAfterTerminationStage =
      input.crashAfterTerminationStage ?? null;
    this.#definitions = new AppendOnlyLog<JsonValue>(
      path.join(input.root, "operations"),
      "sessions.definitions",
    );
  }

  public async initialize(): Promise<void> {
    for (const record of await this.#definitions.readAll()) {
      const definition = asSignedSessionDefinition(record.payload);
      verifySignedSessionDefinition({
        definition,
        expectedProtocolId: this.#protocolId,
        schemas: this.#schemas,
        principals: this.#principals,
      });
      assertCondition(
        !this.#sessions.has(definition.sessionId),
        "PROTOCOL_MISMATCH",
        "Invalid persisted session definition",
      );
      this.#sessions.set(definition.sessionId, definition);
    }
    await this.#lifecycle.verifyAll();
    for (const definition of this.#sessions.values()) {
      let state = await this.#lifecycle.state(definition.sessionId);
      await this.#reconcileSessionHold(
        definition,
        state,
      );
      if (
        state === "running" ||
        state === "waiting" ||
        state === "recovering" ||
        state === "validating"
      ) {
        await this.#beginTermination(definition.sessionId, "process_crash");
        state = "terminating";
      }
      if (state === "terminating") {
        await this.#completeTermination(definition.sessionId);
      }
    }
  }

  public async start(sessionId: string, pins: SessionPins): Promise<OperationResponse> {
    return this.#withStateLock(sessionId, async () => {
      assertCondition(!this.#sessions.has(sessionId), "CONFLICT", "Session already exists");
      assertCondition(
        pins.protocolId === this.#protocolId,
        "PROTOCOL_MISMATCH",
        "Session protocol differs from control plane",
      );
      const definition = createSignedSessionDefinition({
        sessionId,
        pins,
        createdAt: this.#clock.now().toISOString(),
        signer: this.#signer,
        schemas: this.#schemas,
      });
      await this.#acquireSessionHold(definition);
      await this.#definitions.append(definition as unknown as JsonValue);
      this.#sessions.set(sessionId, definition);
      const createdReceipt = await this.#controlReceipt(
        "session_initialization",
        definition,
      );
      await this.#lifecycle.create({
        sessionId,
        pins,
        evidenceReceiptIds: [createdReceipt.receiptId],
        signer: this.#signer,
      });
      const initializedReceipt = await this.#controlReceipt(
        "session_initialization",
        definition,
      );
      await this.#lifecycle.transition({
        sessionId,
        toState: "initialized",
        evidenceReceiptIds: [initializedReceipt.receiptId],
        signer: this.#signer,
      });
      return this.#response("start", sessionId, [
        createdReceipt,
        initializedReceipt,
      ]);
    });
  }

  public async submit(
    sessionId: string,
    task: string,
    executor: SessionExecutor,
  ): Promise<OperationResponse> {
    const prepared = await this.#withStateLock(sessionId, async () => {
      const definition = this.#definition(sessionId);
      assertCondition(
        (await this.#lifecycle.state(sessionId)) === "initialized",
        "INVALID_STATE_TRANSITION",
        "Only initialized sessions accept submit",
      );
      const taskArtifact = await this.#artifacts.put(
        Buffer.from(task, "utf8"),
        "text/plain; charset=utf-8",
      );
      const runningReceipt = await this.#receipts.create({
        receiptType: "session_checkpoint",
        subjectIds: [sessionId],
        harnessVersionIds: [definition.pins.harnessVersionId],
        runtimeStateSnapshotIds: [definition.pins.runtimeStateSnapshotId],
        artifactRefs: [taskArtifact],
        signer: this.#signer,
      });
      await this.#lifecycle.transition({
        sessionId,
        toState: "running",
        evidenceReceiptIds: [runningReceipt.receiptId],
        signer: this.#signer,
      });
      const controller = new AbortController();
      this.#abortControllers.set(sessionId, controller);
      return { definition, runningReceipt, controller };
    });
    const { definition, runningReceipt, controller } = prepared;
    const execution = executor(task, controller.signal);
    this.#activeExecutions.set(sessionId, execution);
    let result: AgentRunResult;
    try {
      result = await execution;
    } catch (error) {
      if (!this.#terminationRequests.has(sessionId)) {
        await this.#withStateLock(sessionId, () =>
          this.#terminate(
            sessionId,
            "process_crash",
          ),
        );
      }
      throw error;
    } finally {
      this.#abortControllers.delete(sessionId);
      this.#activeExecutions.delete(sessionId);
    }
    const resultReceipt = await this.#receipts.create({
      receiptType:
        result.state === "completed" ? "session_completion" : "session_checkpoint",
      subjectIds: [sessionId],
      harnessVersionIds: [definition.pins.harnessVersionId],
      runtimeStateSnapshotIds: [definition.pins.runtimeStateSnapshotId],
      eventRanges:
        result.eventCount === 0
          ? []
          : [
              {
                sessionId,
                firstSequence: 0,
                lastSequence: result.eventCount - 1,
                headHash: result.eventHeadHash,
              },
            ],
      signer: this.#signer,
    });
    const submissionResponse = await this.#withStateLock(sessionId, async () => {
      const current = await this.#lifecycle.state(sessionId);
      if (current === "terminating") return null;
      if (current === "terminated") {
        return this.#response("submit", sessionId, [
          runningReceipt,
          resultReceipt,
        ]);
      }
      assertCondition(
        current === "running",
        "INVALID_STATE_TRANSITION",
        `Late execution result cannot apply from ${current}`,
      );
      if (result.state === "completed") {
        await this.#lifecycle.transition({
          sessionId,
          toState: "validating",
          evidenceReceiptIds: [resultReceipt.receiptId],
          signer: this.#signer,
        });
        await this.#lifecycle.transition({
          sessionId,
          toState: "completed",
          evidenceReceiptIds: [resultReceipt.receiptId],
          signer: this.#signer,
        });
      } else if (result.state === "blocked") {
        await this.#lifecycle.transition({
          sessionId,
          toState: "blocked",
          evidenceReceiptIds: [resultReceipt.receiptId],
          signer: this.#signer,
        });
      } else {
        await this.#terminate(
          sessionId,
          result.terminationReason ?? "process_crash",
        );
      }
      return this.#response("submit", sessionId, [
        runningReceipt,
        resultReceipt,
      ]);
    });
    if (submissionResponse !== null) return submissionResponse;
    await this.#waitForTerminated(sessionId);
    return this.#response("submit", sessionId, [runningReceipt, resultReceipt]);
  }

  public async observe(sessionId: string): Promise<OperationResponse> {
    this.#definition(sessionId);
    return this.#response("observe", sessionId, []);
  }

  public async resume(sessionId: string): Promise<OperationResponse> {
    return this.#withStateLock(sessionId, async () => {
      const definition = this.#definition(sessionId);
      assertCondition(
        (await this.#lifecycle.state(sessionId)) === "waiting",
        "INVALID_STATE_TRANSITION",
        "Only waiting sessions can resume",
      );
      const receipt = await this.#controlReceipt("session_checkpoint", definition);
      await this.#lifecycle.transition({
        sessionId,
        toState: "running",
        evidenceReceiptIds: [receipt.receiptId],
        signer: this.#signer,
      });
      return this.#response("resume", sessionId, [receipt]);
    });
  }

  public async validate(sessionId: string): Promise<OperationResponse> {
    const definition = this.#definition(sessionId);
    await this.#receipts.verifyAll();
    await this.#lifecycle.verifyAll();
    const receipt = await this.#controlReceipt("audit_replay", definition);
    await this.#receipts.verify(receipt);
    return this.#response("validate", sessionId, [receipt], {
      receiptChainValid: true,
      lifecycleChainValid: true,
    });
  }

  public async interrupt(sessionId: string): Promise<OperationResponse> {
    this.#definition(sessionId);
    const controller = this.#abortControllers.get(sessionId);
    assertCondition(controller !== undefined, "INVALID_STATE_TRANSITION", "Session is not executing");
    this.#terminationRequests.add(sessionId);
    controller.abort();
    const initiating = await this.#withStateLock(sessionId, () =>
      this.#beginTermination(
        sessionId,
        "user_cancellation",
      ),
    );
    const active = this.#activeExecutions.get(sessionId);
    if (active !== undefined) await Promise.allSettled([active]);
    return this.#withStateLock(sessionId, async () => {
      const final = await this.#completeTermination(sessionId);
      this.#terminationRequests.delete(sessionId);
      return this.#response("interrupt", sessionId, [...initiating, ...final]);
    });
  }

  public async terminate(
    sessionId: string,
    reason: TerminationReason = "host_enforced_shutdown",
  ): Promise<OperationResponse> {
    this.#definition(sessionId);
    this.#terminationRequests.add(sessionId);
    this.#abortControllers.get(sessionId)?.abort();
    const initiating = await this.#withStateLock(sessionId, () =>
      this.#beginTermination(
        sessionId,
        reason,
      ),
    );
    const active = this.#activeExecutions.get(sessionId);
    if (active !== undefined) await Promise.allSettled([active]);
    return this.#withStateLock(sessionId, async () => {
      const final = await this.#completeTermination(sessionId);
      this.#terminationRequests.delete(sessionId);
      return this.#response("terminate", sessionId, [...initiating, ...final]);
    });
  }

  public async recover(sessionId: string): Promise<OperationResponse> {
    return this.#withStateLock(sessionId, async () => {
      const definition = this.#definition(sessionId);
      assertCondition(
        (await this.#lifecycle.state(sessionId)) === "blocked",
        "INVALID_STATE_TRANSITION",
        "Only blocked sessions can recover",
      );
      const recovering = await this.#controlReceipt("session_checkpoint", definition);
      await this.#lifecycle.transition({
        sessionId,
        toState: "recovering",
        evidenceReceiptIds: [recovering.receiptId],
        signer: this.#signer,
      });
      const initialized = await this.#controlReceipt("session_checkpoint", definition);
      await this.#lifecycle.transition({
        sessionId,
        toState: "initialized",
        evidenceReceiptIds: [initialized.receiptId],
        signer: this.#signer,
      });
      return this.#response("recover", sessionId, [recovering, initialized]);
    });
  }

  public async finalize(sessionId: string): Promise<OperationResponse> {
    return this.#retireCompleted("finalize", sessionId);
  }

  public async retire(sessionId: string): Promise<OperationResponse> {
    return this.#retireCompleted("retire", sessionId);
  }

  public async events(sessionId: string): Promise<OperationResponse> {
    this.#definition(sessionId);
    const records = await this.#lifecycle.records(sessionId);
    const receiptIds = [...new Set(records.flatMap((record) => record.evidenceReceiptIds))];
    const receipts = await Promise.all(
      receiptIds.map((receiptId) => this.#receipts.get(receiptId)),
    );
    for (const receipt of receipts) await this.#receipts.verify(receipt);
    return this.#response("events", sessionId, receipts, {
      lifecycleRecordIds: records.map((record) => record.recordId),
      eventRanges: receipts.flatMap((receipt) => receipt.eventRanges),
      recordedObservationEventIds: receipts.flatMap(
        (receipt) => receipt.recordedObservationEventIds,
      ),
      verifierOutcomeEventIds: receipts.flatMap(
        (receipt) => receipt.verifierOutcomeEventIds,
      ),
      inferenceEventIds: receipts.flatMap((receipt) => receipt.inferenceEventIds),
    });
  }

  public async artifacts(sessionId: string): Promise<OperationResponse> {
    this.#definition(sessionId);
    const records = await this.#lifecycle.records(sessionId);
    const receiptIds = [...new Set(records.flatMap((record) => record.evidenceReceiptIds))];
    const receipts = await Promise.all(
      receiptIds.map((receiptId) => this.#receipts.get(receiptId)),
    );
    for (const receipt of receipts) await this.#receipts.verify(receipt);
    return this.#response("artifacts", sessionId, receipts, {
      artifacts: receipts.flatMap((receipt) =>
        receipt.artifactRefs.map((artifact) => ({
          contentHash: artifact.contentHash,
          mediaType: artifact.mediaType,
          sizeBytes: artifact.sizeBytes,
          ...(artifact.redacted === undefined
            ? {}
            : { redacted: artifact.redacted }),
        })),
      ),
    });
  }

  async #retireCompleted(
    operation: "finalize" | "retire",
    sessionId: string,
  ): Promise<OperationResponse> {
    return this.#withStateLock(sessionId, async () => {
      const definition = this.#definition(sessionId);
      assertCondition(
        (await this.#lifecycle.state(sessionId)) === "completed",
        "INVALID_STATE_TRANSITION",
        "Only completed sessions can finalize",
      );
      const receipt = await this.#controlReceipt("artifact_retention", definition);
      await this.#lifecycle.transition({
        sessionId,
        toState: "retired",
        evidenceReceiptIds: [receipt.receiptId],
        signer: this.#signer,
      });
      await this.#releaseSessionHold(definition);
      return this.#response(operation, sessionId, [receipt]);
    });
  }

  async #terminate(
    sessionId: string,
    reason: TerminationReason,
  ): Promise<EvidenceReceipt[]> {
    const initiating = await this.#beginTermination(sessionId, reason);
    const final = await this.#completeTermination(sessionId);
    return [...initiating, ...final];
  }

  async #beginTermination(
    sessionId: string,
    reason: TerminationReason,
  ): Promise<EvidenceReceipt[]> {
    const definition = this.#definition(sessionId);
    const state = await this.#lifecycle.state(sessionId);
    if (state === "terminated") return [];
    assertCondition(state !== "retired", "INVALID_STATE_TRANSITION", "Retired session is terminal");
    if (state === "terminating") return [];
    const initiating = await this.#controlReceipt("session_checkpoint", definition);
    await this.#lifecycle.beginTermination({
      sessionId,
      reason,
      evidenceReceiptIds: [initiating.receiptId],
      signer: this.#signer,
    });
    this.#maybeCrashTermination("initiated");
    return [initiating];
  }

  async #completeTermination(sessionId: string): Promise<EvidenceReceipt[]> {
    const definition = this.#definition(sessionId);
    const state = await this.#lifecycle.state(sessionId);
    if (state === "terminated") return [];
    assertCondition(
      state === "terminating",
      "INVALID_STATE_TRANSITION",
      "Termination completion requires a durable initiating transition",
    );
    const initiating = (await this.#lifecycle.records(sessionId)).at(-1)!;
    assertCondition(
      initiating.terminationTransaction !== null,
      "HASH_MISMATCH",
      "Terminating state has no transaction descriptor",
    );
    const final = await this.#controlReceipt("session_completion", definition, {
      receiptId:
        `${initiating.terminationTransaction.terminationTransactionId}.final-receipt`,
      createdAt: initiating.transitionedAt,
    });
    this.#maybeCrashTermination("final_receipt");
    await this.#lifecycle.completeTermination({
      sessionId,
      finalEvidenceReceiptId: final.receiptId,
      signer: this.#signer,
    });
    this.#maybeCrashTermination("completed");
    await this.#releaseSessionHold(definition);
    return [final];
  }

  async #controlReceipt(
    receiptType: "session_initialization" | "session_checkpoint" | "session_completion" | "artifact_retention" | "audit_replay",
    definition: SignedSessionDefinition,
    identity: { readonly receiptId: string; readonly createdAt: string } | null = null,
  ): Promise<EvidenceReceipt> {
    return this.#receipts.create({
      ...(identity === null ? {} : identity),
      receiptType,
      subjectIds: [
        definition.sessionId,
        definition.sessionDefinitionHash,
      ],
      harnessVersionIds: [definition.pins.harnessVersionId],
      runtimeStateSnapshotIds: [definition.pins.runtimeStateSnapshotId],
      signer: this.#signer,
    });
  }

  #definition(sessionId: string): SignedSessionDefinition {
    const definition = this.#sessions.get(sessionId);
    if (definition === undefined) {
      throw new HarnessError("ARTIFACT_UNAVAILABLE", `Unknown session ${sessionId}`);
    }
    return definition;
  }

  async #withStateLock<T>(
    sessionId: string,
    operation: () => Promise<T>,
  ): Promise<T> {
    const prior = this.#stateQueues.get(sessionId) ?? Promise.resolve();
    const result = prior.then(operation, operation);
    const tail = result.then(
      () => undefined,
      () => undefined,
    );
    this.#stateQueues.set(sessionId, tail);
    try {
      return await result;
    } finally {
      if (this.#stateQueues.get(sessionId) === tail) {
        this.#stateQueues.delete(sessionId);
      }
    }
  }

  async #waitForTerminated(sessionId: string): Promise<void> {
    const deadline = Date.now() + 5_000;
    while (Date.now() <= deadline) {
      if ((await this.#lifecycle.state(sessionId)) === "terminated") return;
      await delay(5);
    }
    throw new HarnessError(
      "DEADLINE_EXCEEDED",
      "Termination transaction did not reach its terminal state",
    );
  }

  async #acquireSessionHold(
    definition: SignedSessionDefinition,
  ): Promise<void> {
    if (this.#references === null) return;
    await this.#references.acquire({
      holdId: `hold.session.${definition.sessionId}`,
      harnessVersionId: definition.pins.harnessVersionId,
      holdKind: "live_session",
      subjectId: definition.sessionId,
      signer: this.#signer,
    });
  }

  async #releaseSessionHold(
    definition: SignedSessionDefinition,
  ): Promise<void> {
    if (this.#references === null) return;
    const holdId = `hold.session.${definition.sessionId}`;
    const active = (await this.#references.activeHolds()).some(
      (hold) => hold.holdId === holdId,
    );
    if (!active) return;
    await this.#references.release({
      holdId,
      harnessVersionId: definition.pins.harnessVersionId,
      holdKind: "live_session",
      subjectId: definition.sessionId,
      signer: this.#signer,
    });
  }

  async #reconcileSessionHold(
    definition: SignedSessionDefinition,
    state: SessionState,
  ): Promise<void> {
    if (state === "retired" || state === "terminated") {
      await this.#releaseSessionHold(definition);
    } else {
      await this.#acquireSessionHold(definition);
    }
  }

  #maybeCrashTermination(stage: TerminationCrashStage): void {
    if (this.#crashAfterTerminationStage === stage) {
      throw new SimulatedTerminationCrash(stage);
    }
  }

  async #response(
    operation: Operation,
    sessionId: string,
    receipts: readonly EvidenceReceipt[],
    data?: JsonValue,
  ): Promise<OperationResponse> {
    const state = await this.#lifecycle.state(sessionId);
    const response: OperationResponse = {
      schemaVersion: 1,
      operation,
      subjectId: sessionId,
      state,
      evidence: receipts.map((receipt) => ({
        receiptId: receipt.receiptId,
        receiptHash: receipt.receiptHash,
      })),
      nextAllowedActions: NEXT_ACTIONS[state],
      ...(data === undefined ? {} : { data }),
    };
    this.#schemas.validate(OPERATION_RESPONSE_SCHEMA_ID, response as unknown as JsonValue);
    return response;
  }
}
