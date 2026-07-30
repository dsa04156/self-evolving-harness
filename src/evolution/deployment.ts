import { constants } from "node:fs";
import { mkdir, open, readFile, unlink } from "node:fs/promises";
import path from "node:path";

import {
  canonicalBytes,
  parseStrictJson,
  sha256,
  type JsonValue,
} from "../core/canonical.js";
import type { Clock, IdFactory } from "../core/determinism.js";
import { HarnessError, assertCondition } from "../core/errors.js";
import { SCHEMA_BASE_URL, type SchemaRegistry } from "../contracts/schema-registry.js";
import { type AuditLink, AuditTrail } from "../evidence/audit-trail.js";
import type { HarnessComponentRegistry } from "../harness/component-registry.js";
import { AppendOnlyLog } from "../storage/append-only-log.js";
import type {
  Attestation,
  PrincipalIdentity,
  PrincipalRegistry,
  PrincipalSigner,
} from "../trust/identity.js";
import type { HarnessQualificationStore } from "./harness-lifecycle.js";
import type { PromotionService } from "./promotion.js";

export const DEPLOYMENT_DECISION_SCHEMA_ID =
  `${SCHEMA_BASE_URL}deployment-decision.schema.json`;
export const DEPLOYMENT_POINTER_SCHEMA_ID =
  `${SCHEMA_BASE_URL}deployment-pointer-record.schema.json`;

export interface PointerExpectation {
  readonly generation: number;
  readonly harnessVersionId: string | null;
  readonly manifestHash: string | null;
  readonly targetQualificationDecisionId: string | null;
  readonly rollbackTargetHarnessVersionId: string | null;
  readonly rollbackTargetManifestHash: string | null;
  readonly rollbackTargetQualificationDecisionId: string | null;
  readonly pointerRecordHash: string | null;
}

interface PointerTarget {
  readonly generation: number;
  readonly harnessVersionId: string | null;
  readonly manifestHash: string | null;
}

export interface DeploymentDecision {
  readonly schemaVersion: 2;
  readonly deploymentDecisionId: string;
  readonly protocolId: string;
  readonly epistemicClass: "control_decision";
  readonly action: "initialize" | "deploy" | "rollback" | "decommission";
  readonly channelId: "production";
  readonly expectedBefore: PointerExpectation;
  readonly target: PointerTarget;
  readonly targetQualificationDecisionId: string | null;
  readonly rollbackTargetHarnessVersionId: string | null;
  readonly rollbackTargetManifestHash: string | null;
  readonly rollbackTargetQualificationDecisionId: string | null;
  readonly deploymentPolicyHash: string;
  readonly reasonCodes: readonly string[];
  readonly decidedBy: PrincipalIdentity;
  readonly decidedAt: string;
  readonly auditLink: AuditLink;
  readonly attestation: Attestation;
}

export interface DeploymentPointerRecord {
  readonly schemaVersion: 3;
  readonly recordId: string;
  readonly protocolId: string;
  readonly channelId: "production";
  readonly operation: DeploymentDecision["action"];
  readonly expectedBefore: PointerExpectation;
  readonly after: PointerTarget;
  readonly deploymentDecisionId: string;
  readonly targetQualificationDecisionId: string | null;
  readonly rollbackTargetHarnessVersionId: string | null;
  readonly rollbackTargetManifestHash: string | null;
  readonly rollbackTargetQualificationDecisionId: string | null;
  readonly priorTargetDisposition: "none" | "retained_approved";
  readonly appliedBy: PrincipalIdentity;
  readonly appliedAt: string;
  readonly auditLink: AuditLink;
  readonly attestation: Attestation;
}

type DecisionCore = Omit<DeploymentDecision, "auditLink" | "attestation">;
type DecisionSignedBody = Omit<DeploymentDecision, "attestation">;
type PointerCore = Omit<DeploymentPointerRecord, "auditLink" | "attestation">;
type PointerSignedBody = Omit<DeploymentPointerRecord, "attestation">;

function decisionCore(decision: DeploymentDecision): DecisionCore {
  const { auditLink: _auditLink, attestation: _attestation, ...core } = decision;
  return core;
}

function decisionBody(decision: DeploymentDecision): DecisionSignedBody {
  const { attestation: _attestation, ...body } = decision;
  return body;
}

function pointerCore(record: DeploymentPointerRecord): PointerCore {
  const { auditLink: _auditLink, attestation: _attestation, ...core } = record;
  return core;
}

function pointerBody(record: DeploymentPointerRecord): PointerSignedBody {
  const { attestation: _attestation, ...body } = record;
  return body;
}

