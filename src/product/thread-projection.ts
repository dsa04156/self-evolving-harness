import { access } from "node:fs/promises";
import path from "node:path";

import { sha256, type JsonValue } from "../core/canonical.js";
import { assertCondition } from "../core/errors.js";
import {
  RUNTIME_EVENT_SCHEMA_ID,
  type RuntimeEvent,
} from "../evidence/runtime-events.js";
import { SchemaRegistry, SCHEMA_BASE_URL } from "../contracts/schema-registry.js";
import { AppendOnlyLog } from "../storage/append-only-log.js";
import { bundledSchemasPath } from "./resources.js";
import {
  ProductSessionStore,
  type ProductSessionRecord,
} from "./session-store.js";
import type { ProductStatePaths } from "./config.js";

const PROJECTION_SCHEMA_ID = `${SCHEMA_BASE_URL}product-thread-projection.schema.json`;

export type ProductThreadItemKind =
  | "user_message"
  | "model_request"
  | "agent_message"
  | "tool_call"
  | "tool_result"
  | "verification"
  | "workflow_transition"
  | "route_selection"
  | "state_change"
  | "failure";

export interface ProductThreadProjectionItem {
  readonly itemId: string;
  readonly kind: ProductThreadItemKind;
  readonly source: {
    readonly sourceType: "session_metadata" | "runtime_event";
    readonly sourceId: string;
    readonly sourceHash: string;
  };
  readonly payload: Readonly<Record<string, JsonValue>>;
}

export interface ProductThreadProjection {
  readonly schemaVersion: 1;
  /** Projection convenience only; never accepted as evidence, permission, or promotion authority. */
  readonly authority: "projection_only";
  readonly threadId: string;
  readonly forkedFromThreadId: string | null;
  readonly harnessVersionIds: readonly string[];
  readonly turns: readonly {
    readonly turnId: string;
    readonly sessionId: string;
    readonly parentSessionId: string | null;
    readonly lineageKind: "root" | "resume" | "fork" | "legacy";
    readonly harnessVersionId: string | null;
    readonly state: string;
    readonly items: readonly ProductThreadProjectionItem[];
  }[];
  readonly projectionHash: string;
}

function eventIdentity(event: RuntimeEvent): Omit<RuntimeEvent, "eventHash"> {
  const { eventHash: _eventHash, ...identity } = event;
  return identity;
}

async function runtimeEvents(
  paths: ProductStatePaths,
  record: ProductSessionRecord,
  schemas: SchemaRegistry,
): Promise<RuntimeEvent[]> {
  const root = path.join(paths.sessionRuntimeRoot(record.sessionId), "kernel", "events");
  const directory = path.join(root, encodeURIComponent(`events.${record.sessionId}`));
  try {
    await access(directory);
  } catch {
    return [];
  }
  const entries = await new AppendOnlyLog<JsonValue>(
    root,
    `events.${record.sessionId}`,
  ).readAll();
  const events: RuntimeEvent[] = [];
  let previousEventHash: string | null = null;
  for (const [index, entry] of entries.entries()) {
    schemas.validate(RUNTIME_EVENT_SCHEMA_ID, entry.payload);
    const event = entry.payload as unknown as RuntimeEvent;
    assertCondition(
      event.sessionId === record.sessionId &&
        event.sequence === index &&
        event.previousEventHash === previousEventHash &&
        event.payloadHash === sha256(event.payload) &&
        event.eventHash === sha256(eventIdentity(event)),
      "HASH_MISMATCH",
      `Runtime event chain changed for ${record.sessionId}`,
    );
    if (record.harnessVersionId !== undefined) {
      assertCondition(
        event.harnessVersionId === record.harnessVersionId,
        "PROTOCOL_MISMATCH",
        `Runtime event HarnessVersion differs from session ${record.sessionId}`,
      );
    }
    events.push(event);
    previousEventHash = event.eventHash;
  }
  return events;
}

