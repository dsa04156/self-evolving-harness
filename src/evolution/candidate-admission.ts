import path from "node:path";

import { sha256, type JsonValue } from "../core/canonical.js";
import type { Clock, IdFactory } from "../core/determinism.js";
import { assertCondition } from "../core/errors.js";
import { SCHEMA_BASE_URL, type SchemaRegistry } from "../contracts/schema-registry.js";
import { type AuditLink, AuditTrail } from "../evidence/audit-trail.js";
import type { EvidenceReceiptStore } from "../evidence/receipts.js";
import type { HarnessComponentRegistry } from "../harness/component-registry.js";
import { AppendOnlyLog } from "../storage/append-only-log.js";
import type {
  Attestation,
  PrincipalIdentity,
  PrincipalRegistry,
  PrincipalSigner,
} from "../trust/identity.js";
import {
  type BoundedMutationEngine,
  type MutationProposal,
  measurePayloadMutation,
} from "./bounded-mutation.js";
import type { HarnessQualificationStore } from "./harness-lifecycle.js";
import type { AttributionService } from "./weakness-attribution.js";

export const HARNESS_LINEAGE_SCHEMA_ID =
  `${SCHEMA_BASE_URL}harness-lineage-record.schema.json`;
export const STATIC_VALIDATION_RESULT_SCHEMA_ID =
  `${SCHEMA_BASE_URL}static-validation-result.schema.json`;

export interface HarnessLineageRecord {
  readonly schemaVersion: 1;
  readonly recordId: string;
  readonly protocolId: string;
  readonly harnessVersionId: string;
  readonly parentHarnessVersionId: string | null;
  readonly rollbackTargetHarnessVersionId: string | null;
  readonly mutationProposalId: string | null;
  readonly attributionResultId: string | null;
  readonly createdBy: PrincipalIdentity;
  readonly createdAt: string;
  readonly auditLink: AuditLink;
  readonly attestation: Attestation;
}

export interface StaticValidationResult {
  readonly schemaVersion: 1;
  readonly staticValidationResultId: string;
  readonly protocolId: string;
  readonly parentHarnessVersionId: string;
  readonly candidateHarnessVersionId: string;
  readonly mutationProposalId: string;
  readonly epistemicClass: "verifier_outcome";
  readonly valid: true;
  readonly checks: readonly {
    readonly checkId: string;
    readonly passed: true;
    readonly observedValue: JsonValue;
  }[];
  readonly immutableDiffCount: 0;
  readonly disabledConditionalDiffCount: 0;
  readonly changedComponentCount: number;
  readonly validator: PrincipalIdentity;
  readonly createdAt: string;
  readonly auditLink: AuditLink;
  readonly attestation: Attestation;
}

type LineageCore = Omit<HarnessLineageRecord, "auditLink" | "attestation">;
type LineageBody = Omit<HarnessLineageRecord, "attestation">;
type ValidationCore = Omit<StaticValidationResult, "auditLink" | "attestation">;
type ValidationBody = Omit<StaticValidationResult, "attestation">;

function lineageCore(record: HarnessLineageRecord): LineageCore {
  const { auditLink: _auditLink, attestation: _attestation, ...core } = record;
  return core;
}

function lineageBody(record: HarnessLineageRecord): LineageBody {
  const { attestation: _attestation, ...body } = record;
  return body;
}

function validationCore(result: StaticValidationResult): ValidationCore {
  const { auditLink: _auditLink, attestation: _attestation, ...core } = result;
  return core;
}

function validationBody(result: StaticValidationResult): ValidationBody {
  const { attestation: _attestation, ...body } = result;
  return body;
}

function asLineage(value: JsonValue): HarnessLineageRecord {
  return value as unknown as HarnessLineageRecord;
}

function asValidation(value: JsonValue): StaticValidationResult {
  return value as unknown as StaticValidationResult;
}