function nullAnchor(): PointerExpectation {
  return {
    generation: -1,
    harnessVersionId: null,
    manifestHash: null,
    targetQualificationDecisionId: null,
    rollbackTargetHarnessVersionId: null,
    rollbackTargetManifestHash: null,
    rollbackTargetQualificationDecisionId: null,
    pointerRecordHash: null,
  };
}

function asDecision(value: JsonValue): DeploymentDecision {
  return value as unknown as DeploymentDecision;
}

function asPointerRecord(value: JsonValue): DeploymentPointerRecord {
  return value as unknown as DeploymentPointerRecord;
}

export class DeploymentAuthorizer {
  readonly #protocolId: string;
  readonly #deploymentPolicyHash: string;
  readonly #schemas: SchemaRegistry;
  readonly #audit: AuditTrail;
  readonly #components: HarnessComponentRegistry;
  readonly #promotions: PromotionService;
  readonly #signer: PrincipalSigner;
  readonly #clock: Clock;
  readonly #ids: IdFactory;
  readonly #log: AppendOnlyLog<JsonValue>;

  public constructor(input: {
    root: string;
    protocolId: string;
    deploymentPolicyHash: string;
    schemas: SchemaRegistry;
    audit: AuditTrail;
    components: HarnessComponentRegistry;
    promotions: PromotionService;
    signer: PrincipalSigner;
    clock: Clock;
    ids: IdFactory;
  }) {
    assertCondition(
      input.signer.identity.role === "promoter",
      "AUTHORIZATION_DENIED",
      "Deployment authorization requires promoter identity",
    );
    this.#protocolId = input.protocolId;
    this.#deploymentPolicyHash = input.deploymentPolicyHash;
    this.#schemas = input.schemas;
    this.#audit = input.audit;
    this.#components = input.components;
    this.#promotions = input.promotions;
    this.#signer = input.signer;
    this.#clock = input.clock;
    this.#ids = input.ids;
    this.#log = new AppendOnlyLog<JsonValue>(
      path.join(input.root, "evolution"),
      "deployment.decisions",
    );
  }

  public async authorize(input: {
    action: DeploymentDecision["action"];
    expectedBefore: PointerExpectation;
    targetHarnessVersionId?: string;
  }): Promise<DeploymentDecision> {
    const expected = input.expectedBefore;
    let target: PointerTarget;
    let targetQualificationDecisionId: string | null;
    let rollbackTargetHarnessVersionId: string | null;
    let rollbackTargetManifestHash: string | null;
    let rollbackTargetQualificationDecisionId: string | null;
    if (input.action === "initialize" || input.action === "deploy") {
      const targetId = input.targetHarnessVersionId;
      assertCondition(targetId !== undefined, "SCHEMA_INVALID", "Deployment target is missing");
      const manifest = this.#components.getHarness(targetId);
      const qualification = await this.#promotions.approvedDecisionFor(targetId);
      assertCondition(qualification !== null, "AUTHORIZATION_DENIED", "Target is not approved");
      target = {
        generation: expected.generation + 1,
        harnessVersionId: targetId,
        manifestHash: manifest.manifestHash,
      };
      targetQualificationDecisionId = qualification.promotionDecisionId;
      if (input.action === "initialize") {
        assertCondition(
          sha256(expected) === sha256(nullAnchor()),
          "CONFLICT",
          "Initialization requires the null anchor",
        );
        rollbackTargetHarnessVersionId = null;
        rollbackTargetManifestHash = null;
        rollbackTargetQualificationDecisionId = null;
      } else {
        assertCondition(
          expected.generation >= 0 &&
            expected.harnessVersionId !== null &&
            expected.manifestHash !== null &&
            expected.targetQualificationDecisionId !== null,
          "CONFLICT",
          "Deploy requires a current target",
        );
        rollbackTargetHarnessVersionId = expected.harnessVersionId;
        rollbackTargetManifestHash = expected.manifestHash;
        rollbackTargetQualificationDecisionId = expected.targetQualificationDecisionId;
      }
    } else if (input.action === "rollback") {
      assertCondition(
        expected.generation >= 0 &&
          expected.harnessVersionId !== null &&
          expected.manifestHash !== null &&
          expected.targetQualificationDecisionId !== null &&
          expected.rollbackTargetHarnessVersionId !== null &&
          expected.rollbackTargetManifestHash !== null &&
          expected.rollbackTargetQualificationDecisionId !== null,
        "CONFLICT",
        "Rollback target is null",
      );
      target = {
        generation: expected.generation + 1,
        harnessVersionId: expected.rollbackTargetHarnessVersionId,
        manifestHash: expected.rollbackTargetManifestHash,
      };
      targetQualificationDecisionId = expected.rollbackTargetQualificationDecisionId;
      rollbackTargetHarnessVersionId = expected.harnessVersionId;
      rollbackTargetManifestHash = expected.manifestHash;
      rollbackTargetQualificationDecisionId = expected.targetQualificationDecisionId;
    } else {
      assertCondition(
        expected.generation >= 0 && expected.harnessVersionId !== null,
        "CONFLICT",
        "Decommission requires a current target",
      );
      target = {
        generation: expected.generation + 1,
        harnessVersionId: null,
        manifestHash: null,
      };
      targetQualificationDecisionId = null;
      rollbackTargetHarnessVersionId = null;
      rollbackTargetManifestHash = null;
      rollbackTargetQualificationDecisionId = null;
    }
    const core: DecisionCore = {
      schemaVersion: 2,
      deploymentDecisionId: this.#ids.next("deployment-decision"),
      protocolId: this.#protocolId,
      epistemicClass: "control_decision",
      action: input.action,
      channelId: "production",
      expectedBefore: expected,
      target,
      targetQualificationDecisionId,
      rollbackTargetHarnessVersionId,
      rollbackTargetManifestHash,
      rollbackTargetQualificationDecisionId,
      deploymentPolicyHash: this.#deploymentPolicyHash,
      reasonCodes: [
        input.action === "rollback"
          ? "EXPLICIT_ROLLBACK_AUTHORIZED"
          : input.action === "decommission"
            ? "EXPLICIT_DECOMMISSION_AUTHORIZED"
            : "APPROVED_TARGET_AUTHORIZED",
      ],
      decidedBy: this.#signer.identity,
      decidedAt: this.#clock.now().toISOString(),
    };
    const auditLink = await this.#audit.appendSubject({
      subjectType: "DeploymentDecision",
      subjectId: core.deploymentDecisionId,
      subjectHash: sha256(core),
    });
    const body: DecisionSignedBody = { ...core, auditLink };
    const decision: DeploymentDecision = {
      ...body,
      attestation: this.#signer.attest(body as unknown as JsonValue),
    };
    this.#schemas.validate(DEPLOYMENT_DECISION_SCHEMA_ID, decision as unknown as JsonValue);
    await this.#log.append(decision as unknown as JsonValue);
    return decision;
  }
}

