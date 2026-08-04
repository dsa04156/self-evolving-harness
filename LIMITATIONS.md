# Limitations

The repository demonstrates an architecture and deterministic development prototype. It does not yet
demonstrate general harness self-improvement.

- No sealed held-out or temporal-holdout evaluation has run.
- No B0–B6 matched-budget experiment has run.
- The user CLI includes native Ollama and OpenAI adapters. A local Ollama operational smoke was run,
  but no real-model rollout is admitted to deterministic release or research evidence; protocol
  behavior is covered there with a deterministic mocked HTTP transport.
- Local coding quality depends on the selected Ollama model and available CPU/GPU memory; the default
  `qwen2.5-coder:7b` is an accessible baseline, not a validated performance recommendation.
- When no `--verify` command is configured, completion uses advisory verification based on a Git
  workspace observation. This proves neither task correctness nor test success.
- `workspace-write` grants the sandboxed shell broad write authority inside the selected workspace.
  Network and host paths are isolated, but destructive changes inside that workspace remain possible.
- Child agents are one-shot and non-recursive in the current product runtime. They share the parent
  workspace and provider, so they are useful for independent analysis but are not isolated coding
  branches or Codex Ultra-equivalent proactive orchestration. Backend jobs live only for the owning
  task session and are cancelled if the parent finishes without waiting.
- The process boundary depends on a trusted Linux host, kernel, root, namespace/bootstrap code, and
  protocol author.
- The eight-principal prototype is local and development-only; it is not a production deployment
  design.
- The evaluator-vault and synthetic-custody rounds contain only synthetic commitments and fixed inert
  bytes. Durable state, cross-process leases, eight role mounts, read-only tmpfs materialization,
  at-most-once abort, live substitution denial, and cleanup recovery are exercised; no real
  task/verifier/label body was used, so this is not evidence of benchmark confidentiality.
- The current synthetic fixture corpus is public and cannot become independent evaluation data.
- The bounded mutation prototype does not establish that attribution improves generalization.
- The external Architect is a governance reviewer, not the immutable benchmark evaluator.
- Exact cross-model transfer, statistical power, provider variance, and cost tradeoffs remain
  unevaluated.
- OxyGent is traced at exact commit `cd96268de5814dfb4e0444cfd687f97508cf996a` through its owned MAS
  call path, ReAct/parallel/reflexion agents, live-prompt versioning, and prompt optimization route.
  Uninspected or unreleased OxyGent behavior remains unknown, and no OxyGent source is reused here.
- The signed local conformance manifest consolidates already accepted evidence; it does not add an
  independent trust root, a real-provider receipt, a research protocol freeze, or a research result.

All artifacts in the governed public snapshot and their transitive derivatives remain
`publicDevelopment=true` and `authorizedForResearchEvidence=false`. A new protocol ID, copied file,
new filename, Git history rewrite, or repository deletion does not restore secrecy or eligibility.

Any later performance claim must use preregistered, inaccessible splits; matched model/token/tool/time
budgets; independent evaluator authority; multiple seeds; uncertainty intervals; negative results;
and a frozen harness evaluated without test-time retries.

The complete current blocker matrix is
[`docs/evaluation/outstanding-obligations.md`](docs/evaluation/outstanding-obligations.md); all seven
rows remain unresolved.
