# Architect Packet 04 — Deterministic MVP Final Evidence

## Metadata

- repository: `dsa04156/self-evolving-harness`
- branch: `main`
- baseline commit: `8a936d71a8b39f315a07abd920514a1c8048af6d`
- candidate: current uncommitted completion diff (21 modified files plus 8 new files)
- packet date: 2026-08-03
- previous packet: `architect/PACKET_03R23_CALIBRATION_TERMINAL_EVIDENCE_CORRECTION.md`
- goal: decide whether the standalone deterministic MVP is complete and whether the empirical claim
  must remain REVISE

## Approval and disclosure scope

- destination: the existing ChatGPT.com GPT Pro architect conversation
- transport: exact existing Chrome/CDP tab; no API
- data categories: implementation summary, selected interface behavior, test counts, changed-file names,
  limitations, and claim boundary
- excluded: source archive, credentials, environment values, cookies, private keys, raw traces, sealed
  tasks, benchmark bodies, personal data, and live provider calls
- user authority: the user explicitly requested use of the GPT Pro architect loop and authorized the
  planned repository/review workflow; this packet does not broaden benchmark/provider authority

## Decision requested

Judge only these questions:

1. Does the current candidate close the deterministic standalone-runtime MVP without becoming a
   Codex/Gajae/OpenCode wrapper?
2. Is the deliberate split between harness qualification (`approved`) and deployment
   (`active pointer` / signed rollback operation) a valid, safer implementation of the requested
   active/rolled-back lifecycle?
3. Are the implementation PASS and empirical REVISE verdicts supported by the evidence below?
4. Is there any blocking correctness, trust-boundary, reproducibility, or claim-discipline defect
   that must be fixed before commit and push?

Do not treat this review as evaluator evidence, provider evidence, promotion authority, or permission
to access sealed data.

## Since the prior packet

### Runtime integration

- Added `createManagedStandaloneRuntime`, joining the owned kernel to:
  - signed session start/submit/finalize;
  - lifecycle records;
  - evidence receipts;
  - audit verification;
  - runtime events and artifacts.
- The no-key CLI demo now runs:
  `start → context → FakeProvider → tool → verifier → completed → retired`.
- No runtime code invokes Codex, Gajae-Code, OpenCode, NexAU, or another coding harness.

### Operations API closure

The Operations Control Plane now implements:

`start, submit, observe, interrupt, terminate, resume, recover, validate, finalize, retire, events, artifacts`

Every response retains `{state, evidence, nextAllowedActions}`. Events and artifacts are explicitly
non-authoritative projections; signed receipts and lifecycle records remain authoritative.
`nextAllowedActions` was reconciled with actual callable methods.

### Descendants and shared authority

- Added schema-v2 signed descendant records for subagents and backend jobs.
- Records bind parent session, complete SessionPins, task/command hash, delegated budget, permission
  ceiling, artifact/failure disposition, runtime principal, and signature.
- Replay verifies schema, signature, unique record IDs, legal transitions, stable pins, stable task,
  stable budget, and stable permissions.
- Delegated `BudgetAccount` usage now charges both child and parent for model calls, tokens, tools,
  retries, descendants, and wall time.
- Orphan recovery records an `orphan_reaped` terminal state.

### Lifecycle interpretation

The immutable HarnessVersion manifest has no mutable active state.

```text
qualification:
draft → candidate → statically_validated → evaluating → canary
      → approved/rejected → retired

deployment:
null → active exact pointer A → deploy B → rollback to A → decommission
```

Approval cannot deploy. Deployment cannot rewrite qualification. Rollback is an exact signed
compare-and-swap of complete target/rollback tuples and never erases history. Existing sessions remain
pinned. Documentation now consistently represents requested `active` as the deployment projection and
requested `rolled_back` as a signed deployment operation.

### Research and shipping documentation

Added or completed:

- `README.md`
- `CHANGELOG.md`
- `docs/completion/acceptance-matrix.md`
- `docs/research/related-work.md`
- `docs/evaluation/final-report.md`
- `paper/draft.md`
- current architecture, scope, claims, security, reproducibility, state-machine, and obligation docs

The paper separates observed implementation facts from unexecuted hypotheses and cites exact prior-art
SHAs. It claims no individual mechanism as novel.

## Component and trust boundaries

MVP mutation remains limited to:

- SystemPrompt
- ContextPolicy
- MemoryRetrievalPolicy
- Skill
- WorkflowPolicy
- RoutingPolicy
- SubagentPrompt
- ToolDescription

Evaluator, benchmark/test data, permission/safety policy, budgets, model identity, trace/audit,
promotion policy, ToolImplementation, middleware, and optimizer code remain immutable and outside
candidate authority.

Public development artifacts and all transitive derivatives remain
`publicDevelopment=true`, `authorizedForResearchEvidence=false`. Renaming, protocol changes, history
rewrites, and deletion cannot restore eligibility.

## Verification evidence

The final command was run on the candidate worktree:

```text
npm run verify:release
exit: 0

TypeScript check: PASS
build: PASS
tests: 201
pass: 201
fail: 0
skipped: 0
JSON Schemas compiled: 131
managed CLI demo: completed, retired, verificationPassed=true
development-process verifier: verified=true, roles=8, providerUsed=false,
  researchEvidenceAuthorized=false, promotionAuthorized=false
publication governance: PASS, secrets=0
historical publication governance: PASS, secrets=0
trust-plane conformance: verified=true, authoritiesGranted=0,
  outstandingObligationCount=7
```

The first release attempt exposed two local defects:

1. an Operations next-action test retained the old expected projection;
2. an HFB development runtime used a nonstandard SessionPins role,
   `deterministic_development`.

The implementation was corrected rather than suppressing validation: next actions now match callable
methods, SessionPins use the closed `deterministic` role, and separate governance records continue to
carry development-only/non-promotable status. The focused tests then passed 5/5, and the full release
gate passed 201/201.

A later documentation verifier required the permanent public-development boundary in README. The
boundary was restored, the governance verifiers passed independently, and the complete release command
was rerun to exit 0.

## Secrets and external execution

- No live provider/API call was made.
- No Platform API key was read or required.
- Current/historical secret governance reports zero actual secrets.
- Repository-wide key-shaped matches are intentional negative-test sentinels, variable names, public
  keys, or historical scan descriptions; persisted verifiers reject actual private material.
- The external review packet contains no key-shaped values.

## Claim boundary and final local verdict

### Deterministic implementation

- standalone runtime: PASS
- task/evolution lifecycle separation: PASS
- bounded component authority: PASS
- operations/evidence/recovery: PASS
- candidate isolation/external evaluator: PASS within the documented local TCB
- qualification/deploy/rollback audit history: PASS
- reproducibility: PASS for the deterministic no-provider profile

### Empirical research

- H1 attribution-guided regression reduction: NOT TESTED
- H2 held-out reusable improvement: NOT TESTED
- H3 evidence-token efficiency: NOT TESTED
- H4 cross-model transfer: NOT TESTED
- B0–B6 provider experiment: NOT RUN
- sealed/temporal evaluation: NOT RUN

Therefore the local final decision is:

- deterministic MVP: APPROVE/PASS
- architecture artifact contribution: supported within scope
- empirical self-evolution/generalization/performance claim: REVISE
- overall research claim: REVISE, not APPROVE

A future result becomes BLOCK if it leaks gate/final data, changes immutable components, uses unmatched
compute, fails audit replay, or cannot reproduce the frozen protocol.

## Required response format

Decision: APPROVE | REVISE | BLOCK

Rationale:

Required changes:

Risks/missing evidence:

Next packet request:
