# Codex pattern and reuse ledger

This ledger distinguishes observation, clean-room implementation, and source reuse. No Codex source
file is copied or adapted in the current SEH implementation.

| Field | Value |
| --- | --- |
| Repository | <https://github.com/openai/codex> |
| Exact commit | `db1a4145692fcfc88fb354f478b0019ca0d2ef9d` |
| Branch observed | repository default branch at checkout |
| Investigated | 2026-08-04 Asia/Seoul |
| License observed | Apache-2.0 |
| Checkout | fresh shallow clone in `/tmp`; not vendored or committed |
| Reuse disposition | architectural observation and clean-room pattern implementation only |

## Observed execution/dependency paths

| Area | Files/trees inspected | Observed fact | SEH disposition |
| --- | --- | --- | --- |
| Core runtime | `codex-rs/core/` | owns conversation/runtime configuration, tools, provider flow, sandbox-facing behavior, skills/hooks/plugins integration | do not import; SEH owns equivalent kernel contracts |
| Terminal UI | `codex-rs/tui/` manifests and source imports | depends on app-server client/protocol and multiple Codex runtime/state surfaces; it is not an isolated renderer | clean-room interaction patterns only |
| App server | `codex-rs/app-server/`, `codex-rs/app-server-protocol/` | exposes Codex threads, turns, items, events, configuration, login, and execution controls | do not use as backend or protocol authority |
| Thread storage | `codex-rs/thread-store/` | persists Codex-native thread state | do not use; SEH session store and RuntimeEvents remain authoritative |

Selected line count at this commit, measured with tracked Rust source files including tests:

| Tree | Lines |
| --- | ---: |
| `codex-rs/core` | 298,637 |
| `codex-rs/tui` | 238,882 |
| `codex-rs/app-server` | 128,410 |
| Total | 665,929 |

These numbers describe the audited checkout only and are not a quality comparison.

## Pattern disposition

| Pattern | Disposition | SEH implementation |
| --- | --- | --- |
| full-screen terminal and slash discovery | clean-room | `src/product/fullscreen-tui.tsx`, `terminal-ui.ts` |
| provider/model/reasoning selection | clean-room | product provider registry and model profile |
| Thread / Turn / Item view | clean-room, non-authoritative | `src/product/thread-projection.ts` |
| resume and fork | clean-room | immutable product session lineage |
| app-server events | not reused | SEH RuntimeEvent v2 and evidence plane |
| Codex provider/login/session | forbidden dependency | none |
| Codex task runtime | forbidden dependency | none |

If source reuse is introduced later, add the exact source path, commit, copied/adapted lines,
license notice, modification description, and distribution boundary before merging it.
