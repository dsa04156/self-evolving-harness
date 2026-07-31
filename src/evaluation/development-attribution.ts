import {
  canonicalize,
  sha256,
  type JsonValue,
} from "../core/canonical.js";
import { assertCondition } from "../core/errors.js";
import {
  SCHEMA_BASE_URL,
  type SchemaRegistry,
} from "../contracts/schema-registry.js";
import {
  PrincipalRegistry,
  type Attestation,
  type PrincipalIdentity,
  type PrincipalSigner,
  type PublicPrincipal,
} from "../trust/identity.js";
import type {
  LabelBlindAttributionCorpus,
  LabelBlindAttributionInput,
} from "./hfb-label-blind-adapter.js";

export const DEVELOPMENT_ATTRIBUTION_PROTOTYPE_SCHEMA_ID =
  `${SCHEMA_BASE_URL}development-attribution-prototype.schema.json`;
export const DEVELOPMENT_ATTRIBUTION_PREDICTION_SET_SCHEMA_ID =
  `${SCHEMA_BASE_URL}development-attribution-prediction-set.schema.json`;
export const DEVELOPMENT_ATTRIBUTION_COMMITMENT_SCHEMA_ID =
  `${SCHEMA_BASE_URL}development-attribution-commitment.schema.json`;
export const LABEL_BLIND_CORPUS_SCHEMA_ID =
  `${SCHEMA_BASE_URL}benchmarks/hfb-label-blind-attribution-corpus.schema.json`;

export const DEVELOPMENT_ATTRIBUTION_LABELS = [
  "SystemPrompt",
  "ContextPolicy",
  "MemoryRetrievalPolicy",
  "Skill",
  "WorkflowPolicy",
  "RoutingPolicy",
  "SubagentPrompt",
  "ToolDescription",
] as const;

export type DevelopmentAttributionLabel =
  (typeof DEVELOPMENT_ATTRIBUTION_LABELS)[number];
export type DevelopmentPredictionStatus =
  | "predicted"
  | "abstained"
  | "invalid_output"
  | "failure"
  | "timeout";

export interface DevelopmentAttributionPrototypeManifest {
  readonly schemaVersion: 1;
  readonly prototypeId: string;
  readonly semanticVersion: string;
  readonly implementationHash: string;
  readonly approvedCorpusHash: string;
  readonly inputContract: {
    readonly schemaId: string;
    readonly accessibleArtifactKinds:
      readonly ["label_blind_attribution_corpus"];
    readonly forbiddenArtifactKinds: readonly [
      "oracle_package",
      "raw_semantic_execution_package",
      "target_diff",
      "manifest_pairing",
      "fixture_mechanism",
      "expected_outcome",
    ];
  };
  readonly configuration: {
    readonly rulesVersion: "behavioral-heuristic-v1";
    readonly rankLimit: 8;
    readonly minimumEvidenceSignals: number;
    readonly timeoutMillis: number;
  };
  readonly claimBoundary: DevelopmentClaimBoundary;
  readonly manifestHash: string;
}

export interface DevelopmentClaimBoundary {
  readonly developmentOnly: true;
  readonly confirmatory: false;
  readonly publicVisibleFixtures: true;
  readonly authorizedForResearchEvidence: false;
  readonly attributionPerformanceClaim: false;
}

export interface DevelopmentAttributionPrediction {
  readonly traceProjectionId: string;
  readonly occurrenceCount: number;
  readonly status: DevelopmentPredictionStatus;
  readonly rankedComponentTypes: readonly {
    readonly rank: number;
    readonly componentType: DevelopmentAttributionLabel;
    readonly scoreMicros: number;
    readonly evidenceCodes: readonly string[];
  }[];
  readonly diagnosticCodes: readonly string[];
  readonly terminalReason: string | null;
}

export interface DevelopmentAttributionPredictionSet {
  readonly schemaVersion: 1;
  readonly runId: string;
  readonly prototypeManifestHash: string;
  readonly corpusHash: string;
  readonly generatedAt: string;
  readonly priorDiagnosticResultsVisible: boolean;
  readonly predictions: readonly DevelopmentAttributionPrediction[];
  readonly statusCounts: Readonly<
    Record<DevelopmentPredictionStatus, number>
  >;
  readonly occurrenceStatusCounts: Readonly<
    Record<DevelopmentPredictionStatus, number>
  >;
  readonly predictionSetHash: string;
}

