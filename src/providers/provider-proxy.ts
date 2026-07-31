import path from "node:path";

import {
  canonicalBytes,
  sha256,
  type JsonValue,
} from "../core/canonical.js";
import type { Clock } from "../core/determinism.js";
import {
  HarnessError,
  asHarnessError,
  assertCondition,
} from "../core/errors.js";
import {
  SCHEMA_BASE_URL,
  type SchemaRegistry,
} from "../contracts/schema-registry.js";
import type {
  ModelProvider,
  ModelRequest,
  ModelResponse,
  ModelUsage,
} from "../domain/model.js";
import { SecretRedactor } from "../evidence/runtime-events.js";
import { AppendOnlyLog } from "../storage/append-only-log.js";
import type {
  Attestation,
  PrincipalIdentity,
  PrincipalRegistry,
  PrincipalSigner,
} from "../trust/identity.js";
import type {
  ProviderPricing,
  ProviderSmokeManifest,
} from "./provider-smoke.js";
import {
  modelRequestHash,
  serializableModelRequest,
} from "./provider-smoke.js";

export const PROVIDER_CALL_RECEIPT_SCHEMA_ID =
  `${SCHEMA_BASE_URL}provider-call-receipt.schema.json`;
export const PROVIDER_PROXY_RESULT_SCHEMA_ID =
  `${SCHEMA_BASE_URL}provider-proxy-result.schema.json`;

export interface ProviderCallUsage {
  readonly usageAvailable: boolean;
  readonly inputTokens: number;
  readonly cachedInputTokens: number;
  readonly cacheWriteTokens: number;
  readonly outputTokens: number;
  readonly reasoningTokens: number;
  readonly providerTotalTokens: number;
  readonly totalChargedTokens: number;
  readonly providerCostMicros: number;
  readonly costBasis:
    | "frozen_pricing"
    | "full_reservation_no_usage";
}

export interface ProviderCallReceipt {
  readonly schemaVersion: 1;
  readonly hashDomain: "ProviderCallReceipt.v1";
  readonly providerCallReceiptId: string;
  readonly protocolId: string;
  readonly providerSmokeManifestId: string;
  readonly budgetFreezeId: string;
  readonly phaseAccountId: string;
  readonly providerRequestId: string;
  readonly modelRequestHash: string;
  readonly modelIdentityHash: string;
  readonly status:
    | "completed"
    | "failed"
    | "cancelled"
    | "budget_exhausted";
  readonly responseHash: string | null;
  readonly responseId: string | null;
  readonly usage: ProviderCallUsage;
  readonly requestBytes: number;
  readonly responseBytes: number;
  readonly wallClockMillis: number;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly credentialSlotId: string;
  readonly egressOrigin:
    | "none"
    | "https://api.openai.com:443";
  readonly error: {
    readonly code: string;
    readonly safeDetail: string;
    readonly retryable: boolean;
  } | null;
  readonly redaction: {
    readonly containsKnownSecrets: false;
    readonly appliedRuleIds: readonly string[];
    readonly scannerHash: string;
  };
  readonly producer: PrincipalIdentity;
  readonly attestation: Attestation;
}

export interface ProviderProxyResult {
  readonly schemaVersion: 1;
  readonly receipt: ProviderCallReceipt;
  readonly response: ModelResponse | null;
}

type ProviderCallReceiptBody = Omit<
  ProviderCallReceipt,
  "attestation"
>;
type ProviderCallReceiptCore = Omit<
  ProviderCallReceipt,
  "providerCallReceiptId" | "attestation"
>;

function receiptBody(
  receipt: ProviderCallReceipt,
): ProviderCallReceiptBody {
  const { attestation: _attestation, ...body } = receipt;
  return body;
}

function receiptCore(
  receipt: ProviderCallReceipt,
): ProviderCallReceiptCore {
  const {
    providerCallReceiptId: _providerCallReceiptId,
    attestation: _attestation,
    ...core
  } = receipt;
  return core;
}

function ceilDivide(
  numerator: bigint,
  denominator: bigint,
): bigint {
  return (numerator + denominator - 1n) / denominator;
}

