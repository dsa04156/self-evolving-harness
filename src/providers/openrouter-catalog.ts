import { HarnessError, assertCondition } from "../core/errors.js";
import { OPENROUTER_ENDPOINT } from "../product/provider-registry.js";

type FetchTransport = typeof globalThis.fetch;

const MAX_CATALOG_BYTES = 8 * 1024 * 1024;
const MAX_CATALOG_MODELS = 2_000;

export interface OpenRouterCatalogModel {
  readonly modelId: string;
  readonly name: string;
  readonly description: string;
}

function objectValue(value: unknown, detail: string): Record<string, unknown> {
  assertCondition(
    typeof value === "object" && value !== null && !Array.isArray(value),
    "SCHEMA_INVALID",
    detail,
  );
  return value as Record<string, unknown>;
}

function safeText(value: unknown, fallback: string, maximum: number): string {
  if (typeof value !== "string") return fallback;
  const normalized = value.replace(/[\u0000-\u001f\u007f-\u009f]/gu, " ").trim();
  return normalized.length === 0 ? fallback : normalized.slice(0, maximum);
}

function tokenLabel(value: unknown): string | null {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) return null;
  if (value >= 1_000_000) return `${Math.round(value / 100_000) / 10}M ctx`;
  return `${Math.round(value / 1_000)}K ctx`;
}

function isFreeModel(model: Record<string, unknown>): boolean {
  const pricing = model["pricing"];
  if (typeof pricing !== "object" || pricing === null || Array.isArray(pricing)) return false;
  const values = pricing as Record<string, unknown>;
  return values["prompt"] === "0" && values["completion"] === "0";
}

async function boundedResponseText(response: Response): Promise<string> {
  const declaredLength = response.headers.get("content-length");
  if (declaredLength !== null && /^\d+$/u.test(declaredLength)) {
    const length = Number(declaredLength);
    assertCondition(
      Number.isSafeInteger(length) && length <= MAX_CATALOG_BYTES,
      "PAYLOAD_TOO_LARGE",
      "OpenRouter model catalog exceeds the safe response limit",
    );
  }
  assertCondition(response.body !== null, "SCHEMA_INVALID", "OpenRouter model catalog has no body");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      total += next.value.byteLength;
      if (total > MAX_CATALOG_BYTES) {
        await reader.cancel();
        throw new HarnessError(
          "PAYLOAD_TOO_LARGE",
          "OpenRouter model catalog exceeds the safe response limit",
        );
      }
      chunks.push(next.value);
    }
  } finally {
    reader.releaseLock();
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(
      Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)), total),
    );
  } catch (error) {
    throw new HarnessError("SCHEMA_INVALID", "OpenRouter model catalog is not valid UTF-8", {
      cause: error,
    });
  }
}

export async function listOpenRouterModels(
  options: {
    readonly apiKey?: string;
    readonly timeoutMillis?: number;
    readonly transport?: FetchTransport;
  } = {},
): Promise<readonly OpenRouterCatalogModel[]> {
  const transport = options.transport ?? globalThis.fetch;
  const url = new URL(`${OPENROUTER_ENDPOINT}/models`);
  url.searchParams.set("supported_parameters", "tools");
  url.searchParams.set("output_modalities", "text");
  let response: Response;
  try {
    response = await transport(url, {
      method: "GET",
      redirect: "error",
      headers: {
        accept: "application/json",
        ...(options.apiKey === undefined || options.apiKey.length === 0
          ? {}
          : { authorization: `Bearer ${options.apiKey}` }),
      },
      signal: AbortSignal.timeout(options.timeoutMillis ?? 2_500),
    });
  } catch (error) {
    throw new HarnessError(
      "ARTIFACT_UNAVAILABLE",
      "Cannot refresh the OpenRouter model catalog; showing the bundled catalog instead",
      { retryable: true, cause: error },
    );
  }
  if (!response.ok) {
    throw new HarnessError(
      "ARTIFACT_UNAVAILABLE",
      `OpenRouter model discovery failed with HTTP ${response.status}`,
      { retryable: response.status >= 500 || response.status === 429 },
    );
  }
  const text = await boundedResponseText(response);
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch (error) {
    throw new HarnessError("SCHEMA_INVALID", "OpenRouter model catalog is not valid JSON", {
      cause: error,
    });
  }
  const root = objectValue(parsed, "OpenRouter model catalog is invalid");
  const data = root["data"];
  assertCondition(Array.isArray(data), "SCHEMA_INVALID", "OpenRouter model catalog omits data");
  assertCondition(
    data.length <= MAX_CATALOG_MODELS,
    "PAYLOAD_TOO_LARGE",
    "OpenRouter model catalog contains too many models",
  );
  const models = new Map<string, OpenRouterCatalogModel>();
  for (const value of data) {
    const model = objectValue(value, "OpenRouter model entry is invalid");
    const modelId = safeText(model["id"], "", 256);
    if (modelId.length === 0 || models.has(modelId)) continue;
    const supported = model["supported_parameters"];
    if (!Array.isArray(supported) || !supported.includes("tools")) continue;
    const name = safeText(model["name"], modelId, 160);
    const details = [tokenLabel(model["context_length"]), "tools", isFreeModel(model) ? "free" : null]
      .filter((detail): detail is string => detail !== null)
      .join(" · ");
    models.set(modelId, { modelId, name, description: details });
  }
  return [...models.values()].sort((left, right) =>
    left.name.localeCompare(right.name) || left.modelId.localeCompare(right.modelId),
  );
}
