# CLI UX code-path reference

Inspected on 2026-08-03. These repositories are design references only; no source code was copied.

## OpenAI Codex

- Repository: <https://github.com/openai/codex>
- Branch / exact commit: `main` / `bb5054fe47abe73ecbbd454751066a28c89f4bb9`
- License: Apache-2.0

Observed execution path:

1. [`codex-rs/cli/src/main.rs`](https://github.com/openai/codex/blob/bb5054fe47abe73ecbbd454751066a28c89f4bb9/codex-rs/cli/src/main.rs)
   defines a multitool CLI whose missing subcommand forwards to the TUI.
2. [`codex-rs/tui/src/cli.rs`](https://github.com/openai/codex/blob/bb5054fe47abe73ecbbd454751066a28c89f4bb9/codex-rs/tui/src/cli.rs)
   accepts an optional positional `PROMPT`; this starts a session rather
   than selecting non-interactive execution.
3. `codex exec` owns the non-interactive path.
4. `codex resume` accepts an ID, `--last`, or opens a picker; `fork` is separately represented.
5. [`codex-rs/tui/src/slash_command.rs`](https://github.com/openai/codex/blob/bb5054fe47abe73ecbbd454751066a28c89f4bb9/codex-rs/tui/src/slash_command.rs)
   exposes discoverable `/new`, `/resume`, `/model`,
   `/permissions`, `/diff`, `/status`, `/compact`, and lifecycle commands.
6. [`codex-rs/tui/src/chatwidget/input_submission.rs`](https://github.com/openai/codex/blob/bb5054fe47abe73ecbbd454751066a28c89f4bb9/codex-rs/tui/src/chatwidget/input_submission.rs)
   submits messages as user-input items and keeps
   shell-command submission separate from model messages.

SEH adoption: no-command interactive launch, positional initial prompt, explicit `run`/`exec`,
session picker/ID/latest resume, model and permission visibility, and separate durable task turns.

## Gajae-Code

- Repository: <https://github.com/Yeachan-Heo/gajae-code>
- Branch / exact commit: `main` / `6e65fa94b46b878e13f35cca076332c2fc5de84c`
- License: MIT

Observed execution path:

1. [`packages/coding-agent/src/cli.ts::routeRootArgv`](https://github.com/Yeachan-Heo/gajae-code/blob/6e65fa94b46b878e13f35cca076332c2fc5de84c/packages/coding-agent/src/cli.ts)
   routes ordinary root invocation to `launch`.
2. `RootHelpCommand` in the same file treats positional messages as an interactive
   initial prompt and exposes `-p/--print` as the separate non-interactive mode.
3. The same root command exposes `--continue` and `--resume`; a value-less `gjc resume` is normalized
   to the picker intent.
4. [`packages/coding-agent/src/cli/session-picker.ts`](https://github.com/Yeachan-Heo/gajae-code/blob/6e65fa94b46b878e13f35cca076332c2fc5de84c/packages/coding-agent/src/cli/session-picker.ts)
   provides read-only session selection before the
   interactive runtime is launched.
5. [`command-controller.ts`](https://github.com/Yeachan-Heo/gajae-code/blob/6e65fa94b46b878e13f35cca076332c2fc5de84c/packages/coding-agent/src/modes/controllers/command-controller.ts)
   makes new/resume/model and
   command discovery beginner-visible.
6. [`input-controller.ts`](https://github.com/Yeachan-Heo/gajae-code/blob/6e65fa94b46b878e13f35cca076332c2fc5de84c/packages/coding-agent/src/modes/controllers/input-controller.ts)
   dispatches slash commands,
   interactive shell input, queued input, and normal agent messages through distinct paths.

SEH adoption: root-to-interactive routing, initial prompt, `-p`, continue/resume, a read-only picker,
and a compact command reference. Gajae-Code's implementation and dependencies remain external prior
art and are not runtime dependencies of SEH.

## Deliberate differences

- SEH remains an independent runtime; neither referenced CLI is invoked as an execution backend.
- A SEH interactive message creates a new immutable product-session event stream linked to its
  parent. Bounded prior turns are recorded by session ID and runtime-task hash.
- Task continuation never creates a `HarnessVersion`. Harness evolution remains a separately gated
  lifecycle with candidate isolation, evaluation, promotion, rejection, and rollback evidence.
- SEH currently uses an inline terminal shell rather than copying either project's full-screen TUI.