export function providerCostMicros(
  usage: ModelUsage,
  pricing: ProviderPricing,
): number {
  const cacheWrite = usage.cacheWriteTokens ?? 0;
  assertCondition(
    [
      usage.inputTokens,
      usage.outputTokens,
      usage.reasoningTokens,
      usage.cachedInputTokens,
      cacheWrite,
      usage.totalTokens,
    ].every(
      (value) => Number.isSafeInteger(value) && value >= 0,
    ) &&
      usage.cachedInputTokens + cacheWrite <= usage.inputTokens &&
      usage.reasoningTokens <= usage.outputTokens,
    "SCHEMA_INVALID",
    "Provider usage counters are inconsistent",
  );
  const uncachedInput =
    usage.inputTokens - usage.cachedInputTokens - cacheWrite;
  const numerator =
    BigInt(uncachedInput) *
      BigInt(pricing.inputMicrosPerMillionTokens) +
    BigInt(usage.cachedInputTokens) *
      BigInt(pricing.cachedInputMicrosPerMillionTokens) +
    BigInt(cacheWrite) *
      BigInt(pricing.cacheWriteMicrosPerMillionTokens) +
    BigInt(usage.outputTokens) *
      BigInt(pricing.outputMicrosPerMillionTokens);
  const cost = ceilDivide(numerator, 1_000_000n);
  assertCondition(
    cost <= BigInt(Number.MAX_SAFE_INTEGER),
    "SCHEMA_INVALID",
    "Provider cost exceeds the safe integer domain",
  );
  return Number(cost);
}

function chargedUsage(
  usage: ModelUsage,
  pricing: ProviderPricing,
): ProviderCallUsage {
  const cacheWriteTokens = usage.cacheWriteTokens ?? 0;
  return {
    usageAvailable: true,
    inputTokens: usage.inputTokens,
    cachedInputTokens: usage.cachedInputTokens,
    cacheWriteTokens,
    outputTokens: usage.outputTokens,
    reasoningTokens: usage.reasoningTokens,
    providerTotalTokens: usage.totalTokens,
    totalChargedTokens: Math.max(
      usage.totalTokens,
      usage.inputTokens + usage.outputTokens,
    ),
    providerCostMicros: providerCostMicros(usage, pricing),
    costBasis: "frozen_pricing",
  };
}

function reservationUsage(
  manifest: ProviderSmokeManifest,
): ProviderCallUsage {
  return {
    usageAvailable: false,
    inputTokens: 0,
    cachedInputTokens: 0,
    cacheWriteTokens: 0,
    outputTokens: 0,
    reasoningTokens: 0,
    providerTotalTokens: 0,
    totalChargedTokens: manifest.caps.totalChargedTokens,
    providerCostMicros: manifest.caps.providerCostMicros,
    costBasis: "full_reservation_no_usage",
  };
}

function normalizedResponse(
  response: ModelResponse,
  manifest: ProviderSmokeManifest,
): ModelResponse {
  assertCondition(
    response.modelIdentity === manifest.provider.modelIdentity,
    "PROTOCOL_MISMATCH",
    "Provider response model identity differs from the smoke manifest",
  );
  const output = response.output
    .filter(
      (
        item,
      ): item is Extract<
        ModelResponse["output"][number],
        { kind: "assistant_message" }
      > => item.kind === "assistant_message",
    )
    .map((item) => ({
      kind: "assistant_message" as const,
      text: item.text,
    }));
  assertCondition(
    output.length > 0,
    "SCHEMA_INVALID",
    "Provider smoke produced no assistant message",
  );
  const upstreamMetadata =
    response.providerMetadata as Readonly<
      Record<string, JsonValue>
    >;
  const reportedModel =
    typeof upstreamMetadata["reportedModel"] === "string"
      ? upstreamMetadata["reportedModel"]
      : null;
  if (manifest.provider.providerId === "openai-responses") {
    const requestedApiModel =
      upstreamMetadata["requestedApiModel"];
    const escapedAlias =
      manifest.provider.apiModel.replace(
        /[.*+?^${}()|[\]\\]/gu,
        "\\$&",
      );
    assertCondition(
      upstreamMetadata["provider"] === "openai" &&
        requestedApiModel === manifest.provider.apiModel &&
        reportedModel !== null &&
        (reportedModel === manifest.provider.apiModel ||
          new RegExp(
            `^${escapedAlias}-[0-9]{4}-[0-9]{2}-[0-9]{2}$`,
            "u",
          ).test(reportedModel)),
      "PROTOCOL_MISMATCH",
      "Provider-reported model violates the frozen alias/snapshot policy",
    );
  }
  return {
    responseId: response.responseId,
    modelIdentity: response.modelIdentity,
    output,
    usage: {
      inputTokens: response.usage.inputTokens,
      outputTokens: response.usage.outputTokens,
      reasoningTokens: response.usage.reasoningTokens,
      cachedInputTokens: response.usage.cachedInputTokens,
      cacheWriteTokens: response.usage.cacheWriteTokens ?? 0,
      totalTokens: response.usage.totalTokens,
    },
    providerMetadata: {
      providerId: manifest.provider.providerId,
      requestedApiModel: manifest.provider.apiModel,
      reportedModel:
        manifest.provider.providerId === "openai-responses"
          ? reportedModel
          : null,
      reportedModelPolicy:
        manifest.provider.reportedModelPolicy,
      upstreamMetadataHash: sha256(
        response.providerMetadata as unknown as JsonValue,
      ),
      normalizedFor: "provider_smoke",
    },
  };
}

