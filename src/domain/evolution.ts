import type { ComponentType } from "./components.js";

export interface FailureObservation {
  readonly taskId: string;
  readonly sessionId: string;
  readonly signature: string;
  readonly verifierSummary: string;
  readonly sourceEventIds: readonly string[];
  readonly sourceReceiptIds: readonly string[];
}

export interface FailurePatternView {
  readonly failurePatternId: string;
  readonly signature: string;
  readonly taskIds: readonly string[];
  readonly observations: readonly FailureObservation[];
}

export interface AttributionCandidate {
  readonly componentId: string;
  readonly componentType: ComponentType;
  readonly confidence: number;
  readonly mechanism: string;
  readonly alternativeExplanation: string;
}

export interface AttributionView {
  readonly attributionResultId: string;
  readonly failurePatternId: string;
  readonly rankedCandidates: readonly AttributionCandidate[];
}

export interface BoundedMutation {
  readonly componentId: string;
  readonly componentType: ComponentType;
  readonly parentContentHash: string;
  readonly candidateContent: string;
  readonly predictedFix: string;
  readonly predictedRegression: string;
  readonly preservationContract: readonly string[];
}

export interface MutationProposalView {
  readonly mutationProposalId: string;
  readonly parentHarnessVersionId: string;
  readonly attributionResultId: string;
  readonly mutations: readonly BoundedMutation[];
  readonly proposalHash: string;
}

export interface EvaluationSummary {
  readonly evaluationResultId: string;
  readonly candidateHarnessVersionId: string;
  readonly parentHarnessVersionId: string;
  readonly deterministicPassed: boolean;
  readonly candidatePassedTasks: number;
  readonly parentPassedTasks: number;
  readonly passToFail: number;
  readonly failToPass: number;
  readonly violations: readonly string[];
}
