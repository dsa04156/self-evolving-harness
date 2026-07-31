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

## Durable Round 3RRR development-attribution decision

- External decision: `APPROVE`; blocking findings: none for the narrow Round 3RR development scope.
- The prediction-before-label contract is accepted for visible-fixture development diagnostics:
  one committed label-blind input class, a content-addressed and signed 24-trace/28-occurrence
  prediction set, explicit zero/nonzero terminal-status accounting, and scorer oracle access only
  after the durable seal.
- The diagnostic counts (top-1 10, top-3 21, top-8 28) are adaptive public-fixture feedback. They are
  not benchmark accuracy, research attribution performance, an H1–H4 result, or a gate signal.
- One synthetic `WorkflowPolicy` mutation is accepted as bounded plumbing: one declarative operation,
  633 expanded closure bytes, zero immutable/capability diffs, and 7/7 admission checks.
- The separate Python evaluator result is accepted only as transport/result plumbing because it
  consumed hand-authored synthetic pass/fail pairs. It does not show that the candidate repaired a
  task or improved a harness.
- The exact candidate is mechanically non-promotable before the mutation service returns. The signed
  quarantine covers all 18 generated files and denies ten research, claim, promotion, and deployment
  use classes.
- The development packet is closed without completing Gate 3 or authorizing research.
- Authorized next: move prediction/scoring/mutation/evaluation/audit across distinct subordinate OS
  identities with role-owned keys and mounts; enforce the prediction seal at the socket/capability
  boundary; replace precomputed evaluator outcomes with actual standalone-runtime execution on
  synthetic non-benchmark tasks; reject alias, copied-manifest, indirect-reference, and new-record
  laundering; preserve every adaptive development run and extend the append-only quarantine.
- Real-provider use, B0–B6, research scheduling/pilot/thresholds, confirmatory attribution,
  gate/final/temporal/withheld-public access, research selection, promotion/canary/deployment,
  performance/attribution/generalization/security/self-improvement claims, push, release, and
  publication remain prohibited.

## Durable Round 3RRRR process-boundary and publication decision

- External decision: `REVISE`.
- The eight subordinate UID/GID roles, role-owned keys and mounts, delayed scorer capability,
  durable prediction seal, seven rejected release attacks, proposer/oracle separation, actual
  standalone parent/candidate runtime execution, signed evaluator result, recursive
  non-promotability, and independent evidence reconstruction are technically accepted.
- The synthetic result (parent 1/2, candidate 2/2, one fail-to-pass, zero pass-to-fail) remains
  causality/transport evidence only. It is not reusable repair, performance, research attribution,
  containment, or self-evolution evidence.
- The three origin/main updates through implementation commit
  `88e39cdebf1df4db7688fff592363f5f867533ce` and evidence checkpoint
  `a5d82564cece5ecb776a27c86512c3ec56f32787` contradicted the narrower Round 03RRR no-push
  authorization even though the user explicitly requested periodic GitHub updates.
- Public exposure is irreversible. History rewrite or repository deletion cannot restore secrecy.
  Every published artifact and derivative must remain public development material and be denied from
  held-out, sealed, temporal, gate, final, confirmatory, research-selection, research-evidence,
  promotion, and independent-claim roles.
- Authorized next scope is only one corrective commit and push containing the signed publication
  deviation, content-addressed inventory and exposure ledger, permanent validator and specified
  negative tests, append-only closure, six factual root documents, and a narrow resubmission packet.
- Real-provider use, new attribution/scorer/mutation/candidate/runtime/evaluator runs, B0–B6,
  research data or scheduling, promotion, deployment, release, and empirical claims remain
  prohibited until the publication-governance closure is reviewed.

## Durable Round 3RRRRR publication-completeness decision

- External decision: `REVISE`.
- The signed deviation is accepted. The exposure-ledger schema, eligibility constants, artifact
  classes, signatures, alias/blob/content matching, recursive dependency/wrapper/provenance
  propagation, reset denials, separate closure form, clean validation, and claim discipline are
  accepted for artifacts actually indexed.
- The blocking defect is population completeness: `inventory-a5d8256.json` covers one tree, not the
  public union from `c041f740`, `88e39cde`, `a5d82564`, and corrective commit `8b5f1440`.
  Historical-only bytes and corrective-only bytes were therefore outside both the secret scan and
  permanent exposure graph.
- The existing deviation, snapshot inventory, ledger, and premature closure must remain unchanged.
  A historical-union inventory, replacement ledger or extension, expanded scan, five historical
  coverage tests, and signed superseding closure must be appended locally.
- The next verifier must reconstruct the union independently from all recorded public roots and keep
  explicit commits covered even if later unreachable.
- No additional Git push is authorized. The correction and resubmission remain local to avoid
  expanding the public set during accounting.
