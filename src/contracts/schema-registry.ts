import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

import addFormatsModule from "ajv-formats";
import { Ajv2020, type ErrorObject, type ValidateFunction } from "ajv/dist/2020.js";

import { parseStrictJson, type JsonValue } from "../core/canonical.js";
import { HarnessError, assertCondition } from "../core/errors.js";

export const SCHEMA_BASE_URL = "https://self-evolving-harness.local/schemas/";

interface JsonSchema {
  readonly $id: string;
  readonly [key: string]: JsonValue;
}

function isJsonSchema(value: JsonValue): value is JsonSchema {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    typeof value["$id"] === "string"
  );
}

async function listJsonFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const candidate = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listJsonFiles(candidate)));
    } else if (entry.isFile() && entry.name.endsWith(".schema.json")) {
      files.push(candidate);
    }
  }
  return files;
}

function formatErrors(errors: ErrorObject[] | null | undefined): string {
  if (errors === null || errors === undefined || errors.length === 0) {
    return "unknown schema validation failure";
  }
  return errors
    .map((error) => `${error.instancePath || "$"} ${error.message ?? "is invalid"}`)
    .join("; ");
}

export class SchemaRegistry {
  readonly #ajv: Ajv2020;
  readonly #schemas = new Map<string, JsonSchema>();
  readonly #validators = new Map<string, ValidateFunction>();

  private constructor() {
    this.#ajv = new Ajv2020({
      allErrors: true,
      allowUnionTypes: false,
      coerceTypes: false,
      removeAdditional: false,
      strict: true,
      strictRequired: false,
      strictTypes: false,
      useDefaults: false,
      validateFormats: true,
    });
    const addFormats = addFormatsModule as unknown as (ajv: Ajv2020) => Ajv2020;
    addFormats(this.#ajv);
  }

  public static async load(schemaRoot: string): Promise<SchemaRegistry> {
    const registry = new SchemaRegistry();
    const resolvedRoot = path.resolve(schemaRoot);
    const files = await listJsonFiles(resolvedRoot);
    assertCondition(files.length > 0, "SCHEMA_INVALID", "No JSON schemas were found");

    for (const file of files) {
      const source = await readFile(file, "utf8");
      const schema = parseStrictJson(source);
      assertCondition(isJsonSchema(schema), "SCHEMA_INVALID", `${file} has no $id`);
      assertCondition(
        schema.$id.startsWith(SCHEMA_BASE_URL),
        "SCHEMA_INVALID",
        `${file} has an untrusted schema identifier`,
      );
      assertCondition(
        !registry.#schemas.has(schema.$id),
        "SCHEMA_INVALID",
        `Duplicate schema identifier ${schema.$id}`,
      );
      registry.#schemas.set(schema.$id, schema);
    }

    for (const schema of registry.#schemas.values()) {
      registry.#ajv.addSchema(schema, schema.$id);
    }
    for (const schemaId of registry.#schemas.keys()) {
      const validator = registry.#ajv.getSchema(schemaId);
      assertCondition(
        validator !== undefined,
        "SCHEMA_INVALID",
        `Schema could not be compiled: ${schemaId}`,
      );
      registry.#validators.set(schemaId, validator);
    }
    return registry;
  }

  public get schemaIds(): readonly string[] {
    return [...this.#schemas.keys()].sort();
  }

  public has(schemaId: string): boolean {
    return this.#schemas.has(schemaId);
  }

  public validate<T extends JsonValue>(schemaId: string, value: JsonValue): T {
    const validator = this.#validators.get(schemaId);
    if (validator === undefined) {
      throw new HarnessError("SCHEMA_INVALID", `Unknown schema ${schemaId}`);
    }
    if (!validator(value)) {
      throw new HarnessError("SCHEMA_INVALID", formatErrors(validator.errors));
    }
    return value as T;
  }

  public assertAllCompiled(): void {
    for (const [schemaId, validator] of this.#validators) {
      if (typeof validator !== "function") {
        throw new HarnessError("SCHEMA_INVALID", `Invalid validator for ${schemaId}`);
      }
    }
  }
}
