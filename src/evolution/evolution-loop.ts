import path from "node:path";

import { sha256, type JsonValue } from "../core/canonical.js";
import type { Clock, IdFactory } from "../core/determinism.js";
import {
  asHarnessError,
  assertCondition,
  type HarnessErrorCode,
} from "../core/errors.js";
import {
  SCHEMA_BASE_URL,
  type SchemaRegistry,
} from "../contracts/schema-registry.js";
import type { HarnessVersionManifest } from "../domain/components.js";
import { type AuditLink, AuditTrail } from "../evidence/audit-trail.js";
import type { EvidenceReceiptStore } from "../evidence/receipts.js";
import { AppendOnlyLog } from "../storage/append-only-log.js";
import type {
  Attestation,
  PrincipalIdentity,
  PrincipalRegistry,
  PrincipalSigner,
} from "../trust/identity.js";
import type {
  BoundedMutationEngine,
  MutationProposal,
  MutationTarget,
} from "./bounded-mutation.js";
import type {
  CandidateAdmissionService,
  StaticValidationResult,
} from "./candidate-admission.js";
import type {
  CandidateCostGate,
  PromotionDecision,
  PromotionService,
} from "./promotion.js";
import type { EvaluationResult } from "./external-evaluator.js";
import type { HarnessQualificationStore } from "./harness-lifecycle.js";
import type {
  AttributionResult,
  AttributionService,
  FailurePattern,
  FailureTraceInput,
  WeaknessMiningService,
} from "./weakness-attribution.js";

export const EVOLUTION_RUN_RECORD_SCHEMA_ID =
  `${SCHEMA_BASE_URL}evolution-run-record.schema.json`;

export type EvolutionRunState =
  | "created"
  | "weaknesses_mined"
  | "attributed"
  | "candidate_created"
  | "statically_validated"
  | "evaluating"
  | "evaluated"
  | "decided"
  | "failed";

export interface EvolutionRunRecord {
  readonly schemaVersion: 1;
  readonly recordId: string;
  readonly evolutionRunId: string;
  readonly protocolId: string;
  readonly selectionPolicy: "highest_failure_count_then_signature_v1";
  readonly previousState: EvolutionRunState | null;
  readonly state: EvolutionRunState;
  readonly parentHarnessVersionId: string;
  readonly candidateHarnessVersionId: string | null;
  readonly failurePatternIds: readonly string[];
  readonly selectedFailurePatternId: string | null;
  readonly attributionResultId: string | null;
  readonly mutationProposalId: string | null;
  readonly staticValidationResultId: string | null;
  readonly candidateFilesystemSnapshotHash: string | null;
  readonly evaluationResultId: string | null;
  readonly promotionDecisionId: string | null;
  readonly outcome: "approved" | "rejected" | "failed" | null;
  readonly failureCode: HarnessErrorCode | null;
  readonly transitionedBy: PrincipalIdentity;
  readonly transitionedAt: string;
  readonly auditLink: AuditLink;
  readonly attestation: Attestation;
}

type EvolutionRunProjection = Pick<
  EvolutionRunRecord,
  | "candidateHarnessVersionId"
  | "failurePatternIds"
  | "selectedFailurePatternId"
  | "attributionResultId"
  | "mutationProposalId"
  | "staticValidationResultId"
  | "candidateFilesystemSnapshotHash"
  | "evaluationResultId"
  | "promotionDecisionId"
  | "outcome"
  | "failureCode"
>;

type RunCore = Omit<EvolutionRunRecord, "auditLink" | "attestation">;
type RunBody = Omit<EvolutionRunRecord, "attestation">;

const NEXT_STATES: Readonly<
  Record<EvolutionRunState, readonly EvolutionRunState[]>
> = Object.freeze({
  created: ["weaknesses_mined", "failed"],
  weaknesses_mined: ["attributed", "failed"],
  attributed: ["candidate_created", "failed"],
  candidate_created: ["statically_validated", "failed"],
  statically_validated: ["evaluating", "failed"],
  evaluating: ["evaluated", "failed"],
  evaluated: ["decided", "failed"],
  decided: [],
  failed: [],
});