function equalValue(left: unknown, right: unknown): boolean {
  return sha256(left) === sha256(right);
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

export class HarnessLineageStore {
  readonly #protocolId: string;
  readonly #schemas: SchemaRegistry;
  readonly #audit: AuditTrail;
  readonly #principals: PrincipalRegistry;
  readonly #clock: Clock;
  readonly #ids: IdFactory;
  readonly #log: AppendOnlyLog<JsonValue>;

  public constructor(input: {
    root: string;
    protocolId: string;
    schemas: SchemaRegistry;
    audit: AuditTrail;
    principals: PrincipalRegistry;
    clock: Clock;
    ids: IdFactory;
  }) {
    this.#protocolId = input.protocolId;
    this.#schemas = input.schemas;
    this.#audit = input.audit;
    this.#principals = input.principals;
    this.#clock = input.clock;
    this.#ids = input.ids;
    this.#log = new AppendOnlyLog<JsonValue>(
      path.join(input.root, "evolution"),
      "harness.lineage",
    );
  }

  public async append(input: {
    harnessVersionId: string;
    parentHarnessVersionId: string;
    mutationProposalId: string;
    attributionResultId: string | null;
    signer: PrincipalSigner;
  }): Promise<HarnessLineageRecord> {
    assertCondition(
      input.signer.identity.role === "operations_owner",
      "AUTHORIZATION_DENIED",
      "Only operations may commit harness lineage",
    );
    assertCondition(
      (await this.records(input.harnessVersionId)).length === 0,
      "CONFLICT",
      "Harness lineage already exists",
    );
    const core: LineageCore = {
      schemaVersion: 1,
      recordId: this.#ids.next("harness-lineage"),
      protocolId: this.#protocolId,
      harnessVersionId: input.harnessVersionId,
      parentHarnessVersionId: input.parentHarnessVersionId,
      rollbackTargetHarnessVersionId: input.parentHarnessVersionId,
      mutationProposalId: input.mutationProposalId,
      attributionResultId: input.attributionResultId,
      createdBy: input.signer.identity,
      createdAt: this.#clock.now().toISOString(),
    };
    const auditLink = await this.#audit.appendSubject({
      subjectType: "HarnessLineageRecord",
      subjectId: core.recordId,
      subjectHash: sha256(core),
    });
    const body: LineageBody = { ...core, auditLink };
    const record: HarnessLineageRecord = {
      ...body,
      attestation: input.signer.attest(body as unknown as JsonValue),
    };
    this.#schemas.validate(
      HARNESS_LINEAGE_SCHEMA_ID,
      record as unknown as JsonValue,
    );
    await this.#log.append(record as unknown as JsonValue);
    return record;
  }

  public async records(harnessVersionId?: string): Promise<HarnessLineageRecord[]> {
    const records = (await this.#log.readAll()).map((record) =>
      asLineage(record.payload),
    );
    return harnessVersionId === undefined
      ? records
      : records.filter(
          (record) => record.harnessVersionId === harnessVersionId,
        );
  }

  public async verify(record: HarnessLineageRecord): Promise<void> {
    this.#schemas.validate(
      HARNESS_LINEAGE_SCHEMA_ID,
      record as unknown as JsonValue,
    );
    assertCondition(
      record.protocolId === this.#protocolId &&
        record.createdBy.role === "operations_owner" &&
        record.parentHarnessVersionId === record.rollbackTargetHarnessVersionId,
      "PROTOCOL_MISMATCH",
      "Lineage pin or rollback parent mismatch",
    );
    this.#principals.verify(
      record.createdBy,
      lineageBody(record) as unknown as JsonValue,
      record.attestation,
    );
    await this.#audit.verifyLink(record.auditLink, {
      subjectType: "HarnessLineageRecord",
      subjectId: record.recordId,
      subjectHash: sha256(lineageCore(record)),
    });
  }

  public async verifyAll(): Promise<void> {
    const harnessIds = new Set<string>();
    for (const record of await this.records()) {
      assertCondition(
        !harnessIds.has(record.harnessVersionId),
        "CONFLICT",
        "Duplicate harness lineage",
      );
      harnessIds.add(record.harnessVersionId);
      await this.verify(record);
    }
  }
}

