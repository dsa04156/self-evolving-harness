import { execFile } from "node:child_process";
import {
  mkdir,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import {
  GitNumericFreezeEntryArtifactReader,
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
  PrincipalSigner,
  RESEARCH_PROTOCOL_NUMERIC_FREEZE_ENTRY_AUDIT_PATH,
  RESEARCH_PROTOCOL_NUMERIC_FREEZE_ENTRY_PATH,
  SchemaRegistry,
  canonicalize,
  createResearchProtocolNumericFreezeEntry,
  createResearchProtocolNumericFreezeEntryAuditReceipt,
  parseStrictJson,
  sha256Bytes,
  sha256Text,
  verifyResearchProtocolNumericFreezeEntryAgainstArtifacts,
  verifyResearchProtocolNumericFreezeEntryAuditReceiptIndependent,
  type JsonValue,
  type NumericFreezeEntryArtifactReference,
  type NumericFreezeEntryMediaType,
} from "../src/index.js";

const execFileAsync = promisify(execFile);

async function gitText(args: readonly string[]): Promise<string> {
  const result = await execFileAsync("git", [...args], {
    cwd: process.cwd(),
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
  return result.stdout;
}

async function gitBytes(args: readonly string[]): Promise<Buffer> {
  const result = await execFileAsync("git", [...args], {
    cwd: process.cwd(),
    encoding: "buffer",
    maxBuffer: 32 * 1024 * 1024,
  });
  return result.stdout;
}

async function exactCommit(ref: string): Promise<string> {
  const result = (
    await gitText(["rev-parse", "--verify", `${ref}^{commit}`])
  ).trim();
  if (!/^[a-f0-9]{40}$/u.test(result)) {
    throw new Error(`Git ref ${ref} did not resolve exactly`);
  }
  return result;
}

async function exactTree(commit: string): Promise<string> {
  const result = (
    await gitText(["rev-parse", "--verify", `${commit}^{tree}`])
  ).trim();
  if (!/^[a-f0-9]{40}$/u.test(result)) {
    throw new Error(`Git commit ${commit} has no exact tree`);
  }
  return result;
}

async function artifact(
  sourceCommit: string,
  spec: {
    readonly artifactId: string;
    readonly path: string;
    readonly mediaType: NumericFreezeEntryMediaType;
  },
): Promise<NumericFreezeEntryArtifactReference> {
  const bytes = await gitBytes([
    "show",
    `${sourceCommit}:${spec.path}`,
  ]);
  return {
    artifactId: spec.artifactId,
    path: spec.path,
    sourceCommit,
    sha256: `sha256:${sha256Bytes(bytes)}`,
    sizeBytes: bytes.byteLength,
    mediaType: spec.mediaType,
  };
}

const status = await gitText(["status", "--porcelain=v1"]);
if (status.length !== 0) {
  throw new Error(
    "Numeric-freeze entry generation requires a clean implementation-source commit",
  );
}

const sourceCommit = await exactCommit("HEAD");
const sourceTree = await exactTree(sourceCommit);
const schemas = await SchemaRegistry.load(path.resolve("schemas"));
const artifacts = await Promise.all(
  NUMERIC_FREEZE_ENTRY_ARTIFACT_SPECS.map((spec) =>
    artifact(sourceCommit, spec),
  ),
);
const artifactsById = new Map(
  artifacts.map((value) => [value.artifactId, value]),
);

const conformance = parseStrictJson(
  (
    await gitBytes([
      "show",
      `${sourceCommit}:governance/trust-plane/conformance-manifest.json`,
    ])
  ).toString("utf8"),
) as unknown as {
  readonly manifestHash: string;
};
const obligations = parseStrictJson(
  (
    await gitBytes([
      "show",
      `${sourceCommit}:governance/trust-plane/outstanding-obligations.json`,
    ])
  ).toString("utf8"),
) as unknown as {
  readonly matrixId: string;
};
const syntheticFixture = parseStrictJson(
  (
    await gitBytes([
      "show",
      `${sourceCommit}:architect/evidence/gate3/provider-budget-freeze.json`,
    ])
  ).toString("utf8"),
) as unknown as {
  readonly budgetFreezeId: string;
};

const createdAt = new Date().toISOString();
const protocolAuthor = PrincipalSigner.generate({
  principalId:
    "protocol.author.numeric-freeze-entry.public-development.2026-08-03",
  role: "protocol_author",
  implementationDigest: sha256Text(
    `git:${sourceCommit}:scripts/create-research-protocol-numeric-freeze-entry.ts`,
  ),
  instanceId:
    "protocol.author.numeric-freeze-entry.public-development.2026-08-03.instance",
  keyId:
    "protocol.author.numeric-freeze-entry.public-development.2026-08-03.ed25519",
});

const entry = createResearchProtocolNumericFreezeEntry({
  schemas,
  signer: protocolAuthor,
  value: {
    selectedObligation: "research_protocol_numeric_freeze",
    obligationState: {
      status: "unresolved",
      evidencePresent: false,
    },
    sourceSnapshot: {
      sourceCommit,
      sourceTree,
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
      forbiddenBudgetFreezeId: syntheticFixture.budgetFreezeId,
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
    recordedAt: createdAt,
  },
});

const independentResult =
  await verifyResearchProtocolNumericFreezeEntryAgainstArtifacts({
    record: entry,
    schemas,
    reader: new GitNumericFreezeEntryArtifactReader(process.cwd()),
  });
if (
  independentResult.authoritiesGranted !== 0 ||
  independentResult.researchEvidenceAuthorized !== false
) {
  throw new Error("Independent entry verification granted authority");
}

const entryBytes = Buffer.from(
  `${canonicalize(entry as unknown as JsonValue)}\n`,
  "utf8",
);
const auditStore = PrincipalSigner.generate({
  principalId:
    "audit.store.numeric-freeze-entry.public-development.2026-08-03",
  role: "audit_store",
  implementationDigest: sha256Text(
    `git:${sourceCommit}:src/governance/research-protocol-numeric-freeze-entry-verifier.ts`,
  ),
  instanceId:
    "audit.store.numeric-freeze-entry.public-development.2026-08-03.instance",
  keyId:
    "audit.store.numeric-freeze-entry.public-development.2026-08-03.ed25519",
});
const receipt = createResearchProtocolNumericFreezeEntryAuditReceipt({
  schemas,
  signer: auditStore,
  entry,
  entryBytes,
  value: {
    entryReference: {
      entryId: entry.entryId,
      entryHash: entry.entryHash,
      path: RESEARCH_PROTOCOL_NUMERIC_FREEZE_ENTRY_PATH,
      sha256: `sha256:${sha256Bytes(entryBytes)}`,
      sizeBytes: entryBytes.byteLength,
    },
    sourceSnapshot: {
      sourceCommit,
      sourceTree,
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
    verifiedAt: new Date().toISOString(),
  },
});
verifyResearchProtocolNumericFreezeEntryAuditReceiptIndependent({
  receipt,
  entry,
  entryBytes,
  schemas,
});

const receiptBytes = Buffer.from(
  `${canonicalize(receipt as unknown as JsonValue)}\n`,
  "utf8",
);
const outputRoot = path.dirname(
  path.resolve(RESEARCH_PROTOCOL_NUMERIC_FREEZE_ENTRY_PATH),
);
await mkdir(outputRoot, { recursive: true });
await writeFile(
  path.resolve(RESEARCH_PROTOCOL_NUMERIC_FREEZE_ENTRY_PATH),
  entryBytes,
  { flag: "wx" },
);
await writeFile(
  path.resolve(RESEARCH_PROTOCOL_NUMERIC_FREEZE_ENTRY_AUDIT_PATH),
  receiptBytes,
  { flag: "wx" },
);

process.stdout.write(
  `${JSON.stringify({
    created: true,
    entryId: entry.entryId,
    entryHash: entry.entryHash,
    entryArtifactSha256: `sha256:${sha256Bytes(entryBytes)}`,
    auditReceiptId: receipt.receiptId,
    auditReceiptHash: receipt.receiptHash,
    sourceCommit,
    sourceTree,
    artifactCount: artifactsById.size,
    pendingSentinelCount:
      NUMERIC_FREEZE_ENTRY_UNRESOLVED_SENTINELS.length,
    authoritiesGranted: 0,
    finalProtocolId: null,
    budgetFreezeId: null,
  })}\n`,
);
