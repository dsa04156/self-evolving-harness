<p align="center">
  <img src="assets/hero-product.webp" alt="SEH Code: task execution and governed harness evolution above an immutable trust boundary" width="100%" />
</p>

<h1 align="center">SEH Code</h1>

<p align="center">
  <strong>Codex-grade coding UX with content-addressed harness identity and signed runtime evidence.</strong><br />
  A real terminal coding agent today; a governed self-evolving harness under construction.
</p>

<p align="center">
  <img alt="SEH 0.10 alpha" src="https://img.shields.io/badge/SEH-0.10.0--alpha.1-a78bfa?style=flat-square">
  <img alt="Rust" src="https://img.shields.io/badge/runtime-Rust-dea584?style=flat-square">
  <img alt="Codex derived" src="https://img.shields.io/badge/upstream-Codex%205af8599-22d3ee?style=flat-square">
  <img alt="Research alpha" src="https://img.shields.io/badge/status-research_alpha-f59e0b?style=flat-square">
</p>

> [!IMPORTANT]
> `product/codex-fork` is the Codex-derived product track. It vendors the exact Apache-2.0
> `openai/codex@5af85998c24fb3353ddd8164c3ed472057b03cb3` source under `upstream/codex` and
> integrates SEH's Harness Component and Evidence planes into the real execution path. It does not
> wrap an installed Codex CLI. The earlier independent TypeScript runtime remains preserved on
> `main` and at `standalone-v0.9.0`; results from the two tracks are not pooled.

## Install

Linux is the currently tested platform. You need Git, a recent Rust toolchain, and ChatGPT access
that can use Codex.

```bash
git clone --branch product/codex-fork \
  https://github.com/dsa04156/self-evolving-harness.git
cd self-evolving-harness
./scripts/install-seh.sh
```

The installer builds one Rust binary and places `seh` in your existing user binary directory. If
an older npm `seh` link exists, it is preserved as `seh-standalone-v0.9`.

Already built the debug binary?

```bash
make install-debug
```

SEH supports the same browser-based ChatGPT sign-in as Codex. An API key is not required.

```bash
seh login          # only if you are not already signed in
seh login status
seh
```

An existing Codex login is reused from `~/.codex`; credentials are not copied into harness,
event, receipt, or memory records.

## First run

Opening `seh` starts the full-screen terminal UI:

```text
             ╭╮        ╭╮       trace
             ╰╮╲      ╱╭╯   evidence
               ╲╲    ╱╱    attribute
                ╲╲  ╱╱     mutate
                ╱╱  ╲╲    evaluate
               ╱╱    ╲╲     promote
             ╭╯╱      ╲╰╮    rollback
             ╰╯        ╰╯      audit

                 S E H   C O D E
        Task loop  ×  signed evidence  ×  versioned harness
```

Describe a coding task directly. SEH owns the active context/model/tool loop, filesystem and shell
execution, permissions, session persistence, skills, subagents, and verification through the
vendored runtime.

```bash
seh                                      # interactive TUI
seh "Find and fix the failing parser"    # TUI with an initial task
seh exec "Run tests and fix the failure" # non-interactive
seh review                               # review the current workspace
seh resume --last                        # resume the newest session
seh fork --last                          # fork with inherited session lineage
```

Type `/` in the composer to open fuzzy command completion. Arrow keys select a command and `Tab`
completes it. Frequently used surfaces include:

| Command | Purpose |
| --- | --- |
| `/model` | Pick a model, reasoning effort, and supported service tier |
| `/permissions` | Select the approval and sandbox profile |
| `/skills` | Browse reusable skills |
| `/agent` | Navigate primary and child-agent threads |
| `/new`, `/resume`, `/fork` | Control durable session lineage |
| `/diff`, `/review` | Inspect and verify workspace changes |
| `/memories`, `/hooks`, `/plugins`, `/mcp` | Configure runtime extensions |
| `/harness` | Inspect the exact HarnessVersion pinned to this session |
| `/evidence` | Inspect signed events, receipts, and audit head |
| `/evolution` | Show the separate task/evolution lifecycles without calling retry evolution |
| `/status`, `/usage` | Inspect runtime configuration, tokens, and account use |

## Models are discoverable

The TUI `/model` picker uses the live catalog. The same catalog is available without opening the
TUI:

```bash
seh models
seh models --bundled
seh models --json
```

The bundled catalog currently exposes GPT-5.6 Sol, Terra, and Luna plus GPT-5.5 and GPT-5.2.
Supported reasoning levels are shown per model, including `low`, `medium`, `high`, `xhigh`, `max`,
and `ultra` where available; supported service tiers such as Fast are shown alongside them.

You can also select directly:

```bash
seh --model gpt-5.6-sol
seh --model gpt-5.6-terra
```

## Inspect what executed

