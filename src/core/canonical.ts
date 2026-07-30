import { createHash, timingSafeEqual } from "node:crypto";

import { HarnessError, assertCondition } from "./errors.js";

export type JsonPrimitive = null | boolean | number | string;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

const MAX_SAFE_IJSON_INTEGER = 9_007_199_254_740_991;

function assertUnicodeScalarString(value: string, location: string): void {
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      assertCondition(
        next >= 0xdc00 && next <= 0xdfff,
        "SCHEMA_INVALID",
        `${location} contains a lone high surrogate`,
      );
      index += 1;
      continue;
    }
    assertCondition(
      codeUnit < 0xdc00 || codeUnit > 0xdfff,
      "SCHEMA_INVALID",
      `${location} contains a lone low surrogate`,
    );
  }
}

export function assertIJson(value: unknown, location = "$"): asserts value is JsonValue {
  if (value === null || typeof value === "boolean") {
    return;
  }
  if (typeof value === "string") {
    assertUnicodeScalarString(value, location);
    return;
  }
  if (typeof value === "number") {
    assertCondition(Number.isFinite(value), "SCHEMA_INVALID", `${location} is not finite`);
    assertCondition(!Object.is(value, -0), "SCHEMA_INVALID", `${location} is negative zero`);
    assertCondition(
      Number.isInteger(value),
      "SCHEMA_INVALID",
      `${location} is outside the integer-only canonical profile`,
    );
    assertCondition(
      Math.abs(value) <= MAX_SAFE_IJSON_INTEGER,
      "SCHEMA_INVALID",
      `${location} exceeds the I-JSON integer range`,
    );
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      assertIJson(item, `${location}[${index}]`);
    });
    return;
  }
  assertCondition(
    typeof value === "object",
    "SCHEMA_INVALID",
    `${location} is not a JSON value`,
  );
  const record = value as Record<string, unknown>;
  for (const [key, item] of Object.entries(record)) {
    assertUnicodeScalarString(key, `${location} key`);
    assertIJson(item, `${location}.${key}`);
  }
}