function safeError(
  error: unknown,
  redactor: SecretRedactor,
): {
  readonly code: string;
  readonly safeDetail: string;
  readonly retryable: boolean;
  readonly appliedRuleIds: readonly string[];
} {
  const harnessError = asHarnessError(error);
  const redacted = redactor.redact({
    detail: harnessError.safeDetail,
  });
  const value = redacted.value as { readonly detail: JsonValue };
  return {
    code: harnessError.code,
    safeDetail: String(value.detail).slice(0, 1000),
    retryable: harnessError.retryable,
    appliedRuleIds: redacted.appliedRuleIds,
  };
}

export function verifyProviderCallReceipt(input: {
  readonly receipt: ProviderCallReceipt;
  readonly manifest: ProviderSmokeManifest;
  readonly expectedPhaseAccountId: string;
  readonly schemas: SchemaRegistry;
  readonly principals: PrincipalRegistry;
}): void {
  input.schemas.validate(
    PROVIDER_CALL_RECEIPT_SCHEMA_ID,
    input.receipt as unknown as JsonValue,
  );
  assertCondition(
    input.receipt.protocolId === input.manifest.protocolId &&
      input.receipt.providerSmokeManifestId ===
        input.manifest.providerSmokeManifestId &&
      input.receipt.budgetFreezeId ===
        input.manifest.budgetFreezeId &&
      input.receipt.phaseAccountId ===
        input.expectedPhaseAccountId &&
      input.receipt.modelRequestHash ===
        input.manifest.modelRequestHash &&
      input.receipt.modelIdentityHash ===
        input.manifest.provider.modelIdentityHash &&
      input.receipt.credentialSlotId ===
        input.manifest.credentialSlotId &&
      input.receipt.egressOrigin ===
        input.manifest.provider.apiOrigin &&
      input.receipt.redaction.scannerHash ===
        input.manifest.redactionPolicyHash,
    "PROTOCOL_MISMATCH",
    "Provider call receipt differs from its smoke manifest",
  );
  assertCondition(
    sha256(
      input.receipt.producer as unknown as JsonValue,
    ) ===
      sha256(
        input.manifest
          .credentialPrincipal as unknown as JsonValue,
      ),
    "AUTHENTICATION_FAILED",
    "Provider call receipt has the wrong credential owner",
  );
  assertCondition(
    input.receipt.providerCallReceiptId ===
      `pcr-sha256:${sha256(receiptCore(input.receipt) as unknown as JsonValue).slice(7)}`,
    "HASH_MISMATCH",
    "Provider call receipt content identity mismatch",
  );
  assertCondition(
    input.receipt.requestBytes <= input.manifest.caps.requestBytes &&
      input.receipt.responseBytes <=
        input.manifest.caps.responseBytes &&
      (input.receipt.wallClockMillis <=
        input.manifest.caps.wallClockMillis ||
        input.receipt.status === "budget_exhausted"),
    "BUDGET_EXHAUSTED",
    "Provider call receipt exceeds a hard byte or time cap",
  );
  if (input.receipt.usage.usageAvailable) {
    const reconstructed: ModelUsage = {
      inputTokens: input.receipt.usage.inputTokens,
      outputTokens: input.receipt.usage.outputTokens,
      reasoningTokens: input.receipt.usage.reasoningTokens,
      cachedInputTokens: input.receipt.usage.cachedInputTokens,
      cacheWriteTokens: input.receipt.usage.cacheWriteTokens,
      totalTokens: input.receipt.usage.providerTotalTokens,
    };
    assertCondition(
      input.receipt.usage.costBasis === "frozen_pricing" &&
        input.receipt.usage.totalChargedTokens ===
          Math.max(
            reconstructed.totalTokens,
            reconstructed.inputTokens +
              reconstructed.outputTokens,
          ) &&
        input.receipt.usage.providerCostMicros ===
          providerCostMicros(
            reconstructed,
            input.manifest.provider.pricing,
          ),
      "HASH_MISMATCH",
      "Provider receipt usage does not recompute",
    );
  } else {
    assertCondition(
      input.receipt.usage.costBasis ===
          "full_reservation_no_usage" &&
        input.receipt.usage.totalChargedTokens ===
          input.manifest.caps.totalChargedTokens &&
        input.receipt.usage.providerCostMicros ===
          input.manifest.caps.providerCostMicros,
      "HASH_MISMATCH",
      "Missing provider usage did not charge the full reservation",
    );
  }
  if (input.receipt.status === "completed") {
    assertCondition(
      input.receipt.error === null &&
        input.receipt.responseHash !== null &&
        input.receipt.responseId !== null &&
        input.receipt.usage.usageAvailable &&
        input.receipt.usage.totalChargedTokens <=
          input.manifest.caps.totalChargedTokens &&
        input.receipt.usage.providerCostMicros <=
          input.manifest.caps.providerCostMicros,
      "INVALID_STATE_TRANSITION",
      "Completed provider receipt is incomplete or over budget",
    );
  } else {
    assertCondition(
      input.receipt.error !== null &&
        input.receipt.responseHash === null &&
        input.receipt.responseId === null,
      "INVALID_STATE_TRANSITION",
      "Non-completed provider receipt requires a safe error",
    );
  }
  assertCondition(
    Date.parse(input.receipt.completedAt) >=
      Date.parse(input.receipt.startedAt),
    "HASH_MISMATCH",
    "Provider receipt completion precedes its start",
  );
  input.principals.verify(
    input.receipt.producer,
    receiptBody(input.receipt) as unknown as JsonValue,
    input.receipt.attestation,
  );
}