export interface DevelopmentAttributionCommitment {
  readonly schemaVersion: 1;
  readonly commitmentId: string;
  readonly predictionSetHash: string;
  readonly prototypeManifestHash: string;
  readonly corpusHash: string;
  readonly predictionCount: number;
  readonly occurrenceCount: number;
  readonly statusCounts: Readonly<
    Record<DevelopmentPredictionStatus, number>
  >;
  readonly priorDiagnosticResultsVisible: boolean;
  readonly claimBoundary: DevelopmentClaimBoundary;
  readonly sealedAt: string;
  readonly producer: PrincipalIdentity;
  readonly commitmentHash: string;
  readonly publicPrincipal: PublicPrincipal;
  readonly attestation: Attestation;
}

type PrototypeCore = Omit<
  DevelopmentAttributionPrototypeManifest,
  "manifestHash"
>;
type PredictionSetCore = Omit<
  DevelopmentAttributionPredictionSet,
  "predictionSetHash"
>;
type CommitmentCore = Omit<
  DevelopmentAttributionCommitment,
  "commitmentHash" | "publicPrincipal" | "attestation"
>;
type CommitmentSignedBody = Omit<
  DevelopmentAttributionCommitment,
  "attestation"
>;

const CLAIM_BOUNDARY: DevelopmentClaimBoundary = {
  developmentOnly: true,
  confirmatory: false,
  publicVisibleFixtures: true,
  authorizedForResearchEvidence: false,
  attributionPerformanceClaim: false,
};

const STATUSES: readonly DevelopmentPredictionStatus[] = [
  "predicted",
  "abstained",
  "invalid_output",
  "failure",
  "timeout",
];

function emptyStatusCounts(): Record<
  DevelopmentPredictionStatus,
  number
> {
  return {
    predicted: 0,
    abstained: 0,
    invalid_output: 0,
    failure: 0,
    timeout: 0,
  };
}

function corpusCore(
  corpus: LabelBlindAttributionCorpus,
): Omit<LabelBlindAttributionCorpus, "corpusHash"> {
  const { corpusHash: _corpusHash, ...core } = corpus;
  return core;
}

function manifestCore(
  manifest: DevelopmentAttributionPrototypeManifest,
): PrototypeCore {
  const { manifestHash: _manifestHash, ...core } = manifest;
  return core;
}

function predictionSetCore(
  value: DevelopmentAttributionPredictionSet,
): PredictionSetCore {
  const { predictionSetHash: _predictionSetHash, ...core } = value;
  return core;
}

function commitmentCore(
  value: DevelopmentAttributionCommitment,
): CommitmentCore {
  const {
    commitmentHash: _commitmentHash,
    publicPrincipal: _publicPrincipal,
    attestation: _attestation,
    ...core
  } = value;
  return core;
}

function commitmentSignedBody(
  value: DevelopmentAttributionCommitment,
): CommitmentSignedBody {
  const { attestation: _attestation, ...body } = value;
  return body;
}

export function createDevelopmentAttributionPrototypeManifest(
  input: {
    readonly prototypeId: string;
    readonly semanticVersion: string;
    readonly implementationHash: string;
    readonly approvedCorpusHash: string;
    readonly minimumEvidenceSignals?: number;
    readonly timeoutMillis?: number;
  },
): DevelopmentAttributionPrototypeManifest {
  const core: PrototypeCore = {
    schemaVersion: 1,
    prototypeId: input.prototypeId,
    semanticVersion: input.semanticVersion,
    implementationHash: input.implementationHash,
    approvedCorpusHash: input.approvedCorpusHash,
    inputContract: {
      schemaId: LABEL_BLIND_CORPUS_SCHEMA_ID,
      accessibleArtifactKinds: [
        "label_blind_attribution_corpus",
      ],
      forbiddenArtifactKinds: [
        "oracle_package",
        "raw_semantic_execution_package",
        "target_diff",
        "manifest_pairing",
        "fixture_mechanism",
        "expected_outcome",
      ],
    },
    configuration: {
      rulesVersion: "behavioral-heuristic-v1",
      rankLimit: 8,
      minimumEvidenceSignals:
        input.minimumEvidenceSignals ?? 1,
      timeoutMillis: input.timeoutMillis ?? 1_000,
    },
    claimBoundary: CLAIM_BOUNDARY,
  };
  return {
    ...core,
    manifestHash: sha256(core as unknown as JsonValue),
  };
}

