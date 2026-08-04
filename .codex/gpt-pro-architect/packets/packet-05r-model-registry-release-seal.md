# Architect Packet 05R — Model-registry release seal

## Metadata and scope

- repo / branch: `dsa04156/self-evolving-harness` / `main`
- date: 2026-08-04 (Asia/Seoul)
- previous decision: Packet 05 `REVISE` on release sealing only
- decision requested: close only the named provider-transition, registry-to-runtime, immutable identity,
  and post-hardening verification blockers
- excluded: new implementation, source/lock/test/doc edits, new provider SDK, GUI, cache, paid inference,
  provider credentials, benchmark data, architecture expansion, push, or empirical claims

## Exact candidate identity

- base / parent: `d7310d7e1eca24d5c6cdcb2d4558a7a27c3f9ae8`
- candidate HEAD: `fa0dec6aa8176bb01cff7515ce80d3ca0f0619ad`
- candidate tree: `677f76624a8bb9d294288b3e250a71558db36f69`
- canonical `git diff --binary <parent> <candidate>` SHA-256:
  `7f5bf72b124e74bccefb2c4fc2899b1adbfc63d958fbe5facdaeda526b44cb7a`
- `package-lock.json` SHA-256:
  `d4addd6b506fb8a57007e0de7cbae75e0a64c14b710ee6ea789905783f17c155`
- remote `refs/heads/main` before push:
  `d7310d7e1eca24d5c6cdcb2d4558a7a27c3f9ae8`
- candidate commit summary: 31 files, 2,134 insertions, 191 deletions
- commit message: `feat(models): add provider-aware live registry`

## Complete parent-to-candidate changed-path inventory

Modified:

1. `.codex/gpt-pro-architect/NOTES.md`
2. `.codex/gpt-pro-architect/ledger.md`
3. `.codex/gpt-pro-architect/thread.md`
4. `CHANGELOG.md`
5. `README.md`
6. `SECURITY.md`
7. `assets/terminal-demo.svg`
8. `docs/architecture/threat-model.md`
9. `docs/research/cli-ux-reference.md`
10. `docs/research/source-ledger.md`
11. `docs/user-guide.md`
12. `package-lock.json`
13. `package.json`
14. `src/index.ts`
15. `src/product/cli.ts`
16. `src/product/coding-agent.ts`
17. `src/product/config.ts`
18. `src/product/interactive.ts`
19. `src/product/model-catalog.ts`
20. `src/product/shell-completion.ts`
21. `src/product/terminal-ui.ts`
22. `test/product-cli.test.ts`
23. `test/product-fullscreen-tui.test.ts`
24. `test/product-interactive.test.ts`

Added:

25. `.codex/gpt-pro-architect/packets/packet-05-model-registry.md`
26. `.codex/gpt-pro-architect/responses/response-05-model-registry.md`
27. `src/product/provider-registry.ts`
28. `src/providers/openai-compatible-chat-provider.ts`
29. `src/providers/openrouter-catalog.ts`
30. `test/openrouter-provider.test.ts`
31. `test/product-openrouter-integration.test.ts`

## Required transition boundary

The documented behavior is now explicit: interactive `/model` selection changes the provider/model
used by the next newly created task session. A running task is never rebound. Prior session records are
immutable; later sessions receive only bounded, untrusted plain-text conversational context, never a
prior provider-native assistant envelope or tool result.

Deterministic test:

`provider switch applies to a new session without replaying provider-bound history`

- first task executes an OpenRouter assistant/tool-call history through the real SEH adapter shape;
- the selected Ollama target creates a distinct child session with its own provider identity;
- the new provider request contains neither `provider_item` nor `tool_output` from the prior session;
- only the prior final answer appears as untrusted text;
- parent/context session linkage remains explicit.

## Required registry-to-runtime execution boundary

Deterministic test:

`selected OpenRouter registry row reaches the SEH tool loop and verifier`

The test uses no key and no network. It proves:

live-style registry row
→ `(openrouter, vendor/coder)` selection
→ exact fixed endpoint configuration
→ `OpenAICompatibleChatProvider` with fake Chat Completions transport
→ SEH model request
→ provider-bound tool-call history
→ SEH-owned `write` tool execution
→ second model request with assistant/tool messages
→ external fake verifier pass
→ completed, persisted product session

Observed assertions include two model calls, one tool call, written artifact bytes, completed state,
verification pass, exact session provider identity, and `system,user,assistant,tool` wire history.

## Full post-hardening release gate

Executed from clean worktree at exact candidate `fa0dec6aa8176bb01cff7515ce80d3ca0f0619ad` after all source,
test, documentation, redirect/stream hardening, and `fast-uri 3.1.5` bytes were committed.

Command: `npm run verify:release`

Result:

- TypeScript check: PASS
- build: PASS
- complete deterministic suite: **247/247 PASS**, 0 failed/cancelled/skipped
- duration: 392,913.391383 ms
- compiled JSON Schemas: **131**
- deterministic demo: completed / retired / verification passed; 2 model calls, 1 tool call,
  14 events, 5 evidence receipts
- development process boundary: verified; 8 roles; 7 adversarial rejections; no provider use;
  no research evidence or promotion authority
- publication governance: PASS
- historical publication continuity: PASS; 54 post-corrective commits, 477 blobs,
  **secrets=0**, environment paths=0
- trust-plane conformance: verified; authorities granted=0

The full suite includes both required new tests and the oversized-catalog/redirect controls.

## Same-candidate focused and package evidence

- OpenRouter/product/TTY deterministic suite: **35/35 PASS**, 0 failed
- `npm audit --omit=dev`: **0 vulnerabilities**
- resolved vulnerable dependency replacement: `fast-uri 3.1.5`
- package dry run: `self-evolving-harness@0.5.0`,
  `self-evolving-harness-0.5.0.tgz`, 925,994 bytes packed, 4,809,840 bytes unpacked,
  635 entries
- `seh --version`: `0.5.0`
- actual PTY before sealing: 293 routes, `claude` filtered 17 results, normal cancel/exit
- live public catalog observation before sealing: 258 tool-capable routes with Claude and Gemini;
  these counts remain observations, not thresholds

## Clean-tree seal

Immediately after all same-candidate checks and before constructing this evidence-only packet:

- `HEAD`: `fa0dec6aa8176bb01cff7515ce80d3ca0f0619ad`
- `HEAD^{tree}`: `677f76624a8bb9d294288b3e250a71558db36f69`
- `git diff --check`: PASS
- `git status --porcelain=v1`: empty
- remote main remained `d7310d7e1eca24d5c6cdcb2d4558a7a27c3f9ae8`

This Packet 05R file was constructed only after the clean-tree observation. It is architect evidence,
not a source/lock/test/documentation mutation of the sealed candidate. Candidate bytes have not changed
and nothing has been pushed.

## Claim boundary

This evidence establishes deterministic implementation semantics and release integrity only. It does
not establish live account entitlement, every route's tool-call quality, provider-side model identity,
performance, research generalization, harness evolution, or self-improvement.

## Decision needed

Has the Packet 05 release-sealing `REVISE` been closed for candidate
`fa0dec6aa8176bb01cff7515ce80d3ca0f0619ad`? Return `APPROVE` unless one of the named transition,
registry-to-runtime, immutable identity, or post-hardening verification requirements remains unmet.

## Required response format

Decision: APPROVE | REVISE | BLOCK

Rationale:

Required changes:

Risks/missing evidence:

Next packet request:
