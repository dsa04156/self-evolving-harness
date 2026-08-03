import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, test } from "node:test";
import path from "node:path";

import {
  NUMERIC_FREEZE_ENTRY_ARTIFACT_SPECS,
  NUMERIC_FREEZE_ENTRY_AUTHORITY_STATE,
  NUMERIC_FREEZE_ENTRY_DRAFT_ARTIFACT_IDS,
  NUMERIC_FREEZE_ENTRY_ELIGIBILITY_STATE,
  NUMERIC_FREEZE_ENTRY_GOVERNANCE_ARTIFACT_IDS,
  NUMERIC_FREEZE_ENTRY_IMPLEMENTATION_ARTIFACT_IDS,
  NUMERIC_FREEZE_ENTRY_PERMITTED_DATA_CLASSES,
  NUMERIC_FREEZE_ENTRY_PILOT_PENDING_FIELDS,
  NUMERIC_FREEZE_ENTRY_PROHIBITED_DATA_CLASSES,
  NUMERIC_FREEZE_ENTRY_UNRESOLVED_SENTINELS,
  NUMERIC_FREEZE_ENTRY_ZERO_BUDGET,
  RESEARCH_PROTOCOL_NUMERIC_FREEZE_ENTRY_PATH,
  SchemaRegistry,
  canonicalBytes,
  canonicalize,
  createResearchProtocolNumericFreezeEntry,
  createResearchProtocolNumericFreezeEntryAuditReceipt,
  parseStrictJson,
  sha256,
  sha256Bytes,
  verifyResearchProtocolNumericFreezeEntryAgainstArtifacts,
  verifyResearchProtocolNumericFreezeEntryAuditReceiptIndependent,
  type JsonValue,
  type NumericFreezeEntryArtifactReader,
  type NumericFreezeEntryArtifactReference,
  type ResearchProtocolNumericFreezeEntry,
  type ResearchProtocolNumericFreezeEntryAuditReceipt,
  type UnsignedResearchProtocolNumericFreezeEntry,
} from "../src/index.js";
import { deterministicPrincipal } from "./helpers/deterministic-principal.js";

const SOURCE_COMMIT = "a".repeat(40);
const SOURCE_TREE = "b".repeat(40);

class MemoryArtifactReader implements NumericFreezeEntryArtifactReader {
  readonly #tree: string;
  readonly #artifacts: ReadonlyMap<string, Buffer>;

  public constructor(
    tree: string,
    artifacts: ReadonlyMap<string, Buffer>,
  ) {
    this.#tree = tree;
    this.#artifacts = artifacts;
  }

  public async treeOf(_commit: string): Promise<string> {
    return this.#tree;
  }

  public async read(
    commit: string,
    artifactPath: string,
  ): Promise<Buffer> {
    const value = this.#artifacts.get(`${commit}:${artifactPath}`);
    if (value === undefined) {
      throw new Error(`Missing memory artifact ${commit}:${artifactPath}`);
    }
    return value;
  }
}

interface Fixture {
  readonly schemas: SchemaRegistry;
  readonly record: ResearchProtocolNumericFreezeEntry;
  readonly reader: MemoryArtifactReader;
  readonly artifacts: ReadonlyMap<string, Buffer>;
  readonly entryBytes: Buffer;
  readonly receipt: ResearchProtocolNumericFreezeEntryAuditReceipt;
}

function mutableCopy<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function unsignedOf(
  record: ResearchProtocolNumericFreezeEntry,
): UnsignedResearchProtocolNumericFreezeEntry {
  return {
    selectedObligation: record.selectedObligation,
    obligationState: record.obligationState,
    sourceSnapshot: record.sourceSnapshot,
    artifacts: record.artifacts,
    artifactRoles: record.artifactRoles,
    conformanceBinding: record.conformanceBinding,
    outstandingObligationsBinding:
      record.outstandingObligationsBinding,
    pilotPendingFields: record.pilotPendingFields,
    unresolvedSentinels: record.unresolvedSentinels,
    zeroBudget: record.zeroBudget,
    dataClasses: record.dataClasses,
    authorityState: record.authorityState,
    eligibilityState: record.eligibilityState,
    futureIdentityState: record.futureIdentityState,
    syntheticProviderFixtureExclusion:
      record.syntheticProviderFixtureExclusion,
    lineage: record.lineage,
    architectDecision: record.architectDecision,
    claimBoundary: record.claimBoundary,
    recordedAt: record.recordedAt,
  };
}

