# Threat Model

Status: Gate 3 readiness candidate; no broad production-containment claim
Scope: standalone runtime, component/evolution registries, local candidate execution, evaluation, and
promotion

## Assets and required properties

| Asset | Required property |
|---|---|
| production whole-harness target/rollback tuple | authentic approved composition, atomic CAS, availability, exact null/deploy/swap resolution |
| component/type/protocol manifests | stable content identity, authentic protocol provenance |
| evaluator, verifier, permission/safety/budget/model/promotion/tool/optimizer pins | denied candidate write, digest integrity, protocol separation |
| benchmark tasks, split, verifier details, temporal authoring | role-appropriate confidentiality, frozen semantics, contamination disclosure |
| runtime state, memory, workspace, checkpoints, caches, descendants | declared starting state, isolation, inheritance, replayability |
| events, receipts, decisions, activation and audit history | authenticated provenance, ordering, tamper evidence, negative-result retention |
| user files, credentials, provider tokens | least privilege, confidentiality, bounded egress |
| model/tool/feedback/cost ledger | complete host-side accounting |

## Trust and adversaries

Untrusted:

- model output, task/user/repository text, mutable memory, candidate payload, proposer output;
- candidate worktree, Git metadata, runtime workspace, database projections;
- a compromised or prompt-injected runtime/tool child within its granted sandbox.

Potentially adversarial:

- a proposer reward-hacking gates;
- a candidate attempting capability or executable-content smuggling;
- concurrent/crashed principals, stale owners, replayed messages, dependency compromise;
- an operator making protocol/split/mount mistakes;
- benchmark author bias or model pretraining contamination;
- provider drift or inaccurate/late usage telemetry.

Trusted within the MVP TCB:

- Linux kernel/container enforcement and bootstrapping administrator;
- protocol author key and pinned trust-plane executables/policies;
- evaluator, promoter, provider proxy, deployment registry, audit verifier and their keys.

A malicious host root/kernel can defeat the design and is outside the containment claim. An audit
operator controlling storage and all signing/checkpoint keys can rewrite full history. A provider is not
assumed to reveal immutable weights. These are residual limits, not solved threats.

## Threat/control/acceptance matrix

