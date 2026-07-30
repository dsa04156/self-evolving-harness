import path from "node:path";

import { sha256, type JsonValue } from "../core/canonical.js";
import type { Clock, IdFactory } from "../core/determinism.js";
import { assertCondition } from "../core/errors.js";
import { SCHEMA_BASE_URL, type SchemaRegistry } from "../contracts/schema-registry.js";
import type { ComponentType } from "../domain/components.js";
import { type AuditLink, AuditTrail } from "../evidence/audit-trail.js";
import type { EvidenceReceiptStore } from "../evidence/receipts.js";
import type {
  InferenceMetadata,
  RuntimeEvent,
  RuntimeEventStream,
} from "../evidence/runtime-events.js";
import type { HarnessComponentRegistry } from "../harness/component-registry.js";
import { AppendOnlyLog } from "../storage/append-only-log.js";
import type {
  Attestation,
  PrincipalIdentity,
  PrincipalRegistry,
  PrincipalSigner,
} from "../trust/identity.js";

export const FAILURE_PATTERN_SCHEMA_ID =
  `${SCHEMA_BASE_URL}failure-pattern.schema.json`;
export const ATTRIBUTION_RESULT_SCHEMA_ID =
  `${SCHEMA_BASE_URL}attribution-result.schema.json`;

type OriginTrustLevel = RuntimeEvent["origin"]["trustLevel"];
type MutableAttributionType =
  | "SystemPrompt"
  | "ContextPolicy"
  | "MemoryRetrievalPolicy"
  | "Skill"
  | "WorkflowPolicy"
  | "RoutingPolicy"
  | "SubagentPrompt"
  | "ToolDescription";

const MUTABLE_ATTRIBUTION_TYPES = new Set<ComponentType>([
  "SystemPrompt",
  "ContextPolicy",
  "MemoryRetrievalPolicy",
  "Skill",
  "WorkflowPolicy",
  "RoutingPolicy",
  "SubagentPrompt",
  "ToolDescription",
]);

export interface FailurePattern {
  readonly schemaVersion: 2;
  readonly failurePatternId: string;
  readonly protocolId: string;
  readonly harnessVersionId: string;
  readonly datasetRole: "mine";
  readonly sourceReceiptIds: readonly string[];
  readonly recordedObservations: {
    readonly deterministicSignature: string;
    readonly taskCount: number;
    readonly failureCount: number;
    readonly sourceEventIds: readonly string[];
    readonly verifierOutcomeEventIds: readonly string[];
    readonly originTrustLevels: readonly OriginTrustLevel[];
  };
  readonly mechanismInference: {
    readonly summary: string;
    readonly metadata: InferenceMetadata;
  };
  readonly createdBy: PrincipalIdentity;
  readonly createdAt: string;
  readonly auditLink: AuditLink;
  readonly attestation: Attestation;
}

export interface AttributionResult {
  readonly schemaVersion: 2;
  readonly attributionResultId: string;
  readonly protocolId: string;
  readonly harnessVersionId: string;
  readonly failurePatternId: string;
  readonly datasetRole:
    | "mine"
    | "gate"
    | "sealed_test"
    | "withheld_public_test"
    | "temporal_holdout";
  readonly useClass:
    | "proposal_input"
    | "protocol_readiness"
    | "final_reporting";
  readonly epistemicClass: "inference";
  readonly rankedCandidates: readonly {
    readonly rank: number;
    readonly componentId: string;
    readonly componentManifestId: string;
    readonly typeEntryId: string;
    readonly resolvedComponentType: MutableAttributionType;
    readonly score: number;
    readonly hypothesizedMechanism: string;
    readonly sourceEventIds: readonly string[];
    readonly sourceReceiptIds: readonly string[];
  }[];
  readonly metadata: InferenceMetadata;
  readonly producer: PrincipalIdentity;
  readonly createdAt: string;
  readonly auditLink: AuditLink;
  readonly attestation: Attestation;
}

export interface FailureTraceInput {
  readonly taskId: string;
  readonly eventStream: RuntimeEventStream;
  readonly selectedEventIds: readonly string[];
  readonly sourceReceiptIds: readonly string[];
}

interface ValidatedFailureTrace {
  readonly taskId: string;
  readonly signature: string;
  readonly events: readonly RuntimeEvent[];
  readonly receiptIds: readonly string[];
}

type FailurePatternCore = Omit<FailurePattern, "auditLink" | "attestation">;
type FailurePatternBody = Omit<FailurePattern, "attestation">;
type AttributionCore = Omit<AttributionResult, "auditLink" | "attestation">;
type AttributionBody = Omit<AttributionResult, "attestation">;

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

