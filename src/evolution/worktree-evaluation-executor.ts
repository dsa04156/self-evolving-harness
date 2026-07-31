import { sha256 } from "../core/canonical.js";
import { assertCondition } from "../core/errors.js";
import type { HarnessVersionManifest } from "../domain/components.js";
import type {
  MutationProposal,
} from "./bounded-mutation.js";
import type {
  CandidateBundleIsolationService,
  IsolatedCandidateBundle,
} from "./candidate-bundle.js";
import type { StaticValidationResult } from "./candidate-admission.js";
import type {
  EvolutionEvaluationExecutor,
  EvolutionEvaluationOutcome,
  EvolutionEvaluationPreparation,
} from "./evolution-loop.js";
import {
  type ExternalEvaluationInput,
  ExternalEvaluatorClient,
} from "./external-evaluator.js";
import type { CandidateCostGate } from "./promotion.js";

export interface WorktreeEvaluationPlan
  extends Omit<
    ExternalEvaluationInput,
    | "parentHarnessVersionId"
    | "candidateHarnessVersionId"
    | "candidateFilesystemSnapshotHash"
  > {
  readonly costGate: CandidateCostGate;
}

export interface WorktreeEvaluationContext {
  readonly evolutionRunId: string;
  readonly parentHarnessVersionId: string;
  readonly candidate: HarnessVersionManifest;
  readonly proposal: MutationProposal;
  readonly staticValidation: StaticValidationResult;
  readonly isolation: IsolatedCandidateBundle;
}

export class WorktreeExternalEvaluationExecutor
  implements EvolutionEvaluationExecutor
{
  readonly #isolation: CandidateBundleIsolationService;
  readonly #plan: (
    context: WorktreeEvaluationContext,
  ) => Promise<WorktreeEvaluationPlan>;
  readonly #client: (
    isolation: IsolatedCandidateBundle,
  ) => Promise<ExternalEvaluatorClient> | ExternalEvaluatorClient;

  public constructor(input: {
    isolation: CandidateBundleIsolationService;
    plan: (
      context: WorktreeEvaluationContext,
    ) => Promise<WorktreeEvaluationPlan>;
    client: (
      isolation: IsolatedCandidateBundle,
    ) => Promise<ExternalEvaluatorClient> | ExternalEvaluatorClient;
  }) {
    this.#isolation = input.isolation;
    this.#plan = input.plan;
    this.#client = input.client;
  }

  public async prepare(input: {
    evolutionRunId: string;
    parentHarnessVersionId: string;
    candidate: HarnessVersionManifest;
    proposal: MutationProposal;
    staticValidation: StaticValidationResult;
  }): Promise<EvolutionEvaluationPreparation> {
    const isolated = await this.#isolation.prepare({
      evolutionRunId: input.evolutionRunId,
      parentHarnessVersionId: input.parentHarnessVersionId,
      candidate: input.candidate,
      mutationProposalId: input.proposal.mutationProposalId,
      staticValidationResultId:
        input.staticValidation.staticValidationResultId,
    });
    return {
      candidateFilesystemSnapshotHash:
        isolated.frozen.filesystemSnapshotHash,
      evidenceReceiptIds: isolated.evidenceReceiptIds,
    };
  }

  public async evaluate(input: {
    evolutionRunId: string;
    parentHarnessVersionId: string;
    candidate: HarnessVersionManifest;
    proposal: MutationProposal;
    staticValidation: StaticValidationResult;
    preparation: EvolutionEvaluationPreparation;
  }): Promise<EvolutionEvaluationOutcome> {
    const isolation = this.#isolation.get(input.evolutionRunId);
    assertCondition(
      isolation.parentHarnessVersionId === input.parentHarnessVersionId &&
        isolation.candidateHarnessVersionId ===
          input.candidate.harnessVersionId &&
        isolation.frozen.filesystemSnapshotHash ===
          input.preparation.candidateFilesystemSnapshotHash &&
        sha256(isolation.evidenceReceiptIds) ===
          sha256(input.preparation.evidenceReceiptIds),
      "PROTOCOL_MISMATCH",
      "Prepared candidate isolation changed before evaluation",
    );
    const plan = await this.#plan({
      evolutionRunId: input.evolutionRunId,
      parentHarnessVersionId: input.parentHarnessVersionId,
      candidate: input.candidate,
      proposal: input.proposal,
      staticValidation: input.staticValidation,
      isolation,
    });
    const {
      costGate,
      sourceEvidenceReceiptIds,
      ...externalPlan
    } = plan;
    const evaluator = await this.#client(isolation);
    await evaluator.start();
    try {
      const result = await evaluator.evaluate({
        ...externalPlan,
        parentHarnessVersionId: input.parentHarnessVersionId,
        candidateHarnessVersionId: input.candidate.harnessVersionId,
        candidateFilesystemSnapshotHash:
          isolation.frozen.filesystemSnapshotHash,
        sourceEvidenceReceiptIds: [
          ...new Set([
            ...sourceEvidenceReceiptIds,
            ...isolation.evidenceReceiptIds,
          ]),
        ].sort(),
      });
      return { result, costGate };
    } finally {
      await evaluator.stop();
    }
  }
}
