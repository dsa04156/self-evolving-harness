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
import { HarnessError, assertCondition } from "../core/errors.js";
import {
  SCHEMA_BASE_URL,
  type SchemaRegistry,
} from "../contracts/schema-registry.js";
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
import type { AuditLedger, AuditLink } from "./audit-trail.js";

export const AUDIT_REQUEST_SCHEMA_ID =
  `${SCHEMA_BASE_URL}audit-request-payload.schema.json`;
export const AUDIT_RESPONSE_SCHEMA_ID =
  `${SCHEMA_BASE_URL}audit-response-payload.schema.json`;

const MAX_FRAME_BYTES = 1024 * 1024;

export interface UnixAuditEndpoint {
  readonly socketPath: string;
  readonly expectedAuditUid: number;
  readonly expectedAuditGid: number;
  readonly pythonExecutable: string;
  readonly relayScriptPath: string;
}

export interface AuditPeerCredentials {
  readonly pid: number;
  readonly uid: number;
  readonly gid: number;
}

class FrameReader {
  readonly #iterator: AsyncIterator<string | Buffer>;
  #buffer = Buffer.alloc(0);

  public constructor(stream: NodeJS.ReadableStream) {
    this.#iterator = (
      stream as NodeJS.ReadableStream & AsyncIterable<string | Buffer>
    )[Symbol.asyncIterator]();
  }

  public async next(): Promise<JsonValue> {
    const header = await this.#readExactly(4);
    const length = header.readUInt32BE(0);
    assertCondition(
      length >= 2 && length <= MAX_FRAME_BYTES,
      "PAYLOAD_TOO_LARGE",
      "Audit response frame size is invalid",
    );
    const body = await this.#readExactly(length);
    const value = parseStrictJson(body.toString("utf8"));
    assertCondition(
      Buffer.compare(body, canonicalBytes(value)) === 0,
      "SCHEMA_INVALID",
      "Audit response is not canonical JSON",
    );
    return value;
  }

  async #readExactly(size: number): Promise<Buffer> {
    while (this.#buffer.byteLength < size) {
      const next = await this.#iterator.next();
      assertCondition(!next.done, "PEER_CRASHED", "Audit relay closed its output");
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
        reject(new HarnessError("PAYLOAD_TOO_LARGE", "Audit readiness line is too large"));
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
      reject(new HarnessError("PEER_CRASHED", "Audit relay closed before readiness"));
    };
    const onError = (error: Error): void => {
      cleanup();
      reject(error);
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new HarnessError("DEADLINE_EXCEEDED", "Audit relay readiness timed out"));
    }, timeoutMillis);
    timer.unref();
    stream.on("data", onData);
    stream.on("end", onEnd);
    stream.on("error", onError);
  });
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
      // The relay already exited.
    }
  }
  if ((await Promise.race([exited.then(() => true), delay(500).then(() => false)])) === true) {
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

export class UnixAuditClient implements AuditLedger {
  readonly #protocolId: string;
  readonly #endpoint: UnixAuditEndpoint;
  readonly #schemas: SchemaRegistry;
  readonly #operationsSigner: PrincipalSigner;
  readonly #auditPrincipal: PublicPrincipal;
  readonly #principals: PrincipalRegistry;
  readonly #clock: Clock;
  readonly #ids: IdFactory;
  #relay: ChildProcessWithoutNullStreams | null = null;
  #reader: FrameReader | null = null;
  #replay = new ReplayGuard();
  #peer: AuditPeerCredentials | null = null;
  #sequence = 0;
  #stderr = "";

  public constructor(input: {
    protocolId: string;
    endpoint: UnixAuditEndpoint;
    schemas: SchemaRegistry;
    operationsSigner: PrincipalSigner;
    auditPrincipal: PublicPrincipal;
    principals: PrincipalRegistry;
    clock: Clock;
    ids: IdFactory;
  }) {
    assertCondition(
      input.operationsSigner.identity.role === "operations_owner" &&
        input.auditPrincipal.identity.role === "audit_store",
      "AUTHORIZATION_DENIED",
      "Unix audit client identities have invalid roles",
    );
    this.#protocolId = input.protocolId;
    this.#endpoint = {
      ...input.endpoint,
      socketPath: path.resolve(input.endpoint.socketPath),
      pythonExecutable: path.resolve(input.endpoint.pythonExecutable),
      relayScriptPath: path.resolve(input.endpoint.relayScriptPath),
    };
    this.#schemas = input.schemas;
    this.#operationsSigner = input.operationsSigner;
    this.#auditPrincipal = input.auditPrincipal;
    this.#principals = input.principals;
    this.#clock = input.clock;
    this.#ids = input.ids;
  }

  public get peerCredentials(): AuditPeerCredentials | null {
    return this.#peer === null ? null : { ...this.#peer };
  }

  public async start(): Promise<void> {
    assertCondition(this.#relay === null, "CONFLICT", "Audit client is already started");
    this.#sequence = 0;
    this.#replay = new ReplayGuard();
    this.#peer = null;
    this.#stderr = "";
    try {
      const metadata = await lstat(this.#endpoint.socketPath);
      assertCondition(metadata.isSocket(), "AUTHENTICATION_FAILED", "Audit endpoint is not a socket");
      const relay = spawn(
        this.#endpoint.pythonExecutable,
        [
          "-I",
          this.#endpoint.relayScriptPath,
          "--socket",
          this.#endpoint.socketPath,
          "--expected-server-uid",
          String(this.#endpoint.expectedAuditUid),
          "--expected-server-gid",
          String(this.#endpoint.expectedAuditGid),
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
      this.#relay = relay;
      this.#reader = new FrameReader(relay.stdout);
      const readyStream = relay.stdio[3] as NodeJS.ReadableStream | null | undefined;
      assertCondition(readyStream !== null && readyStream !== undefined, "PEER_CRASHED", "Audit readiness pipe is unavailable");
      const ready = await readReadyLine(readyStream, 5_000);
      const match = /^READY ([0-9]+) ([0-9]+) ([0-9]+)$/u.exec(ready);
      assertCondition(match !== null, "AUTHENTICATION_FAILED", "Malformed audit readiness proof");
      const peer = {
        pid: Number(match[1]),
        uid: Number(match[2]),
        gid: Number(match[3]),
      };
      assertCondition(
        peer.uid === this.#endpoint.expectedAuditUid &&
          peer.gid === this.#endpoint.expectedAuditGid,
        "AUTHENTICATION_FAILED",
        "Audit relay reported unexpected peer credentials",
      );
      this.#peer = peer;
    } catch (error) {
      await this.stop();
      throw error;
    }
  }

  public async appendSubject(input: {
    subjectType: string;
    subjectId: string;
    subjectHash: string;
  }): Promise<AuditLink> {
    const requestId = this.#ids.next("audit-request");
    const response = await this.#exchange({
      schemaVersion: 1,
      operation: "append_subject",
      requestId,
      ...input,
    });
    assertCondition(
      response["operation"] === "audit_link" &&
        response["requestId"] === requestId,
      "SCHEMA_INVALID",
      "Audit service returned an unexpected append response",
    );
    return objectValue(response["link"]!, "audit link") as unknown as AuditLink;
  }

  public async verifyLink(
    link: AuditLink,
    expected: { subjectType: string; subjectId: string; subjectHash: string },
  ): Promise<void> {
    const requestId = this.#ids.next("audit-request");
    const response = await this.#exchange({
      schemaVersion: 1,
      operation: "verify_link",
      requestId,
      link: link as unknown as JsonValue,
      expected,
    });
    assertCondition(
      response["operation"] === "verified" &&
        response["requestId"] === requestId,
      "HASH_MISMATCH",
      "Audit link verification was not acknowledged",
    );
  }

  public async verifyAll(): Promise<void> {
    const requestId = this.#ids.next("audit-request");
    const response = await this.#exchange({
      schemaVersion: 1,
      operation: "verify_all",
      requestId,
    });
    assertCondition(
      response["operation"] === "verified" &&
        response["requestId"] === requestId,
      "HASH_MISMATCH",
      "Audit log verification was not acknowledged",
    );
  }

  public async stop(): Promise<void> {
    const relay = this.#relay;
    this.#relay = null;
    this.#reader = null;
    this.#peer = null;
    if (relay !== null) await stopProcessGroup(relay);
  }

  async #exchange(
    payload: Record<string, JsonValue>,
  ): Promise<Record<string, JsonValue>> {
    const relay = this.#relay;
    const reader = this.#reader;
    assertCondition(relay !== null && reader !== null, "PEER_CRASHED", "Audit client is not started");
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
      recipientRole: "audit_store",
      messageType: "audit.append",
      sentAt: sentAt.toISOString(),
      expiresAt: new Date(sentAt.getTime() + 5_000).toISOString(),
      senderSequence: this.#sequence,
      nonce,
      payloadSchemaId: AUDIT_REQUEST_SCHEMA_ID,
      payload,
      signer: this.#operationsSigner,
      schemas: this.#schemas,
    });
    this.#sequence += 1;
    await new Promise<void>((resolve, reject) => {
      relay.stdin.write(encodeWireFrame(envelope), (error) =>
        error === null || error === undefined ? resolve() : reject(error),
      );
    });
    let timer: NodeJS.Timeout | undefined;
    try {
      const responseValue = await Promise.race([
        reader.next(),
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(
            () => reject(new HarnessError("DEADLINE_EXCEEDED", this.#stderr || "Audit response timed out")),
            5_000,
          );
          timer.unref();
        }),
      ]);
      const envelopeResponse = objectValue(
        responseValue,
        "audit response envelope",
      ) as unknown as WireEnvelope;
      verifyWireEnvelope(envelopeResponse, {
        schemas: this.#schemas,
        principals: this.#principals,
        replayGuard: this.#replay,
        clock: this.#clock,
        expectedProtocolId: this.#protocolId,
        expectedRecipientRole: "operations_owner",
      });
      assertCondition(
        envelopeResponse.messageType === "audit.acknowledge" &&
          envelopeResponse.correlationId === correlationId &&
          envelopeResponse.causationId === messageId &&
          envelopeResponse.sender.identityDigest ===
            this.#auditPrincipal.identity.identityDigest,
        "AUTHENTICATION_FAILED",
        "Audit response identity or correlation mismatch",
      );
      return objectValue(
        envelopeResponse.payload as unknown as JsonValue,
        "audit response payload",
      );
    } catch (error) {
      if (error instanceof HarnessError && error.code !== "PEER_CRASHED") {
        throw error;
      }
      throw new HarnessError("PEER_CRASHED", this.#stderr || "Audit service failed", {
        cause: error,
      });
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }
}