export function verifyDevelopmentAttributionPrototypeManifest(
  input: {
    readonly manifest: DevelopmentAttributionPrototypeManifest;
    readonly schemas: SchemaRegistry;
  },
): void {
  input.schemas.validate(
    DEVELOPMENT_ATTRIBUTION_PROTOTYPE_SCHEMA_ID,
    input.manifest as unknown as JsonValue,
  );
  assertCondition(
    input.manifest.manifestHash ===
      sha256(
        manifestCore(input.manifest) as unknown as JsonValue,
      ),
    "HASH_MISMATCH",
    "Development attribution prototype manifest hash mismatch",
  );
}

function addSignal(
  scores: Map<DevelopmentAttributionLabel, number>,
  evidence: Map<DevelopmentAttributionLabel, Set<string>>,
  label: DevelopmentAttributionLabel,
  amount: number,
  code: string,
): void {
  scores.set(label, (scores.get(label) ?? 100) + amount);
  const codes = evidence.get(label) ?? new Set<string>();
  codes.add(code);
  evidence.set(label, codes);
}

function selectedSourceCount(
  trace: LabelBlindAttributionInput,
  source: string,
): number {
  let count = 0;
  for (const observation of trace.observations) {
    if (observation.eventType !== "context_constructed") continue;
    const entryCounts = observation.facts["entryCounts"];
    if (
      typeof entryCounts !== "object" ||
      entryCounts === null ||
      Array.isArray(entryCounts)
    ) {
      continue;
    }
    for (const [key, value] of Object.entries(entryCounts)) {
      if (
        key.startsWith(`${source}:`) &&
        key.endsWith(":selected") &&
        typeof value === "number"
      ) {
        count += value;
      }
    }
  }
  return count;
}

function traceSignals(trace: LabelBlindAttributionInput): {
  readonly scores: Map<DevelopmentAttributionLabel, number>;
  readonly evidence: Map<
    DevelopmentAttributionLabel,
    Set<string>
  >;
  readonly diagnosticCodes: readonly string[];
} {
  const scores = new Map<DevelopmentAttributionLabel, number>(
    DEVELOPMENT_ATTRIBUTION_LABELS.map((label) => [
      label,
      100,
    ]),
  );
  const evidence = new Map<
    DevelopmentAttributionLabel,
    Set<string>
  >();
  const diagnostics = new Set<string>();

  if (trace.routing.targetKind === "subagent") {
    addSignal(
      scores,
      evidence,
      "RoutingPolicy",
      700,
      "route:subagent",
    );
    addSignal(
      scores,
      evidence,
      "SubagentPrompt",
      650,
      "route:subagent-context",
    );
    diagnostics.add("subagent-route-observed");
  }
  if (
    trace.workflow.fromClass !== "start" ||
    trace.workflow.toClass !== "context" ||
    !trace.workflow.dispatchedActions.includes(
      "construct_context",
    )
  ) {
    addSignal(
      scores,
      evidence,
      "WorkflowPolicy",
      900,
      "workflow:non-default-transition",
    );
    diagnostics.add("non-default-workflow");
  }

  const sourceRules: readonly [
    string,
    DevelopmentAttributionLabel,
    number,
  ][] = [
    ["system_prompt", "SystemPrompt", 400],
    ["selected_memory", "MemoryRetrievalPolicy", 650],
    ["selected_skills", "Skill", 600],
    ["tool_catalog", "ToolDescription", 500],
  ];
  for (const [source, label, amount] of sourceRules) {
    const count = selectedSourceCount(trace, source);
    if (count > 0) {
      addSignal(
        scores,
        evidence,
        label,
        amount + Math.min(count, 4) * 25,
        `context:${source}:selected`,
      );
      diagnostics.add(`context-source:${source}`);
    }
  }
  if (
    selectedSourceCount(trace, "task_input") === 0 ||
    selectedSourceCount(trace, "tool_catalog") === 0
  ) {
    addSignal(
      scores,
      evidence,
      "ContextPolicy",
      700,
      "context:required-source-absent",
    );
    diagnostics.add("required-context-source-absent");
  }

  for (const observation of trace.observations) {
    if (observation.eventType === "tool_call_requested") {
      addSignal(
        scores,
        evidence,
        "Skill",
        250,
        "tool:call-requested",
      );
      addSignal(
        scores,
        evidence,
        "ToolDescription",
        300,
        "tool:call-requested",
      );
      diagnostics.add("tool-call-observed");
    }
    if (
      observation.eventType === "tool_call_completed" &&
      observation.facts["ok"] === false
    ) {
      addSignal(
        scores,
        evidence,
        "ToolDescription",
        500,
        "tool:call-failed",
      );
      diagnostics.add("tool-call-failed");
    }
    if (observation.eventType === "runtime_failure_observed") {
      addSignal(
        scores,
        evidence,
        "ContextPolicy",
        200,
        "runtime:failure-observed",
      );
      diagnostics.add("runtime-failure-observed");
    }
  }

  if (
    trace.providerRequestMatches.some((matched) => !matched)
  ) {
    diagnostics.add("canonical-request-unmatched");
    addSignal(
      scores,
      evidence,
      "SystemPrompt",
      100,
      "provider:request-unmatched",
    );
    addSignal(
      scores,
      evidence,
      "ContextPolicy",
      100,
      "provider:request-unmatched",
    );
  }
  if (
    trace.outcome.state === "terminated" &&
    trace.providerRequestMatches.every(Boolean)
  ) {
    addSignal(
      scores,
      evidence,
      "Skill",
      450,
      "terminal:matched-request-chain",
    );
    diagnostics.add("matched-chain-terminated");
  }

  return {
    scores,
    evidence,
    diagnosticCodes: [...diagnostics].sort(),
  };
}

