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

## Durable Gate 2R decision

- The ordered Gate 2 corrections are implemented at runtime source commit
  `14e373ee4cf245da8c221be9574aa7528d3202e8`.
- The mandatory subordinate-UID path passes with five distinct host UIDs, role-owned keys, authenticated
  Unix sockets, exact evaluator snapshot binding, 11 rejected wire attacks, wrong-peer rejection, and
  no synthesized final result.
- The complete deterministic suite passes 38/38 with zero skips and 92.06% line coverage.
- This supports only the declared local attack cases under the recorded host assumptions; it is not a
  general security or self-improvement claim.
- External decision: `APPROVE`; blocking findings: none.
- The next bounded scope is session-definition signature/coverage, deterministic matched-budget and
  numeric-freeze machinery, a separately isolated provider proxy, and a synthetic-only real-provider
  smoke under a frozen manifest.
- Benchmark evolution, gate/final/temporal/withheld-public access, empirical B0–B6 comparison,
  research-task pilot tuning, broad performance/security/generalization/self-improvement claims, live
  deployment, push/release, and publication claims remain prohibited.

## Durable Gate 3 readiness decision

- External decision: `REVISE`.
- No new code correction was required before the frozen provider smoke, but the actual one-call smoke
  did not run because the credential was absent.
- Gate 3 remains incomplete without a real signed receipt, provider-reported model, usage/cost,
  exact-output result, and real three-principal egress evidence.
- The decision authorized only that exact smoke and prohibited benchmark/`D_mine` execution.
- Subsequent visible deterministic `D_mine` construction must therefore be disclosed as a possible
  governance deviation and cannot become research evidence without a new architect disposition.
- The current fixture runner chooses good/fault outcomes from manifest identity; it is plumbing
  evidence, not meaningful attribution accuracy.

## Durable Round 3R HarnessFaultBench decision

- External decision: `REVISE`.
- The 28 visible `D_mine` bodies and their deterministic executions exceeded the scope authorized by
  the Gate 3 readiness decision. They are not gate/final contamination, must not be deleted, and must
  receive a signed governance-deviation record.
- The existing fixture bodies, causal report, suite commitment, and 28/28 scorer output are
  `development_only`, `non_confirmatory`, and `unauthorized_for_research_evidence`. They must be
  mechanically excluded from research manifests, candidate inputs, attribution evaluation, B0–B6,
  promotion, and claims.
- The manifest-ID runner is accepted only as structural fixture and label-oracle scorer plumbing.
  Its 28/28 score is not attribution accuracy and its current commitment can never become the official
  research split by renaming.
- Attribution readiness requires separate execution and oracle authority domains. The executor,
  provider, tools, trace producer, verifier, and attribution adapter may not consume fixture IDs,
  target component labels, known-good/fault manifest IDs, expected outcomes, or equivalent encodings.
- All seven mutable families must affect actual runtime decision points. Provider behavior must be a
  function only of canonical requests and observable state; tools only of validated tool IDs and
  arguments; the verifier only of observable output/state.
- A label-blind allowlist adapter and adversarial leakage tests are blocking requirements.
- Corrected fixtures remain development-only until a new semantic suite commitment and a narrow
  Architect resubmission are accepted.
- The correction-only deterministic scope is authorized. Provider smoke is a separate frozen action
  and remains unexecuted because this project has no provider API credential.
- Attribution-model evaluation, B0–B6, research pilot, mutation, candidate selection, promotion,
  deployment, gate/final/temporal/withheld-public bodies, empirical claims, push, release, and
  publication remain prohibited.

## Durable Round 3RR semantic-correction decision

- External decision: `APPROVE`; blocking findings: none for semantic development-fixture closure.
- The old manifest-ID suite remains permanently quarantined structural/label-oracle plumbing. The
  original signed deviation record must not be rewritten; a separately signed remediation-closure
  record must link that deviation, this response, and the replacement commitments/evidence.
- The new suite is accepted only as semantically executable **development** wiring fixtures. Its
  standalone-runtime execution/oracle separation, eight exact mutable component semantics,
  canonical-request provider, immutable tools, observable verifier, label-blind adapter, adversarial
  leakage tests, replay results, and new commitments satisfy the Round 3R correction.
- Authorized next: deterministic label-blind attribution development on the 28 visible semantic
  traces, prediction commitment before separate oracle scoring, and bounded-mutation/external-
  evaluator dry-run plumbing using synthetic or visible development inputs. All diagnostics and
  candidates must be development-only, non-confirmatory, unauthorized for research evidence, and
  non-promotable.
- The attributor, proposer, runtime, and candidate evaluator may consume only committed label-blind
  evidence and ordinary observable outcomes. They may not receive oracle packages, raw semantic
  packages, target diffs, manifest pairings, fixture mechanisms, expected outcomes, or gate/final
  capabilities.
- Real-provider work, Gate 3 completion, B0–B6, research scheduling/pilot/thresholds, confirmatory
  attribution, gate/final/temporal/withheld-public access, research selection, promotion, canary,
  deployment, empirical claims, push, release, and publication remain prohibited.
