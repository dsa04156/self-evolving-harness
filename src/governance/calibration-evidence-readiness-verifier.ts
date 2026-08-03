import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

import {
  canonicalize,
  parseStrictJson,
  sha256Bytes,
  type JsonValue,
} from "../core/canonical.js";
import { type SchemaRegistry } from "../contracts/schema-registry.js";
import {
  CALIBRATION_EVIDENCE_DISCLOSURE_MATRIX,
  CALIBRATION_EVIDENCE_GRAPH_CONTRACT,
  CALIBRATION_EVIDENCE_OWNERSHIP_MATRIX,
  CALIBRATION_EVIDENCE_RECORD_SPECS,
  CALIBRATION_EVIDENCE_ZERO_BUDGET,
  buildSyntheticCalibrationCapabilityDescriptor,
  verifyCalibrationEvidenceRoleBoundary,
} from "./calibration-evidence-contracts.js";
import {
  CALIBRATION_EVIDENCE_AUTHORITY_STATE,
  CALIBRATION_EVIDENCE_CONTRACT_INVENTORY,
  CALIBRATION_EVIDENCE_ELIGIBILITY_STATE,
  CALIBRATION_EVIDENCE_FUTURE_IDENTITY_STATE,
  CALIBRATION_EVIDENCE_READINESS_ARTIFACT_SPECS,
  CALIBRATION_EVIDENCE_SYNTHETIC_FIXTURE_CONTRACT,
  calibrationEvidenceContractHashes,
  verifyCalibrationEvidenceContractReadinessSignature,
  verifyCalibrationEvidenceReadinessAuditSignatures,
  type CalibrationEvidenceArtifactReference,
  type CalibrationEvidenceContractReadiness,
  type CalibrationEvidenceReadinessAuditReceipt,
} from "./calibration-evidence-readiness.js";
import {
  verifyCalibrationPlanAssemblyAuditSignatures,
  verifyCalibrationPlanAssemblyReadinessSignature,
  type CalibrationPlanAssemblyAuditReceipt,
  type CalibrationPlanAssemblyReadiness,
} from "./calibration-plan-assembly-readiness.js";

const execFileAsync = promisify(execFile);

const EXPECTED_PRIOR_BINDINGS = {
  assemblyReadinessId: "cpar-sha256:0ae47c5688fd04d6069ba406cd74b1b050bd94713e36d240fab08f4142470b42",
  assemblyReadinessHash: "sha256:09351930673187bda15eba19d9ff829f62f09dddea68c10d606d1ced157b6a0c",
  assemblyReadinessRawSha256: "sha256:813cf2513bfa0f7faf5fdbec99c3c466fad8c0e1563d5437bc3153428907a2b0",
  assemblyAuditReceiptId: "cparar-sha256:a515ba050d4f158fb4d95148e2049b7aa66ab4c4783996664706f6f3897cdcc2",
  assemblyAuditReceiptHash: "sha256:04968d8313a85d841ef8195f9154a88a205bc37a68e7d1b76dafd378756e1c1e",
  assemblyAuditReceiptRawSha256: "sha256:d066dbf27815443c2a62ebfbaac0b06b157482db4e5e98d24085bf637b2f36a4",
  assemblyEvidenceRulingRawSha256: "sha256:094b31e93575c388a48b7a7f2482a0f7320c2dad0b8323e1eda1a09f93a6931c",
  assemblyEvidenceDecision: "APPROVE",
  priorEvidenceReadinessId: "cecr-sha256:426f217d824d416fbfe49a472a8f1a7fe5a397d9914c5dcf2f498ec96e211c16",
  priorEvidenceReadinessHash: "sha256:1ef20a04ec0d5328def4eda2e988497ed3e2f297ab60905011d2adbfaf351595",
  priorEvidenceReadinessRawSha256: "sha256:03c593cec50b2c446f8d69680df608df914b019945747365f1894134ddfb6830",
  priorEvidenceAuditReceiptId: "cecrar-sha256:1cdee884a76bacd0807117eda24185e554a8d1f7fd09b476f8e681933cb6988f",
  priorEvidenceAuditReceiptHash: "sha256:39bb021229f501d62811744a8c061de7e89fdbebaa4c678da283779c5fbfcfcb",
  priorEvidenceAuditReceiptRawSha256: "sha256:5a13e826e20f30152dfa610256cd81d08a97951fa812db781bb37a73e2392933",
  priorEvidenceRulingRawSha256: "sha256:0e73d97bc113da856a2ddbb0a38cf40022cb4de0032dbaa96ae93fafcf36914c",
  priorEvidenceDecision: "REVISE",
} as const;

