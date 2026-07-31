import { execFile } from "node:child_process";
import {
  createPublicKey,
  verify as verifySignature,
} from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import {
  canonicalBytes,
  canonicalize,
  parseStrictJson,
  sha256,
  sha256Bytes,
  type JsonPrimitive,
  type JsonValue,
} from "../core/canonical.js";
import { SchemaRegistry } from "../contracts/schema-registry.js";
import type {
  TrustPlaneArtifactReference,
  TrustPlaneConformanceManifest,
  TrustPlaneOutstandingObligations,
} from "./trust-plane-conformance.js";

const execFileAsync = promisify(execFile);

const REQUIRED_DOMAINS = [
  "standalone_runtime_gate2r",
  "development_process_separation",
  "publication_historical_exposure",
  "independent_authorship_vault_admission",
  "durable_serialized_vault_state",
  "eight_principal_vault_os_integration",
  "synthetic_one_time_custody_recovery",
] as const;

const REQUIRED_OBLIGATIONS = [
  "real_provider_receipt",
  "real_benchmark_custody",
  "research_protocol_numeric_freeze",
  "b0_b6_research_execution",
  "held_out_confirmatory_attribution",
  "research_candidate_selection_promotion",
  "performance_generalization_security_evolution_results",
] as const;

const EXPECTED_IMPLEMENTED = [
  "status.runtime_kernel",
  "status.component_registry",
  "status.session_lifecycle",
  "status.evidence_chain",
  "status.development_process_separation",
  "status.publication_quarantine",
  "status.independent_authorship_contract",
  "status.durable_vault_journal",
  "status.eight_principal_os_integration",
  "status.synthetic_custody_protocol",
] as const;

const EXPECTED_LOCALLY_TESTED = [
  "status.gate2r_os_boundary",
  "status.development_boundary",
  "status.historical_governance",
  "status.authorship_admission",
  "status.vault_contention_recovery",
  "status.os_principal_denials",
  "status.custody_crash_recovery",
] as const;

const EXPECTED_DEFERRED = [
  "status.real_provider_receipt",
  "status.real_benchmark_custody",
  "status.research_protocol_freeze",
  "status.b0_b6_execution",
  "status.held_out_evaluation",
  "status.research_candidate_selection",
  "status.production_deployment",
] as const;

const EXPECTED_UNCLAIMED = [
  "status.performance",
  "status.generalization",
  "status.security_certification",
  "status.confidentiality",
  "status.containment",
  "status.evolution",
  "status.self_improvement",
] as const;

const EXPECTED_IDENTITY_KEYS = [
  "runtime.component_model\0component_type_registry",
  "governance.public_history\0historical_inventory",
  "governance.public_history\0historical_ledger",
  "authorship.body_free_contract\0implementation_commit",
  "vault.durable_state\0contract_source",
  "local_test.evaluator_vault_os\0protocol",
  "local_test.evaluator_vault_os\0contract",
  "local_test.evaluator_vault_os\0evidence",
  "local_test.synthetic_custody\0protocol",
  "local_test.synthetic_custody\0contract",
  "local_test.synthetic_custody\0evidence",
] as const;

const EXPECTED_PUBLIC_ROOTS = [
  "c041f7405790e9ff85af621b468b547adbfa4987",
  "88e39cdebf1df4db7688fff592363f5f867533ce",
  "a5d82564cece5ecb776a27c86512c3ec56f32787",
  "8b5f14400a7723c821bc54420e55da58dfa7601b",
] as const;

interface ParsedArtifact {
  readonly reference: TrustPlaneArtifactReference;
  readonly bytes: Buffer;
  readonly json: JsonValue | null;
}

interface SignedRecord {
  readonly recordedBy: JsonValue;
  readonly publicPrincipal: {
    readonly identity: JsonValue;
    readonly keyId: string;
    readonly publicKeyPem: string;
  };
  readonly attestation: {
    readonly algorithm: string;
    readonly keyId: string;
    readonly signature: string;
  };
  readonly [key: string]: JsonValue;
}

