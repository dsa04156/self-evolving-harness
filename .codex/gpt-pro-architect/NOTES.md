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
- Runtime implementation remains prohibited until packet 1R is approved.
