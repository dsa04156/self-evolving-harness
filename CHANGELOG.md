# Changelog

## 0.3.0 — interactive coding-agent shell

### New features

- **Direct interactive launch**: Run `seh` with no subcommand, or pass an initial prompt with
  `seh "TASK"`, to enter the coding-agent shell. Use `seh run`, `seh exec`, or `seh -p` for a
  non-interactive task.
- **Session continuation**: Resume from a numbered picker, a session ID, or the latest session with
  `seh resume`, `seh resume ID`, `seh resume --last`, and `seh continue`.
- **In-shell controls**: Inspect sessions, status, memory, verification commands, permissions, model,
  and sandboxed Git diffs without leaving the conversation. Multiline paste and fresh-thread commands
  are also available through `/paste` and `/new`.

### Improvements

- **Real conversational follow-ups**: Recent user and assistant turns now become bounded, explicitly
  untrusted context for the next prompt instead of relying only on a parent-session pointer.
- **Auditable context**: Each turn remains an immutable child session and records the runtime task
  hash plus the prior session IDs used as context. Continuing a chat is still not labelled as harness
  evolution.
- **Clearer live progress**: Model, tool, and verifier events are rendered as concise terminal status
  lines while tool arguments and secrets remain hidden.
- **Provider-neutral README**: The main product documentation now leads with the independent CLI and
  moves provider-specific setup details to the user guide.

### Breaking changes

- **Action required for scripts**: `seh "TASK"` now starts an interactive session when attached to a
  terminal. Automation should use `seh run "TASK"`, `seh exec "TASK"`, or `seh -p "TASK"`.

## 0.2.0 — user coding agent CLI and deterministic MVP completion

- Added the installable `seh` coding-agent CLI with `init`, `run`, `chat`, `sessions`, `status`,
  `resume`, `doctor`, `config`, and persistent-memory commands.
- Added a native Ollama `/api/chat` provider with model discovery and tool-call history, making local
  no-key execution the default user path.
- Bound the runtime to an existing repository while keeping configuration, sessions, evidence, and
  memory in a permission-restricted state directory outside that repository.
- Added read-only and workspace-write profiles, no-network Bubblewrap shell execution, configurable
  external verification commands, live event rendering, and interrupt handling.
- Added deterministic fake-provider product tests and mocked Ollama transport/CLI tests.
- Retained the optional environment-only OpenAI adapter; no secret is stored in product config.

- Added a managed runtime that joins the independent kernel to the operations and evidence planes.
- Completed operations endpoints for resume, validation, retirement, event projection, and artifact
  projection while retaining `{state, evidence, nextAllowedActions}` on every response.
- Added signed `DescendantRecord` schema validation, transition replay, pin inheritance, authority
  reduction, and tamper detection for subagents and backend jobs.
- Added hierarchical budget accounts so child model/tool/retry/descendant use is charged to both the
  delegated slice and shared parent account.
- Upgraded the no-key CLI demo to exercise the full managed session through retirement.
- Added end-to-end managed-runtime, descendant-signature, shared-budget, and complete operations API
  tests.
- Added a one-command release verifier and closed the root documentation, related-work, evaluation
  report, completion matrix, and paper-draft deliverables.
- Split immutable historical-publication replay from live remote continuity, so the release gate accepts
  legitimate fast-forward publications while scanning every post-corrective Git blob and path for
  credentials and environment files.

## 0.1.0 — research and trust-plane prototype

- Implemented the standalone runtime kernel, component registry, evidence plane, evolution coordinator,
  candidate worktree isolation, external evaluator, promotion/deployment audit paths, B0–B6 budget
  machinery, deterministic fault fixtures, and local multi-principal trust-plane tests.
- Preserved public-development and benchmark-governance deviations as append-only negative evidence.