Every new runtime session resolves a content-addressed component graph, persists its bundle, and
pins the exact HarnessVersion before the task proceeds. Resume and retry reuse that pin unless the
runtime binding genuinely changes.

```bash
seh harness
seh harness --all
seh harness --json
```

Example shape:

```text
◈ HarnessVersion  [VERIFIED]
  session      019f…
  version      hv-sha256:4b9961ed3758…
  model        gpt-5.6-sol (openai)
  reasoning    max
  components   24
  selection    current
  pin          sha256:764a71fd66bb…
```

The Evidence Plane records allowlisted observations separately from verifier outcomes and model
inference. Events form a hash chain; receipts cover event ranges, link into an append-only audit
chain, and carry Ed25519 attestations from a registered runtime observation principal.

```bash
seh evidence
seh evidence --all
seh evidence --json
```

`seh evidence` is read-only: it re-verifies persisted event hashes, receipt coverage, audit links,
and signatures. It does not open a writer or append a diagnostic event.

## Two lifecycles, not one marketing label

Task retry is not harness evolution.

```text
Task Execution Loop
context → model → tool call → tool result → verification → complete or retry

Harness Evolution Loop
multiple traces → weakness mining → attribution → bounded mutation
→ candidate HarnessVersion → matched-budget evaluation → promote / reject / rollback
```

Inspect the implemented boundary:

```bash
seh evolution
seh evolution --json
```

Today the task loop, versioned component graph, immutable session pin, and signed Evidence Plane are
wired into the product runtime. Candidate mutation and promotion remain deliberately disabled until
the external evaluator, sealed-data access rules, matched-budget gate, and rollback authority are
implemented and independently reviewed. SEH does not claim general self-improvement from a single
score increase.

## Architecture

```text
┌──────────────────────────────────────────────────────────────────┐
│ 1  Agent Runtime Kernel       model · context · tools · sessions │
│ 2  Harness Component Plane    versioned component graph          │
│ 3  Operations Control Plane   start · observe · recover · retire │
│ 4  Evidence Plane             events · receipts · audit chain    │
│ 5  Evolution Control Plane    mine · attribute · mutate · gate   │
├──────────────────────────────────────────────────────────────────┤
│ 6  Immutable Trust Plane      evaluator · policy · budget · data │
└──────────────────────────────────────────────────────────────────┘
```

The current product execution path is:

```text
seh CLI/TUI
  → Codex-derived core runtime (plus optional app-server surfaces)
  → SEH runtime-binding resolution
  → content-addressed HarnessVersion + immutable session pin
  → model/tool execution
  → signed RuntimeEvents + EvidenceReceipts
  → task verification/completion
```

See [ARCHITECTURE.md](ARCHITECTURE.md), [the fork ADR](docs/architecture/adr-0008-codex-derived-product-track.md),
[SECURITY.md](SECURITY.md), and [CODEX_FORK_NOTICE.md](CODEX_FORK_NOTICE.md).

## Local state and secrets

SEH product state is stored beneath the normal Codex home:

```text
~/.codex/
├── auth.json                     authentication managed by the Codex login layer
└── seh/
    ├── harnesses/                immutable HarnessVersion bundles
    ├── active/                   runtime-binding active pointers
    ├── threads/                  immutable session pins
    ├── evidence/threads/         events, receipts, and writer locks
    └── trust/                    public runtime verifier records
```

No API keys, access tokens, cookies, or copied browser credentials belong in the repository or in
SEH evidence. Event payloads use an allowlisted metadata profile and store opaque hashes for values
that do not need to be revealed.

## Shell completion and diagnostics

```bash
# bash
source <(seh completion bash)

# zsh
source <(seh completion zsh)

# fish
seh completion fish | source

seh doctor --summary
seh doctor --json
```

`seh doctor` is read-mostly and redacts credential material from both human and JSON reports.

## Develop

```bash
cd upstream/codex/codex-rs
cargo build -p codex-cli --bin seh
just test -p codex-seh
just test -p codex-tui seh_home
just test -p codex-cli seh_cmd
```

The repository also retains the original research contracts, schemas, benchmarks, and independent
runtime artifacts at the root. They are prior-track evidence, not proof that every control is
already wired into this Codex-derived product.

## Provenance and claims

- Upstream source and license: `openai/codex`, Apache-2.0, exact SHA recorded above.
- SEH integration code is original project work; upstream code is not presented as an SEH
  invention.
- Architecture and evaluation claims are separated in [CLAIMS.md](CLAIMS.md) and
  [LIMITATIONS.md](LIMITATIONS.md).
- Failed proposals and negative results remain part of the research record in
  [NEGATIVE_RESULTS.md](NEGATIVE_RESULTS.md).
- The final novelty/evaluation/security verdict is not yet APPROVE; the project remains a research
  alpha while the Evolution and Immutable Trust planes are completed.