export interface CalibrationEvidenceReadinessArtifactReader {
  treeOf(commit: string): Promise<string>;
  read(commit: string, artifactPath: string): Promise<Buffer>;
}

export class GitCalibrationEvidenceReadinessArtifactReader
  implements CalibrationEvidenceReadinessArtifactReader
{
  readonly #repositoryRoot: string;

  public constructor(repositoryRoot: string) {
    this.#repositoryRoot = path.resolve(repositoryRoot);
  }

  public async treeOf(commit: string): Promise<string> {
    const { stdout } = await execFileAsync("git", ["rev-parse", "--verify", `${commit}^{tree}`], {
      cwd: this.#repositoryRoot,
      encoding: "utf8",
    });
    return stdout.trim();
  }

  public async read(commit: string, artifactPath: string): Promise<Buffer> {
    ensureSafePath(artifactPath);
    const { stdout } = await execFileAsync("git", ["show", `${commit}:${artifactPath}`], {
      cwd: this.#repositoryRoot,
      encoding: "buffer",
      maxBuffer: 32 * 1024 * 1024,
    });
    return stdout;
  }
}

export interface CalibrationEvidenceReadinessVerificationResult {
  readonly artifactCount: 21;
  readonly contractRecordTypeCount: 13;
  readonly evidenceStageCount: 5;
  readonly syntheticScenarioCount: 3;
  readonly syntheticFixtureRecordCount: 30;
  readonly syntheticExpectedStratumCount: 2;
  readonly unresolvedObligationCount: number;
  readonly actualEvidenceRecords: 0;
  readonly issuedCapabilities: 0;
  readonly consumedCapabilities: 0;
  readonly providerModelRequestAttempts: 0;
  readonly protectedDataAccesses: 0;
  readonly finalIdentitiesAllocated: 0;
  readonly oProposals: 0;
  readonly oActivations: 0;
  readonly authoritiesGranted: 0;
}

function fail(message: string): never {
  throw new Error(`Calibration evidence readiness verification failed: ${message}`);
}

function ensure(condition: unknown, message: string): asserts condition {
  if (!condition) fail(message);
}

function ensureSafePath(value: string): void {
  ensure(
    value.length > 0 && !path.isAbsolute(value) && !value.split(/[\\/]/u).includes("..") && /^[A-Za-z0-9._/-]+$/u.test(value),
    `unsafe artifact path ${value}`,
  );
}

function sameJson(left: unknown, right: unknown): boolean {
  return canonicalize(left) === canonicalize(right);
}

function artifactMap(record: CalibrationEvidenceContractReadiness): Map<string, CalibrationEvidenceArtifactReference> {
  const map = new Map<string, CalibrationEvidenceArtifactReference>();
  for (const artifact of record.artifacts) {
    ensure(!map.has(artifact.artifactId), `duplicate artifact ${artifact.artifactId}`);
    ensureSafePath(artifact.path);
    map.set(artifact.artifactId, artifact);
  }
  return map;
}

function ensureNoSecretMaterial(record: CalibrationEvidenceContractReadiness): void {
  const text = canonicalize(record as unknown as JsonValue);
  for (const pattern of [
    /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/u,
    /(?:^|[^A-Za-z0-9])sk-[A-Za-z0-9_-]{20,}/u,
    /Bearer\s+[A-Za-z0-9._~-]{16,}/u,
    /AKIA[A-Z0-9]{16}/u,
  ]) {
    ensure(!pattern.test(text), "secret-like material appears in readiness record");
  }
}

function unresolvedObligationCount(value: JsonValue): number {
  ensure(typeof value === "object" && value !== null && !Array.isArray(value), "outstanding obligations artifact is not an object");
  const object = value as Record<string, JsonValue>;
  const candidates = [object["obligations"], object["outstandingObligations"], object["items"]];
  const list = candidates.find(Array.isArray);
  ensure(Array.isArray(list), "outstanding obligations list is absent");
  return list.length;
}

