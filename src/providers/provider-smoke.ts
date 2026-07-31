import path from "node:path";

import { sha256, type JsonValue } from "../core/canonical.js";
import { assertCondition } from "../core/errors.js";
import {
  SCHEMA_BASE_URL,
  type SchemaRegistry,
} from "../contracts/schema-registry.js";
import type { ModelRequest } from "../domain/model.js";
import type { BudgetFreezeManifest } from "../evaluation/budget-freeze.js";
import { AppendOnlyLog } from "../storage/append-only-log.js";
import type {
  Attestation,
  PrincipalIdentity,
  PrincipalRegistry,
  PrincipalSigner,
} from "../trust/identity.js";

export const PROVIDER_SMOKE_MANIFEST_SCHEMA_ID =
  `${SCHEMA_BASE_URL}provider-smoke-manifest.schema.json`;

export interface ProviderPricing {
  readonly currency: "USD";
  readonly inputMicrosPerMillionTokens: number;
  readonly cachedInputMicrosPerMillionTokens: number;
  readonly cacheWriteMicrosPerMillionTokens: number;
  readonly outputMicrosPerMillionTokens: number;
  readonly reasoningIncludedInOutput: true;
  readonly sourceHash: string;
  readonly effectiveAt: string;
}

export interface ProviderSmokeCore {
  readonly schemaVersion: 1;
  readonly hashDomain: "ProviderSmokeManifest.v1";
  readonly protocolId: string;
  readonly budgetFreezeId: string;
  readonly purpose: "synthetic_non_benchmark_provider_smoke";
  readonly syntheticTaskId: string;
  readonly modelRequestHash: string;
  readonly provider: {
    readonly providerId: "fake-provider" | "openai-responses";
    readonly apiOrigin: "none" | "https://api.openai.com:443";
    readonly apiPath: "none" | "/v1/responses";
    readonly apiModel: string;
    readonly modelIdentity: string;
    readonly modelIdentityHash: string;
    readonly serviceTier:
      | null
      | "auto"
      | "default"
      | "flex"
      | "scale"
      | "priority";
    readonly reasoningEffort:
      | null
      | "none"
      | "low"
      | "medium"
      | "high"
      | "xhigh"
      | "max";
    readonly maxOutputTokens: number;
    readonly store: false;
    readonly parallelToolCalls: false;
    readonly toolCount: 0;
    readonly reportedModelPolicy:
      | "none"
      | "requested_alias_or_dated_snapshot";
    readonly pricing: ProviderPricing;
  };
  readonly credentialPrincipal: PrincipalIdentity;
  readonly credentialSlotId: string;
  readonly egress: {
    readonly transport: "none" | "unix_connect_allowlist";
    readonly allowedHost: "none" | "api.openai.com";
    readonly allowedPort: 0 | 443;
    readonly tlsServerName: "none" | "api.openai.com";
    readonly maxTunnelBytes: number;
    readonly brokerImplementationHash: string;
    readonly policyHash: string;
  };
  readonly caps: {
    readonly providerCallAttempts: 1;
    readonly totalChargedTokens: number;
    readonly providerCostMicros: number;
    readonly wallClockMillis: number;
    readonly requestBytes: number;
    readonly responseBytes: number;
  };
  readonly permissionPolicyHash: string;
  readonly redactionPolicyHash: string;
  readonly proxyImplementationHash: string;
  readonly sourceConfigHash: string;
  readonly createdAt: string;
  readonly createdBy: PrincipalIdentity;
}

export interface ProviderSmokeManifest extends ProviderSmokeCore {
  readonly providerSmokeManifestId: string;
  readonly attestation: Attestation;
}

type ProviderSmokeBody = Omit<
  ProviderSmokeManifest,
  "attestation"
>;

export type SerializableModelRequest = Omit<
  ModelRequest,
  "abortSignal"
>;

function bodyOf(
  manifest: ProviderSmokeManifest,
): ProviderSmokeBody {
  const { attestation: _attestation, ...body } = manifest;
  return body;
}

function coreOf(manifest: ProviderSmokeManifest): ProviderSmokeCore {
  const {
    providerSmokeManifestId: _providerSmokeManifestId,
    attestation: _attestation,
    ...core
  } = manifest;
  return core;
}

export function serializableModelRequest(
  request: ModelRequest,
): SerializableModelRequest {
  const { abortSignal: _abortSignal, ...serializable } = request;
  return serializable;
}

export function modelRequestHash(request: ModelRequest): string {
  return sha256(
    serializableModelRequest(request) as unknown as JsonValue,
  );
}

function assertNonnegativeSafeInteger(
  value: number,
  label: string,
): void {
  assertCondition(
    Number.isSafeInteger(value) && value >= 0,
    "SCHEMA_INVALID",
    `${label} must be a nonnegative safe integer`,
  );
}