export interface TrustPlaneAggregateVerification {
  readonly verified: true;
  readonly manifestHash: string;
  readonly sourceCommit: string;
  readonly sourceTree: string;
  readonly domainCount: number;
  readonly artifactCount: number;
  readonly sourceCommitCount: number;
  readonly governanceChainCount: number;
  readonly identityBindingCount: number;
  readonly outstandingObligationCount: number;
  readonly authoritiesGranted: 0;
}

function fail(message: string): never {
  throw new Error(`Trust-plane aggregate verification failed: ${message}`);
}

function ensure(
  condition: unknown,
  message: string,
): asserts condition {
  if (!condition) fail(message);
}

function sorted(values: readonly string[]): readonly string[] {
  return [...values].sort((left, right) =>
    left.localeCompare(right),
  );
}

function sameStrings(
  actual: readonly string[],
  expected: readonly string[],
  label: string,
): void {
  ensure(
    canonicalize(sorted(actual)) ===
      canonicalize(sorted(expected)),
    `${label} differs`,
  );
}

function objectValue(
  value: JsonValue,
  key: string,
): JsonValue {
  ensure(
    value !== null &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      Object.hasOwn(value, key),
    `JSON object has no ${key}`,
  );
  return value[key]!;
}

function jsonPointer(
  value: JsonValue,
  pointer: string,
): JsonValue {
  ensure(pointer.startsWith("/"), `invalid JSON pointer ${pointer}`);
  let current = value;
  for (const token of pointer
    .slice(1)
    .split("/")
    .map((entry) =>
      entry.replace(/~1/gu, "/").replace(/~0/gu, "~"),
    )) {
    if (Array.isArray(current)) {
      ensure(/^(0|[1-9][0-9]*)$/u.test(token), `invalid array token ${token}`);
      const index = Number(token);
      ensure(
        Number.isSafeInteger(index) &&
          current[index] !== undefined,
        `JSON pointer ${pointer} is absent`,
      );
      current = current[index]!;
      continue;
    }
    ensure(
      current !== null &&
        typeof current === "object" &&
        Object.hasOwn(current, token),
      `JSON pointer ${pointer} is absent`,
    );
    current = current[token]!;
  }
  return current;
}

function withoutKeys(
  value: SignedRecord,
  keys: readonly string[],
): JsonValue {
  const excluded = new Set(keys);
  return Object.fromEntries(
    Object.entries(value).filter(
      ([key]) => !excluded.has(key),
    ),
  ) as JsonValue;
}

function verifyEmbeddedSignature(
  record: SignedRecord,
  label: string,
): void {
  ensure(
    record.attestation.algorithm === "Ed25519",
    `${label} uses a non-Ed25519 attestation`,
  );
  ensure(
    record.attestation.keyId ===
      record.publicPrincipal.keyId,
    `${label} key ID mismatch`,
  );
  ensure(
    canonicalize(record.recordedBy) ===
      canonicalize(record.publicPrincipal.identity),
    `${label} signer identity mismatch`,
  );
  const identity = record.recordedBy as {
    readonly role?: unknown;
    readonly identityDigest?: unknown;
  };
  ensure(
    identity.role === "protocol_author",
    `${label} is not signed by a protocol author`,
  );
  const publicKey = createPublicKey(
    record.publicPrincipal.publicKeyPem,
  );
  const der = publicKey.export({
    type: "spki",
    format: "der",
  });
  ensure(
    identity.identityDigest ===
      `sha256:${sha256Bytes(der)}`,
    `${label} public-key identity digest mismatch`,
  );
  const signedBody = withoutKeys(record, ["attestation"]);
  ensure(
    verifySignature(
      null,
      canonicalBytes(signedBody),
      publicKey,
      Buffer.from(
        record.attestation.signature,
        "base64url",
      ),
    ),
    `${label} signature is invalid`,
  );
}

