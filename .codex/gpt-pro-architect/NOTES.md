# Architect Transport Notes

## Standing restrictions

- Never send `.env`, credentials, provider tokens, personal data, raw secret-bearing traces, benchmark
  sealed content, or a full repository dump.
- External transmission and paid-provider use require explicit user approval at the time of action.
- Send the smallest self-contained packet needed for the gate.
- Preserve the raw response unchanged under `responses/`; record interpretation separately in the
  ledger.
- The architect may advise or gate. It is not the immutable benchmark evaluator and cannot waive data,
  budget, security, or user-approval rules.

## Round 1 proposed disclosure

- Project objective and non-goals
- Exact-SHA source-level findings and license conclusions
- Hypotheses/falsification criteria
- Split counts and matched-budget protocol
- Six-layer/component/state/trust contracts
- Candidate gates, limitations, and explicit open questions

Excluded: source files, environment variables, secrets, unpublished benchmark content, raw traces, and
any paid-provider request.

## Durable Gate 1 decision

- External decision: `REVISE`.
- Defensible novelty is conditional: standalone runtime + typed content-addressed composition + strict
  task/evolution separation + machine-enforced principals + evidence-linked promotion.
- Immutable manifests must be separated from lifecycle/evaluation/activation records.
- Deployment activates a whole evaluated harness manifest, never independent component pointers.
- Behavior-bearing mutable payloads must be declarative or capability-limited; all transitive
  dependencies count toward mutation scope and size.
- Memory/workspace/checkpoint/cache/subagent/job state must be pinned or reset for reproducible
  evaluation.
- Multi-cause final-test metrics cannot be candidate gates; every metric must map to a data role.
- B5 size matching is mandatory and a bounded attribution-ablated control must be added.
- Budgets require phase ledgers, total-system cost, precise `K`, gate-feedback limits, and amortization.
- Statistics require task-clustered/hierarchical resampling, seed precision/power rules, and multiplicity
  handling.
- HarnessFaultBench fixture semantics and independent review must freeze before implementation.
- The trust plane requires authenticated protocol messages and an explicit principal-capability/TCB
  contract; language separation is not a security boundary.
- Runtime implementation remains prohibited until Gate 1 is explicitly approved.

## Durable Gate 1R and Gate 1RR decisions

- Gate 1R and Gate 1RR both returned `REVISE`.
- Gate 1RR accepted H3/B6-RAW, one-shot gate governance, the exact candidate-cost formula, the corrected
  multi-cause graph, H4 disposition, qualification/deployment separation, and claim discipline.
- The only Gate 1RR blockers were the complete rollback post-state, an executable initialization
  anchor, and immutable cross-record termination continuity.
- Gate 1RRR selects a null initialization anchor, deterministic target/rollback-target swap, and one
  byte-identical five-field termination descriptor with direct initiator reference.
- No Gate 2 implementation, provider call, benchmark/gate/final access, deployment, or empirical claim
  is authorized before the Gate 1RRR decision.

## Durable Gate 1RRR decision

- External decision: `APPROVE`; blocking findings: none.
- The complete pointer tuple, null initialization anchor, deterministic rollback swap, and immutable
  termination transaction are accepted as the `draft-1` Gate 1 contracts.
- Gate 2 bounded local implementation and deterministic verification may begin.
- Paid-provider calls, benchmark evolution, gate/final/temporal/withheld-public access, live deployment,
  push/release, and publication/performance/security claims remain prohibited.

## Durable Gate 2 decision

- External decision: `REVISE`; novelty viability and claim discipline remain accepted.
- Blocking corrections are: versioned two-stage component identity; manifest-bound capability
  preimage; one cross-language canonical domain with golden corpus; real OS principal/key separation;
  evaluator transport over authenticated peer-credential Unix sockets; enforceable tool/descendant
  cancellation; retirement holds plus restart-safe termination/evaluation transactions; and exact
  evaluator filesystem snapshot binding or dirty-worktree rejection.
- A complete session-definition signature is deferrable until Gate 3 if mechanical signed field
  coverage is proven.
- The B0-B6 matched-budget scheduler and pilot numeric freeze are deferrable at Gate 2 but become
  blocking before any empirical evolution or benchmark work.
- Real-provider smoke remains blocked until the full Gate 2 blocking set passes, Gate 2 is resubmitted,
  and the external architect explicitly approves it.
- Benchmark/gate/final/temporal/withheld-public access, paid-provider work, live deployment,
  push/release, and performance/security/generalization/self-improvement claims remain prohibited.