export function assertProviderSmokeContract(input: {
  readonly manifest: ProviderSmokeCore;
  readonly budgetFreeze: BudgetFreezeManifest;
}): void {
  const { manifest, budgetFreeze } = input;
  const phase = budgetFreeze.phaseCaps.find(
    (entry) => entry.phaseId === "provider_smoke",
  );
  assertCondition(
    budgetFreeze.scope === "provider_smoke" &&
      budgetFreeze.protocolId === manifest.protocolId &&
      budgetFreeze.budgetFreezeId === manifest.budgetFreezeId &&
      budgetFreeze.datasetPermissions.length === 1 &&
      budgetFreeze.datasetPermissions[0] === "deterministic",
    "AUTHORIZATION_DENIED",
    "Provider smoke requires its deterministic provider-smoke budget freeze",
  );
  assertCondition(
    phase !== undefined,
    "PROTOCOL_MISMATCH",
    "Provider smoke budget freeze omits the provider_smoke phase",
  );
  assertCondition(
    manifest.credentialPrincipal.role === "model_provider_proxy" ||
      (manifest.provider.providerId === "fake-provider" &&
        manifest.credentialPrincipal.role === "fake_provider"),
    "AUTHORIZATION_DENIED",
    "Credential owner has the wrong provider role",
  );
  assertCondition(
    manifest.provider.modelIdentityHash ===
        sha256(manifest.provider.modelIdentity) &&
      budgetFreeze.modelIdentityHash ===
        manifest.provider.modelIdentityHash &&
      budgetFreeze.permissionPolicyHash ===
        manifest.permissionPolicyHash &&
      manifest.credentialPrincipal.implementationDigest ===
        manifest.proxyImplementationHash &&
      (manifest.credentialPrincipal.modelIdentityHash ===
        undefined ||
        manifest.credentialPrincipal.modelIdentityHash ===
          manifest.provider.modelIdentityHash),
    "HASH_MISMATCH",
    "Provider identity or immutable pin mismatch",
  );
  assertCondition(
    manifest.provider.maxOutputTokens <=
      budgetFreeze.perRequestTokenCap &&
    manifest.caps.totalChargedTokens <=
        phase.caps.totalChargedTokens &&
      manifest.caps.providerCostMicros <=
        phase.caps.providerCostMicros &&
      manifest.caps.providerCostMicros <=
        budgetFreeze.perRequestCostCapMicros &&
      manifest.caps.providerCallAttempts <=
        phase.caps.providerModelRequestAttempts &&
      manifest.caps.wallClockMillis <=
        phase.caps.wallClockMillis &&
      manifest.caps.responseBytes <= phase.caps.outputBytes,
    "BUDGET_EXHAUSTED",
    "Provider smoke caps exceed the signed phase budget",
  );
  for (const [name, value] of Object.entries({
    ...manifest.caps,
    ...manifest.provider.pricing,
  })) {
    if (typeof value === "number") {
      assertNonnegativeSafeInteger(value, name);
    }
  }
  const realProvider =
    manifest.provider.providerId === "openai-responses";
  assertCondition(
    realProvider
      ? manifest.provider.apiOrigin ===
          "https://api.openai.com:443" &&
          manifest.provider.apiPath === "/v1/responses" &&
          manifest.egress.transport ===
            "unix_connect_allowlist" &&
          manifest.egress.allowedHost === "api.openai.com" &&
          manifest.egress.allowedPort === 443 &&
          manifest.egress.tlsServerName === "api.openai.com" &&
          manifest.provider.reportedModelPolicy ===
            "requested_alias_or_dated_snapshot" &&
          manifest.egress.maxTunnelBytes >=
            manifest.caps.requestBytes +
              manifest.caps.responseBytes
      : manifest.provider.apiOrigin === "none" &&
          manifest.provider.apiPath === "none" &&
          manifest.egress.transport === "none" &&
          manifest.egress.allowedHost === "none" &&
          manifest.egress.allowedPort === 0 &&
          manifest.egress.tlsServerName === "none" &&
          manifest.provider.reportedModelPolicy === "none" &&
          manifest.egress.maxTunnelBytes === 0,
    "AUTHORIZATION_DENIED",
    "Provider and egress modes are inconsistent",
  );
}

