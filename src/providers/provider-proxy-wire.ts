import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createHash } from "node:crypto";
import { lstat } from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";

import {
  canonicalBytes,
  parseStrictJson,
  type JsonValue,
} from "../core/canonical.js";
import type { Clock, IdFactory } from "../core/determinism.js";
import {
  HarnessError,
  assertCondition,
  type HarnessErrorCode,
} from "../core/errors.js";
import {
  SCHEMA_BASE_URL,
  type SchemaRegistry,
} from "../contracts/schema-registry.js";
import type {
  ModelProvider,
  ModelReasoningEffort,
  ModelRequest,
  ModelResponse,
} from "../domain/model.js";
import type {
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
  PROVIDER_PROXY_RESULT_SCHEMA_ID,
  type ProviderCallReceipt,
  type ProviderProxyEngine,
  type ProviderProxyResult,
  verifyProviderCallReceipt,
} from "./provider-proxy.js";
import {
  modelRequestHash,
  serializableModelRequest,
  type ProviderSmokeManifest,
  type SerializableModelRequest,
} from "./provider-smoke.js";

export const PROVIDER_PROXY_REQUEST_SCHEMA_ID =
  `${SCHEMA_BASE_URL}provider-proxy-request-payload.schema.json`;
export const PROVIDER_PROXY_RESPONSE_SCHEMA_ID =
  `${SCHEMA_BASE_URL}provider-proxy-response-payload.schema.json`;

const MAX_FRAME_BYTES = 1024 * 1024;

export interface ProviderProxyRequestPayload {
  readonly schemaVersion: 1;
  readonly providerSmokeManifestId: string;
  readonly phaseAccountId: string;
  readonly modelRequestHash: string;
  readonly modelRequest: Omit<
    SerializableModelRequest,
    "reasoningEffort"
  > & {
    readonly reasoningEffort: ModelReasoningEffort | null;
  };
}

export interface ProviderProxyResponsePayload {
  readonly schemaVersion: 1;
  readonly providerSmokeManifestId: string;
  readonly phaseAccountId: string;
  readonly providerRequestId: string;
  readonly result: ProviderProxyResult;
}

class FrameReader {
  readonly #iterator: AsyncIterator<string | Buffer>;
  #buffer = Buffer.alloc(0);

  public constructor(stream: NodeJS.ReadableStream) {
    this.#iterator = (
      stream as NodeJS.ReadableStream &
        AsyncIterable<string | Buffer>
    )[Symbol.asyncIterator]();
  }

  public async next(): Promise<JsonValue> {
    const header = await this.#readExactly(4);
    const length = header.readUInt32BE(0);
    assertCondition(
      length >= 2 && length <= MAX_FRAME_BYTES,
      "PAYLOAD_TOO_LARGE",
      "Provider wire frame size is invalid",
    );
    const body = await this.#readExactly(length);
    const value = parseStrictJson(body.toString("utf8"));
    assertCondition(
      Buffer.compare(body, canonicalBytes(value)) === 0,
      "SCHEMA_INVALID",
      "Provider wire frame is not canonical JSON",
    );
    return value;
  }

  async #readExactly(size: number): Promise<Buffer> {
    while (this.#buffer.byteLength < size) {
      const next = await this.#iterator.next();
      assertCondition(
        !next.done,
        "PEER_CRASHED",
        "Provider wire peer closed its output",
      );
      this.#buffer = Buffer.concat([
        this.#buffer,
        Buffer.from(next.value),
      ]);
    }
    const result = this.#buffer.subarray(0, size);
    this.#buffer = this.#buffer.subarray(size);
    return result;
  }
}

function asObject(
  value: JsonValue,
  label: string,
): Record<string, JsonValue> {
  assertCondition(
    typeof value === "object" &&
      value !== null &&
      !Array.isArray(value),
    "SCHEMA_INVALID",
    `${label} is not an object`,
  );
  return value;
}

function requestPayload(input: {
  readonly manifest: ProviderSmokeManifest;
  readonly phaseAccountId: string;
  readonly request: ModelRequest;
}): ProviderProxyRequestPayload {
  return {
    schemaVersion: 1,
    providerSmokeManifestId:
      input.manifest.providerSmokeManifestId,
    phaseAccountId: input.phaseAccountId,
    modelRequestHash: modelRequestHash(input.request),
    modelRequest: {
      ...serializableModelRequest(input.request),
      reasoningEffort: input.request.reasoningEffort ?? null,
    },
  };
}