const NORMAL_ORDER: readonly EvolutionRunState[] = [
  "created",
  "weaknesses_mined",
  "attributed",
  "candidate_created",
  "statically_validated",
  "evaluating",
  "evaluated",
  "decided",
];

function runCore(record: EvolutionRunRecord): RunCore {
  const { auditLink: _auditLink, attestation: _attestation, ...core } = record;
  return core;
}

function runBody(record: EvolutionRunRecord): RunBody {
  const { attestation: _attestation, ...body } = record;
  return body;
}

function asRunRecord(value: JsonValue): EvolutionRunRecord {
  return value as unknown as EvolutionRunRecord;
}

function same(left: unknown, right: unknown): boolean {
  return sha256(left) === sha256(right);
}

function emptyProjection(): EvolutionRunProjection {
  return {
    candidateHarnessVersionId: null,
    failurePatternIds: [],
    selectedFailurePatternId: null,
    attributionResultId: null,
    mutationProposalId: null,
    staticValidationResultId: null,
    candidateFilesystemSnapshotHash: null,
    evaluationResultId: null,
    promotionDecisionId: null,
    outcome: null,
    failureCode: null,
  };
}

export class EvolutionRunStore {
  readonly #protocolId: string;
  readonly #schemas: SchemaRegistry;
  readonly #audit: AuditTrail;
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
    principals: PrincipalRegistry;
    signer: PrincipalSigner;
    clock: Clock;
    ids: IdFactory;
  }) {
    assertCondition(
      input.signer.identity.role === "operations_owner",
      "AUTHORIZATION_DENIED",
      "Evolution run journal requires operations-owner identity",
    );
    this.#protocolId = input.protocolId;
    this.#schemas = input.schemas;
    this.#audit = input.audit;
    this.#principals = input.principals;
    this.#signer = input.signer;
    this.#clock = input.clock;
    this.#ids = input.ids;
    this.#log = new AppendOnlyLog<JsonValue>(
      path.join(input.root, "evolution"),
      "evolution.runs",
    );
  }

  public async create(parentHarnessVersionId: string): Promise<EvolutionRunRecord> {
    return this.#append({
      evolutionRunId: this.#ids.next("evolution-run"),
      previousState: null,
      state: "created",
      parentHarnessVersionId,
      projection: emptyProjection(),
    });
  }

  public async advance(input: {
    previous: EvolutionRunRecord;
    state: Exclude<EvolutionRunState, "created" | "failed">;
    projection: EvolutionRunProjection;
  }): Promise<EvolutionRunRecord> {
    const current = await this.latest(input.previous.evolutionRunId);
    assertCondition(
      current.recordId === input.previous.recordId,
      "CONFLICT",
      "Evolution run was advanced by another writer",
    );
    return this.#append({
      evolutionRunId: current.evolutionRunId,
      previousState: current.state,
      state: input.state,
      parentHarnessVersionId: current.parentHarnessVersionId,
      projection: input.projection,
    });
  }

  public async fail(input: {
    previous: EvolutionRunRecord;
    failureCode: HarnessErrorCode;
    projection: Omit<EvolutionRunProjection, "outcome" | "failureCode">;
  }): Promise<EvolutionRunRecord> {
    const current = await this.latest(input.previous.evolutionRunId);
    assertCondition(
      current.recordId === input.previous.recordId,
      "CONFLICT",
      "Evolution run was advanced by another writer",
    );
    return this.#append({
      evolutionRunId: current.evolutionRunId,
      previousState: current.state,
      state: "failed",
      parentHarnessVersionId: current.parentHarnessVersionId,
      projection: {
        ...input.projection,
        outcome: "failed",
        failureCode: input.failureCode,
      },
    });
  }

  public async latest(evolutionRunId: string): Promise<EvolutionRunRecord> {
    const latest = (await this.records(evolutionRunId)).at(-1);
    assertCondition(
      latest !== undefined,
      "ARTIFACT_UNAVAILABLE",
      `Unknown evolution run ${evolutionRunId}`,
    );
    return latest;
  }

  public async records(evolutionRunId?: string): Promise<EvolutionRunRecord[]> {
    const records = (await this.#log.readAll()).map((record) =>
      asRunRecord(record.payload),
    );
    return evolutionRunId === undefined
      ? records
      : records.filter((record) => record.evolutionRunId === evolutionRunId);
  }

  public async verifyAll(): Promise<void> {
    const latestByRun = new Map<string, EvolutionRunRecord>();
    for (const record of await this.records()) {
      this.#schemas.validate(
        EVOLUTION_RUN_RECORD_SCHEMA_ID,
        record as unknown as JsonValue,
      );
      assertCondition(
        record.protocolId === this.#protocolId &&
          record.transitionedBy.role === "operations_owner",
        "PROTOCOL_MISMATCH",
        "Evolution run protocol or writer role drift",
      );
      this.#principals.verify(
        record.transitionedBy,
        runBody(record) as unknown as JsonValue,
        record.attestation,
      );
      await this.#audit.verifyLink(record.auditLink, {
        subjectType: "EvolutionRunRecord",
        subjectId: record.recordId,
        subjectHash: sha256(runCore(record)),
      });
      const previous = latestByRun.get(record.evolutionRunId);
      this.#assertTransition(record, previous);
      this.#assertProjection(record, previous);
      latestByRun.set(record.evolutionRunId, record);
    }
  }

  async #append(input: {
    evolutionRunId: string;
    previousState: EvolutionRunState | null;
    state: EvolutionRunState;
    parentHarnessVersionId: string;
    projection: EvolutionRunProjection;
  }): Promise<EvolutionRunRecord> {
    const core: RunCore = {
      schemaVersion: 1,
      recordId: this.#ids.next("evolution-run-record"),
      evolutionRunId: input.evolutionRunId,
      protocolId: this.#protocolId,
      selectionPolicy: "highest_failure_count_then_signature_v1",
      previousState: input.previousState,
      state: input.state,
      parentHarnessVersionId: input.parentHarnessVersionId,
      ...input.projection,
      transitionedBy: this.#signer.identity,
      transitionedAt: this.#clock.now().toISOString(),
    };
    const auditLink = await this.#audit.appendSubject({
      subjectType: "EvolutionRunRecord",
      subjectId: core.recordId,
      subjectHash: sha256(core),
    });
    const body: RunBody = { ...core, auditLink };
    const record: EvolutionRunRecord = {
      ...body,
      attestation: this.#signer.attest(body as unknown as JsonValue),
    };
    this.#schemas.validate(
      EVOLUTION_RUN_RECORD_SCHEMA_ID,
      record as unknown as JsonValue,
    );
    const previous = (await this.records(input.evolutionRunId)).at(-1);
    this.#assertTransition(record, previous);
    this.#assertProjection(record, previous);
    await this.#log.append(record as unknown as JsonValue);
    return record;
  }

  #assertTransition(
    record: EvolutionRunRecord,
    previous: EvolutionRunRecord | undefined,
  ): void {
    if (previous === undefined) {
      assertCondition(
        record.previousState === null && record.state === "created",
        "INVALID_STATE_TRANSITION",
        "First evolution-run state must be created",
      );
      return;
    }
    assertCondition(
      record.previousState === previous.state &&
        NEXT_STATES[previous.state].includes(record.state),
      "INVALID_STATE_TRANSITION",
      `Invalid evolution-run transition ${record.previousState} → ${record.state}`,
    );
  }

  #assertProjection(
    record: EvolutionRunRecord,
    previous: EvolutionRunRecord | undefined,
  ): void {
    assertCondition(
      record.candidateHarnessVersionId === null ||
        record.candidateHarnessVersionId !== record.parentHarnessVersionId,
      "PROTOCOL_MISMATCH",
      "Task retry cannot be recorded as harness evolution",
    );
    if (previous !== undefined) {
      assertCondition(
        record.parentHarnessVersionId === previous.parentHarnessVersionId,
        "HASH_MISMATCH",
        "Evolution parent changed during the run",
      );
      for (const key of [
        "candidateHarnessVersionId",
        "selectedFailurePatternId",
        "attributionResultId",
        "mutationProposalId",
        "staticValidationResultId",
        "candidateFilesystemSnapshotHash",
        "evaluationResultId",
        "promotionDecisionId",
      ] as const) {
        assertCondition(
          previous[key] === null || record[key] === previous[key],
          "HASH_MISMATCH",
          `Evolution run changed committed field ${key}`,
        );
      }
      assertCondition(
        previous.failurePatternIds.length === 0 ||
          same(record.failurePatternIds, previous.failurePatternIds),
        "HASH_MISMATCH",
        "Evolution failure-pattern set changed after commitment",
      );
    }
    if (record.state === "failed") {
      assertCondition(
        record.outcome === "failed" && record.failureCode !== null,
        "SCHEMA_INVALID",
        "Failed evolution run lacks a failure outcome",
      );
      return;
    }
    assertCondition(
      record.failureCode === null,
      "SCHEMA_INVALID",
      "Non-failed evolution run contains a failure code",
    );
    const rank = NORMAL_ORDER.indexOf(record.state);
    assertCondition(rank >= 0, "SCHEMA_INVALID", "Unknown evolution-run state");
    if (rank >= 1) {
      assertCondition(
        record.failurePatternIds.length > 0 &&
          record.selectedFailurePatternId !== null &&
          record.failurePatternIds.includes(record.selectedFailurePatternId),
        "SCHEMA_INVALID",
        "Mined evolution state lacks its selected failure pattern",
      );
    }
    if (rank >= 2) {
      assertCondition(
        record.attributionResultId !== null,
        "SCHEMA_INVALID",
        "Attributed evolution state lacks attribution",
      );
    }
    if (rank >= 3) {
      assertCondition(
        record.candidateHarnessVersionId !== null &&
          record.mutationProposalId !== null,
        "SCHEMA_INVALID",
        "Candidate evolution state lacks a new harness and proposal",
      );
    }
    if (rank >= 4) {
      assertCondition(
        record.staticValidationResultId !== null,
        "SCHEMA_INVALID",
        "Validated evolution state lacks static evidence",
      );
    }
    if (rank >= 5) {
      assertCondition(
        record.candidateFilesystemSnapshotHash !== null,
        "SCHEMA_INVALID",
        "Evaluation state lacks a candidate snapshot",
      );
    }
    if (rank >= 6) {
      assertCondition(
        record.evaluationResultId !== null,
        "SCHEMA_INVALID",
        "Evaluated evolution state lacks an evaluation result",
      );
    }
    if (rank >= 7) {
      assertCondition(
        record.promotionDecisionId !== null &&
          (record.outcome === "approved" || record.outcome === "rejected"),
        "SCHEMA_INVALID",
        "Decided evolution state lacks a qualification decision",
      );
    } else {
      assertCondition(
        record.outcome === null && record.promotionDecisionId === null,
        "SCHEMA_INVALID",
        "Pre-decision evolution state contains an outcome",
      );
    }
  }
}

