import { constants } from "node:fs";
import { link, mkdir, open, readdir, unlink } from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";

import {
  canonicalBytes,
  parseStrictJson,
  sha256,
  type JsonValue,
} from "../core/canonical.js";
import { assertCondition } from "../core/errors.js";

const RECORD_PATTERN = /^([0-9]{20})\.json$/u;

export interface AppendOnlyRecord<T extends JsonValue = JsonValue> {
  readonly logId: string;
  readonly sequence: number;
  readonly previousRecordHash: string | null;
  readonly payload: T;
  readonly recordHash: string;
}

interface RecordIdentity<T extends JsonValue> {
  readonly logId: string;
  readonly sequence: number;
  readonly previousRecordHash: string | null;
  readonly payload: T;
}

function hashablePayload<T extends JsonValue>(payload: T): JsonValue {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    return payload;
  }
  const attestation = payload["attestation"];
  if (
    typeof attestation !== "object" ||
    attestation === null ||
    Array.isArray(attestation) ||
    !("signature" in attestation)
  ) {
    return payload;
  }
  const { signature: _signature, ...attestationWithoutSignature } = attestation;
  return {
    ...payload,
    attestation: attestationWithoutSignature,
  };
}

function recordDigest(identity: RecordIdentity<JsonValue>): string {
  return sha256({
    ...identity,
    payload: hashablePayload(identity.payload),
  });
}

function recordName(sequence: number): string {
  return `${sequence.toString().padStart(20, "0")}.json`;
}

function isRecord(value: JsonValue): boolean {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  return (
    typeof value["logId"] === "string" &&
    Number.isSafeInteger(value["sequence"]) &&
    (typeof value["previousRecordHash"] === "string" || value["previousRecordHash"] === null) &&
    "payload" in value &&
    typeof value["recordHash"] === "string"
  );
}

async function syncDirectory(directory: string): Promise<void> {
  const handle = await open(directory, constants.O_RDONLY | constants.O_DIRECTORY);
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

export class AppendOnlyLog<T extends JsonValue = JsonValue> {
  readonly #directory: string;
  readonly #logId: string;

  public constructor(root: string, logId: string) {
    assertCondition(
      /^[A-Za-z0-9][A-Za-z0-9._:@/-]{2,159}$/u.test(logId),
      "SCHEMA_INVALID",
      "Invalid log identifier",
    );
    this.#logId = logId;
    this.#directory = path.resolve(root, encodeURIComponent(logId));
  }

  public async initialize(): Promise<void> {
    await mkdir(this.#directory, { recursive: true, mode: 0o700 });
  }

  public async append(payload: T): Promise<AppendOnlyRecord<T>> {
    await this.initialize();
    for (let attempt = 0; attempt < 64; attempt += 1) {
      const records = await this.readAll();
      const previous = records.at(-1);
      const identity: RecordIdentity<T> = {
        logId: this.#logId,
        sequence: records.length,
        previousRecordHash: previous?.recordHash ?? null,
        payload,
      };
      const record: AppendOnlyRecord<T> = {
        ...identity,
        recordHash: recordDigest(identity),
      };
      const finalPath = path.join(this.#directory, recordName(record.sequence));
      const temporary = path.join(
        this.#directory,
        `.${recordName(record.sequence)}.${randomBytes(16).toString("hex")}.tmp`,
      );
      const handle = await open(
        temporary,
        constants.O_WRONLY |
          constants.O_CREAT |
          constants.O_EXCL |
          constants.O_NOFOLLOW,
        0o600,
      );
      try {
        await handle.writeFile(canonicalBytes(record));
        await handle.sync();
      } finally {
        await handle.close();
      }
      try {
        await link(temporary, finalPath);
        await unlink(temporary);
        await syncDirectory(this.#directory);
        return record;
      } catch (error) {
        await unlink(temporary).catch(() => undefined);
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
          throw error;
        }
      }
    }
    throw new Error("Append contention exceeded retry limit");
  }

  public async readAll(): Promise<AppendOnlyRecord<T>[]> {
    await this.initialize();
    const names = (await readdir(this.#directory))
      .filter((name) => RECORD_PATTERN.test(name))
      .sort();
    const records: AppendOnlyRecord<T>[] = [];
    let previousHash: string | null = null;
    for (const [index, name] of names.entries()) {
      const match = RECORD_PATTERN.exec(name)!;
      const namedSequence = Number(match[1]);
      assertCondition(
        namedSequence === index,
        "HASH_MISMATCH",
        `Audit log sequence gap at ${name}`,
      );
      const handle = await open(
        path.join(this.#directory, name),
        constants.O_RDONLY | constants.O_NOFOLLOW,
      );
      let source: string;
      try {
        const metadata = await handle.stat();
        assertCondition(metadata.isFile(), "HASH_MISMATCH", `${name} is not a regular file`);
        assertCondition(metadata.nlink === 1, "HASH_MISMATCH", `${name} has an external hard link`);
        source = await handle.readFile("utf8");
      } finally {
        await handle.close();
      }
      const parsed = parseStrictJson(source);
      assertCondition(isRecord(parsed), "HASH_MISMATCH", `Malformed audit record ${name}`);
      const parsedRecord = parsed as unknown as AppendOnlyRecord<JsonValue>;
      assertCondition(parsedRecord.logId === this.#logId, "HASH_MISMATCH", "Audit log ID mismatch");
      assertCondition(parsedRecord.sequence === index, "HASH_MISMATCH", "Audit sequence mismatch");
      assertCondition(
        parsedRecord.previousRecordHash === previousHash,
        "HASH_MISMATCH",
        `Broken audit chain at ${name}`,
      );
      const identity: RecordIdentity<JsonValue> = {
        logId: parsedRecord.logId,
        sequence: parsedRecord.sequence,
        previousRecordHash: parsedRecord.previousRecordHash,
        payload: parsedRecord.payload,
      };
      assertCondition(
        parsedRecord.recordHash === recordDigest(identity),
        "HASH_MISMATCH",
        `Audit record hash mismatch at ${name}`,
      );
      records.push(parsedRecord as unknown as AppendOnlyRecord<T>);
      previousHash = parsedRecord.recordHash;
    }
    return records;
  }

  public async head(): Promise<AppendOnlyRecord<T> | null> {
    return (await this.readAll()).at(-1) ?? null;
  }
}
