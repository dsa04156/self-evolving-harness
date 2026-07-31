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
import type { LabelBlindAttributionCorpus } from "./hfb-label-blind-adapter.js";
import {
  developmentPredictionStatuses,
  verifyDevelopmentAttributionCommitment,
  type DevelopmentAttributionCommitment,
  type DevelopmentAttributionLabel,
  type DevelopmentAttributionPredictionSet,
  type DevelopmentAttributionPrototypeManifest,
  type DevelopmentClaimBoundary,
  type DevelopmentPredictionStatus,
} from "./development-attribution.js";

export const DEVELOPMENT_ORACLE_ACCESS_EVENT_SCHEMA_ID =
  `${SCHEMA_BASE_URL}development-oracle-access-event.schema.json`;
export const DEVELOPMENT_ATTRIBUTION_SCORE_REPORT_SCHEMA_ID =
  `${SCHEMA_BASE_URL}development-attribution-score-report.schema.json`;

export interface DevelopmentOracleJoinEntry {
  readonly caseId: string;
  readonly traceProjectionId: string;
  readonly targetComponentType: DevelopmentAttributionLabel;
  readonly oracleRecordHash: string;
}

export interface DevelopmentOracleAccessEvent {
  readonly schemaVersion: 1;
  readonly accessEventId: string;
  readonly purpose: "development_scoring";
  readonly predictionCommitmentHash: string;
  readonly predictionCommitmentVerified: true;
  readonly oracleBundleHash: string;
  readonly oracleRecordHashes: readonly string[];
  readonly accessedAt: string;
  readonly accessor: PrincipalIdentity;
  readonly claimBoundary: DevelopmentClaimBoundary;
  readonly eventHash: string;
  readonly publicPrincipal: PublicPrincipal;
  readonly attestation: Attestation;
}

export interface DevelopmentAttributionScoreReport {
  readonly schemaVersion: 1;
  readonly reportId: string;
  readonly predictionCommitmentHash: string;
  readonly predictionSetHash: string;
  readonly prototypeManifestHash: string;
  readonly corpusHash: string;
  readonly scorer: {
    readonly scorerId: string;
    readonly implementationHash: string;
    readonly identity: PrincipalIdentity;
  };
  readonly oracleAccessEventHash: string;
  readonly caseCount: number;
  readonly statusCounts: Readonly<
    Record<DevelopmentPredictionStatus, number>
  >;
  readonly diagnosticMetrics: {
    readonly top1Count: number;
    readonly top3Count: number;
    readonly topKCount: number;
    readonly top1RateMicros: number;
    readonly top3RateMicros: number;
    readonly topKRateMicros: number;
    readonly abstentionCount: number;
    readonly invalidOutputCount: number;
    readonly failureCount: number;
    readonly timeoutCount: number;
  };
  readonly confusion: readonly {
    readonly actual: DevelopmentAttributionLabel;
    readonly predicted: DevelopmentAttributionLabel | null;
    readonly count: number;
  }[];
  readonly claimBoundary: DevelopmentClaimBoundary;
  readonly scoredAt: string;
  readonly reportHash: string;
  readonly publicPrincipal: PublicPrincipal;
  readonly attestation: Attestation;
}

type AccessCore = Omit<
  DevelopmentOracleAccessEvent,
  "eventHash" | "publicPrincipal" | "attestation"
>;
type AccessSignedBody = Omit<
  DevelopmentOracleAccessEvent,
  "attestation"
>;
type ScoreCore = Omit<
  DevelopmentAttributionScoreReport,
  "reportHash" | "publicPrincipal" | "attestation"
>;
type ScoreSignedBody = Omit<
  DevelopmentAttributionScoreReport,
  "attestation"
>;

const CLAIM_BOUNDARY: DevelopmentClaimBoundary = {
  developmentOnly: true,
  confirmatory: false,
  publicVisibleFixtures: true,
  authorizedForResearchEvidence: false,
  attributionPerformanceClaim: false,
};

function accessCore(
  event: DevelopmentOracleAccessEvent,
): AccessCore {
  const {
    eventHash: _eventHash,
    publicPrincipal: _publicPrincipal,
    attestation: _attestation,
    ...core
  } = event;
  return core;
}

function accessSignedBody(
  event: DevelopmentOracleAccessEvent,
): AccessSignedBody {
  const { attestation: _attestation, ...body } = event;
  return body;
}

function scoreCore(
  report: DevelopmentAttributionScoreReport,
): ScoreCore {
  const {
    reportHash: _reportHash,
    publicPrincipal: _publicPrincipal,
    attestation: _attestation,
    ...core
  } = report;
  return core;
}