function modelRequestFromPayload(
  payload: ProviderProxyRequestPayload,
): ModelRequest {
  const {
    reasoningEffort,
    ...request
  } = payload.modelRequest;
  return {
    ...request,
    ...(reasoningEffort === null ? {} : { reasoningEffort }),
  };
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
    const onData = (chunk: Buffer | string): void => {
      buffer += Buffer.from(chunk).toString("ascii");
      if (buffer.length > 256) {
        cleanup();
        reject(
          new HarnessError(
            "PAYLOAD_TOO_LARGE",
            "Provider readiness line is too large",
          ),
        );
        return;
      }
      const newline = buffer.indexOf("\n");
      if (newline >= 0) {
        cleanup();
        resolve(buffer.slice(0, newline));
      }
    };
    const onEnd = (): void => {
      cleanup();
      reject(
        new HarnessError(
          "PEER_CRASHED",
          "Provider relay closed before readiness",
        ),
      );
    };
    const onError = (error: Error): void => {
      cleanup();
      reject(error);
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(
        new HarnessError(
          "DEADLINE_EXCEEDED",
          "Provider relay readiness timed out",
        ),
      );
    }, timeoutMillis);
    timer.unref();
    stream.on("data", onData);
    stream.on("end", onEnd);
    stream.on("error", onError);
  });
}

async function stopProcessGroup(
  child: ChildProcessWithoutNullStreams,
): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise<void>((resolve) =>
    child.once("close", () => resolve()),
  );
  if (!child.stdin.destroyed) child.stdin.end();
  if (
    (await Promise.race([
      exited.then(() => true),
      delay(300).then(() => false),
    ])) === true
  ) {
    return;
  }
  if (child.pid !== undefined) {
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch {
      // The relay already exited.
    }
  }
  if (
    (await Promise.race([
      exited.then(() => true),
      delay(500).then(() => false),
    ])) === true
  ) {
    return;
  }
  if (child.pid !== undefined) {
    try {
      process.kill(-child.pid, "SIGKILL");
    } catch {
      // The relay already exited.
    }
  }
  await exited;
}

export interface UnixProviderProxyEndpoint {
  readonly socketPath: string;
  readonly expectedProviderUid: number;
  readonly expectedProviderGid: number;
  readonly pythonExecutable: string;
  readonly relayScriptPath: string;
}

export interface ProviderPeerCredentials {
  readonly pid: number;
  readonly uid: number;
  readonly gid: number;
}

export class UnixProviderProxyClient implements ModelProvider {
  public readonly providerId: string;
  readonly #protocolId: string;
  readonly #manifest: ProviderSmokeManifest;
  readonly #phaseAccountId: string;
  readonly #endpoint: UnixProviderProxyEndpoint;
  readonly #schemas: SchemaRegistry;
  readonly #runtimeSigner: PrincipalSigner;
  readonly #providerPrincipal: PublicPrincipal;
  readonly #principals: PrincipalRegistry;
  readonly #clock: Clock;
  readonly #ids: IdFactory;
  #relay: ChildProcessWithoutNullStreams | null = null;
  #reader: FrameReader | null = null;
  #replay = new ReplayGuard();
  #sequence = 0;
  #stderr = "";
  #lastReceipt: ProviderCallReceipt | null = null;
  #peer: ProviderPeerCredentials | null = null;

