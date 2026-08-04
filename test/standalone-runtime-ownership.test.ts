import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const repositoryRoot = path.resolve(import.meta.dirname, "..");

async function typescriptFiles(root: string): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const candidate = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...(await typescriptFiles(candidate)));
    else if (entry.isFile() && entry.name.endsWith(".ts")) files.push(candidate);
  }
  return files;
}

test("the product execution path has no external coding-harness backend dependency", async () => {
  const packageJson = JSON.parse(
    await readFile(path.join(repositoryRoot, "package.json"), "utf8"),
  ) as { dependencies?: Record<string, string> };
  const dependencyNames = Object.keys(packageJson.dependencies ?? {});
  assert.equal(
    dependencyNames.some((name) =>
      /(^|[/_-])(codex|gajae|opencode)([/_-]|$)/iu.test(name),
    ),
    false,
  );

  const roots = ["product", "runtime", "tools", "providers"].map((directory) =>
    path.join(repositoryRoot, "src", directory),
  );
  const forbidden: string[] = [];
  for (const root of roots) {
    for (const file of await typescriptFiles(root)) {
      const source = await readFile(file, "utf8");
      const executableLines = source
        .split("\n")
        .filter((line) =>
          /(?:from\s+|import\s*\(|spawn\s*\(|execFile\s*\(|runExecutable\s*\()[^\n]*(?:codex|gajae|opencode)/iu.test(
            line,
          ),
        );
      for (const line of executableLines) {
        forbidden.push(`${path.relative(repositoryRoot, file)}: ${line.trim()}`);
      }
    }
  }
  assert.deepEqual(forbidden, []);
});
