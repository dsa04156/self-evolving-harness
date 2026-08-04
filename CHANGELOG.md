# Changelog

## 0.5.0 — multi-provider model registry

### New features

- **Provider-aware `/model` registry**: One searchable overlay now switches both provider and model.
  Its first screen mixes useful OpenAI, OpenRouter, and local examples instead of trapping users in
  the active provider.
- **250+ live model routes**: The picker refreshes OpenRouter's public catalog and includes only
  bounded text-output entries that advertise tool calling. Provider, display name, and exact model
  ID are all searchable.
- **Executable OpenRouter adapter**: Added a native Chat Completions transport with tool-call history,
  usage accounting, cancellation, safe errors, and SEH-owned tool execution. It does not delegate
  the agent loop to an external harness.
- **Central provider registry**: Provider metadata, credential slots, endpoints, curated models, and
  transport kinds now have one typed source of truth.

### Security and correctness

- OpenRouter credential egress is pinned to `https://openrouter.ai/api/v1`; alternate endpoints and
  credential-bearing URLs fail closed.
- Live catalog fields are size-bounded and terminal-control characters are removed before display.
- Provider-state replay is provider-bound, and forged cross-provider history is rejected.
- Interactive provider changes apply only to the next newly created task session; prior provider-native
  assistant/tool envelopes are never replayed across that boundary.
- API keys remain environment-only and are excluded from config, sessions, events, and memory.

## 0.4.0 — full-screen terminal UX release

### New features

- **Alternate-screen application**: `seh` now owns a full terminal screen with a fixed header,
  scrollable transcript, activity line, command overlays, multiline composer, and clean restoration
  of the original terminal on exit.
- **Workspace home screen**: The structured dashboard shows the workspace,
  model, authority profile, verifier state, recent threads, and an animated dual-loop Evolution Core
  over the immutable-trust boundary.
- **Live slash-command palette**: Typing `/` immediately opens searchable command discovery with
  descriptions and argument hints. Use arrow keys to navigate, `Tab` to complete, and `Enter` to
  choose.
- **Real multiline editing**: Added bracketed paste, `Shift+Enter` newlines, prompt history,
  Unicode-wide cursor positioning, Home/End, deletion, `Ctrl-A/E/U/K/L`, clear-on-`Ctrl-C`,
  exit-on-`Ctrl-D`, transcript paging, and palette dismissal with Escape.
- **Native shell completion**: `seh completion bash|zsh|fish` generates completion for commands,
  common flags, providers, memory actions, and workspace paths.
- **Response evidence panel**: Final answers now end with a compact lifecycle, verification, token,
  tool-call, and session summary.
- **Searchable model picker**: `/model` now orders the current model, provider-discovered models,
  curated provider examples, and an exact-ID entry in one keyboard-searchable overlay. Example
  entries never claim installation or account entitlement.
- **Line-level transcript paging**: Long answers wrap into terminal-width rows, so paging no longer
  skips an entire response card or hides its tail.

### Improvements

- **Product-first presentation**: Added a distinct visual identity, an accurate terminal UX preview,
  one-line GitHub installation, a CI workflow, and a rewritten product-oriented README.
- **Installable Git dependency**: The package now builds during Git-based npm installation, so the
  tracked `seh` launcher works without a manual checkout build.
- **Consistent command discovery**: Unknown slash commands point back to the live palette, and the
  interactive guide documents the same keyboard behavior as the runtime.

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