function verifyClosedBodyFreeContractSchema(value: JsonValue): void {
  ensure(typeof value === "object" && value !== null && !Array.isArray(value), "evidence contract schema is not an object");
  const schema = value as Record<string, JsonValue>;
  ensure(Array.isArray(schema["oneOf"]) && schema["oneOf"].length === 14, "evidence contract schema union differs");
  const defsValue = schema["$defs"];
  ensure(typeof defsValue === "object" && defsValue !== null && !Array.isArray(defsValue), "evidence contract definitions are absent");
  const defs = defsValue as Record<string, JsonValue>;
  const closedPayloads = [
    "executionPayload",
    "usagePayload",
    "executorIncidentPayload",
    "measurementPayload",
    "evaluatorFailurePayload",
    "evaluatorIncidentPayload",
    "aggregatePayload",
    "rejectedCandidatePayload",
    "withdrawalPayload",
    "scorerFailurePayload",
    "scorerIncidentPayload",
    "verificationPayload",
    "proposalPayload",
    "syntheticCapability",
  ];
  for (const name of closedPayloads) {
    const definition = defs[name];
    ensure(typeof definition === "object" && definition !== null && !Array.isArray(definition), `schema definition ${name} is absent`);
    ensure((definition as Record<string, JsonValue>)["additionalProperties"] === false, `schema definition ${name} is not closed`);
  }
  const forbiddenPropertyNames = new Set([
    "taskBody",
    "verifierLogic",
    "label",
    "answer",
    "path",
    "handle",
    "providerCredential",
    "actualModelIdentity",
    "rawModelOutput",
    "rawOutput",
    "verifierSource",
    "promotionState",
    "deploymentState",
  ]);
  const visit = (candidate: JsonValue): void => {
    if (Array.isArray(candidate)) {
      for (const entry of candidate) visit(entry);
      return;
    }
    if (typeof candidate !== "object" || candidate === null) return;
    const object = candidate as Record<string, JsonValue>;
    const properties = object["properties"];
    if (typeof properties === "object" && properties !== null && !Array.isArray(properties)) {
      for (const key of Object.keys(properties)) {
        ensure(!forbiddenPropertyNames.has(key), `forbidden disclosure property ${key} appears in contract schema`);
      }
    }
    for (const entry of Object.values(object)) visit(entry);
  };
  visit(value);
}