function verifySignedHashRecord(
  record: SignedRecord,
  hashField: "recordHash" | "ledgerHash",
  label: string,
): void {
  const recordedHash = record[hashField];
  ensure(
    typeof recordedHash === "string",
    `${label} has no ${hashField}`,
  );
  const core = withoutKeys(record, [
    hashField,
    "publicPrincipal",
    "attestation",
  ]);
  ensure(
    recordedHash === sha256(core),
    `${label} ${hashField} mismatch`,
  );
  verifyEmbeddedSignature(record, label);
}

async function gitText(
  root: string,
  args: readonly string[],
): Promise<string> {
  const result = await execFileAsync("git", [...args], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 128 * 1024 * 1024,
  });
  return result.stdout;
}

async function gitBytes(
  root: string,
  args: readonly string[],
): Promise<Buffer> {
  const result = await execFileAsync("git", [...args], {
    cwd: root,
    encoding: "buffer",
    maxBuffer: 128 * 1024 * 1024,
  });
  return result.stdout;
}

async function verifyCommit(
  root: string,
  commit: string,
  tree: string,
  sourceCommit: string,
): Promise<void> {
  const type = (
    await gitText(root, ["cat-file", "-t", commit])
  ).trim();
  ensure(type === "commit", `${commit} is not a Git commit`);
  const actualTree = (
    await gitText(root, [
      "rev-parse",
      "--verify",
      `${commit}^{tree}`,
    ])
  ).trim();
  ensure(actualTree === tree, `${commit} tree mismatch`);
  try {
    await gitText(root, [
      "merge-base",
      "--is-ancestor",
      commit,
      sourceCommit,
    ]);
  } catch {
    fail(`${commit} is not an ancestor of ${sourceCommit}`);
  }
}

async function loadArtifact(
  root: string,
  reference: TrustPlaneArtifactReference,
): Promise<ParsedArtifact> {
  ensure(
    !path.isAbsolute(reference.path) &&
      !reference.path.split("/").includes(".."),
    `unsafe artifact path ${reference.path}`,
  );
  const bytes = await gitBytes(root, [
    "show",
    `${reference.sourceCommit}:${reference.path}`,
  ]);
  ensure(
    bytes.byteLength === reference.sizeBytes,
    `${reference.artifactId} size mismatch`,
  );
  ensure(
    `sha256:${sha256Bytes(bytes)}` === reference.sha256,
    `${reference.artifactId} content hash mismatch`,
  );
  let json: JsonValue | null = null;
  if (reference.mediaType === "application/json") {
    json = parseStrictJson(bytes.toString("utf8"));
  }
  return { reference, bytes, json };
}

function asSignedRecord(
  value: JsonValue,
  label: string,
): SignedRecord {
  ensure(
    value !== null &&
      typeof value === "object" &&
      !Array.isArray(value),
    `${label} is not an object`,
  );
  ensure(
    Object.hasOwn(value, "recordedBy") &&
      Object.hasOwn(value, "publicPrincipal") &&
      Object.hasOwn(value, "attestation"),
    `${label} is not a signed record`,
  );
  return value as SignedRecord;
}

function artifactJson(
  artifacts: ReadonlyMap<string, ParsedArtifact>,
  artifactId: string,
): JsonValue {
  const artifact = artifacts.get(artifactId);
  ensure(artifact !== undefined, `missing artifact ${artifactId}`);
  ensure(
    artifact.json !== null,
    `${artifactId} is not JSON`,
  );
  return artifact.json;
}

function artifactText(
  artifacts: ReadonlyMap<string, ParsedArtifact>,
  artifactId: string,
): string {
  const artifact = artifacts.get(artifactId);
  ensure(artifact !== undefined, `missing artifact ${artifactId}`);
  return artifact.bytes.toString("utf8");
}

