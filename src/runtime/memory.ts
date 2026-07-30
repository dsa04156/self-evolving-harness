import path from "node:path";

import { sha256Text, type JsonValue } from "../core/canonical.js";
import type { Clock, IdFactory } from "../core/determinism.js";
import { assertCondition } from "../core/errors.js";
import { AppendOnlyLog } from "../storage/append-only-log.js";

export type MemoryNamespace =
  | "project_facts"
  | "user_preferences"
  | "accepted_lessons"
  | "rejected_mutations"
  | "session_summaries";

export type MemoryAuthority = "untrusted_context" | "operator_approved";

export interface MemoryRecord {
  readonly recordId: string;
  readonly namespace: MemoryNamespace;
  readonly content: string;
  readonly contentHash: string;
  readonly createdAt: string;
  readonly authority: MemoryAuthority;
  readonly provenance: {
    readonly producerId: string;
    readonly sourceEventIds: readonly string[];
  };
}

export interface MemoryRetrievalPolicy {
  readonly readableNamespaces: readonly MemoryNamespace[];
  readonly queryMode: "recency" | "lexical" | "fixed_hybrid";
  readonly hybridLexicalWeightMicros?: number;
  readonly maxRecords: number;
  readonly maxTokens: number;
  readonly minimumScoreMicros: number;
  readonly tieBreak: "record_id_ascending" | "created_at_then_record_id";
}

export interface RankedMemory {
  readonly record: MemoryRecord;
  readonly scoreMicros: number;
  readonly estimatedTokens: number;
}

export interface MemoryRetrievalResult {
  readonly selected: readonly RankedMemory[];
  readonly rejected: readonly {
    readonly recordId: string;
    readonly reason: "below_minimum_score" | "record_limit" | "token_limit";
  }[];
}

export function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil([...text].length / 4));
}

function terms(value: string): Set<string> {
  return new Set(
    value
      .normalize("NFC")
      .toLocaleLowerCase("en-US")
      .match(/[\p{L}\p{N}_-]+/gu) ?? [],
  );
}

function lexicalScoreMicros(query: Set<string>, content: string): number {
  if (query.size === 0) return 0;
  const candidate = terms(content);
  let overlap = 0;
  for (const term of query) {
    if (candidate.has(term)) overlap += 1;
  }
  return Math.floor((overlap * 1_000_000) / query.size);
}

function asMemoryRecord(value: JsonValue): MemoryRecord {
  assertCondition(
    typeof value === "object" &&
      value !== null &&
      !Array.isArray(value) &&
      typeof value["recordId"] === "string" &&
      typeof value["namespace"] === "string" &&
      typeof value["content"] === "string" &&
      typeof value["contentHash"] === "string" &&
      typeof value["createdAt"] === "string",
    "HASH_MISMATCH",
    "Malformed memory record",
  );
  return value as unknown as MemoryRecord;
}

export class FilesystemMemory {
  readonly #root: string;
  readonly #clock: Clock;
  readonly #ids: IdFactory;

  public constructor(root: string, clock: Clock, ids: IdFactory) {
    this.#root = path.resolve(root);
    this.#clock = clock;
    this.#ids = ids;
  }

  public async write(input: {
    namespace: MemoryNamespace;
    content: string;
    authority: MemoryAuthority;
    producerId: string;
    sourceEventIds?: readonly string[];
  }): Promise<MemoryRecord> {
    assertCondition(input.content.length > 0, "SCHEMA_INVALID", "Memory content is empty");
    assertCondition(
      Buffer.byteLength(input.content, "utf8") <= 64 * 1024,
      "PAYLOAD_TOO_LARGE",
      "Memory record exceeds 64 KiB",
    );
    const record: MemoryRecord = {
      recordId: this.#ids.next("memory"),
      namespace: input.namespace,
      content: input.content,
      contentHash: sha256Text(input.content),
      createdAt: this.#clock.now().toISOString(),
      authority: input.authority,
      provenance: {
        producerId: input.producerId,
        sourceEventIds: [...(input.sourceEventIds ?? [])],
      },
    };
    const log = this.#log(input.namespace);
    await log.append(record as unknown as JsonValue);
    return record;
  }

