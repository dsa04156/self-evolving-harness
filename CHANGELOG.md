# Changelog

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