function scoreSignedBody(
  report: DevelopmentAttributionScoreReport,
): ScoreSignedBody {
  const { attestation: _attestation, ...body } = report;
  return body;
}

function parseTime(value: string, label: string): number {
  const parsed = Date.parse(value);
  assertCondition(
    Number.isFinite(parsed),
    "SCHEMA_INVALID",
    `${label} is not a valid timestamp`,
  );
  return parsed;
}

function sortedOracleEntries(
  entries: readonly DevelopmentOracleJoinEntry[],
): DevelopmentOracleJoinEntry[] {
  return [...entries].sort(
    (left, right) =>
      left.caseId.localeCompare(right.caseId) ||
      left.traceProjectionId.localeCompare(
        right.traceProjectionId,
      ),
  );
}

function oracleBundleHash(
  entries: readonly DevelopmentOracleJoinEntry[],
): string {
  return sha256(
    sortedOracleEntries(entries) as unknown as JsonValue,
  );
}

export function createDevelopmentOracleAccessEvent(input: {
  readonly accessEventId: string;
  readonly commitment: DevelopmentAttributionCommitment;
  readonly predictionSet: DevelopmentAttributionPredictionSet;
  readonly manifest: DevelopmentAttributionPrototypeManifest;
  readonly corpus: LabelBlindAttributionCorpus;
  readonly oracleEntries: readonly DevelopmentOracleJoinEntry[];
  readonly accessedAt: string;
  readonly signer: PrincipalSigner;
  readonly schemas: SchemaRegistry;
}): DevelopmentOracleAccessEvent {
  assertCondition(
    input.signer.identity.role === "evaluator",
    "AUTHORIZATION_DENIED",
    "Oracle access requires evaluator identity",
  );
  verifyDevelopmentAttributionCommitment({
    commitment: input.commitment,
    predictionSet: input.predictionSet,
    manifest: input.manifest,
    corpus: input.corpus,
    schemas: input.schemas,
  });
  assertCondition(
    input.oracleEntries.length > 0 &&
      parseTime(input.accessedAt, "accessedAt") >=
        parseTime(input.commitment.sealedAt, "sealedAt"),
    "INVALID_STATE_TRANSITION",
    "Oracle access must occur after prediction commitment",
  );
  const sorted = sortedOracleEntries(input.oracleEntries);
  const hashes = [...new Set(
    sorted.map((entry) => entry.oracleRecordHash),
  )].sort();
  const core: AccessCore = {
    schemaVersion: 1,
    accessEventId: input.accessEventId,
    purpose: "development_scoring",
    predictionCommitmentHash:
      input.commitment.commitmentHash,
    predictionCommitmentVerified: true,
    oracleBundleHash: oracleBundleHash(sorted),
    oracleRecordHashes: hashes,
    accessedAt: input.accessedAt,
    accessor: input.signer.identity,
    claimBoundary: CLAIM_BOUNDARY,
  };
  const publicPrincipal = input.signer.exportPublic();
  const body: AccessSignedBody = {
    ...core,
    eventHash: sha256(core as unknown as JsonValue),
    publicPrincipal,
  };
  const event: DevelopmentOracleAccessEvent = {
    ...body,
    attestation: input.signer.attest(
      body as unknown as JsonValue,
    ),
  };
  verifyDevelopmentOracleAccessEvent({
    event,
    commitment: input.commitment,
    oracleEntries: input.oracleEntries,
    schemas: input.schemas,
  });
  return event;
}

export function verifyDevelopmentOracleAccessEvent(input: {
  readonly event: DevelopmentOracleAccessEvent;
  readonly commitment: DevelopmentAttributionCommitment;
  readonly oracleEntries: readonly DevelopmentOracleJoinEntry[];
  readonly schemas: SchemaRegistry;
}): void {
  input.schemas.validate(
    DEVELOPMENT_ORACLE_ACCESS_EVENT_SCHEMA_ID,
    input.event as unknown as JsonValue,
  );
  assertCondition(
    input.event.predictionCommitmentHash ===
      input.commitment.commitmentHash &&
      input.event.oracleBundleHash ===
        oracleBundleHash(input.oracleEntries) &&
      canonicalize(input.event.oracleRecordHashes) ===
        canonicalize(
          [...new Set(
            input.oracleEntries.map(
              (entry) => entry.oracleRecordHash,
            ),
          )].sort(),
        ) &&
      parseTime(input.event.accessedAt, "accessedAt") >=
        parseTime(input.commitment.sealedAt, "sealedAt"),
    "HASH_MISMATCH",
    "Oracle access event binding mismatch",
  );
  assertCondition(
    input.event.accessor.role === "evaluator" &&
      canonicalize(input.event.publicPrincipal.identity) ===
        canonicalize(input.event.accessor),
    "AUTHORIZATION_DENIED",
    "Oracle access event is not signed by its evaluator",
  );
  assertCondition(
    input.event.eventHash ===
      sha256(accessCore(input.event) as unknown as JsonValue),
    "HASH_MISMATCH",
    "Oracle access event hash mismatch",
  );
  const principals = new PrincipalRegistry();
  principals.register(input.event.publicPrincipal);
  principals.verify(
    input.event.accessor,
    accessSignedBody(input.event) as unknown as JsonValue,
    input.event.attestation,
  );
}

