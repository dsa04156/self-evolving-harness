import { execFile } from "node:child_process";
import {
  mkdir,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import {
  PrincipalSigner,
  SchemaRegistry,
  canonicalize,
  createTrustPlaneConformanceManifest,
  parseStrictJson,
  sha256Bytes,
  sha256Text,
  verifyTrustPlaneOutstandingObligations,
  type JsonValue,
  type TrustPlaneArtifactReference,
  type TrustPlaneControlLineage,
  type TrustPlaneEvidenceDomain,
  type TrustPlaneGitSource,
  type TrustPlaneOutstandingObligations,
} from "../src/index.js";

const execFileAsync = promisify(execFile);
const OUTPUT_PATH =
  "governance/trust-plane/conformance-manifest.json";
const OBLIGATIONS_PATH =
  "governance/trust-plane/outstanding-obligations.json";

const commits = {
  gate2rRuntime:
    "14e373ee4cf245da8c221be9574aa7528d3202e8",
  gate2rEvidence:
    "00a2b5f7082a75681ba6f1393482859f9736e69a",
  gate2rDecision:
    "80211d986a2de3e2f214d54e732a067551a39c01",
  developmentBoundary:
    "88e39cdebf1df4db7688fff592363f5f867533ce",
  developmentEvidence:
    "a5d82564cece5ecb776a27c86512c3ec56f32787",
  developmentDecision:
    "8b5f14400a7723c821bc54420e55da58dfa7601b",
  historicalGovernance:
    "39b69be04185317f56a47183a2f78b9afde5ef6c",
  historicalDecision:
    "622dddf1808e19445055a1d4b28a8e76290a0e1d",
  authorshipVault:
    "af70fd154dd2355891de0a475ce4d593a473b9b7",
  durableVault:
    "ed498251a2382e06a147152604ec52346029c6ed",
  durableDecision:
    "43c8a1dee11dc3d655d68a662a91a3271e6277e2",
  osVault:
    "864d211484f802ac0d82fe9d3c21382e0ad48e80",
  osVaultDecision:
    "3af82e3c276b8a499a3ff1fd357fc791140df9a2",
  custodyInitial:
    "b30c8ae60e41e4c2d3853f8d13fdc1b93f993adf",
  custodyRecovery:
    "e7df5d229760c75bd2bd44ca1679889db152c0d4",
  custodyFinal:
    "4e0125bc5ccbe6e3e340d05166d0718c0bc0ce99",
  custodyDecision:
    "ad9cfc2f6004b7c4d9dc35cd2474ff9294420356",
  integratedConformanceSource:
    "181fe51bde92384a96953ccdeab432d726bfbc49",
} as const;

async function gitText(args: readonly string[]): Promise<string> {
  const result = await execFileAsync("git", [...args], {
    cwd: process.cwd(),
    encoding: "utf8",
    maxBuffer: 128 * 1024 * 1024,
  });
  return result.stdout;
}

async function gitBytes(args: readonly string[]): Promise<Buffer> {
  const result = await execFileAsync("git", [...args], {
    cwd: process.cwd(),
    encoding: "buffer",
    maxBuffer: 128 * 1024 * 1024,
  });
  return result.stdout;
}

async function exactCommit(ref: string): Promise<string> {
  const value = (
    await gitText(["rev-parse", "--verify", `${ref}^{commit}`])
  ).trim();
  if (!/^[a-f0-9]{40}$/u.test(value)) {
    throw new Error(`Git ref ${ref} did not resolve exactly`);
  }
  return value;
}

async function treeOf(commit: string): Promise<string> {
  const value = (
    await gitText(["rev-parse", "--verify", `${commit}^{tree}`])
  ).trim();
  if (!/^[a-f0-9]{40}$/u.test(value)) {
    throw new Error(`Commit ${commit} has no exact tree`);
  }
  return value;
}

async function source(
  role: TrustPlaneGitSource["role"],
  commit: string,
): Promise<TrustPlaneGitSource> {
  return {
    role,
    commit: await exactCommit(commit),
    tree: await treeOf(commit),
  };
}

function mediaType(
  filePath: string,
): TrustPlaneArtifactReference["mediaType"] {
  if (filePath.endsWith(".json")) return "application/json";
  if (filePath.endsWith(".ts")) {
    return "text/typescript; charset=utf-8";
  }
  return "text/markdown; charset=utf-8";
}

async function artifact(
  artifactId: string,
  filePath: string,
  sourceCommit: string,
): Promise<TrustPlaneArtifactReference> {
  if (
    path.isAbsolute(filePath) ||
    filePath.split("/").includes("..")
  ) {
    throw new Error(`Unsafe conformance artifact path ${filePath}`);
  }
  const bytes = await gitBytes([
    "show",
    `${sourceCommit}:${filePath}`,
  ]);
  return {
    artifactId,
    path: filePath,
    sourceCommit,
    sha256: `sha256:${sha256Bytes(bytes)}`,
    sizeBytes: bytes.byteLength,
    mediaType: mediaType(filePath),
  };
}

async function currentArtifact(
  artifactId: string,
  filePath: string,
  sourceCommit: string,
): Promise<TrustPlaneArtifactReference> {
  return artifact(artifactId, filePath, sourceCommit);
}

async function runtimeDomain(
  sourceCommit: string,
): Promise<TrustPlaneEvidenceDomain> {
  const artifacts = await Promise.all([
    currentArtifact(
      "gate2r.packet_manifest",
      "architect/PACKET_02R_MANIFEST.json",
      sourceCommit,
    ),
    currentArtifact(
      "gate2r.os_evidence",
      "architect/evidence/gate2r/os-principal-evidence.json",
      sourceCommit,
    ),
    currentArtifact(
      "gate2r.ruling",
      ".codex/gpt-pro-architect/responses/response-2r.md",
      sourceCommit,
    ),
    artifact(
      "gate2r.component_registry",
      "configs/component-type-registry.json",
      commits.gate2rRuntime,
    ),
    artifact(
      "gate2r.protocol_schema",
      "schemas/protocol-manifest.schema.json",
      commits.gate2rRuntime,
    ),
  ]);
  return {
    domainId: "standalone_runtime_gate2r",
    sourceCommits: await Promise.all([
      source("primary", commits.gate2rRuntime),
      source("evidence", commits.gate2rEvidence),
      source("decision", commits.gate2rDecision),
    ]),
    artifacts,
    evidenceAssertions: [
      {
        artifactId: "gate2r.packet_manifest",
        jsonPointer: "/status",
        equals: "reviewed_approve",
      },
      {
        artifactId: "gate2r.packet_manifest",
        jsonPointer: "/review/decision",
        equals: "APPROVE",
      },
      {
        artifactId: "gate2r.packet_manifest",
        jsonPointer: "/externalActions/paidProviderCall",
        equals: false,
      },
      {
        artifactId: "gate2r.packet_manifest",
        jsonPointer: "/externalActions/benchmarkExecution",
        equals: false,
      },
      {
        artifactId: "gate2r.os_evidence",
        jsonPointer: "/isolationClass",
        equals: "os_enforced_subordinate_uids",
      },
      {
        artifactId: "gate2r.os_evidence",
        jsonPointer: "/wrongUidRejected",
        equals: true,
      },
      {
        artifactId: "gate2r.os_evidence",
        jsonPointer: "/wrongServerUidRejected",
        equals: true,
      },
    ],
    ruling: {
      artifactId: "gate2r.ruling",
      decision: "APPROVE",
      acceptanceAnchors: [
        "CORRECTNESS:",
        "REPRODUCIBILITY:",
        "SECURITY:",
      ],
      claimBoundaryAnchor: "CLAIM DISCIPLINE:",
      authorizedNextScopeAnchor: "AUTHORIZED NEXT SCOPE:",
    },
    claimBoundaryReference: {
      artifactId: "gate2r.ruling",
      locator: "CLAIM DISCIPLINE:",
    },
    contractArtifactIds: [
      "gate2r.component_registry",
      "gate2r.protocol_schema",
    ],
    controlDisposition: {
      implementedControlIds: [
        "runtime.standalone_kernel",
        "runtime.component_identity",
        "runtime.session_and_evaluation_transactions",
      ],
      locallyTestedControlIds: [
        "runtime.gate2r_os_principal_boundary",
        "runtime.cancellation_and_snapshot_recovery",
      ],
      deferredControlIds: [
        "provider.real_call_receipt",
        "research.matched_budget_execution",
      ],
      unclaimedPropertyIds: [
        "claim.provider_reproducibility",
        "claim.production_security",
      ],
    },
    identityBindings: [
      {
        scope: "runtime.component_model",
        logicalName: "component_type_registry",
        identityKind: "component_registry",
        value:
          "ctr-sha256:93d1ce4068c4b12a2a35a51d673fbd64b6b1dfba6d024b9ae8b937010852403c",
        artifactId: "gate2r.component_registry",
        jsonPointer: "/typeRegistryId",
      },
    ],
    canonicalControlBindings: [],
  };
}

async function developmentBoundaryDomain(
  sourceCommit: string,
): Promise<TrustPlaneEvidenceDomain> {
  const artifacts = await Promise.all([
    currentArtifact(
      "development.packet_manifest",
      "architect/PACKET_03RRRR_MANIFEST.json",
      sourceCommit,
    ),
    currentArtifact(
      "development.os_evidence",
      "architect/evidence/development-process-boundary/os-boundary.json",
      sourceCommit,
    ),
    currentArtifact(
      "development.ruling",
      ".codex/gpt-pro-architect/responses/response-3rrrr.md",
      sourceCommit,
    ),
    artifact(
      "development.prediction_seal_source",
      "src/governance/development-prediction-seal.ts",
      commits.developmentBoundary,
    ),
    artifact(
      "development.worker_source",
      "scripts/development-boundary-worker.ts",
      commits.developmentBoundary,
    ),
    artifact(
      "development.evidence_schema",
      "schemas/development-process-boundary-evidence.schema.json",
      commits.developmentBoundary,
    ),
  ]);
  return {
    domainId: "development_process_separation",
    sourceCommits: await Promise.all([
      source("primary", commits.developmentBoundary),
      source("evidence", commits.developmentEvidence),
      source("decision", commits.developmentDecision),
    ]),
    artifacts,
    evidenceAssertions: [
      {
        artifactId: "development.packet_manifest",
        jsonPointer: "/status",
        equals: "reviewed_revise",
      },
      {
        artifactId: "development.packet_manifest",
        jsonPointer: "/review/decision",
        equals: "REVISE",
      },
      {
        artifactId: "development.os_evidence",
        jsonPointer: "/providerUsed",
        equals: false,
      },
      {
        artifactId: "development.os_evidence",
        jsonPointer: "/promotionAuthorized",
        equals: false,
      },
      {
        artifactId: "development.os_evidence",
        jsonPointer: "/researchEvidenceAuthorized",
        equals: false,
      },
      {
        artifactId: "development.os_evidence",
        jsonPointer: "/finalAudit/promotionAuthorized",
        equals: false,
      },
    ],
    ruling: {
      artifactId: "development.ruling",
      decision: "REVISE",
      acceptanceAnchors: [
        "PROCESS_BOUNDARY:",
        "PREDICTION_SEAL_AND_SCORER_RELEASE:",
        "RUNTIME_AND_EVALUATION:",
        "EVIDENCE_RECONSTRUCTION:",
      ],
      claimBoundaryAnchor: "CLAIM_DISCIPLINE:",
      authorizedNextScopeAnchor: "AUTHORIZED_NEXT_SCOPE:",
    },
    claimBoundaryReference: {
      artifactId: "development.ruling",
      locator: "CLAIM_DISCIPLINE:",
    },
    contractArtifactIds: [
      "development.prediction_seal_source",
      "development.evidence_schema",
    ],
    controlDisposition: {
      implementedControlIds: [
        "development.prediction_commit_before_score",
        "development.distinct_process_roles",
        "development.recursive_non_promotability",
      ],
      locallyTestedControlIds: [
        "development.synthetic_runtime_process_boundary",
        "development.independent_evidence_reconstruction",
      ],
      deferredControlIds: [
        "research.attribution_evaluation",
        "research.candidate_selection",
      ],
      unclaimedPropertyIds: [
        "claim.attribution_performance",
        "claim.self_evolution",
      ],
    },
    identityBindings: [],
    canonicalControlBindings: [],
  };
}

async function publicationDomain(
  sourceCommit: string,
): Promise<TrustPlaneEvidenceDomain> {
  const artifacts = await Promise.all([
    currentArtifact(
      "publication.packet_manifest",
      "architect/PACKET_03RRRRRR_MANIFEST.json",
      sourceCommit,
    ),
    currentArtifact(
      "publication.ruling",
      ".codex/gpt-pro-architect/responses/response-3rrrrrr.md",
      sourceCommit,
    ),
    currentArtifact(
      "governance.hfb_deviation",
      "governance/deviations/hfb-structural-oracle-2026-07-31.json",
      sourceCommit,
    ),
    currentArtifact(
      "governance.hfb_closure",
      "governance/remediation-closures/hfb-structural-oracle-2026-07-31.json",
      sourceCommit,
    ),
    currentArtifact(
      "governance.publication_deviation",
      "governance/publication-deviations/github-publication-2026-07-31.json",
      sourceCommit,
    ),
    currentArtifact(
      "governance.publication_closure",
      "governance/publication-remediation-closures/github-publication-2026-07-31.json",
      sourceCommit,
    ),
    currentArtifact(
      "governance.publication_superseding_closure",
      "governance/publication-remediation-closures/github-publication-superseding-2026-07-31.json",
      sourceCommit,
    ),
    currentArtifact(
      "governance.prior_public_ledger",
      "governance/public-exposure/ledger-a5d8256.json",
      sourceCommit,
    ),
    currentArtifact(
      "governance.historical_inventory",
      "governance/public-exposure/historical-inventory-through-8b5f144.json",
      sourceCommit,
    ),
    currentArtifact(
      "governance.historical_ledger",
      "governance/public-exposure/historical-ledger-through-8b5f144.json",
      sourceCommit,
    ),
    artifact(
      "governance.historical_verifier_source",
      "scripts/verify-historical-publication-governance.ts",
      commits.historicalGovernance,
    ),
    artifact(
      "governance.historical_ledger_schema",
      "schemas/historical-public-exposure-ledger.schema.json",
      commits.historicalGovernance,
    ),
  ]);
  return {
    domainId: "publication_historical_exposure",
    sourceCommits: await Promise.all([
      source("supporting", commits.developmentDecision),
      source("primary", commits.historicalGovernance),
      source("decision", commits.historicalDecision),
    ]),
    artifacts,
    evidenceAssertions: [
      {
        artifactId: "publication.packet_manifest",
        jsonPointer: "/status",
        equals: "reviewed_approve",
      },
      {
        artifactId: "publication.packet_manifest",
        jsonPointer: "/review/decision",
        equals: "APPROVE",
      },
      {
        artifactId: "governance.publication_superseding_closure",
        jsonPointer:
          "/claimBoundary/researchEvidenceAuthorized",
        equals: false,
      },
      {
        artifactId: "governance.publication_superseding_closure",
        jsonPointer: "/claimBoundary/promotionAuthorized",
        equals: false,
      },
      {
        artifactId: "governance.publication_superseding_closure",
        jsonPointer: "/claimBoundary/heldOutEligibilityRestored",
        equals: false,
      },
      {
        artifactId: "governance.historical_inventory",
        jsonPointer: "/secretScan/actualSecretMatches",
        equals: 0,
      },
      {
        artifactId: "governance.historical_inventory",
        jsonPointer: "/counts/publicationRoots",
        equals: 4,
      },
    ],
    ruling: {
      artifactId: "publication.ruling",
      decision: "APPROVE",
      acceptanceAnchors: [
        "HISTORICAL_UNION:",
        "EXPOSURE_LEDGER:",
        "ANTI_LAUNDERING:",
        "SUPERSEDING_CLOSURE:",
      ],
      claimBoundaryAnchor: "CLAIM_DISCIPLINE:",
      authorizedNextScopeAnchor: "AUTHORIZED_NEXT_SCOPE:",
    },
    claimBoundaryReference: {
      artifactId:
        "governance.publication_superseding_closure",
      locator: "/claimBoundary",
    },
    contractArtifactIds: [
      "governance.historical_ledger_schema",
      "governance.publication_superseding_closure",
    ],
    controlDisposition: {
      implementedControlIds: [
        "governance.complete_public_git_union",
        "governance.permanent_public_development_taint",
        "governance.append_only_superseding_closure",
      ],
      locallyTestedControlIds: [
        "governance.historical_anti_laundering",
        "governance.independent_union_reconstruction",
      ],
      deferredControlIds: [
        "research.clean_unpublished_corpus",
      ],
      unclaimedPropertyIds: [
        "claim.secrecy_restored",
        "claim.research_eligibility_restored",
      ],
    },
    identityBindings: [
      {
        scope: "governance.public_history",
        logicalName: "historical_inventory",
        identityKind: "evidence",
        value:
          "sha256:2de86e4033a8a60fcfe0be3f28dbf8938697fbeca941876419f8d0837fe2a0a3",
        artifactId: "governance.historical_inventory",
        jsonPointer: "/inventoryHash",
      },
      {
        scope: "governance.public_history",
        logicalName: "historical_ledger",
        identityKind: "evidence",
        value:
          "sha256:52d22b10543d23fa0f7d268de029514c7ab8e62a3ab39277ade4d0c37da1e035",
        artifactId: "governance.historical_ledger",
        jsonPointer: "/ledgerHash",
      },
    ],
    canonicalControlBindings: [],
  };
}

async function authorshipDomain(
  sourceCommit: string,
): Promise<TrustPlaneEvidenceDomain> {
  const artifacts = await Promise.all([
    currentArtifact(
      "authorship.packet_manifest",
      "architect/PACKET_03RRRRRRR_MANIFEST.json",
      sourceCommit,
    ),
    currentArtifact(
      "authorship.ruling",
      ".codex/gpt-pro-architect/responses/response-3rrrrrrr.md",
      sourceCommit,
    ),
    artifact(
      "authorship.transition_source",
      "src/trust/independent-authorship.ts",
      commits.authorshipVault,
    ),
    artifact(
      "authorship.vault_contract_source",
      "src/trust/evaluator-vault-contract.ts",
      commits.authorshipVault,
    ),
    artifact(
      "authorship.vault_contract_schema",
      "schemas/evaluator-vault-contract.schema.json",
      commits.authorshipVault,
    ),
  ]);
  return {
    domainId: "independent_authorship_vault_admission",
    sourceCommits: await Promise.all([
      source("primary", commits.authorshipVault),
      source("decision", commits.durableVault),
    ]),
    artifacts,
    evidenceAssertions: [
      {
        artifactId: "authorship.packet_manifest",
        jsonPointer: "/status",
        equals: "reviewed_revise",
      },
      {
        artifactId: "authorship.packet_manifest",
        jsonPointer: "/review/decision",
        equals: "REVISE",
      },
      {
        artifactId: "authorship.packet_manifest",
        jsonPointer: "/externalActions/providerCall",
        equals: false,
      },
      {
        artifactId: "authorship.packet_manifest",
        jsonPointer:
          "/claimBoundary/authorizedForResearchEvidence",
        equals: false,
      },
    ],
    ruling: {
      artifactId: "authorship.ruling",
      decision: "REVISE",
      acceptanceAnchors: [
        "PRINCIPAL_AND_KEY_SEPARATION:",
        "INDEPENDENT_AUTHORSHIP:",
        "CONTAMINATION_BOUNDARY:",
        "VAULT_ADMISSION:",
      ],
      claimBoundaryAnchor: "CLAIM_DISCIPLINE:",
      authorizedNextScopeAnchor: "AUTHORIZED_NEXT_SCOPE:",
    },
    claimBoundaryReference: {
      artifactId: "authorship.packet_manifest",
      locator: "/claimBoundary",
    },
    contractArtifactIds: [
      "authorship.transition_source",
      "authorship.vault_contract_source",
      "authorship.vault_contract_schema",
    ],
    controlDisposition: {
      implementedControlIds: [
        "authorship.assignment_commitment_chain",
        "vault.commitment_only_admission",
        "vault.role_bound_capabilities",
      ],
      locallyTestedControlIds: [
        "authorship.synthetic_admission_attacks",
        "vault.body_free_contract_validation",
      ],
      deferredControlIds: [
        "vault.real_benchmark_body",
      ],
      unclaimedPropertyIds: [
        "claim.independent_operational_authorship",
        "claim.real_body_confidentiality",
      ],
    },
    identityBindings: [
      {
        scope: "authorship.body_free_contract",
        logicalName: "implementation_commit",
        identityKind: "evidence",
        value: commits.authorshipVault,
        artifactId: "authorship.packet_manifest",
        jsonPointer: "/implementationCommit",
      },
    ],
    canonicalControlBindings: [
      {
        controlId: "control.reviewer_blinding",
        evidenceRole: "historical",
      },
    ],
  };
}

async function durableVaultDomain(
  sourceCommit: string,
): Promise<TrustPlaneEvidenceDomain> {
  const artifacts = await Promise.all([
    currentArtifact(
      "durable.packet_manifest",
      "architect/PACKET_03RRRRRRRR_MANIFEST.json",
      sourceCommit,
    ),
    currentArtifact(
      "durable.ruling",
      ".codex/gpt-pro-architect/responses/response-3rrrrrrrr.md",
      sourceCommit,
    ),
    artifact(
      "durable.vault_source",
      "src/trust/evaluator-vault.ts",
      commits.durableVault,
    ),
    artifact(
      "durable.lease_source",
      "src/trust/vault-writer-lease.ts",
      commits.durableVault,
    ),
    artifact(
      "durable.cas_log_source",
      "src/storage/cas-append-only-log.ts",
      commits.durableVault,
    ),
    artifact(
      "durable.transition_schema",
      "schemas/vault-state-transition.schema.json",
      commits.durableVault,
    ),
  ]);
  return {
    domainId: "durable_serialized_vault_state",
    sourceCommits: await Promise.all([
      source("primary", commits.durableVault),
      source("decision", commits.durableDecision),
    ]),
    artifacts,
    evidenceAssertions: [
      {
        artifactId: "durable.packet_manifest",
        jsonPointer: "/status",
        equals: "reviewed_approve",
      },
      {
        artifactId: "durable.packet_manifest",
        jsonPointer: "/review/decision",
        equals: "APPROVE",
      },
      {
        artifactId: "durable.packet_manifest",
        jsonPointer: "/externalActions/providerCall",
        equals: false,
      },
      {
        artifactId: "durable.packet_manifest",
        jsonPointer: "/externalActions/promotion",
        equals: false,
      },
      {
        artifactId: "durable.packet_manifest",
        jsonPointer:
          "/claimBoundary/authorizedForResearchEvidence",
        equals: false,
      },
    ],
    ruling: {
      artifactId: "durable.ruling",
      decision: "APPROVE",
      acceptanceAnchors: [
        "PRINCIPAL_AND_KEY_SEPARATION:",
        "CAPABILITY_AND_STATE_MACHINE:",
        "ACCESS_LEDGER_AND_REPLAY:",
      ],
      claimBoundaryAnchor: "CLAIM_DISCIPLINE:",
      authorizedNextScopeAnchor: "AUTHORIZED_NEXT_SCOPE:",
    },
    claimBoundaryReference: {
      artifactId: "durable.packet_manifest",
      locator: "/claimBoundary",
    },
    contractArtifactIds: [
      "durable.vault_source",
      "durable.lease_source",
      "durable.transition_schema",
    ],
    controlDisposition: {
      implementedControlIds: [
        "vault.single_authoritative_cas_journal",
        "vault.monotonic_writer_fence",
        "vault.commit_before_release",
      ],
      locallyTestedControlIds: [
        "vault.cross_process_contention",
        "vault.crash_restart_reconstruction",
      ],
      deferredControlIds: [
        "vault.distributed_consistency",
      ],
      unclaimedPropertyIds: [
        "claim.distributed_exactly_once",
        "claim.hostile_host_resistance",
      ],
    },
    identityBindings: [
      {
        scope: "vault.durable_state",
        logicalName: "contract_source",
        identityKind: "contract",
        value:
          "a316b0ac7e78f4768ce3b07a51a51cd144d2ce15cdb8ca1c31a479b9b05a1296",
        artifactId: "durable.packet_manifest",
        jsonPointer: "/implementation/contractSha256",
      },
    ],
    canonicalControlBindings: [],
  };
}

async function osVaultDomain(
  sourceCommit: string,
): Promise<TrustPlaneEvidenceDomain> {
  const artifacts = await Promise.all([
    artifact(
      "os_vault.packet",
      "architect/PACKET_03RRRRRRRRR_OS_PRINCIPAL_VAULT_BOUNDARY.md",
      commits.osVaultDecision,
    ),
    artifact(
      "os_vault.ruling",
      ".codex/gpt-pro-architect/responses/response-3rrrrrrrrr.md",
      commits.osVaultDecision,
    ),
    artifact(
      "os_vault.evidence",
      "architect/evidence/evaluator-vault-os-boundary/evidence.json",
      commits.osVault,
    ),
    artifact(
      "os_vault.worker_source",
      "scripts/evaluator-vault-os-worker.ts",
      commits.osVault,
    ),
    artifact(
      "os_vault.reviewer_projection_correction_source",
      "src/trust/independent-authorship.ts",
      commits.osVault,
    ),
    artifact(
      "os_vault.reviewer_projection_baseline_source",
      "src/trust/independent-authorship.ts",
      commits.integratedConformanceSource,
    ),
    artifact(
      "os_vault.worker_baseline_source",
      "scripts/evaluator-vault-os-worker.ts",
      commits.integratedConformanceSource,
    ),
    currentArtifact(
      "os_vault.reviewer_projection_current_source",
      "src/trust/independent-authorship.ts",
      sourceCommit,
    ),
    currentArtifact(
      "os_vault.worker_current_source",
      "scripts/evaluator-vault-os-worker.ts",
      sourceCommit,
    ),
    artifact(
      "os_vault.evidence_schema",
      "schemas/body-free-evaluator-vault-os-boundary-evidence.schema.json",
      commits.osVault,
    ),
  ]);
  return {
    domainId: "eight_principal_vault_os_integration",
    sourceCommits: await Promise.all([
      source("primary", commits.osVault),
      source("decision", commits.osVaultDecision),
      source(
        "supporting",
        commits.integratedConformanceSource,
      ),
    ]),
    artifacts,
    evidenceAssertions: [
      {
        artifactId: "os_vault.evidence",
        jsonPointer: "/recordType",
        equals: "body_free_evaluator_vault_os_boundary_evidence",
      },
      {
        artifactId: "os_vault.evidence",
        jsonPointer: "/isolationClass",
        equals: "os_enforced_subordinate_uids",
      },
      {
        artifactId: "os_vault.evidence",
        jsonPointer: "/providerUsed",
        equals: false,
      },
      {
        artifactId: "os_vault.evidence",
        jsonPointer: "/promotionAuthorized",
        equals: false,
      },
      {
        artifactId: "os_vault.evidence",
        jsonPointer: "/researchEvidenceAuthorized",
        equals: false,
      },
      {
        artifactId: "os_vault.evidence",
        jsonPointer: "/reviewerBoundary/authorIdentityPresent",
        equals: false,
      },
      {
        artifactId: "os_vault.evidence",
        jsonPointer: "/reviewerBoundary/rawTaskHandlePresent",
        equals: false,
      },
      {
        artifactId: "os_vault.evidence",
        jsonPointer: "/reviewerBoundary/privateKeyPresent",
        equals: false,
      },
    ],
    ruling: {
      artifactId: "os_vault.ruling",
      decision: "APPROVE",
      acceptanceAnchors: [
        "PRINCIPAL_AND_KEY_SEPARATION:",
        "BLINDED_AUTHORSHIP:",
        "AUTHENTICATED_TRANSPORT:",
        "VAULT_CONTENTION_AND_RECOVERY:",
      ],
      claimBoundaryAnchor: "CLAIM_DISCIPLINE:",
      authorizedNextScopeAnchor: "AUTHORIZED_NEXT_SCOPE:",
    },
    claimBoundaryReference: {
      artifactId: "os_vault.ruling",
      locator: "CLAIM_DISCIPLINE:",
    },
    contractArtifactIds: [
      "os_vault.worker_source",
      "os_vault.reviewer_projection_correction_source",
      "os_vault.evidence_schema",
    ],
    controlDisposition: {
      implementedControlIds: [
        "os_vault.eight_distinct_principals",
        "os_vault.role_owned_keys_and_mounts",
        "os_vault.authenticated_peer_transport",
        "os_vault.blinded_reviewer_projection",
      ],
      locallyTestedControlIds: [
        "os_vault.os_denial_matrix",
        "os_vault.sigkill_recovery",
        "os_vault.reviewer_projection_boundary",
      ],
      deferredControlIds: [
        "os_vault.production_deployment",
      ],
      unclaimedPropertyIds: [
        "claim.production_containment",
        "claim.security_certification",
      ],
    },
    identityBindings: [
      {
        scope: "local_test.evaluator_vault_os",
        logicalName: "protocol",
        identityKind: "protocol",
        value:
          "protocol-sha256:9999999999999999999999999999999999999999999999999999999999999999",
        artifactId: "os_vault.evidence",
        jsonPointer: "/finalAudit/protocolId",
      },
      {
        scope: "local_test.evaluator_vault_os",
        logicalName: "contract",
        identityKind: "contract",
        value:
          "sha256:acf95c9c3fee721f18be1a65d261647f265fc92123eb81868b63b2e830206171",
        artifactId: "os_vault.evidence",
        jsonPointer: "/finalAudit/contractHash",
      },
      {
        scope: "local_test.evaluator_vault_os",
        logicalName: "evidence",
        identityKind: "evidence",
        value:
          "sha256:727d4c0ed60d217e1d0781f0af4a74183f65319949156f149051722c7289baea",
        artifactId: "os_vault.evidence",
        jsonPointer: "/evidenceHash",
      },
    ],
    canonicalControlBindings: [
      {
        controlId: "control.reviewer_blinding",
        evidenceRole: "current",
      },
    ],
  };
}

async function custodyDomain(
  sourceCommit: string,
): Promise<TrustPlaneEvidenceDomain> {
  const artifacts = await Promise.all([
    currentArtifact(
      "custody.packet",
      "architect/PACKET_03RRRRRRRRRRRR_SYNTHETIC_CUSTODY_DENIAL_RECOVERY.md",
      sourceCommit,
    ),
    currentArtifact(
      "custody.ruling",
      ".codex/gpt-pro-architect/responses/response-3rrrrrrrrrrrr.md",
      sourceCommit,
    ),
    currentArtifact(
      "custody.evidence",
      "architect/evidence/synthetic-custody-os-boundary/evidence.json",
      sourceCommit,
    ),
    artifact(
      "custody.core_source",
      "src/trust/synthetic-custody.ts",
      commits.custodyFinal,
    ),
    artifact(
      "custody.worker_source",
      "scripts/synthetic-custody-os-worker.ts",
      commits.custodyFinal,
    ),
    artifact(
      "custody.transition_schema",
      "schemas/synthetic-custody-transition.schema.json",
      commits.custodyFinal,
    ),
    artifact(
      "custody.evidence_schema",
      "schemas/synthetic-custody-os-boundary-evidence.schema.json",
      commits.custodyFinal,
    ),
  ]);
  return {
    domainId: "synthetic_one_time_custody_recovery",
    sourceCommits: await Promise.all([
      source("supporting", commits.custodyInitial),
      source("supporting", commits.custodyRecovery),
      source("primary", commits.custodyFinal),
      source("decision", commits.custodyDecision),
    ]),
    artifacts,
    evidenceAssertions: [
      {
        artifactId: "custody.evidence",
        jsonPointer: "/recordType",
        equals: "synthetic_custody_os_boundary_evidence",
      },
      {
        artifactId: "custody.evidence",
        jsonPointer: "/providerUsed",
        equals: false,
      },
      {
        artifactId: "custody.evidence",
        jsonPointer: "/promotionAuthorized",
        equals: false,
      },
      {
        artifactId: "custody.evidence",
        jsonPointer: "/researchEvidenceAuthorized",
        equals: false,
      },
      {
        artifactId: "custody.evidence",
        jsonPointer: "/repositoryPushPerformed",
        equals: false,
      },
    ],
    ruling: {
      artifactId: "custody.ruling",
      decision: "APPROVE",
      acceptanceAnchors: [
        "AUTHORITATIVE_DENIAL_HISTORY:",
        "DENIAL_TO_CLEANUP_RECOVERY:",
        "EVIDENCE_AND_AUDIT:",
      ],
      claimBoundaryAnchor: "CLAIM_DISCIPLINE:",
      authorizedNextScopeAnchor: "AUTHORIZED_NEXT_SCOPE:",
    },
    claimBoundaryReference: {
      artifactId: "custody.ruling",
      locator: "CLAIM_DISCIPLINE:",
    },
    contractArtifactIds: [
      "custody.core_source",
      "custody.transition_schema",
      "custody.evidence_schema",
    ],
    controlDisposition: {
      implementedControlIds: [
        "custody.one_time_at_most_once_release",
        "custody.authoritative_denial_history",
        "custody.two_phase_cleanup_recovery",
      ],
      locallyTestedControlIds: [
        "custody.live_cryptographic_substitution_attacks",
        "custody.seven_sigkill_boundaries",
        "custody.nested_evidence_verification",
      ],
      deferredControlIds: [
        "custody.real_benchmark_body",
        "custody.physical_media_sanitization",
      ],
      unclaimedPropertyIds: [
        "claim.real_body_confidentiality",
        "claim.hostile_host_resistance",
      ],
    },
    identityBindings: [
      {
        scope: "local_test.synthetic_custody",
        logicalName: "protocol",
        identityKind: "protocol",
        value:
          "protocol-sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
        artifactId: "custody.evidence",
        jsonPointer: "/contract/protocolId",
      },
      {
        scope: "local_test.synthetic_custody",
        logicalName: "contract",
        identityKind: "contract",
        value:
          "sha256:30d69725ada771aa82a9aed443a2fab3db82d220487807412346a23d0791b9a3",
        artifactId: "custody.evidence",
        jsonPointer: "/contract/contractHash",
      },
      {
        scope: "local_test.synthetic_custody",
        logicalName: "evidence",
        identityKind: "evidence",
        value:
          "sha256:40f656c2df99f68b18b49dfc5bd9f39a5aee154a24038dfe94b7ab4cf0e4f4cd",
        artifactId: "custody.evidence",
        jsonPointer: "/evidenceHash",
      },
    ],
    canonicalControlBindings: [],
  };
}

const status = await gitText(["status", "--porcelain=v1"]);
if (status.length !== 0) {
  throw new Error(
    "Trust-plane conformance signing requires a clean Git worktree",
  );
}
const sourceCommit = await exactCommit("HEAD");
const sourceTree = await treeOf(sourceCommit);
const remoteCommit = await exactCommit(
  "refs/remotes/origin/main",
);
if (remoteCommit !== commits.developmentDecision) {
  throw new Error(
    "The recorded remote-tracking publication boundary changed",
  );
}

const schemas = await SchemaRegistry.load(path.resolve("schemas"));
const obligationsArtifact = await currentArtifact(
  "trust_plane.outstanding_obligations",
  OBLIGATIONS_PATH,
  sourceCommit,
);
const obligations = parseStrictJson(
  (
    await gitBytes([
      "show",
      `${sourceCommit}:${OBLIGATIONS_PATH}`,
    ])
  ).toString("utf8"),
) as unknown as TrustPlaneOutstandingObligations;
verifyTrustPlaneOutstandingObligations({
  record: obligations,
  schemas,
});

const evidenceDomains = await Promise.all([
  runtimeDomain(sourceCommit),
  developmentBoundaryDomain(sourceCommit),
  publicationDomain(sourceCommit),
  authorshipDomain(sourceCommit),
  durableVaultDomain(sourceCommit),
  osVaultDomain(sourceCommit),
  custodyDomain(sourceCommit),
]);

const controlLineages: readonly TrustPlaneControlLineage[] = [
  {
    lineageVersion: 1,
    controlId: "control.reviewer_blinding",
    domainIds: [
      "independent_authorship_vault_admission",
      "eight_principal_vault_os_integration",
    ],
    stages: [
      {
        stageId: "reviewer_blinding.introduced",
        sequence: 1,
        eventType: "implementation_introduced",
        disposition: "historical",
        artifactIds: ["authorship.transition_source"],
        predecessorStageId: null,
      },
      {
        stageId: "reviewer_blinding.defect_discovered",
        sequence: 2,
        eventType: "defect_discovered",
        disposition: "historical",
        artifactIds: ["os_vault.packet"],
        predecessorStageId: "reviewer_blinding.introduced",
      },
      {
        stageId: "reviewer_blinding.superseded",
        sequence: 3,
        eventType: "implementation_superseded",
        disposition: "superseded",
        artifactIds: ["authorship.transition_source"],
        predecessorStageId:
          "reviewer_blinding.defect_discovered",
      },
      {
        stageId: "reviewer_blinding.correcting",
        sequence: 4,
        eventType: "correcting_implementation",
        disposition: "historical",
        artifactIds: [
          "os_vault.reviewer_projection_correction_source",
          "os_vault.worker_source",
        ],
        predecessorStageId: "reviewer_blinding.superseded",
      },
      {
        stageId: "reviewer_blinding.approved",
        sequence: 5,
        eventType: "approving_ruling",
        disposition: "historical",
        artifactIds: ["os_vault.ruling"],
        predecessorStageId: "reviewer_blinding.correcting",
      },
      {
        stageId: "reviewer_blinding.current",
        sequence: 6,
        eventType: "current_implementation",
        disposition: "current",
        artifactIds: [
          "os_vault.reviewer_projection_baseline_source",
          "os_vault.worker_baseline_source",
          "os_vault.reviewer_projection_current_source",
          "os_vault.worker_current_source",
        ],
        predecessorStageId: "reviewer_blinding.approved",
      },
    ],
    currentStageId: "reviewer_blinding.current",
    statusBindings: {
      implementedControlId:
        "status.independent_authorship_contract",
      locallyTestedControlId: "status.authorship_admission",
      derivedFromStageId: "reviewer_blinding.current",
    },
    behaviorProof: {
      defectDiscoveryArtifactId: "os_vault.packet",
      correctionSourceArtifactId:
        "os_vault.reviewer_projection_correction_source",
      correctionWorkerArtifactId: "os_vault.worker_source",
      approvingRulingArtifactId: "os_vault.ruling",
      baselineCurrentSourceArtifactId:
        "os_vault.reviewer_projection_baseline_source",
      baselineCurrentWorkerArtifactId:
        "os_vault.worker_baseline_source",
      snapshotCurrentSourceArtifactId:
        "os_vault.reviewer_projection_current_source",
      snapshotCurrentWorkerArtifactId:
        "os_vault.worker_current_source",
      evidenceArtifactId: "os_vault.evidence",
      authorIdentityPresentPointer:
        "/reviewerBoundary/authorIdentityPresent",
      rawTaskHandlePresentPointer:
        "/reviewerBoundary/rawTaskHandlePresent",
      privateKeyPresentPointer:
        "/reviewerBoundary/privateKeyPresent",
      inputFilesPointer: "/reviewerBoundary/inputFiles",
      expectedInputFiles: [
        "config.json",
        "own-public.json",
        "review.json",
        "reviewer-projection.json",
      ],
      requiredProjectionSourceMarkers: [
        "export interface BlindedReviewerContractProjection",
        "export function createBlindedReviewerContractProjection",
        "export function verifyBlindedReviewerContractProjection",
      ],
      requiredWorkerSourceMarkers: [
        "createBlindedReviewerContractProjection",
        "\"reviewer-projection.json\"",
        "readInput<BlindedReviewerContractProjection>",
      ],
    },
  },
];

const signer = PrincipalSigner.generate({
  principalId:
    "protocol.author.local-trust-conformance.2026-07-31",
  role: "protocol_author",
  implementationDigest: sha256Text(
    `git:${sourceCommit}:scripts/create-trust-plane-conformance.ts`,
  ),
  instanceId:
    "protocol.author.local-trust-conformance.2026-07-31.instance",
  keyId:
    "protocol.author.local-trust-conformance.2026-07-31.ed25519",
});

const manifest = createTrustPlaneConformanceManifest({
  signer,
  schemas,
  value: {
    manifestId:
      "trust-plane.conformance.local-runtime-and-trust.2026-07-31",
    scope: "local_runtime_and_trust_readiness",
    sourceSnapshot: {
      sourceCommit,
      sourceTree,
      remoteTrackingRef: "refs/remotes/origin/main",
      remoteCommit,
      additionalPushPerformed: false,
    },
    evidenceDomains,
    controlLineages,
    governanceChains: [
      {
        chainId: "hfb_structural_oracle_remediation",
        appendOnly: true,
        records: [
          {
            artifactId: "governance.hfb_deviation",
            recordType: "governance_deviation",
            predecessorArtifactId: null,
            relationship: "root_deviation",
          },
          {
            artifactId: "governance.hfb_closure",
            recordType: "governance_remediation_closure",
            predecessorArtifactId:
              "governance.hfb_deviation",
            relationship: "append_only_closure",
          },
        ],
      },
      {
        chainId: "public_exposure_remediation",
        appendOnly: true,
        records: [
          {
            artifactId: "governance.publication_deviation",
            recordType: "publication_deviation",
            predecessorArtifactId: null,
            relationship: "root_deviation",
          },
          {
            artifactId: "governance.publication_closure",
            recordType: "publication_remediation_closure",
            predecessorArtifactId:
              "governance.publication_deviation",
            relationship: "append_only_closure",
          },
          {
            artifactId:
              "governance.publication_superseding_closure",
            recordType: "publication_superseding_closure",
            predecessorArtifactId:
              "governance.publication_closure",
            relationship:
              "append_only_superseding_closure",
          },
        ],
      },
    ],
    authorityState: obligations.authorityState,
    eligibilityState: {
      publicDevelopment: true,
      eligibleForHeldOut: false,
      eligibleForSealed: false,
      eligibleForTemporalHoldout: false,
      eligibleForGate: false,
      eligibleForFinal: false,
      confirmatory: false,
      authorizedForResearchEvidence: false,
      authorizedForPromotion: false,
    },
    statusDistinction: {
      implementedControlIds: [
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
      ],
      locallyTestedControlIds: [
        "status.gate2r_os_boundary",
        "status.development_boundary",
        "status.historical_governance",
        "status.authorship_admission",
        "status.vault_contention_recovery",
        "status.os_principal_denials",
        "status.custody_crash_recovery",
      ],
      deferredControlIds: [
        "status.real_provider_receipt",
        "status.real_benchmark_custody",
        "status.research_protocol_freeze",
        "status.b0_b6_execution",
        "status.held_out_evaluation",
        "status.research_candidate_selection",
        "status.production_deployment",
      ],
      unclaimedPropertyIds: [
        "status.performance",
        "status.generalization",
        "status.security_certification",
        "status.confidentiality",
        "status.containment",
        "status.evolution",
        "status.self_improvement",
      ],
    },
    outstandingObligations: obligationsArtifact,
    identityNamespacePolicy:
      "scope_qualified_no_cross_domain_equivalence",
    recordedAt: new Date().toISOString(),
  },
});

const serialized =
  `${canonicalize(manifest as unknown as JsonValue)}\n`;
if (process.argv.includes("--write")) {
  await mkdir(path.dirname(OUTPUT_PATH), {
    recursive: true,
  });
  await writeFile(OUTPUT_PATH, serialized, {
    encoding: "utf8",
    flag: "wx",
  });
  process.stdout.write(
    JSON.stringify({
      written: OUTPUT_PATH,
      manifestHash: manifest.manifestHash,
      sourceCommit,
      sourceTree,
      domainCount: manifest.evidenceDomains.length,
      authorityState: manifest.authorityState,
    }) + "\n",
  );
} else {
  process.stdout.write(serialized);
}