function patternCore(pattern: FailurePattern): FailurePatternCore {
  const { auditLink: _auditLink, attestation: _attestation, ...core } = pattern;
  return core;
}

function patternBody(pattern: FailurePattern): FailurePatternBody {
  const { attestation: _attestation, ...body } = pattern;
  return body;
}

function attributionCore(result: AttributionResult): AttributionCore {
  const { auditLink: _auditLink, attestation: _attestation, ...core } = result;
  return core;
}

function attributionBody(result: AttributionResult): AttributionBody {
  const { attestation: _attestation, ...body } = result;
  return body;
}

function asPattern(value: JsonValue): FailurePattern {
  return value as unknown as FailurePattern;
}

function asAttribution(value: JsonValue): AttributionResult {
  return value as unknown as AttributionResult;
}

export class WeaknessMiningService {
  readonly #protocolId: string;
  readonly #harnessVersionId: string;
  readonly #schemas: SchemaRegistry;
  readonly #audit: AuditTrail;
  readonly #receipts: EvidenceReceiptStore;
  readonly #principals: PrincipalRegistry;
  readonly #signer: PrincipalSigner;
  readonly #clock: Clock;
  readonly #ids: IdFactory;
  readonly #log: AppendOnlyLog<JsonValue>;

  public constructor(input: {
    root: string;
    protocolId: string;
    harnessVersionId: string;
    schemas: SchemaRegistry;
    audit: AuditTrail;
    receipts: EvidenceReceiptStore;
    principals: PrincipalRegistry;
    signer: PrincipalSigner;
    clock: Clock;
    ids: IdFactory;
  }) {
    assertCondition(
      input.signer.identity.role === "proposer",
      "AUTHORIZATION_DENIED",
      "Weakness mining requires proposer identity",
    );
    this.#protocolId = input.protocolId;
    this.#harnessVersionId = input.harnessVersionId;
    this.#schemas = input.schemas;
    this.#audit = input.audit;
    this.#receipts = input.receipts;
    this.#principals = input.principals;
    this.#signer = input.signer;
    this.#clock = input.clock;
    this.#ids = input.ids;
    this.#log = new AppendOnlyLog<JsonValue>(
      path.join(input.root, "evolution"),
      "failure.patterns",
    );
  }

  public async mine(traces: readonly FailureTraceInput[]): Promise<FailurePattern[]> {
    assertCondition(traces.length > 0, "SCHEMA_INVALID", "No failure traces supplied");
    const validated = await Promise.all(
      traces.map((trace) => this.#validateTrace(trace)),
    );
    const groups = new Map<string, ValidatedFailureTrace[]>();
    for (const trace of validated) {
      const group = groups.get(trace.signature) ?? [];
      group.push(trace);
      groups.set(trace.signature, group);
    }
    const patterns: FailurePattern[] = [];
    for (const [signature, group] of [...groups.entries()].sort(([left], [right]) =>
      left.localeCompare(right),
    )) {
      const sourceEvents = group.flatMap((trace) => trace.events);
      const sourceEventIds = uniqueSorted(sourceEvents.map((event) => event.eventId));
      const verifierOutcomeEventIds = uniqueSorted(
        sourceEvents
          .filter((event) => event.epistemicClass === "verifier_outcome")
          .map((event) => event.eventId),
      );
      const sourceReceiptIds = uniqueSorted(
        group.flatMap((trace) => trace.receiptIds),
      );
      const metadata: InferenceMetadata = {
        sourceEventIds,
        sourceReceiptIds,
        confidence: 0.5,
        alternativeExplanations: [
          "The same surface failure may be produced by more than one harness component.",
        ],
        producerIdentity: this.#signer.identity,
        method: "deterministic-signature-cluster-v1",
      };
      const core: FailurePatternCore = {
        schemaVersion: 2,
        failurePatternId: this.#ids.next("failure-pattern"),
        protocolId: this.#protocolId,
        harnessVersionId: this.#harnessVersionId,
        datasetRole: "mine",
        sourceReceiptIds,
        recordedObservations: {
          deterministicSignature: signature,
          taskCount: new Set(group.map((trace) => trace.taskId)).size,
          failureCount: group.length,
          sourceEventIds,
          verifierOutcomeEventIds,
          originTrustLevels: uniqueSorted(
            sourceEvents.map((event) => event.origin.trustLevel),
          ) as OriginTrustLevel[],
        },
        mechanismInference: {
          summary:
            `Repeated failure cluster ${signature}; component causality remains a hypothesis.`,
          metadata,
        },
        createdBy: this.#signer.identity,
        createdAt: this.#clock.now().toISOString(),
      };
      const auditLink = await this.#audit.appendSubject({
        subjectType: "FailurePattern",
        subjectId: core.failurePatternId,
        subjectHash: sha256(core),
      });
      const body: FailurePatternBody = { ...core, auditLink };
      const pattern: FailurePattern = {
        ...body,
        attestation: this.#signer.attest(body as unknown as JsonValue),
      };
      this.#schemas.validate(
        FAILURE_PATTERN_SCHEMA_ID,
        pattern as unknown as JsonValue,
      );
      await this.#log.append(pattern as unknown as JsonValue);
      patterns.push(pattern);
    }
    return patterns;
  }

  public async get(failurePatternId: string): Promise<FailurePattern> {
    const pattern = (await this.all()).find(
      (candidate) => candidate.failurePatternId === failurePatternId,
    );
    assertCondition(
      pattern !== undefined,
      "ARTIFACT_UNAVAILABLE",
      `Missing failure pattern ${failurePatternId}`,
    );
    await this.verify(pattern);
    return pattern;
  }

  public async all(): Promise<FailurePattern[]> {
    return (await this.#log.readAll()).map((record) => asPattern(record.payload));
  }

  public async verify(pattern: FailurePattern): Promise<void> {
    this.#schemas.validate(
      FAILURE_PATTERN_SCHEMA_ID,
      pattern as unknown as JsonValue,
    );
    assertCondition(
      pattern.protocolId === this.#protocolId &&
        pattern.harnessVersionId === this.#harnessVersionId &&
        pattern.datasetRole === "mine",
      "PROTOCOL_MISMATCH",
      "Failure pattern pin mismatch",
    );
    assertCondition(
      pattern.createdBy.role === "proposer",
      "AUTHORIZATION_DENIED",
      "Failure pattern signer is not proposer",
    );
    this.#principals.verify(
      pattern.createdBy,
      patternBody(pattern) as unknown as JsonValue,
      pattern.attestation,
    );
    await this.#audit.verifyLink(pattern.auditLink, {
      subjectType: "FailurePattern",
      subjectId: pattern.failurePatternId,
      subjectHash: sha256(patternCore(pattern)),
    });
    for (const receiptId of pattern.sourceReceiptIds) {
      const receipt = await this.#receipts.get(receiptId);
      await this.#receipts.verify(receipt);
      assertCondition(
        receipt.harnessVersionIds.includes(this.#harnessVersionId),
        "HASH_MISMATCH",
        "Failure-pattern receipt does not bind the harness",
      );
    }
  }

  public async verifyAll(): Promise<void> {
    for (const pattern of await this.all()) await this.verify(pattern);
  }

  async #validateTrace(trace: FailureTraceInput): Promise<ValidatedFailureTrace> {
    assertCondition(
      trace.selectedEventIds.length > 0 && trace.sourceReceiptIds.length > 0,
      "SCHEMA_INVALID",
      "Failure trace must cite events and receipts",
    );
    const allEvents = await trace.eventStream.events();
    const byId = new Map(allEvents.map((event) => [event.eventId, event]));
    const selected = uniqueSorted(trace.selectedEventIds).map((eventId) => {
      const event = byId.get(eventId);
      assertCondition(
        event !== undefined,
        "ARTIFACT_UNAVAILABLE",
        `Failure source event ${eventId} is missing`,
      );
      return event;
    });
    assertCondition(
      selected.every(
        (event) =>
          event.protocolId === this.#protocolId &&
          event.harnessVersionId === this.#harnessVersionId &&
          event.epistemicClass !== "inference",
      ),
      "PROTOCOL_MISMATCH",
      "Failure facts include an inference or a foreign pin",
    );
    assertCondition(
      selected.some((event) => event.epistemicClass === "verifier_outcome"),
      "SCHEMA_INVALID",
      "Failure trace lacks a verifier outcome",
    );
    const streamHeadHash = await trace.eventStream.headHash();
    const receipts = await Promise.all(
      uniqueSorted(trace.sourceReceiptIds).map(async (receiptId) => {
        const receipt = await this.#receipts.get(receiptId);
        await this.#receipts.verify(receipt);
        assertCondition(
          receipt.harnessVersionIds.includes(this.#harnessVersionId),
          "HASH_MISMATCH",
          "Failure-trace receipt does not bind the harness",
        );
        return receipt;
      }),
    );
    for (const event of selected) {
      const bound = receipts.some((receipt) => {
        const classified =
          event.epistemicClass === "verifier_outcome"
            ? receipt.verifierOutcomeEventIds.includes(event.eventId)
            : receipt.recordedObservationEventIds.includes(event.eventId);
        const range = receipt.eventRanges.some(
          (candidate) =>
            candidate.sessionId === event.sessionId &&
            candidate.firstSequence <= event.sequence &&
            candidate.lastSequence >= event.sequence &&
            candidate.headHash === streamHeadHash,
        );
        return classified && range;
      });
      assertCondition(
        bound,
        "HASH_MISMATCH",
        `Event ${event.eventId} is not bound by a cited receipt and chain head`,
      );
    }
    const signatureProjection = selected.map((event) => ({
      eventType: event.eventType,
      epistemicClass: event.epistemicClass,
      payload: event.payload,
    }));
    return {
      taskId: trace.taskId,
      signature: `failure-${sha256(signatureProjection)}`,
      events: selected,
      receiptIds: uniqueSorted(trace.sourceReceiptIds),
    };
  }
}