export class ProviderProxyEngine {
  readonly #manifest: ProviderSmokeManifest;
  readonly #phaseAccountId: string;
  readonly #provider: ModelProvider;
  readonly #signer: PrincipalSigner;
  readonly #principals: PrincipalRegistry;
  readonly #schemas: SchemaRegistry;
  readonly #clock: Clock;
  readonly #redactor: SecretRedactor;
  readonly #log: AppendOnlyLog<JsonValue>;
  #result: ProviderProxyResult | null = null;
  #queue: Promise<void> = Promise.resolve();

  public constructor(input: {
    readonly root: string;
    readonly manifest: ProviderSmokeManifest;
    readonly phaseAccountId: string;
    readonly provider: ModelProvider;
    readonly signer: PrincipalSigner;
    readonly principals: PrincipalRegistry;
    readonly schemas: SchemaRegistry;
    readonly clock: Clock;
    readonly redactor: SecretRedactor;
  }) {
    assertCondition(
      input.signer.identity.role ===
          input.manifest.credentialPrincipal.role &&
        sha256(
          input.signer.identity as unknown as JsonValue,
        ) ===
          sha256(
            input.manifest
              .credentialPrincipal as unknown as JsonValue,
          ) &&
        input.provider.providerId ===
          input.manifest.provider.providerId &&
        input.redactor.scannerHash ===
          input.manifest.redactionPolicyHash,
      "AUTHORIZATION_DENIED",
      "Provider engine identity or implementation is not frozen",
    );
    this.#manifest = input.manifest;
    this.#phaseAccountId = input.phaseAccountId;
    this.#provider = input.provider;
    this.#signer = input.signer;
    this.#principals = input.principals;
    this.#schemas = input.schemas;
    this.#clock = input.clock;
    this.#redactor = input.redactor;
    this.#log = new AppendOnlyLog<JsonValue>(
      path.join(input.root, "provider"),
      `provider-smoke.${input.manifest.providerSmokeManifestId}`,
    );
  }

  public async initialize(): Promise<void> {
    await this.#withLock(async () => {
      const records = await this.#log.readAll();
      assertCondition(
        records.length <=
          this.#manifest.caps.providerCallAttempts,
        "BUDGET_EXHAUSTED",
        "Provider call ledger exceeds the frozen attempt cap",
      );
      if (records.length === 0) return;
      const result =
        records[0]!.payload as unknown as ProviderProxyResult;
      this.#verifyResult(result);
      this.#result = result;
    });
  }

  public async execute(
    request: ModelRequest,
  ): Promise<ProviderProxyResult> {
    return this.#withLock(async () => {
      const requestHash = modelRequestHash(request);
      assertCondition(
        requestHash === this.#manifest.modelRequestHash &&
          request.requestId.length > 0 &&
          request.modelIdentity ===
            this.#manifest.provider.modelIdentity &&
          request.maxOutputTokens ===
            this.#manifest.provider.maxOutputTokens &&
          (request.reasoningEffort ?? null) ===
            this.#manifest.provider.reasoningEffort &&
          request.tools.length === 0 &&
          request.input.every((item) => item.kind === "text"),
        "PROTOCOL_MISMATCH",
        "Provider request is not the frozen synthetic request",
      );
      if (this.#result !== null) {
        assertCondition(
          this.#result.receipt.providerRequestId ===
            request.requestId,
          "CONFLICT",
          "Provider smoke already consumed its one request slot",
        );
        return this.#result;
      }
      const requestBytes = canonicalBytes(
        serializableModelRequest(
          request,
        ) as unknown as JsonValue,
      ).byteLength;
      assertCondition(
        requestBytes <= this.#manifest.caps.requestBytes,
        "PAYLOAD_TOO_LARGE",
        "Provider request exceeds the frozen byte cap",
      );
      const result = await this.#invoke(request, requestBytes);
      this.#verifyResult(result);
      await this.#log.append(result as unknown as JsonValue);
      this.#result = result;
      return result;
    });
  }

  async #invoke(
    request: ModelRequest,
    requestBytes: number,
  ): Promise<ProviderProxyResult> {
    const startedNanos = this.#clock.monotonicNanos();
    const startedAt = this.#clock.now().toISOString();
    const controller = new AbortController();
    const timeout = setTimeout(
      () =>
        controller.abort(
          new HarnessError(
            "DEADLINE_EXCEEDED",
            "Provider smoke wall-clock cap elapsed",
          ),
        ),
      this.#manifest.caps.wallClockMillis,
    );
    timeout.unref();
    const onAbort = (): void =>
      controller.abort(
        request.abortSignal?.reason ??
          new HarnessError(
            "DEADLINE_EXCEEDED",
            "Provider smoke was cancelled",
          ),
      );
    request.abortSignal?.addEventListener("abort", onAbort, {
      once: true,
    });
    let response: ModelResponse | null = null;
    let status: ProviderCallReceipt["status"] = "failed";
    let usage = reservationUsage(this.#manifest);
    let error:
      | {
          readonly code: string;
          readonly safeDetail: string;
          readonly retryable: boolean;
        }
      | null = null;
    let appliedRuleIds: readonly string[] = [];
    try {
      const upstream = await this.#provider.generate({
        ...request,
        abortSignal: controller.signal,
      });
      const normalized = normalizedResponse(
        upstream,
        this.#manifest,
      );
      const redacted = this.#redactor.redact(
        normalized as unknown as JsonValue,
      );
      response = redacted.value as unknown as ModelResponse;
      appliedRuleIds = redacted.appliedRuleIds;
      usage = chargedUsage(
        response.usage,
        this.#manifest.provider.pricing,
      );
      status =
        usage.totalChargedTokens >
            this.#manifest.caps.totalChargedTokens ||
          usage.providerCostMicros >
            this.#manifest.caps.providerCostMicros
          ? "budget_exhausted"
          : "completed";
      if (status === "budget_exhausted") {
        error = {
          code: "BUDGET_EXHAUSTED",
          safeDetail:
            "Provider usage exceeded the frozen smoke cap",
          retryable: false,
        };
        response = null;
      }
    } catch (caught) {
      const safe = safeError(caught, this.#redactor);
      appliedRuleIds = [
        ...new Set([
          ...appliedRuleIds,
          ...safe.appliedRuleIds,
        ]),
      ].sort();
      error = {
        code: safe.code,
        safeDetail: safe.safeDetail,
        retryable: safe.retryable,
      };
      status =
        controller.signal.aborted ||
        request.abortSignal?.aborted === true
          ? "cancelled"
          : "failed";
    } finally {
      clearTimeout(timeout);
      request.abortSignal?.removeEventListener("abort", onAbort);
    }

    let responseBytes =
      response === null
        ? 0
        : canonicalBytes(
            response as unknown as JsonValue,
          ).byteLength;
    if (
      response !== null &&
      responseBytes > this.#manifest.caps.responseBytes
    ) {
      status = "budget_exhausted";
      error = {
        code: "BUDGET_EXHAUSTED",
        safeDetail:
          "Normalized provider response exceeded the frozen byte cap",
        retryable: false,
      };
      response = null;
      responseBytes = 0;
    }
    const completedAt = this.#clock.now().toISOString();
    const elapsed =
      Number(
        (this.#clock.monotonicNanos() - startedNanos) /
          1_000_000n,
      );
    if (elapsed > this.#manifest.caps.wallClockMillis) {
      status = "budget_exhausted";
      error = {
        code: "BUDGET_EXHAUSTED",
        safeDetail:
          "Provider smoke exceeded the frozen wall-clock cap",
        retryable: false,
      };
      response = null;
      responseBytes = 0;
    }
    const responseHash =
      response === null
        ? null
        : sha256(response as unknown as JsonValue);
    const core: ProviderCallReceiptCore = {
      schemaVersion: 1,
      hashDomain: "ProviderCallReceipt.v1",
      protocolId: this.#manifest.protocolId,
      providerSmokeManifestId:
        this.#manifest.providerSmokeManifestId,
      budgetFreezeId: this.#manifest.budgetFreezeId,
      phaseAccountId: this.#phaseAccountId,
      providerRequestId: request.requestId,
      modelRequestHash: this.#manifest.modelRequestHash,
      modelIdentityHash:
        this.#manifest.provider.modelIdentityHash,
      status,
      responseHash,
      responseId: response?.responseId ?? null,
      usage,
      requestBytes,
      responseBytes,
      wallClockMillis: elapsed,
      startedAt,
      completedAt,
      credentialSlotId: this.#manifest.credentialSlotId,
      egressOrigin: this.#manifest.provider.apiOrigin,
      error,
      redaction: {
        containsKnownSecrets: false,
        appliedRuleIds,
        scannerHash: this.#redactor.scannerHash,
      },
      producer: this.#signer.identity,
    };
    const body: ProviderCallReceiptBody = {
      ...core,
      providerCallReceiptId:
        `pcr-sha256:${sha256(core as unknown as JsonValue).slice(7)}`,
    };
    const receipt: ProviderCallReceipt = {
      ...body,
      attestation: this.#signer.attest(
        body as unknown as JsonValue,
      ),
    };
    return { schemaVersion: 1, receipt, response };
  }

  #verifyResult(result: ProviderProxyResult): void {
    this.#schemas.validate(
      PROVIDER_PROXY_RESULT_SCHEMA_ID,
      result as unknown as JsonValue,
    );
    verifyProviderCallReceipt({
      receipt: result.receipt,
      manifest: this.#manifest,
      expectedPhaseAccountId: this.#phaseAccountId,
      schemas: this.#schemas,
      principals: this.#principals,
    });
    assertCondition(
      (result.response === null &&
        result.receipt.responseHash === null) ||
        (result.response !== null &&
          result.receipt.responseHash ===
            sha256(result.response as unknown as JsonValue) &&
          result.receipt.responseId ===
            result.response.responseId),
      "HASH_MISMATCH",
      "Provider result response does not match its signed receipt",
    );
  }

  async #withLock<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.#queue.then(operation, operation);
    this.#queue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
}