| Threat | Machine control | Required adversarial evidence | Residual risk |
|---|---|---|---|
| Lifecycle/evaluation append changes a content ID | immutable manifest identity excludes all external records; recompute `seh-c14n-int-v1` digest | append records and prove component/harness IDs unchanged | canonicalizer bug |
| Candidate self-declares mutable class/type/provenance | protocol-pinned type registry; trusted registry writes provenance | spoofed type/mutability/provenance rejected | compromised protocol author |
| Skill/workflow smuggles code, imports, hook, download, archive, encoded payload, or external file | closed JSON DSL, no-network parser, file/object restrictions, string/AST scan | corpus covering every forbidden construct and nested/obfuscated variants | novel semantic prompt attack without extra authority |
| Small reference edit replaces large/multiple behavior | full transitive closure expansion, artifact rehash, changed-family and size-vector accounting | reference-swap fixture charged/rejected | semantic magnitude is imperfect |
| Candidate edits evaluator, policies, model, budget, data, tool code, middleware, optimizer, or schemas | proposer allowlist, immutable pins/mounts, closure diff, protocol ID | direct, transitive, symlink, generated, and artifact replacement tests | build supply-chain compromise |
| Memory/workspace/cache/checkpoint contaminates paired evaluation | immutable runtime-state snapshot, fresh overlays, independent stores | hidden-state and foreign-checkpoint tests | provider-side state not fully observable |
| Child/job rebinds deployed harness, model, split, principal, or budget | signed inheritance envelope and broker checks; no deployment-channel access | every inherited field modification rejected; orphan cancellation | external job cancellation lag |
| Evaluator or promoter impersonation | separate UID/container/key, peer credentials, Ed25519 envelope, record-type authority | wrong UID/key/role/message/schema rejected | key/host compromise |
| TypeScript/Python sign different bytes | protocol-versioned integer-only canonical domain; duplicate/fraction/unsafe integer/lone-surrogate rejection; one three-consumer golden corpus | valid bytes/digests equal and every negative vector has the same frozen rejection category | canonicalizer implementation defect |
| Replay, truncation, oversized payload, confused response, protocol downgrade, or peer crash | length framing, limits, hash, sequence/nonce/expiry, correlation, closed errors | replay/partial/extra/oversized/cross-correlation/cross-protocol/crash tests | denial of service |
| Dirty or substituted worktree bytes reach evaluator | require an exact clean commit; reject ignored/untracked/link/special objects; materialize committed blobs; evaluator independently verifies descriptor, blob ID, bytes, mode, exact path set, and request/result snapshot pin | dirty/ignored/symlink/hardlink/post-freeze/mode/snapshot-mismatch cases rejected | compromised bootstrapping host or Git implementation |
| Proposer reads gate/test/verifier or infers it adaptively | absent mounts, opaque handles, deny egress, fixed one-shot release fields/count | path/canary/error/side-channel probes; feedback cap exhaustion | aggregate leakage; public-model contamination |
| Final test affects qualification/deployment/tuning/rollback | metric-to-split authorization and promoter rejection | final-role result supplied to promoter is rejected | human may launch a new exploratory protocol after seeing results |
| Gate aggregate influences a later confirmatory protocol | one-shot gate capability; promoter/audit-only evidence until final closure; fresh gate after human release | pre-final recipient and second-unlock probes rejected | gate is consumed even if the run is disappointing |
| Abnormal session is killed or its cause changes during cleanup | `terminating → terminated`, immutable transaction descriptor, direct initiating-record reference, descendant/capability revocation, process reap, sealed accounting/evidence | every reason, descriptor-drift/conflicting-final, crash-during-termination, orphan and resume tests | malicious host outside TCB |
| Temporal tasks are tailored to candidate | blinded independent authors, frozen inclusion rules/hashes/verifiers, no result access | authorship/access log review | author priors and small sample |
| Public Terminal-Bench is misrepresented as sealed | “withheld public test” label and contamination report | terminology/static report check | unknown pretraining exposure |
| Tool path traversal, symlink race, device/FIFO/socket, hardlink, ADS | descriptor-relative access, special/link rejection, fresh namespace | cross-platform malicious filesystem corpus | kernel/filesystem defects |
| Bash escapes root, forks indefinitely, networks, or survives owner | container/UID, seccomp/capability drop, cgroup/process group, egress deny, timeout/kill | escape/fork/network/timeout/orphan tests | kernel/container vulnerability |
| Secret exfiltration via provider/log/artifact/error/subprocess | proxy-only key, scoped env, deny egress, redaction, output cap, seeded-secret scan | all-store and outbound secret scan, encoded exfiltration probes | semantic encoding may bypass redaction |
| Candidate forges tool/verifier/usage/audit receipt | principal key and record-type authority, broker-side ledger, chain verification | forged signer/hash/sequence/usage rejection | trusted-key compromise |
| Trace deletion/reorder/rewriting | signed sequence/hash chain, artifact hashes, published heads/checkpoints | missing/reordered/modified replay detection | privileged deletion hurts availability |
| Model/tool/feedback compute is laundered through roles/caches/failures | sole provider/tool broker, shared phase account, charge all attempts/statuses | hidden-role, cancelled, cached, retry and subagent accounting tests | provider billing/telemetry ambiguity |
| Model alias silently drifts | pinned exposed identity/parameters, request IDs, probe/disclosure, reproducibility tier | mismatch/drift report and invalidation rule | opaque service-side updates |
| Browser login is mistaken for provider authority | real-provider runner accepts only the preregistered protected-file credential slot; browser cookies/session data are never read or mounted | absent `OPENAI_API_KEY` fails before artifact creation or network; validation mode does not inspect credentials | operator may still provision the wrong API project/key |
| Runtime, proposer, evaluator, promoter, or audit reads the provider key | only provider UID 1106 owns the 0600 credential and signing key; runtime UID 1102 receives only an authenticated Unix capability | subordinate-UID probe denies cross-read/write, signal, and ptrace; runtime integration records denied credential read | malicious host root/kernel remains outside the claim |
| Credential-owning provider bypasses the egress policy | provider and runtime use independent `--unshare-net` sandboxes; credential-blind egress UID 1107 alone retains network | both role probes report direct network denial; CONNECT broker test rejects a non-allowlisted destination | compromised bootstrap host can replace namespaces or mounts |
| Egress broker receives the provider credential or terminates TLS | broker mounts neither vault nor public provider config; it authenticates provider `SO_PEERCRED`, admits one exact CONNECT target, and relays opaque bytes; TLS/SNI/certificate validation remains in provider UID | broker credential-mount and TLS-termination fields are fixed false; broker stdout must be empty; secret scan covers subprocess output and evidence | traffic size/timing and destination remain visible to the broker |
| Smoke plan, price, broker, or egress policy changes after review | closed preregistration schema, canonical plan/pricing hash, raw broker-byte hash, canonical policy hash, clean committed source, and pre/during/post source checks | model/cap/price/broker/policy drift and symlinked artifacts fail before a call | a malicious host can race and restore bytes between checks |
| Provider returns a different model than requested | adapter records requested alias and provider-reported model; proxy accepts only the alias or its dated snapshot form and signs the observed value | deterministic adapter test plus accepted dated snapshot and rejected unrelated-model receipts | provider may misreport its own internal serving identity |
| Provider failure avoids accounting | exactly one attempt is frozen; missing usage charges the full token/cost reservation; overage suppresses the response and emits `budget_exhausted` | deterministic failed-call, overage, replay, and restart tests | provider billing can still disagree with API telemetry |
| Gate is overfit through repeated aggregates | finite candidate batch, one non-adaptive gate selection, fixed released fields, every release charged | second query/refinement request denied | first aggregate still informs selection by design |
| Task retry or prompt reinjection is relabelled as harness evolution | signed evolution-run journal requires a candidate `HarnessVersion` whose ID differs from its parent and records proposal/evaluation lineage | same-ID candidate, illegal transition, and committed-ID substitution tests reject | semantic no-op changes can still receive a different content ID and require evaluation scrutiny |
| Static admission is misreported as a successful mutation | proposal disposition is `pending → admitted → accepted or rejected`; only a final evaluator-bound qualification decision resolves it | admission-only, evaluator-failure, approval, and rejection tests | an external report may still misuse the term “accepted” outside the registry |
| Signed evaluator output bypasses matched-budget or receipt checks | coordinator independently recomputes paired-task counts, targeted repair, regressions, token cost, safety/permission counts, candidate snapshot binding, and verified receipt linkage before promotion | malformed counts, cost overage, snapshot mismatch, missing/foreign receipt, and wrong-signer tests | policy implementation bug inside the trusted coordinator/promoter |
| Evaluator failure leaves a candidate eligible or triggers adaptive replacement | one evaluator attempt transitions the run to `failed`, rejects the proposal, preserves the parent, and creates no replacement candidate | evaluator-crash/failure test plus duplicate rejected-mutation denial | a human may start a separately identified protocol after inspecting operational failure |
| Candidate isolation receipt is detached from evaluated bytes | canonical closure bundle, deterministic one-path Git commit, base/head/tree/blob/mode/byte descriptor, read-only materialization, receipt artifacts, evaluator-side bundle and request binding | false bundle ID, dirty tree, byte/mode mutation, candidate-ID mismatch, snapshot mismatch, signer, receipt-presence, and subordinate-UID transaction tests | malicious host root/kernel remains outside the TCB |
| Qualification is laundered into deployment or per-component activation | separate approval and production-pointer decisions; whole-harness CAS only | approved-without-deploy and mixed-component pointer tests | registry implementation defect |
| Concurrent promotion loses parent/rollback lineage | expected generation, prior pointer hash, parent ID, registry serialization | stale and concurrent CAS tests | distributed registry outside MVP |
| Retirement deletes an in-use harness or crash leaves authority unresolved | signed holds for production, rollback, live session/descendant, pending evaluation/deployment; stage journals for evaluator and termination; idempotent restart reconciliation | each hold blocks retirement; crash injected before/after every durable boundary; exactly one completion/result and no orphan hold | host/storage loss outside replicated MVP |
| Rollback target missing or modified | content addressing, preactivation resolution/retention, rehash on rollback | deletion/substitution and exact restoration tests | catastrophic loss of all replicas |
| Protocol evidence is mixed after evaluator/policy change | protocol-scoped pinning in every record and analysis | cross-protocol result aggregation rejected | reporting mistake outside tooling |
| License-contaminated prior-art code enters runtime | clean-room implementation, source/license/provenance ledger, spike exclusion | import/copy/license/dependency review | generated-code provenance ambiguity |