export class AttributionService {
  readonly #protocolId: string;
  readonly #schemas: SchemaRegistry;
  readonly #audit: AuditTrail;
  readonly #patterns: WeaknessMiningService;
  readonly #components: HarnessComponentRegistry;
  readonly #principals: PrincipalRegistry;
  readonly #signer: PrincipalSigner;
  readonly #clock: Clock;
  readonly #ids: IdFactory;
  readonly #log: AppendOnlyLog<JsonValue>;

  public constructor(input: {
    root: string;
    protocolId: string;
    schemas: SchemaRegistry;
    audit: AuditTrail;
    patterns: WeaknessMiningService;
    components: HarnessComponentRegistry;
    principals: PrincipalRegistry;
    signer: PrincipalSigner;
    clock: Clock;
    ids: IdFactory;
  }) {
    assertCondition(
      input.signer.identity.role === "proposer",
      "AUTHORIZATION_DENIED",
      "Attribution requires proposer identity",
    );
    this.#protocolId = input.protocolId;
    this.#schemas = input.schemas;
    this.#audit = input.audit;
    this.#patterns = input.patterns;
    this.#components = input.components;
    this.#principals = input.principals;
    this.#signer = input.signer;
    this.#clock = input.clock;
    this.#ids = input.ids;
    this.#log = new AppendOnlyLog<JsonValue>(
      path.join(input.root, "evolution"),
      "attribution.results",
    );
  }

  public async attribute(input: {
    failurePatternId: string;
    datasetRole: AttributionResult["datasetRole"];
    useClass: AttributionResult["useClass"];
    candidates: readonly {
      readonly componentManifestId: string;
      readonly score: number;
      readonly hypothesizedMechanism: string;
    }[];
    confidence: number;
    alternativeExplanations: readonly string[];
    method: string;
  }): Promise<AttributionResult> {
    const pattern = await this.#patterns.get(input.failurePatternId);
    assertCondition(
      input.candidates.length >= 1 && input.candidates.length <= 8,
      "SCHEMA_INVALID",
      "Attribution needs one to eight candidates",
    );
    assertCondition(
      (input.useClass === "proposal_input" && input.datasetRole === "mine") ||
        (input.useClass === "protocol_readiness" && input.datasetRole === "gate") ||
        (input.useClass === "final_reporting" &&
          ["sealed_test", "withheld_public_test", "temporal_holdout"].includes(
            input.datasetRole,
          )),
      "AUTHORIZATION_DENIED",
      "Attribution use class cannot consume this dataset role",
    );
    const harness = this.#components.getHarness(pattern.harnessVersionId);
    const boundIds = new Set(
      harness.identity.componentBindings.map(
        (binding) => binding.component.componentManifestId,
      ),
    );
    const seen = new Set<string>();
    let previousScore = 1;
    const rankedCandidates = input.candidates.map((candidate, index) => {
      assertCondition(
        !seen.has(candidate.componentManifestId),
        "SCHEMA_INVALID",
        "Duplicate attribution candidate",
      );
      seen.add(candidate.componentManifestId);
      assertCondition(
        boundIds.has(candidate.componentManifestId),
        "AUTHORIZATION_DENIED",
        "Attribution candidate is not bound by the harness",
      );
      assertCondition(
        candidate.score >= 0 &&
          candidate.score <= 1 &&
          candidate.score <= previousScore,
        "SCHEMA_INVALID",
        "Attribution scores must be descending probabilities",
      );
      previousScore = candidate.score;
      const component = this.#components.getComponent(candidate.componentManifestId);
      const type = this.#components.typeEntry(
        component.identity.typeRegistryRef.typeEntryId,
      );
      assertCondition(
        MUTABLE_ATTRIBUTION_TYPES.has(type.componentType as ComponentType) &&
          type.mutableClass === "mutable" &&
          type.mvpMutationEnabled,
        "AUTHORIZATION_DENIED",
        "Attribution proposal targets an immutable or disabled component",
      );
      return {
        rank: index + 1,
        componentId: component.identity.componentId,
        componentManifestId: component.componentManifestId,
        typeEntryId: component.identity.typeRegistryRef.typeEntryId,
        resolvedComponentType: type.componentType as MutableAttributionType,
        score: candidate.score,
        hypothesizedMechanism: candidate.hypothesizedMechanism,
        sourceEventIds: [...pattern.recordedObservations.sourceEventIds],
        sourceReceiptIds: [...pattern.sourceReceiptIds],
      };
    });
    const metadata: InferenceMetadata = {
      sourceEventIds: [...pattern.recordedObservations.sourceEventIds],
      sourceReceiptIds: [...pattern.sourceReceiptIds],
      confidence: input.confidence,
      alternativeExplanations: [...input.alternativeExplanations],
      producerIdentity: this.#signer.identity,
      method: input.method,
    };
    const core: AttributionCore = {
      schemaVersion: 2,
      attributionResultId: this.#ids.next("attribution-result"),
      protocolId: this.#protocolId,
      harnessVersionId: pattern.harnessVersionId,
      failurePatternId: pattern.failurePatternId,
      datasetRole: input.datasetRole,
      useClass: input.useClass,
      epistemicClass: "inference",
      rankedCandidates,
      metadata,
      producer: this.#signer.identity,
      createdAt: this.#clock.now().toISOString(),
    };
    const auditLink = await this.#audit.appendSubject({
      subjectType: "AttributionResult",
      subjectId: core.attributionResultId,
      subjectHash: sha256(core),
    });
    const body: AttributionBody = { ...core, auditLink };
    const result: AttributionResult = {
      ...body,
      attestation: this.#signer.attest(body as unknown as JsonValue),
    };
    this.#schemas.validate(
      ATTRIBUTION_RESULT_SCHEMA_ID,
      result as unknown as JsonValue,
    );
    await this.#log.append(result as unknown as JsonValue);
    return result;
  }

  public async all(): Promise<AttributionResult[]> {
    return (await this.#log.readAll()).map((record) =>
      asAttribution(record.payload),
    );
  }

  public async get(attributionResultId: string): Promise<AttributionResult> {
    const result = (await this.all()).find(
      (candidate) => candidate.attributionResultId === attributionResultId,
    );
    assertCondition(
      result !== undefined,
      "ARTIFACT_UNAVAILABLE",
      `Missing attribution result ${attributionResultId}`,
    );
    await this.verify(result);
    return result;
  }

  public async verify(result: AttributionResult): Promise<void> {
    this.#schemas.validate(
      ATTRIBUTION_RESULT_SCHEMA_ID,
      result as unknown as JsonValue,
    );
    assertCondition(
      result.protocolId === this.#protocolId &&
        result.epistemicClass === "inference" &&
        result.producer.role === "proposer",
      "PROTOCOL_MISMATCH",
      "Attribution result pin mismatch",
    );
    const pattern = await this.#patterns.get(result.failurePatternId);
    assertCondition(
      pattern.harnessVersionId === result.harnessVersionId &&
        result.metadata.sourceEventIds.every((eventId) =>
          pattern.recordedObservations.sourceEventIds.includes(eventId),
        ) &&
        result.metadata.sourceReceiptIds.every((receiptId) =>
          pattern.sourceReceiptIds.includes(receiptId),
        ),
      "HASH_MISMATCH",
      "Attribution sources are not a subset of the failure pattern",
    );
    this.#principals.verify(
      result.producer,
      attributionBody(result) as unknown as JsonValue,
      result.attestation,
    );
    await this.#audit.verifyLink(result.auditLink, {
      subjectType: "AttributionResult",
      subjectId: result.attributionResultId,
      subjectHash: sha256(attributionCore(result)),
    });
  }

  public async verifyAll(): Promise<void> {
    for (const result of await this.all()) await this.verify(result);
  }
}