export class CandidateAdmissionService {
  readonly #protocolId: string;
  readonly #schemas: SchemaRegistry;
  readonly #audit: AuditTrail;
  readonly #receipts: EvidenceReceiptStore;
  readonly #components: HarnessComponentRegistry;
  readonly #mutations: BoundedMutationEngine;
  readonly #attributions: AttributionService;
  readonly #lineage: HarnessLineageStore;
  readonly #lifecycle: HarnessQualificationStore;
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
    receipts: EvidenceReceiptStore;
    components: HarnessComponentRegistry;
    mutations: BoundedMutationEngine;
    attributions: AttributionService;
    lineage: HarnessLineageStore;
    lifecycle: HarnessQualificationStore;
    principals: PrincipalRegistry;
    signer: PrincipalSigner;
    clock: Clock;
    ids: IdFactory;
  }) {
    assertCondition(
      input.signer.identity.role === "operations_owner",
      "AUTHORIZATION_DENIED",
      "Candidate admission requires operations-owner identity",
    );
    this.#protocolId = input.protocolId;
    this.#schemas = input.schemas;
    this.#audit = input.audit;
    this.#receipts = input.receipts;
    this.#components = input.components;
    this.#mutations = input.mutations;
    this.#attributions = input.attributions;
    this.#lineage = input.lineage;
    this.#lifecycle = input.lifecycle;
    this.#principals = input.principals;
    this.#signer = input.signer;
    this.#clock = input.clock;
    this.#ids = input.ids;
    this.#log = new AppendOnlyLog<JsonValue>(
      path.join(input.root, "evolution"),
      "static-validation.results",
    );
  }

  public async admit(proposal: MutationProposal): Promise<{
    readonly lineage: HarnessLineageRecord;
    readonly validation: StaticValidationResult;
  }> {
    const checks = await this.#validateProposal(proposal);
    const lineage = await this.#lineage.append({
      harnessVersionId: proposal.candidateHarnessVersionId,
      parentHarnessVersionId: proposal.parentHarnessVersionId,
      mutationProposalId: proposal.mutationProposalId,
      attributionResultId: proposal.attributionResultId,
      signer: this.#signer,
    });
    const candidateReceipt = await this.#receipts.create({
      receiptType: "artifact_retention",
      subjectIds: [
        proposal.candidateHarnessVersionId,
        proposal.mutationProposalId,
        lineage.recordId,
      ],
      harnessVersionIds: [proposal.candidateHarnessVersionId],
      signer: this.#signer,
    });
    await this.#lifecycle.createDraft({
      harnessVersionId: proposal.candidateHarnessVersionId,
      evidenceReceiptIds: [candidateReceipt.receiptId],
      signer: this.#signer,
    });
    await this.#lifecycle.transition({
      harnessVersionId: proposal.candidateHarnessVersionId,
      toState: "candidate",
      evidenceReceiptIds: [candidateReceipt.receiptId],
      signer: this.#signer,
    });
    const diff = this.#components.diffHarnesses(
      proposal.parentHarnessVersionId,
      proposal.candidateHarnessVersionId,
    );
    const core: ValidationCore = {
      schemaVersion: 1,
      staticValidationResultId: this.#ids.next("static-validation"),
      protocolId: this.#protocolId,
      parentHarnessVersionId: proposal.parentHarnessVersionId,
      candidateHarnessVersionId: proposal.candidateHarnessVersionId,
      mutationProposalId: proposal.mutationProposalId,
      epistemicClass: "verifier_outcome",
      valid: true,
      checks,
      immutableDiffCount: 0,
      disabledConditionalDiffCount: 0,
      changedComponentCount: diff.changed.length,
      validator: this.#signer.identity,
      createdAt: this.#clock.now().toISOString(),
    };
    const auditLink = await this.#audit.appendSubject({
      subjectType: "StaticValidationResult",
      subjectId: core.staticValidationResultId,
      subjectHash: sha256(core),
    });
    const body: ValidationBody = { ...core, auditLink };
    const validation: StaticValidationResult = {
      ...body,
      attestation: this.#signer.attest(body as unknown as JsonValue),
    };
    this.#schemas.validate(
      STATIC_VALIDATION_RESULT_SCHEMA_ID,
      validation as unknown as JsonValue,
    );
    await this.#log.append(validation as unknown as JsonValue);
    const validationReceipt = await this.#receipts.create({
      receiptType: "static_validation",
      subjectIds: [
        proposal.candidateHarnessVersionId,
        validation.staticValidationResultId,
      ],
      harnessVersionIds: [proposal.candidateHarnessVersionId],
      signer: this.#signer,
    });
    await this.#lifecycle.transition({
      harnessVersionId: proposal.candidateHarnessVersionId,
      toState: "statically_validated",
      evidenceReceiptIds: [validationReceipt.receiptId],
      signer: this.#signer,
    });
    await this.#mutations.setDisposition(proposal.mutationProposalId, "accepted");
    return { lineage, validation };
  }

  public async all(): Promise<StaticValidationResult[]> {
    return (await this.#log.readAll()).map((record) =>
      asValidation(record.payload),
    );
  }

  public async verify(result: StaticValidationResult): Promise<void> {
    this.#schemas.validate(
      STATIC_VALIDATION_RESULT_SCHEMA_ID,
      result as unknown as JsonValue,
    );
    assertCondition(
      result.protocolId === this.#protocolId &&
        result.validator.role === "operations_owner" &&
        result.valid &&
        result.checks.every((check) => check.passed),
      "PROTOCOL_MISMATCH",
      "Static validation result pin mismatch",
    );
    this.#principals.verify(
      result.validator,
      validationBody(result) as unknown as JsonValue,
      result.attestation,
    );
    await this.#audit.verifyLink(result.auditLink, {
      subjectType: "StaticValidationResult",
      subjectId: result.staticValidationResultId,
      subjectHash: sha256(validationCore(result)),
    });
  }

  public async verifyAll(): Promise<void> {
    for (const result of await this.all()) await this.verify(result);
  }

  async #validateProposal(
    proposal: MutationProposal,
  ): Promise<StaticValidationResult["checks"]> {
    await this.#mutations.verifyPendingProposal(proposal);
    assertCondition(
      proposal.protocolId === this.#protocolId &&
        proposal.proposer.role === "proposer" &&
        equalValue(
          proposal.proposer,
          proposal.predictionMetadata.producerIdentity,
        ),
      "PROTOCOL_MISMATCH",
      "Proposal protocol or producer identity mismatch",
    );
    assertCondition(
      (await this.#lifecycle.records(proposal.candidateHarnessVersionId)).length ===
        0,
      "CONFLICT",
      "Candidate already has a qualification lifecycle",
    );
    const parent = this.#components.getHarness(proposal.parentHarnessVersionId);
    const candidate = this.#components.getHarness(
      proposal.candidateHarnessVersionId,
    );
    assertCondition(
      parent.identity.typeRegistryId === candidate.identity.typeRegistryId &&
        parent.identity.requiredRuntimeContractHash ===
          candidate.identity.requiredRuntimeContractHash,
      "PROTOCOL_MISMATCH",
      "Candidate changed the type registry or runtime contract",
    );
    const diff = this.#components.diffHarnesses(
      parent.harnessVersionId,
      candidate.harnessVersionId,
    );
    assertCondition(
      diff.changed.length === proposal.targetChanges.length &&
        diff.changed.length === proposal.changeSurface.changedComponentCount &&
        diff.immutableDiffCount === 0 &&
        diff.disabledConditionalDiffCount === 0 &&
        proposal.immutableDiffCount === 0 &&
        proposal.disabledConditionalDiffCount === 0,
      "AUTHORIZATION_DENIED",
      "Candidate diff violates the bounded mutable envelope",
    );
    assertCondition(
      (proposal.causeClass === "single_fault" && diff.changed.length === 1) ||
        (proposal.causeClass === "multi_cause" &&
          diff.changed.length >= 1 &&
          diff.changed.length <= 2),
      "SCHEMA_INVALID",
      "Cause class and changed-component count disagree",
    );
    let expandedClosureEditBytes = 0;
    let replacementSurfaceBytes = 0;
    let normalizedTokenInsertions = 0;
    let normalizedTokenDeletions = 0;
    let structuralEditOperations = 0;
    for (const change of diff.changed) {
      const declared = proposal.targetChanges.find(
        (target) =>
          target.before.componentManifestId ===
            change.before.componentManifestId &&
          target.after.componentManifestId === change.after.componentManifestId,
      );
      assertCondition(
        declared !== undefined &&
          declared.componentId === change.before.componentId &&
          declared.directlyEdited,
        "HASH_MISMATCH",
        "Proposal target does not equal the resolved harness diff",
      );
      const before = this.#components.getComponent(
        change.before.componentManifestId,
      );
      const after = this.#components.getComponent(
        change.after.componentManifestId,
      );
      assertCondition(
        equalValue(
          declared.changedArtifactHashes,
          uniqueSorted([
            before.identity.payload.artifact.contentHash,
            after.identity.payload.artifact.contentHash,
          ]),
        ) &&
          equalValue(
            this.#components.capabilitiesFor(before.componentManifestId),
            this.#components.capabilitiesFor(after.componentManifestId),
          ),
        "HASH_MISMATCH",
        "Declared artifacts or capabilities do not match the registry",
      );
      const measure = measurePayloadMutation(
        await this.#components.getPayload(before.componentManifestId),
        await this.#components.getPayload(after.componentManifestId),
        declared.semanticOperations.length,
      );
      expandedClosureEditBytes += measure.expandedClosureEditBytes;
      replacementSurfaceBytes += measure.replacementSurfaceBytes;
      normalizedTokenInsertions += measure.normalizedTokenInsertions;
      normalizedTokenDeletions += measure.normalizedTokenDeletions;
      structuralEditOperations += measure.structuralEditOperations;
    }
    assertCondition(
      equalValue(proposal.changeSurface, {
        changedComponentCount: diff.changed.length,
        expandedClosureEditBytes,
        replacementSurfaceBytes,
        normalizedTokenInsertions,
        normalizedTokenDeletions,
        structuralEditOperations,
        capabilityIdsAdded: [],
        capabilityIdsRemoved: [],
        parentClosureHash: parent.identity.behaviorClosure.closureHash,
        candidateClosureHash: candidate.identity.behaviorClosure.closureHash,
      }),
      "HASH_MISMATCH",
      "Mutation surface does not match independent recomputation",
    );
    if (proposal.attributionMode === "guided") {
      assertCondition(
        proposal.attributionResultId !== null,
        "SCHEMA_INVALID",
        "Guided proposal has no attribution",
      );
      const attribution = await this.#attributions.get(
        proposal.attributionResultId,
      );
      const targetedBefore = proposal.targetChanges.map(
        (target) => target.before.componentManifestId,
      );
      const ranked = attribution.rankedCandidates.map(
        (rankedCandidate) => rankedCandidate.componentManifestId,
      );
      assertCondition(
        attribution.harnessVersionId === proposal.parentHarnessVersionId &&
          attribution.datasetRole === "mine" &&
          attribution.useClass === "proposal_input" &&
          targetedBefore.every((componentId) => ranked.includes(componentId)) &&
          (proposal.causeClass !== "single_fault" ||
            ranked[0] === targetedBefore[0]),
        "AUTHORIZATION_DENIED",
        "Proposal targets are not supported by the cited attribution",
      );
    } else {
      assertCondition(
        proposal.attributionResultId === null,
        "SCHEMA_INVALID",
        "Ablated proposal unexpectedly cites attribution",
      );
    }
    return [
      {
        checkId: "static.schema-and-journal",
        passed: true,
        observedValue: proposal.mutationProposalId,
      },
      {
        checkId: "static.protocol-and-runtime-pins",
        passed: true,
        observedValue: candidate.identity.requiredRuntimeContractHash,
      },
      {
        checkId: "static.component-bound",
        passed: true,
        observedValue: diff.changed.length,
      },
      {
        checkId: "static.immutable-diff-zero",
        passed: true,
        observedValue: diff.immutableDiffCount,
      },
      {
        checkId: "static.capability-additions-zero",
        passed: true,
        observedValue: 0,
      },
      {
        checkId: "static.expanded-edit-ceiling",
        passed: true,
        observedValue: expandedClosureEditBytes,
      },
      {
        checkId: "static.attribution-binding",
        passed: true,
        observedValue: proposal.attributionMode,
      },
    ];
  }
}