function verifyGovernance(
  manifest: TrustPlaneConformanceManifest,
  artifacts: ReadonlyMap<string, ParsedArtifact>,
): void {
  sameStrings(
    manifest.governanceChains.map((entry) => entry.chainId),
    [
      "hfb_structural_oracle_remediation",
      "public_exposure_remediation",
    ],
    "governance chains",
  );
  for (const chain of manifest.governanceChains) {
    ensure(chain.appendOnly, `${chain.chainId} is not append-only`);
    chain.records.forEach((record, index) => {
      ensure(
        record.predecessorArtifactId ===
          (index === 0
            ? null
            : chain.records[index - 1]!.artifactId),
        `${chain.chainId} predecessor mismatch`,
      );
      const json = artifactJson(
        artifacts,
        record.artifactId,
      );
      ensure(
        objectValue(json, "recordType") === record.recordType,
        `${record.artifactId} record type mismatch`,
      );
      verifySignedHashRecord(
        asSignedRecord(json, record.artifactId),
        "recordHash",
        record.artifactId,
      );
    });
  }

  const hfbDeviation = artifactJson(
    artifacts,
    "governance.hfb_deviation",
  );
  const hfbClosure = artifactJson(
    artifacts,
    "governance.hfb_closure",
  );
  ensure(
    objectValue(hfbClosure, "deviationId") ===
      objectValue(hfbDeviation, "deviationId") &&
      objectValue(hfbClosure, "deviationRecordHash") ===
        objectValue(hfbDeviation, "recordHash") &&
      jsonPointer(
        hfbClosure,
        "/remediation/originalRecordWasModified",
      ) === false &&
      jsonPointer(
        hfbClosure,
        "/remediation/originalStatusObserved",
      ) === "in_progress",
    "HFB append-only remediation relationship mismatch",
  );

  const publicationDeviation = artifactJson(
    artifacts,
    "governance.publication_deviation",
  );
  const publicationClosure = artifactJson(
    artifacts,
    "governance.publication_closure",
  );
  const supersedingClosure = artifactJson(
    artifacts,
    "governance.publication_superseding_closure",
  );
  ensure(
    objectValue(publicationClosure, "deviationId") ===
      objectValue(publicationDeviation, "deviationId") &&
      objectValue(
        publicationClosure,
        "deviationRecordHash",
      ) === objectValue(publicationDeviation, "recordHash") &&
      jsonPointer(
        publicationClosure,
        "/remediation/originalDeviationWasModified",
      ) === false,
    "Publication remediation relationship mismatch",
  );
  const priorClosureArtifact = artifacts.get(
    "governance.publication_closure",
  );
  ensure(
    priorClosureArtifact !== undefined,
    "prior publication closure is missing",
  );
  ensure(
    objectValue(supersedingClosure, "deviationId") ===
      objectValue(publicationDeviation, "deviationId") &&
      objectValue(
        supersedingClosure,
        "deviationRecordHash",
      ) === objectValue(publicationDeviation, "recordHash") &&
      objectValue(supersedingClosure, "priorClosureId") ===
        objectValue(publicationClosure, "closureId") &&
      objectValue(supersedingClosure, "priorClosureHash") ===
        objectValue(publicationClosure, "recordHash") &&
      objectValue(
        supersedingClosure,
        "priorClosureFileSha256",
      ) ===
        `sha256:${sha256Bytes(priorClosureArtifact.bytes)}` &&
      jsonPointer(
        supersedingClosure,
        "/remediation/priorClosureModified",
      ) === false &&
      jsonPointer(
        supersedingClosure,
        "/remediation/priorClosureWasPremature",
      ) === true,
    "Publication superseding relationship mismatch",
  );

  const inventory = artifactJson(
    artifacts,
    "governance.historical_inventory",
  );
  ensure(
    inventory !== null &&
      typeof inventory === "object" &&
      !Array.isArray(inventory),
    "historical inventory is not an object",
  );
  const inventoryCore = Object.fromEntries(
    Object.entries(inventory).filter(
      ([key]) => key !== "inventoryHash",
    ),
  ) as JsonValue;
  ensure(
    objectValue(inventory, "inventoryHash") ===
      sha256(inventoryCore),
    "Historical inventory hash mismatch",
  );
  const ledger = artifactJson(
    artifacts,
    "governance.historical_ledger",
  );
  verifySignedHashRecord(
    asSignedRecord(ledger, "historical exposure ledger"),
    "ledgerHash",
    "historical exposure ledger",
  );
  const priorLedger = artifactJson(
    artifacts,
    "governance.prior_public_ledger",
  );
  verifySignedHashRecord(
    asSignedRecord(priorLedger, "prior public ledger"),
    "ledgerHash",
    "prior public ledger",
  );
  ensure(
    objectValue(ledger, "historicalInventoryId") ===
      objectValue(inventory, "inventoryId") &&
      objectValue(ledger, "historicalInventoryHash") ===
        objectValue(inventory, "inventoryHash") &&
      objectValue(ledger, "priorLedgerId") ===
        objectValue(priorLedger, "ledgerId") &&
      objectValue(ledger, "priorLedgerHash") ===
        objectValue(priorLedger, "ledgerHash") &&
      objectValue(ledger, "deviationId") ===
        objectValue(publicationDeviation, "deviationId") &&
      objectValue(ledger, "deviationRecordHash") ===
        objectValue(publicationDeviation, "recordHash"),
    "Historical ledger binding mismatch",
  );
  const roots = objectValue(
    inventory,
    "publicationRoots",
  );
  ensure(Array.isArray(roots), "publication roots are not an array");
  sameStrings(
    roots.map((entry) => {
      ensure(
        entry !== null &&
          typeof entry === "object" &&
          !Array.isArray(entry),
        "publication root is malformed",
      );
      const commit = entry["commit"];
      ensure(
        typeof commit === "string",
        "publication root commit is malformed",
      );
      return commit;
    }),
    EXPECTED_PUBLIC_ROOTS,
    "historical publication roots",
  );
  const ledgerRoots = objectValue(
    ledger,
    "publicationRootCommits",
  );
  ensure(
    Array.isArray(ledgerRoots) &&
      ledgerRoots.every(
        (entry): entry is string => typeof entry === "string",
      ),
    "ledger publication roots are malformed",
  );
  sameStrings(
    ledgerRoots,
    EXPECTED_PUBLIC_ROOTS,
    "ledger publication roots",
  );
  const allowed = objectValue(ledger, "allowedUseClasses");
  const prohibited = objectValue(
    ledger,
    "prohibitedUseClasses",
  );
  ensure(
    Array.isArray(allowed) &&
      allowed.every(
        (entry): entry is string => typeof entry === "string",
      ) &&
      Array.isArray(prohibited) &&
      prohibited.every(
        (entry): entry is string => typeof entry === "string",
      ),
    "historical eligibility classes are malformed",
  );
  sameStrings(
    allowed,
    [
      "public_development",
      "governance_audit",
      "development_archive",
    ],
    "allowed public-development uses",
  );
  sameStrings(
    prohibited,
    [
      "held_out",
      "sealed",
      "temporal_holdout",
      "gate",
      "final",
      "confirmatory",
      "research_selection",
      "promotion",
      "research_evidence",
      "claim_table",
    ],
    "prohibited public-development uses",
  );
  const exposedArtifacts = objectValue(ledger, "artifacts");
  ensure(
    Array.isArray(exposedArtifacts) &&
      exposedArtifacts.length > 0,
    "historical exposure ledger has no artifacts",
  );
  for (const entry of exposedArtifacts) {
    ensure(
      entry !== null &&
        typeof entry === "object" &&
        !Array.isArray(entry),
      "historical exposure artifact is malformed",
    );
    const eligibility = entry["eligibility"];
    ensure(
      eligibility !== null &&
        typeof eligibility === "object" &&
        !Array.isArray(eligibility) &&
        eligibility["publicDevelopment"] === true &&
        eligibility["authorizedForPromotion"] === false &&
        eligibility["authorizedForResearchEvidence"] === false &&
        eligibility["confirmatory"] === false &&
        eligibility["eligibleForFinal"] === false &&
        eligibility["eligibleForGate"] === false &&
        eligibility["eligibleForHeldOut"] === false &&
        eligibility["eligibleForSealed"] === false &&
        eligibility["eligibleForTemporalHoldout"] === false,
      "historical artifact regained forbidden eligibility",
    );
  }
}

