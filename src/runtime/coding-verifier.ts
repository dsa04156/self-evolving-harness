import { sha256, sha256Text, type JsonValue } from "../core/canonical.js";
import { asHarnessError } from "../core/errors.js";
import type { VerificationResult } from "../domain/runtime.js";
import { BubblewrapProcessRunner } from "./sandbox-process.js";
import type { TaskVerifier, VerificationInput } from "./verifier.js";

export interface CodingTaskVerifierOptions {
  readonly workspaceRoot: string;
  readonly commands: readonly string[];
  readonly timeoutMillis: number;
  readonly maxOutputBytes: number;
  readonly maxCommandBytes?: number;
  readonly secrets?: Readonly<Record<string, string>>;
}

function redact(text: string, secrets: Readonly<Record<string, string>>): string {
  let result = text;
  for (const [name, value] of Object.entries(secrets)) {
    if (value.length > 0) result = result.split(value).join(`[REDACTED:${name}]`);
  }
  return result;
}

function excerpt(value: string): string {
  const normalized = value.trim();
  if (normalized.length <= 2_000) return normalized;
  return `${normalized.slice(0, 2_000)}\n…[truncated]`;
}

export class CodingTaskVerifier implements TaskVerifier {
  public readonly verifierId = "coding-task-verifier.v1";
  public readonly verifierHash: string;
  readonly #commands: readonly string[];
  readonly #runner: BubblewrapProcessRunner;
  readonly #secrets: Readonly<Record<string, string>>;

  private constructor(
    options: CodingTaskVerifierOptions,
    runner: BubblewrapProcessRunner,
  ) {
    this.#commands = [...options.commands];
    this.#runner = runner;
    this.#secrets = options.secrets ?? {};
    this.verifierHash = sha256({
      verifier: this.verifierId,
      commands: this.#commands,
      timeoutMillis: options.timeoutMillis,
      maxOutputBytes: options.maxOutputBytes,
      maxCommandBytes: options.maxCommandBytes ?? 32 * 1024,
    });
  }

  public static async create(
    options: CodingTaskVerifierOptions,
  ): Promise<CodingTaskVerifier> {
    const runner = new BubblewrapProcessRunner(options.workspaceRoot, {
      timeoutMillis: options.timeoutMillis,
      maxOutputBytes: options.maxOutputBytes,
      maxCommandBytes: options.maxCommandBytes ?? 32 * 1024,
      environment: {},
    });
    await runner.initialize();
    return new CodingTaskVerifier(options, runner);
  }

  public async verify(input: VerificationInput): Promise<VerificationResult> {
    if (this.#commands.length === 0) {
      const status = await this.#runner.runExecutable(
        "/usr/bin/git",
        [
          "-c",
          "core.pager=cat",
          "--no-optional-locks",
          "status",
          "--porcelain=v1",
          "--untracked-files=all",
        ],
      );
      const evidence: JsonValue = {
        mode: "advisory",
        proposedAnswerHash: sha256Text(input.proposedAnswer),
        workspaceObservation: {
          gitAvailable: status.exitCode === 0,
          changedPathCount:
            status.exitCode === 0
              ? status.stdout.split("\n").filter((line) => line.length > 0).length
              : 0,
          statusHash: sha256Text(status.stdout),
        },
      };
      return {
        passed: true,
        summary:
          "Advisory verification accepted the agent's completion; no external command is configured.",
        evidence,
        retryable: false,
      };
    }

    const results: {
      command: string;
      exitCode: number | null;
      stdoutHash: string;
      stderrHash: string;
      passed: boolean;
      feedback: string;
    }[] = [];
    for (const command of this.#commands) {
      try {
        const result = await this.#runner.runShell(command);
        const stdout = redact(result.stdout, this.#secrets);
        const stderr = redact(result.stderr, this.#secrets);
        const passed = result.exitCode === 0 && result.signal === null && !result.timedOut;
        results.push({
          command,
          exitCode: result.exitCode,
          stdoutHash: sha256Text(stdout),
          stderrHash: sha256Text(stderr),
          passed,
          feedback: passed
            ? ""
            : [`$ ${command}`, `exit=${result.exitCode ?? "signal"}`, excerpt(stdout), excerpt(stderr)]
                .filter((part) => part.length > 0)
                .join("\n"),
        });
      } catch (error) {
        const failure = asHarnessError(error);
        results.push({
          command,
          exitCode: null,
          stdoutHash: sha256Text(""),
          stderrHash: sha256Text(failure.safeDetail),
          passed: false,
          feedback: `$ ${command}\n${failure.code}: ${failure.safeDetail}`,
        });
      }
    }
    const failed = results.filter((result) => !result.passed);
    return {
      passed: failed.length === 0,
      summary:
        failed.length === 0
          ? `All ${results.length} configured verification command(s) passed.`
          : `Configured verification failed:\n\n${failed.map((result) => result.feedback).join("\n\n")}`,
      evidence: {
        mode: "command",
        commandCount: results.length,
        passedCount: results.length - failed.length,
        results: results.map(({ feedback: _feedback, ...result }) => result),
      },
      retryable: failed.length > 0,
    };
  }
}
