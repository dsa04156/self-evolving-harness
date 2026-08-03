import { randomBytes } from "node:crypto";
import {
  mkdir,
  readFile,
  readdir,
  rename,
  unlink,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

import { parseStrictJson, sha256, type JsonValue } from "../core/canonical.js";
import { HarnessError, assertCondition } from "../core/errors.js";
import type {
  AgentRunResult,
  BudgetUsage,
  VerificationResult,
} from "../domain/runtime.js";
import type { ModelUsage } from "../domain/model.js";
import type {
  PermissionMode,
  ProductProviderConfig,
  ProductStatePaths,
} from "./config.js";

export type ProductSessionState =
  | "created"
  | "running"
  | "completed"
  | "blocked"
  | "terminated"
  | "failed";

export interface ProductSessionResult {
  readonly state: AgentRunResult["state"];
  readonly finalText: string | null;
  readonly verification: VerificationResult | null;
  readonly usage: Readonly<BudgetUsage>;
  readonly modelUsage: Readonly<ModelUsage>;
  readonly eventHeadHash: string;
  readonly eventCount: number;
  readonly lifecycleState: string;
  readonly terminationReason: string | null;
}

export interface ProductSessionRecord {
  readonly schemaVersion: 1;
  readonly sessionId: string;
  readonly parentSessionId: string | null;
  readonly workspaceRoot: string;
  readonly task: string;
  readonly provider: {
    readonly kind: ProductProviderConfig["kind"];
    readonly model: string;
  };
  readonly permissionMode: PermissionMode;
  readonly verificationCommands: readonly string[];
  readonly state: ProductSessionState;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly result: ProductSessionResult | null;
  readonly failure: {
    readonly code: string;
    readonly detail: string;
  } | null;
  readonly metadataHash: string;
}

type ProductSessionCore = Omit<ProductSessionRecord, "metadataHash">;

function coreOf(record: ProductSessionRecord): ProductSessionCore {
  const { metadataHash: _metadataHash, ...core } = record;
  return core;
}

function asRecord(value: JsonValue): ProductSessionRecord {
  assertCondition(
    typeof value === "object" &&
      value !== null &&
      !Array.isArray(value) &&
      value["schemaVersion"] === 1 &&
      typeof value["sessionId"] === "string" &&
      typeof value["workspaceRoot"] === "string" &&
      typeof value["task"] === "string" &&
      typeof value["state"] === "string" &&
      typeof value["createdAt"] === "string" &&
      typeof value["updatedAt"] === "string" &&
      typeof value["metadataHash"] === "string",
    "HASH_MISMATCH",
    "Malformed product session metadata",
  );
  const record = value as unknown as ProductSessionRecord;
  assertCondition(
    record.metadataHash === sha256(coreOf(record) as unknown as JsonValue),
    "HASH_MISMATCH",
    `Product session metadata changed for ${record.sessionId}`,
  );
  return record;
}

function assertSessionId(sessionId: string): void {
  assertCondition(
    /^[A-Za-z0-9][A-Za-z0-9._:@-]{2,159}$/u.test(sessionId),
    "SCHEMA_INVALID",
    "Invalid session ID",
  );
}

export function createProductSessionId(now = new Date()): string {
  const timestamp = now
    .toISOString()
    .replace(/[-:]/gu, "")
    .replace(/\.\d{3}Z$/u, "Z")
    .replace("T", "-");
  return `session.${timestamp}.${randomBytes(6).toString("hex")}`;
}

export class ProductSessionStore {
  readonly #paths: ProductStatePaths;

  public constructor(paths: ProductStatePaths) {
    this.#paths = paths;
  }

  public async create(input: {
    readonly sessionId: string;
    readonly parentSessionId?: string | null;
    readonly workspaceRoot: string;
    readonly task: string;
    readonly provider: ProductProviderConfig;
    readonly permissionMode: PermissionMode;
    readonly verificationCommands: readonly string[];
    readonly createdAt: string;
  }): Promise<ProductSessionRecord> {
    assertSessionId(input.sessionId);
    if (input.parentSessionId !== undefined && input.parentSessionId !== null) {
      assertSessionId(input.parentSessionId);
    }
    const directory = this.#paths.sessionDirectory(input.sessionId);
    try {
      await mkdir(directory, { recursive: false, mode: 0o700 });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        await mkdir(this.#paths.sessionsRoot, { recursive: true, mode: 0o700 });
        await mkdir(directory, { recursive: false, mode: 0o700 });
      } else if ((error as NodeJS.ErrnoException).code === "EEXIST") {
        throw new HarnessError("CONFLICT", `Session already exists: ${input.sessionId}`);
      } else {
        throw error;
      }
    }
    const core: ProductSessionCore = {
      schemaVersion: 1,
      sessionId: input.sessionId,
      parentSessionId: input.parentSessionId ?? null,
      workspaceRoot: input.workspaceRoot,
      task: input.task,
      provider: { kind: input.provider.kind, model: input.provider.model },
      permissionMode: input.permissionMode,
      verificationCommands: [...input.verificationCommands],
      state: "created",
      createdAt: input.createdAt,
      updatedAt: input.createdAt,
      result: null,
      failure: null,
    };
    const record: ProductSessionRecord = {
      ...core,
      metadataHash: sha256(core as unknown as JsonValue),
    };
    await this.#write(record, true);
    return record;
  }

  public async update(
    sessionId: string,
    update: (record: ProductSessionRecord) => ProductSessionCore,
  ): Promise<ProductSessionRecord> {
    const previous = await this.get(sessionId);
    const core = update(previous);
    assertCondition(
      core.sessionId === previous.sessionId &&
        core.parentSessionId === previous.parentSessionId &&
        core.workspaceRoot === previous.workspaceRoot &&
        core.task === previous.task &&
        core.createdAt === previous.createdAt,
      "AUTHORIZATION_DENIED",
      "Product session immutable fields cannot change",
    );
    const record: ProductSessionRecord = {
      ...core,
      metadataHash: sha256(core as unknown as JsonValue),
    };
    await this.#write(record, false);
    return record;
  }

  public async get(sessionId: string): Promise<ProductSessionRecord> {
    assertSessionId(sessionId);
    const file = this.#recordFile(sessionId);
    let text: string;
    try {
      text = await readFile(file, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        throw new HarnessError("ARTIFACT_UNAVAILABLE", `Unknown session ${sessionId}`);
      }
      throw error;
    }
    return asRecord(parseStrictJson(text));
  }

  public async list(): Promise<ProductSessionRecord[]> {
    let entries;
    try {
      entries = await readdir(this.#paths.sessionsRoot, { withFileTypes: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
    const records: ProductSessionRecord[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      try {
        records.push(await this.get(entry.name));
      } catch (error) {
        if (error instanceof HarnessError && error.code === "ARTIFACT_UNAVAILABLE") continue;
        throw error;
      }
    }
    return records.sort(
      (left, right) =>
        right.createdAt.localeCompare(left.createdAt) ||
        right.sessionId.localeCompare(left.sessionId),
    );
  }

  public async latest(): Promise<ProductSessionRecord | null> {
    return (await this.list())[0] ?? null;
  }

  async #write(record: ProductSessionRecord, exclusive: boolean): Promise<void> {
    const file = this.#recordFile(record.sessionId);
    const bytes = `${JSON.stringify(record, null, 2)}\n`;
    if (exclusive) {
      await writeFile(file, bytes, { encoding: "utf8", mode: 0o600, flag: "wx" });
      return;
    }
    const temporary = `${file}.${randomBytes(12).toString("hex")}.tmp`;
    await writeFile(temporary, bytes, { encoding: "utf8", mode: 0o600, flag: "wx" });
    try {
      await rename(temporary, file);
    } catch (error) {
      await unlink(temporary).catch(() => undefined);
      throw error;
    }
  }

  #recordFile(sessionId: string): string {
    return path.join(this.#paths.sessionDirectory(sessionId), "session.json");
  }
}