export async function verifyCalibrationEvidenceContractReadinessAgainstArtifacts(input: {
  readonly record: CalibrationEvidenceContractReadiness;
  readonly schemas: SchemaRegistry;
  readonly reader: CalibrationEvidenceReadinessArtifactReader;
}): Promise<CalibrationEvidenceReadinessVerificationResult> {
  verifyCalibrationEvidenceContractReadinessSignature({ record: input.record, schemas: input.schemas });
  const actualTree = await input.reader.treeOf(input.record.sourceSnapshot.sourceCommit);
  ensure(actualTree === input.record.sourceSnapshot.sourceTree, "source tree differs from source commit");
  ensure(!input.record.sourceSnapshot.additionalPushPerformed, "record claims an additional push");

  const artifacts = artifactMap(input.record);
  ensure(artifacts.size === CALIBRATION_EVIDENCE_READINESS_ARTIFACT_SPECS.length, "artifact count differs");
  const artifactBytes = new Map<string, Buffer>();
  for (const [artifactId, artifactPath, mediaType] of CALIBRATION_EVIDENCE_READINESS_ARTIFACT_SPECS) {
    const artifact = artifacts.get(artifactId);
    ensure(artifact !== undefined, `missing artifact ${artifactId}`);
    ensure(artifact.path === artifactPath && artifact.mediaType === mediaType, `artifact ${artifactId} metadata differs`);
    ensure(artifact.sourceCommit === input.record.sourceSnapshot.sourceCommit, `artifact ${artifactId} source commit differs`);
    const bytes = await input.reader.read(artifact.sourceCommit, artifact.path);
    artifactBytes.set(artifactId, bytes);
    ensure(artifact.sha256 === `sha256:${sha256Bytes(bytes)}` && artifact.sizeBytes === bytes.byteLength, `artifact ${artifactId} bytes differ`);
  }

  ensure(sameJson(input.record.priorBindings, EXPECTED_PRIOR_BINDINGS), "prior assembly bindings differ");
  const assemblyBytes = artifactBytes.get("assembly_readiness")!;
  const assembly = parseStrictJson(assemblyBytes.toString("utf8")) as unknown as CalibrationPlanAssemblyReadiness;
  verifyCalibrationPlanAssemblyReadinessSignature({ record: assembly, schemas: input.schemas });
  ensure(assembly.assemblyReadinessId === EXPECTED_PRIOR_BINDINGS.assemblyReadinessId && assembly.assemblyReadinessHash === EXPECTED_PRIOR_BINDINGS.assemblyReadinessHash && `sha256:${sha256Bytes(assemblyBytes)}` === EXPECTED_PRIOR_BINDINGS.assemblyReadinessRawSha256, "bound assembly readiness differs");
  const assemblyReceiptBytes = artifactBytes.get("assembly_readiness_receipt")!;
  const assemblyReceipt = parseStrictJson(assemblyReceiptBytes.toString("utf8")) as unknown as CalibrationPlanAssemblyAuditReceipt;
  verifyCalibrationPlanAssemblyAuditSignatures({ receipt: assemblyReceipt, readiness: assembly, readinessBytes: assemblyBytes, schemas: input.schemas });
  ensure(assemblyReceipt.receiptId === EXPECTED_PRIOR_BINDINGS.assemblyAuditReceiptId && assemblyReceipt.receiptHash === EXPECTED_PRIOR_BINDINGS.assemblyAuditReceiptHash && `sha256:${sha256Bytes(assemblyReceiptBytes)}` === EXPECTED_PRIOR_BINDINGS.assemblyAuditReceiptRawSha256, "bound assembly audit receipt differs");
  const rulingBytes = artifactBytes.get("assembly_evidence_ruling")!;
  ensure(`sha256:${sha256Bytes(rulingBytes)}` === EXPECTED_PRIOR_BINDINGS.assemblyEvidenceRulingRawSha256 && rulingBytes.toString("utf8").startsWith("DECISION: APPROVE\n"), "assembly Architect ruling differs");

  const priorReadinessBytes = artifactBytes.get("prior_evidence_readiness")!;
  const priorReadiness = parseStrictJson(priorReadinessBytes.toString("utf8")) as Record<string, JsonValue>;
  ensure(`sha256:${sha256Bytes(priorReadinessBytes)}` === EXPECTED_PRIOR_BINDINGS.priorEvidenceReadinessRawSha256, "prior evidence readiness bytes differ");
  ensure(priorReadiness["readinessId"] === EXPECTED_PRIOR_BINDINGS.priorEvidenceReadinessId && priorReadiness["readinessHash"] === EXPECTED_PRIOR_BINDINGS.priorEvidenceReadinessHash, "prior evidence readiness identity differs");
  const priorReceiptBytes = artifactBytes.get("prior_evidence_readiness_receipt")!;
  const priorReceipt = parseStrictJson(priorReceiptBytes.toString("utf8")) as Record<string, JsonValue>;
  ensure(`sha256:${sha256Bytes(priorReceiptBytes)}` === EXPECTED_PRIOR_BINDINGS.priorEvidenceAuditReceiptRawSha256, "prior evidence audit bytes differ");
  ensure(priorReceipt["receiptId"] === EXPECTED_PRIOR_BINDINGS.priorEvidenceAuditReceiptId && priorReceipt["receiptHash"] === EXPECTED_PRIOR_BINDINGS.priorEvidenceAuditReceiptHash, "prior evidence audit identity differs");
  const priorRulingBytes = artifactBytes.get("prior_evidence_ruling")!;
  ensure(`sha256:${sha256Bytes(priorRulingBytes)}` === EXPECTED_PRIOR_BINDINGS.priorEvidenceRulingRawSha256 && priorRulingBytes.toString("utf8").startsWith("DECISION: REVISE\n"), "prior evidence Architect ruling differs");

  ensure(CALIBRATION_EVIDENCE_RECORD_SPECS.length === 13, "record spec count differs");
  verifyClosedBodyFreeContractSchema(
    parseStrictJson(artifactBytes.get("evidence_contract_schema")!.toString("utf8")),
  );
  ensure(sameJson(input.record.contractInventory, CALIBRATION_EVIDENCE_CONTRACT_INVENTORY), "contract inventory differs");
  ensure(sameJson(input.record.ownershipMatrix, CALIBRATION_EVIDENCE_OWNERSHIP_MATRIX), "ownership matrix differs");
  ensure(sameJson(input.record.disclosureMatrix, CALIBRATION_EVIDENCE_DISCLOSURE_MATRIX), "disclosure matrix differs");
  ensure(sameJson(input.record.graphContract, CALIBRATION_EVIDENCE_GRAPH_CONTRACT), "graph contract differs");
  ensure(sameJson(input.record.syntheticCapabilityDescriptor, buildSyntheticCalibrationCapabilityDescriptor()), "synthetic capability descriptor differs");
  ensure(sameJson(input.record.syntheticFixtureContract, CALIBRATION_EVIDENCE_SYNTHETIC_FIXTURE_CONTRACT), "synthetic terminal-scenario contract differs");
  input.schemas.validate(
    "https://self-evolving-harness.local/schemas/calibration-evidence-contracts.schema.json",
    input.record.syntheticCapabilityDescriptor as unknown as JsonValue,
  );
  ensure(sameJson(input.record.contractHashes, calibrationEvidenceContractHashes()), "contract semantic hashes differ");
  verifyCalibrationEvidenceRoleBoundary(input.record.roleBoundary);
  const expectedProcesses = [
    [input.record.roleBoundary.calibrationExecutor, "process.calibration-evidence.calibration-executor.v1"],
    [input.record.roleBoundary.calibrationEvaluator, "process.calibration-evidence.calibration-evaluator.v1"],
    [input.record.roleBoundary.calibrationScorer, "process.calibration-evidence.calibration-scorer.v1"],
    [input.record.roleBoundary.independentVerifier, "process.calibration-evidence.independent-verifier.v1"],
    [input.record.roleBoundary.protocolAuthor, "process.calibration-evidence.protocol-author.v1"],
    [input.record.roleBoundary.auditStore, "process.calibration-evidence.audit-store.v1"],
  ] as const;
  for (const [binding, processIdentity] of expectedProcesses) ensure(binding.processIdentity === processIdentity, `${binding.role} process identity differs`);

  ensure(input.record.actualEvidenceRecords.length === 0 && input.record.actualCapabilities.length === 0, "actual evidence or capability is present");
  ensure(sameJson(input.record.researchExecutionBudget, CALIBRATION_EVIDENCE_ZERO_BUDGET), "zero budget differs");
  ensure(sameJson(input.record.authorityState, CALIBRATION_EVIDENCE_AUTHORITY_STATE), "authority state differs");
  ensure(sameJson(input.record.eligibilityState, CALIBRATION_EVIDENCE_ELIGIBILITY_STATE), "eligibility state differs");
  ensure(sameJson(input.record.futureIdentityState, CALIBRATION_EVIDENCE_FUTURE_IDENTITY_STATE), "future identity state differs");
  ensureNoSecretMaterial(input.record);

  const obligations = parseStrictJson(artifactBytes.get("outstanding_obligations")!.toString("utf8"));
  const obligationsCount = unresolvedObligationCount(obligations);
  ensure(obligationsCount === 7, "outstanding obligation count differs");

  return {
    artifactCount: 21,
    contractRecordTypeCount: 13,
    evidenceStageCount: 5,
    syntheticScenarioCount: 3,
    syntheticFixtureRecordCount: 30,
    syntheticExpectedStratumCount: 2,
    unresolvedObligationCount: obligationsCount,
    actualEvidenceRecords: 0,
    issuedCapabilities: 0,
    consumedCapabilities: 0,
    providerModelRequestAttempts: 0,
    protectedDataAccesses: 0,
    finalIdentitiesAllocated: 0,
    oProposals: 0,
    oActivations: 0,
    authoritiesGranted: 0,
  };
}

export function verifyCalibrationEvidenceReadinessAuditReceiptIndependent(input: {
  readonly receipt: CalibrationEvidenceReadinessAuditReceipt;
  readonly readiness: CalibrationEvidenceContractReadiness;
  readonly readinessBytes: Uint8Array;
  readonly schemas: SchemaRegistry;
}): void {
  verifyCalibrationEvidenceContractReadinessSignature({ record: input.readiness, schemas: input.schemas });
  verifyCalibrationEvidenceReadinessAuditSignatures(input);
  ensure(input.receipt.referenceOnly && !input.receipt.grantsAuthority, "audit receipt grants authority");
  ensure(input.receipt.independentVerification.verification.authoritiesGranted === 0, "independent verification grants authority");
}