function canonicalizeUnchecked(value: JsonValue): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalizeUnchecked(item)).join(",")}]`;
  }
  const keys = Object.keys(value).sort();
  return `{${keys
    .map((key) => `${JSON.stringify(key)}:${canonicalizeUnchecked(value[key]!)}`)
    .join(",")}}`;
}

export function canonicalize(value: unknown): string {
  assertIJson(value);
  return canonicalizeUnchecked(value);
}

export function canonicalBytes(value: unknown): Buffer {
  return Buffer.from(canonicalize(value), "utf8");
}

export function sha256Bytes(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function sha256(value: unknown): `sha256:${string}` {
  return `sha256:${sha256Bytes(canonicalBytes(value))}`;
}

export function sha256Text(value: string): `sha256:${string}` {
  return `sha256:${sha256Bytes(Buffer.from(value, "utf8"))}`;
}

export function contentId(
  prefix:
    | "ci-sha256"
    | "cm-sha256"
    | "hv-sha256"
    | "protocol-sha256"
    | "ctr-sha256"
    | "rss-sha256",
  identity: unknown,
): string {
  return `${prefix}:${sha256Bytes(canonicalBytes(identity))}`;
}

export function constantTimeEqual(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left, "utf8");
  const rightBytes = Buffer.from(right, "utf8");
  if (leftBytes.length !== rightBytes.length) {
    return false;
  }
  return timingSafeEqual(leftBytes, rightBytes);
}

export function normalizeText(value: string): string {
  assertCondition(!value.startsWith("\uFEFF"), "SCHEMA_INVALID", "BOM is forbidden");
  assertCondition(!value.includes("\0"), "SCHEMA_INVALID", "NUL is forbidden");
  const normalizedNewlines = value.replace(/\r\n?/gu, "\n");
  const normalized = normalizedNewlines.normalize("NFC");
  for (const character of normalized) {
    const point = character.codePointAt(0)!;
    const forbiddenControl =
      (point >= 0 && point <= 0x1f && point !== 0x09 && point !== 0x0a) ||
      (point >= 0x7f && point <= 0x9f);
    const nonCharacter =
      (point >= 0xfdd0 && point <= 0xfdef) || (point & 0xffff) === 0xfffe || (point & 0xffff) === 0xffff;
    assertCondition(!forbiddenControl, "SCHEMA_INVALID", "Forbidden control character");
    assertCondition(!nonCharacter, "SCHEMA_INVALID", "Unicode noncharacter is forbidden");
  }
  assertUnicodeScalarString(normalized, "text");
  return normalized;
}

class StrictJsonParser {
  readonly #source: string;
  #offset = 0;

  public constructor(source: string) {
    this.#source = source;
  }

  public parse(): JsonValue {
    this.#skipWhitespace();
    const value = this.#parseValue("$");
    this.#skipWhitespace();
    assertCondition(
      this.#offset === this.#source.length,
      "SCHEMA_INVALID",
      `Trailing JSON bytes at offset ${this.#offset}`,
    );
    assertIJson(value);
    return value;
  }

  #parseValue(location: string): JsonValue {
    const character = this.#source[this.#offset];
    if (character === "{") return this.#parseObject(location);
    if (character === "[") return this.#parseArray(location);
    if (character === "\"") return this.#parseString(location);
    if (character === "t") return this.#parseLiteral("true", true);
    if (character === "f") return this.#parseLiteral("false", false);
    if (character === "n") return this.#parseLiteral("null", null);
    if (character === "-" || (character !== undefined && character >= "0" && character <= "9")) {
      return this.#parseNumber(location);
    }
    throw new HarnessError(
      "SCHEMA_INVALID",
      `Unexpected JSON token at offset ${this.#offset}`,
    );
  }

  #parseObject(location: string): { [key: string]: JsonValue } {
    this.#offset += 1;
    this.#skipWhitespace();
    const result: { [key: string]: JsonValue } = {};
    const keys = new Set<string>();
    if (this.#source[this.#offset] === "}") {
      this.#offset += 1;
      return result;
    }
    while (true) {
      assertCondition(
        this.#source[this.#offset] === "\"",
        "SCHEMA_INVALID",
        `Object key expected at offset ${this.#offset}`,
      );
      const key = this.#parseString(`${location} key`);
      assertCondition(!keys.has(key), "SCHEMA_INVALID", `Duplicate JSON key ${key}`);
      keys.add(key);
      this.#skipWhitespace();
      assertCondition(
        this.#source[this.#offset] === ":",
        "SCHEMA_INVALID",
        `Missing colon after ${key}`,
      );
      this.#offset += 1;
      this.#skipWhitespace();
      Object.defineProperty(result, key, {
        value: this.#parseValue(`${location}.${key}`),
        enumerable: true,
        configurable: true,
        writable: true,
      });
      this.#skipWhitespace();
      const separator = this.#source[this.#offset];
      if (separator === "}") {
        this.#offset += 1;
        return result;
      }
      assertCondition(separator === ",", "SCHEMA_INVALID", "Object comma expected");
      this.#offset += 1;
      this.#skipWhitespace();
    }
  }

  #parseArray(location: string): JsonValue[] {
    this.#offset += 1;
    this.#skipWhitespace();
    const result: JsonValue[] = [];
    if (this.#source[this.#offset] === "]") {
      this.#offset += 1;
      return result;
    }
    while (true) {
      result.push(this.#parseValue(`${location}[${result.length}]`));
      this.#skipWhitespace();
      const separator = this.#source[this.#offset];
      if (separator === "]") {
        this.#offset += 1;
        return result;
      }
      assertCondition(separator === ",", "SCHEMA_INVALID", "Array comma expected");
      this.#offset += 1;
      this.#skipWhitespace();
    }
  }

  #parseString(location: string): string {
    const start = this.#offset;
    this.#offset += 1;
    let escaped = false;
    while (this.#offset < this.#source.length) {
      const character = this.#source[this.#offset]!;
      if (!escaped && character === "\"") {
        this.#offset += 1;
        const token = this.#source.slice(start, this.#offset);
        let parsed: unknown;
        try {
          parsed = JSON.parse(token);
        } catch (error) {
          throw new HarnessError("SCHEMA_INVALID", "Invalid JSON string", { cause: error });
        }
        assertCondition(typeof parsed === "string", "SCHEMA_INVALID", "String expected");
        assertUnicodeScalarString(parsed, location);
        return parsed;
      }
      if (!escaped && character.charCodeAt(0) <= 0x1f) {
        throw new HarnessError("SCHEMA_INVALID", "Unescaped control in JSON string");
      }
      if (!escaped && character === "\\") {
        escaped = true;
      } else {
        escaped = false;
      }
      this.#offset += 1;
    }
    throw new HarnessError("SCHEMA_INVALID", "Unterminated JSON string");
  }

  #parseNumber(location: string): number {
    const remainder = this.#source.slice(this.#offset);
    const match = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/u.exec(remainder);
    assertCondition(match !== null, "SCHEMA_INVALID", `Invalid number at ${location}`);
    this.#offset += match[0].length;
    const number = Number(match[0]);
    assertIJson(number, location);
    return number;
  }

  #parseLiteral<T extends JsonPrimitive>(token: string, value: T): T {
    assertCondition(
      this.#source.startsWith(token, this.#offset),
      "SCHEMA_INVALID",
      `Invalid literal at offset ${this.#offset}`,
    );
    this.#offset += token.length;
    return value;
  }

  #skipWhitespace(): void {
    while (
      this.#source[this.#offset] === " " ||
      this.#source[this.#offset] === "\t" ||
      this.#source[this.#offset] === "\n" ||
      this.#source[this.#offset] === "\r"
    ) {
      this.#offset += 1;
    }
  }
}

export function parseStrictJson(source: string): JsonValue {
  return new StrictJsonParser(source).parse();
}

export function parseCanonicalJson(source: string): JsonValue {
  const value = parseStrictJson(source);
  assertCondition(
    canonicalize(value) === source,
    "SCHEMA_INVALID",
    "Input is not canonical JSON",
  );
  return value;
}
