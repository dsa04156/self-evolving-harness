# Genome Observatory Design QA

**Final result: blocked**

The terminal-native first screen is usable and the primary composer now matches the selected
direction's hierarchy, but exact visual fidelity is blocked by one remaining asset issue: the
selected raster DNA illustration is represented by a Unicode fallback in terminals that do not
render inline images. Product Design's asset-fidelity rule does not permit that substitution to be
called a passing match.

## Comparison target

- Source visual truth: `docs/design/genome-observatory-reference.png`
- Rendered implementation: `docs/design/actual-genome-observatory-144x48.png`
- Full-view comparison: `docs/design/genome-observatory-comparison.png`
- Focused composer comparison: `docs/design/genome-observatory-composer-comparison.png`
- State: authenticated empty session, dark terminal, focused composer, real local repository,
  pinned HarnessVersion, signed evidence stream, live model and reasoning values
- Terminal viewport: 144 columns by 48 rows
- Source pixels: 1536 × 1024
- Implementation pixels: 1444 × 964
- Density normalization: implementation resized to 1536 × 1024 for the comparison canvas; no
  browser or device frame was included

The source uses illustrative example state. The implementation intentionally shows live values
(`gpt-5.6-luna`, `max`, the active repository, pin hash, receipt count, and account warnings), so
those content differences are not treated as visual regressions.

## Findings

- [P1] Raster genome art is not rendered in the tested terminal
  - Location: wide home, left observatory column; `tui/src/history_cell/seh_home.rs`.
  - Evidence: the source uses a full-height cyan/magenta raster DNA illustration with glow and
    particle detail; the implementation uses a compact Unicode lineage mark.
  - Impact: the first screen keeps its structure and identity, but loses the source's strongest
    visual signature. This fails the required image-asset fidelity surface.
  - Fix: add a bounded welcome-art renderer using the existing Kitty/Sixel terminal image
    infrastructure, ship a purpose-sized Genome Observatory asset, and retain the current Unicode
    mark only as the no-image accessibility fallback.

- [P3] ANSI color and type are less luminous than the generated reference
  - Location: whole screen.
  - Evidence: the source uses a custom condensed display face and RGB glow; the xterm capture uses
    DejaVu Sans Mono and ANSI semantic colors.
  - Impact: the terminal remains readable and coherent but is visually quieter.
  - Follow-up: offer an optional true-color palette while retaining ANSI-16 and no-color fallbacks.

## Required fidelity surfaces

- Fonts and typography: hierarchy, weight, truncation, and monospace rhythm are sound. Exact font
  fidelity is intentionally terminal-controlled and therefore cannot match the generated display
  face.
- Spacing and layout rhythm: the two-column home, Project Pulse, discovery rail, and tall primary
  composer preserve the selected hierarchy. The implementation is more vertically compact to keep
  short terminals usable; the composer-region comparison shows the primary action now has a
  comparable proportion.
- Colors and tokens: cyan/magenta identity and pin state, plus green signed-evidence state, map
  correctly to semantic ANSI roles. Glow and gradient treatment are unavailable in the tested
  xterm palette.
- Image quality and asset fidelity: blocked by the missing inline raster genome art described
  above. The reference image itself is preserved in the repository without recompression.
- Copy and content: `SEH CODE`, `GENOME OBSERVATORY`, `Execute · Observe · Evolve`, Project Pulse,
  and slash-command discovery are coherent. Runtime facts replace the mock's invented example
  values, and no verification or evolution state is fabricated.

## Interaction and responsive evidence

- The composer remains a real multiline editor and collapses to the upstream compact layout after
  the first submitted task.
- Slash discovery, model selection, editing, paste, attachments, shell mode, queueing, and footer
  behavior remain covered by the existing TUI tests.
- Home snapshots cover 120-, 80-, and 40-column layouts; an overflow test covers 32 through 160
  columns.
- This is a native terminal application, so browser console and CSS-device checks do not apply.

## Comparison history

1. Iteration 1 — `docs/design/actual-genome-observatory-120x32.png`
   - Finding: [P2] launch composer rendered like a compact one-line runtime input instead of the
     selected design's primary action.
   - Fix: introduced a launch-only prominent frame and minimum-height contract; it automatically
     returns to the compact running state after submission.
2. Iteration 2 — `docs/design/actual-genome-observatory-144x48.png`
   - Finding: the composer mismatch is resolved in the focused comparison. The [P1] raster genome
     asset mismatch remains and is the sole blocking fidelity issue.

## Implementation checklist

- [x] Use the selected `…20f68.png` direction as the visual source.
- [x] Implement responsive wide, medium, and narrow home layouts.
- [x] Render truthful model, reasoning, repository, HarnessVersion, evidence, and session facts.
- [x] Make the launch composer visually primary and preserve compact task-running behavior.
- [x] Capture and compare a real 144 × 48 terminal session.
- [ ] Render the real genome asset through Kitty/Sixel with the Unicode fallback for unsupported
  terminals.
