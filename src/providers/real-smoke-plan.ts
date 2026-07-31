import {
  lstat,
  readFile,
  realpath,
} from "node:fs/promises";
import path from "node:path";

import {
  parseStrictJson,
  sha256,
  sha256Bytes,
  type JsonValue,
} from "../core/canonical.js";
import { assertCondition } from "../core/errors.js";
import {
  SCHEMA_BASE_URL,
  type SchemaRegistry,
} from "../contracts/schema-registry.js";
import type { SerializableModelRequest } from "./provider-smoke.js";

export const REAL_PROVIDER_SMOKE_PLAN_SCHEMA_ID =
  `${SCHEMA_BASE_URL}real-provider-smoke-plan.schema.json`;
export const PROVIDER_PRICING_SOURCE_SCHEMA_ID =
  `${SCHEMA_BASE_URL}provider-pricing-source.schema.json`;

export interface ProviderPricingSource {
  readonly schemaVersion: 1;
  readonly hashDomain: "ProviderPricingSource.v1";
  readonly observationType:
    "official_documentation_observation";
  readonly providerId: "openai-responses";
  readonly apiModel: "gpt-5.6-luna";
  readonly modelIdentity:
    "openai:gpt-5.6-luna@alias-observed-2026-07-31";
  readonly currency: "USD";
  readonly inputMicrosPerMillionTokens: number;
  readonly cachedInputMicrosPerMillionTokens: number;
  readonly cacheWriteMicrosPerMillionTokens: number;
  readonly outputMicrosPerMillionTokens: number;
  readonly reasoningIncludedInOutput: true;
  readonly observedAt: string;
  readonly sourceUrls: readonly string[];
}

export interface RealProviderSmokePlan {
  readonly schemaVersion: 1;
  readonly status: "frozen_pre_call";
  readonly purpose: "synthetic_non_benchmark_provider_smoke";
  readonly datasetPermissions: readonly ["deterministic"];
  readonly provider: {
    readonly providerId: "openai-responses";
    readonly apiOrigin: "https://api.openai.com:443";
    readonly apiPath: "/v1/responses";
    readonly apiModel: "gpt-5.6-luna";
    readonly modelIdentity:
      "openai:gpt-5.6-luna@alias-observed-2026-07-31";
    readonly serviceTier: "default";
    readonly reasoningEffort: "none";
    readonly store: false;
    readonly parallelToolCalls: false;
    readonly reportedModelPolicy:
      "requested_alias_or_dated_snapshot";
    readonly pricing: {
      readonly currency: "USD";
      readonly inputMicrosPerMillionTokens: number;
      readonly cachedInputMicrosPerMillionTokens: number;
      readonly cacheWriteMicrosPerMillionTokens: number;
      readonly outputMicrosPerMillionTokens: number;
      readonly reasoningIncludedInOutput: true;
      readonly sourceHash: string;
      readonly effectiveAt: string;
    };
    readonly pricingSourcePath:
      "configs/provider-pricing.openai-gpt-5.6-luna.json";
  };
  readonly request: SerializableModelRequest & {
    readonly reasoningEffort: "none";
  };
  readonly expectedOutput: "SYNTHETIC_PROVIDER_OK";
  readonly caps: {
    readonly providerCallAttempts: 1;
    readonly totalChargedTokens: number;
    readonly providerCostMicros: number;
    readonly wallClockMillis: number;
    readonly requestBytes: number;
    readonly responseBytes: number;
  };
  readonly egress: {
    readonly transport: "unix_connect_allowlist";
    readonly allowedHost: "api.openai.com";
    readonly allowedPort: 443;
    readonly tlsServerName: "api.openai.com";
    readonly maxTunnelBytes: number;
    readonly brokerImplementationHash: string;
    readonly policyHash: string;
  };
  readonly credentialEnvironmentVariable: "OPENAI_API_KEY";
  readonly artifacts: {
    readonly egressBrokerImplementationPath:
      "evaluator/egress_connect_broker.py";
  };
  readonly sourceUrls: readonly string[];
  readonly reproducibilityTier:
    "provider_alias_non_snapshot_smoke_only";
  readonly noHarnessMutation: true;
  readonly createdAt: string;
}

export interface VerifiedRealProviderSmokePlan {
  readonly plan: RealProviderSmokePlan;
  readonly planHash: string;
  readonly pricingSource: ProviderPricingSource;
  readonly pricingSourceHash: string;
  readonly brokerImplementationHash: string;
  readonly egressPolicyHash: string;
}

function asPlan(value: JsonValue): RealProviderSmokePlan {
  return value as unknown as RealProviderSmokePlan;
}

function asPricingSource(
  value: JsonValue,
): ProviderPricingSource {
  return value as unknown as ProviderPricingSource;
}

function isWithin(
  root: string,
  candidate: string,
): boolean {
  const relative = path.relative(root, candidate);
  return (
    relative !== "" &&
    !relative.startsWith(`..${path.sep}`) &&
    relative !== ".." &&
    !path.isAbsolute(relative)
  );
}