  public constructor(input: {
    readonly protocolId: string;
    readonly manifest: ProviderSmokeManifest;
    readonly phaseAccountId: string;
    readonly endpoint: UnixProviderProxyEndpoint;
    readonly schemas: SchemaRegistry;
    readonly runtimeSigner: PrincipalSigner;
    readonly providerPrincipal: PublicPrincipal;
    readonly principals: PrincipalRegistry;
    readonly clock: Clock;
    readonly ids: IdFactory;
  }) {
    assertCondition(
      input.runtimeSigner.identity.role === "runtime" &&
        (input.providerPrincipal.identity.role ===
          "model_provider_proxy" ||
          input.providerPrincipal.identity.role ===
            "fake_provider"),
      "AUTHORIZATION_DENIED",
      "Provider wire client identities have invalid roles",
    );
    this.providerId = input.manifest.provider.providerId;
    this.#protocolId = input.protocolId;
    this.#manifest = input.manifest;
    this.#phaseAccountId = input.phaseAccountId;
    this.#endpoint = {
      ...input.endpoint,
      socketPath: path.resolve(input.endpoint.socketPath),
      pythonExecutable: path.resolve(
        input.endpoint.pythonExecutable,
      ),
      relayScriptPath: path.resolve(
        input.endpoint.relayScriptPath,
      ),
    };
    this.#schemas = input.schemas;
    this.#runtimeSigner = input.runtimeSigner;
    this.#providerPrincipal = input.providerPrincipal;
    this.#principals = input.principals;
    this.#clock = input.clock;
    this.#ids = input.ids;
  }

  public get lastReceipt(): ProviderCallReceipt | null {
    return this.#lastReceipt;
  }

  public get peerCredentials(): ProviderPeerCredentials | null {
    return this.#peer === null ? null : { ...this.#peer };
  }

  public async start(): Promise<void> {
    assertCondition(
      this.#relay === null,
      "CONFLICT",
      "Provider wire client is already started",
    );
    const metadata = await lstat(this.#endpoint.socketPath);
    assertCondition(
      metadata.isSocket(),
      "AUTHENTICATION_FAILED",
      "Provider endpoint is not a Unix socket",
    );
    this.#sequence = 0;
    this.#replay = new ReplayGuard();
    this.#stderr = "";
    this.#peer = null;
    const relay = spawn(
      this.#endpoint.pythonExecutable,
      [
        "-I",
        this.#endpoint.relayScriptPath,
        "--socket",
        this.#endpoint.socketPath,
        "--expected-server-uid",
        String(this.#endpoint.expectedProviderUid),
        "--expected-server-gid",
        String(this.#endpoint.expectedProviderGid),
        "--ready-fd",
        "3",
        "--timeout-millis",
        String(this.#manifest.caps.wallClockMillis + 2_000),
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
      if (this.#stderr.length < 64 * 1024) {
        this.#stderr += chunk.toString("utf8");
      }
    });
    this.#relay = relay;
    this.#reader = new FrameReader(relay.stdout);
    try {
      const readyStream = relay.stdio[3] as
        | NodeJS.ReadableStream
        | null
        | undefined;
      assertCondition(
        readyStream !== null && readyStream !== undefined,
        "PEER_CRASHED",
        "Provider readiness pipe is unavailable",
      );
      const ready = await readReadyLine(readyStream, 5_000);
      const match =
        /^READY ([0-9]+) ([0-9]+) ([0-9]+)$/u.exec(ready);
      assertCondition(
        match !== null &&
          Number(match[2]) ===
            this.#endpoint.expectedProviderUid &&
          Number(match[3]) ===
            this.#endpoint.expectedProviderGid,
        "AUTHENTICATION_FAILED",
        "Provider relay returned invalid peer credentials",
      );
      this.#peer = {
        pid: Number(match[1]),
        uid: Number(match[2]),
        gid: Number(match[3]),
      };
    } catch (error) {
      await this.stop();
      throw error;
    }
  }

  public async generate(
    request: ModelRequest,
  ): Promise<ModelResponse> {
    const result = await this.executeWithReceipt(request);
    if (
      result.receipt.status !== "completed" ||
      result.response === null
    ) {
      const failure = result.receipt.error;
      throw new HarnessError(
        (failure?.code ?? "INTERNAL_ERROR") as HarnessErrorCode,
        failure?.safeDetail ??
          "Provider proxy did not release a response",
        { retryable: failure?.retryable ?? false },
      );
    }
    return result.response;
  }

  public async executeWithReceipt(
    request: ModelRequest,
  ): Promise<ProviderProxyResult> {
    const relay = this.#relay;
    const reader = this.#reader;
    assertCondition(
      relay !== null && reader !== null,
      "PEER_CRASHED",
      "Provider wire client is not started",
    );
    const payload = requestPayload({
      manifest: this.#manifest,
      phaseAccountId: this.#phaseAccountId,
      request,
    });
    this.#schemas.validate(
      PROVIDER_PROXY_REQUEST_SCHEMA_ID,
      payload as unknown as JsonValue,
    );
    const messageId = this.#ids.next("wire-message");
    const nonce = createHash("sha256")
      .update(`${messageId}:${this.#sequence}`)
      .digest("base64url")
      .slice(0, 32);
    const sentAt = this.#clock.now();
    const envelope = createWireEnvelope({
      protocolId: this.#protocolId,
      messageId,
      correlationId: request.requestId,
      causationId: null,
      recipientRole:
        this.#providerPrincipal.identity.role,
      messageType: "provider.request",
      sentAt: sentAt.toISOString(),
      expiresAt: new Date(
        sentAt.getTime() +
          this.#manifest.caps.wallClockMillis +
          2_000,
      ).toISOString(),
      senderSequence: this.#sequence,
      nonce,
      payloadSchemaId: PROVIDER_PROXY_REQUEST_SCHEMA_ID,
      payload: payload as unknown as Record<
        string,
        JsonValue
      >,
      signer: this.#runtimeSigner,
      schemas: this.#schemas,
    });
    this.#sequence += 1;
    await new Promise<void>((resolve, reject) => {
      relay.stdin.write(encodeWireFrame(envelope), (error) =>
        error === null || error === undefined
          ? resolve()
          : reject(error),
      );
    });
    let timer: NodeJS.Timeout | undefined;
    const responseValue = await Promise.race([
      reader.next(),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () =>
            reject(
              new HarnessError(
                "DEADLINE_EXCEEDED",
                this.#stderr ||
                  "Provider proxy response timed out",
              ),
            ),
          this.#manifest.caps.wallClockMillis + 2_000,
        );
        timer.unref();
      }),
      ...(request.abortSignal === undefined
        ? []
        : [
            new Promise<never>((_resolve, reject) => {
              request.abortSignal!.addEventListener(
                "abort",
                () =>
                  reject(
                    new HarnessError(
                      "DEADLINE_EXCEEDED",
                      "Provider proxy request was cancelled",
                    ),
                  ),
                { once: true },
              );
            }),
          ]),
    ]).finally(() => {
      if (timer !== undefined) clearTimeout(timer);
    });
    const responseEnvelope = asObject(
      responseValue,
      "provider response envelope",
    ) as unknown as WireEnvelope;
    verifyWireEnvelope(responseEnvelope, {
      schemas: this.#schemas,
      principals: this.#principals,
      replayGuard: this.#replay,
      clock: this.#clock,
      expectedProtocolId: this.#protocolId,
      expectedRecipientRole: "runtime",
    });
    assertCondition(
      responseEnvelope.messageType === "provider.response" &&
        responseEnvelope.correlationId === request.requestId &&
        responseEnvelope.causationId === messageId &&
        responseEnvelope.sender.identityDigest ===
          this.#providerPrincipal.identity.identityDigest,
      "AUTHENTICATION_FAILED",
      "Provider response identity or correlation mismatch",
    );
    const responsePayload = responseEnvelope.payload as unknown as
      ProviderProxyResponsePayload;
    this.#schemas.validate(
      PROVIDER_PROXY_RESPONSE_SCHEMA_ID,
      responsePayload as unknown as JsonValue,
    );
    assertCondition(
      responsePayload.providerSmokeManifestId ===
          this.#manifest.providerSmokeManifestId &&
        responsePayload.phaseAccountId ===
          this.#phaseAccountId &&
        responsePayload.providerRequestId === request.requestId,
      "PROTOCOL_MISMATCH",
      "Provider response payload pins do not match",
    );
    verifyProviderCallReceipt({
      receipt: responsePayload.result.receipt,
      manifest: this.#manifest,
      expectedPhaseAccountId: this.#phaseAccountId,
      schemas: this.#schemas,
      principals: this.#principals,
    });
    this.#schemas.validate(
      PROVIDER_PROXY_RESULT_SCHEMA_ID,
      responsePayload.result as unknown as JsonValue,
    );
    this.#lastReceipt = responsePayload.result.receipt;
    return responsePayload.result;
  }

  public async stop(): Promise<void> {
    const relay = this.#relay;
    this.#relay = null;
    this.#reader = null;
    this.#peer = null;
    if (relay !== null) await stopProcessGroup(relay);
  }
}