## Self-evolution abuse cases

1. **Self-certification:** proposer emits a passing artifact. It remains inference/untrusted data; only the
   evaluator key can emit verifier outcomes.
2. **Mutation laundering:** one changed manifest points at several new dependencies. Closure comparison
   counts all families and rejects scope overflow.
3. **Capability laundering:** a prompt says “ignore permissions” or a workflow names a new route. Text
   has no authority; derived capability expansion rejects the candidate.
4. **Benchmark memorization:** gate feedback is written to memory and used for another proposal. Protocol
   permits one mine-generated batch and one gate selection, then closes the gate capability.
5. **Compute laundering:** proposer delegates hidden model work. Every provider call requires a
   phase-account capability at the sole proxy.
6. **Production-pointer race:** candidate evaluated from parent A while B deploys. Whole-harness CAS fails;
   no implicit rebase.
7. **Rollback erasure:** candidate removes A. It has no registry write capability; activation first
   resolves and retains the rollback closure.
8. **Meta-evolution disguise:** candidate changes optimizer/evaluator through a “skill.” Closed payload
   schemas and immutable type bindings prevent executable/control-plane substitution.
9. **Retry disguise:** an execution failure is retried and presented as an evolved harness. The
   evolution journal rejects a candidate equal to its parent and requires independent evaluation before
   a qualification decision.