  public async list(namespaces: readonly MemoryNamespace[]): Promise<MemoryRecord[]> {
    const records: MemoryRecord[] = [];
    for (const namespace of [...namespaces].sort()) {
      const log = this.#log(namespace);
      for (const entry of await log.readAll()) {
        const record = asMemoryRecord(entry.payload);
        assertCondition(record.namespace === namespace, "HASH_MISMATCH", "Memory namespace mismatch");
        assertCondition(
          record.contentHash === sha256Text(record.content),
          "HASH_MISMATCH",
          `Memory content hash mismatch for ${record.recordId}`,
        );
        records.push(record);
      }
    }
    return records;
  }

  public async retrieve(
    query: string,
    policy: MemoryRetrievalPolicy,
  ): Promise<MemoryRetrievalResult> {
    assertCondition(
      policy.maxRecords >= 0 && policy.maxTokens >= 0,
      "SCHEMA_INVALID",
      "Invalid memory limits",
    );
    if (policy.queryMode === "fixed_hybrid") {
      assertCondition(
        policy.hybridLexicalWeightMicros !== undefined &&
          policy.hybridLexicalWeightMicros >= 0 &&
          policy.hybridLexicalWeightMicros <= 1_000_000,
        "SCHEMA_INVALID",
        "Hybrid retrieval requires a fixed lexical weight",
      );
    } else {
      assertCondition(
        policy.hybridLexicalWeightMicros === undefined,
        "SCHEMA_INVALID",
        "Lexical weight is valid only in fixed_hybrid mode",
      );
    }
    const records = await this.list(policy.readableNamespaces);
    const queryTerms = terms(query);
    const ranked = records.map((record, index) => {
      const lexicalMicros = lexicalScoreMicros(queryTerms, record.content);
      const recencyMicros =
        records.length === 0 ? 0 : Math.floor(((index + 1) * 1_000_000) / records.length);
      let scoreMicros: number;
      if (policy.queryMode === "lexical") scoreMicros = lexicalMicros;
      else if (policy.queryMode === "recency") scoreMicros = recencyMicros;
      else {
        const weightMicros = policy.hybridLexicalWeightMicros!;
        scoreMicros = Math.floor(
          (weightMicros * lexicalMicros +
            (1_000_000 - weightMicros) * recencyMicros) /
            1_000_000,
        );
      }
      return { record, scoreMicros, estimatedTokens: estimateTokens(record.content) };
    });
    ranked.sort((left, right) => {
      if (left.scoreMicros !== right.scoreMicros) {
        return right.scoreMicros - left.scoreMicros;
      }
      if (policy.tieBreak === "created_at_then_record_id") {
        const time = left.record.createdAt.localeCompare(right.record.createdAt);
        if (time !== 0) return time;
      }
      return left.record.recordId.localeCompare(right.record.recordId);
    });

    const selected: RankedMemory[] = [];
    const rejected: MemoryRetrievalResult["rejected"][number][] = [];
    let tokens = 0;
    for (const item of ranked) {
      if (item.scoreMicros < policy.minimumScoreMicros) {
        rejected.push({ recordId: item.record.recordId, reason: "below_minimum_score" });
      } else if (selected.length >= policy.maxRecords) {
        rejected.push({ recordId: item.record.recordId, reason: "record_limit" });
      } else if (tokens + item.estimatedTokens > policy.maxTokens) {
        rejected.push({ recordId: item.record.recordId, reason: "token_limit" });
      } else {
        selected.push(item);
        tokens += item.estimatedTokens;
      }
    }
    return { selected, rejected };
  }

  #log(namespace: MemoryNamespace): AppendOnlyLog<JsonValue> {
    return new AppendOnlyLog<JsonValue>(path.join(this.#root, "namespaces"), `memory.${namespace}`);
  }
}