export function createProviderSmokeManifest(input: {
  readonly core: Omit<
    ProviderSmokeCore,
    "schemaVersion" | "hashDomain" | "createdBy"
  >;
  readonly budgetFreeze: BudgetFreezeManifest;
  readonly signer: PrincipalSigner;
  readonly schemas: SchemaRegistry;
}): ProviderSmokeManifest {
  assertCondition(
    input.signer.identity.role === "protocol_author",
    "AUTHORIZATION_DENIED",
    "Only the protocol author can freeze a provider smoke",
  );
  const core: ProviderSmokeCore = {
    schemaVersion: 1,
    hashDomain: "ProviderSmokeManifest.v1",
    ...input.core,
    createdBy: input.signer.identity,
  };
  assertProviderSmokeContract({
    manifest: core,
    budgetFreeze: input.budgetFreeze,
  });
  const body: ProviderSmokeBody = {
    ...core,
    providerSmokeManifestId:
      `psm-sha256:${sha256(core as unknown as JsonValue).slice(7)}`,
  };
  const manifest: ProviderSmokeManifest = {
    ...body,
    attestation: input.signer.attest(
      body as unknown as JsonValue,
    ),
  };
  input.schemas.validate(
    PROVIDER_SMOKE_MANIFEST_SCHEMA_ID,
    manifest as unknown as JsonValue,
  );
  return manifest;
}

export function verifyProviderSmokeManifest(input: {
  readonly manifest: ProviderSmokeManifest;
  readonly expectedProtocolId: string;
  readonly budgetFreeze: BudgetFreezeManifest;
  readonly schemas: SchemaRegistry;
  readonly principals: PrincipalRegistry;
}): void {
  input.schemas.validate(
    PROVIDER_SMOKE_MANIFEST_SCHEMA_ID,
    input.manifest as unknown as JsonValue,
  );
  assertCondition(
    input.manifest.protocolId === input.expectedProtocolId &&
      input.manifest.createdBy.role === "protocol_author",
    "PROTOCOL_MISMATCH",
    "Provider smoke protocol or author mismatch",
  );
  assertProviderSmokeContract({
    manifest: input.manifest,
    budgetFreeze: input.budgetFreeze,
  });
  assertCondition(
    input.manifest.providerSmokeManifestId ===
      `psm-sha256:${sha256(coreOf(input.manifest) as unknown as JsonValue).slice(7)}`,
    "HASH_MISMATCH",
    "Provider smoke content identity mismatch",
  );
  input.principals.verify(
    input.manifest.createdBy,
    bodyOf(input.manifest) as unknown as JsonValue,
    input.manifest.attestation,
  );
}

export class ProviderSmokeManifestStore {
  readonly #protocolId: string;
  readonly #budgetFreeze: BudgetFreezeManifest;
  readonly #schemas: SchemaRegistry;
  readonly #principals: PrincipalRegistry;
  readonly #signer: PrincipalSigner;
  readonly #log: AppendOnlyLog<JsonValue>;
  #active: ProviderSmokeManifest | null = null;

  public constructor(input: {
    readonly root: string;
    readonly protocolId: string;
    readonly budgetFreeze: BudgetFreezeManifest;
    readonly schemas: SchemaRegistry;
    readonly principals: PrincipalRegistry;
    readonly signer: PrincipalSigner;
  }) {
    this.#protocolId = input.protocolId;
    this.#budgetFreeze = input.budgetFreeze;
    this.#schemas = input.schemas;
    this.#principals = input.principals;
    this.#signer = input.signer;
    this.#log = new AppendOnlyLog<JsonValue>(
      path.join(input.root, "trust"),
      `provider-smoke.${input.protocolId}`,
    );
  }

  public async initialize(): Promise<void> {
    const records = await this.#log.readAll();
    assertCondition(
      records.length <= 1,
      "PROTOCOL_MISMATCH",
      "A protocol cannot contain multiple provider smoke manifests",
    );
    if (records.length === 0) return;
    const manifest =
      records[0]!.payload as unknown as ProviderSmokeManifest;
    verifyProviderSmokeManifest({
      manifest,
      expectedProtocolId: this.#protocolId,
      budgetFreeze: this.#budgetFreeze,
      schemas: this.#schemas,
      principals: this.#principals,
    });
    this.#active = manifest;
  }

  public async freeze(
    core: Omit<
      ProviderSmokeCore,
      "schemaVersion" | "hashDomain" | "createdBy"
    >,
  ): Promise<ProviderSmokeManifest> {
    const candidate = createProviderSmokeManifest({
      core,
      budgetFreeze: this.#budgetFreeze,
      signer: this.#signer,
      schemas: this.#schemas,
    });
    if (this.#active !== null) {
      assertCondition(
        candidate.providerSmokeManifestId ===
          this.#active.providerSmokeManifestId,
        "PROTOCOL_MISMATCH",
        "Changing provider smoke bytes requires a new protocol ID",
      );
      return this.#active;
    }
    await this.#log.append(candidate as unknown as JsonValue);
    this.#active = candidate;
    return candidate;
  }

  public active(): ProviderSmokeManifest {
    assertCondition(
      this.#active !== null,
      "ARTIFACT_UNAVAILABLE",
      "No provider smoke manifest is frozen",
    );
    return this.#active;
  }
}