10. **Admission laundering:** schema-valid bytes are called “accepted.” Static admission can only write
    `admitted`; independent evaluation and promotion must write the final proposal disposition.

## Acceptance boundary

Gate 1R may approve only the implementable contracts. Gate 2 requires deterministic and OS-boundary
adversarial evidence. An `isolation_emulated` result proves logic only. Any immutable-boundary violation,
test leakage, evaluator impersonation, protocol mixing, or non-atomic activation is a final `BLOCK`
regardless of task performance.

The Gate 3 provider path adds a narrower acceptance rule: deterministic controls and fake-provider OS
evidence do not count as a real-provider result. A successful provider smoke additionally requires one
signed receipt from the preregistered real plan, exact synthetic output, zero secret exposure, and the
three-principal runtime/provider/egress evidence. Until that artifact exists, provider invocation remains
`not_executed`; benchmark, pilot, gate, final, temporal, promotion, and performance/self-improvement
claims remain unauthorized.

The current coordinator materializes the exact component closure as a canonical bundle, commits only
that fixed file in a detached worktree, freezes and materializes the complete read-only snapshot, and
passes it to a separately keyed external Python evaluator. The fast test uses `isolation_emulated`; the
required OS track repeats the registry-generated bundle transaction across operations UID 1101 and
evaluator UID 1103 with no-network namespaces and authenticated sockets. Evidence is stored under
`architect/evidence/candidate-bundle-os/`. The result is still bounded by the local Linux/rootless TCB;
it does not defend against malicious host root, kernel, or storage loss.
