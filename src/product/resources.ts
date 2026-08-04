import { access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { HarnessError } from "../core/errors.js";

async function bundledDirectory(input: {
  readonly directoryName: string;
  readonly sentinel: string;
  readonly environmentVariable: string;
}): Promise<string> {
  const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
  const configured = process.env[input.environmentVariable];
  const candidates = [
    ...(configured === undefined ? [] : [path.resolve(configured)]),
    path.resolve(moduleDirectory, `../../${input.directoryName}`),
    path.resolve(moduleDirectory, `../../../${input.directoryName}`),
  ];
  for (const candidate of candidates) {
    try {
      await access(path.join(candidate, input.sentinel));
      return candidate;
    } catch {
      // Source and packaged layouts have different relative depths.
    }
  }
  throw new HarnessError(
    "ARTIFACT_UNAVAILABLE",
    `Cannot locate bundled ${input.directoryName}; reinstall seh or set ${input.environmentVariable}`,
  );
}

export function bundledSchemasPath(): Promise<string> {
  return bundledDirectory({
    directoryName: "schemas",
    sentinel: "common.schema.json",
    environmentVariable: "SEH_SCHEMAS_DIR",
  });
}

export function bundledConfigsPath(): Promise<string> {
  return bundledDirectory({
    directoryName: "configs",
    sentinel: "component-type-registry.json",
    environmentVariable: "SEH_CONFIGS_DIR",
  });
}
