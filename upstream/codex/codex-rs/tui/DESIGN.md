# SEH Code TUI Design Contract

Status: selected direction, 2026-08-04

Visual reference: [`../../../../docs/design/genome-observatory-reference.png`](../../../../docs/design/genome-observatory-reference.png)

## Product idea

SEH Code is a coding agent whose runtime records evidence and pins every session to a versioned
harness. The first screen should make that difference visible without turning the terminal into a
monitoring dashboard. The primary action remains typing a task.

The selected direction is **Genome Observatory**:

- calm scientific-instrument character rather than a mascot;
- a double-helix/lineage mark representing controlled harness evolution;
- current runtime facts in a compact Project Pulse;
- one prominent composer and immediately discoverable slash commands.

Gajae-Code's full-viewport welcome hierarchy and responsive disclosure informed the interaction
study. Its crab identity, artwork, palette, logo, wording, and component implementation are not
copied. The selected SEH reference was generated specifically for this project.

## Tokens

The TUI must remain legible in ANSI 16-color terminals, so semantic roles map to standard terminal
colors rather than fixed RGB values.

| Role | Terminal color | Use |
|---|---|---|
| genome-primary | cyan / light cyan | product name, commands, active lineage |
| genome-secondary | magenta / light magenta | helix counter-strand, candidate state |
| candidate | magenta | pending evolution or evaluation only |
| verified | green | verified or signed-success state only |
| destructive | red | failure, rejection, unsafe state only |
| foreground | terminal default | task text and runtime values |
| quiet | dim terminal default | labels, separators, supporting copy |

Brand color must never substitute for error, rejection, or diff-removal meaning.

## First-screen hierarchy

1. Product identity: `SEH CODE · GENOME OBSERVATORY`.
2. The primary task composer.
3. Current model and reasoning effort.
4. Pinned HarnessVersion and evidence-stream state.
5. Repository/session context.
6. Discovery hints for `/`, `/model`, `/harness`, `/evidence`, and `/evolution`.

No release note, metric, or secondary feature may outrank the composer.

## Responsive behavior

- **Wide (100+ columns):** bordered two-column Observatory. Helix and product promise on the left;
  Project Pulse on the right.
- **Medium (64-99 columns):** stacked identity and Project Pulse with compact dividers.
- **Narrow (below 64 columns):** four-line identity/runtime summary with command discovery. No
  horizontal overflow.
- All variants use terminal-cell width calculations and truncate untrusted paths/identifiers.
- ASCII/minimal terminals must retain the text hierarchy even if ornamental glyphs are unavailable.

## Components and states

### Genome home

- Reads the already-established session values; it does not invent evaluation or promotion state.
- `PINNED` means the session is bound to an exact HarnessVersion.
- Evidence reports `stream ready`, `signed · N receipts`, or `initializing`; the home must not claim
  cryptographic verification without a verifier result. `signed` only reports present attestation
  metadata; verification remains an explicit Evidence Plane action.

### Task composer

- Rounded cyan/magenta observatory frame with a `TASK COMPOSER` title.
- Stable placeholder: `Describe a task, or type / for commands`.
- Existing editing, paste, attachment, popup, shell, queue, and accessibility behavior is preserved.
- Focus and running states may change border emphasis, never input semantics.

### Selectors and slash discovery

- Searchable lists preserve the existing Codex interaction model.
- Model rows must keep model, reasoning effort, service tier, and availability distinguishable.
- `/` remains the fastest discovery path; command descriptions use outcome language.

## Motion and accessibility

- Motion is optional and respects the existing animation setting.
- Color is never the only carrier of status; every status includes text or a symbol.
- Narrow width, CJK/wide glyphs, no-color output, raw transcript export, and screen readers remain
  supported.
- Decorative output is excluded from `raw_lines`; copied transcripts retain concise facts.

## Visual QA targets

- home at 120, 80, and 48 columns;
- empty, focused, draft, running, shell, and disabled composer states;
- slash popup at `/` and filtered input;
- model picker default and selected states;
- dark, light, ANSI 16-color, and no-color terminals.
