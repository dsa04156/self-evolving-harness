import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { constants } from "node:fs";
import { mkdir, open } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";

import {
  canonicalBytes,
  parseStrictJson,
  sha256,
  type JsonValue,
} from "../core/canonical.js";
import type { Clock, IdFactory } from "../core/determinism.js";
import { HarnessError, assertCondition } from "../core/errors.js";
import { SCHEMA_BASE_URL, type SchemaRegistry } from "../contracts/schema-registry.js";
import { type AuditLink, AuditTrail } from "../evidence/audit-trail.js";
import { AppendOnlyLog } from "../storage/append-only-log.js";
import type {
  Attestation,
  PrincipalIdentity,
  PrincipalRegistry,
  PrincipalSigner,
} from "../trust/identity.js";

export const EVALUATION_RESULT_SCHEMA_ID = `${SCHEMA_BASE_URL}evaluation-result.schema.json`;
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
  readonly evaluationResultId: string;
  readonly protocolId: string;
  readonly parentHarnessVersionId: string;
  readonly candidateHarnessVersionId: string;
  readonly aggregate: {
    readonly taskCount: number;
    readonly parentPassRateMicros: number;
    readonly candidatePassRateMicros: number;
    readonly deltaPercentagePointMicros: number;
    readonly passToFailCount: number;
    readonly failToPassCount: number;
    readonly pairedCi95LowerPercentagePointMicros: number;
    readonly pairedCi95UpperPercentagePointMicros: number;
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

export class ExternalEvaluatorClient {
  readonly #root: string;
  readonly #protocolId: string;
  readonly #pythonRoot: string;
  readonly #scriptPath: string;
  readonly #schemas: SchemaRegistry;
  readonly #audit: AuditTrail;
  readonly #operationsSigner: PrincipalSigner;
  readonly #evaluatorSigner: PrincipalSigner;
  readonly #principals: PrincipalRegistry;
  readonly #clock: Clock;
  readonly #ids: IdFactory;
  readonly #log: AppendOnlyLog<JsonValue>;
  #child: ChildProcessWithoutNullStreams | null = null;
  #reader: FrameReader | null = null;
  #sequence = 0;
  #stderr = "";

  public constructor(input: {
    root: string;
    protocolId: string;
    pythonRoot: string;
    scriptPath: string;
    schemas: SchemaRegistry;
    audit: AuditTrail;
    operationsSigner: PrincipalSigner;
    evaluatorSigner: PrincipalSigner;
    principals: PrincipalRegistry;
    clock: Clock;
    ids: IdFactory;
  }) {
    assertCondition(
      input.operationsSigner.identity.role === "operations_owner" &&
        input.evaluatorSigner.identity.role === "evaluator",
      "AUTHORIZATION_DENIED",
      "Evaluator client identities have invalid roles",
    );
    this.#root = path.resolve(input.root);
    this.#protocolId = input.protocolId;
    this.#pythonRoot = path.resolve(input.pythonRoot);
    this.#scriptPath = path.resolve(input.scriptPath);
    this.#schemas = input.schemas;
    this.#audit = input.audit;
    this.#operationsSigner = input.operationsSigner;
    this.#evaluatorSigner = input.evaluatorSigner;
    this.#principals = input.principals;
    this.#clock = input.clock;
    this.#ids = input.ids;
    this.#log = new AppendOnlyLog<JsonValue>(
      path.join(input.root, "evolution"),
      "evaluation.results",
    );
  }

  public async start(): Promise<void> {
    assertCondition(this.#child === null, "CONFLICT", "Evaluator is already running");
    const keyDirectory = path.join(this.#root, "trust", "evaluator");
    await mkdir(keyDirectory, { recursive: true, mode: 0o700 });
    const evaluatorPrivate = path.join(keyDirectory, "evaluator-private.pem");
    const operationsPublic = path.join(keyDirectory, "operations-public.pem");
    const configPath = path.join(keyDirectory, "evaluator.json");
    await writeExclusive(
      evaluatorPrivate,
      Buffer.from(this.#evaluatorSigner.exportPrivatePem(), "utf8"),
      0o600,
    );
    await writeExclusive(
      operationsPublic,
      Buffer.from(this.#operationsSigner.exportPublic().publicKeyPem, "utf8"),
      0o600,
    );
    const config: JsonValue = {
      evaluatorIdentity: this.#evaluatorSigner.identity as unknown as JsonValue,
      evaluatorKeyId: this.#evaluatorSigner.keyId,
      operationsIdentity: this.#operationsSigner.identity as unknown as JsonValue,
      operationsKeyId: this.#operationsSigner.keyId,
      protocolId: this.#protocolId,
    };
    await writeExclusive(configPath, canonicalBytes(config), 0o600);

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
      this.#pythonRoot,
      "/opt/python",
      "--ro-bind",
      this.#scriptPath,
      "/evaluator.py",
      "--dir",
      "/run",
      "--dir",
      "/run/keys",
      "--dir",
      "/run/config",
      "--ro-bind",
      evaluatorPrivate,
      "/run/keys/evaluator-private.pem",
      "--ro-bind",
      operationsPublic,
      "/run/keys/operations-public.pem",
      "--ro-bind",
      configPath,
      "/run/config/evaluator.json",
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
    ];
    const child = spawn("/usr/bin/bwrap", args, {
      detached: true,
      env: {},
      stdio: ["pipe", "pipe", "pipe"],
    });
    child.stderr.on("data", (chunk: Buffer) => {
      if (this.#stderr.length < 64 * 1024) this.#stderr += chunk.toString("utf8");
    });
    this.#child = child;
    this.#reader = new FrameReader(child.stdout);
  }

  public async evaluate(input: ExternalEvaluationInput): Promise<EvaluationResult> {
    assertCondition(this.#child !== null && this.#reader !== null, "PEER_CRASHED", "Not started");
    const evaluationResultId = this.#ids.next("evaluation-result");
    const requestId = this.#ids.next("evaluation-request");
    const proposed = await this.#exchange({
      schemaVersion: 1,
      type: "evaluate",
      requestId,
      protocolId: this.#protocolId,
      evaluationResultId,
      datasetRole: "deterministic",
      phase: "deterministic",
      methodId: input.methodId,
      parentHarnessVersionId: input.parentHarnessVersionId,
      candidateHarnessVersionId: input.candidateHarnessVersionId,
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
    } as unknown as Record<string, JsonValue>);
    assertCondition(
      proposed["type"] === "evaluation_proposed" &&
        proposed["requestId"] === requestId &&
        proposed["evaluator"] !== undefined,
      "SCHEMA_INVALID",
      "Unexpected evaluator proposal",
    );
    this.#verifyOuterResponse(proposed);
    const core = objectValue(proposed["core"]!, "evaluation core");
    const coreHash = proposed["coreHash"];
    assertCondition(
      typeof coreHash === "string" && coreHash === sha256(core),
      "HASH_MISMATCH",
      "Evaluator core hash mismatch",
    );
    const auditLink = await this.#audit.appendSubject({
      subjectType: "EvaluationResult",
      subjectId: evaluationResultId,
      subjectHash: coreHash,
    });
    const finalized = await this.#exchange({
      schemaVersion: 1,
      type: "finalize",
      requestId,
      protocolId: this.#protocolId,
      coreHash,
      auditLink,
    } as unknown as Record<string, JsonValue>);
    assertCondition(
      finalized["type"] === "evaluation_final" && finalized["requestId"] === requestId,
      "SCHEMA_INVALID",
      "Unexpected evaluator final response",
    );
    this.#verifyOuterResponse(finalized);
    const resultObject = objectValue(finalized["result"]!, "evaluation result");
    this.#schemas.validate(EVALUATION_RESULT_SCHEMA_ID, resultObject);
    assertCondition(
      resultObject["evaluationResultId"] === evaluationResultId &&
        resultObject["protocolId"] === this.#protocolId &&
        resultObject["parentHarnessVersionId"] === input.parentHarnessVersionId &&
        resultObject["candidateHarnessVersionId"] === input.candidateHarnessVersionId,
      "PROTOCOL_MISMATCH",
      "Evaluation result pins changed",
    );
    const attestation = objectValue(resultObject["attestation"]!, "result attestation");
    const { attestation: _attestation, auditLink: _auditLink, ...resultCore } = resultObject;
    assertCondition(sha256(resultCore) === coreHash, "HASH_MISMATCH", "Evaluation core changed");
    const { attestation: _removed, ...signedBody } = resultObject;
    this.#principals.verify(
      this.#evaluatorSigner.identity,
      signedBody,
      attestation as unknown as Attestation,
    );
    await this.#audit.verifyLink(auditLink, {
      subjectType: "EvaluationResult",
      subjectId: evaluationResultId,
      subjectHash: coreHash,
    });
    await this.#log.append(resultObject);
    return resultObject as unknown as EvaluationResult;
  }

  public async stop(): Promise<void> {
    const child = this.#child;
    this.#child = null;
    this.#reader = null;
    if (child === null) return;
    if (child.exitCode !== null || child.signalCode !== null) return;
    child.stdin.end();
    const exited = new Promise<void>((resolve) => child.once("close", () => resolve()));
    const timer = setTimeout(() => {
      if (child.pid !== undefined) {
        try {
          process.kill(-child.pid, "SIGKILL");
        } catch {
          // The process already exited.
        }
      }
    }, 2_000);
    timer.unref();
    await exited;
    clearTimeout(timer);
  }

  async #exchange(body: Record<string, JsonValue>): Promise<Record<string, JsonValue>> {
    const child = this.#child;
    const reader = this.#reader;
    assertCondition(child !== null && reader !== null, "PEER_CRASHED", "Evaluator not running");
    const nonce = createHash("sha256")
      .update(`${body["requestId"] ?? "request"}:${this.#sequence}`)
      .digest("base64url")
      .slice(0, 32);
    const unsigned: Record<string, JsonValue> = {
      ...body,
      sender: this.#operationsSigner.identity as unknown as JsonValue,
      senderSequence: this.#sequence,
      nonce,
    };
    this.#sequence += 1;
    const message: Record<string, JsonValue> = {
      ...unsigned,
      attestation: this.#operationsSigner.attest(unsigned) as unknown as JsonValue,
    };
    const bytes = canonicalBytes(message);
    assertCondition(bytes.byteLength <= MAX_FRAME_BYTES, "PAYLOAD_TOO_LARGE", "Request too large");
    const frame = Buffer.allocUnsafe(bytes.byteLength + 4);
    frame.writeUInt32BE(bytes.byteLength, 0);
    bytes.copy(frame, 4);
    await new Promise<void>((resolve, reject) => {
      child.stdin.write(frame, (error) =>
        error === null || error === undefined ? resolve() : reject(error),
      );
    });
    try {
      const response = await Promise.race([
        reader.next(),
        new Promise<never>((_resolve, reject) => {
          const timer = setTimeout(
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
      return objectValue(response, "evaluator response");
    } catch (error) {
      throw new HarnessError("PEER_CRASHED", this.#stderr || "Evaluator failed", {
        cause: error,
      });
    }
  }

  #verifyOuterResponse(response: Record<string, JsonValue>): void {
    const evaluator = response["evaluator"];
    const attestation = response["attestation"];
    assertCondition(
      evaluator !== undefined && attestation !== undefined,
      "AUTHENTICATION_FAILED",
      "Evaluator response is unsigned",
    );
    this.#principals.verify(
      evaluator as unknown as PrincipalIdentity,
      withoutAttestation(response),
      attestation as unknown as Attestation,
    );
  }
}
