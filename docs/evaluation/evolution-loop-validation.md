# First-Class Evolution Loop Validation

Status: deterministic architectural-conformance evidence; no research-performance result

Resource profile: `NP-1`

## Frozen implementation under test

- commit: `819be3eaa05b159effe2abf0f069cba673055731`
- tree: `eb06f2105811f1b78588d47cfea21dacea917371`
- implementation: `src/evolution/evolution-loop.ts`
- schema: `schemas/evolution-run-record.schema.json`
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
| JSON Schema compilation | pass, 54 schemas |
| Complete deterministic test suite | pass, 63/63 |
| OS-principal boundary mode | pass |
| External evaluator crash recovery | pass |
| detached candidate Git worktree independence | pass |
| line coverage | 91.19381343644272% (`18868/20690`) |
| branch coverage | 85.9074362974519% (`1652/1923`) |
| function coverage | 89.44153577661432% (`1025/1146`) |

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
tests 63
passed 63
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

## Scope limits

- The evaluator result in the coordinator integration tests is produced by a separately keyed
  deterministic evaluator double. The real external process is tested in a separate suite.
- Git worktree creation/freezing and candidate independence are tested as primitives. The coordinator
  does not yet materialize the candidate component closure into the worktree and evaluate that exact
  snapshot end to end.
- No live OpenAI request, Terminal-Bench task, HarnessFaultBench research split, pilot, gate, final, or
  temporal task was executed.
- This evidence supports lifecycle separation and bounded local authority. It does not support any
  self-improvement, benchmark, generalization, comparative-performance, or broad security claim.