export class ProviderProxyStdioServer {
  readonly #protocolId: string;
  readonly #manifest: ProviderSmokeManifest;
  readonly #phaseAccountId: string;
  readonly #engine: ProviderProxyEngine;
  readonly #schemas: SchemaRegistry;
  readonly #proxySigner: PrincipalSigner;
  readonly #runtimePrincipal: PublicPrincipal;
  readonly #principals: PrincipalRegistry;
  readonly #clock: Clock;
  readonly #ids: IdFactory;
  #replay = new ReplayGuard();
  #sequence = 0;

  public constructor(input: {
    readonly protocolId: string;
    readonly manifest: ProviderSmokeManifest;
    readonly phaseAccountId: string;
    readonly engine: ProviderProxyEngine;
    readonly schemas: SchemaRegistry;
    readonly proxySigner: PrincipalSigner;
    readonly runtimePrincipal: PublicPrincipal;
    readonly principals: PrincipalRegistry;
    readonly clock: Clock;
    readonly ids: IdFactory;
  }) {
    this.#protocolId = input.protocolId;
    this.#manifest = input.manifest;
    this.#phaseAccountId = input.phaseAccountId;
    this.#engine = input.engine;
    this.#schemas = input.schemas;
    this.#proxySigner = input.proxySigner;
    this.#runtimePrincipal = input.runtimePrincipal;
    this.#principals = input.principals;
    this.#clock = input.clock;
    this.#ids = input.ids;
  }

