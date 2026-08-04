import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import test from "node:test";

const execute = promisify(execFile);
const repositoryRoot = path.resolve(import.meta.dirname, "..");

async function cli(
  args: readonly string[],
  stateRoot: string,
): Promise<{ stdout: string; stderr: string }> {
  return execute(
    process.execPath,
    ["--import", "tsx", "src/cli.ts", ...args],
    {
      cwd: repositoryRoot,
      env: { ...process.env, SEH_STATE_DIR: stateRoot },
      maxBuffer: 2 * 1024 * 1024,
    },
  );
}

test("installed-style CLI initializes config and manages operator memory", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "seh-product-cli-"));
  const workspace = path.join(root, "workspace");
  const stateRoot = path.join(root, "state");
  await mkdir(workspace, { recursive: true });
  t.after(async () => rm(root, { recursive: true, force: true }));

  const initialized = await cli(
    ["init", "--workspace", workspace, "--model", "test-coder", "--read-only"],
    stateRoot,
  );
  assert.match(initialized.stdout, /Initialized Self-Evolving Harness/u);
  assert.match(initialized.stdout, /Permissions: read-only/u);

  const configuration = await cli(["config", "--workspace", workspace], stateRoot);
  const parsed = JSON.parse(configuration.stdout) as {
    provider: { model: string };
    permissionMode: string;
    configFile: string;
  };
  assert.equal(parsed.provider.model, "test-coder");
  assert.equal(parsed.permissionMode, "read-only");
  assert.ok(parsed.configFile.startsWith(stateRoot));
  assert.ok(!parsed.configFile.startsWith(workspace));

  const configuredDescendants = await cli(
    ["config", "--workspace", workspace, "--max-descendants", "2"],
    stateRoot,
  );
  const descendantConfig = JSON.parse(configuredDescendants.stdout) as {
    budget: { maxDescendants: number };
  };
  assert.equal(descendantConfig.budget.maxDescendants, 2);
  const persistedConfiguration = await cli(["config", "--workspace", workspace], stateRoot);
  assert.equal(
    (JSON.parse(persistedConfiguration.stdout) as { budget: { maxDescendants: number } }).budget.maxDescendants,
    2,
  );

  await cli(
    [
      "memory",
      "add",
      "--workspace",
      workspace,
      "--namespace",
      "project_facts",
      "Use npm test",
    ],
    stateRoot,
  );
  const memory = await cli(["memory", "list", "--workspace", workspace], stateRoot);
  assert.match(memory.stdout, /operator_approved/u);
  assert.match(memory.stdout, /Use npm test/u);

  const sessions = await cli(["sessions", "--workspace", workspace], stateRoot);
  assert.equal(sessions.stdout, "No sessions.\n");
  const harness = await cli(["harness", "--workspace", workspace], stateRoot);
  assert.match(harness.stdout, /No HarnessVersion/u);
  const evolution = await cli(["evolution", "--workspace", workspace], stateRoot);
  assert.match(evolution.stdout, /No task traces/u);
});

test("product CLI exposes top-level and command-local help plus a version", async () => {
  const stateRoot = path.join(os.tmpdir(), "seh-product-cli-unused-state");
  const help = await cli(["run", "--help"], stateRoot);
  assert.match(help.stdout, /seh run \[OPTIONS\]/u);
  const version = await cli(["--version"], stateRoot);
  assert.equal(version.stdout, "0.7.0\n");
});

test("product CLI generates native shell completion scripts", async () => {
  const stateRoot = path.join(os.tmpdir(), "seh-product-cli-completion-state");
  const bash = await cli(["completion", "bash"], stateRoot);
  assert.match(bash.stdout, /complete -F _seh_completion seh/u);
  assert.match(bash.stdout, /openai openrouter ollama/u);
  assert.match(bash.stdout, /auto none minimal low medium high xhigh max/u);
  assert.match(bash.stdout, /parallel-research/u);
  const zsh = await cli(["completion", "zsh"], stateRoot);
  assert.match(zsh.stdout, /#compdef seh/u);
  const fish = await cli(["completion", "fish"], stateRoot);
  assert.match(fish.stdout, /complete -c seh/u);
});

test("product CLI persists a model-specific reasoning profile and Fast tier", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "seh-product-profile-"));
  const workspace = path.join(root, "workspace");
  const stateRoot = path.join(root, "state");
  await mkdir(workspace, { recursive: true });
  t.after(async () => rm(root, { recursive: true, force: true }));

  await cli(
    [
      "init",
      "--workspace",
      workspace,
      "--provider",
      "openai",
      "--model",
      "gpt-5.6-sol",
      "--effort",
      "xhigh",
      "--fast",
    ],
    stateRoot,
  );

  const configuration = await cli(["config", "--workspace", workspace], stateRoot);
  const parsed = JSON.parse(configuration.stdout) as {
    provider: {
      kind: string;
      model: string;
      reasoningEffort: string | null;
      serviceTier?: string;
    };
  };
  assert.deepEqual(parsed.provider, {
    kind: "openai",
    model: "gpt-5.6-sol",
    reasoningEffort: "xhigh",
    serviceTier: "priority",
  });
});

test("product CLI rejects authority state inside the writable workspace", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "seh-product-state-boundary-"));
  const workspace = path.join(root, "workspace");
  await mkdir(workspace, { recursive: true });
  t.after(async () => rm(root, { recursive: true, force: true }));
  await assert.rejects(
    () => cli(["init", "--workspace", workspace], path.join(workspace, ".seh-state")),
    (error: unknown) => {
      const failure = error as { stderr?: string };
      return failure.stderr?.includes("state directory must be outside") === true;
    },
  );
});
