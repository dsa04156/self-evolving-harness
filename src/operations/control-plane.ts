import path from "node:path";

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
import type { PrincipalSigner } from "../trust/identity.js";
import type { SessionLifecycleStore } from "./session-lifecycle.js";

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
}

interface SessionDefinition {
  readonly schemaVersion: 1;
  readonly sessionId: string;
  readonly pins: SessionPins;
  readonly createdAt: string;
}

type SessionExecutor = (task: string, abortSignal: AbortSignal) => Promise<AgentRunResult>;

const NEXT_ACTIONS: Readonly<Record<SessionState, readonly NextAction[]>> = Object.freeze({
  created: ["observe", "terminate", "retire", "events", "artifacts"],
  initialized: ["submit", "observe", "terminate", "events", "artifacts"],
  running: ["observe", "interrupt", "terminate", "validate", "events", "artifacts"],
  waiting: ["observe", "interrupt", "terminate", "resume", "events", "artifacts"],
  blocked: ["observe", "terminate", "recover", "events", "artifacts"],
  recovering: ["observe", "interrupt", "terminate", "events", "artifacts"],
  validating: ["observe", "interrupt", "terminate", "events", "artifacts"],
  completed: ["observe", "finalize", "retire", "events", "artifacts"],
  retired: ["observe", "events", "artifacts"],
  terminating: ["observe", "events", "artifacts"],
  terminated: ["observe", "events", "artifacts"],
});

function asDefinition(value: JsonValue): SessionDefinition {
  return value as unknown as SessionDefinition;
}

export class OperationsControlPlane {
  readonly #protocolId: string;
  readonly #schemas: SchemaRegistry;
  readonly #lifecycle: SessionLifecycleStore;
  readonly #receipts: EvidenceReceiptStore;
  readonly #artifacts: ArtifactStore;
  readonly #signer: PrincipalSigner;
  readonly #clock: Clock;
  readonly #definitions: AppendOnlyLog<JsonValue>;
  readonly #sessions = new Map<string, SessionDefinition>();
  readonly #abortControllers = new Map<string, AbortController>();
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
    this.#clock = input.clock;
    this.#definitions = new AppendOnlyLog<JsonValue>(
      path.join(input.root, "operations"),
      "sessions.definitions",
    );
  }

  public async initialize(): Promise<void> {
    for (const record of await this.#definitions.readAll()) {
      const definition = asDefinition(record.payload);
      assertCondition(
        definition.schemaVersion === 1 &&
          definition.pins.protocolId === this.#protocolId &&
          !this.#sessions.has(definition.sessionId),
        "PROTOCOL_MISMATCH",
        "Invalid persisted session definition",
      );
      this.#sessions.set(definition.sessionId, definition);
    }
    await this.#lifecycle.verifyAll();
  }

  public async start(sessionId: string, pins: SessionPins): Promise<OperationResponse> {
    return this.#withStateLock(sessionId, async () => {
      assertCondition(!this.#sessions.has(sessionId), "CONFLICT", "Session already exists");
      assertCondition(
        pins.protocolId === this.#protocolId,
        "PROTOCOL_MISMATCH",
        "Session protocol differs from control plane",
      );
      const definition: SessionDefinition = {
        schemaVersion: 1,
        sessionId,
        pins,
        createdAt: this.#clock.now().toISOString(),
      };
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
    let result: AgentRunResult;
    try {
      result = await executor(task, controller.signal);
    } catch (error) {
      await this.#withStateLock(sessionId, () =>
        this.#terminate(
          sessionId,
          "process_crash",
          "session_checkpoint",
        ),
      );
      throw error;
    } finally {
      this.#abortControllers.delete(sessionId);
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
    return this.#withStateLock(sessionId, async () => {
      const current = await this.#lifecycle.state(sessionId);
      if (current === "terminating" || current === "terminated") {
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
          "session_completion",
        );
      }
      return this.#response("submit", sessionId, [
        runningReceipt,
        resultReceipt,
      ]);
    });
  }

  public async observe(sessionId: string): Promise<OperationResponse> {
    this.#definition(sessionId);
    return this.#response("observe", sessionId, []);
  }

  public async interrupt(sessionId: string): Promise<OperationResponse> {
    this.#definition(sessionId);
    const controller = this.#abortControllers.get(sessionId);
    assertCondition(controller !== undefined, "INVALID_STATE_TRANSITION", "Session is not executing");
    controller.abort();
    return this.#withStateLock(sessionId, async () => {
      const receipts = await this.#terminate(
        sessionId,
        "user_cancellation",
        "session_completion",
      );
      return this.#response("interrupt", sessionId, receipts);
    });
  }

  public async terminate(
    sessionId: string,
    reason: TerminationReason = "host_enforced_shutdown",
  ): Promise<OperationResponse> {
    this.#definition(sessionId);
    this.#abortControllers.get(sessionId)?.abort();
    return this.#withStateLock(sessionId, async () => {
      const receipts = await this.#terminate(
        sessionId,
        reason,
        "session_completion",
      );
      return this.#response("terminate", sessionId, receipts);
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
      return this.#response("finalize", sessionId, [receipt]);
    });
  }

  async #terminate(
    sessionId: string,
    reason: TerminationReason,
    finalReceiptType: "session_checkpoint" | "session_completion",
  ): Promise<EvidenceReceipt[]> {
    const definition = this.#definition(sessionId);
    const state = await this.#lifecycle.state(sessionId);
    if (state === "terminated") return [];
    assertCondition(state !== "retired", "INVALID_STATE_TRANSITION", "Retired session is terminal");
    const initiating = await this.#controlReceipt("session_checkpoint", definition);
    await this.#lifecycle.beginTermination({
      sessionId,
      reason,
      evidenceReceiptIds: [initiating.receiptId],
      signer: this.#signer,
    });
    const final = await this.#controlReceipt(finalReceiptType, definition);
    await this.#lifecycle.completeTermination({
      sessionId,
      finalEvidenceReceiptId: final.receiptId,
      signer: this.#signer,
    });
    return [initiating, final];
  }

  async #controlReceipt(
    receiptType: "session_initialization" | "session_checkpoint" | "session_completion" | "artifact_retention",
    definition: SessionDefinition,
  ): Promise<EvidenceReceipt> {
    return this.#receipts.create({
      receiptType,
      subjectIds: [definition.sessionId],
      harnessVersionIds: [definition.pins.harnessVersionId],
      runtimeStateSnapshotIds: [definition.pins.runtimeStateSnapshotId],
      signer: this.#signer,
    });
  }

  #definition(sessionId: string): SessionDefinition {
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

  async #response(
    operation: Operation,
    sessionId: string,
    receipts: readonly EvidenceReceipt[],
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
    };
    this.#schemas.validate(OPERATION_RESPONSE_SCHEMA_ID, response as unknown as JsonValue);
    return response;
  }
}