function verifyAuthorities(
  manifest: TrustPlaneConformanceManifest,
): void {
  ensure(
    Object.values(manifest.authorityState).every(
      (value) => value === false,
    ),
    "a trust-plane authority is true",
  );
  ensure(
    manifest.eligibilityState.publicDevelopment === true &&
      Object.entries(manifest.eligibilityState)
        .filter(([key]) => key !== "publicDevelopment")
        .every(([, value]) => value === false),
    "local conformance regained research eligibility",
  );
  sameStrings(
    manifest.statusDistinction.implementedControlIds,
    EXPECTED_IMPLEMENTED,
    "implemented controls",
  );
  sameStrings(
    manifest.statusDistinction.locallyTestedControlIds,
    EXPECTED_LOCALLY_TESTED,
    "locally tested controls",
  );
  sameStrings(
    manifest.statusDistinction.deferredControlIds,
    EXPECTED_DEFERRED,
    "deferred controls",
  );
  sameStrings(
    manifest.statusDistinction.unclaimedPropertyIds,
    EXPECTED_UNCLAIMED,
    "unclaimed properties",
  );
  const all = [
    ...manifest.statusDistinction.implementedControlIds,
    ...manifest.statusDistinction.locallyTestedControlIds,
    ...manifest.statusDistinction.deferredControlIds,
    ...manifest.statusDistinction.unclaimedPropertyIds,
  ];
  ensure(
    all.length === new Set(all).size,
    "status categories overlap",
  );
  for (const domain of manifest.evidenceDomains) {
    ensure(
      domain.controlDisposition.implementedControlIds.length > 0 &&
        domain.controlDisposition.locallyTestedControlIds.length > 0 &&
        domain.controlDisposition.deferredControlIds.length > 0 &&
        domain.controlDisposition.unclaimedPropertyIds.length > 0,
      `${domain.domainId} does not distinguish all four statuses`,
    );
  }
}

