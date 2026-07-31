import { randomBytes } from "node:crypto";
import { constants } from "node:fs";
import {
  link,
  mkdir,
  open,
  readdir,
  unlink,
} from "node:fs/promises";
import path from "node:path";

import {
  canonicalBytes,
  parseStrictJson,
  sha256,
  type JsonValue,
} from "../core/canonical.js";
import {
  HarnessError,
  assertCondition,
} from "../core/errors.js";

const RECORD_PATTERN = /^([0-9]{20})\.json$/u;

export interface CasAppendOnlyRecord<
  T extends JsonValue = JsonValue,
> {
  readonly logId: string;
  readonly sequence: number;
  readonly previousRecordHash: string | null;
  readonly payload: T;
  readonly recordHash: string;
}

export type CasAppendPhase =
  | "before_append"
  | "during_append"
  | "after_publish_before_sync"
  | "after_sync";

interface RecordIdentity<T extends JsonValue> {
  readonly logId: string;
  readonly sequence: number;
  readonly previousRecordHash: string | null;
  readonly payload: T;
}

function hashablePayload<T extends JsonValue>(
  payload: T,
): JsonValue {
  if (
    typeof payload !== "object" ||
    payload === null ||
    Array.isArray(payload)
  ) {
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
  const {
    signature: _signature,
    ...attestationWithoutSignature
  } = attestation;
  return {
    ...payload,
    attestation: attestationWithoutSignature,
  };
}

function recordDigest(
  identity: RecordIdentity<JsonValue>,
): string {
  return sha256({
    ...identity,
    payload: hashablePayload(identity.payload),
  });
}

function recordName(sequence: number): string {
  return `${sequence.toString().padStart(20, "0")}.json`;
}

function isRecord(value: JsonValue): boolean {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value)
  ) {
    return false;
  }
  return (
    typeof value["logId"] === "string" &&
    Number.isSafeInteger(value["sequence"]) &&
    (typeof value["previousRecordHash"] === "string" ||
      value["previousRecordHash"] === null) &&
    "payload" in value &&
    typeof value["recordHash"] === "string"
  );
}