function validlyResign(
  base: ResearchProtocolNumericFreezeEntry,
  mutate: (value: any) => void,
  role: "protocol_author" | "operations_owner" = "protocol_author",
): ResearchProtocolNumericFreezeEntry {
  const value = mutableCopy(unsignedOf(base)) as any;
  mutate(value);
  const signer = deterministicPrincipal({
    principalId: `principal.numeric-freeze-resign.${role}`,
    role,
    implementationDigest: `sha256:${"9".repeat(64)}`,
    instanceId: `principal.numeric-freeze-resign.${role}.instance`,
    seedByte: role === "protocol_author" ? 231 : 232,
  });
  const entryId = `nfe-sha256:${sha256Bytes(canonicalBytes({
    hashDomain: "ResearchProtocolNumericFreezeEntry.v1",
    ...value,
  }))}`;
  const core = {
    schemaVersion: 1 as const,
    hashDomain: "ResearchProtocolNumericFreezeEntry.v1" as const,
    entryId,
    recordType: "research_protocol_numeric_freeze_entry" as const,
    ...value,
    recordedBy: signer.identity,
  };
  const body = {
    ...core,
    entryHash: sha256(core as unknown as JsonValue),
    publicPrincipal: signer.exportPublic(),
  };
  return {
    ...body,
    attestation: signer.attest(body as unknown as JsonValue),
  } as ResearchProtocolNumericFreezeEntry;
}