export interface EvolutionEvaluationPreparation {
  readonly candidateFilesystemSnapshotHash: string;
  readonly evidenceReceiptIds: readonly string[];
}

export interface EvolutionEvaluationOutcome {
  readonly result: EvaluationResult;
  readonly costGate: CandidateCostGate;
}

export interface EvolutionEvaluationExecutor {
  prepare(input: {
    evolutionRunId: string;
    parentHarnessVersionId: string;
    candidate: HarnessVersionManifest;
    proposal: MutationProposal;
    staticValidation: StaticValidationResult;
  }): Promise<EvolutionEvaluationPreparation>;

  evaluate(input: {
    evolutionRunId: string;
    parentHarnessVersionId: string;
    candidate: HarnessVersionManifest;
    proposal: MutationProposal;
    staticValidation: StaticValidationResult;
    preparation: EvolutionEvaluationPreparation;
  }): Promise<EvolutionEvaluationOutcome>;
}

export interface HarnessEvolutionLoopInput {
  readonly parentHarnessVersionId: string;
  readonly failureTraces: readonly FailureTraceInput[];
  readonly attribution: {
    readonly candidates: readonly {
      readonly componentManifestId: string;
      readonly scoreMicros: number;
      readonly hypothesizedMechanism: string;
    }[];
    readonly confidenceMicros: number;
    readonly alternativeExplanations: readonly string[];
    readonly method: string;
  };
  readonly mutation: {
    readonly candidateSemanticVersion: string;
    readonly causeClass: "single_fault" | "multi_cause";
    readonly targets: readonly MutationTarget[];
    readonly predictedFix: string;
    readonly predictedRegressions: readonly string[];
    readonly passingBehaviorPreservation: readonly string[];
  };
}

export interface HarnessEvolutionLoopResult {
  readonly run: EvolutionRunRecord;
  readonly failurePattern: FailurePattern;
  readonly attribution: AttributionResult;
  readonly candidate: HarnessVersionManifest;
  readonly proposal: MutationProposal;
  readonly staticValidation: StaticValidationResult;
  readonly evaluation: EvaluationResult;
  readonly decision: PromotionDecision;
}

export class HarnessEvolutionLoop {
  readonly #protocolId: string;
  readonly #runs: EvolutionRunStore;
  readonly #miner: WeaknessMiningService;
  readonly #attributions: AttributionService;
  readonly #mutations: BoundedMutationEngine;
  readonly #admission: CandidateAdmissionService;
  readonly #qualification: HarnessQualificationStore;
  readonly #receipts: EvidenceReceiptStore;
  readonly #operationsSigner: PrincipalSigner;
  readonly #evaluator: EvolutionEvaluationExecutor;
  readonly #promotions: PromotionService;

  public constructor(input: {
    protocolId: string;
    runs: EvolutionRunStore;
    miner: WeaknessMiningService;
    attributions: AttributionService;
    mutations: BoundedMutationEngine;
    admission: CandidateAdmissionService;
    qualification: HarnessQualificationStore;
    receipts: EvidenceReceiptStore;
    operationsSigner: PrincipalSigner;
    evaluator: EvolutionEvaluationExecutor;
    promotions: PromotionService;
  }) {
    assertCondition(
      input.operationsSigner.identity.role === "operations_owner",
      "AUTHORIZATION_DENIED",
      "Harness evolution loop requires operations-owner identity",
    );
    this.#protocolId = input.protocolId;
    this.#runs = input.runs;
    this.#miner = input.miner;
    this.#attributions = input.attributions;
    this.#mutations = input.mutations;
    this.#admission = input.admission;
    this.#qualification = input.qualification;
    this.#receipts = input.receipts;
    this.#operationsSigner = input.operationsSigner;
    this.#evaluator = input.evaluator;
    this.#promotions = input.promotions;
  }

