import { sha256, type JsonValue } from "../core/canonical.js";
import type { Clock, IdFactory } from "../core/determinism.js";
import { assertCondition } from "../core/errors.js";
import { SCHEMA_BASE_URL, type SchemaRegistry } from "../contracts/schema-registry.js";
import type { ArtifactReference } from "../domain/components.js";
import type { EpistemicClass, SessionPins } from "../domain/runtime.js";
import { AppendOnlyLog } from "../storage/append-only-log.js";
import type { PrincipalIdentity } from "../trust/identity.js";

export const RUNTIME_EVENT_SCHEMA_ID = `${SCHEMA_BASE_URL}runtime-event.schema.json`;

export interface InferenceMetadata {
  readonly sourceEventIds: readonly string[];
  readonly sourceReceiptIds: readonly string[];
  readonly confidenceMicros: number;
  readonly alternativeExplanations: readonly string[];
  readonly producerIdentity: PrincipalIdentity;
  readonly method?: string;
}

export interface RuntimeEvent {
  readonly schemaVersion: 2;
  readonly eventId: string;
  readonly protocolId: string;
  readonly sessionId: string;
  readonly harnessVersionId: string;
  readonly runtimeStateSnapshotId: string;
  readonly sequence: number;
  readonly occurredAt: string;
  readonly monotonicNanos: number;
  readonly producer: PrincipalIdentity;
  readonly origin: {
    readonly originClass:
      | "user"
      | "model"
      | "tool"
      | "runtime"
      | "operations"
      | "provider"
      | "evaluator"
      | "promoter";
    readonly originId: string;
    readonly trustLevel:
      | "untrusted_input"
      | "sandbox_observation"
      | "authenticated_principal"
      | "trusted_evaluator"
      | "trusted_control";
  };
  readonly epistemicClass: EpistemicClass;
  readonly eventType: string;
  readonly payload: { readonly [key: string]: JsonValue };
  readonly payloadHash: string;
  readonly previousEventHash: string | null;
  readonly eventHash: string;
  readonly artifactRefs: readonly ArtifactReference[];
  readonly redaction: {
    readonly containsKnownSecrets: false;
    readonly appliedRuleIds: readonly string[];
    readonly scannerHash: string;
  };
  readonly inference: InferenceMetadata | null;
}

export class SecretRedactor {
  readonly #rules: readonly { readonly ruleId: string; readonly value: string }[];
  readonly scannerHash: string;

  public constructor(secrets: Readonly<Record<string, string>>) {
    this.#rules = Object.entries(secrets)
      .filter(([, value]) => value.length > 0)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([ruleId, value]) => ({ ruleId, value }));
    this.scannerHash = sha256({
      profile: "literal-secret-redactor-v1",
      ruleIds: this.#rules.map((rule) => rule.ruleId),
    });
  }

  public redact(value: JsonValue): {
    readonly value: JsonValue;
    readonly appliedRuleIds: readonly string[];
  } {
    const applied = new Set<string>();
    const visit = (candidate: JsonValue): JsonValue => {
      if (typeof candidate === "string") {
        let result = candidate;
        for (const rule of this.#rules) {
          if (result.includes(rule.value)) {
            result = result.split(rule.value).join(`[REDACTED:${rule.ruleId}]`);
            applied.add(rule.ruleId);
          }
        }
        return result;
      }
      if (Array.isArray(candidate)) return candidate.map(visit);
      if (candidate !== null && typeof candidate === "object") {
        return Object.fromEntries(
          Object.entries(candidate).map(([key, child]) => [key, visit(child)]),
        );
      }
      return candidate;
    };
    return { value: visit(value), appliedRuleIds: [...applied].sort() };
  }
}

function eventIdentity(event: RuntimeEvent): Omit<RuntimeEvent, "eventHash"> {
  const { eventHash: _eventHash, ...identity } = event;
  return identity;
}

function asEvent(value: JsonValue): RuntimeEvent {
  return value as unknown as RuntimeEvent;
}

export class RuntimeEventStream {
  readonly #sessionId: string;
  readonly #pins: SessionPins;
  readonly #producer: PrincipalIdentity;
  readonly #clock: Clock;
  readonly #ids: IdFactory;
  readonly #schemas: SchemaRegistry;
  readonly #redactor: SecretRedactor;
  readonly #log: AppendOnlyLog<JsonValue>;