async function fixture(): Promise<Fixture> {
  const schemas = await SchemaRegistry.load(path.resolve("schemas"));
  const bytesByKey = new Map<string, Buffer>();
  const artifacts: NumericFreezeEntryArtifactReference[] = [];
  for (const spec of NUMERIC_FREEZE_ENTRY_ARTIFACT_SPECS) {
    const bytes = await readFile(path.resolve(spec.path));
    bytesByKey.set(`${SOURCE_COMMIT}:${spec.path}`, bytes);
    artifacts.push({
      artifactId: spec.artifactId,
      path: spec.path,
      sourceCommit: SOURCE_COMMIT,
      sha256: `sha256:${sha256Bytes(bytes)}`,
      sizeBytes: bytes.byteLength,
      mediaType: spec.mediaType,
    });
  }
  const conformance = parseStrictJson(
    bytesByKey
      .get(`${SOURCE_COMMIT}:governance/trust-plane/conformance-manifest.json`)!
      .toString("utf8"),
  ) as unknown as { readonly manifestHash: string };
  const obligations = parseStrictJson(
    bytesByKey
      .get(`${SOURCE_COMMIT}:governance/trust-plane/outstanding-obligations.json`)!
      .toString("utf8"),
  ) as unknown as { readonly matrixId: string };
  const synthetic = parseStrictJson(
    bytesByKey
      .get(`${SOURCE_COMMIT}:architect/evidence/gate3/provider-budget-freeze.json`)!
      .toString("utf8"),
  ) as unknown as { readonly budgetFreezeId: string };
  const signer = deterministicPrincipal({
    principalId: "protocol.author.numeric-freeze-entry.test",
    role: "protocol_author",
    implementationDigest: `sha256:${"1".repeat(64)}`,
    instanceId: "protocol.author.numeric-freeze-entry.test.instance",
    seedByte: 229,
  });
  const record = createResearchProtocolNumericFreezeEntry({
    schemas,
    signer,
    value: {
      selectedObligation: "research_protocol_numeric_freeze",
      obligationState: {
        status: "unresolved",
        evidencePresent: false,
      },
      sourceSnapshot: {
        sourceCommit: SOURCE_COMMIT,
        sourceTree: SOURCE_TREE,
        additionalPushPerformed: false,
      },
      artifacts,
      artifactRoles: {
        governanceArtifactIds: [
          ...NUMERIC_FREEZE_ENTRY_GOVERNANCE_ARTIFACT_IDS,
        ],
        draftPolicyAndSchemaArtifactIds: [
          ...NUMERIC_FREEZE_ENTRY_DRAFT_ARTIFACT_IDS,
        ],
        implementationArtifactIds: [
          ...NUMERIC_FREEZE_ENTRY_IMPLEMENTATION_ARTIFACT_IDS,
        ],
      },
      conformanceBinding: {
        artifactId: "conformance_manifest",
        manifestHash: conformance.manifestHash,
      },
      outstandingObligationsBinding: {
        artifactId: "outstanding_obligations",
        matrixId: obligations.matrixId,
      },
      pilotPendingFields: [
        ...NUMERIC_FREEZE_ENTRY_PILOT_PENDING_FIELDS,
      ],
      unresolvedSentinels: [
        ...NUMERIC_FREEZE_ENTRY_UNRESOLVED_SENTINELS,
      ],
      zeroBudget: NUMERIC_FREEZE_ENTRY_ZERO_BUDGET,
      dataClasses: {
        permitted: [
          ...NUMERIC_FREEZE_ENTRY_PERMITTED_DATA_CLASSES,
        ],
        prohibited: [
          ...NUMERIC_FREEZE_ENTRY_PROHIBITED_DATA_CLASSES,
        ],
      },
      authorityState: NUMERIC_FREEZE_ENTRY_AUTHORITY_STATE,
      eligibilityState: NUMERIC_FREEZE_ENTRY_ELIGIBILITY_STATE,
      futureIdentityState: {
        finalProtocolId: null,
        budgetFreezeId: null,
        providerIdentity: null,
        modelIdentity: null,
        serviceTier: null,
        researchBudgetReservation: null,
      },
      syntheticProviderFixtureExclusion: {
        artifactId: "synthetic_provider_fixture",
        forbiddenBudgetFreezeId: synthetic.budgetFreezeId,
        eligibleForEntry: false,
        eligibleForResearchEvidence: false,
        allowedAsDependency: false,
        allowedAsProvenance: false,
        allowedAsValueSource: false,
        allowedAsSupersessionTarget: false,
        forbiddenReferenceForms: [
          "alias",
          "dependency",
          "direct",
          "provenance",
          "value_copy",
          "wrapper",
        ],
      },
      lineage: {
        supersedesEntryIds: [],
        pooledProtocolIds: [],
        inheritedArtifactIds: [],
        provenanceArtifactIds: [],
        wrappedArtifactIds: [],
        copiedValueSourceArtifactIds: [],
      },
      architectDecision: {
        packetArtifactId: "architect_packet",
        rulingArtifactId: "architect_ruling",
        decision: "APPROVE",
      },
      claimBoundary: {
        entryBoundarySpecified: true,
        numericFreezeComplete: false,
        researchProtocolFrozen: false,
        pilotEvidence: false,
        performanceEvidence: false,
        attributionEvidence: false,
        securityClaim: false,
        evolutionClaim: false,
        selfImprovementClaim: false,
      },
      recordedAt: "2026-08-03T00:00:00.000Z",
    },
  });
  const reader = new MemoryArtifactReader(SOURCE_TREE, bytesByKey);
  await verifyResearchProtocolNumericFreezeEntryAgainstArtifacts({
    record,
    schemas,
    reader,
  });
  const entryBytes = Buffer.from(
    `${canonicalize(record as unknown as JsonValue)}\n`,
    "utf8",
  );
  const auditSigner = deterministicPrincipal({
    principalId: "audit.store.numeric-freeze-entry.test",
    role: "audit_store",
    implementationDigest: `sha256:${"2".repeat(64)}`,
    instanceId: "audit.store.numeric-freeze-entry.test.instance",
    seedByte: 230,
  });
  const receipt = createResearchProtocolNumericFreezeEntryAuditReceipt({
    schemas,
    signer: auditSigner,
    entry: record,
    entryBytes,
    value: {
      entryReference: {
        entryId: record.entryId,
        entryHash: record.entryHash,
        path: RESEARCH_PROTOCOL_NUMERIC_FREEZE_ENTRY_PATH,
        sha256: `sha256:${sha256Bytes(entryBytes)}`,
        sizeBytes: entryBytes.byteLength,
      },
      sourceSnapshot: {
        sourceCommit: SOURCE_COMMIT,
        sourceTree: SOURCE_TREE,
      },
      verifierArtifactId: "entry_verifier_source",
      verification: {
        schemaValid: true,
        signatureValid: true,
        sourceBindingsValid: true,
        obligationStillUnresolved: true,
        zeroBudgetValid: true,
        authorityAndEligibilityValid: true,
        pendingSentinelsComplete: true,
        protectedDataReferencesAbsent: true,
        syntheticFixtureExcluded: true,
        finalIdentitiesAbsent: true,
        crossProtocolPoolingAbsent: true,
        authoritiesGranted: 0,
      },
      verifiedAt: "2026-08-03T00:00:01.000Z",
    },
  });
  verifyResearchProtocolNumericFreezeEntryAuditReceiptIndependent({
    receipt,
    entry: record,
    entryBytes,
    schemas,
  });
  return {
    schemas,
    record,
    reader,
    artifacts: bytesByKey,
    entryBytes,
    receipt,
  };
}

async function rejects(
  current: Fixture,
  mutate: (value: any) => void,
  role: "protocol_author" | "operations_owner" = "protocol_author",
): Promise<void> {
  const record = validlyResign(current.record, mutate, role);
  await assert.rejects(
    verifyResearchProtocolNumericFreezeEntryAgainstArtifacts({
      record,
      schemas: current.schemas,
      reader: current.reader,
    }),
  );
}