async function syncDirectory(
  directory: string,
): Promise<void> {
  const handle = await open(
    directory,
    constants.O_RDONLY | constants.O_DIRECTORY,
  );
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

export class CasAppendOnlyLog<
  T extends JsonValue = JsonValue,
> {
  readonly #directory: string;
  readonly #logId: string;

  public constructor(root: string, logId: string) {
    assertCondition(
      /^[A-Za-z0-9][A-Za-z0-9._:@/-]{2,159}$/u.test(
        logId,
      ),
      "SCHEMA_INVALID",
      "Invalid CAS log identifier",
    );
    this.#logId = logId;
    this.#directory = path.resolve(
      root,
      encodeURIComponent(logId),
    );
  }

  public async initialize(): Promise<void> {
    await mkdir(this.#directory, {
      recursive: true,
      mode: 0o700,
    });
    await syncDirectory(path.dirname(this.#directory));
    await syncDirectory(this.#directory);
  }

  public async appendExpected(input: {
    readonly expectedHeadHash: string | null;
    readonly payload: T;
    readonly inject?: (
      phase: CasAppendPhase,
    ) => void | Promise<void>;
  }): Promise<CasAppendOnlyRecord<T>> {
    await this.initialize();
    await input.inject?.("before_append");
    const records = await this.readAll();
    const previous = records.at(-1);
    const observedHead =
      previous?.recordHash ?? null;
    assertCondition(
      observedHead === input.expectedHeadHash,
      "CONFLICT",
      "CAS log head changed before append",
    );
    const identity: RecordIdentity<T> = {
      logId: this.#logId,
      sequence: records.length,
      previousRecordHash: observedHead,
      payload: input.payload,
    };
    const record: CasAppendOnlyRecord<T> = {
      ...identity,
      recordHash: recordDigest(
        identity as RecordIdentity<JsonValue>,
      ),
    };
    const finalPath = path.join(
      this.#directory,
      recordName(record.sequence),
    );
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
    let published = false;
    try {
      await link(temporary, finalPath);
      published = true;
      await input.inject?.("during_append");
      await unlink(temporary).catch((error: unknown) => {
        if (
          (error as NodeJS.ErrnoException).code !==
          "ENOENT"
        ) {
          throw error;
        }
      });
      await input.inject?.(
        "after_publish_before_sync",
      );
      await syncDirectory(this.#directory);
      await input.inject?.("after_sync");
      return record;
    } catch (error) {
      if (!published) {
        await unlink(temporary).catch(() => undefined);
      }
      if (
        (error as NodeJS.ErrnoException).code ===
        "EEXIST"
      ) {
        throw new HarnessError(
          "CONFLICT",
          "CAS log append lost the expected-head race",
        );
      }
      throw error;
    }
  }

  public async readAll(): Promise<
    CasAppendOnlyRecord<T>[]
  > {
    await this.initialize();
    const directoryNames = await readdir(this.#directory);
    const names = directoryNames
      .filter((name) => RECORD_PATTERN.test(name))
      .sort();
    const records: CasAppendOnlyRecord<T>[] = [];
    let previousHash: string | null = null;
    for (const [index, name] of names.entries()) {
      const match = RECORD_PATTERN.exec(name)!;
      const namedSequence = Number(match[1]);
      assertCondition(
        namedSequence === index,
        "HASH_MISMATCH",
        `CAS log sequence gap at ${name}`,
      );
      const handle = await open(
        path.join(this.#directory, name),
        constants.O_RDONLY | constants.O_NOFOLLOW,
      );
      let source: string;
      try {
        let metadata = await handle.stat();
        assertCondition(
          metadata.isFile(),
          "HASH_MISMATCH",
          `${name} is not a regular CAS record`,
        );
        if (metadata.nlink === 2) {
          const matchingTemporary: string[] = [];
          for (const candidate of directoryNames) {
            if (
              !candidate.startsWith(`.${name}.`) ||
              !candidate.endsWith(".tmp")
            ) {
              continue;
            }
            let candidateHandle;
            try {
              candidateHandle = await open(
                path.join(
                  this.#directory,
                  candidate,
                ),
                constants.O_RDONLY |
                  constants.O_NOFOLLOW,
              );
            } catch (error) {
              if (
                (error as NodeJS.ErrnoException)
                  .code === "ENOENT"
              ) {
                continue;
              }
              throw error;
            }
            try {
              const candidateMetadata =
                await candidateHandle.stat();
              if (
                candidateMetadata.isFile() &&
                candidateMetadata.dev === metadata.dev &&
                candidateMetadata.ino === metadata.ino
              ) {
                matchingTemporary.push(candidate);
              }
            } finally {
              await candidateHandle.close();
            }
          }
          if (matchingTemporary.length === 1) {
            await unlink(
              path.join(
                this.#directory,
                matchingTemporary[0]!,
              ),
            );
            await syncDirectory(this.#directory);
            metadata = await handle.stat();
          }
        }
        assertCondition(
          metadata.nlink === 1,
          "HASH_MISMATCH",
          `${name} has an external or ambiguous hard link`,
        );
        source = await handle.readFile("utf8");
      } finally {
        await handle.close();
      }
      const parsed = parseStrictJson(source);
      assertCondition(
        isRecord(parsed),
        "HASH_MISMATCH",
        `Malformed CAS record ${name}`,
      );
      const parsedRecord =
        parsed as unknown as CasAppendOnlyRecord<JsonValue>;
      assertCondition(
        parsedRecord.logId === this.#logId &&
          parsedRecord.sequence === index &&
          parsedRecord.previousRecordHash ===
            previousHash,
        "HASH_MISMATCH",
        `Broken CAS chain at ${name}`,
      );
      const identity: RecordIdentity<JsonValue> = {
        logId: parsedRecord.logId,
        sequence: parsedRecord.sequence,
        previousRecordHash:
          parsedRecord.previousRecordHash,
        payload: parsedRecord.payload,
      };
      assertCondition(
        parsedRecord.recordHash ===
          recordDigest(identity),
        "HASH_MISMATCH",
        `CAS record hash mismatch at ${name}`,
      );
      records.push(
        parsedRecord as unknown as CasAppendOnlyRecord<T>,
      );
      previousHash = parsedRecord.recordHash;
    }
    return records;
  }

  public async head(): Promise<
    CasAppendOnlyRecord<T> | null
  > {
    return (await this.readAll()).at(-1) ?? null;
  }

  public async synchronize(): Promise<void> {
    await this.initialize();
    await syncDirectory(this.#directory);
  }
}