async function readPinnedRegularFile(input: {
  readonly repositoryRoot: string;
  readonly relativePath: string;
}): Promise<Buffer> {
  const repositoryRoot = await realpath(
    path.resolve(input.repositoryRoot),
  );
  const absolute = path.resolve(
    repositoryRoot,
    input.relativePath,
  );
  assertCondition(
    isWithin(repositoryRoot, absolute),
    "AUTHORIZATION_DENIED",
    "Smoke-plan artifact escapes the repository root",
  );
  const metadata = await lstat(absolute);
  assertCondition(
    metadata.isFile() && !metadata.isSymbolicLink(),
    "AUTHORIZATION_DENIED",
    "Smoke-plan artifact must be a regular non-symlink file",
  );
  assertCondition(
    (await realpath(absolute)) === absolute,
    "AUTHORIZATION_DENIED",
    "Smoke-plan artifact resolves through a symbolic link",
  );
  return readFile(absolute);
}

export function realProviderEgressPolicyHash(
  egress: RealProviderSmokePlan["egress"],
): string {
  return sha256({
    hashDomain: "ProviderEgressPolicy.v1",
    transport: egress.transport,
    allowedHost: egress.allowedHost,
    allowedPort: egress.allowedPort,
    tlsServerName: egress.tlsServerName,
    maxTunnelBytes: egress.maxTunnelBytes,
  });
}

function assertPricingProjection(input: {
  readonly plan: RealProviderSmokePlan;
  readonly source: ProviderPricingSource;
}): void {
  const plan = input.plan;
  const source = input.source;
  assertCondition(
    source.providerId === plan.provider.providerId &&
      source.apiModel === plan.provider.apiModel &&
      source.modelIdentity === plan.provider.modelIdentity &&
      source.currency === plan.provider.pricing.currency &&
      source.inputMicrosPerMillionTokens ===
        plan.provider.pricing.inputMicrosPerMillionTokens &&
      source.cachedInputMicrosPerMillionTokens ===
        plan.provider.pricing.cachedInputMicrosPerMillionTokens &&
      source.cacheWriteMicrosPerMillionTokens ===
        plan.provider.pricing.cacheWriteMicrosPerMillionTokens &&
      source.outputMicrosPerMillionTokens ===
        plan.provider.pricing.outputMicrosPerMillionTokens &&
      source.reasoningIncludedInOutput ===
        plan.provider.pricing.reasoningIncludedInOutput &&
      source.observedAt === plan.provider.pricing.effectiveAt &&
      sha256(source.sourceUrls as unknown as JsonValue) ===
        sha256(plan.sourceUrls as unknown as JsonValue),
    "PROTOCOL_MISMATCH",
    "Provider pricing projection differs from its observed source",
  );
}

export async function loadAndVerifyRealProviderSmokePlan(
  input: {
    readonly repositoryRoot: string;
    readonly planPath: string;
    readonly schemas: SchemaRegistry;
  },
): Promise<VerifiedRealProviderSmokePlan> {
  const planBytes = await readPinnedRegularFile({
    repositoryRoot: input.repositoryRoot,
    relativePath: input.planPath,
  });
  const planValue = parseStrictJson(planBytes.toString("utf8"));
  input.schemas.validate(
    REAL_PROVIDER_SMOKE_PLAN_SCHEMA_ID,
    planValue,
  );
  const plan = asPlan(planValue);
  const pricingBytes = await readPinnedRegularFile({
    repositoryRoot: input.repositoryRoot,
    relativePath: plan.provider.pricingSourcePath,
  });
  const pricingValue = parseStrictJson(
    pricingBytes.toString("utf8"),
  );
  input.schemas.validate(
    PROVIDER_PRICING_SOURCE_SCHEMA_ID,
    pricingValue,
  );
  const pricingSource = asPricingSource(pricingValue);
  assertPricingProjection({ plan, source: pricingSource });
  const pricingSourceHash = sha256(pricingValue);
  assertCondition(
    plan.provider.pricing.sourceHash === pricingSourceHash,
    "HASH_MISMATCH",
    "Provider pricing source hash does not recompute",
  );
  const brokerBytes = await readPinnedRegularFile({
    repositoryRoot: input.repositoryRoot,
    relativePath:
      plan.artifacts.egressBrokerImplementationPath,
  });
  const brokerImplementationHash =
    `sha256:${sha256Bytes(brokerBytes)}`;
  assertCondition(
    plan.egress.brokerImplementationHash ===
      brokerImplementationHash,
    "HASH_MISMATCH",
    "Egress broker implementation hash does not recompute",
  );
  const egressPolicyHash =
    realProviderEgressPolicyHash(plan.egress);
  assertCondition(
    plan.egress.policyHash === egressPolicyHash,
    "HASH_MISMATCH",
    "Egress policy hash does not recompute",
  );
  assertCondition(
    plan.request.modelIdentity ===
        plan.provider.modelIdentity &&
      plan.request.reasoningEffort ===
        plan.provider.reasoningEffort &&
      plan.request.tools.length === 0 &&
      plan.request.maxOutputTokens <=
        plan.caps.totalChargedTokens &&
      plan.egress.maxTunnelBytes >=
        plan.caps.requestBytes + plan.caps.responseBytes,
    "PROTOCOL_MISMATCH",
    "Real provider request or cap differs from its frozen provider plan",
  );
  return {
    plan,
    planHash: sha256(planValue),
    pricingSource,
    pricingSourceHash,
    brokerImplementationHash,
    egressPolicyHash,
  };
}