function predictTrace(input: {
  readonly trace: LabelBlindAttributionInput;
  readonly occurrenceCount: number;
  readonly minimumEvidenceSignals: number;
}): DevelopmentAttributionPrediction {
  const signals = traceSignals(input.trace);
  const evidenceSignalCount = new Set(
    [...signals.evidence.values()].flatMap((values) => [
      ...values,
    ]),
  ).size;
  if (
    input.trace.observations.length === 0 ||
    evidenceSignalCount < input.minimumEvidenceSignals
  ) {
    return {
      traceProjectionId: input.trace.traceProjectionId,
      occurrenceCount: input.occurrenceCount,
      status: "abstained",
      rankedComponentTypes: [],
      diagnosticCodes: signals.diagnosticCodes,
      terminalReason: "insufficient_behavioral_evidence",
    };
  }
  const ordered = DEVELOPMENT_ATTRIBUTION_LABELS.map(
    (componentType) => ({
      componentType,
      raw: signals.scores.get(componentType) ?? 100,
      evidenceCodes: [
        ...(signals.evidence.get(componentType) ??
          new Set<string>()),
      ].sort(),
    }),
  ).sort(
    (left, right) =>
      right.raw - left.raw ||
      left.componentType.localeCompare(right.componentType),
  );
  const maximum = ordered[0]!.raw;
  return {
    traceProjectionId: input.trace.traceProjectionId,
    occurrenceCount: input.occurrenceCount,
    status: "predicted",
    rankedComponentTypes: ordered.map(
      (entry, index) => ({
        rank: index + 1,
        componentType: entry.componentType,
        scoreMicros: Math.floor(
          (entry.raw * 900_000) / maximum,
        ),
        evidenceCodes: entry.evidenceCodes,
      }),
    ),
    diagnosticCodes: signals.diagnosticCodes,
    terminalReason: null,
  };
}

export class DeterministicLabelBlindAttributor {
  readonly #manifest: DevelopmentAttributionPrototypeManifest;
  readonly #schemas: SchemaRegistry;

  public constructor(input: {
    readonly manifest: DevelopmentAttributionPrototypeManifest;
    readonly schemas: SchemaRegistry;
  }) {
    verifyDevelopmentAttributionPrototypeManifest(input);
    this.#manifest = input.manifest;
    this.#schemas = input.schemas;
  }

  public run(input: {
    readonly runId: string;
    readonly corpus: LabelBlindAttributionCorpus;
    readonly generatedAt: string;
    readonly priorDiagnosticResultsVisible: boolean;
  }): DevelopmentAttributionPredictionSet {
    this.#schemas.validate(
      LABEL_BLIND_CORPUS_SCHEMA_ID,
      input.corpus as unknown as JsonValue,
    );
    assertCondition(
      input.corpus.corpusHash ===
        sha256(
          corpusCore(input.corpus) as unknown as JsonValue,
        ) &&
        input.corpus.corpusHash ===
          this.#manifest.approvedCorpusHash,
      "HASH_MISMATCH",
      "Attributor input is not the approved committed corpus",
    );

