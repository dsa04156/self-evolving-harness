# Reference Execution Paths

## Gajae-Code: task execution and operations

```text
CLI (`packages/coding-agent/src/main.ts`)
  → createAgentSession (`sdk/session.ts`)
    → settings/auth/model registry
    → workspace context + memory + skills + tools + system prompt
    → new Agent (`packages/agent/src/agent.ts`)
    → new AgentSession + persisted-session restoration
  → Agent prompt/run
    → runLoopBody (`packages/agent/src/agent-loop.ts`)
      → stream provider response
      → detect toolCall items
      → validate + before hooks
      → schedule/execute tool
      → after hooks + toolResult
      → append result and sample again
  → session manager / event sinks persist transcript and state
```

The operations path is separate:

```text
gjc harness operate
  → RuntimeOwner acquires lease and becomes single writer
  → submit(single-flight)
  → observe bounded signals
  → classifyRecovery
  → if destructive: persist valid vanish receipt first
  → bounded recover or block
  → validate/finalize only after explicit completion evidence
  → atomic state + append-only events/receipts
```

No inspected step creates and evaluates a new harness component version.

## Oh My OpenAgent: OpenCode adapter assembly

```text
OpenCode loads plugin
  → packages/omo-opencode/src/index.ts
  → createPluginModule()
    → load runtime configuration
    → createManagers()
    → createTools()
    → createHooks()
    → createPluginInterface()
  → return OpenCode Hooks/plugin surface
  → OpenCode owns model loop and session execution
```

The roadmap’s Core/MCP/Skills/Adapter layering is reusable design guidance, but the runtime adapter is not
an independent executor.

## OxyGent: owned MAS execution and live-prompt update

Task execution:

```text
MAS.__aenter__ / init
  → register Oxy agents, tools, LLMs, and flows
  → initialize storage, organization graph, and dynamic prompt bindings
MAS.call
  → construct OxyRequest and bind MAS
  → selected Oxy.execute
    → preprocess + trace pre-log
    → restart/replay interceptor
    → before hooks
    → bounded component retry around _execute
      → ReActAgent builds instruction + short memory + query + ReAct memory
      → OxyRequest.call(callee)
        → registry lookup + permitted-tool/permitted-Oxy check
        → clone request + call-tree/parallel metadata
        → timeout-wrapped callee.execute
      → append observations and repeat
    → after hooks + post-process + trace persistence/messages
```

Prompt update is a separate adjacent path:

```text
POST /api/prompts/optimize
  → read active prompt
  → PromptOptimizer asks a registered LLM for a rewritten prompt
  → JSON parsing + framework substring/placeholder checks
  → optional auto_apply
    → PromptManager archives current prompt version
    → increments and saves the new prompt version
    → hot-reloads bound agents
  → history API can revert old content by creating another new prompt version
```

This is meaningful prompt versioning and runtime hot-swapping. It is not the proposed outer loop:
there is no inspected multi-component candidate `HarnessVersion`, isolated held-in/held-out evaluation,
matched-budget comparison, or external promotion authority between rewrite and activation. OxyBank’s
status-triggered annotation path similarly versions training/retrieval samples rather than executable
harnesses.

## TencentDB-Agent-Memory: memory sidecar and proxy injection

Direct MemoryCore integration:

```text
host Agent completes a turn
  → TDAICore.handleTurnCommitted
  → performAutoCapture
    → CheckpointManager.captureAtomically
      → read per-session cursor
      → record authoritative L0 conversation
      → advance cursor
    → update search projection / embedding (optionally deferred)

host Agent prepares its next prompt
  → TDAICore.handleBeforeRecall
  → performAutoRecall
    → keyword, embedding, or hybrid/RRF L1 search
    → load stable L3 persona + L2 scenario context
    → enforce item/character/timeout budgets
    → return labelled stable system context and dynamic user-prefix context
  → host Agent constructs and executes the prompt
```

Proxy integration:

```text
OpenAI-compatible client request
  → MemoryProxy handler
    → authentication + model route gate
    → parse request into AgentContext
    → injection pipeline runs system/tools/user hooks
    → serialize modified request
    → forward to upstream model (with bounded route retry)
    → parse response usage
    → record capture / usage / optional skill extraction
```

Both paths are operationally useful memory integration patterns. They deliberately leave the Agent’s
model/tool loop to the caller or upstream service, and neither inspected path creates, evaluates, or
promotes a `HarnessVersion`.

## OpenAI Codex: thread/turn execution

```text
JSON-RPC thread/start or thread/resume
  → durable/live Thread
turn/start
  → turn_start_inner
  → submit user input to thread
  → run_turn
    → construct prompt from history + tools + policies
    → run_sampling_request
    → stream response items
    → ToolRouter normalizes and dispatches tool call
    → append tool result
    → follow-up sampling / compaction / stop hooks
    → assistant completion
  → item/* notifications
  → turn/completed
  → rollout JSONL + metadata/projection persistence
```

This is an inner-loop and application-server reference. No inspected event represents candidate harness
promotion.

## AHE: outer experiment loop

```text
evolve.py
  → copy seed agent into experiment workspace + git init
  → Harbor evaluates current workspace in E2B
  → compute pass/fail and cross-iteration flips
  → trace_converter normalizes traces
  → Agent Debugger creates detail/overview reports (partially closed)
  → build_evolution_query
  → NexAU evolve Agent reads reports/runs and edits workspace
  → validate + git commit/tag
  → next iteration evaluates the edited workspace
```

Best-of-N creates Git worktrees and evaluates variants before merging a winner. The main target and
evolver are both NexAU agents configured by YAML; therefore this is not a clean-room standalone runtime.

## Meta-Harness: candidate search

Text classification:

```text
meta_harness.py
  → evaluate hand-written baselines on validation
  → external Claude Code proposer reads frontier/history/traces
  → writes agents/<candidate>.py + pending_eval.json
  → import validation
  → benchmark candidates on validation
  → update frontier and evolution_summary.jsonl
  → explicit --test finalization evaluates held-out test once
```

Terminal-Bench:

```text
external Claude Code proposer
  → writes full Terminus2 subclass
  → import check + one-task smoke
  → Harbor runs 89-task search evaluation
  → update per-task and overall frontier
  → optional five-trial frontier evaluation
```

The candidate archive and hypothesis record are concrete, but the candidate surface is arbitrary Python.

## DGM: population evolution

```text
DGM_outer.py
  → load archive
  → choose parent using score and child-count pressure
  → choose a failed/stochastic/context-length improvement target
  → self_improve_step.py starts Docker
    → apply complete parent patch lineage
    → coding agent edits its own repository
    → save child patch
    → evaluate on benchmark subsets / expand evaluation
    → write child metadata
  → filter non-compiling/empty children
  → append accepted children to archive
  → write generation parent/child/archive record
```

This provides true code lineage, but it intentionally permits a much broader self-modification surface
than the proposed MVP and does not implement its immutable trust contract.

## Proposed dual path

```text
Task Execution Loop (pinned HarnessVersion)
  session start → context → provider → tool permission/execute → result
  → task verifier → complete or bounded retry/recovery

Harness Evolution Loop (never an in-place task retry)
  many immutable traces → weakness pattern → component attribution
  → bounded proposal → new content-addressed candidate
  → isolated static validation → external gate evaluation
  → canary → approve/reject; production regression → channel-scoped rollback
```
