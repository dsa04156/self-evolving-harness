# Source Ledger

Status: Gate 1 evidence draft  
Research cut-off: 2026-08-03 (Asia/Seoul); non-baseline provider/model UX follow-up: 2026-08-04
Method: public sources were cloned or opened read-only. README claims are recorded as claims unless a
corresponding execution path was found in source. `Observed fact` and `Inference` are intentionally
separate.

## Status vocabulary

- `implemented`: an executable code path was found.
- `partial`: some of the claimed path is public and executable, but an important dependency or stage is
  absent, external, or not inspectable.
- `documented-only`: the source describes a mechanism but no implementation was found in the inspected
  artifact.
- `unknown`: the available evidence is insufficient.

## S1 — Gajae-Code

CLI/TUI behavior was re-inspected at a newer exact SHA on 2026-08-03; see
[`cli-ux-reference.md`](cli-ux-reference.md). The research-baseline snapshot below remains pinned.

- Repository: <https://github.com/Yeachan-Heo/gajae-code>
- Branch / commit: `main` / `8778760cf924246ab86e4c6c3fda26da8a572cd8`
- Inspected: 2026-07-30
- License: MIT
- Reuse decision: concepts and interfaces may inform a clean-room implementation; no source will be copied.

| File / section | Observed fact | Inference | Status |
|---|---|---|---|
| `packages/coding-agent/src/main.ts`; `packages/coding-agent/src/sdk/session.ts:1041` | CLI construction reaches `createAgentSession`; the SDK assembles settings, provider/model registry, workspace context, tools, skills, prompt, persistence, and then constructs `Agent` and `AgentSession`. | Gajae-Code owns a runtime kernel rather than delegating task execution to another coding harness. | implemented |
| `packages/agent/src/agent-loop.ts:1256,2103` | `runLoopBody` streams model output, detects tool calls, validates arguments, runs before/after hooks, schedules calls, and appends tool results for another model step. | This is the relevant inner-loop reference, not its README-level feature list. | implemented |
| `packages/coding-agent/src/harness-control-plane/types.ts` | The control plane defines session lifecycles, bounded observed signals, recovery classifications, retry budgets, and a universal `{state,evidence,nextAllowedActions}` response. | The forcing-function response is useful for an operations API, but it describes operated sessions, not evolving harness versions. | implemented |
| `state-machine.ts`, `classifier.ts`, `operate.ts` | State transitions and recovery classification are deterministic; `operate` executes bounded observe/classify/recover cycles and requires explicit completion before finalization. | Recovery is task/session continuity and must not be relabelled as harness evolution. | implemented |
| `storage.ts`, `receipts.ts`, `owner.ts` | State is written atomically; events and receipt indexes are append-only; receipt contents are hashed; a lease-holding runtime owner is the single writer. | These are strong patterns for an evidence and operations plane, but a hash alone is not a signature or hostile-principal isolation. | implemented |
| inspected control-plane, agent, and SDK paths | No `HarnessVersion` lifecycle, candidate evaluation gate, component mutation registry, or promote/reject lineage was found in the inspected execution path. | The defensible gap is first-class harness evolution integrated with—not substituted for—the runtime and operations plane. | unknown for the whole repository; absent in inspected path |

Permanent code references:
[session construction](https://github.com/Yeachan-Heo/gajae-code/blob/8778760cf924246ab86e4c6c3fda26da8a572cd8/packages/coding-agent/src/sdk/session.ts),
[agent loop](https://github.com/Yeachan-Heo/gajae-code/blob/8778760cf924246ab86e4c6c3fda26da8a572cd8/packages/agent/src/agent-loop.ts),
[control-plane types](https://github.com/Yeachan-Heo/gajae-code/blob/8778760cf924246ab86e4c6c3fda26da8a572cd8/packages/coding-agent/src/harness-control-plane/types.ts),
[operate](https://github.com/Yeachan-Heo/gajae-code/blob/8778760cf924246ab86e4c6c3fda26da8a572cd8/packages/coding-agent/src/harness-control-plane/operate.ts).

## S2 — Oh My OpenAgent

- Repository: <https://github.com/code-yeongyu/oh-my-openagent>
- Branch / commit: `dev` / `258fab04159c0d628d7cc4c811e2907aee1cd0a1`
- Inspected: 2026-07-30
- License: Sustainable Use License 1.0, with separately licensed third-party portions
- Reuse decision: no source reuse; the default license is source-available and restricts commercial use
  and redistribution.

| File / section | Observed fact | Inference | Status |
|---|---|---|---|
| `ROADMAP.md:25-95` | The planned dependency direction is Pure TypeScript Core → MCP / Skills → runtime-specific Adapters → Platform leaves, with an explicit refusal to build a grand unified plugin API. | Capability-specific seams are preferable to a premature abstraction that erases different runtime semantics. | documented and partially implemented |
| `packages/omo-opencode/src/index.ts` | The package exports a plugin module created by `createPluginModule`; it does not create a model provider or solver loop. | The OpenCode edition depends on the host runtime. | implemented |
| `packages/omo-opencode/src/testing/create-plugin-module.ts:159-316` | Server initialization loads configuration and then wires managers, tools, hooks, and an OpenCode plugin interface. | The reusable parts are useful prior art for skills/hooks/tools, but this path is an adapter, not a standalone kernel. | implemented |
| `README.md:116-117` and `packages/omo-codex/` | The “Light” edition intentionally relies on Codex’s own orchestration surface. | Neither edition is the independent execution architecture required here. | implemented/documented |

Permanent code references:
[roadmap](https://github.com/code-yeongyu/oh-my-openagent/blob/258fab04159c0d628d7cc4c811e2907aee1cd0a1/ROADMAP.md),
[OpenCode entry](https://github.com/code-yeongyu/oh-my-openagent/blob/258fab04159c0d628d7cc4c811e2907aee1cd0a1/packages/omo-opencode/src/index.ts),
[plugin assembly](https://github.com/code-yeongyu/oh-my-openagent/blob/258fab04159c0d628d7cc4c811e2907aee1cd0a1/packages/omo-opencode/src/testing/create-plugin-module.ts).

## S3 — OpenAI Codex

CLI/TUI behavior was re-inspected at a newer exact SHA on 2026-08-03; see
[`cli-ux-reference.md`](cli-ux-reference.md). The research-baseline snapshot below remains pinned.

- Repository: <https://github.com/openai/codex>
- Branch / commit: `main` / `6219b7c40fc9c702c0aef9964e72b492558f60e4`
- Inspected: 2026-07-30
- License: Apache-2.0
- Reuse decision: architectural comparison only; the MVP will use a clean-room implementation.

| File / section | Observed fact | Inference | Status |
|---|---|---|---|
| `codex-rs/app-server/README.md:70-83` | App-server models conversation as Thread → Turn → Item and streams `item/*` and `turn/completed` notifications. | This is a mature external event contract for runtime clients, not a harness-evolution protocol. | implemented |
| `app-server/src/request_processors/turn_processor.rs` | `turn_start_inner` resolves turn settings and permissions, builds user input, and submits it to the thread. | Permission/sandbox selection belongs at the turn/session boundary and should be pinned in runtime evidence. | implemented |
| `core/src/session/turn.rs:153+` | `run_turn` builds prompt context, calls the model, follows tool calls with tool outputs, handles compaction, and ends when no follow-up is required. | Codex directly owns its inner agent loop. | implemented |
| `core/src/tools/router.rs`; `parallel.rs` | Response items are normalized into tool calls and dispatched through a registry with parallel scheduling support. | Tool descriptions, routing, and implementations should be distinct component types. | implemented |
| `thread-store/` | A storage-neutral `ThreadId` boundary is implemented; the local backend persists rollout JSONL and SQLite projections/metadata. | Append-oriented transcript storage and query projections can be separated without making the projection authoritative. | implemented |
| inspected app-server/core/thread-store paths | No content-addressed harness component graph or candidate promotion lifecycle was found. | Codex is a runtime comparison target, not an evolution baseline implementation. | absent in inspected path |

Permanent code references:
[app-server contract](https://github.com/openai/codex/blob/6219b7c40fc9c702c0aef9964e72b492558f60e4/codex-rs/app-server/README.md),
[turn loop](https://github.com/openai/codex/blob/6219b7c40fc9c702c0aef9964e72b492558f60e4/codex-rs/core/src/session/turn.rs),
[tool router](https://github.com/openai/codex/blob/6219b7c40fc9c702c0aef9964e72b492558f60e4/codex-rs/core/src/tools/router.rs).

## S4 — Agentic Harness Engineering (AHE)

- Repository: <https://github.com/china-qijizhifeng/agentic-harness-engineering>
- Branch / commit: `main` / `faf44bc4aea57413c520bc5711c6ebf628e0da1e`
- Paper: <https://arxiv.org/abs/2604.25850>, arXiv v1, CC BY 4.0
- Inspected: 2026-07-30
- Source license: MIT
- Reuse decision: no code copied; concepts are cited and independently reimplemented.

| File / section | Observed fact | Inference | Status |
|---|---|---|---|
| `evolve.py:300-520,4145+` | The orchestrator copies a seed workspace into a Git repo, runs Harbor, computes results, runs analysis, invokes an evolve agent, commits/tags the workspace, and repeats. | AHE implements an outer experiment loop, but it uses NexAU and Harbor as core runtime/evaluation dependencies. | implemented |
| `agents/code_agent_simple/start.py`, `code_agent.yaml` | The target agent is constructed from NexAU `AgentConfig` and `Agent`; its initial tool surface is a shell tool. | AHE does not itself implement the complete standalone coding runtime required by this project. | implemented through external runtime dependency |
| `trace_converter.py`; analysis stages in `evolve.py` | Traces are normalized and distilled into per-task and overview reports before the evolve agent reads them. The README says Agent Debugger is only partially open-sourced. | Layered evidence is implemented in part; exact debugger behavior is not fully reproducible from the repository. | partial |
| `agents/evolve_agent/evolve_prompt.md` | The optimizer is restricted to `workspace/`, requires evidence/root cause/fix/predicted impact, and treats runs/verifier/LLM configuration as read-only. | This is a prompt and filesystem contract; it is not by itself an immutable OS principal or signed evaluator boundary. | implemented contract; isolation strength partial |
| `evaluate_changes` in `evolve.py` | Attribution compares declared `predicted_fixes`/`risk_tasks` with later task flips and regressions. | It is decision observability, not ground-truth component-cause attribution. | implemented |
| best-of-N path in `evolve.py` | Candidate variants use Git worktrees and a winner is merged/tagged. | Worktree isolation is useful for files and lineage but does not isolate secrets, processes, or benchmark reads. | implemented |

Permanent code references:
[orchestrator](https://github.com/china-qijizhifeng/agentic-harness-engineering/blob/faf44bc4aea57413c520bc5711c6ebf628e0da1e/evolve.py),
[evolve contract](https://github.com/china-qijizhifeng/agentic-harness-engineering/blob/faf44bc4aea57413c520bc5711c6ebf628e0da1e/agents/evolve_agent/evolve_prompt.md),
[seed agent](https://github.com/china-qijizhifeng/agentic-harness-engineering/blob/faf44bc4aea57413c520bc5711c6ebf628e0da1e/agents/code_agent_simple/start.py).

## S5 — Meta-Harness

- Repository: <https://github.com/stanford-iris-lab/meta-harness>
- Branch / commit: `main` / `44b9942127847f7421db70d8c7e48407f09a3c70`
- Paper: <https://arxiv.org/abs/2603.28052>, arXiv v1, CC BY 4.0
- Inspected: 2026-07-30
- Source license: MIT
- Reuse decision: conceptual comparison only; no code copied.

| File / section | Observed fact | Inference | Status |
|---|---|---|---|
| `reference_examples/text_classification/meta_harness.py` | An external Claude Code proposer writes candidate Python files and `pending_eval.json`; import-valid candidates are evaluated on validation and stored in a frontier. Test runs require explicit finalization. | It has filesystem candidate history and a useful validation/test separation, but proposer operation depends on an external coding harness. | implemented |
| `reference_examples/text_classification/inner_loop.py` | Memory systems implement online/offline predict-and-learn loops with append-only JSONL trajectories and optional checkpoints. | Meta-Harness’s “inner loop” in this example is domain-specific, not a general coding-agent runtime. | implemented |
| `reference_examples/terminal_bench_2/meta_harness.py` | A Claude Code proposer writes a full `Terminus2` subclass, then import/smoke checks and Harbor evaluation update a per-task/overall frontier. | The search surface is free-form Python scaffold code rather than a typed, bounded component graph. | implemented |
| Terminal-Bench proposer skill | The search space explicitly permits overriding any method, raw API calls, tools, and control flow, while requiring one mechanism per candidate. | Interpretability is encouraged by prompt, but immutable component classes and process-separated permissions are not first-class. | implemented contract |
| root README release note | The cleaned release says it was only checked to run and not otherwise tested. | Research-code reliability must be treated as a limitation, not inferred production readiness. | documented-only limitation |

Permanent code references:
[text-classification loop](https://github.com/stanford-iris-lab/meta-harness/blob/44b9942127847f7421db70d8c7e48407f09a3c70/reference_examples/text_classification/meta_harness.py),
[Terminal-Bench loop](https://github.com/stanford-iris-lab/meta-harness/blob/44b9942127847f7421db70d8c7e48407f09a3c70/reference_examples/terminal_bench_2/meta_harness.py),
[onboarding](https://github.com/stanford-iris-lab/meta-harness/blob/44b9942127847f7421db70d8c7e48407f09a3c70/ONBOARDING.md).

## S6 — Self-Harness

- Paper: <https://arxiv.org/abs/2606.09498>
- Version: arXiv `2606.09498v1`, 2026-06-08
- Inspected: 2026-07-30
- License: paper CC BY 4.0
- Public implementation: no Self-Harness repository link was found in the paper; DeepAgents is a
  referenced dependency, not the method’s source release.
- Reuse decision: cite method descriptions; no source code was available to reuse.

| Section | Observed fact | Inference | Status |
|---|---|---|---|
| §3.1, Algorithm 1 | The method evaluates a current harness, builds evidence from held-in failures, generates parallel bounded proposals, independently evaluates candidate variants on held-in and held-out splits, and records acceptance/rejection. | New-version lineage, bounded edits, rejected-edit memory, and regression gates are prior art and cannot be claimed as novel here. | documented-only |
| §3.2 | Failure signatures separate terminal verifier cause, causal status, and an inferred abstract mechanism before deterministic clustering. | A benchmark with known injected component faults is needed to measure whether component attribution is actually correct. | documented-only |
| §3.3 | Proposals receive editable surfaces, failure patterns, passing behavior, and prior edit summaries and are required to be diverse and minimal. | The proposed MVP should preserve these constraints but add machine-enforced component and trust manifests. | documented-only |
| §3.4 | A candidate is accepted only when neither held-in nor held-out pass counts regress and at least one improves. Rejected edits remain logged. | This validates task behavior but does not by itself prove matched-budget advantage or causal generalization. | documented-only |
| §4.1 | The experimental harness is based on DeepAgent. | Self-Harness is not evidence of a standalone runtime kernel. | documented-only |

## S7 — Rethinking the Evaluation of Harness Evolution for Agents

- Paper: <https://arxiv.org/abs/2607.12227>
- Version: arXiv `2607.12227v1`, 2026-07-14
- Code: <https://github.com/rethinking-harness-evolution/code>
- Branch / commit: `main` / `ffd1ba1c2c3e31099264f630b9ed44aec63a86a7`
- Inspected: 2026-07-30
- License: paper CC BY 4.0; no source-code license file was present at the inspected commit
- Reuse decision: task IDs and protocol facts may be cited; code is not reused because no source license
  grant was found.

| File / section | Observed fact | Inference | Status |
|---|---|---|---|
| paper §3 | Parallel sampling, sequential refinement, harness evolution, and task-specific harness scaling are formalized under a common `K` budget. | A static/prompt-only/free-form/bounded set should extend, not replace, these compute controls. | documented |
| paper §4.1 | Experiments use Terminal-Bench 2.1, 128k maximum generation, high reasoning, two runs, one rollout per task per harness, and `K=5`. | Model call, token, tool-call, feedback, and wall-clock ledgers must all be enforced; matching only iteration count is insufficient. | documented |
| paper §4.4 | The generalization split is 45 train, 10 validation, 34 held-out test tasks, with only +0.6 average held-out gain reported for harness evolution. | Search and final evaluation must be disjoint, and non-improvement is a plausible expected outcome. | documented |
| `configs/experiments/*-w-{train,val,test}.yaml` | The repository publishes the exact 45/10/34 task IDs. | These IDs can be preregistered, while task content and verifier details remain unavailable to the proposer. | implemented config |
| `run_code_agent_baseline.py`, `evolve_seq.py`, `evolve.py`, `evolve_ahe.py` | The release contains separate entry points for parallel sampling, sequential refinement, per-task harness scaling, and AHE-based harness evolution. | Baseline semantics can be independently reproduced without treating this repository as the new runtime. | implemented |

Permanent code references:
[repository](https://github.com/rethinking-harness-evolution/code/tree/ffd1ba1c2c3e31099264f630b9ed44aec63a86a7),
[train split](https://github.com/rethinking-harness-evolution/code/blob/ffd1ba1c2c3e31099264f630b9ed44aec63a86a7/configs/experiments/exp-simple-code-gpt54-w-train.yaml),
[validation split](https://github.com/rethinking-harness-evolution/code/blob/ffd1ba1c2c3e31099264f630b9ed44aec63a86a7/configs/experiments/exp-simple-code-gpt54-w-val.yaml),
[test split](https://github.com/rethinking-harness-evolution/code/blob/ffd1ba1c2c3e31099264f630b9ed44aec63a86a7/configs/experiments/exp-simple-code-gpt54-w-test.yaml).

## S8 — Lilian Weng, “Harness Engineering for Self-Improvement”

- Article: <https://lilianweng.github.io/posts/2026-07-04-harness/>
- Version: dated 2026-07-04; no immutable article commit was published in the page
- Inspected: 2026-07-30
- License: no separate source-code artifact; normal web copyright applies
- Reuse decision: cite concepts; no text or code copied beyond short attributed descriptions.

| Section | Observed fact | Inference | Status |
|---|---|---|---|
| Patterns 2–3 | Files are proposed as persistent memory for large artifacts, and explicit subagents/backend jobs should leave inspectable files, logs, and status. | Persistent memory and background work need lifecycle and evidence records, not just chat messages. | documented-only |
| Harness Optimization | The optimization target progresses prompt → context → workflow → harness code → optimizer code. | MVP should stop at bounded harness components; optimizer-code mutation is a later and riskier lifecycle. | documented-only |
| Self-Improving Harness | The article summarizes Self-Harness and AHE, including rich failure evidence, bounded edits, passing behavior, rejected edits, and layered observability. | These are prior art, not project novelty. | documented-only |
| Future Challenges | The article argues that permission control and evaluator should sit outside the evolving loop and stresses negative results, leakage, reward hacking, memory lifecycle, and human gates. | An immutable trust plane and claim discipline are necessary architectural controls. | documented-only |

## S9 — Darwin Gödel Machine (DGM)

- Repository: <https://github.com/jennyzzt/dgm>
- Branch / commit: `main` / `a565fd2d1dca504ef5104a7cc0f3bdc4ab9b4fd2`
- Paper: <https://arxiv.org/abs/2505.22954>
- Inspected: 2026-07-30
- Source license: Apache-2.0
- Reuse decision: architectural comparison only; no code copied.

| File / section | Observed fact | Inference | Status |
|---|---|---|---|
| `DGM_outer.py` | An archive begins with `initial`; parents are sampled using score and child count; parallel self-improvement attempts are filtered for compilability and appended to an archive with generation/parent/children metadata. | Population lineage and negative branches are useful, but this is an open search archive rather than a promote/reject active-version control plane. | implemented |
| `self_improve_step.py` | Parent patches are applied inside Docker; the coding agent modifies the DGM codebase, produces a patch, and benchmark evaluation writes metadata. | Candidate isolation is container-based, but the mutable surface includes agent/optimizer-adjacent code far beyond this MVP. | implemented |
| `prompts/self_improvement_prompt.py` | Diagnosis may include predicted patch, official private test patch, and evaluation logs, then asks for a general improvement. | This protocol is not compatible with the proposed sealed-test boundary. | implemented |
| README safety note | The repository warns that it executes untrusted model-generated code. | Worktree isolation alone cannot be treated as a sandbox. | documented limitation |

Permanent code references:
[outer loop](https://github.com/jennyzzt/dgm/blob/a565fd2d1dca504ef5104a7cc0f3bdc4ab9b4fd2/DGM_outer.py),
[self-improvement step](https://github.com/jennyzzt/dgm/blob/a565fd2d1dca504ef5104a7cc0f3bdc4ab9b4fd2/self_improve_step.py).

## S10 — OxyGent

- Website: <https://oxygent.jd.com/>
- Repository: <https://github.com/jd-opensource/OxyGent>
- Branch / commit: `main` / `cd96268de5814dfb4e0444cfd687f97508cf996a`
- Commit date: 2026-07-21T16:33:57+08:00
- Paper: <https://arxiv.org/abs/2604.25602>, arXiv v2, 2026-04-29
- Inspected: 2026-07-31
- Source license: Apache-2.0
- Paper license: arXiv non-exclusive distribution license
- Reuse decision: comparison and design vocabulary only; no source copied and no OxyGent runtime
  dependency added.

| File / section | Observed fact | Inference | Status |
|---|---|---|---|
| `oxygent/oxy/base_oxy.py:71-195`; `oxygent/mas.py:312-375` | `Oxy` is the common executable abstraction for agents, tools, LLMs, and flows. It carries descriptions, schemas, permission lists, concurrency, timeout, retry, lifecycle callbacks, and a MAS reference; `MAS.init` registers and initializes the object graph. | OxyGent is useful prior art for a uniform runtime component interface, but its live object registry is not a content-addressed `HarnessVersion` component DAG. | implemented |
| `oxygent/mas.py:874-899`; `oxygent/schemas/oxy.py:246-385`; `oxygent/oxy/base_oxy.py:609-780` | `MAS.call` constructs an `OxyRequest`; nested `OxyRequest.call` checks the caller’s permitted tools/components, creates call-tree metadata, applies a timeout, and invokes `Oxy.execute`. `Oxy.execute` performs interception, persistence, hooks, bounded retry, and post-processing. | This is an owned MAS runtime path rather than a wrapper around another agent harness. Permission lists are runtime checks, but not independent OS-principal isolation. | implemented |
| `oxygent/oxy/agents/react_agent.py:306-440`; `oxygent/oxy/agents/parallel_agent.py:21-68`; `oxygent/oxy/flows/reflexion.py:171-255` | ReAct constructs context, calls an LLM, executes permitted tools, appends observations, and repeats. ParallelAgent fans one request out and synthesizes results. Reflexion repeatedly asks a worker and evaluator to improve the same answer. | These are strong Task Execution Loop and B1/B2 implementation references. Reflexion and component retries remain task-time retry/refinement, not harness evolution. | implemented |
| `oxygent/live_prompt/manager.py:63-197,359-425`; `oxygent/live_prompt/version.py:16-328`; `oxygent/routes.py:1439-1537` | Live prompts have incrementing versions, archived history, multi-instance version polling, hot reload, and revert-as-new-version. The optimization endpoint asks an LLM to rewrite one prompt, applies structural substring checks, and can immediately save/hot-reload it when `auto_apply` is true. | OxyGent has genuine prompt artifact versioning and rollback-adjacent behavior. It does not, in this path, create an independently evaluated multi-component candidate `HarnessVersion` or require a held-out gate, matched budget, external promoter, or immutable evaluator before activation. | implemented prompt lifecycle; harness lifecycle absent in inspected path |
| `applications/oxybank/app/services/annotation_service.py:35-220`; `applications/oxybank/app/services/sample_service.py:215-265,421-469`; `applications/oxybank/README.md` | OxyBank dispatches status-triggered annotation agents, applies their field changes, records per-sample version history, and synchronizes retrieval projections. Elasticsearch is described as the authoritative sample store and Vearch as a vector projection. | The paper’s “evolution engine” is concretely supported as an AI-data backflow, annotation, and retrieval lifecycle. That lifecycle must not be conflated with mutation and promotion of executable harness versions. | implemented |
| `examples/agents/demo_evaluate_and_evolve.py:73-126` | The example reads saved LLM nodes, has a reviewer agent filter them, and writes accepted messages to `sft_dataset.jsonl`. | The named example produces training data; it neither updates model weights nor implements a harness candidate/promotion lifecycle. | implemented |
| inspected runtime, live-prompt, OxyBank, examples, and tests | Searches found no typed `HarnessVersion` lifecycle, bounded multi-component mutation proposal, disjoint held-out acceptance gate, matched-budget comparison, or separate proposer/evaluator/promoter authority chain. | OxyGent narrows the novelty claim: unified components, trace observability, prompt versions, hot reload, and data feedback are prior art. The remaining proposed gap is enforced whole-harness lineage plus evaluation and trust-plane separation. | absent in inspected paths; unknown for uninspected or unreleased artifacts |

Permanent code references:
[Oxy lifecycle](https://github.com/jd-opensource/OxyGent/blob/cd96268de5814dfb4e0444cfd687f97508cf996a/oxygent/oxy/base_oxy.py),
[nested invocation](https://github.com/jd-opensource/OxyGent/blob/cd96268de5814dfb4e0444cfd687f97508cf996a/oxygent/schemas/oxy.py),
[ReAct loop](https://github.com/jd-opensource/OxyGent/blob/cd96268de5814dfb4e0444cfd687f97508cf996a/oxygent/oxy/agents/react_agent.py),
[live-prompt manager](https://github.com/jd-opensource/OxyGent/blob/cd96268de5814dfb4e0444cfd687f97508cf996a/oxygent/live_prompt/manager.py),
[prompt optimization route](https://github.com/jd-opensource/OxyGent/blob/cd96268de5814dfb4e0444cfd687f97508cf996a/oxygent/routes.py),
[OxyBank annotation dispatcher](https://github.com/jd-opensource/OxyGent/blob/cd96268de5814dfb4e0444cfd687f97508cf996a/applications/oxybank/app/services/annotation_service.py).

## S11 — TencentDB-Agent-Memory

- Repository: <https://github.com/TencentCloud/TencentDB-Agent-Memory>
- Branch / commit: `feat/server_team` / `f3df79326dfd763f45199c441e2129d780467949`
- Commit date: 2026-07-29T15:59:41Z
- Inspected: 2026-08-03
- Source license: MIT
- Reuse decision: comparison and internal interface guidance only; no source copied and no runtime
  dependency added.

| File / section | Observed fact | Inference | Status |
|---|---|---|---|
| `README.md:197,222-231`; `MemoryCore/README.md:5-9,168-170` | The system stores L0 conversations, L1 atomic memories, L2 scenarios, and L3 profiles; completed turns are written to L0 and bounded, labelled L1/L2/L3 results are recalled before the next prompt. Both READMEs explicitly state that MemoryCore does not run, host, schedule, or execute the Agent loop. | This is directly relevant prior art for `MemoryPolicy` and context construction, but it is an external memory substrate rather than a standalone coding-agent kernel. | implemented memory path; agent execution explicitly out of scope |
| `MemoryCore/src/core/tdai-core.ts`; `core/hooks/auto-recall.ts` | `handleBeforeRecall` reaches `performAutoRecall`; recall supports keyword, embedding, and hybrid/RRF search, composes stable L3/L2 and dynamic L1 material, and applies result and context budgets. | Retrieval strategy, stable-versus-dynamic placement, and explicit context limits should inform the internal memory adapter without turning this project into a MemoryCore wrapper. | implemented |
| `MemoryCore/src/core/hooks/auto-capture.ts:101-160` | `CheckpointManager.captureAtomically` holds the cursor-to-L0-to-cursor sequence together; SQLite-style stores may defer embeddings while remote/vector backends can embed synchronously. | Crash-safe capture checkpoints and projection work separated from authoritative writes are useful memory-plane patterns. | implemented |
| `MemoryCore/src/core/skill/skill-versioning.ts`; `skill/skill-permission.ts` | Skill updates append versions, treat equal content hashes as a no-op, copy or patch resources, and clean up on failure. Permission checks scope ownership by team and agent and support optimistic expected-version checks. | Versioned skills and scoped ownership overlap one component type in the proposed graph, but they do not create a whole-harness candidate or evaluation lineage. | implemented |
| `MemoryCore/src/core/storage/adapter.ts`; `storage/local-backend.ts` | Scoped storage rejects traversal and provides append/write operations; the local backend documents atomic and non-atomic boundaries. | Memory persistence needs explicit path and atomicity contracts; the storage layer is not an evaluator or promotion boundary. | implemented |
| `MemoryProxy/src/handler.ts`; `MemoryProxy/src/injection/pipeline.ts` | An OpenAI-compatible proxy authenticates and gates model routes, parses requests into an agent context, executes system/tool/user injection hooks, forwards to the upstream model, records usage, and triggers capture/skill extraction. | The proxy is a valid integration mode for other agents, but adopting it as this project’s core would violate the independent-runtime requirement. | implemented |
| inspected MemoryCore and MemoryProxy paths | No owned model/tool execution loop, typed whole-`HarnessVersion` lifecycle, component-failure attribution, isolated held-in/held-out candidate evaluation, matched-budget B0–B6 comparison, or proposer/evaluator/promoter authority chain was found. | The overlap is memory, context injection, skill versioning, and ACL/storage mechanics—not first-class harness evolution or its immutable trust plane. | absent in inspected paths; unknown for uninspected branches or services |

Permanent code references:
[repository at exact SHA](https://github.com/TencentCloud/TencentDB-Agent-Memory/tree/f3df79326dfd763f45199c441e2129d780467949),
[MemoryCore boundary](https://github.com/TencentCloud/TencentDB-Agent-Memory/blob/f3df79326dfd763f45199c441e2129d780467949/MemoryCore/README.md),
[core dispatch](https://github.com/TencentCloud/TencentDB-Agent-Memory/blob/f3df79326dfd763f45199c441e2129d780467949/MemoryCore/src/core/tdai-core.ts),
[auto capture](https://github.com/TencentCloud/TencentDB-Agent-Memory/blob/f3df79326dfd763f45199c441e2129d780467949/MemoryCore/src/core/hooks/auto-capture.ts),
[auto recall](https://github.com/TencentCloud/TencentDB-Agent-Memory/blob/f3df79326dfd763f45199c441e2129d780467949/MemoryCore/src/core/hooks/auto-recall.ts),
[skill versioning](https://github.com/TencentCloud/TencentDB-Agent-Memory/blob/f3df79326dfd763f45199c441e2129d780467949/MemoryCore/src/core/skill/skill-versioning.ts),
[proxy handler](https://github.com/TencentCloud/TencentDB-Agent-Memory/blob/f3df79326dfd763f45199c441e2129d780467949/MemoryProxy/src/handler.ts),
[injection pipeline](https://github.com/TencentCloud/TencentDB-Agent-Memory/blob/f3df79326dfd763f45199c441e2129d780467949/MemoryProxy/src/injection/pipeline.ts).

## Evidence gaps

1. Self-Harness has no inspected public implementation, so process isolation and exact data-flow claims
   remain `documented-only`.
2. AHE’s Agent Debugger is explicitly only partially open-sourced, so its analysis results are not fully
   reproducible from the repository.
3. The evaluation-critique code repository has no detected source license; exact task IDs are facts, but
   its implementation must not be copied.
4. Absence of an evolution lifecycle in large repositories is scoped to inspected paths and searches, not
   a proof about every historical branch or unreleased component.
5. OxyGent’s paper uses “evolution” for OxyBank-driven data feedback and joint evolution. The ledger
   records what is executable at the pinned SHA and does not infer unavailable training, deployment, or
   promotion machinery from that term.
6. TencentDB-Agent-Memory has a large server branch and external service integrations. The negative
   harness-evolution finding is limited to the inspected MemoryCore/MemoryProxy execution paths and the
   repository’s explicit statement that it does not run the Agent loop.