  public async run(
    input: HarnessEvolutionLoopInput,
  ): Promise<HarnessEvolutionLoopResult> {
    let current = await this.#runs.create(input.parentHarnessVersionId);
    let failurePattern: FailurePattern | null = null;
    let attribution: AttributionResult | null = null;
    let candidate: HarnessVersionManifest | null = null;
    let proposal: MutationProposal | null = null;
    let staticValidation: StaticValidationResult | null = null;
    let preparation: EvolutionEvaluationPreparation | null = null;
    let evaluation: EvaluationResult | null = null;
    let decision: PromotionDecision | null = null;

    const projection = (): EvolutionRunProjection => ({
      candidateHarnessVersionId: candidate?.harnessVersionId ?? null,
      failurePatternIds:
        current.failurePatternIds.length > 0
          ? current.failurePatternIds
          : failurePattern === null
            ? []
            : [failurePattern.failurePatternId],
      selectedFailurePatternId:
        failurePattern?.failurePatternId ?? current.selectedFailurePatternId,
      attributionResultId:
        attribution?.attributionResultId ?? current.attributionResultId,
      mutationProposalId:
        proposal?.mutationProposalId ?? current.mutationProposalId,
      staticValidationResultId:
        staticValidation?.staticValidationResultId ??
        current.staticValidationResultId,
      candidateFilesystemSnapshotHash:
        preparation?.candidateFilesystemSnapshotHash ??
        current.candidateFilesystemSnapshotHash,
      evaluationResultId:
        evaluation?.evaluationResultId ?? current.evaluationResultId,
      promotionDecisionId:
        decision?.promotionDecisionId ?? current.promotionDecisionId,
      outcome:
        decision === null
          ? current.outcome
          : decision.action === "approve"
            ? "approved"
            : "rejected",
      failureCode: current.failureCode,
    });

    try {
      const patterns = await this.#miner.mine(input.failureTraces);
      failurePattern = this.#selectFailurePattern(patterns);
      current = await this.#runs.advance({
        previous: current,
        state: "weaknesses_mined",
        projection: {
          ...projection(),
          failurePatternIds: patterns.map((pattern) => pattern.failurePatternId),
          selectedFailurePatternId: failurePattern.failurePatternId,
        },
      });

