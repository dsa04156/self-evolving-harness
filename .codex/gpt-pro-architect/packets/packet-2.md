# Architect Packet 2 — Runtime and Trust Evidence

## Metadata

- Repo: `self-evolving-harness`
- Branch: `main`
- Commit under review: `91dd84f555740fe2819f6d6e1436d7030c6ce596`
- Packet date: 2026-07-30
- Previous packet: Gate 1RRR, SHA-256
  `9157fdb191034643d8e0682171daed1314208bff47e244031fa14e2ade03c41d`
- Previous response: `APPROVE`, SHA-256
  `32b7b0841baff34177dcc39ac3092873df32d5c7cb48519ca3548cb64e3c3b82`
- Current question: does the implementation pass Gate 2, and if not, what is the minimum
  non-waivable correction set?

## Approval and transmission scope

- Destination: the existing project-specific ChatGPT.com Architect conversation.
- Transport: Oracle CLI 0.16.1, attached to recorded endpoint `127.0.0.1:9222` and exact existing tab.
- Data: this redacted packet only—architecture summary, interface names, test totals, limitations, and
  content hashes.
- Excluded: credentials, environment values, private keys, source archive, raw traces, benchmark
  contents, sealed data, screenshots, provider requests, personal data, and repository writes.
- No paid provider, benchmark, gate/final data, live deployment, push, or release is authorized here.

## Canonical memory

Gate 1RRR approved only bounded local implementation and deterministic verification under draft-1:
standalone runtime/fakes, immutable registries and validators, deployment CAS, abnormal termination,
authenticated local transport and real OS-boundary tests, bounded declarative mutation, isolated
candidate/evaluator, and offline promotion/rejection/rollback. It explicitly withheld provider,
benchmark, live-deployment, performance, generalization, and security claims.

The project still distinguishes:

```text
task retry/recovery:
  same HarnessVersion, same task lifecycle

harness evolution:
  multi-trace weakness mining
  → signed attribution
  → bounded declarative component mutation
  → new candidate HarnessVersion
  → independent gate evaluation
  → recorded promote/reject/rollback decision
```

## Since Gate 1RRR

Two implementation commits were added:

- `c0920b7`: standalone runtime kernel and trust foundations.
- `91dd84f`: governed evolution, external evaluator, deployment, and deterministic tests.

At evidence collection, commit `91dd84f` had no source diff. The review-only delta prepared afterward
contains this packet, its local transport copy, the Gate 2 validation report, and three documentation
status-line corrections; no runtime, evaluator, schema, test, benchmark, or policy bytes changed after
testing.

No existing harness is used as the execution backend. The runtime directly owns provider calls,
context construction, model/tool iteration, tools, memory, skills, descendants/jobs, sessions,
permissions, verification, evidence, candidate construction, and lifecycle decisions.

### Implemented planes

| Plane | Implemented evidence | Disposition |
|---|---|---|
| Agent Runtime Kernel | provider interface, fake provider, OpenAI Responses adapter, context/model/tool/verifier loop, budgets | implemented locally |
| Harness Component | versioned type registry, payload artifacts, graph/closure checks, harness manifests | partial contract correction required |
| Operations Control | start/submit/observe/interrupt/resume/recover/validate/finalize/retire responses with state/evidence/actions | implemented logically |
| Evidence | epistemic event classes, redaction, signed receipts, append-only hash chains | implemented locally |
| Evolution Control | weakness clustering, signed attribution, bounded patch, rejected-edit memory, candidate admission, evaluation, decisions | implemented deterministically |
| Immutable Trust | signatures, role/replay/deadline/hash checks, bwrap namespaces, exact deployment CAS | partial; OS principal boundary is emulated |

The runtime exposes read/write/edit/bash/git-status/git-diff; filesystem memory; declarative skills;
subagent and backend-job descriptors with inherited pins, permissions, and budget; content-addressed
runtime-state snapshots; and deterministic fake verification.

Candidate mutation is limited to one or two allowlisted declarative components. Admission independently
recomputes the before/after surface, rejects immutable or disabled component changes, creates a new
HarnessVersion, records lineage, and advances a separate qualification lifecycle. Git worktrees are
used only for filesystem isolation; registries and content hashes remain authoritative.

The evaluator is a Python 3.13 process launched in a fresh bubblewrap namespace with no network and
read-only inputs. Requests and results use signed, deadline/replay/hash-checked envelopes. The promoter
revalidates evaluator signatures, policy pins, candidate lineage, result roles, and integer cost gates.
The deployment registry separately authorizes and appends initialize/deploy/rollback/decommission
records using full-tuple CAS; rollback mechanically swaps target and rollback tuples.

## Fresh evidence

Environment:

```text
Node.js v24.18.1
Python 3.13.14
bubblewrap 0.9.0
Linux 7.0.0-28-generic x86_64
```

Commands and results:

```text
npm run test:coverage
  tests=20 pass=20 fail=0 cancelled=0 skipped=0 pending=0
  line=91.53% branch=86.72% functions=88.26%

npm run build
  PASS

npm run cli -- check-schemas
  {"compiledSchemas":34}

npm run cli -- demo
  state=completed verificationPassed=true
  modelCalls=2 toolCalls=1 eventCount=14
```