function emptyStatusCounts(): Record<
  DevelopmentPredictionStatus,
  number
> {
  return Object.fromEntries(
    developmentPredictionStatuses().map((status) => [
      status,
      0,
    ]),
  ) as Record<DevelopmentPredictionStatus, number>;
}

function rateMicros(
  count: number,
  denominator: number,
): number {
  return denominator === 0
    ? 0
    : Math.floor((count * 1_000_000) / denominator);
}

export function scoreDevelopmentAttribution(input: {
  readonly reportId: string;
  readonly scorerId: string;
  readonly scorerImplementationHash: string;
  readonly predictionSet: DevelopmentAttributionPredictionSet;
  readonly commitment: DevelopmentAttributionCommitment;
  readonly manifest: DevelopmentAttributionPrototypeManifest;
  readonly corpus: LabelBlindAttributionCorpus;
  readonly oracleEntries: readonly DevelopmentOracleJoinEntry[];
  readonly accessEvent: DevelopmentOracleAccessEvent;
  readonly scoredAt: string;
  readonly signer: PrincipalSigner;
  readonly schemas: SchemaRegistry;
}): DevelopmentAttributionScoreReport {
  assertCondition(
    input.signer.identity.role === "evaluator" &&
      canonicalize(input.signer.identity) ===
        canonicalize(input.accessEvent.accessor),
    "AUTHORIZATION_DENIED",
    "Development scorer must be the recorded evaluator accessor",
  );
  verifyDevelopmentAttributionCommitment({
    commitment: input.commitment,
    predictionSet: input.predictionSet,
    manifest: input.manifest,
    corpus: input.corpus,
    schemas: input.schemas,
  });
  verifyDevelopmentOracleAccessEvent({
    event: input.accessEvent,
    commitment: input.commitment,
    oracleEntries: input.oracleEntries,
    schemas: input.schemas,
  });
  assertCondition(
    parseTime(input.scoredAt, "scoredAt") >=
      parseTime(input.accessEvent.accessedAt, "accessedAt"),
    "INVALID_STATE_TRANSITION",
    "Scoring must follow the recorded oracle access",
  );

  const predictionByTrace = new Map(
    input.predictionSet.predictions.map((entry) => [
      entry.traceProjectionId,
      entry,
    ]),
  );
  const oracleCounts = new Map<string, number>();
  const seenCaseIds = new Set<string>();
  for (const entry of input.oracleEntries) {
    assertCondition(
      !seenCaseIds.has(entry.caseId),
      "SCHEMA_INVALID",
      "Duplicate development oracle case",
    );
    seenCaseIds.add(entry.caseId);
    assertCondition(
      predictionByTrace.has(entry.traceProjectionId),
      "ARTIFACT_UNAVAILABLE",
      "Development scorer cannot silently omit an oracle case",
    );
    oracleCounts.set(
      entry.traceProjectionId,
      (oracleCounts.get(entry.traceProjectionId) ?? 0) + 1,
    );
  }
  assertCondition(
    input.predictionSet.predictions.every(
      (entry) =>
        oracleCounts.get(entry.traceProjectionId) ===
        entry.occurrenceCount,
    ),
    "HASH_MISMATCH",
    "Oracle join multiplicity does not match committed corpus occurrences",
  );

  let top1Count = 0;
  let top3Count = 0;
  let topKCount = 0;
  const statusCounts = emptyStatusCounts();
  const confusionCounts = new Map<string, number>();
  for (const entry of sortedOracleEntries(input.oracleEntries)) {
    const prediction = predictionByTrace.get(
      entry.traceProjectionId,
    )!;
    statusCounts[prediction.status] += 1;
    const ranked = prediction.rankedComponentTypes.map(
      (candidate) => candidate.componentType,
    );
    if (ranked[0] === entry.targetComponentType) {
      top1Count += 1;
    }
    if (ranked.slice(0, 3).includes(entry.targetComponentType)) {
      top3Count += 1;
    }
    if (ranked.includes(entry.targetComponentType)) {
      topKCount += 1;
    }
    const predicted = ranked[0] ?? null;
    const key = `${entry.targetComponentType}\u0000${predicted ?? ""}`;
    confusionCounts.set(
      key,
      (confusionCounts.get(key) ?? 0) + 1,
    );
  }
  const confusion = [...confusionCounts.entries()]
    .map(([key, count]) => {
      const [actual, predicted] = key.split("\u0000");
      return {
        actual: actual as DevelopmentAttributionLabel,
        predicted:
          predicted === ""
            ? null
            : (predicted as DevelopmentAttributionLabel),
        count,
      };
    })
    .sort(
      (left, right) =>
        left.actual.localeCompare(right.actual) ||
        (left.predicted ?? "").localeCompare(
          right.predicted ?? "",
        ),
    );
  const caseCount = input.oracleEntries.length;
  const core: ScoreCore = {
    schemaVersion: 1,
    reportId: input.reportId,
    predictionCommitmentHash:
      input.commitment.commitmentHash,
    predictionSetHash:
      input.predictionSet.predictionSetHash,
    prototypeManifestHash: input.manifest.manifestHash,
    corpusHash: input.corpus.corpusHash,
    scorer: {
      scorerId: input.scorerId,
      implementationHash: input.scorerImplementationHash,
      identity: input.signer.identity,
    },
    oracleAccessEventHash: input.accessEvent.eventHash,
    caseCount,
    statusCounts,
    diagnosticMetrics: {
      top1Count,
      top3Count,
      topKCount,
      top1RateMicros: rateMicros(top1Count, caseCount),
      top3RateMicros: rateMicros(top3Count, caseCount),
      topKRateMicros: rateMicros(topKCount, caseCount),
      abstentionCount: statusCounts.abstained,
      invalidOutputCount: statusCounts.invalid_output,
      failureCount: statusCounts.failure,
      timeoutCount: statusCounts.timeout,
    },
    confusion,
    claimBoundary: CLAIM_BOUNDARY,
    scoredAt: input.scoredAt,
  };
  const publicPrincipal = input.signer.exportPublic();
  const body: ScoreSignedBody = {
    ...core,
    reportHash: sha256(core as unknown as JsonValue),
    publicPrincipal,
  };
  const report: DevelopmentAttributionScoreReport = {
    ...body,
    attestation: input.signer.attest(
      body as unknown as JsonValue,
    ),
  };
  verifyDevelopmentAttributionScoreReport({
    report,
    commitment: input.commitment,
    accessEvent: input.accessEvent,
    schemas: input.schemas,
  });
  return report;
}

