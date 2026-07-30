# Prior-Art Matrix

This matrix compares implemented or explicitly documented properties. A check mark is not a quality
judgment, and “not found” is limited to the inspected artifacts in
[source-ledger.md](./source-ledger.md).

| System | Own task runtime | Ops lifecycle / recovery | Durable evidence | Harness lineage | Bounded typed mutation | Held-out gate | Matched-budget scaling baselines | Immutable external trust plane |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Gajae-Code | yes | yes | receipts/events | not found | not found | not found | no | partial: owner/receipts, no evolution boundary |
| OpenAI Codex | yes | yes, product runtime | rollout/items | not found | not found | not found | no | permissions/sandbox exist, no evolution boundary |
| Oh My OpenAgent | host-owned | host-specific hooks | host-dependent | no | no | no | no | host-dependent |
| AHE | NexAU-owned | experiment resume/rollback | layered traces/reports | Git iterations/worktrees | prompt-constrained file edits | same-loop evaluation; transfer reported | incomplete in original release | filesystem/read-only contract, not a demonstrated hostile-principal boundary |
| Meta-Harness | domain/host-specific | experiment resume | filesystem logs/frontier | candidate files/frontier | one-mechanism prompt; free-form code | validation/test separation in text-classification example | no unified matched-budget suite | no first-class trust plane |
| Self-Harness | DeepAgent-based in paper | not a product ops plane | structured failure records | explicit `h_t → h_t+1` | yes, minimal proposals | held-in + held-out regression | no parallel/sequential matched-budget comparison in method | fixed evaluator concept; implementation isolation unknown |
| DGM | owns initial coding agent, Docker evaluation | outer-run resume/archive | metadata/log archive | population parent/child graph | no; broad self-code mutation | benchmark subsets, not this sealed protocol | baseline variants but not B0–B6 contract | weak for this threat model |
| Rethinking evaluation code | uses AHE/NexAU/Harbor | experiment control | result artifacts | method-dependent | method-dependent | 45/10/34 | parallel, sequential, evolution, scaling with `K=5` | not the research focus |
| Proposed system | must own | separate SessionLifecycle | hash-chained facts, verifier outcomes, and labelled inferences | content-addressed HarnessVersion lifecycle | machine-enforced component classes | gate + sealed final + temporal holdout | B0–B6 under one resource ledger | separate proposer, evaluator, promoter, sealed-data, and audit principals |

## Non-novel ingredients

The following cannot be claimed as new:

- a model/tool loop, session persistence, sandbox controls, or streamed item events;
- filesystem memory, skills, hooks, subagents, or background jobs;
- evaluate → analyze → improve;
- candidate archives or Git worktrees;
- weakness mining, rich failure records, bounded proposals, held-in/held-out regression checks, or
  preservation of rejected edits;
- immutable/fixed evaluator as a design recommendation;
- matched-budget comparison to parallel sampling, sequential refinement, and harness scaling.

## Candidate contribution

The potentially differentiating contribution is the combination and enforcement of:

1. a standalone coding runtime and a separate operations lifecycle;
2. a content-addressed, typed component DAG with per-component mutable class;
3. a distinct `HarnessVersionLifecycle` whose transitions require external evidence;
4. a physically separate trust plane for evaluator, sealed data, budget, model identity, promotion, and
   audit;
5. evidence schemas that never conflate observed facts, verifier outcomes, and LLM attribution;
6. an attribution benchmark with injected ground-truth component defects; and
7. a preregistered B0–B6 matched-resource and sealed-generalization protocol.

Whether that combination is a publishable systems contribution remains an Architect Gate question until
the isolation, deterministic replay, and evaluation claims are implemented and tested.
