import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { constants } from "node:fs";
import { lstat, mkdir, open, readFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";

import {
  canonicalBytes,
  parseStrictJson,
  sha256,
  type JsonValue,
} from "../core/canonical.js";
import type { Clock, IdFactory } from "../core/determinism.js";
import { HarnessError, asHarnessError, assertCondition } from "../core/errors.js";
import { SCHEMA_BASE_URL, type SchemaRegistry } from "../contracts/schema-registry.js";
import {
  type AuditLedger,
  type AuditLink,
} from "../evidence/audit-trail.js";
import { AppendOnlyLog } from "../storage/append-only-log.js";
import type {
  Attestation,
  PrincipalIdentity,
  PrincipalRegistry,
  PrincipalSigner,
  PublicPrincipal,
} from "../trust/identity.js";
import {
  createWireEnvelope,
  encodeWireFrame,
  ReplayGuard,
  verifyWireEnvelope,
  type WireEnvelope,
} from "../trust/wire.js";
import {
  EvaluationTransactionStore,
  type EvaluationTransactionRecord,
  type EvaluationTransactionStage,
} from "./evaluation-transaction.js";
import type { HarnessReferenceLedger } from "./reference-ledger.js";

export const EVALUATION_RESULT_SCHEMA_ID = `${SCHEMA_BASE_URL}evaluation-result.schema.json`;
export const EVALUATOR_REQUEST_SCHEMA_ID =
  `${SCHEMA_BASE_URL}evaluator-request-payload.schema.json`;
export const EVALUATOR_RESPONSE_SCHEMA_ID =
  `${SCHEMA_BASE_URL}evaluator-response-payload.schema.json`;
const MAX_FRAME_BYTES = 1024 * 1024;

export interface DeterministicTaskPair {
  readonly opaqueTaskHandleHash: string;
  readonly rolloutSeed: number;
  readonly parentPassed: boolean;
  readonly candidatePassed: boolean;
  readonly parentReceiptId: string;
  readonly candidateReceiptId: string;
}

export interface EvaluationBudgetUsage {
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
  readonly toolCalls: number;
  readonly feedbackEvents: number;
  readonly wallClockMillis: number;
}

export interface ExternalEvaluationInput {
  readonly methodId:
    | "B0"
    | "B1"
    | "B2"
    | "B3"
    | "B4"
    | "B5-U"
    | "B5-SM"
    | "B6-ABL"
    | "B6";
  readonly parentHarnessVersionId: string;
  readonly candidateHarnessVersionId: string;
  readonly candidateFilesystemSnapshotHash?: string | null;
  readonly runtimeStateSnapshotIds: readonly string[];
  readonly rolloutSeeds: readonly number[];
  readonly manifestPins: Readonly<Record<string, string>>;
  readonly taskPairs: readonly DeterministicTaskPair[];
  readonly totalUsage: EvaluationBudgetUsage;
  readonly pairedCi95LowerPercentagePointMicros: number;
  readonly pairedCi95UpperPercentagePointMicros: number;
  readonly sourceEvidenceReceiptIds: readonly string[];
  readonly violations?: readonly {
    readonly kind:
      | "safety"
      | "permission"
      | "budget"
      | "manifest"
      | "state_snapshot"
      | "data_access"
      | "audit"
      | "protocol";
    readonly count: number;
    readonly receiptIds: readonly string[];
  }[];
}

export interface EvaluationResult {
  readonly schemaVersion: 4;
  readonly evaluationResultId: string;
  readonly protocolId: string;
  readonly track: "contract" | "A" | "B" | "temporal";
  readonly phase:
    | "pilot"
    | "mine"
    | "gate"
    | "offline_canary"
    | "final"
    | "temporal_replication"
    | "deterministic";
  readonly methodId: ExternalEvaluationInput["methodId"];
  readonly datasetRole:
    | "mine"
    | "gate"
    | "sealed_test"
    | "withheld_public_test"
    | "temporal_holdout"
    | "deterministic"
    | "pilot";
  readonly parentHarnessVersionId: string;
  readonly candidateHarnessVersionId: string;
  readonly candidateFilesystemSnapshotHash: string | null;
  readonly runtimeStateSnapshotIds: readonly string[];
  readonly rolloutSeeds: readonly number[];
  readonly epistemicClass: "verifier_outcome";
  readonly validity:
    | "valid"
    | "invalid_protocol"
    | "invalid_manifest"
    | "invalid_state_snapshot"
    | "invalid_budget"
    | "invalid_evidence"
    | "invalid_data_access"
    | "incomplete";
  readonly taskPairs: readonly DeterministicTaskPair[];
  readonly aggregate: {
    readonly taskCount: number;
    readonly rolloutSeedCount: number;
    readonly parentPassRateMicros: number;
    readonly candidatePassRateMicros: number;
    readonly deltaPercentagePointMicros: number;
    readonly passToFailCount: number;
    readonly failToPassCount: number;
    readonly pairedCi95LowerPercentagePointMicros: number;
    readonly pairedCi95UpperPercentagePointMicros: number;
    readonly taskIsPrimaryUnit: true;
  };
  readonly totalUsage: EvaluationBudgetUsage;
  readonly gateChecks: readonly {
    readonly gateId: string;
    readonly passed: boolean;
  }[];
  readonly violations: readonly JsonValue[];
  readonly evaluator: PrincipalIdentity;
  readonly auditLink: AuditLink;
  readonly attestation: Attestation;
  readonly [key: string]: unknown;
}

class FrameReader {
  readonly #iterator: AsyncIterator<string | Buffer>;
  #buffer = Buffer.alloc(0);

  public constructor(stream: NodeJS.ReadableStream) {
    this.#iterator = (stream as NodeJS.ReadableStream & AsyncIterable<string | Buffer>)[
      Symbol.asyncIterator
    ]();
  }

  public async next(): Promise<JsonValue> {
    const header = await this.#readExactly(4);
    const length = header.readUInt32BE(0);
    assertCondition(
      length >= 2 && length <= MAX_FRAME_BYTES,
      "PAYLOAD_TOO_LARGE",
      "Evaluator response frame size is invalid",
    );
    const body = await this.#readExactly(length);
    const value = parseStrictJson(body.toString("utf8"));
    assertCondition(
      Buffer.compare(body, canonicalBytes(value)) === 0,
      "SCHEMA_INVALID",
      "Evaluator response is not canonical JSON",
    );
    return value;
  }

  async #readExactly(size: number): Promise<Buffer> {
    while (this.#buffer.byteLength < size) {
      const next = await this.#iterator.next();
      assertCondition(!next.done, "PEER_CRASHED", "Evaluator closed its output");
      this.#buffer = Buffer.concat([this.#buffer, Buffer.from(next.value)]);
    }
    const result = this.#buffer.subarray(0, size);
    this.#buffer = this.#buffer.subarray(size);
    return result;
  }
}