export class DeploymentRegistry {
  readonly #root: string;
  readonly #protocolId: string;
  readonly #deploymentPolicyHash: string;
  readonly #schemas: SchemaRegistry;
  readonly #audit: AuditTrail;
  readonly #components: HarnessComponentRegistry;
  readonly #promotions: PromotionService;
  readonly #qualification: HarnessQualificationStore;
  readonly #principals: PrincipalRegistry;
  readonly #signer: PrincipalSigner;
  readonly #clock: Clock;
  readonly #ids: IdFactory;
  readonly #log: AppendOnlyLog<JsonValue>;
  #queue: Promise<void> = Promise.resolve();

  public constructor(input: {
    root: string;
    protocolId: string;
    deploymentPolicyHash: string;
    schemas: SchemaRegistry;
    audit: AuditTrail;
    components: HarnessComponentRegistry;
    promotions: PromotionService;
    qualification: HarnessQualificationStore;
    principals: PrincipalRegistry;
    signer: PrincipalSigner;
    clock: Clock;
    ids: IdFactory;
  }) {
    assertCondition(
      input.signer.identity.role === "operations_owner",
      "AUTHORIZATION_DENIED",
      "Deployment registry requires operations-owner identity",
    );
    this.#root = path.resolve(input.root, "deployment");
    this.#protocolId = input.protocolId;
    this.#deploymentPolicyHash = input.deploymentPolicyHash;
    this.#schemas = input.schemas;
    this.#audit = input.audit;
    this.#components = input.components;
    this.#promotions = input.promotions;
    this.#qualification = input.qualification;
    this.#principals = input.principals;
    this.#signer = input.signer;
    this.#clock = input.clock;
    this.#ids = input.ids;
    this.#log = new AppendOnlyLog<JsonValue>(this.#root, "deployment.production");
  }

