# HarnessFaultBench Semantic Development Validation

Status: post-deviation correction; development-only; no performance claim

Architect Round 3R rejected the old manifest-ID runner as semantic evidence. That artifact graph remains
quarantined under the signed governance deviation. The replacement path is newly generated and has a
new specification, hashes, schemas, suite commitment, and evidence record.

## Separated execution path

```text
benchmark-author oracle
  ├─ known-good/fault component pair and patch
  ├─ authoring-only scripted recorder
  └─ canonical request-table rows
                  │
                  ▼
label-free execution package
  + selected HarnessVersion ID supplied separately
  + standalone runtime
  + actual builtin tools / memory / workflow / routing / child runtime
                  │
                  ▼
observable-only verifier
                  │
                  ▼
raw runtime events
                  │
                  ▼
label-blind attribution adapter
```

`hfb-semantic-execution.ts` cannot import the benchmark authoring/oracle modules. Its input type has no
fixture ID, mechanism code, target component, known-good/fault label, expected outcome, or patch.

## Input-driven fake provider

The final fake provider is keyed only by a canonical projection of the actual model request:

- model identity;
- instructions;
- selected input items;
- model-visible tools and descriptions;
- output-token cap;
- reasoning effort.

The projection excludes request ID and abort signal. Unknown requests receive one fixed rejection
response. The benchmark-author recording provider is used only to author rows from a known-good run and
never appears in runtime, attribution, proposer, candidate, or scoring input.

## Actual component semantics

- `SystemPrompt`: selected sections become model instructions.
- `ContextPolicy`: controls system/input transcript and model-visible tool catalog.
- `MemoryRetrievalPolicy`: drives filesystem-memory namespace, scoring, limits, and ordering.
- `Skill`: selected steps, completion checks, and bound tool IDs are rendered into instructions.
- `WorkflowPolicy`: a closed transition is selected, destination actions are dispatched, and its
  observable receipt enters task context.
- `RoutingPolicy`: closed priority/tie routing selects primary or child execution.
- `SubagentPrompt`: the selected child is launched through `DescendantManager`; its prompt becomes the
  child model context.
- `ToolDescription`: mutable prose is bound to the immutable builtin implementation and input-schema
  hashes and enters the model tool catalog.

## Label-blind adapter

The adapter retains only allowlisted behavioral facts: context source/reason counts, state transitions,
model output kinds, known tool names/status, verifier booleans, closed workflow classes, routing target
kind, and request-table match booleans.

It removes task text, paths, raw outputs, hashes, IDs, component/harness identities, route IDs, rule IDs,
provider metadata, verifier summaries/evidence, error details, oracle labels, and mutation data.
Adversarial tests inject labels into those channels, rename all opaque IDs, and reverse corpus input
order.

## Non-claims and remaining boundary

This evidence does not run the attribution model, propose a mutation, construct a candidate, use a real
provider, access `D_gate`/final/temporal data, or perform B0–B6 comparisons. Therefore:

- attribution top-1/top-3 is not measured;
- H1–H4 are not tested;
- no self-evolution or improvement claim is permitted;
- research/confirmatory use still requires a later Architect authorization and protocol freeze.

## Persisted development evidence

- implementation source commit:
  `829dd1943954ba64e6e0c08bae35710b3db348e4`
- semantic suite commitment:
  `sha256:61c5f01ecb135436df55a76d169a26dac48379d18f31eb8e7d78e04a4e9c40be`
- label-blind corpus commitment:
  `sha256:49f7dcbfaabdc122294b41f30d56f15d5eca6088d7941f07483968bdd58e1a01`
- development evidence:
  `architect/evidence/harness-fault-bench-semantic/evidence.json`
- development evidence file SHA-256:
  `3083ce265e91292582dfbff6320ab8a1f536e9afc50280e18230dcfe434cb876`

The persisted graph contains 28 oracle/report records and 18 unique execution-package files. Identical
label-free environments are content-addressed and deliberately deduplicated across fixture entries.

Verify the persisted schemas, inventories, internal content hashes, commitment joins, oracle exclusion,
and source commit without re-executing fixtures:

```bash
npm run verify:hfb-semantic-evidence
npm run verify:hfb-governance
```