  public constructor(input: {
    root: string;
    sessionId: string;
    pins: SessionPins;
    producer: PrincipalIdentity;
    clock: Clock;
    ids: IdFactory;
    schemas: SchemaRegistry;
    redactor: SecretRedactor;
  }) {
    this.#sessionId = input.sessionId;
    this.#pins = input.pins;
    this.#producer = input.producer;
    this.#clock = input.clock;
    this.#ids = input.ids;
    this.#schemas = input.schemas;
    this.#redactor = input.redactor;
    this.#log = new AppendOnlyLog<JsonValue>(input.root, `events.${input.sessionId}`);
  }

  public async emit(input: {
    eventType: string;
    payload: { readonly [key: string]: JsonValue };
    origin: RuntimeEvent["origin"];
    epistemicClass?: EpistemicClass;
    artifactRefs?: readonly ArtifactReference[];
    inference?: InferenceMetadata | null;
  }): Promise<RuntimeEvent> {
    const existing = await this.events();
    const redacted = this.#redactor.redact(input.payload);
    assertCondition(
      typeof redacted.value === "object" &&
        redacted.value !== null &&
        !Array.isArray(redacted.value),
      "SCHEMA_INVALID",
      "Event payload must remain an object",
    );
    const epistemicClass = input.epistemicClass ?? "recorded_observation";
    const inference = input.inference ?? null;
    assertCondition(
      (epistemicClass === "inference") === (inference !== null),
      "SCHEMA_INVALID",
      "Inference metadata and epistemic class disagree",
    );
    const monotonic = this.#clock.monotonicNanos();
    assertCondition(
      monotonic <= BigInt(Number.MAX_SAFE_INTEGER),
      "SCHEMA_INVALID",
      "Monotonic timestamp exceeds I-JSON range",
    );
    const partial = {
      schemaVersion: 2 as const,
      eventId: this.#ids.next("event"),
      protocolId: this.#pins.protocolId,
      sessionId: this.#sessionId,
      harnessVersionId: this.#pins.harnessVersionId,
      runtimeStateSnapshotId: this.#pins.runtimeStateSnapshotId,
      sequence: existing.length,
      occurredAt: this.#clock.now().toISOString(),
      monotonicNanos: Number(monotonic),
      producer: this.#producer,
      origin: input.origin,
      epistemicClass,
      eventType: input.eventType,
      payload: redacted.value,
      payloadHash: sha256(redacted.value),
      previousEventHash: existing.at(-1)?.eventHash ?? null,
      artifactRefs: input.artifactRefs ?? [],
      redaction: {
        containsKnownSecrets: false as const,
        appliedRuleIds: redacted.appliedRuleIds,
        scannerHash: this.#redactor.scannerHash,
      },
      inference,
    };
    const event: RuntimeEvent = {
      ...partial,
      eventHash: sha256(partial),
    };
    this.#schemas.validate(RUNTIME_EVENT_SCHEMA_ID, event as unknown as JsonValue);
    await this.#log.append(event as unknown as JsonValue);
    return event;
  }

  public async events(): Promise<RuntimeEvent[]> {
    const entries = await this.#log.readAll();
    const events: RuntimeEvent[] = [];
    let previousHash: string | null = null;
    for (const [index, entry] of entries.entries()) {
      const event = asEvent(entry.payload);
      this.#schemas.validate(RUNTIME_EVENT_SCHEMA_ID, entry.payload);
      assertCondition(event.sequence === index, "HASH_MISMATCH", "Event sequence mismatch");
      assertCondition(
        event.previousEventHash === previousHash,
        "HASH_MISMATCH",
        "Broken event hash chain",
      );
      assertCondition(event.payloadHash === sha256(event.payload), "HASH_MISMATCH", "Payload changed");
      assertCondition(
        event.eventHash === sha256(eventIdentity(event)),
        "HASH_MISMATCH",
        "Event hash mismatch",
      );
      assertCondition(
        event.protocolId === this.#pins.protocolId &&
          event.harnessVersionId === this.#pins.harnessVersionId &&
          event.runtimeStateSnapshotId === this.#pins.runtimeStateSnapshotId &&
          event.sessionId === this.#sessionId,
        "PROTOCOL_MISMATCH",
        "Event pin mismatch",
      );
      events.push(event);
      previousHash = event.eventHash;
    }
    return events;
  }

  public async headHash(): Promise<string> {
    return (await this.events()).at(-1)?.eventHash ?? sha256({ empty: this.#sessionId });
  }
}
