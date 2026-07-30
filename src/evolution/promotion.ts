import path from "node:path";

import { sha256, type JsonValue } from "../core/canonical.js";
import type { Clock, IdFactory } from "../core/determinism.js";
import { assertCondition } from "../core/errors.js";
import { SCHEMA_BASE_URL, type SchemaRegistry } from "../contracts/schema-registry.js";
import { type AuditLink, AuditTrail } from "../evidence/audit-trail.js";
import type { EvidenceReceiptStore } from "../evidence/receipts.js";
import { AppendOnlyLog } from "../storage/append-only-log.js";
import type {
  Attestation,
  PrincipalIdentity,
  PrincipalRegistry,
  PrincipalSigner,
} from "../trust/identity.js";
import {
  EVALUATION_RESULT_SCHEMA_ID,
  type EvaluationResult,
} from "./external-evaluator.js";
import type { HarnessQualificationStore } from "./harness-lifecycle.js";

export const CANDIDATE_COST_GATE_SCHEMA_ID =
  `${SCHEMA_BASE_URL}candidate-cost-gate.schema.json`;
export const PROMOTION_DECISION_SCHEMA_ID =
  `${SCHEMA_BASE_URL}promotion-decision.schema.json`;

export interface CandidateCostGate {
  readonly schemaVersion: 1;
  readonly formulaVersion: "seh-candidate-cost-v1";
  readonly gateTaskSetHash: string;
  readonly taskCount: number;
  readonly candidatePasses: number;
  readonly parentPasses: number;
  readonly failToPassCount: number;
  readonly passToFailCount: number;
  readonly candidateFailedOrTimedOutTasks: number;
  readonly parentFailedOrTimedOutTasks: number;
  readonly candidateTotalChargedTokens: number;
  readonly parentTotalChargedTokens: number;
  readonly candidateCostTerm: number;
  readonly parentCostTerm: number;
  readonly normalThresholdLeft: number;
  readonly normalThresholdRight: number;
  readonly highCostEfficiencyLeft: number;
  readonly highCostEfficiencyRight: number;
  readonly path: "normal" | "high_cost_exception" | "rejected";
  readonly passed: boolean;
  readonly sourceLedgerReceiptIds: readonly string[];
}

export interface PromotionDecision {
  readonly schemaVersion: 3;
  readonly promotionDecisionId: string;
  readonly protocolId: string;
  readonly epistemicClass: "control_decision";
  readonly action: "approve" | "reject";
  readonly parentHarnessVersionId: string | null;
  readonly candidateHarnessVersionId: string;
  readonly evaluationResultIds: readonly string[];
  readonly promotionPolicyHash: string;
  readonly candidateCostGate: CandidateCostGate | null;
  readonly reasonCodes: readonly string[];
  readonly criteria: readonly {
    readonly gateId: string;
    readonly passed: boolean;
    readonly sourceResultId: string;
    readonly sourceDatasetRole: "mine" | "gate" | "deterministic";
  }[];
  readonly decidedBy: PrincipalIdentity;
  readonly decidedAt: string;
  readonly auditLink: AuditLink;
  readonly attestation: Attestation;
}

type DecisionCore = Omit<PromotionDecision, "auditLink" | "attestation">;
type SignedDecision = Omit<PromotionDecision, "attestation">;

function evaluationObject(result: EvaluationResult): Record<string, JsonValue> {
  return result as unknown as Record<string, JsonValue>;
}

export function computeCandidateCostGate(input: {
  gateTaskSetHash: string;
  taskCount: number;
  candidatePasses: number;
  parentPasses: number;
  failToPassCount: number;
  passToFailCount: number;
  candidateFailedOrTimedOutTasks: number;
  parentFailedOrTimedOutTasks: number;
  candidateTotalChargedTokens: number;
  parentTotalChargedTokens: number;
  sourceLedgerReceiptIds: readonly string[];
}): CandidateCostGate {
  assertCondition(input.taskCount > 0, "SCHEMA_INVALID", "Cost gate task set is empty");
  const candidateCostTerm = input.candidateTotalChargedTokens + input.taskCount;
  const parentCostTerm = input.parentTotalChargedTokens + input.taskCount;
  const normalThresholdLeft = 10 * candidateCostTerm;
  const normalThresholdRight = 11 * parentCostTerm;
  const highCostEfficiencyLeft =
    20 * (2 * input.candidatePasses + 1) * parentCostTerm;
  const highCostEfficiencyRight =
    21 * (2 * input.parentPasses + 1) * candidateCostTerm;
  const normal = normalThresholdLeft <= normalThresholdRight;
  const highCostException =
    !normal &&
    input.candidatePasses - input.parentPasses >= 1 &&
    input.failToPassCount - input.passToFailCount >= 1 &&
    highCostEfficiencyLeft >= highCostEfficiencyRight;
  return {
    schemaVersion: 1,
    formulaVersion: "seh-candidate-cost-v1",
    ...input,
    sourceLedgerReceiptIds: [...new Set(input.sourceLedgerReceiptIds)].sort(),
    candidateCostTerm,
    parentCostTerm,
    normalThresholdLeft,
    normalThresholdRight,
    highCostEfficiencyLeft,
    highCostEfficiencyRight,
    path: normal ? "normal" : highCostException ? "high_cost_exception" : "rejected",
    passed: normal || highCostException,
  };
}

