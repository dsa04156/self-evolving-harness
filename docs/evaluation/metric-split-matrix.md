# Metric-to-Split Authorization Matrix

Status: Gate 1R design contract

“Final only” means the result cannot create, rank, select, promote, reject, repair, tune, or roll back a
candidate under the same protocol. A final safety violation is reported and can stop deployment outside
the experiment, but it does not rewrite the preregistered decision rule or generate a replacement
candidate.

| Dataset / role | Metric | Permitted use | Proposer receives | Promotion input | Claim use |
|---|---|---|---|---:|---|
| HarnessFaultBench `D_mine` single fault | top-1/top-3 attribution, source drill-down, token/cost | weakness mining, proposer development, mine-only pilot | allowed redacted case evidence | protocol development only | exploratory/pilot |
| HarnessFaultBench `D_gate` single fault | top-1 ≥70%, top-3 ≥90% | one protocol-readiness evaluation after attribution implementation is frozen | no task/detail; phase-closed aggregate later | yes, as protocol admission—not candidate-specific tuning | attribution readiness |
| HarnessFaultBench sealed single fault | top-1/top-3 attribution | one final confirmatory batch | none | no | final attribution generalization |
| HarnessFaultBench sealed multi-cause | recall@2 ≥70%, exact-set accuracy | one final confirmatory batch | none | no | final multi-cause reporting only |
| Terminal-Bench evolution train (`D_mine`, 45 public tasks) | task success, failures, trace patterns, usage | mine traces, candidate generation, exploratory pilot subject to pilot subset rule | allowed redacted evidence | targeted-mine improvement only | development, not generalization |
| Terminal-Bench selection validation (`D_gate`, 10 public tasks) | paired pass rate, pass→fail/fail→pass, cost, violations | one non-adaptive candidate selection batch | no detail; frozen aggregate after proposer loses write capability | yes | selection only; no confirmatory performance claim |
| Terminal-Bench **withheld public test** (34 public tasks) | pass@1, regression, matched-budget utility, usage/latency | one final Track A/Track B batch after freeze | only current task input for methods that solve it; no cross-task proposal memory | no | H1/H2 and scaling claim, with contamination disclosure |
| Temporal holdout | pass@1, regression, usage/latency | final replication protocol only | none beyond current solver task; no proposer/evolution process | no | strongest temporal generalization evidence |
| Deterministic contract/adversarial fixtures | schema/hash/state/isolation/security pass/fail | static validation, Gate 2, candidate invariant gates | reason codes allowed where not sensitive | yes | correctness/security-boundary evidence, not capability |
| Dedicated pilot tasks | variance, cost distribution, margin and seed precision | fill only `PILOT_PENDING` fields before gate/final access | pilot output allowed | freezes later protocol fields | calibration only |

## Metric authorization rules

1. Every result records exact dataset role and task-set commitment.
2. The promoter accepts only `mine`, `gate`, or `deterministic` criteria. Schemas reject final roles.
3. Multi-cause recall is absent from all candidate and protocol promotion gates.
4. `D_gate` results are never used to propose a second batch in protocol v1.
5. Final task-level traces remain evaluator-only and are not inserted into project memory until all
   confirmatory decisions and reports are irrevocably finalized.
6. Terminal-Bench is public. “Withheld” describes access during this experiment; model pretraining or
   prior exposure is unknown and reported as contamination risk.
7. A genuinely sealed label is reserved for locally authored HarnessFaultBench final fixtures and
   temporal artifacts whose content, author access, and hashes satisfy their governance contracts.