The deterministic suite covers:

- identical event-chain replay from independent roots using a test-only fixed signing seed;
- model → tool → model → verifier completion and budget accounting;
- all schemas, strict JSON, signature/role/deadline/replay checks, artifact/log tampering;
- traversal, symlink, hardlink, special ancestry, host-path, network, environment, timeout, and output
  denial;
- interruption winning over a late successful executor result;
- descendant pin/permission/budget widening denial;
- all behavior-bearing runtime-state families changing snapshot identity;
- fact/inference separation, signed attribution, bounded mutation, immutable diff denial;
- external evaluator request/result authentication;
- candidate worktree isolation;
- qualification/promotion/rejection and exact production pointer initialize/deploy/rollback semantics.

Selected artifact hashes:

```text
package-lock.json                    6067e8a69a6adfbf2f0f5eb7f395b5afb6dd114b74c131e55cd3f3c8986d3ed2
evaluator/external_evaluator.py      90c516a091bd39e72dd35f605d0d32c40098db48249e66cbec4bdb4e4d8bc434
src/runtime/agent-loop.ts            b2e5aa46474e3848499a42fecd5b2206de45091448775576304ddb2504b0bf88
src/runtime/standalone.ts            af0c1233389c0f6d7a15c40b7b32a2dd3ea062f4d51f22bdc8f5108ce131b69b
src/operations/control-plane.ts      48c63980fe4c5deb8c868ff1df3dce292dc585e513d6e8bdc232fd0daf8cc3f5
src/evolution/external-evaluator.ts  b4d6e7848d113e87429cc0025cb48562b59dccda103c47f702fa9a36ab590ac0
src/evolution/candidate-admission.ts 2f83f20aa29058ac1d82f6fa99d1aa934d65768bc1ae0a540f85bcf96e593b6b
src/evolution/promotion.ts           d513cf0baa1fc6850501c9fe861f8f499cb89c9eb69265fb8bf3cafadbc73261
src/evolution/deployment.ts          68bc483c69f9533e0e0febe6366deb934d5eb8af8231e84272f61014604d08a2
```

## Contract deviations and evidence gaps

These are disclosed as blockers or revision candidates, not waived limitations:

1. **Principal isolation:** controller/runtime/evaluator use the same host UID. bubblewrap provides
   no-network mount/process isolation, but this remains `isolation_emulated`. The accepted Gate 2 rule
   requires distinct principal identity/container enforcement and zero unauthorized access.
2. **Transport boundary:** envelope/framing/auth/replay logic exists, but the evaluator path does not yet
   use a dedicated Unix socket with peer-credential verification. The controller can potentially reach
   evaluator key paths as the same host principal.
3. **Component fixed point:** the approved schema puts `behaviorClosure` inside identity while the
   closure prose could include the final manifest ID. The implementation avoids the impossible hash
   cycle by using `identity - behaviorClosure` for closure-node IDs, then hashes the full identity for
   the final ID. The contract/schema does not explicitly name this intrinsic-ID rule.
4. **Capability preimage:** a component manifest carries `capabilityDigest`; sorted capability IDs are
   persisted beside the manifest in the registry log, not through a manifest-declared content-addressed
   preimage reference.
5. **Lifecycle and recovery:** retirement-reference holds and process-crash recovery during an active
   termination/evaluator transaction are not end-to-end complete.
6. **Session attestation:** the full session definition is append-hash protected and its lifecycle pins
   are signed, but the initial definition is not separately signed as one complete object.
7. **Cancellation:** model calls receive an abort signal; the tool execution context does not yet
   propagate that signal.
8. **Evaluator canonicalization:** the Python canonicalizer is deterministic for constrained protocol
   messages, not a complete general RFC 8785 number implementation.
9. **Worktree snapshot:** the Git tree hash excludes untracked content; status records it. Git is not an
   authority boundary.
10. **Evaluation machinery:** B0-B6 contracts and phase ledgers exist, but the matched-budget scheduler
    and pilot numeric freeze are not implemented. No evolution-performance result exists.

Accordingly, the local conclusion is that deterministic runtime/evolution machinery is demonstrated,
but strict Gate 2 security acceptance is not.

## Decision needed

Judge the current Gate 2 submission against the already frozen standard; do not lower that standard.

- Return `APPROVE` only if all required Gate 2 runtime and trust evidence is actually present.
- If `REVISE`, identify the smallest ordered correction set that must be implemented before
  resubmission, including which of the ten gaps are blocking versus deferrable.
- State whether real-provider smoke must remain blocked until that correction set passes.
- Do not authorize benchmark/gate/final access or empirical self-improvement claims in this round.

## Required response format

```text
DECISION: APPROVE | REVISE | BLOCK

NOVELTY:
CORRECTNESS:
REPRODUCIBILITY:
SECURITY:
CLAIM DISCIPLINE:

BLOCKING FINDINGS:
DEFERRABLE FINDINGS:
MINIMUM ORDERED CORRECTIONS:
AUTHORIZED NEXT SCOPE:
```