function objectValue(value: JsonValue, label: string): Record<string, JsonValue> {
  assertCondition(
    typeof value === "object" && value !== null && !Array.isArray(value),
    "SCHEMA_INVALID",
    `${label} is not an object`,
  );
  return value;
}

function withoutAttestation(value: Record<string, JsonValue>): Record<string, JsonValue> {
  const { attestation: _attestation, ...body } = value;
  return body;
}

async function writeExclusive(file: string, bytes: Uint8Array, mode: number): Promise<void> {
  const handle = await open(
    file,
    constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
    mode,
  );
  try {
    await handle.writeFile(bytes);
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function writeExclusiveOrVerify(
  file: string,
  bytes: Uint8Array,
  mode: number,
): Promise<void> {
  try {
    await writeExclusive(file, bytes, mode);
    return;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  }
  const handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const metadata = await handle.stat();
    const existing = await handle.readFile();
    assertCondition(
      metadata.isFile() &&
        metadata.nlink === 1 &&
        (metadata.mode & 0o077) === 0 &&
        Buffer.compare(existing, Buffer.from(bytes)) === 0,
      "HASH_MISMATCH",
      "Persisted emulated evaluator credential or config changed",
    );
  } finally {
    await handle.close();
  }
}

export interface UnixEvaluatorEndpoint {
  readonly socketPath: string;
  readonly expectedEvaluatorUid: number;
  readonly expectedEvaluatorGid: number;
  readonly pythonExecutable: string;
  readonly relayScriptPath: string;
}

export interface EmulatedEvaluatorLaunch {
  readonly isolationClass: "isolation_emulated";
  readonly pythonRoot: string;
  readonly scriptPath: string;
  readonly evaluatorSigner: PrincipalSigner;
}

export interface CandidateFilesystemSnapshotMount {
  readonly rootPath: string;
  readonly descriptorPath: string;
  readonly filesystemSnapshotHash: string;
  readonly bundleId: string;
  readonly candidateHarnessVersionId: string;
}

export interface EvaluatorPeerCredentials {
  readonly pid: number;
  readonly uid: number;
  readonly gid: number;
}

export class SimulatedEvaluationCrash extends Error {
  public readonly stage: EvaluationTransactionStage;

  public constructor(stage: EvaluationTransactionStage) {
    super(`Simulated process crash after durable evaluation stage ${stage}`);
    this.name = "SimulatedEvaluationCrash";
    this.stage = stage;
  }
}

async function readReadyLine(
  stream: NodeJS.ReadableStream,
  timeoutMillis: number,
): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    let buffer = "";
    const cleanup = (): void => {
      clearTimeout(timer);
      stream.removeListener("data", onData);
      stream.removeListener("end", onEnd);
      stream.removeListener("error", onError);
    };
    const finish = (line: string): void => {
      cleanup();
      resolve(line);
    };
    const onData = (chunk: Buffer | string): void => {
      buffer += Buffer.from(chunk).toString("ascii");
      assertCondition(
        buffer.length <= 256,
        "PAYLOAD_TOO_LARGE",
        "Evaluator relay readiness line is too large",
      );
      const newline = buffer.indexOf("\n");
      if (newline >= 0) finish(buffer.slice(0, newline));
    };
    const onEnd = (): void => {
      cleanup();
      reject(new HarnessError("PEER_CRASHED", "Evaluator relay closed before readiness"));
    };
    const onError = (error: Error): void => {
      cleanup();
      reject(error);
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new HarnessError("DEADLINE_EXCEEDED", "Evaluator relay readiness timed out"));
    }, timeoutMillis);
    timer.unref();
    stream.on("data", onData);
    stream.on("end", onEnd);
    stream.on("error", onError);
  });
}