describe("research protocol numeric-freeze entry", () => {
  test("verifies one zero-authority entry and reference-only audit receipt", async () => {
    const current = await fixture();
    const result =
      await verifyResearchProtocolNumericFreezeEntryAgainstArtifacts({
        record: current.record,
        schemas: current.schemas,
        reader: current.reader,
      });
    assert.deepEqual(
      {
        artifacts: result.artifactCount,
        sentinels: result.pendingSentinelCount,
        obligations: result.unresolvedObligationCount,
        providerAttempts: result.providerModelRequestAttempts,
        authorities: result.authoritiesGranted,
        protocolId: result.finalProtocolId,
        budgetId: result.budgetFreezeId,
      },
      {
        artifacts: 24,
        sentinels: 25,
        obligations: 7,
        providerAttempts: 0,
        authorities: 0,
        protocolId: null,
        budgetId: null,
      },
    );
  });

  test("rejects validly re-signed source, conformance, policy, schema, and obligation drift", async () => {
    const current = await fixture();
    await rejects(current, (value) => {
      value.sourceSnapshot.sourceTree = "c".repeat(40);
    });
    for (const artifactId of [
      "conformance_manifest",
      "evaluation_budget",
      "protocol_manifest_schema",
      "outstanding_obligations",
    ]) {
      await rejects(current, (value) => {
        value.artifacts.find(
          (artifact: any) => artifact.artifactId === artifactId,
        ).sha256 = `sha256:${"d".repeat(64)}`;
      });
    }
  });

  test("rejects nonzero budgets and authority or eligibility escalation after valid re-signing", async () => {
    const current = await fixture();
    await rejects(current, (value) => {
      value.zeroBudget.providerModelRequestAttempts = 1;
    });
    await rejects(current, (value) => {
      value.authorityState.researchEvidenceAuthorized = true;
    });
    await rejects(current, (value) => {
      value.eligibilityState.eligibleForGate = true;
    });
  });

  test("rejects direct, provenance, wrapper, and copied-value reuse of the synthetic fixture", async () => {
    const current = await fixture();
    await rejects(current, (value) => {
      const index = value.artifactRoles.draftPolicyAndSchemaArtifactIds.indexOf(
        "evaluation_budget",
      );
      value.artifactRoles.draftPolicyAndSchemaArtifactIds[index] =
        "synthetic_provider_fixture";
    });
    await rejects(current, (value) => {
      value.lineage.provenanceArtifactIds.push(
        "synthetic_provider_fixture",
      );
    });
    await rejects(current, (value) => {
      value.lineage.wrappedArtifactIds.push(
        "synthetic_provider_fixture",
      );
    });
    await rejects(current, (value) => {
      value.futureIdentityState.researchBudgetReservation = 100;
    });
  });

  test("rejects sentinel laundering, omission, and protected data admission", async () => {
    const current = await fixture();
    await rejects(current, (value) => {
      value.unresolvedSentinels[0].sentinel = "100";
    });
    await rejects(current, (value) => {
      value.unresolvedSentinels.pop();
    });
    await rejects(current, (value) => {
      value.pilotPendingFields = value.pilotPendingFields.filter(
        (field: string) => field !== "statisticalMargins",
      );
    });
    await rejects(current, (value) => {
      value.dataClasses.permitted[0] = "protected.gate_task_body";
    });
  });

  test("rejects premature protocol and budget IDs, partial completion, and cross-protocol pooling", async () => {
    const current = await fixture();
    await rejects(current, (value) => {
      value.futureIdentityState.finalProtocolId =
        `protocol-sha256:${"e".repeat(64)}`;
    });
    await rejects(current, (value) => {
      value.futureIdentityState.budgetFreezeId =
        `bf-sha256:${"f".repeat(64)}`;
    });
    await rejects(current, (value) => {
      value.obligationState.status = "completed";
      value.obligationState.evidencePresent = true;
    });
    await rejects(current, (value) => {
      value.lineage.pooledProtocolIds.push(
        `protocol-sha256:${"7".repeat(64)}`,
      );
    });
  });

  test("rejects a valid signature from a non-protocol-author principal", async () => {
    const current = await fixture();
    await rejects(current, () => undefined, "operations_owner");
  });

  test("rejects audit receipt entry-byte substitution", async () => {
    const current = await fixture();
    const substituted = Buffer.from(current.entryBytes);
    substituted[0] = substituted[0] === 0x7b ? 0x5b : 0x7b;
    assert.throws(() => {
      verifyResearchProtocolNumericFreezeEntryAuditReceiptIndependent({
        receipt: current.receipt,
        entry: current.record,
        entryBytes: substituted,
        schemas: current.schemas,
      });
    });
  });
});
