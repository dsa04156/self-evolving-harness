# Gate 2R Runtime and Trust Validation

Status: local correction evidence complete; external Gate 2R ruling pending

Date: 2026-07-31  
Runtime source commit under test: `14e373ee4cf245da8c221be9574aa7528d3202e8`  
Runtime source tree: `f30df800ece4424a1a1bbc0f7f61b2ca108020cd`

## Scope

This report covers only the correction set authorized by the external Gate 2 `REVISE` decision. It
does not report a real-provider call, benchmark evolution, gate/final/temporal/withheld-data access,
live deployment, external repository write, performance result, generalization result, or empirical
self-improvement claim.

The source checkout was clean before the retained OS run. The two generated evidence JSON files were
written only after the exact candidate snapshot had been derived from the detached source commit.

## Reproduction environment

- Node.js `v24.18.1`
- npm `11.18.0`
- Python `3.13.14`
- bubblewrap `0.9.0`
- rootlesskit `2.3.6`
- Linux `7.0.0-28-generic x86_64 GNU/Linux`
- `/usr/bin/newuidmap` and `/usr/bin/newgidmap`: root-owned mode `4755`
- subordinate UID/GID range: `jinuk:231072:65536`

## Commands and outcomes

```text
npm run check
  pass

npm run build
  pass

npm run cli -- check-schemas
  {"compiledSchemas":41}

npm run cli -- demo
  state=completed
  verificationPassed=true
  modelCalls=2
  toolCalls=1
  eventCount=14
  eventHeadHash=sha256:40b62c69a361d61928a9e8319bb766505e8e5eeec249298aabea961421dacd45

SEH_REQUIRE_OS_BOUNDARY=1 npm run test:coverage
  tests=38
  pass=38
  fail=0
  cancelled=0
  skipped=0
  todo=0
  line=92.06%
  branch=85.89%
  function=89.03%
```

The full suite includes the cross-language canonical corpus, component graph and immutable-diff
checks, event and receipt chains, deterministic standalone loop, interruption race, process-group
revocation, six durable reference-hold kinds, every three-stage termination crash boundary, every
eight-stage evaluator crash boundary, deployment/rollback CAS, exact Git snapshot materialization,
and the mandatory subordinate-UID path.

## Actual OS-principal evidence

The retained targeted command was:

```text
SEH_REQUIRE_OS_BOUNDARY=1 \
SEH_OS_EVIDENCE_OUTPUT=architect/evidence/gate2r/os-principal-evidence.json \
npx -y node@24.18.1 --import tsx --test test/os-principal-boundary.test.ts
```

It completed with one pass and zero fail/cancel/skip/todo. The path used one rootless subordinate-ID
namespace and five distinct mapped role identities:

| Role | Inner UID/GID | Observed host UID |
|---|---:|---:|
| operations | 1101 | 232172 |
| runtime | 1102 | 232173 |
| evaluator | 1103 | 232174 |
| promoter | 1104 | 232175 |
| audit | 1105 | 232176 |

Each role proved possession of only its own mode-0600 key, had zero effective capabilities and
`NoNewPrivs=1`, and was denied the other four private keys for both read and write. Cross-principal
signal and ptrace probes, direct IP network access, and unauthorized normal-socket connection were
denied.

The normal operations transaction observed evaluator UID/GID `1103/1103` and audit UID/GID
`1105/1105` through kernel peer credentials and then verified pinned Ed25519 identities. It produced
one independently signed external evaluation with `pass→fail=0` and `fail→pass=1`. The candidate
snapshot hash in the request, evaluator result, evidence, and descriptor was:

```text
sha256:31cd051b667c23a8769be80546248cc20e7990c8d0e286123b16556a951aeb65
```

The descriptor binds source commit `14e373ee4cf245da8c221be9574aa7528d3202e8`, tree
`f30df800ece4424a1a1bbc0f7f61b2ca108020cd`, and 238 exact entries.

All 11 wire adversarial modes were rejected without an `evaluation_final`: partial, oversized,
downgrade, wrong role, wrong key, bad signature, schema-invalid payload, snapshot mismatch, replay,
extra frame, and peer crash. Separate runs rejected a world-connectable wrong client UID and an
impostor server UID. These results support only the declared local isolation cases under the recorded
kernel/rootlesskit/bubblewrap and administrator assumptions.

## Retained evidence

```text
architect/evidence/gate2r/os-principal-evidence.json
  SHA-256 9b637be156719c67fd11a72fdf0bb000bca9c5d8dee2d72bf033b38d263d459e

architect/evidence/gate2r/candidate-filesystem-snapshot.json
  SHA-256 2ab94a3f4cb86f9c67cc9caf6e787e593a8d5a57dc824945da477319e71e3e7a
```

The same-UID Unix transport test remains explicitly labelled emulation and is not used as
OS-containment evidence.

## Remaining bounded work

- Complete session-definition signature/field-coverage proof remains required before Gate 3.
- The matched-budget B0–B6 scheduler and mine-only numeric pilot freeze remain required before any
  empirical evolution work.
- Real-provider smoke, benchmark access, live deployment, push, release, and performance/security
  claims remain prohibited until the Architect authorizes their exact next scope.