  public async current(): Promise<PointerExpectation> {
    let state = nullAnchor();
    for (const record of await this.#recordsAndVerify()) {
      assertCondition(
        sha256(record.expectedBefore) === sha256(state),
        "HASH_MISMATCH",
        "Deployment pointer chain has a stale prior tuple",
      );
      state = {
        generation: record.after.generation,
        harnessVersionId: record.after.harnessVersionId,
        manifestHash: record.after.manifestHash,
        targetQualificationDecisionId: record.targetQualificationDecisionId,
        rollbackTargetHarnessVersionId: record.rollbackTargetHarnessVersionId,
        rollbackTargetManifestHash: record.rollbackTargetManifestHash,
        rollbackTargetQualificationDecisionId:
          record.rollbackTargetQualificationDecisionId,
        pointerRecordHash: sha256(pointerCore(record)),
      };
    }
    return state;
  }

  public apply(decision: DeploymentDecision): Promise<DeploymentPointerRecord> {
    const operation = this.#queue.then(() => this.#applyLocked(decision));
    this.#queue = operation.then(
      () => undefined,
      () => undefined,
    );
    return operation;
  }

  public async recoverStaleLock(): Promise<boolean> {
    const lockPath = path.join(this.#root, "production.lock");
    let value: JsonValue;
    try {
      value = parseStrictJson(await readFile(lockPath, "utf8"));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
      throw error;
    }
    assertCondition(
      typeof value === "object" &&
        value !== null &&
        !Array.isArray(value) &&
        Number.isSafeInteger(value["pid"]),
      "HASH_MISMATCH",
      "Malformed deployment lock",
    );
    const pid = value["pid"] as number;
    try {
      process.kill(pid, 0);
      return false;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ESRCH") return false;
    }
    await unlink(lockPath);
    return true;
  }

  async #applyLocked(decision: DeploymentDecision): Promise<DeploymentPointerRecord> {
    await mkdir(this.#root, { recursive: true, mode: 0o700 });
    const lockPath = path.join(this.#root, "production.lock");
    let lock;
    try {
      lock = await open(
        lockPath,
        constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
        0o600,
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") {
        throw new HarnessError("CONFLICT", "Deployment registry is locked");
      }
      throw error;
    }
    try {
      await lock.writeFile(canonicalBytes({ pid: process.pid, protocolId: this.#protocolId }));
      await lock.sync();
      await this.#verifyDecision(decision);
      const before = await this.current();
      assertCondition(
        sha256(decision.expectedBefore) === sha256(before),
        "CONFLICT",
        "Deployment compare-and-swap expectation is stale",
      );
      this.#assertDecisionSemantics(decision, before);
      await this.#verifyTuple(
        decision.target.harnessVersionId,
        decision.target.manifestHash,
        decision.targetQualificationDecisionId,
      );
      await this.#verifyTuple(
        decision.rollbackTargetHarnessVersionId,
        decision.rollbackTargetManifestHash,
        decision.rollbackTargetQualificationDecisionId,
      );
      const core: PointerCore = {
        schemaVersion: 3,
        recordId: this.#ids.next("deployment-pointer"),
        protocolId: this.#protocolId,
        channelId: "production",
        operation: decision.action,
        expectedBefore: decision.expectedBefore,
        after: decision.target,
        deploymentDecisionId: decision.deploymentDecisionId,
        targetQualificationDecisionId: decision.targetQualificationDecisionId,
        rollbackTargetHarnessVersionId: decision.rollbackTargetHarnessVersionId,
        rollbackTargetManifestHash: decision.rollbackTargetManifestHash,
        rollbackTargetQualificationDecisionId:
          decision.rollbackTargetQualificationDecisionId,
        priorTargetDisposition:
          decision.action === "initialize" ? "none" : "retained_approved",
        appliedBy: this.#signer.identity,
        appliedAt: this.#clock.now().toISOString(),
      };
      const auditLink = await this.#audit.appendSubject({
        subjectType: "DeploymentPointerRecord",
        subjectId: core.recordId,
        subjectHash: sha256(core),
      });
      const body: PointerSignedBody = { ...core, auditLink };
      const record: DeploymentPointerRecord = {
        ...body,
        attestation: this.#signer.attest(body as unknown as JsonValue),
      };
      this.#schemas.validate(DEPLOYMENT_POINTER_SCHEMA_ID, record as unknown as JsonValue);
      await this.#log.append(record as unknown as JsonValue);
      return record;
    } finally {
      await lock.close();
      await unlink(lockPath).catch(() => undefined);
    }
  }

  async #recordsAndVerify(): Promise<DeploymentPointerRecord[]> {
    const records = (await this.#log.readAll()).map((entry) => asPointerRecord(entry.payload));
    for (const record of records) {
      this.#schemas.validate(DEPLOYMENT_POINTER_SCHEMA_ID, record as unknown as JsonValue);
      assertCondition(record.protocolId === this.#protocolId, "PROTOCOL_MISMATCH", "Protocol drift");
      this.#principals.verify(
        record.appliedBy,
        pointerBody(record) as unknown as JsonValue,
        record.attestation,
      );
      await this.#audit.verifyLink(record.auditLink, {
        subjectType: "DeploymentPointerRecord",
        subjectId: record.recordId,
        subjectHash: sha256(pointerCore(record)),
      });
    }
    return records;
  }

  async #verifyDecision(decision: DeploymentDecision): Promise<void> {
    this.#schemas.validate(DEPLOYMENT_DECISION_SCHEMA_ID, decision as unknown as JsonValue);
    assertCondition(
      decision.protocolId === this.#protocolId &&
        decision.deploymentPolicyHash === this.#deploymentPolicyHash,
      "PROTOCOL_MISMATCH",
      "Deployment decision policy pin mismatch",
    );
    this.#principals.verify(
      decision.decidedBy,
      decisionBody(decision) as unknown as JsonValue,
      decision.attestation,
    );
    assertCondition(
      decision.decidedBy.role === "promoter",
      "AUTHORIZATION_DENIED",
      "Decision signer is not promoter",
    );
    await this.#audit.verifyLink(decision.auditLink, {
      subjectType: "DeploymentDecision",
      subjectId: decision.deploymentDecisionId,
      subjectHash: sha256(decisionCore(decision)),
    });
  }

  #assertDecisionSemantics(
    decision: DeploymentDecision,
    before: PointerExpectation,
  ): void {
    assertCondition(
      decision.target.generation === before.generation + 1,
      "HASH_MISMATCH",
      "Deployment generation did not increment exactly once",
    );
    if (decision.action === "initialize") {
      assertCondition(
        sha256(before) === sha256(nullAnchor()) &&
          decision.rollbackTargetHarnessVersionId === null,
        "HASH_MISMATCH",
        "Invalid initialization semantics",
      );
    } else if (decision.action === "deploy") {
      assertCondition(
        decision.rollbackTargetHarnessVersionId === before.harnessVersionId &&
          decision.rollbackTargetManifestHash === before.manifestHash &&
          decision.rollbackTargetQualificationDecisionId ===
            before.targetQualificationDecisionId,
        "HASH_MISMATCH",
        "Deploy did not retain the exact prior target",
      );
    } else if (decision.action === "rollback") {
      assertCondition(
        before.rollbackTargetHarnessVersionId !== null &&
          decision.target.harnessVersionId === before.rollbackTargetHarnessVersionId &&
          decision.target.manifestHash === before.rollbackTargetManifestHash &&
          decision.targetQualificationDecisionId ===
            before.rollbackTargetQualificationDecisionId &&
          decision.rollbackTargetHarnessVersionId === before.harnessVersionId &&
          decision.rollbackTargetManifestHash === before.manifestHash &&
          decision.rollbackTargetQualificationDecisionId ===
            before.targetQualificationDecisionId,
        "HASH_MISMATCH",
        "Rollback is not an exact target swap",
      );
    } else {
      assertCondition(
        decision.target.harnessVersionId === null &&
          decision.target.manifestHash === null &&
          decision.targetQualificationDecisionId === null &&
          decision.rollbackTargetHarnessVersionId === null,
        "HASH_MISMATCH",
        "Decommission did not clear both targets",
      );
    }
  }

  async #verifyTuple(
    harnessVersionId: string | null,
    manifestHash: string | null,
    qualificationDecisionId: string | null,
  ): Promise<void> {
    if (harnessVersionId === null) {
      assertCondition(
        manifestHash === null && qualificationDecisionId === null,
        "HASH_MISMATCH",
        "Partial null deployment tuple",
      );
      return;
    }
    assertCondition(
      manifestHash !== null && qualificationDecisionId !== null,
      "HASH_MISMATCH",
      "Incomplete deployment tuple",
    );
    const manifest = this.#components.getHarness(harnessVersionId);
    const qualification = await this.#promotions.approvedDecisionFor(harnessVersionId);
    assertCondition(
      manifest.manifestHash === manifestHash &&
        qualification !== null &&
        qualification.promotionDecisionId === qualificationDecisionId &&
        (await this.#qualification.state(harnessVersionId)) === "approved",
      "AUTHORIZATION_DENIED",
      "Deployment tuple is not currently approved",
    );
  }
}
