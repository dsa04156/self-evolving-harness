# CLI UX code-path reference

Initially inspected on 2026-08-03, with a provider/model-registry follow-up on 2026-08-04. These
repositories are design references only; no source code was copied.

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
7. [`builtin-registry.ts`](https://github.com/Yeachan-Heo/gajae-code/blob/6e65fa94b46b878e13f35cca076332c2fc5de84c/packages/coding-agent/src/slash-commands/builtin-registry.ts)
   routes `/model` to a dedicated selector rather than requiring users to remember an identifier.
8. [`model-selector.ts`](https://github.com/Yeachan-Heo/gajae-code/blob/6e65fa94b46b878e13f35cca076332c2fc5de84c/packages/coding-agent/src/modes/components/model-selector.ts)
   combines provider grouping, fuzzy search, current/default ordering, recent use, discovery, and
   authentication state in the model-selection surface.
9. [`models.ts`](https://github.com/Yeachan-Heo/gajae-code/blob/6e65fa94b46b878e13f35cca076332c2fc5de84c/packages/coding-agent/src/sdk/models.ts)
   projects internal model data into a safer SDK-facing representation.

SEH adoption: root-to-interactive routing, initial prompt, `-p`, continue/resume, a read-only picker,
full-screen command discovery, and a provider-scoped model picker that separates discovered models
from unverified examples. Gajae-Code's implementation and dependencies remain external prior art and
are not runtime dependencies of SEH.

## Deliberate differences

- SEH remains an independent runtime; neither referenced CLI is invoked as an execution backend.
- A SEH interactive message creates a new immutable product-session event stream linked to its
  parent. Bounded prior turns are recorded by session ID and runtime-task hash.
- Task continuation never creates a `HarnessVersion`. Harness evolution remains a separately gated
  lifecycle with candidate isolation, evaluation, promotion, rejection, and rollback evidence.
- SEH's Ink-based alternate-screen application, Evolution Core, transcript renderer, composer,
  command palette, and model catalog are original implementations with deterministic UI tests.

## Provider/model registry follow-up — 2026-08-04

This follow-up was performed because SEH's first picker exposed too few routes and kept the provider
fixed. The research-baseline commits in `source-ledger.md` remain frozen; these are newer UX and
runtime-integration observations.

### Gajae-Code

- Repository / branch / exact commit: `Yeachan-Heo/gajae-code` / `main` /
  `38e026c785968e722e5b3a1b8025cadfc54c8c84`
- License: MIT
- [`model-manager.ts`](https://github.com/Yeachan-Heo/gajae-code/blob/38e026c785968e722e5b3a1b8025cadfc54c8c84/packages/ai/src/model-manager.ts)
  merges model sources with explicit `static → models.dev → cache → dynamic` precedence and records
  whether endpoint discovery is stale or authoritative.
- [`descriptors.ts`](https://github.com/Yeachan-Heo/gajae-code/blob/38e026c785968e722e5b3a1b8025cadfc54c8c84/packages/ai/src/provider-models/descriptors.ts)
  is a provider metadata source shared by runtime discovery and catalog generation.
- [`model-selector.ts`](https://github.com/Yeachan-Heo/gajae-code/blob/38e026c785968e722e5b3a1b8025cadfc54c8c84/packages/coding-agent/src/modes/components/model-selector.ts)
  provides provider tabs, search, assignment actions, and model-state presentation instead of a
  short literal menu.

Observed fact: Gajae-Code has a broad, executable provider/catalog subsystem. Inference: SEH needed
a typed provider registry and live discovery, but not Gajae-Code's code or full compatibility layer.

### OpenCode

- Repository / branch / exact commit: `anomalyco/opencode` / `dev` /
  `7fe993879f98aa17cecc70f70d3f40d6f0f11689`
- License: MIT
- [`provider.ts`](https://github.com/anomalyco/opencode/blob/7fe993879f98aa17cecc70f70d3f40d6f0f11689/packages/core/src/plugin/provider.ts)
  registers capability-specific provider plugins, including OpenAI, Anthropic, Google, OpenRouter,
  GitHub Copilot, Bedrock, and OpenAI-compatible transports.
- [`models-dev.ts`](https://github.com/anomalyco/opencode/blob/7fe993879f98aa17cecc70f70d3f40d6f0f11689/packages/core/src/models-dev.ts)
  loads a model catalog from disk/snapshot/network, refreshes it under a cross-process lock, and
  keeps a bounded cache lifetime.
- [`dialog-select-model.tsx`](https://github.com/anomalyco/opencode/blob/7fe993879f98aa17cecc70f70d3f40d6f0f11689/packages/app/src/components/dialog-select-model.tsx)
  searches model name, ID, and provider, groups results by provider, and exposes provider connection
  and model-management actions from the selector.

Observed fact: OpenCode separates provider integration, catalog data, user visibility, and selector
presentation. Inference: a model picker should operate on `(provider, model)` identity and should not
pretend a catalog row proves credentials or entitlement.

### Oh My OpenAgent

- Repository / branch / exact commit: `code-yeongyu/oh-my-openagent` / `dev` /
  `55ea9490b70b2f2017077e3f78d4bf7db3555bc8`
- License: Sustainable Use License 1.0 with separately licensed components
- [`provider-cache.ts`](https://github.com/code-yeongyu/oh-my-openagent/blob/55ea9490b70b2f2017077e3f78d4bf7db3555bc8/packages/model-core/src/provider-cache.ts)
  defines a narrow host-facing cache contract for connected providers and model metadata.
- [`model-resolution-pipeline.ts`](https://github.com/code-yeongyu/oh-my-openagent/blob/55ea9490b70b2f2017077e3f78d4bf7db3555bc8/packages/model-core/src/model-resolution-pipeline.ts)
  resolves UI overrides, user configuration, category defaults, connected-provider fallbacks, and
  the system default with explicit provenance.

Observed fact: this package consumes the host runtime's provider/model availability rather than
owning provider transports. Inference: its resolution/provenance ideas are relevant, but SEH must
implement its own adapters because it is a standalone harness. Its license also reinforces the
clean-room, no-source-reuse decision.

### SEH adoption

- A typed provider registry now owns labels, credential slots, fixed endpoints, transports, and
  curated model metadata.
- `/model` now searches provider, display name, and exact model ID, then switches provider and model
  together.
- OpenRouter discovery projects the live public catalog to bounded, terminal-safe, tool-capable
  rows; the SEH-owned Chat Completions adapter executes selected routes.
- Catalog visibility, endpoint discovery, credential presence, and successful inference remain four
  separate facts. No catalog row is presented as proof of account access.
- No source or dependency was copied from any reference repository.

## Codex model-profile follow-up — 2026-08-04

- Repository / branch / exact commit: `openai/codex` / `main` /
  `b2dc8b3e4be4fe3a453d50e13835f707b258f15b`
- License: Apache-2.0

The complete inspected path was:

```text
models-manager/models.json
  → protocol/src/openai_models.rs::ModelPreset / ReasoningEffort
  → models-manager/src/manager.rs catalog, cache, visibility, and default resolution
  → tui/src/chatwidget/model_popups.rs model picker → reasoning picker
  → AppEvent::UpdateModel / UpdateReasoningEffort / PersistModelSelection
  → tui/src/app/config_persistence.rs
  → core turn configuration
  → core/src/client.rs reasoning_effort_for_request
  → Responses API request
```

Observed facts:

1. [`models.json`](https://github.com/openai/codex/blob/b2dc8b3e4be4fe3a453d50e13835f707b258f15b/codex-rs/models-manager/models.json)
   declares display name, description, default effort, ordered supported efforts, visibility,
   priority, service tiers, and other runtime capabilities per model. Sol defaults to `low`; Terra
   and Luna default to `medium`. Their normal single-model levels run through `max`.
2. [`openai_models.rs`](https://github.com/openai/codex/blob/b2dc8b3e4be4fe3a453d50e13835f707b258f15b/codex-rs/protocol/src/openai_models.rs)
   keeps model metadata typed in `ModelPreset`; `ReasoningEffort` is a separate value rather than a
   suffix embedded in the model ID.
3. [`model_popups.rs`](https://github.com/openai/codex/blob/b2dc8b3e4be4fe3a453d50e13835f707b258f15b/codex-rs/tui/src/chatwidget/model_popups.rs)
   opens a model picker and then a model-specific effort picker. `Max` and `Ultra` are behind a
   `More reasoning…` branch and acceptance emits separate update and persistence events.
4. [`reasoning_shortcuts.rs`](https://github.com/openai/codex/blob/b2dc8b3e4be4fe3a453d50e13835f707b258f15b/codex-rs/tui/src/chatwidget/reasoning_shortcuts.rs)
   steps only through the active model's advertised efforts and does not silently cross into the
   advanced levels.
5. [`service_tiers.rs`](https://github.com/openai/codex/blob/b2dc8b3e4be4fe3a453d50e13835f707b258f15b/codex-rs/tui/src/chatwidget/service_tiers.rs)
   and [`service_tier_resolution.rs`](https://github.com/openai/codex/blob/b2dc8b3e4be4fe3a453d50e13835f707b258f15b/codex-rs/tui/src/service_tier_resolution.rs)
   resolve speed separately from model and reasoning; the current catalog advertises `priority` as
   `Fast` on supported models.
6. [`client.rs`](https://github.com/openai/codex/blob/b2dc8b3e4be4fe3a453d50e13835f707b258f15b/codex-rs/core/src/client.rs)
   maps `Ultra` to provider-wire `Max`, while
   [`multi_agents.rs`](https://github.com/openai/codex/blob/b2dc8b3e4be4fe3a453d50e13835f707b258f15b/codex-rs/core/src/session/multi_agents.rs)
   maps the same product selection to proactive multi-agent mode. Therefore `Ultra` is not merely
   another portable API effort.

SEH adoption: a clean-room typed execution profile, two-stage `/model` picker, `/effort`, `/fast`,
model-specific validation, persisted project configuration, immutable per-session profile evidence,
and provider-wire propagation. SEH deliberately stops at `Max`; it will not label a single-model call
as `Ultra` until it owns the corresponding proactive multi-agent behavior.