    const predictions = input.corpus.traces.map((entry) => {
      try {
        return predictTrace({
          trace: entry.trace,
          occurrenceCount: entry.occurrenceCount,
          minimumEvidenceSignals:
            this.#manifest.configuration
              .minimumEvidenceSignals,
        });
      } catch {
        return {
          traceProjectionId: entry.trace.traceProjectionId,
          occurrenceCount: entry.occurrenceCount,
          status: "failure" as const,
          rankedComponentTypes: [],
          diagnosticCodes: [],
          terminalReason: "prototype_execution_failure",
        };
      }
    });
    const statusCounts = emptyStatusCounts();
    const occurrenceStatusCounts = emptyStatusCounts();
    for (const prediction of predictions) {
      statusCounts[prediction.status] += 1;
      occurrenceStatusCounts[prediction.status] +=
        prediction.occurrenceCount;
    }
    const core: PredictionSetCore = {
      schemaVersion: 1,
      runId: input.runId,
      prototypeManifestHash: this.#manifest.manifestHash,
      corpusHash: input.corpus.corpusHash,
      generatedAt: input.generatedAt,
      priorDiagnosticResultsVisible:
        input.priorDiagnosticResultsVisible,
      predictions,
      statusCounts,
      occurrenceStatusCounts,
    };
    const result: DevelopmentAttributionPredictionSet = {
      ...core,
      predictionSetHash: sha256(
        core as unknown as JsonValue,
      ),
    };
    verifyDevelopmentAttributionPredictionSet({
      value: result,
      manifest: this.#manifest,
      corpus: input.corpus,
      schemas: this.#schemas,
    });
    return result;
  }
}

export function verifyDevelopmentAttributionPredictionSet(
  input: {
    readonly value: DevelopmentAttributionPredictionSet;
    readonly manifest: DevelopmentAttributionPrototypeManifest;
    readonly corpus: LabelBlindAttributionCorpus;
    readonly schemas: SchemaRegistry;
  },
): void {
  input.schemas.validate(
    DEVELOPMENT_ATTRIBUTION_PREDICTION_SET_SCHEMA_ID,
    input.value as unknown as JsonValue,
  );
  verifyDevelopmentAttributionPrototypeManifest({
    manifest: input.manifest,
    schemas: input.schemas,
  });
  assertCondition(
    input.value.predictionSetHash ===
      sha256(
        predictionSetCore(input.value) as unknown as JsonValue,
      ) &&
      input.value.prototypeManifestHash ===
        input.manifest.manifestHash &&
      input.value.corpusHash === input.corpus.corpusHash,
    "HASH_MISMATCH",
    "Development attribution prediction-set binding mismatch",
  );
  const corpusIds = input.corpus.traces.map(
    (entry) => entry.trace.traceProjectionId,
  );
  const predictionIds = input.value.predictions.map(
    (entry) => entry.traceProjectionId,
  );
  assertCondition(
    canonicalize(corpusIds) === canonicalize(predictionIds),
    "SCHEMA_INVALID",
    "Prediction set must record every committed corpus trace in order",
  );
  const statusCounts = emptyStatusCounts();
  const occurrenceStatusCounts = emptyStatusCounts();
  for (const prediction of input.value.predictions) {
    statusCounts[prediction.status] += 1;
    occurrenceStatusCounts[prediction.status] +=
      prediction.occurrenceCount;
    if (prediction.status === "predicted") {
      assertCondition(
        prediction.rankedComponentTypes.length ===
          DEVELOPMENT_ATTRIBUTION_LABELS.length &&
          prediction.rankedComponentTypes.every(
            (entry, index) => entry.rank === index + 1,
          ),
        "SCHEMA_INVALID",
        "Predicted trace must rank every mutable component type",
      );
    } else {
      assertCondition(
        prediction.rankedComponentTypes.length === 0 &&
          prediction.terminalReason !== null,
        "SCHEMA_INVALID",
        "Non-prediction status must be explicit and unranked",
      );
    }
  }
  assertCondition(
    canonicalize(statusCounts) ===
      canonicalize(input.value.statusCounts) &&
      canonicalize(occurrenceStatusCounts) ===
        canonicalize(input.value.occurrenceStatusCounts),
    "HASH_MISMATCH",
    "Prediction status counts do not cover every trace occurrence",
  );
}

