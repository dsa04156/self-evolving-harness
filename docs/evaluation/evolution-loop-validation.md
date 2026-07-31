# First-Class Evolution Loop Validation

Status: deterministic architectural-conformance evidence; no research-performance result

Resource profile: `NP-1`

## Frozen implementation under test

- commit: `222b9209203a6f5b38dac41aebe89b2cfdc652e0`
- tree: `7ee7e54415a75418700de7d7b34d65616e6927bc`
- implementation: `src/evolution/evolution-loop.ts`
- isolation: `src/evolution/candidate-bundle.ts`
- external bridge: `src/evolution/worktree-evaluation-executor.ts`
- schemas: `schemas/evolution-run-record.schema.json`,
  `schemas/candidate-harness-bundle.schema.json`
- tests: `test/evolution-loop.test.ts`

This implementation creates a distinct signed `EvolutionRunRecord` lifecycle and composes weakness
mining, attribution, bounded mutation, candidate creation, static admission, evaluator preparation,
independent evaluation, and qualification. It does not use Codex CLI or another coding-agent runtime as
an execution backend.

## Validation results

All commands were executed from the repository root with no provider credential and no research-data
role enabled.

| Validation | Result |
|---|---|
| TypeScript no-emit check | pass |
| TypeScript build | pass |
| JSON Schema compilation | pass, 55 schemas |
| Complete deterministic test suite | pass, 64/64 |
| OS-principal boundary mode | pass |
| External evaluator crash recovery | pass |
| candidate closure → Git commit → read-only snapshot → external evaluator | pass (`isolation_emulated`) |
| same candidate bundle under operations/evaluator subordinate UIDs | pass (`os_enforced_subordinate_uids`) |
| detached candidate Git worktree independence | pass |
| line coverage | 91.71449731531199% (`19814/21604`) |
| branch coverage | 86.18421052631578% (`1703/1976`) |
| function coverage | 89.61702127659575% (`1053/1175`) |

Commands:

```bash
npm run check
npm run build
npm run cli -- check-schemas
SEH_REQUIRE_OS_BOUNDARY=1 npx -y node@24.18.1 \
  --import tsx \
  --test \
  --experimental-test-coverage \
  --test-reporter=./scripts/summary-test-reporter.mjs \
  test/**/*.test.ts
```

The full boundary-mode run reported:

```text
tests 64
passed 64
failed 0
cancelled 0
skipped 0
todo 0
```

## Deterministic properties demonstrated

1. A candidate must be a new `HarnessVersion`; candidate and parent IDs cannot be equal.
2. Evolution-run states advance only through the frozen transition graph.
3. Parent, candidate, proposal, attribution, pattern, protocol, and snapshot commitments cannot be
   substituted after their first committed state.
4. Static admission changes proposal disposition only to `admitted`.
5. Evaluator-bound qualification changes final disposition to `accepted` or `rejected`.
6. Evaluator failure records a failed run, rejects the unqualified proposal, creates no adaptive
   replacement, and does not change the parent or deployment pointer.
7. Previously rejected mutation signatures are retained and block a duplicate proposal.
8. Approval qualifies an exact candidate; it does not deploy it.
9. The registered candidate closure and payloads produce one canonical content-addressed bundle.
10. Git commits only the fixed bundle path using `hash-object --no-filters`; repository clean/smudge
    filters cannot transform candidate bytes.
11. The snapshot descriptor binds the source base commit, candidate commit, tree, complete path set,
    Git object IDs, modes, sizes, and content hashes.
12. The external evaluator independently rejects a request whose candidate HarnessVersion ID differs
    from the mounted bundle.
13. The registry-generated bundle passes under operations UID 1101 and evaluator UID 1103, while a
    separately signed candidate-ID substitution is rejected without a final evaluation result.

## Scope limits

- Approval/rejection/failure unit paths still use a separately keyed deterministic evaluator double.
  A separate integration path exercises the exact candidate bundle with the external Python evaluator.
- The fast integrated candidate-bundle test uses `isolation_emulated`; the required OS track repeats the
  candidate bundle under subordinate UIDs and stores its evidence in
  `architect/evidence/candidate-bundle-os/`.
- The OS evidence depends on Linux namespaces, subordinate UID mappings, bubblewrap, and the host kernel.
  Host root/kernel compromise remains outside the claim.
- The persisted OS artifact includes every public principal and key so its challenge signatures can be
  checked without retaining any private key.
- No live OpenAI request, Terminal-Bench task, HarnessFaultBench research split, pilot, gate, final, or
  temporal task was executed.
- This evidence supports lifecycle separation and bounded local authority. It does not support any
  self-improvement, benchmark, generalization, comparative-performance, or broad security claim.
