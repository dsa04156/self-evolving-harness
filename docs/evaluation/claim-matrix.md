# Claim Authorization Matrix

Status: Gate 1R design contract

| Claim | Dataset / permitted feedback | Required controls | Primary estimand/test | Falsification | Maximum wording |
|---|---|---|---|---|---|
| H1a explicit attribution reduces regression | mine-generated candidates; one gate selection; final withheld-public/temporal outcomes only | B6-ABL same grammar, component count, size, candidates, proposer budget | task-clustered regression risk difference; Holm family | corrected interval includes zero or trust gate fails | “Explicit attribution artifact reduced regression under this bounded protocol.” |
| H1b structured method vs free-form | same | mandatory B5-SM; B5-U descriptive | absolute and relative regression reduction; Holm; ≥25% lower bound for strong wording | size match fails, corrected interval includes zero, or relative lower bound <25% | “The full attribution-guided bounded method regressed less than size-matched free-form mutation.” |
| H2 frozen reusable improvement | final frozen B6, B0, B4; no retry/mutation; final task input only | same final model/tools/environment/budget per pass | task-average paired pass@1 risk difference; Holm for two comparisons | either corrected interval includes zero, final artifact changes, or only mine/gate gain | “The frozen harness improved pass@1 on this withheld/temporal task set.” |
| H3 evidence efficiency | mine/dedicated pilot only; no gate/final | raw-trace input vs layered evidence; all roles charged | total-system charged-token ratio upper CI <0.80 plus quality non-inferiority | work shifted to another role, interval fails, drill-down lost, or violation | “Layered evidence reduced total inference cost while preserving preregistered mine/pilot quality.” |
| Matched-budget superiority | Track A final batch; standardized task-local feedback | B1, B2, B3 all matched | Holm-adjusted positive risk difference vs all three | any comparison not positive | “Under this matched task-time envelope, B6 outperformed the three preregistered scaling baselines.” |
| H4 transfer | separately frozen second model, no retuning | same frozen harness vs second-model B0 | paired task-level difference | nonpositive/inconclusive or model chosen post-result | at most “exploratory positive transfer”; otherwise negative/inconclusive |
| Architectural feasibility | deterministic schemas/state/isolation/evidence tests | independent runtime, no existing runtime backend | contract/adversarial pass/fail | wrapper dependency or unenforced boundary | “A standalone prototype enforced the specified lifecycle and trust contracts.” |
| Security | Gate 2 OS-boundary adversarial evidence only | distinct UIDs/containers/keys/mounts/network | zero boundary escapes in declared test suite | any escape/impersonation/leak | “Passed the declared local isolation tests”; never “secure” or “tamper-proof.” |

No result authorizes “general self-improvement,” “AGI self-evolution,” model improvement, optimizer
self-modification, or universal superiority. Terminal-Bench results always say “withheld public test” and
include possible pretraining/prior-exposure contamination.