export function verifyDevelopmentAttributionScoreReport(input: {
  readonly report: DevelopmentAttributionScoreReport;
  readonly commitment: DevelopmentAttributionCommitment;
  readonly accessEvent: DevelopmentOracleAccessEvent;
  readonly schemas: SchemaRegistry;
}): void {
  input.schemas.validate(
    DEVELOPMENT_ATTRIBUTION_SCORE_REPORT_SCHEMA_ID,
    input.report as unknown as JsonValue,
  );
  assertCondition(
    input.report.predictionCommitmentHash ===
      input.commitment.commitmentHash &&
      input.report.predictionSetHash ===
        input.commitment.predictionSetHash &&
      input.report.prototypeManifestHash ===
        input.commitment.prototypeManifestHash &&
      input.report.corpusHash === input.commitment.corpusHash &&
      input.report.oracleAccessEventHash ===
        input.accessEvent.eventHash &&
      parseTime(input.report.scoredAt, "scoredAt") >=
        parseTime(input.accessEvent.accessedAt, "accessedAt"),
    "HASH_MISMATCH",
    "Development score report binding mismatch",
  );
  assertCondition(
    input.report.scorer.identity.role === "evaluator" &&
      canonicalize(input.report.publicPrincipal.identity) ===
        canonicalize(input.report.scorer.identity),
    "AUTHORIZATION_DENIED",
    "Development score report is not signed by its evaluator",
  );
  assertCondition(
    input.report.reportHash ===
      sha256(scoreCore(input.report) as unknown as JsonValue),
    "HASH_MISMATCH",
    "Development score report hash mismatch",
  );
  const principals = new PrincipalRegistry();
  principals.register(input.report.publicPrincipal);
  principals.verify(
    input.report.scorer.identity,
    scoreSignedBody(input.report) as unknown as JsonValue,
    input.report.attestation,
  );
}
