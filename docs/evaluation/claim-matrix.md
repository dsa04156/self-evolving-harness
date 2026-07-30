# Claim Authorization Matrix

Status: Gate 1RR design contract

| Claim | Dataset / permitted feedback | Required controls | Primary estimand/test | Falsification | Maximum wording |
|---|---|---|---|---|---|
| H1a explicit attribution reduces regression | mine-generated candidates; one gate selection; final withheld-public/temporal outcomes only | B6-ABL same grammar, component count, size, candidates, proposer budget | task-clustered regression risk difference; Holm family | corrected interval includes zero or trust gate fails | “Explicit attribution artifact reduced regression under this bounded protocol.” |
| H1b structured method vs free-form | same | mandatory B5-SM; B5-U descriptive | absolute and relative regression reduction; Holm; ≥25% lower bound for strong wording | size match fails, corrected interval includes zero, or relative lower bound <25% | “The full attribution-guided bounded method regressed less than size-matched free-form mutation.” |
| H2 frozen reusable improvement | final frozen B6, B0, B4; no retry/mutation; final task input only | same final model/tools/environment/budget per pass | task-average paired pass@1 risk difference; Holm for two comparisons | either corrected interval includes zero, final artifact changes, or only mine/gate gain | “The frozen harness improved pass@1 on this withheld/temporal task set.” |
| H3 evidence efficiency | B6 vs B6-RAW on paired mine/dedicated pilot only; no gate/final | identical events/clusters/model/seeds/grammar/attribution/solver/selector/budget/failure handling; representation only differs | B6/B6-RAW total-system charged-token ratio upper CI <0.80 plus top-1 and targeted-repair non-inferiority | work shifted to another role, treatment differs elsewhere, interval/quality fails, drill-down lost, or violation | “Layered evidence reduced total inference cost versus the preregistered raw-evidence arm while preserving mine/pilot quality.” |
| Matched-budget superiority | Track A final batch; standardized task-local feedback | B1, B2, B3 all matched | Holm-adjusted positive risk difference vs all three | any comparison not positive | “Under this matched task-time envelope, B6 outperformed the three preregistered scaling baselines.” |
| H4 transfer | second model frozen at Gate 3 before any candidate/gate/final/transfer result; no retuning | model-2 B0 vs same frozen B6, one matched pass/task/seed, zero model-2 evolution | paired task-level pass@1 difference; evolution and transfer costs separate | nonpositive/inconclusive, late model choice, drift, retuning, or reselection | at most “exploratory positive transfer”; otherwise negative/inconclusive |
| Architectural feasibility | deterministic schemas/state/isolation/evidence tests | independent runtime, no existing runtime backend | contract/adversarial pass/fail | wrapper dependency or unenforced boundary | “A standalone prototype enforced the specified lifecycle and trust contracts.” |
| Security | Gate 2 OS-boundary adversarial evidence only | distinct UIDs/containers/keys/mounts/network | zero boundary escapes in declared test suite | any escape/impersonation/leak | “Passed the declared local isolation tests”; never “secure” or “tamper-proof.” |

No result authorizes “general self-improvement,” “AGI self-evolution,” model improvement, optimizer
self-modification, or universal superiority. Terminal-Bench results always say “withheld public test” and
include possible pretraining/prior-exposure contamination.