function verifyManifestSignature(
  manifest: TrustPlaneConformanceManifest,
): void {
  const record = manifest as unknown as SignedRecord;
  const core = withoutKeys(record, [
    "manifestHash",
    "publicPrincipal",
    "attestation",
  ]);
  ensure(
    manifest.manifestHash === sha256(core),
    "manifest hash mismatch",
  );
  verifyEmbeddedSignature(record, "conformance manifest");
}

function verifyObligations(
  manifest: TrustPlaneConformanceManifest,
  artifact: ParsedArtifact,
  schemas: SchemaRegistry,
): void {
  ensure(
    artifact.json !== null,
    "outstanding obligations are not JSON",
  );
  schemas.validate(
    "https://self-evolving-harness.local/schemas/trust-plane-outstanding-obligations.schema.json",
    artifact.json,
  );
  const obligations =
    artifact.json as unknown as TrustPlaneOutstandingObligations;
  sameStrings(
    obligations.obligations.map(
      (entry) => entry.obligationId,
    ),
    REQUIRED_OBLIGATIONS,
    "outstanding obligations",
  );
  ensure(
    obligations.obligations.every(
      (entry) =>
        entry.status === "unresolved" &&
        entry.evidencePresent === false,
    ),
    "an outstanding obligation was implicitly resolved",
  );
  ensure(
    canonicalize(obligations.authorityState) ===
      canonicalize(manifest.authorityState),
    "obligation and manifest authority states differ",
  );
}