export class PromotionService {
  readonly #protocolId: string;
  readonly #promotionPolicyHash: string;
  readonly #schemas: SchemaRegistry;
  readonly #audit: AuditTrail;
  readonly #receipts: EvidenceReceiptStore;
  readonly #lifecycle: HarnessQualificationStore;
  readonly #principals: PrincipalRegistry;
  readonly #signer: PrincipalSigner;
  readonly #clock: Clock;
  readonly #ids: IdFactory;
  readonly #log: AppendOnlyLog<JsonValue>;

  public constructor(input: {
    root: string;
    protocolId: string;
    promotionPolicyHash: string;
    schemas: SchemaRegistry;
    audit: AuditTrail;
    receipts: EvidenceReceiptStore;
    lifecycle: HarnessQualificationStore;
    principals: PrincipalRegistry;
    signer: PrincipalSigner;
    clock: Clock;
    ids: IdFactory;
  }) {
    assertCondition(
      input.signer.identity.role === "promoter",
      "AUTHORIZATION_DENIED",
      "Promotion service requires promoter identity",
    );
    this.#protocolId = input.protocolId;
    this.#promotionPolicyHash = input.promotionPolicyHash;
    this.#schemas = input.schemas;
    this.#audit = input.audit;
    this.#receipts = input.receipts;
    this.#lifecycle = input.lifecycle;
    this.#principals = input.principals;
    this.#signer = input.signer;
    this.#clock = input.clock;
    this.#ids = input.ids;
    this.#log = new AppendOnlyLog<JsonValue>(
      path.join(input.root, "evolution"),
      "promotion.decisions",
    );
  }

  public async decide(input: {
    parentHarnessVersionId: string | null;
    candidateHarnessVersionId: string;
    evaluationResults: readonly EvaluationResult[];
    costGate: CandidateCostGate;
  }): Promise<PromotionDecision> {
    assertCondition(
      await this.#lifecycle.state(input.candidateHarnessVersionId) === "canary",
      "INVALID_STATE_TRANSITION",
      "Only an offline-canary candidate may be decided",
    );
    assertCondition(
      input.evaluationResults.length > 0,
      "SCHEMA_INVALID",
      "Promotion requires evaluation evidence",
    );
    this.#schemas.validate(
      CANDIDATE_COST_GATE_SCHEMA_ID,
      input.costGate as unknown as JsonValue,
    );
    const criteria: PromotionDecision["criteria"][number][] = [];
    for (const result of input.evaluationResults) {
      await this.#verifyEvaluation(result);
      assertCondition(
        result.protocolId === this.#protocolId &&
          result.parentHarnessVersionId === input.parentHarnessVersionId &&
          result.candidateHarnessVersionId === input.candidateHarnessVersionId,
        "PROTOCOL_MISMATCH",
        "Promotion evidence pins another candidate",
      );
      const resultObject = evaluationObject(result);
      const validity = resultObject["validity"];
      const datasetRole = resultObject["datasetRole"];
      assertCondition(
        datasetRole === "mine" || datasetRole === "gate" || datasetRole === "deterministic",
        "AUTHORIZATION_DENIED",
        "Final/held-out results cannot drive adaptive promotion",
      );
      criteria.push(
        {
          gateId: "gate.evaluation-valid",
          passed: validity === "valid",
          sourceResultId: result.evaluationResultId,
          sourceDatasetRole: datasetRole,
        },
        {
          gateId: "gate.no-violations",
          passed: result.violations.length === 0,
          sourceResultId: result.evaluationResultId,
          sourceDatasetRole: datasetRole,
        },
        {
          gateId: "gate.no-point-regression",
          passed:
            result.aggregate.candidatePassRateMicros >=
            result.aggregate.parentPassRateMicros,
          sourceResultId: result.evaluationResultId,
          sourceDatasetRole: datasetRole,
        },
        {
          gateId: "gate.ci-lower-minus-two",
          passed:
            result.aggregate.pairedCi95LowerPercentagePointMicros >= -2_000_000,
          sourceResultId: result.evaluationResultId,
          sourceDatasetRole: datasetRole,
        },
      );
    }
    criteria.push({
      gateId: "gate.matched-cost",
      passed: input.costGate.passed,
      sourceResultId: input.evaluationResults[0]!.evaluationResultId,
      sourceDatasetRole:
        (evaluationObject(input.evaluationResults[0]!)["datasetRole"] as
          | "mine"
          | "gate"
          | "deterministic"),
    });
    const approve = criteria.every((criterion) => criterion.passed);
    const core: DecisionCore = {
      schemaVersion: 3,
      promotionDecisionId: this.#ids.next("promotion-decision"),
      protocolId: this.#protocolId,
      epistemicClass: "control_decision",
      action: approve ? "approve" : "reject",
      parentHarnessVersionId: input.parentHarnessVersionId,
      candidateHarnessVersionId: input.candidateHarnessVersionId,
      evaluationResultIds: input.evaluationResults
        .map((result) => result.evaluationResultId)
        .sort(),
      promotionPolicyHash: this.#promotionPolicyHash,
      candidateCostGate: input.costGate,
      reasonCodes: approve
        ? ["ALL_QUALIFICATION_GATES_PASSED"]
        : criteria
            .filter((criterion) => !criterion.passed)
            .map((criterion) => `FAILED_${criterion.gateId.replaceAll(".", "_").toUpperCase()}`),
      criteria,
      decidedBy: this.#signer.identity,
      decidedAt: this.#clock.now().toISOString(),
    };
    const auditLink = await this.#audit.appendSubject({
      subjectType: "PromotionDecision",
      subjectId: core.promotionDecisionId,
      subjectHash: sha256(core),
    });
    const body: SignedDecision = { ...core, auditLink };
    const decision: PromotionDecision = {
      ...body,
      attestation: this.#signer.attest(body as unknown as JsonValue),
    };
    this.#schemas.validate(PROMOTION_DECISION_SCHEMA_ID, decision as unknown as JsonValue);
    await this.#log.append(decision as unknown as JsonValue);
    const receipt = await this.#receipts.create({
      receiptType: approve ? "promotion" : "rejection",
      subjectIds: [
        input.candidateHarnessVersionId,
        decision.promotionDecisionId,
        ...decision.evaluationResultIds,
      ],
      harnessVersionIds: [input.candidateHarnessVersionId],
      signer: this.#signer,
    });
    await this.#lifecycle.transition({
      harnessVersionId: input.candidateHarnessVersionId,
      toState: approve ? "approved" : "rejected",
      evidenceReceiptIds: [receipt.receiptId],
      signer: this.#signer,
    });
    return decision;
  }

  public async approvedDecisionFor(harnessVersionId: string): Promise<PromotionDecision | null> {
    const decisions = (await this.#log.readAll())
      .map((record) => record.payload as unknown as PromotionDecision)
      .filter(
        (decision) =>
          decision.candidateHarnessVersionId === harnessVersionId &&
          decision.action === "approve",
      );
    const decision = decisions.at(-1);
    if (decision === undefined) return null;
    await this.verifyDecision(decision);
    return decision;
  }

  public async verifyDecision(decision: PromotionDecision): Promise<void> {
    this.#schemas.validate(
      PROMOTION_DECISION_SCHEMA_ID,
      decision as unknown as JsonValue,
    );
    assertCondition(
      decision.protocolId === this.#protocolId &&
        decision.promotionPolicyHash === this.#promotionPolicyHash,
      "PROTOCOL_MISMATCH",
      "Promotion decision policy pin mismatch",
    );
    assertCondition(
      decision.decidedBy.role === "promoter",
      "AUTHORIZATION_DENIED",
      "Promotion decision signer is not a promoter",
    );
    const { attestation: _attestation, ...signedBody } = decision;
    this.#principals.verify(
      decision.decidedBy,
      signedBody as unknown as JsonValue,
      decision.attestation,
    );
    const {
      auditLink: _auditLink,
      attestation: _ignoredAttestation,
      ...core
    } = decision;
    await this.#audit.verifyLink(decision.auditLink, {
      subjectType: "PromotionDecision",
      subjectId: decision.promotionDecisionId,
      subjectHash: sha256(core as unknown as JsonValue),
    });
  }

  async #verifyEvaluation(result: EvaluationResult): Promise<void> {
    const object = evaluationObject(result);
    this.#schemas.validate(EVALUATION_RESULT_SCHEMA_ID, object);
    const { attestation: attestationValue, ...signedBody } = object;
    this.#principals.verify(
      result.evaluator,
      signedBody,
      attestationValue as unknown as Attestation,
    );
    const { auditLink: _auditLink, ...coreWithAttestation } = object;
    const { attestation: _attestation, ...core } = coreWithAttestation;
    await this.#audit.verifyLink(result.auditLink, {
      subjectType: "EvaluationResult",
      subjectId: result.evaluationResultId,
      subjectHash: sha256(core),
    });
  }
}
