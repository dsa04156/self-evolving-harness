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

async function failingCli(
  args: readonly string[],
  stateRoot: string,
): Promise<{ stdout: string; stderr: string; code: number }> {
  try {
    await cli(args, stateRoot);
    assert.fail("CLI was expected to fail");
  } catch (error) {
    const failure = error as { stdout?: string; stderr?: string; code?: number };
    return {
      stdout: failure.stdout ?? "",
      stderr: failure.stderr ?? "",
      code: failure.code ?? -1,
    };
  }
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
  assert.equal(version.stdout, "0.9.0\n");
});

test("product CLI generates native shell completion scripts", async () => {
  const stateRoot = path.join(os.tmpdir(), "seh-product-cli-completion-state");
  const bash = await cli(["completion", "bash"], stateRoot);
  assert.match(bash.stdout, /complete -F _seh_completion seh/u);
  assert.match(bash.stdout, /openai openrouter ollama/u);
  assert.match(bash.stdout, /auto none minimal low medium high xhigh max/u);
  assert.match(bash.stdout, /parallel-research/u);
  assert.match(bash.stdout, /fork thread/u);
  assert.match(bash.stdout, /models skills tools/u);
  assert.match(bash.stdout, /--json/u);
  assert.match(bash.stdout, /--search --limit --live/u);
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

test("global options route to structured doctor and discovery commands", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "seh-product-discovery-"));
  const workspace = path.join(root, "workspace");
  const stateRoot = path.join(root, "state");
  await mkdir(workspace, { recursive: true });
  t.after(async () => rm(root, { recursive: true, force: true }));

  const doctorFailure = await failingCli(
    ["--json", "--workspace", workspace, "doctor"],
    stateRoot,
  );
  assert.equal(doctorFailure.code, 2);
  assert.equal(doctorFailure.stderr, "");
  const doctor = JSON.parse(doctorFailure.stdout) as {
    schemaVersion: number;
    ok: boolean;
    provider: unknown;
    checks: { id: string; status: string }[];
    nextSteps: string[];
  };
  assert.equal(doctor.schemaVersion, 1);
  assert.equal(doctor.ok, false);
  assert.equal(doctor.provider, null);
  assert.ok(doctor.checks.some((check) => check.id === "config" && check.status === "fail"));
  assert.ok(doctor.nextSteps.some((step) => step.includes("seh init")));

  const modelsResult = await cli(
    [
      "--json",
      "--workspace",
      workspace,
      "models",
      "--provider",
      "openai",
      "--search",
      "gpt-5.6",
      "--limit",
      "2",
    ],
    stateRoot,
  );
  const models = JSON.parse(modelsResult.stdout) as {
    ok: boolean;
    configured: boolean;
    count: number;
    models: { provider: string; modelId: string; source: string; reasoning: { supportedEfforts: string[] } }[];
  };
  assert.equal(models.ok, true);
  assert.equal(models.configured, false);
  assert.equal(models.count, 2);
  assert.ok(models.models.every((model) => model.provider === "openai"));
  assert.ok(models.models.every((model) => model.source === "example"));
  assert.ok(models.models.some((model) => model.reasoning.supportedEfforts.includes("xhigh")));

  const skills = JSON.parse(
    (await cli(["--json", "skills", "--workspace", workspace, "--read-only"], stateRoot)).stdout,
  ) as { permissionMode: string; skills: { skillId: string }[] };
  assert.equal(skills.permissionMode, "read-only");
  assert.ok(skills.skills.some((skill) => skill.skillId === "debug"));

  const tools = JSON.parse(
    (await cli(["--json", "tools", "--workspace", workspace, "--read-only"], stateRoot)).stdout,
  ) as { permissionMode: string; tools: { toolId: string }[] };
  assert.equal(tools.permissionMode, "read-only");
  assert.ok(tools.tools.some((tool) => tool.toolId === "filesystem.read"));
  assert.ok(!tools.tools.some((tool) => tool.toolId === "filesystem.write"));

  const initialized = JSON.parse(
    (await cli(["--json", "init", "--workspace", workspace, "--read-only"], stateRoot)).stdout,
  ) as {
    schemaVersion: number;
    ok: boolean;
    permissionMode: string;
    credentialEnvironmentVariable: string | null;
  };
  assert.equal(initialized.schemaVersion, 1);
  assert.equal(initialized.ok, true);
  assert.equal(initialized.permissionMode, "read-only");
  assert.equal(initialized.credentialEnvironmentVariable, null);
});

test("JSON mode emits a stable machine-readable error envelope", async () => {
  const stateRoot = path.join(os.tmpdir(), "seh-product-json-error-state");
  const failure = await failingCli(
    ["--json", "models", "--provider", "not-a-provider"],
    stateRoot,
  );
  assert.equal(failure.code, 1);
  assert.equal(failure.stderr, "");
  const payload = JSON.parse(failure.stdout) as {
    schemaVersion: number;
    ok: boolean;
    error: { code: string; detail: string; retryable: boolean };
  };
  assert.equal(payload.schemaVersion, 1);
  assert.equal(payload.ok, false);
  assert.equal(payload.error.code, "SCHEMA_INVALID");
  assert.match(payload.error.detail, /provider/u);
  assert.equal(payload.error.retryable, false);
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