async function waitForSocket(
  socketPath: string,
  child: ChildProcessWithoutNullStreams,
  timeoutMillis: number,
): Promise<void> {
  const deadline = Date.now() + timeoutMillis;
  while (Date.now() <= deadline) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new HarnessError("PEER_CRASHED", "Evaluator exited before binding its socket");
    }
    try {
      const metadata = await lstat(socketPath);
      assertCondition(metadata.isSocket(), "AUTHENTICATION_FAILED", "Evaluator path is not a socket");
      return;
    } catch (error) {
      if (
        error instanceof HarnessError ||
        !(error instanceof Error) ||
        !("code" in error) ||
        error.code !== "ENOENT"
      ) {
        throw error;
      }
    }
    await delay(20);
  }
  throw new HarnessError("DEADLINE_EXCEEDED", "Evaluator did not bind its Unix socket");
}

async function stopProcessGroup(child: ChildProcessWithoutNullStreams): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise<void>((resolve) => child.once("close", () => resolve()));
  if (!child.stdin.destroyed) child.stdin.end();
  if ((await Promise.race([exited.then(() => true), delay(300).then(() => false)])) === true) {
    return;
  }
  if (child.pid !== undefined) {
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch {
      // The process group already exited.
    }
  }
  if ((await Promise.race([exited.then(() => true), delay(500).then(() => false)])) === true) {
    return;
  }
  if (child.pid !== undefined) {
    try {
      process.kill(-child.pid, "SIGKILL");
    } catch {
      // The process group already exited.
    }
  }
  await exited;
}

export class ExternalEvaluatorClient {
  readonly #root: string;
  readonly #protocolId: string;
  readonly #endpoint: UnixEvaluatorEndpoint;
  readonly #emulatedLaunch: EmulatedEvaluatorLaunch | null;
  readonly #schemas: SchemaRegistry;
  readonly #audit: AuditLedger;
  readonly #operationsSigner: PrincipalSigner;
  readonly #evaluatorPrincipal: PublicPrincipal;
  readonly #principals: PrincipalRegistry;
  readonly #clock: Clock;
  readonly #ids: IdFactory;
  readonly #log: AppendOnlyLog<JsonValue>;
  readonly #transactions: EvaluationTransactionStore;
  readonly #references: HarnessReferenceLedger | null;
  readonly #crashAfterStage: EvaluationTransactionStage | null;
  readonly #candidateSnapshotMount: CandidateFilesystemSnapshotMount | null;
  #responseReplay = new ReplayGuard();
  #relayChild: ChildProcessWithoutNullStreams | null = null;
  #evaluatorChild: ChildProcessWithoutNullStreams | null = null;
  #reader: FrameReader | null = null;
  #peerCredentials: EvaluatorPeerCredentials | null = null;
  #sequence = 0;
  #stderr = "";