      attribution = await this.#attributions.attribute({
        failurePatternId: failurePattern.failurePatternId,
        datasetRole: "mine",
        useClass: "proposal_input",
        candidates: input.attribution.candidates,
        confidenceMicros: input.attribution.confidenceMicros,
        alternativeExplanations: input.attribution.alternativeExplanations,
        method: input.attribution.method,
      });
      current = await this.#runs.advance({
        previous: current,
        state: "attributed",
        projection: projection(),
      });

      const proposed = await this.#mutations.propose({
        parentHarnessVersionId: input.parentHarnessVersionId,
        candidateSemanticVersion: input.mutation.candidateSemanticVersion,
        attributionMode: "guided",
        attributionResultId: attribution.attributionResultId,
        causeClass: input.mutation.causeClass,
        primaryFailureMechanism:
          attribution.rankedCandidates[0]!.hypothesizedMechanism,
        targets: input.mutation.targets,
        predictedFix: input.mutation.predictedFix,
        predictedRegressions: input.mutation.predictedRegressions,
        passingBehaviorPreservation:
          input.mutation.passingBehaviorPreservation,
        predictionMetadata: attribution.metadata,
      });
      candidate = proposed.candidate;
      proposal = proposed.proposal;
      assertCondition(
        candidate.harnessVersionId !== input.parentHarnessVersionId,
        "PROTOCOL_MISMATCH",
        "Evolution must create a new HarnessVersion",
      );
      current = await this.#runs.advance({
        previous: current,
        state: "candidate_created",
        projection: projection(),
      });

      const admitted = await this.#admission.admit(proposal);
      staticValidation = admitted.validation;
      current = await this.#runs.advance({
        previous: current,
        state: "statically_validated",
        projection: projection(),
      });

      preparation = await this.#evaluator.prepare({
        evolutionRunId: current.evolutionRunId,
        parentHarnessVersionId: input.parentHarnessVersionId,
        candidate,
        proposal,
        staticValidation,
      });
      assertCondition(
        /^sha256:[a-f0-9]{64}$/u.test(
          preparation.candidateFilesystemSnapshotHash,
        ) && preparation.evidenceReceiptIds.length > 0,
        "SCHEMA_INVALID",
        "Candidate isolation preparation is incomplete",
      );
      for (const receiptId of preparation.evidenceReceiptIds) {
        const receipt = await this.#receipts.get(receiptId);
        await this.#receipts.verify(receipt);
        assertCondition(
          receipt.subjectIds.includes(candidate.harnessVersionId) &&
            receipt.harnessVersionIds.includes(candidate.harnessVersionId),
          "HASH_MISMATCH",
          "Candidate isolation receipt does not bind the candidate",
        );
      }
      await this.#qualification.transition({
        harnessVersionId: candidate.harnessVersionId,
        toState: "evaluating",
        evidenceReceiptIds: preparation.evidenceReceiptIds,
        signer: this.#operationsSigner,
      });
      current = await this.#runs.advance({
        previous: current,
        state: "evaluating",
        projection: projection(),
      });

      const evaluated = await this.#evaluator.evaluate({
        evolutionRunId: current.evolutionRunId,
        parentHarnessVersionId: input.parentHarnessVersionId,
        candidate,
        proposal,
        staticValidation,
        preparation,
      });
      evaluation = evaluated.result;
      this.#assertEvaluation(
        evaluation,
        evaluated.costGate,
        input.parentHarnessVersionId,
        candidate.harnessVersionId,
        preparation.candidateFilesystemSnapshotHash,
      );
      const evaluationReceipt = await this.#receipts.create({
        receiptType: "evaluation",
        subjectIds: [
          current.evolutionRunId,
          candidate.harnessVersionId,
          evaluation.evaluationResultId,
        ],
        harnessVersionIds: [candidate.harnessVersionId],
        signer: this.#operationsSigner,
      });
      await this.#qualification.transition({
        harnessVersionId: candidate.harnessVersionId,
        toState: "canary",
        evidenceReceiptIds: [evaluationReceipt.receiptId],
        signer: this.#operationsSigner,
      });
      current = await this.#runs.advance({
        previous: current,
        state: "evaluated",
        projection: projection(),
      });

      decision = await this.#promotions.decide({
        parentHarnessVersionId: input.parentHarnessVersionId,
        candidateHarnessVersionId: candidate.harnessVersionId,
        evaluationResults: [evaluation],
        costGate: evaluated.costGate,
      });
      await this.#mutations.finalizeDisposition(
        proposal.mutationProposalId,
        decision.action === "approve" ? "accepted" : "rejected",
      );
      current = await this.#runs.advance({
        previous: current,
        state: "decided",
        projection: projection(),
      });
      return {
        run: current,
        failurePattern,
        attribution,
        candidate,
        proposal,
        staticValidation,
        evaluation,
        decision,
      };
    } catch (error) {
      const failure = asHarnessError(error);
      if (
        decision !== null &&
        failurePattern !== null &&
        attribution !== null &&
        candidate !== null &&
        proposal !== null &&
        staticValidation !== null &&
        evaluation !== null
      ) {
        try {
          await this.#mutations.finalizeDisposition(
            proposal.mutationProposalId,
            decision.action === "approve" ? "accepted" : "rejected",
          );
          current = await this.#runs.latest(current.evolutionRunId);
          if (current.state === "evaluated") {
            current = await this.#runs.advance({
              previous: current,
              state: "decided",
              projection: projection(),
            });
          }
          assertCondition(
            current.state === "decided",
            "INVALID_STATE_TRANSITION",
            "Qualified candidate could not reconcile its evolution-run journal",
          );
          return {
            run: current,
            failurePattern,
            attribution,
            candidate,
            proposal,
            staticValidation,
            evaluation,
            decision,
          };
        } catch (recoveryError) {
          throw asHarnessError(recoveryError);
        }
      }
      if (proposal !== null) {
        const disposition = await this.#mutations.disposition(
          proposal.mutationProposalId,
        );
        if (disposition === "pending") {
          await this.#mutations.setDisposition(
            proposal.mutationProposalId,
            "rejected",
          );
        } else if (disposition === "admitted") {
          await this.#mutations.finalizeDisposition(
            proposal.mutationProposalId,
            "rejected",
          );
        }
      }
      if (candidate !== null) {
        await this.#rejectUnqualifiedCandidate(
          current.evolutionRunId,
          candidate.harnessVersionId,
          failure.code,
        );
      }
      if (current.state !== "decided" && current.state !== "failed") {
        const failedProjection = projection();
        current = await this.#runs.fail({
          previous: current,
          failureCode: failure.code,
          projection: {
            candidateHarnessVersionId:
              failedProjection.candidateHarnessVersionId,
            failurePatternIds: failedProjection.failurePatternIds,
            selectedFailurePatternId:
              failedProjection.selectedFailurePatternId,
            attributionResultId: failedProjection.attributionResultId,
            mutationProposalId: failedProjection.mutationProposalId,
            staticValidationResultId:
              failedProjection.staticValidationResultId,
            candidateFilesystemSnapshotHash:
              failedProjection.candidateFilesystemSnapshotHash,
            evaluationResultId: failedProjection.evaluationResultId,
            promotionDecisionId: failedProjection.promotionDecisionId,
          },
        });
      }
      throw failure;
    }
  }

  #selectFailurePattern(patterns: readonly FailurePattern[]): FailurePattern {
    assertCondition(
      patterns.length > 0,
      "ARTIFACT_UNAVAILABLE",
      "Weakness mining produced no failure pattern",
    );
    return [...patterns].sort(
      (left, right) =>
        right.recordedObservations.failureCount -
          left.recordedObservations.failureCount ||
        left.recordedObservations.deterministicSignature.localeCompare(
          right.recordedObservations.deterministicSignature,
        ) ||
        left.failurePatternId.localeCompare(right.failurePatternId),
    )[0]!;
  }

  #assertEvaluation(
    result: EvaluationResult,
    costGate: CandidateCostGate,
    parentHarnessVersionId: string,
    candidateHarnessVersionId: string,
    candidateFilesystemSnapshotHash: string,
  ): void {
    assertCondition(
      result.protocolId === this.#protocolId &&
        result.parentHarnessVersionId === parentHarnessVersionId &&
        result.candidateHarnessVersionId === candidateHarnessVersionId &&
        result.candidateFilesystemSnapshotHash ===
          candidateFilesystemSnapshotHash,
      "PROTOCOL_MISMATCH",
      "Evaluation result does not bind the exact candidate snapshot",
    );
    const parentPasses = result.taskPairs.filter(
      (pair) => pair.parentPassed,
    ).length;
    const candidatePasses = result.taskPairs.filter(
      (pair) => pair.candidatePassed,
    ).length;
    const passToFailCount = result.taskPairs.filter(
      (pair) => pair.parentPassed && !pair.candidatePassed,
    ).length;
    const failToPassCount = result.taskPairs.filter(
      (pair) => !pair.parentPassed && pair.candidatePassed,
    ).length;
    const taskReceiptIds = new Set(
      result.taskPairs.flatMap((pair) => [
        pair.parentReceiptId,
        pair.candidateReceiptId,
      ]),
    );
    assertCondition(
      result.taskPairs.length === result.aggregate.taskCount &&
        costGate.taskCount === result.aggregate.taskCount &&
        costGate.parentPasses === parentPasses &&
        costGate.candidatePasses === candidatePasses &&
        costGate.passToFailCount === passToFailCount &&
        costGate.failToPassCount === failToPassCount &&
        costGate.sourceLedgerReceiptIds.every((receiptId) =>
          taskReceiptIds.has(receiptId),
        ) &&
        costGate.parentTotalChargedTokens +
          costGate.candidateTotalChargedTokens ===
          result.totalUsage.totalChargedTokens,
      "HASH_MISMATCH",
      "Candidate cost gate does not match the signed paired evaluation",
    );
  }

  async #rejectUnqualifiedCandidate(
    evolutionRunId: string,
    candidateHarnessVersionId: string,
    failureCode: HarnessErrorCode,
  ): Promise<void> {
    let state:
      | "draft"
      | "candidate"
      | "statically_validated"
      | "evaluating"
      | "canary"
      | "approved"
      | "rejected"
      | "retired";
    try {
      state = await this.#qualification.state(candidateHarnessVersionId);
    } catch (error) {
      const failure = asHarnessError(error);
      if (failure.code === "ARTIFACT_UNAVAILABLE") return;
      throw failure;
    }
    if (state === "approved" || state === "rejected" || state === "retired") {
      return;
    }
    const receipt = await this.#receipts.create({
      receiptType: "rejection",
      subjectIds: [
        evolutionRunId,
        candidateHarnessVersionId,
        `failure:${failureCode}`,
      ],
      harnessVersionIds: [candidateHarnessVersionId],
      signer: this.#operationsSigner,
    });
    await this.#qualification.transition({
      harnessVersionId: candidateHarnessVersionId,
      toState: "rejected",
      evidenceReceiptIds: [receipt.receiptId],
      signer: this.#operationsSigner,
    });
  }
}