export function createDevelopmentAttributionCommitment(input: {
  readonly predictionSet: DevelopmentAttributionPredictionSet;
  readonly manifest: DevelopmentAttributionPrototypeManifest;
  readonly corpus: LabelBlindAttributionCorpus;
  readonly schemas: SchemaRegistry;
  readonly signer: PrincipalSigner;
  readonly commitmentId: string;
  readonly sealedAt: string;
}): DevelopmentAttributionCommitment {
  assertCondition(
    input.signer.identity.role === "proposer",
    "AUTHORIZATION_DENIED",
    "Prediction commitment requires proposer identity",
  );
  verifyDevelopmentAttributionPredictionSet({
    value: input.predictionSet,
    manifest: input.manifest,
    corpus: input.corpus,
    schemas: input.schemas,
  });
  const core: CommitmentCore = {
    schemaVersion: 1,
    commitmentId: input.commitmentId,
    predictionSetHash:
      input.predictionSet.predictionSetHash,
    prototypeManifestHash: input.manifest.manifestHash,
    corpusHash: input.corpus.corpusHash,
    predictionCount: input.predictionSet.predictions.length,
    occurrenceCount: input.predictionSet.predictions.reduce(
      (sum, entry) => sum + entry.occurrenceCount,
      0,
    ),
    statusCounts: input.predictionSet.statusCounts,
    priorDiagnosticResultsVisible:
      input.predictionSet.priorDiagnosticResultsVisible,
    claimBoundary: CLAIM_BOUNDARY,
    sealedAt: input.sealedAt,
    producer: input.signer.identity,
  };
  const publicPrincipal = input.signer.exportPublic();
  const body: CommitmentSignedBody = {
    ...core,
    commitmentHash: sha256(core as unknown as JsonValue),
    publicPrincipal,
  };
  const commitment: DevelopmentAttributionCommitment = {
    ...body,
    attestation: input.signer.attest(
      body as unknown as JsonValue,
    ),
  };
  verifyDevelopmentAttributionCommitment({
    commitment,
    predictionSet: input.predictionSet,
    manifest: input.manifest,
    corpus: input.corpus,
    schemas: input.schemas,
  });
  return commitment;
}

export function verifyDevelopmentAttributionCommitment(input: {
  readonly commitment: DevelopmentAttributionCommitment;
  readonly predictionSet: DevelopmentAttributionPredictionSet;
  readonly manifest: DevelopmentAttributionPrototypeManifest;
  readonly corpus: LabelBlindAttributionCorpus;
  readonly schemas: SchemaRegistry;
}): void {
  input.schemas.validate(
    DEVELOPMENT_ATTRIBUTION_COMMITMENT_SCHEMA_ID,
    input.commitment as unknown as JsonValue,
  );
  verifyDevelopmentAttributionPredictionSet({
    value: input.predictionSet,
    manifest: input.manifest,
    corpus: input.corpus,
    schemas: input.schemas,
  });
  assertCondition(
    input.commitment.predictionSetHash ===
      input.predictionSet.predictionSetHash &&
      input.commitment.prototypeManifestHash ===
        input.manifest.manifestHash &&
      input.commitment.corpusHash ===
        input.corpus.corpusHash &&
      input.commitment.predictionCount ===
        input.predictionSet.predictions.length &&
      input.commitment.occurrenceCount ===
        input.predictionSet.predictions.reduce(
          (sum, entry) => sum + entry.occurrenceCount,
          0,
        ),
    "HASH_MISMATCH",
    "Prediction commitment does not bind the finalized prediction set",
  );
  assertCondition(
    input.commitment.producer.role === "proposer" &&
      canonicalize(input.commitment.publicPrincipal.identity) ===
        canonicalize(input.commitment.producer),
    "AUTHORIZATION_DENIED",
    "Prediction commitment signer is not its proposer",
  );
  assertCondition(
    input.commitment.commitmentHash ===
      sha256(
        commitmentCore(
          input.commitment,
        ) as unknown as JsonValue,
      ),
    "HASH_MISMATCH",
    "Prediction commitment hash mismatch",
  );
  const principals = new PrincipalRegistry();
  principals.register(input.commitment.publicPrincipal);
  principals.verify(
    input.commitment.producer,
    commitmentSignedBody(
      input.commitment,
    ) as unknown as JsonValue,
    input.commitment.attestation,
  );
}

export function developmentPredictionStatuses():
  readonly DevelopmentPredictionStatus[] {
  return STATUSES;
}