  public constructor(input: {
    root: string;
    protocolId: string;
    endpoint: UnixEvaluatorEndpoint;
    evaluatorPrincipal: PublicPrincipal;
    emulatedLaunch?: EmulatedEvaluatorLaunch;
    schemas: SchemaRegistry;
    audit: AuditLedger;
    operationsSigner: PrincipalSigner;
    principals: PrincipalRegistry;
    clock: Clock;
    ids: IdFactory;
    references?: HarnessReferenceLedger;
    crashAfterStage?: EvaluationTransactionStage;
    candidateSnapshotMount?: CandidateFilesystemSnapshotMount;
  }) {
    assertCondition(
      input.operationsSigner.identity.role === "operations_owner" &&
        input.evaluatorPrincipal.identity.role === "evaluator",
      "AUTHORIZATION_DENIED",
      "Evaluator client identities have invalid roles",
    );
    assertCondition(
      Number.isSafeInteger(input.endpoint.expectedEvaluatorUid) &&
        input.endpoint.expectedEvaluatorUid >= 0 &&
        Number.isSafeInteger(input.endpoint.expectedEvaluatorGid) &&
        input.endpoint.expectedEvaluatorGid >= 0,
      "SCHEMA_INVALID",
      "Evaluator endpoint has invalid kernel credentials",
    );
    if (input.emulatedLaunch !== undefined) {
      const emulatedPublic = input.emulatedLaunch.evaluatorSigner.exportPublic();
      assertCondition(
        emulatedPublic.keyId === input.evaluatorPrincipal.keyId &&
          emulatedPublic.identity.identityDigest ===
            input.evaluatorPrincipal.identity.identityDigest,
        "AUTHENTICATION_FAILED",
        "Emulated evaluator signer does not match the pinned public principal",
      );
    }
    if (input.candidateSnapshotMount !== undefined) {
      assertCondition(
        input.emulatedLaunch !== undefined &&
          /^sha256:[a-f0-9]{64}$/u.test(
            input.candidateSnapshotMount.filesystemSnapshotHash,
          ) &&
          /^bundle-sha256:[a-f0-9]{64}$/u.test(
            input.candidateSnapshotMount.bundleId,
          ) &&
          /^hv-sha256:[a-f0-9]{64}$/u.test(
            input.candidateSnapshotMount.candidateHarnessVersionId,
          ),
        "SCHEMA_INVALID",
        "A locally mounted candidate snapshot requires an emulated evaluator",
      );
    }
    this.#root = path.resolve(input.root);
    this.#protocolId = input.protocolId;
    this.#endpoint = {
      ...input.endpoint,
      socketPath: path.resolve(input.endpoint.socketPath),
      pythonExecutable: path.resolve(input.endpoint.pythonExecutable),
      relayScriptPath: path.resolve(input.endpoint.relayScriptPath),
    };
    this.#emulatedLaunch =
      input.emulatedLaunch === undefined
        ? null
        : {
            ...input.emulatedLaunch,
            pythonRoot: path.resolve(input.emulatedLaunch.pythonRoot),
            scriptPath: path.resolve(input.emulatedLaunch.scriptPath),
          };
    this.#schemas = input.schemas;
    this.#audit = input.audit;
    this.#operationsSigner = input.operationsSigner;
    this.#evaluatorPrincipal = input.evaluatorPrincipal;
    this.#principals = input.principals;
    this.#clock = input.clock;
    this.#ids = input.ids;
    this.#references = input.references ?? null;
    this.#crashAfterStage = input.crashAfterStage ?? null;
    this.#candidateSnapshotMount =
      input.candidateSnapshotMount === undefined
        ? null
        : {
            rootPath: path.resolve(input.candidateSnapshotMount.rootPath),
            descriptorPath: path.resolve(
              input.candidateSnapshotMount.descriptorPath,
            ),
            filesystemSnapshotHash:
              input.candidateSnapshotMount.filesystemSnapshotHash,
            bundleId: input.candidateSnapshotMount.bundleId,
            candidateHarnessVersionId:
              input.candidateSnapshotMount.candidateHarnessVersionId,
          };
    this.#log = new AppendOnlyLog<JsonValue>(
      path.join(input.root, "evolution"),
      "evaluation.results",
    );
    this.#transactions = new EvaluationTransactionStore({
      root: input.root,
      protocolId: input.protocolId,
      schemas: input.schemas,
      audit: input.audit,
      principals: input.principals,
      signer: input.operationsSigner,
      clock: input.clock,
    });
  }

  public get isolationClass(): "isolation_emulated" | "os_enforced_external" {
    return this.#emulatedLaunch === null ? "os_enforced_external" : "isolation_emulated";
  }

  public get peerCredentials(): EvaluatorPeerCredentials | null {
    return this.#peerCredentials === null ? null : { ...this.#peerCredentials };
  }

  public async start(): Promise<void> {
    assertCondition(this.#relayChild === null, "CONFLICT", "Evaluator is already running");
    this.#stderr = "";
    this.#sequence = 0;
    this.#responseReplay = new ReplayGuard();
    this.#peerCredentials = null;
    await mkdir(path.dirname(this.#endpoint.socketPath), { recursive: true, mode: 0o700 });

    try {
      if (this.#emulatedLaunch !== null) {
        await this.#startEmulatedServer(this.#emulatedLaunch);
      } else {
        const metadata = await lstat(this.#endpoint.socketPath);
        assertCondition(metadata.isSocket(), "AUTHENTICATION_FAILED", "Endpoint is not a Unix socket");
      }

      const relay = spawn(
        this.#endpoint.pythonExecutable,
        [
          "-I",
          this.#endpoint.relayScriptPath,
          "--socket",
          this.#endpoint.socketPath,
          "--expected-server-uid",
          String(this.#endpoint.expectedEvaluatorUid),
          "--expected-server-gid",
          String(this.#endpoint.expectedEvaluatorGid),
          "--ready-fd",
          "3",
          "--timeout-millis",
          "5000",
        ],
        {
          detached: true,
          env: {
            PATH: "/usr/bin:/bin",
            LANG: "C.UTF-8",
            LC_ALL: "C.UTF-8",
            TZ: "UTC",
            PYTHONHASHSEED: "0",
            PYTHONDONTWRITEBYTECODE: "1",
          },
          stdio: ["pipe", "pipe", "pipe", "pipe"],
        },
      );
      relay.stderr.on("data", (chunk: Buffer) => {
        if (this.#stderr.length < 64 * 1024) this.#stderr += chunk.toString("utf8");
      });
      this.#relayChild = relay;
      this.#reader = new FrameReader(relay.stdout);
      const readyStream = relay.stdio[3] as NodeJS.ReadableStream | null | undefined;
      if (readyStream === null || readyStream === undefined) {
        throw new HarnessError("PEER_CRASHED", "Relay readiness pipe is unavailable");
      }
      const ready = await readReadyLine(readyStream, 5_000);
      const match = /^READY ([0-9]+) ([0-9]+) ([0-9]+)$/u.exec(ready);
      assertCondition(match !== null, "AUTHENTICATION_FAILED", "Malformed relay readiness proof");
      const peer = {
        pid: Number(match[1]),
        uid: Number(match[2]),
        gid: Number(match[3]),
      };
      assertCondition(
        peer.uid === this.#endpoint.expectedEvaluatorUid &&
          peer.gid === this.#endpoint.expectedEvaluatorGid,
        "AUTHENTICATION_FAILED",
        "Relay reported unexpected evaluator credentials",
      );
      this.#peerCredentials = peer;
    } catch (error) {
      await this.stop();
      throw error;
    }
  }

  public async evaluate(input: ExternalEvaluationInput): Promise<EvaluationResult> {
    assertCondition(
      this.#relayChild !== null && this.#reader !== null,
      "PEER_CRASHED",
      "Not started",
    );
    if (this.#emulatedLaunch === null) {
      assertCondition(
        typeof input.candidateFilesystemSnapshotHash === "string" &&
          /^sha256:[a-f0-9]{64}$/u.test(
            input.candidateFilesystemSnapshotHash,
          ),
        "AUTHORIZATION_DENIED",
        "OS-enforced evaluation requires an exact candidate filesystem snapshot",
      );
    }
    if (this.#candidateSnapshotMount !== null) {
      assertCondition(
        input.candidateFilesystemSnapshotHash ===
          this.#candidateSnapshotMount.filesystemSnapshotHash,
        "PROTOCOL_MISMATCH",
        "Evaluation request does not match the mounted candidate snapshot",
      );
    }
    const evaluationResultId = this.#ids.next("evaluation-result");
    const requestId = this.#ids.next("evaluation-request");
    const transactionId = this.#ids.next("evaluation-transaction");
    const requestPayload = {
      schemaVersion: 1,
      operation: "evaluate",
      requestId,
      evaluationResultId,
      datasetRole: "deterministic",
      phase: "deterministic",
      methodId: input.methodId,
      parentHarnessVersionId: input.parentHarnessVersionId,
      candidateHarnessVersionId: input.candidateHarnessVersionId,
      candidateFilesystemSnapshotHash:
        input.candidateFilesystemSnapshotHash ?? null,
      runtimeStateSnapshotIds: [...input.runtimeStateSnapshotIds],
      rolloutSeeds: [...input.rolloutSeeds],
      manifestPins: input.manifestPins,
      taskPairs: input.taskPairs,
      totalUsage: input.totalUsage,
      pairedCi95LowerPercentagePointMicros:
        input.pairedCi95LowerPercentagePointMicros,
      pairedCi95UpperPercentagePointMicros:
        input.pairedCi95UpperPercentagePointMicros,
      sourceEvidenceReceiptIds: [...input.sourceEvidenceReceiptIds],
      violations: [...(input.violations ?? [])],
      createdAt: this.#clock.now().toISOString(),
    } as unknown as Record<string, JsonValue>;
    await this.#acquireEvaluationHolds({
      transactionId,
      parentHarnessVersionId: input.parentHarnessVersionId,
      candidateHarnessVersionId: input.candidateHarnessVersionId,
    });
    let transaction: EvaluationTransactionRecord | null = null;
    try {
      transaction = await this.#transactions.begin({
        transactionId,
        requestId,
        evaluationResultId,
        parentHarnessVersionId: input.parentHarnessVersionId,
        candidateHarnessVersionId: input.candidateHarnessVersionId,
        requestPayload,
      });
      this.#maybeCrash("started");
      const result = await this.#resumeTransaction(transaction);
      await this.#releaseEvaluationHolds(result.transaction);
      return result.result;
    } catch (error) {
      if (error instanceof SimulatedEvaluationCrash) throw error;
      if (transaction !== null) {
        const latest = (await this.#transactions.records(transaction.transactionId)).at(-1)!;
        if (latest.stage !== "completed" && latest.stage !== "failed") {
          await this.#transactions.fail(latest, asHarnessError(error).code);
        }
        await this.#releaseEvaluationHolds(latest);
      }
      throw error;
    }
  }

  public async recoverPendingEvaluations(): Promise<EvaluationResult[]> {
    assertCondition(
      this.#relayChild !== null && this.#reader !== null,
      "PEER_CRASHED",
      "Evaluator must be started before recovery",
    );
    const latest = await this.#transactions.latest();
    const knownTransactions = new Set(latest.map((record) => record.transactionId));
    if (this.#references !== null) {
      for (const hold of await this.#references.activeHolds()) {
        if (
          hold.holdKind === "pending_evaluation" &&
          !knownTransactions.has(hold.subjectId)
        ) {
          await this.#references.release({
            holdId: hold.holdId,
            harnessVersionId: hold.harnessVersionId,
            holdKind: hold.holdKind,
            subjectId: hold.subjectId,
            signer: this.#operationsSigner,
          });
        }
      }
    }
    const recovered: EvaluationResult[] = [];
    for (const transaction of latest) {
      if (transaction.stage === "completed" || transaction.stage === "failed") {
        await this.#releaseEvaluationHolds(transaction);
        continue;
      }
      await this.#acquireEvaluationHolds(transaction);
      try {
        const result = await this.#resumeTransaction(transaction);
        await this.#releaseEvaluationHolds(result.transaction);
        recovered.push(result.result);
      } catch (error) {
        if (error instanceof SimulatedEvaluationCrash) throw error;
        const current = (
          await this.#transactions.records(transaction.transactionId)
        ).at(-1)!;
        await this.#transactions.fail(current, asHarnessError(error).code);
        await this.#releaseEvaluationHolds(current);
        throw error;
      }
    }
    return recovered;
  }

  public transactionRecords(): Promise<EvaluationTransactionRecord[]> {
    return this.#transactions.records();
  }

  public verifyTransactions(): Promise<void> {
    return this.#transactions.verifyAll();
  }

  async #resumeTransaction(
    starting: EvaluationTransactionRecord,
  ): Promise<{
    readonly transaction: EvaluationTransactionRecord;
    readonly result: EvaluationResult;
  }> {
    let transaction = (
      await this.#transactions.records(starting.transactionId)
    ).at(-1)!;
    const requestPayload = transaction.requestPayload;
    if (this.#emulatedLaunch === null) {
      assertCondition(
        typeof requestPayload["candidateFilesystemSnapshotHash"] === "string" &&
          /^sha256:[a-f0-9]{64}$/u.test(
            requestPayload["candidateFilesystemSnapshotHash"],
          ),
        "AUTHORIZATION_DENIED",
        "Recovered OS-enforced evaluation has no exact filesystem snapshot",
      );
    }
    const proposed = await this.#exchange(requestPayload);
    assertCondition(
      proposed["operation"] === "evaluation_proposed" &&
        proposed["requestId"] === transaction.requestId,
      "SCHEMA_INVALID",
      "Unexpected evaluator proposal",
    );
    const core = objectValue(proposed["core"]!, "evaluation core");
    const coreHash = proposed["coreHash"];
    assertCondition(
      typeof coreHash === "string" && coreHash === sha256(core),
      "HASH_MISMATCH",
      "Evaluator core hash mismatch",
    );
    if (transaction.coreHash !== null) {
      assertCondition(
        transaction.coreHash === coreHash,
        "HASH_MISMATCH",
        "Recovered evaluator proposal changed its core",
      );
    }
    if (transaction.stage === "started") {
      transaction = await this.#transactions.advance(transaction, "proposed", {
        coreHash,
      });
      this.#maybeCrash("proposed");
    }
    assertCondition(
      transaction.coreHash === coreHash,
      "HASH_MISMATCH",
      "Transaction does not bind the evaluator core",
    );
    let resultAuditLink = transaction.resultAuditLink;
    if (transaction.stage === "proposed") {
      resultAuditLink = await this.#audit.appendSubject({
        subjectType: "EvaluationResult",
        subjectId: transaction.evaluationResultId,
        subjectHash: coreHash,
      });
      transaction = await this.#transactions.advance(transaction, "audit_linked", {
        resultAuditLink,
      });
      this.#maybeCrash("audit_linked");
    }
    assertCondition(
      resultAuditLink !== null,
      "HASH_MISMATCH",
      "Evaluation transaction has no durable audit link",
    );
    const finalized = await this.#exchange({
      schemaVersion: 1,
      operation: "finalize",
      requestId: transaction.requestId,
      coreHash,
      auditLink: resultAuditLink,
    } as unknown as Record<string, JsonValue>);
    assertCondition(
      finalized["operation"] === "evaluation_final" &&
        finalized["requestId"] === transaction.requestId,
      "SCHEMA_INVALID",
      "Unexpected evaluator final response",
    );
    const resultObject = objectValue(finalized["result"]!, "evaluation result");
    const resultHash = sha256(resultObject);
    if (transaction.resultHash !== null) {
      assertCondition(
        transaction.resultHash === resultHash,
        "HASH_MISMATCH",
        "Recovered evaluator result changed",
      );
    }
    if (transaction.stage === "audit_linked") {
      transaction = await this.#transactions.advance(transaction, "result_created", {
        resultHash,
      });
      this.#maybeCrash("result_created");
    }
    this.#schemas.validate(EVALUATION_RESULT_SCHEMA_ID, resultObject);
    assertCondition(
      resultObject["evaluationResultId"] === transaction.evaluationResultId &&
        resultObject["protocolId"] === this.#protocolId &&
        resultObject["parentHarnessVersionId"] ===
          transaction.parentHarnessVersionId &&
        resultObject["candidateHarnessVersionId"] ===
          transaction.candidateHarnessVersionId &&
        resultObject["candidateFilesystemSnapshotHash"] ===
          requestPayload["candidateFilesystemSnapshotHash"],
      "PROTOCOL_MISMATCH",
      "Evaluation result pins changed",
    );
    const attestation = objectValue(resultObject["attestation"]!, "result attestation");
    const { attestation: _attestation, auditLink: _auditLink, ...resultCore } = resultObject;
    assertCondition(sha256(resultCore) === coreHash, "HASH_MISMATCH", "Evaluation core changed");
    const { attestation: _removed, ...signedBody } = resultObject;
    this.#principals.verify(
      this.#evaluatorPrincipal.identity,
      signedBody,
      attestation as unknown as Attestation,
    );
    await this.#audit.verifyLink(resultAuditLink, {
      subjectType: "EvaluationResult",
      subjectId: transaction.evaluationResultId,
      subjectHash: coreHash,
    });
    if (transaction.stage === "result_created") {
      transaction = await this.#transactions.advance(
        transaction,
        "signature_verified",
      );
      this.#maybeCrash("signature_verified");
    }
    await this.#appendResultIdempotently(resultObject);
    if (transaction.stage === "signature_verified") {
      transaction = await this.#transactions.advance(transaction, "result_appended");
      this.#maybeCrash("result_appended");
    }
    assertCondition(
      sha256(resultObject["totalUsage"] as JsonValue) ===
        sha256(requestPayload["totalUsage"] as JsonValue),
      "HASH_MISMATCH",
      "Evaluator accounting differs from the requested phase ledger",
    );
    if (transaction.stage === "result_appended") {
      transaction = await this.#transactions.advance(
        transaction,
        "accounting_sealed",
      );
      this.#maybeCrash("accounting_sealed");
    }
    if (transaction.stage === "accounting_sealed") {
      transaction = await this.#transactions.advance(transaction, "completed");
      this.#maybeCrash("completed");
    }
    assertCondition(
      transaction.stage === "completed",
      "INVALID_STATE_TRANSITION",
      "Evaluation transaction did not complete",
    );
    return {
      transaction,
      result: resultObject as unknown as EvaluationResult,
    };
  }

  async #appendResultIdempotently(
    resultObject: Record<string, JsonValue>,
  ): Promise<void> {
    const evaluationResultId = resultObject["evaluationResultId"];
    for (const record of await this.#log.readAll()) {
      const existing = objectValue(record.payload, "persisted evaluation result");
      if (existing["evaluationResultId"] !== evaluationResultId) continue;
      assertCondition(
        sha256(existing) === sha256(resultObject),
        "CONFLICT",
        "Evaluation result ID was reused with different bytes",
      );
      return;
    }
    await this.#log.append(resultObject);
  }

  async #acquireEvaluationHolds(input: {
    transactionId: string;
    parentHarnessVersionId: string;
    candidateHarnessVersionId: string;
  }): Promise<void> {
    if (this.#references === null) return;
    for (const [role, harnessVersionId] of [
      ["parent", input.parentHarnessVersionId],
      ["candidate", input.candidateHarnessVersionId],
    ] as const) {
      await this.#references.acquire({
        holdId: `hold.evaluation.${input.transactionId}.${role}`,
        harnessVersionId,
        holdKind: "pending_evaluation",
        subjectId: input.transactionId,
        signer: this.#operationsSigner,
      });
    }
  }

  async #releaseEvaluationHolds(input: {
    transactionId: string;
    parentHarnessVersionId: string;
    candidateHarnessVersionId: string;
  }): Promise<void> {
    if (this.#references === null) return;
    const active = new Set(
      (await this.#references.activeHolds()).map((hold) => hold.holdId),
    );
    for (const [role, harnessVersionId] of [
      ["parent", input.parentHarnessVersionId],
      ["candidate", input.candidateHarnessVersionId],
    ] as const) {
      const holdId = `hold.evaluation.${input.transactionId}.${role}`;
      if (!active.has(holdId)) continue;
      await this.#references.release({
        holdId,
        harnessVersionId,
        holdKind: "pending_evaluation",
        subjectId: input.transactionId,
        signer: this.#operationsSigner,
      });
    }
  }

  #maybeCrash(stage: EvaluationTransactionStage): void {
    if (this.#crashAfterStage === stage) throw new SimulatedEvaluationCrash(stage);
  }

  public async stop(): Promise<void> {
    const relay = this.#relayChild;
    const evaluator = this.#evaluatorChild;
    this.#relayChild = null;
    this.#evaluatorChild = null;
    this.#reader = null;
    this.#peerCredentials = null;
    if (relay !== null) await stopProcessGroup(relay);
    if (evaluator !== null) await stopProcessGroup(evaluator);
  }

  async #startEmulatedServer(launch: EmulatedEvaluatorLaunch): Promise<void> {
    const keyDirectory = path.join(this.#root, "trust", "evaluator-emulated");
    await mkdir(keyDirectory, { recursive: true, mode: 0o700 });
    const evaluatorPrivate = path.join(keyDirectory, "evaluator-private.pem");
    const operationsPublic = path.join(keyDirectory, "operations-public.pem");
    const configPath = path.join(keyDirectory, "evaluator.json");
    await writeExclusiveOrVerify(
      evaluatorPrivate,
      Buffer.from(launch.evaluatorSigner.exportPrivatePem(), "utf8"),
      0o600,
    );
    await writeExclusiveOrVerify(
      operationsPublic,
      Buffer.from(this.#operationsSigner.exportPublic().publicKeyPem, "utf8"),
      0o600,
    );
    const snapshotMount = this.#candidateSnapshotMount;
    if (snapshotMount !== null) {
      const [rootMetadata, descriptorMetadata] = await Promise.all([
        lstat(snapshotMount.rootPath),
        lstat(snapshotMount.descriptorPath),
      ]);
      assertCondition(
        rootMetadata.isDirectory() &&
          !rootMetadata.isSymbolicLink() &&
          descriptorMetadata.isFile() &&
          !descriptorMetadata.isSymbolicLink() &&
          descriptorMetadata.nlink === 1,
        "AUTHORIZATION_DENIED",
        "Candidate snapshot mount paths are not exact local objects",
      );
      const descriptor = parseStrictJson(
        await readFile(snapshotMount.descriptorPath, "utf8"),
      );
      this.#schemas.validate(
        `${SCHEMA_BASE_URL}filesystem-snapshot.schema.json`,
        descriptor,
      );
      const descriptorObject = objectValue(
        descriptor,
        "candidate filesystem snapshot descriptor",
      );
      const {
        filesystemSnapshotHash: _filesystemSnapshotHash,
        ...descriptorCore
      } = descriptorObject;
      assertCondition(
        descriptorObject["filesystemSnapshotHash"] ===
          snapshotMount.filesystemSnapshotHash &&
          sha256(descriptorCore) === snapshotMount.filesystemSnapshotHash,
        "HASH_MISMATCH",
        "Candidate snapshot mount descriptor hash mismatch",
      );
    }
    const config: JsonValue = {
      evaluatorIdentity: this.#evaluatorPrincipal.identity as unknown as JsonValue,
      evaluatorKeyId: this.#evaluatorPrincipal.keyId,
      operationsIdentity: this.#operationsSigner.identity as unknown as JsonValue,
      operationsKeyId: this.#operationsSigner.keyId,
      protocolId: this.#protocolId,
      candidateFilesystemSnapshotHash:
        snapshotMount?.filesystemSnapshotHash ?? null,
      candidateBundleId: snapshotMount?.bundleId ?? null,
      candidateHarnessVersionId:
        snapshotMount?.candidateHarnessVersionId ?? null,
    };
    await writeExclusiveOrVerify(configPath, canonicalBytes(config), 0o600);
    const socketName = path.basename(this.#endpoint.socketPath);
    const socketDirectory = path.dirname(this.#endpoint.socketPath);
    const args = [
      "--unshare-all",
      "--die-with-parent",
      "--new-session",
      "--ro-bind",
      "/usr",
      "/usr",
      "--ro-bind",
      "/bin",
      "/bin",
      "--ro-bind",
      "/lib",
      "/lib",
      "--ro-bind",
      "/lib64",
      "/lib64",
      "--ro-bind",
      "/etc",
      "/etc",
      "--ro-bind",
      launch.pythonRoot,
      "/opt/python",
      "--ro-bind",
      launch.scriptPath,
      "/evaluator.py",
      "--dir",
      "/run",
      "--dir",
      "/run/keys",
      "--dir",
      "/run/config",
      "--dir",
      "/run/ipc",
      "--bind",
      socketDirectory,
      "/run/ipc",
      "--ro-bind",
      evaluatorPrivate,
      "/run/keys/evaluator-private.pem",
      "--ro-bind",
      operationsPublic,
      "/run/keys/operations-public.pem",
      "--ro-bind",
      configPath,
      "/run/config/evaluator.json",
      ...(snapshotMount === null
        ? []
        : [
            "--ro-bind",
            snapshotMount.rootPath,
            "/candidate-snapshot",
            "--ro-bind",
            snapshotMount.descriptorPath,
            "/run/config/candidate-snapshot.json",
          ]),
      "--proc",
      "/proc",
      "--dev",
      "/dev",
      "--tmpfs",
      "/tmp",
      "--clearenv",
      "--setenv",
      "PATH",
      "/usr/bin:/bin",
      "--setenv",
      "LANG",
      "C.UTF-8",
      "--setenv",
      "LC_ALL",
      "C.UTF-8",
      "--setenv",
      "TZ",
      "UTC",
      "--setenv",
      "PYTHONHASHSEED",
      "0",
      "--setenv",
      "PYTHONDONTWRITEBYTECODE",
      "1",
      "--",
      "/opt/python/bin/python3.13",
      "-I",
      "/evaluator.py",
      "--serve-unix",
      `/run/ipc/${socketName}`,
      "--config",
      "/run/config/evaluator.json",
      "--private-key",
      "/run/keys/evaluator-private.pem",
      "--operations-public-key",
      "/run/keys/operations-public.pem",
      "--protocol-id",
      this.#protocolId,
      "--expected-client-uid",
      String(process.getuid?.() ?? 0),
      "--expected-client-gid",
      String(process.getgid?.() ?? 0),
      "--socket-mode",
      "600",
      ...(snapshotMount === null
        ? []
        : [
            "--candidate-snapshot-root",
            "/candidate-snapshot",
            "--candidate-snapshot-descriptor",
            "/run/config/candidate-snapshot.json",
          ]),
    ];
    const child = spawn("/usr/bin/bwrap", args, {
      detached: true,
      env: {},
      stdio: ["pipe", "pipe", "pipe"],
    });
    child.stderr.on("data", (chunk: Buffer) => {
      if (this.#stderr.length < 64 * 1024) this.#stderr += chunk.toString("utf8");
    });
    this.#evaluatorChild = child;
    await waitForSocket(this.#endpoint.socketPath, child, 5_000);
  }

  async #exchange(payload: Record<string, JsonValue>): Promise<Record<string, JsonValue>> {
    const child = this.#relayChild;
    const reader = this.#reader;
    assertCondition(child !== null && reader !== null, "PEER_CRASHED", "Evaluator not running");
    const messageId = this.#ids.next("wire-message");
    const correlationId = String(payload["requestId"]);
    const nonce = createHash("sha256")
      .update(`${messageId}:${this.#sequence}`)
      .digest("base64url")
      .slice(0, 32);
    const sentAt = this.#clock.now();
    const envelope = createWireEnvelope({
      protocolId: this.#protocolId,
      messageId,
      correlationId,
      causationId: null,
      recipientRole: "evaluator",
      messageType: "evaluator.request",
      sentAt: sentAt.toISOString(),
      expiresAt: new Date(sentAt.getTime() + 5_000).toISOString(),
      senderSequence: this.#sequence,
      nonce,
      payloadSchemaId: EVALUATOR_REQUEST_SCHEMA_ID,
      payload,
      signer: this.#operationsSigner,
      schemas: this.#schemas,
    });
    this.#sequence += 1;
    const frame = encodeWireFrame(envelope);
    await new Promise<void>((resolve, reject) => {
      child.stdin.write(frame, (error) =>
        error === null || error === undefined ? resolve() : reject(error),
      );
    });
    let timer: NodeJS.Timeout | undefined;
    try {
      const response = await Promise.race([
        reader.next(),
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(
            () =>
              reject(
                new HarnessError(
                  "DEADLINE_EXCEEDED",
                  this.#stderr || "Evaluator response timed out",
                ),
              ),
            5_000,
          );
          timer.unref();
        }),
      ]);
      const responseEnvelope = objectValue(
        response,
        "evaluator response",
      ) as unknown as WireEnvelope;
      verifyWireEnvelope(responseEnvelope, {
        schemas: this.#schemas,
        principals: this.#principals,
        replayGuard: this.#responseReplay,
        clock: this.#clock,
        expectedProtocolId: this.#protocolId,
        expectedRecipientRole: "operations_owner",
      });
      assertCondition(
        responseEnvelope.messageType === "evaluator.result" &&
          responseEnvelope.correlationId === correlationId &&
          responseEnvelope.causationId === messageId &&
          responseEnvelope.sender.identityDigest ===
            this.#evaluatorPrincipal.identity.identityDigest,
        "AUTHENTICATION_FAILED",
        "Evaluator response identity or correlation mismatch",
      );
      return objectValue(
        responseEnvelope.payload as unknown as JsonValue,
        "evaluator payload",
      );
    } catch (error) {
      if (error instanceof HarnessError && error.code !== "PEER_CRASHED") throw error;
      throw new HarnessError("PEER_CRASHED", this.#stderr || "Evaluator failed", {
        cause: error,
      });
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }
}