- No evaluator-vault/authorship work, provider, attribution/scorer/mutation/candidate/evaluator run,
  B0–B6, research data/scheduling, selection, promotion, deployment, release, or empirical claim is
  authorized.

## Durable Round 3RRRRRR historical-publication decision

- External decision: `APPROVE`; blocking findings: none for the four recorded public roots through
  `8b5f14400a7723c821bc54420e55da58dfa7601b`.
- The accepted union contains 64 commits, 456 recursive trees, 878 unique blobs, 19,742 per-commit
  path/mode observations, and 891 transitions. It includes 350 historical-only and 27
  corrective-only blobs.
- The independently repeated scan reports zero actual secret matches, zero actual environment
  files, and no published private key across the recorded public union. This is not a statement
  about dependencies, the host, future commits, or unrecorded systems.
- The replacement ledger binds exactly 1,398 Git objects plus 1,169 embedded content-addressed
  identifiers across all 13 classes. Public bytes remain permanently ineligible for held-out,
  sealed, temporal, gate/final, confirmatory, research-selection/evidence, and promotion use.
- The earlier closure remains byte-identical and explicitly premature. The signed superseding
  closure repairs it append-only without restoring secrecy, eligibility, research authority, or
  promotion authority.
- Clean validation was accepted as 116/116 non-audit tests plus 1/1 isolated Unix audit test. The
  disclosed monolithic missed-close race was not credited and does not establish arbitrary
  concurrent test-runner reliability.
- Authorized next: local deterministic evaluator-vault and independent-authorship trust contracts
  using synthetic metadata only; freeze role keys/mounts/actions, opaque handles, one-way result
  release, access ledger, and fail-closed attacks; add historical-ledger contamination rejections;
  submit a narrow packet.
- No Git push, release, API credential/provider, real gate/final/temporal/withheld-public/
  multi-cause/Terminal-Bench body, research scheduler or B0–B6, pilot/threshold, attribution
  evaluation, selection, promotion, deployment, or empirical claim is authorized.

## Durable Round 3RRRRRRR evaluator-vault decision

- External decision: `REVISE`.
- Accepted: eight distinct principal/key contracts, independent assignment/commit/blind/reviewer-
  decision/vault-finalization chain, rejected-edit retention, all-ten-class historical
  contamination denial, signed included-record admission, protocol/task/authorship/evaluator-bound
  capabilities, commitment-only release projections, identifier-commitment access records, and
  bounded claims.
- The focused trust tests and complete 121/121 deterministic suite were accepted for those
  properties.
- Blocking defect: access records reconstruct request replay but not complete per-task lifecycle.
  A fresh signed request after restart may duplicate unlock/evaluate/score, and two processes can
  race from the same prior state.
- The correction must choose one durable source of task state; bind protocol, contract, handle,
  authorship, prior state record, prior ledger head, actor/key, capability/result commitments and
  successor state; enforce atomic expected-prior-state; and persist/synchronize before any release.
- A durable lease or atomic append/CAS must reject stale writers and recover abandoned ownership.
  Tests must cover two-process conflicts and crashes before/during/after append, synchronization,
  release, acknowledgment, and lease ownership.
- Authorized next scope is only that local deterministic body-free durability correction and a
  narrow packet. No push, real task body, provider/API, research, selection, promotion, deployment,
  release, or empirical/security/self-improvement claim is authorized.

## Durable Round 3RRRRRRRR durable-vault decision

- External decision: `APPROVE`; no blocking findings remain for the deterministic body-free durable
  globally serialized evaluator-vault state contract.
- `vault_state_cas_journal` is accepted as the sole task-state and access-decision authority. The
  lease journal is coordination only; task transitions bind exact global and per-task predecessors.
- Monotonic lease epochs plus signed resource-side writer fences, direct fence-to-transition
  linkage, exclusive expected-head publication, file/directory synchronization, committed-head
  reread, and full reconstruction before response close stale-writer and release-before-durability
  risks under the stated local host/filesystem TCB.
- Restart recovery now reconstructs task state, used capabilities, accepted sequence/nonce,
  evaluation/score commitments, and exact request dispositions. Actual child-process races,
  killed-holder recovery, stale-head rejection, exact retries, and all declared crash boundaries
  produce one successor.
- The approval is not evidence of real-body confidentiality, production containment, distributed
  consistency, provider interoperability, benchmark validity, performance, generalization,
  security certification, or self-improvement.
- Authorized next: a local deterministic body-free OS-principal integration using eight distinct
  subordinate UID/GID roles, role-owned keys/mounts, authenticated transports, the complete
  commitment-only workflow, and OS-level read/write/socket/signal/network denial tests.
- No push, API credential/provider, real task/verifier/label/path data, research scheduler/B0–B6,
  pilot, attribution evaluation, candidate selection, promotion, deployment, release, publication,
  or empirical/security/self-improvement claim is authorized.