export async function verifyTrustPlaneAggregate(input: {
  readonly repositoryRoot: string;
  readonly manifestPath: string;
}): Promise<TrustPlaneAggregateVerification> {
  const root = path.resolve(input.repositoryRoot);
  const manifestFile = path.resolve(
    root,
    input.manifestPath,
  );
  ensure(
    manifestFile.startsWith(`${root}${path.sep}`),
    "manifest path escapes repository",
  );
  const schemas = await SchemaRegistry.load(
    path.resolve(root, "schemas"),
  );
  const manifestJson = parseStrictJson(
    await readFile(manifestFile, "utf8"),
  );
  schemas.validate(
    "https://self-evolving-harness.local/schemas/trust-plane-conformance-manifest.schema.json",
    manifestJson,
  );
  const manifest =
    manifestJson as unknown as TrustPlaneConformanceManifest;
  verifyManifestSignature(manifest);
  verifyAuthorities(manifest);
  ensure(
    manifest.identityNamespacePolicy ===
      "scope_qualified_no_cross_domain_equivalence",
    "identity namespace policy changed",
  );
  sameStrings(
    manifest.evidenceDomains.map((entry) => entry.domainId),
    REQUIRED_DOMAINS,
    "evidence domains",
  );

  const sourceType = (
    await gitText(root, [
      "cat-file",
      "-t",
      manifest.sourceSnapshot.sourceCommit,
    ])
  ).trim();
  ensure(sourceType === "commit", "source snapshot is not a commit");
  const sourceTree = (
    await gitText(root, [
      "rev-parse",
      "--verify",
      `${manifest.sourceSnapshot.sourceCommit}^{tree}`,
    ])
  ).trim();
  ensure(
    sourceTree === manifest.sourceSnapshot.sourceTree,
    "source snapshot tree mismatch",
  );
  const remoteCommit = (
    await gitText(root, [
      "rev-parse",
      "--verify",
      manifest.sourceSnapshot.remoteTrackingRef,
    ])
  ).trim();
  ensure(
    remoteCommit === manifest.sourceSnapshot.remoteCommit,
    "remote-tracking publication boundary changed",
  );
  ensure(
    manifest.sourceSnapshot.additionalPushPerformed === false,
    "manifest reports an additional push",
  );

  const sourceKeys = new Set<string>();
  const artifacts = new Map<string, ParsedArtifact>();
  const allowedArtifactCommits = new Set<string>([
    manifest.sourceSnapshot.sourceCommit,
  ]);
  for (const domain of manifest.evidenceDomains) {
    for (const source of domain.sourceCommits) {
      const key = `${source.role}:${source.commit}`;
      ensure(
        !sourceKeys.has(`${domain.domainId}:${key}`),
        `${domain.domainId} repeats source ${key}`,
      );
      sourceKeys.add(`${domain.domainId}:${key}`);
      allowedArtifactCommits.add(source.commit);
      await verifyCommit(
        root,
        source.commit,
        source.tree,
        manifest.sourceSnapshot.sourceCommit,
      );
    }
    for (const reference of domain.artifacts) {
      ensure(
        allowedArtifactCommits.has(reference.sourceCommit),
        `${reference.artifactId} uses an unreferenced source commit`,
      );
      ensure(
        !artifacts.has(reference.artifactId),
        `duplicate artifact ${reference.artifactId}`,
      );
      artifacts.set(
        reference.artifactId,
        await loadArtifact(root, reference),
      );
    }
  }
  ensure(
    !artifacts.has(
      manifest.outstandingObligations.artifactId,
    ),
    "outstanding-obligations artifact ID collides",
  );
  ensure(
    manifest.outstandingObligations.sourceCommit ===
      manifest.sourceSnapshot.sourceCommit,
    "outstanding obligations are not pinned to the source snapshot",
  );
  const obligationsArtifact = await loadArtifact(
    root,
    manifest.outstandingObligations,
  );
  artifacts.set(
    manifest.outstandingObligations.artifactId,
    obligationsArtifact,
  );

  const identityValues = new Map<string, string>();
  for (const domain of manifest.evidenceDomains) {
    const domainArtifacts = new Set(
      domain.artifacts.map((entry) => entry.artifactId),
    );
    ensure(
      domainArtifacts.has(domain.ruling.artifactId),
      `${domain.domainId} ruling artifact is absent`,
    );
    const rulingText = artifactText(
      artifacts,
      domain.ruling.artifactId,
    );
    const lines = new Set(
      rulingText.replace(/\r\n?/gu, "\n").split("\n"),
    );
    ensure(
      rulingText.startsWith(
        `DECISION: ${domain.ruling.decision}\n`,
      ),
      `${domain.domainId} ruling decision mismatch`,
    );
    for (const anchor of [
      ...domain.ruling.acceptanceAnchors,
      domain.ruling.claimBoundaryAnchor,
      domain.ruling.authorizedNextScopeAnchor,
    ]) {
      ensure(
        lines.has(anchor),
        `${domain.domainId} ruling anchor ${anchor} is absent`,
      );
    }
    ensure(
      domainArtifacts.has(
        domain.claimBoundaryReference.artifactId,
      ),
      `${domain.domainId} claim-boundary artifact is absent`,
    );
    const claimArtifact = artifacts.get(
      domain.claimBoundaryReference.artifactId,
    );
    ensure(
      claimArtifact !== undefined,
      `${domain.domainId} claim-boundary artifact is missing`,
    );
    if (
      domain.claimBoundaryReference.locator.startsWith("/")
    ) {
      ensure(
        claimArtifact.json !== null,
        `${domain.domainId} JSON claim boundary is not JSON`,
      );
      jsonPointer(
        claimArtifact.json,
        domain.claimBoundaryReference.locator,
      );
    } else {
      ensure(
        new Set(
          claimArtifact.bytes
            .toString("utf8")
            .replace(/\r\n?/gu, "\n")
            .split("\n"),
        ).has(domain.claimBoundaryReference.locator),
        `${domain.domainId} claim-boundary locator is absent`,
      );
    }
    for (const assertion of domain.evidenceAssertions) {
      ensure(
        domainArtifacts.has(assertion.artifactId),
        `${domain.domainId} assertion artifact is absent`,
      );
      const actual = jsonPointer(
        artifactJson(artifacts, assertion.artifactId),
        assertion.jsonPointer,
      );
      ensure(
        canonicalize(actual) ===
          canonicalize(
            assertion.equals as JsonPrimitive,
          ),
        `${domain.domainId} assertion ${assertion.artifactId}${assertion.jsonPointer} differs`,
      );
    }
    for (const contractId of domain.contractArtifactIds) {
      ensure(
        domainArtifacts.has(contractId),
        `${domain.domainId} contract ${contractId} is absent`,
      );
    }
    for (const binding of domain.identityBindings) {
      ensure(
        domainArtifacts.has(binding.artifactId),
        `${domain.domainId} identity artifact is absent`,
      );
      const actual = jsonPointer(
        artifactJson(artifacts, binding.artifactId),
        binding.jsonPointer,
      );
      ensure(
        actual === binding.value,
        `${binding.scope}/${binding.logicalName} source value differs`,
      );
      const key = `${binding.scope}\0${binding.logicalName}`;
      const prior = identityValues.get(key);
      ensure(
        prior === undefined || prior === binding.value,
        `contradictory identity ${binding.scope}/${binding.logicalName}`,
      );
      identityValues.set(key, binding.value);
    }
  }
  sameStrings(
    [...identityValues.keys()],
    EXPECTED_IDENTITY_KEYS,
    "identity bindings",
  );
  ensure(
    identityValues.get(
      "local_test.evaluator_vault_os\0protocol",
    ) !==
      identityValues.get(
        "local_test.synthetic_custody\0protocol",
      ),
    "distinct local protocol scopes collapsed to one identity",
  );
  ensure(
    identityValues.get(
      "local_test.evaluator_vault_os\0contract",
    ) !==
      identityValues.get(
        "local_test.synthetic_custody\0contract",
      ),
    "distinct local contract scopes collapsed to one identity",
  );

  verifyGovernance(manifest, artifacts);
  verifyObligations(
    manifest,
    obligationsArtifact,
    schemas,
  );

  return {
    verified: true,
    manifestHash: manifest.manifestHash,
    sourceCommit: manifest.sourceSnapshot.sourceCommit,
    sourceTree: manifest.sourceSnapshot.sourceTree,
    domainCount: manifest.evidenceDomains.length,
    artifactCount: artifacts.size,
    sourceCommitCount: sourceKeys.size,
    governanceChainCount: manifest.governanceChains.length,
    identityBindingCount: identityValues.size,
    outstandingObligationCount:
      REQUIRED_OBLIGATIONS.length,
    authoritiesGranted: 0,
  };
}