  public async serve(
    input: NodeJS.ReadableStream = process.stdin,
    output: NodeJS.WritableStream = process.stdout,
  ): Promise<void> {
    const reader = new FrameReader(input);
    const value = await reader.next();
    const envelope = asObject(
      value,
      "provider request envelope",
    ) as unknown as WireEnvelope;
    verifyWireEnvelope(envelope, {
      schemas: this.#schemas,
      principals: this.#principals,
      replayGuard: this.#replay,
      clock: this.#clock,
      expectedProtocolId: this.#protocolId,
      expectedRecipientRole:
        this.#proxySigner.identity.role,
    });
    assertCondition(
      envelope.messageType === "provider.request" &&
        envelope.sender.identityDigest ===
          this.#runtimePrincipal.identity.identityDigest,
      "AUTHENTICATION_FAILED",
      "Provider request sender identity mismatch",
    );
    const payload = envelope.payload as unknown as
      ProviderProxyRequestPayload;
    this.#schemas.validate(
      PROVIDER_PROXY_REQUEST_SCHEMA_ID,
      payload as unknown as JsonValue,
    );
    assertCondition(
      payload.providerSmokeManifestId ===
          this.#manifest.providerSmokeManifestId &&
        payload.phaseAccountId === this.#phaseAccountId &&
        payload.modelRequestHash ===
          this.#manifest.modelRequestHash,
      "PROTOCOL_MISMATCH",
      "Provider request payload pins do not match",
    );
    const request = modelRequestFromPayload(payload);
    assertCondition(
      payload.modelRequestHash === modelRequestHash(request),
      "HASH_MISMATCH",
      "Provider request hash does not recompute",
    );
    const result = await this.#engine.execute(request);
    const responsePayload: ProviderProxyResponsePayload = {
      schemaVersion: 1,
      providerSmokeManifestId:
        this.#manifest.providerSmokeManifestId,
      phaseAccountId: this.#phaseAccountId,
      providerRequestId: request.requestId,
      result,
    };
    this.#schemas.validate(
      PROVIDER_PROXY_RESPONSE_SCHEMA_ID,
      responsePayload as unknown as JsonValue,
    );
    const sentAt = this.#clock.now();
    const messageId = this.#ids.next("wire-message");
    const response = createWireEnvelope({
      protocolId: this.#protocolId,
      messageId,
      correlationId: request.requestId,
      causationId: envelope.messageId,
      recipientRole: "runtime",
      messageType: "provider.response",
      sentAt: sentAt.toISOString(),
      expiresAt: new Date(
        sentAt.getTime() +
          this.#manifest.caps.wallClockMillis +
          2_000,
      ).toISOString(),
      senderSequence: this.#sequence,
      nonce: createHash("sha256")
        .update(`${messageId}:${this.#sequence}`)
        .digest("base64url")
        .slice(0, 32),
      payloadSchemaId: PROVIDER_PROXY_RESPONSE_SCHEMA_ID,
      payload: responsePayload as unknown as Record<
        string,
        JsonValue
      >,
      result: { status: "ok", error: null },
      signer: this.#proxySigner,
      schemas: this.#schemas,
    });
    this.#sequence += 1;
    await new Promise<void>((resolve, reject) => {
      output.write(encodeWireFrame(response), (error) =>
        error === null || error === undefined
          ? resolve()
          : reject(error),
      );
    });
  }
}
