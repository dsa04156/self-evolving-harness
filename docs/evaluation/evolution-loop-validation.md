# First-Class Evolution Loop Validation

Status: deterministic architectural-conformance evidence; no research-performance result

Resource profile: `NP-1`

## Frozen implementation under test

- commit: `5bd8061c6d16af2271320f9a60127b03be71dc7e`
- tree: `8d0113de86a79bb0a95aa48c48817520acf7c55e`
- implementation: `src/evolution/evolution-loop.ts`
- isolation: `src/evolution/candidate-bundle.ts`
- external bridge: `src/evolution/worktree-evaluation-executor.ts`
- schemas: `schemas/evolution-run-record.schema.json`,
  `schemas/candidate-harness-bundle.schema.json`
- tests: `test/evolution-loop.test.ts`, `test/hfb-structural-oracle.test.ts`

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
| JSON Schema compilation | pass, 59 schemas |
| Complete deterministic test suite | pass, 69/69 |
| OS-principal boundary mode | pass |
| External evaluator crash recovery | pass |
| candidate closure → Git commit → read-only snapshot → external evaluator | pass (`isolation_emulated`) |
| same candidate bundle under operations/evaluator subordinate UIDs | pass (`os_enforced_subordinate_uids`) |
| detached candidate Git worktree independence | pass |
| HarnessFaultBench visible `D_mine` structural-oracle plumbing | pass, 28/28 structural predicates; superseded |
| line coverage | 92.37755708343943% (`21766/23562`) |
| branch coverage | 87.10289236605027% (`1837/2109`) |
| function coverage | 90.21651964715318% (`1125/1247`) |

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
tests 69
passed 69
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
14. All 28 visible HarnessFaultBench structural-oracle fixtures reproduce their declared
    single-component patch, preserve immutable trust pins/capabilities, select the preregistered
    manifest-ID oracle outcomes, and replay deterministically.

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
- No live OpenAI request, Terminal-Bench task, HarnessFaultBench gate/final task, candidate attribution
  evaluation, pilot, or temporal task was executed. The visible `D_mine` structural corpus was
  executed outside the prior gate authorization and is now signed, preserved, and mechanically
  quarantined as non-confirmatory development evidence.
- This evidence supports lifecycle separation and bounded local authority. It does not support any
  self-improvement, benchmark, generalization, comparative-performance, or broad security claim.
