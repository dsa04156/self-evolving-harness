# Related Work

This chapter is derived from the exact-SHA observations in `source-ledger.md` and the call paths in
`execution-paths.md`. “Observed” means a public code or paper path was inspected. “Difference” is this
project’s architectural interpretation, not a claim that the prior system lacks behavior outside the
inspected revision.

## Standalone coding-agent runtimes

Gajae-Code owns session construction, provider/model registration, context, tools, skills, persistence,
and a model/tool loop. Its operations control plane adds deterministic recovery, bounded signals,
receipts, ownership, and `state/evidence/nextAllowedActions` responses at commit
[`8778760`](https://github.com/Yeachan-Heo/gajae-code/tree/8778760cf924246ab86e4c6c3fda26da8a572cd8).
OpenAI Codex similarly owns a Thread/Turn/Item runtime, model sampling, tool routing, sandbox decisions,
and thread storage at commit
[`6219b7c`](https://github.com/openai/codex/tree/6219b7c40fc9c702c0aef9964e72b492558f60e4).
These are the strongest runtime references for this project. The inspected paths do not expose the
typed candidate-component and promotion lifecycle studied here.

Oh My OpenAgent’s `dev` revision
[`258fab0`](https://github.com/code-yeongyu/oh-my-openagent/tree/258fab04159c0d628d7cc4c811e2907aee1cd0a1)
separates reusable core, MCP/skills, runtime adapters, and platform integration. Its OpenCode path is an
adapter loaded by the host runtime. This project adopts capability-specific seams but must own the
provider loop itself.

OxyGent at
[`cd96268`](https://github.com/jd-opensource/OxyGent/tree/cd96268de5814dfb4e0444cfd687f97508cf996a)
is closer in multi-agent scope: it owns MAS registration, permitted inter-agent calls, ReAct and
parallel/reflexion agents, tracing, prompt version history, optimization, hot reload, and revert. This
eliminates any novelty claim for modular multi-agent execution or live prompt evolution. The narrower
difference is that this project creates one immutable multi-component candidate, evaluates it under a
separate authority, and changes production only through a signed deployment decision.

## Memory systems

TencentDB-Agent-Memory at
[`f3df793`](https://github.com/TencentCloud/TencentDB-Agent-Memory/tree/f3df79326dfd763f45199c441e2129d780467949)
implements layered L0–L3 memory, atomic capture checkpoints, bounded recall, skill versions, ACLs, and
an OpenAI-compatible injection proxy. It is closely related to the filesystem-memory and retrieval
policy surface here. Its direct mode integrates into a host agent and its proxy mode forwards to an
upstream model; neither inspected path owns the host agent’s full model/tool loop or creates and promotes
a whole `HarnessVersion`. The overlap is intentional at the memory-policy layer, while runtime ownership
and governed evolution are the boundary.

## Harness optimization and self-modification

Agentic Harness Engineering (AHE) at
[`faf44bc`](https://github.com/china-qijizhifeng/agentic-harness-engineering/tree/faf44bc4aea57413c520bc5711c6ebf628e0da1e)
implements an evaluate–analyze–edit loop, normalized traces, experiment workspaces, Git lineage, and
worktree variants. Its target/evolver execution relies on NexAU and Harbor. AHE establishes layered
observability and falsifiable edit contracts as prior art; this repository focuses on enforcing those
contracts inside an independently owned runtime and a typed mutable surface.

Self-Harness ([arXiv:2606.09498](https://arxiv.org/abs/2606.09498)) contributes weakness mining, rich
failure records, bounded/diverse proposals, passing-behavior preservation, rejected-edit memory, and
held-in/held-out regression checks. Those mechanisms are explicitly non-novel here. The contribution
candidate is the content-addressed component graph plus physically separated evaluator, data, budget,
permission, promotion, and audit authorities.

Meta-Harness at
[`44b9942`](https://github.com/stanford-iris-lab/meta-harness/tree/44b9942127847f7421db70d8c7e48407f09a3c70)
archives candidate programs and frontier history on the filesystem and separates validation from final
testing. Its proposer uses an external coding harness and its Terminal-Bench example permits broad
Python subclass rewrites. This project instead restricts mutation to declared component payloads and
keeps tool implementations and optimizer code immutable in the MVP.

The Darwin Gödel Machine at
[`a565fd2`](https://github.com/jennyzzt/dgm/tree/a565fd2d1dca504ef5104a7cc0f3bdc4ab9b4fd2)
maintains a population archive, parent/child code lineage, Dockerized self-edit steps, and benchmark
selection. It demonstrates broad code self-modification. This project intentionally studies the
opposite initial point: narrow behavior-bearing mutations under an immutable trust boundary.

## Evaluation and harness engineering

“Rethinking the Evaluation of Harness Evolution for Agents”
([arXiv:2607.12227](https://arxiv.org/abs/2607.12227), code
[`ffd1ba1`](https://github.com/rethinking-harness-evolution/code/tree/ffd1ba1c2c3e31099264f630b9ed44aec63a86a7))
shows why parallel sampling, sequential refinement, task-specific scaling, and reusable harness
evolution must be compared under matched inference and feedback budgets. Its published 45/10/34
Terminal-Bench 2.1 split anchors this repository’s B0–B6 protocol. The current repository implements the
accounting and access controls but has not run the empirical comparison.

Lilian Weng’s “Harness Engineering for Self-Improvement”
([2026-07-04](https://lilianweng.github.io/posts/2026-07-04-harness/)) frames harness work as a progression
from prompts through context, workflow, harness code, and optimizer code, and highlights filesystem
memory, explicit background work, immutable evaluators/permissions, and negative-result retention. The
MVP stops before optimizer-code or model-weight mutation.

## Positioning

No individual mechanism is novel. The testable systems contribution is their enforced composition:

1. a standalone coding-agent kernel and operations lifecycle;
2. a typed, content-addressed component DAG with bounded mutation;
3. fact/verifier/inference-separated evidence;
4. new candidate versions independently evaluated from their parents;
5. disjoint proposer, evaluator, scorer, promoter, data, budget, and audit authority; and
6. a preregistered matched-budget protocol that permits a negative result.

Until the sealed evaluation runs, this positioning supports an architectural artifact claim only.