function kindForEvent(eventType: string): ProductThreadItemKind | null {
  if (eventType === "model_request_started") return "model_request";
  if (eventType === "model_response_received") return "agent_message";
  if (eventType === "tool_call_requested") return "tool_call";
  if (eventType === "tool_call_completed") return "tool_result";
  if (eventType === "verification_completed") return "verification";
  if (eventType === "workflow_transitioned") return "workflow_transition";
  if (eventType === "route_selected") return "route_selection";
  if (eventType === "session_state_changed") return "state_change";
  if (eventType === "runtime_failure_observed" || eventType === "session_blocked") return "failure";
  return null;
}

function eventItem(event: RuntimeEvent): ProductThreadProjectionItem | null {
  const kind = kindForEvent(event.eventType);
  if (kind === null) return null;
  return {
    itemId: `projection-item.${event.eventId}`,
    kind,
    source: {
      sourceType: "runtime_event",
      sourceId: event.eventId,
      sourceHash: event.eventHash,
    },
    payload: {
      eventType: event.eventType,
      epistemicClass: event.epistemicClass,
      ...event.payload,
    },
  };
}

function derivedThreadId(record: ProductSessionRecord): string {
  return record.threadId ?? `thread.${record.sessionId}`;
}

export async function projectProductThread(input: {
  readonly paths: ProductStatePaths;
  readonly sessionId?: string;
}): Promise<ProductThreadProjection> {
  const store = new ProductSessionStore(input.paths);
  const selected =
    input.sessionId === undefined ? await store.latest() : await store.get(input.sessionId);
  assertCondition(selected !== null, "ARTIFACT_UNAVAILABLE", "No product session exists");
  const targetThreadId = derivedThreadId(selected);
  const records = (await store.list())
    .filter((record) => derivedThreadId(record) === targetThreadId)
    .sort(
      (left, right) =>
        left.createdAt.localeCompare(right.createdAt) ||
        left.sessionId.localeCompare(right.sessionId),
    );
  const schemas = await SchemaRegistry.load(await bundledSchemasPath());
  const turns: ProductThreadProjection["turns"][number][] = [];
  for (const record of records) {
    const items: ProductThreadProjectionItem[] = [
      {
        itemId: `projection-item.user.${record.sessionId}`,
        kind: "user_message",
        source: {
          sourceType: "session_metadata",
          sourceId: record.sessionId,
          sourceHash: record.metadataHash,
        },
        payload: { text: record.task, runtimeTaskHash: record.runtimeTaskHash ?? null },
      },
    ];
    for (const event of await runtimeEvents(input.paths, record, schemas)) {
      const item = eventItem(event);
      if (item !== null) items.push(item);
    }
    turns.push({
      turnId: `turn.${record.sessionId}`,
      sessionId: record.sessionId,
      parentSessionId: record.parentSessionId,
      lineageKind: record.lineageKind ?? "legacy",
      harnessVersionId: record.harnessVersionId ?? record.result?.harnessVersionId ?? null,
      state: record.state,
      items,
    });
  }
  const core = {
    schemaVersion: 1 as const,
    authority: "projection_only" as const,
    threadId: targetThreadId,
    forkedFromThreadId:
      records.find((record) => record.forkedFromThreadId != null)?.forkedFromThreadId ?? null,
    harnessVersionIds: [...new Set(
      turns.flatMap((turn) =>
        turn.harnessVersionId === null ? [] : [turn.harnessVersionId],
      ),
    )].sort(),
    turns,
  };
  const projection: ProductThreadProjection = {
    ...core,
    projectionHash: sha256(core as unknown as JsonValue),
  };
  schemas.validate(PROJECTION_SCHEMA_ID, projection as unknown as JsonValue);
  return projection;
}

export function assertNotProjectionAuthority(value: JsonValue): void {
  const authority =
    typeof value === "object" && value !== null && !Array.isArray(value)
      ? value["authority"]
      : undefined;
  assertCondition(
    authority !== "projection_only",
    "AUTHORIZATION_DENIED",
    "Thread/Turn/Item projections cannot authorize runtime, evaluation, or promotion actions",
  );
}
