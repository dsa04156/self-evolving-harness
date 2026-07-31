import {
  contentId,
  sha256,
} from "../core/canonical.js";
import type { SchemaRegistry } from "../contracts/schema-registry.js";
import type { ModelRequest } from "../domain/model.js";
import {
  PHASE_IDS,
  createBudgetFreezeManifest,
  type BudgetFreezeManifest,
  type PhaseBudgetCaps,
} from "../evaluation/budget-freeze.js";
import type { PrincipalSigner } from "../trust/identity.js";
import {
  createProviderSmokeManifest,
  modelRequestHash,
  type ProviderSmokeManifest,
} from "./provider-smoke.js";
import type {
  RealProviderSmokePlan,
  VerifiedRealProviderSmokePlan,
} from "./real-smoke-plan.js";

const ZERO_PHASE_CAPS: PhaseBudgetCaps = {
  providerModelRequestAttempts: 0,
  totalChargedTokens: 0,
  providerCostMicros: 0,
  toolAttempts: 0,
  feedbackEvents: 0,
  wallClockMillis: 0,
  processCount: 0,
  outputBytes: 0,
};

export interface RealProviderSmokePins {
  readonly sourceCommit: string;
  readonly environmentHash: string;
  readonly permissionPolicyHash: string;
  readonly proxyImplementationHash: string;
  readonly createdAt: string;
}

export interface RealProviderSmokeArtifacts {
  readonly protocolId: string;
  readonly phaseAccountId: string;
  readonly request: ModelRequest;
  readonly budgetFreeze: BudgetFreezeManifest;
  readonly smokeManifest: ProviderSmokeManifest;
}

export function realProviderPermissionPolicyHash(
  plan: RealProviderSmokePlan,
): string {
  return sha256({
    hashDomain: "RealProviderSmokePermissionPolicy.v1",
    datasetPermissions: plan.datasetPermissions,
    noHarnessMutation: plan.noHarnessMutation,
    roleUids: {
      runtime: 1102,
      provider: 1106,
      egress: 1107,
    },
    credentialOwner: "provider",
    runtimeCredentialRead: "deny",
    providerDirectNetwork: "deny",
    runtimeDirectNetwork: "deny",
    egressCredentialMount: "deny",
    egressTlsTermination: "deny",
    egressTransport: plan.egress.transport,
    egressAllowedHost: plan.egress.allowedHost,
    egressAllowedPort: plan.egress.allowedPort,
    egressMaxTunnelBytes: plan.egress.maxTunnelBytes,
  });
}

export function implementationAtCommitHash(input: {
  readonly role:
    | "protocol_author"
    | "runtime"
    | "model_provider_proxy";
  readonly sourceCommit: string;
}): string {
  return sha256({
    hashDomain: "ImplementationAtGitCommit.v1",
    role: input.role,
    sourceCommit: input.sourceCommit,
  });
}

function providerPhaseCaps(
  plan: RealProviderSmokePlan,
): PhaseBudgetCaps {
  return {
    providerModelRequestAttempts:
      plan.caps.providerCallAttempts,
    totalChargedTokens: plan.caps.totalChargedTokens,
    providerCostMicros: plan.caps.providerCostMicros,
    toolAttempts: 0,
    feedbackEvents: 0,
    wallClockMillis: plan.caps.wallClockMillis,
    processCount: 3,
    outputBytes: plan.caps.responseBytes,
  };
}

export function createRealProviderSmokeArtifacts(input: {
  readonly verifiedPlan: VerifiedRealProviderSmokePlan;
  readonly pins: RealProviderSmokePins;
  readonly protocolAuthor: PrincipalSigner;
  readonly providerProxy: PrincipalSigner;
  readonly redactionPolicyHash: string;
  readonly schemas: SchemaRegistry;
}): RealProviderSmokeArtifacts {
  const { plan, planHash } = input.verifiedPlan;
  const modelIdentityHash = sha256(
    plan.provider.modelIdentity,
  );
  const protocolId = contentId("protocol-sha256", {
    hashDomain: "RealProviderSmokeProtocol.v1",
    planHash,
    sourceCommit: input.pins.sourceCommit,
    environmentHash: input.pins.environmentHash,
    permissionPolicyHash: input.pins.permissionPolicyHash,
  });
  const request = plan.request as ModelRequest;
  const budgetFreeze = createBudgetFreezeManifest({
    core: {
      protocolId,
      scope: "provider_smoke",
      datasetPermissions: ["deterministic"],
      modelIdentityHash,
      toolSetHash: sha256([]),
      environmentHash: input.pins.environmentHash,
      permissionPolicyHash:
        input.pins.permissionPolicyHash,
      methods: ["B0"],
      rolloutSeeds: [1729],
      solverSlots: [{ methodId: "B0", slots: 1 }],
      phaseCaps: PHASE_IDS.map((phaseId) => ({
        phaseId,
        caps:
          phaseId === "provider_smoke"
            ? providerPhaseCaps(plan)
            : ZERO_PHASE_CAPS,
      })),
      perRequestTokenCap: plan.caps.totalChargedTokens,
      perRequestCostCapMicros:
        plan.caps.providerCostMicros,
      sourceConfigHash: planHash,
      supersedesBudgetFreezeId: null,
      createdAt: input.pins.createdAt,
    },
    signer: input.protocolAuthor,
    schemas: input.schemas,
  });
  const smokeManifest = createProviderSmokeManifest({
    core: {
      protocolId,
      budgetFreezeId: budgetFreeze.budgetFreezeId,
      purpose: plan.purpose,
      syntheticTaskId:
        "synthetic.provider.openai.transport.1",
      modelRequestHash: modelRequestHash(request),
      provider: {
        providerId: plan.provider.providerId,
        apiOrigin: plan.provider.apiOrigin,
        apiPath: plan.provider.apiPath,
        apiModel: plan.provider.apiModel,
        modelIdentity: plan.provider.modelIdentity,
        modelIdentityHash,
        serviceTier: plan.provider.serviceTier,
        reasoningEffort: plan.provider.reasoningEffort,
        maxOutputTokens: request.maxOutputTokens,
        store: plan.provider.store,
        parallelToolCalls:
          plan.provider.parallelToolCalls,
        toolCount: 0,
        pricing: plan.provider.pricing,
      },
      credentialPrincipal:
        input.providerProxy.identity,
      credentialSlotId: "openai.api_key.smoke.v1",
      egress: plan.egress,
      caps: plan.caps,
      permissionPolicyHash:
        input.pins.permissionPolicyHash,
      redactionPolicyHash: input.redactionPolicyHash,
      proxyImplementationHash:
        input.pins.proxyImplementationHash,
      sourceConfigHash: planHash,
      createdAt: input.pins.createdAt,
    },
    budgetFreeze,
    signer: input.protocolAuthor,
    schemas: input.schemas,
  });
  return {
    protocolId,
    phaseAccountId: "phase-account.real-provider-smoke.1",
    request,
    budgetFreeze,
    smokeManifest,
  };
}
