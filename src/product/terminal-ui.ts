import { emitKeypressEvents, type Key } from "node:readline";
import type { ReadStream, WriteStream } from "node:tty";

import type { ProductConfig } from "./config.js";

export interface SlashCommandSpec {
  readonly name: string;
  readonly aliases: readonly string[];
  readonly description: string;
  readonly argumentHint: string | null;
  readonly group: "thread" | "workspace" | "runtime" | "system";
}

export interface HomeSessionSummary {
  readonly sessionId: string;
  readonly state: string;
  readonly task: string;
}

export interface HomeScreenInput {
  readonly version: string;
  readonly workspaceRoot: string;
  readonly config: ProductConfig;
  readonly recentSessions: readonly HomeSessionSummary[];
  readonly color?: boolean;
  readonly columns?: number;
}

export interface TerminalLineEditorOptions {
  readonly input?: ReadStream;
  readonly output?: WriteStream;
  readonly color?: boolean;
  readonly history?: readonly string[];
  readonly maxPaletteRows?: number;
}

export interface ResponsePanelInput {
  readonly text: string;
  readonly state: string;
  readonly sessionId: string;
  readonly modelCalls: number | null;
  readonly toolCalls: number | null;
  readonly totalTokens: number | null;
  readonly verificationPassed: boolean | null;
  readonly verificationSummary: string | null;
  readonly color?: boolean;
  readonly columns?: number;
}

const ESCAPE = "\u001B[";

export const INTERACTIVE_SLASH_COMMANDS: readonly SlashCommandSpec[] = [
  {
    name: "help",
    aliases: ["?"],
    description: "Show every interactive command and shortcut",
    argumentHint: null,
    group: "system",
  },
  {
    name: "new",
    aliases: [],
    description: "Start a clean conversation thread",
    argumentHint: null,
    group: "thread",
  },
  {
    name: "resume",
    aliases: [],
    description: "Open the session picker or resume by ID",
    argumentHint: "[ID] [guidance]",
    group: "thread",
  },
  {
    name: "fork",
    aliases: [],
    description: "Branch a session while inheriting its exact HarnessVersion",
    argumentHint: "[ID] [guidance]",
    group: "thread",
  },
  {
    name: "thread",
    aliases: ["turns"],
    description: "Show the non-authoritative Thread / Turn / Item view",
    argumentHint: "[ID]",
    group: "thread",
  },
  {
    name: "sessions",
    aliases: [],
    description: "List recent durable sessions",
    argumentHint: null,
    group: "thread",
  },
  {
    name: "status",
    aliases: [],
    description: "Show the active session, usage, and verification",
    argumentHint: null,
    group: "thread",
  },
  {
    name: "diff",
    aliases: [],
    description: "Inspect the current workspace diff",
    argumentHint: "[--staged]",
    group: "workspace",
  },
  {
    name: "review",
    aliases: [],
    description: "Review current changes with read-only authority",
    argumentHint: "[focus]",
    group: "workspace",
  },
  {
    name: "tools",
    aliases: [],
    description: "Show tools available under current authority",
    argumentHint: null,
    group: "runtime",
  },
  {
    name: "agent",
    aliases: [],
    description: "Delegate one independent subtask to a bounded child agent",
    argumentHint: "<task>",
    group: "runtime",
  },
  {
    name: "job",
    aliases: [],
    description: "Run a background command in the no-network sandbox",
    argumentHint: "<command>",
    group: "runtime",
  },
  {
    name: "agents",
    aliases: ["jobs"],
    description: "Show child-agent and backend-job authority",
    argumentHint: null,
    group: "runtime",
  },
  {
    name: "skills",
    aliases: ["skill"],
    description: "Search and toggle workflow skills for following turns",
    argumentHint: "[id|off]",
    group: "runtime",
  },
  {
    name: "context",
    aliases: [],
    description: "Show thread and model context limits",
    argumentHint: null,
    group: "runtime",
  },
  {
    name: "harness",
    aliases: [],
    description: "Show the HarnessVersion pinned to the latest task",
    argumentHint: null,
    group: "runtime",
  },
  {
    name: "evolution",
    aliases: [],
    description: "Inspect trace and HarnessVersion evolution readiness",
    argumentHint: null,
    group: "runtime",
  },
  {
    name: "memory",
    aliases: [],
    description: "Show persistent project memory",
    argumentHint: null,
    group: "workspace",
  },
  {
    name: "paste",
    aliases: [],
    description: "Show the multiline-input shortcut",
    argumentHint: null,
    group: "workspace",
  },
  {
    name: "model",
    aliases: ["models"],
    description: "Search providers and tool-capable model routes",
    argumentHint: "[model-id]",
    group: "runtime",
  },
  {
    name: "effort",
    aliases: ["reasoning"],
    description: "Choose reasoning supported by the active model",
    argumentHint: "[auto|none|minimal|low|medium|high|xhigh|max]",
    group: "runtime",
  },
  {
    name: "fast",
    aliases: [],
    description: "Toggle OpenAI priority processing for supported models",
    argumentHint: "[on|off]",
    group: "runtime",
  },
  {
    name: "permissions",
    aliases: [],
    description: "Show the active permission profile",
    argumentHint: null,
    group: "runtime",
  },
  {
    name: "read-only",
    aliases: [],
    description: "Disable mutation tools for following turns",
    argumentHint: null,
    group: "runtime",
  },
  {
    name: "write",
    aliases: [],
    description: "Enable workspace mutation tools",
    argumentHint: null,
    group: "runtime",
  },
  {
    name: "verify",
    aliases: [],
    description: "Show configured verification commands",
    argumentHint: null,
    group: "runtime",
  },
  {
    name: "clear",
    aliases: [],
    description: "Clear and redraw the home screen",
    argumentHint: null,
    group: "system",
  },
  {
    name: "home",
    aliases: [],
    description: "Redraw the workspace home screen",
    argumentHint: null,
    group: "system",
  },
  {
    name: "exit",
    aliases: ["quit", "q"],
    description: "Close the interactive agent",
    argumentHint: null,
    group: "system",
  },
] as const;

function paint(enabled: boolean, code: string, text: string): string {
  return enabled ? `${ESCAPE}${code}m${text}${ESCAPE}0m` : text;
}

function stripAnsi(value: string): string {
  return value.replace(/\u001B\[[0-?]*[ -/]*[@-~]/gu, "");
}

function isWide(codePoint: number): boolean {
  return (
    codePoint >= 0x1100 &&
    (codePoint <= 0x115f ||
      codePoint === 0x2329 ||
      codePoint === 0x232a ||
      (codePoint >= 0x2e80 && codePoint <= 0xa4cf && codePoint !== 0x303f) ||
      (codePoint >= 0xac00 && codePoint <= 0xd7a3) ||
      (codePoint >= 0xf900 && codePoint <= 0xfaff) ||
      (codePoint >= 0xfe10 && codePoint <= 0xfe19) ||
      (codePoint >= 0xfe30 && codePoint <= 0xfe6f) ||
      (codePoint >= 0xff00 && codePoint <= 0xff60) ||
      (codePoint >= 0xffe0 && codePoint <= 0xffe6) ||
      (codePoint >= 0x1f300 && codePoint <= 0x1faff) ||
      (codePoint >= 0x20000 && codePoint <= 0x3fffd))
  );
}

export function terminalCellWidth(value: string): number {
  let width = 0;
  for (const character of stripAnsi(value)) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (
      codePoint === 0 ||
      codePoint < 0x20 ||
      (codePoint >= 0x7f && codePoint < 0xa0) ||
      (codePoint >= 0x300 && codePoint <= 0x36f)
    ) {
      continue;
    }
    width += isWide(codePoint) ? 2 : 1;
  }
  return width;
}

function truncateCells(value: string, maximum: number): string {
  if (maximum <= 0) return "";
  if (terminalCellWidth(value) <= maximum) return value;
  const plain = stripAnsi(value);
  let output = "";
  for (const character of plain) {
    if (terminalCellWidth(`${output}${character}…`) > maximum) break;
    output += character;
  }
  return `${output}…`;
}

function padCells(value: string, width: number): string {
  return `${value}${" ".repeat(Math.max(0, width - terminalCellWidth(value)))}`;
}

function scoreCommand(command: SlashCommandSpec, query: string): number {
  if (query.length === 0) return 100;
  const normalized = query.toLowerCase();
  if (command.name === normalized) return 1_000;
  if (command.name.startsWith(normalized)) return 800 - command.name.length;
  if (command.aliases.some((alias) => alias === normalized)) return 750;
  if (command.name.includes(normalized)) return 500 - command.name.indexOf(normalized);
  if (command.description.toLowerCase().includes(normalized)) return 200;
  return -1;
}

export function slashCommandSuggestions(
  input: string,
  limit = INTERACTIVE_SLASH_COMMANDS.length,
): readonly SlashCommandSpec[] {
  if (!input.startsWith("/") || input.slice(1).includes(" ")) return [];
  const query = input.slice(1).toLowerCase();
  return INTERACTIVE_SLASH_COMMANDS.map((command, index) => ({
    command,
    index,
    score: scoreCommand(command, query),
  }))
    .filter((candidate) => candidate.score >= 0)
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .slice(0, Math.max(0, limit))
    .map((candidate) => candidate.command);
}

function stateGlyph(state: string): string {
  if (state === "completed") return "✓";
  if (state === "running" || state === "validating") return "●";
  if (state === "blocked" || state === "recovering") return "!";
  return "·";
}

function shortenHomePath(workspaceRoot: string): string {
  const home = process.env["HOME"];
  return home !== undefined && workspaceRoot.startsWith(`${home}/`)
    ? `~/${workspaceRoot.slice(home.length + 1)}`
    : workspaceRoot;
}

export function renderHomeScreen(input: HomeScreenInput): string {
  const color = input.color === true;
  const boxWidth = Math.max(42, Math.min(104, (input.columns ?? 100) - 2));
  const innerWidth = boxWidth - 4;
  const line = (content = ""): string => `│ ${padCells(truncateCells(content, innerWidth), innerWidth)} │`;
  const divider = `├${"─".repeat(boxWidth - 2)}┤`;
  const top = `╭${"─".repeat(boxWidth - 2)}╮`;
  const bottom = `╰${"─".repeat(boxWidth - 2)}╯`;
  const provider = `${input.config.provider.kind}/${input.config.provider.model}`;
  const verification =
    input.config.verification.commands.length === 0
      ? "advisory"
      : `${input.config.verification.commands.length} command${input.config.verification.commands.length === 1 ? "" : "s"}`;
  const mode = input.config.permissionMode === "read-only" ? "READ ONLY" : "WORKSPACE WRITE";
  const sessions = input.recentSessions.slice(0, 3);
  const rows = [
    top,
    line(
      `${paint(color, "1;36", "SEH")} ${paint(color, "2", `v${input.version}`)}  ${paint(color, "1", "SELF-EVOLVING CODING AGENT")}`,
    ),
    line(paint(color, "2", "Execute tasks. Improve the harness. Keep trust immutable.")),
    divider,
    line(`${paint(color, "1;36", "WORKSPACE")}  ${shortenHomePath(input.workspaceRoot)}`),
    line(`${paint(color, "1;35", "MODEL")}      ${provider}`),
    line(`${paint(color, input.config.permissionMode === "read-only" ? "33" : "32", "ACCESS")}     ${mode} · shell network denied`),
    line(`${paint(color, "1;34", "VERIFY")}     ${verification}`),
    divider,
    line(paint(color, "1", "RECENT THREADS")),
    ...(sessions.length === 0
      ? [line(paint(color, "2", "  No sessions yet — describe a task to begin."))]
      : sessions.map((session) =>
          line(
            `  ${paint(color, session.state === "completed" ? "32" : "33", stateGlyph(session.state))} ${session.sessionId.slice(-12).padEnd(12)}  ${session.task.replace(/\s+/gu, " ")}`,
          ),
        )),
    divider,
    line(`${paint(color, "1;36", "›")} Describe a task, or type ${paint(color, "1;35", "/")} to open the command palette`),
    line(paint(color, "2", "  ↑↓ navigate · Tab complete · Enter run · Ctrl-C clear · Ctrl-D exit")),
    bottom,
    "",
  ];
  return rows.join("\n");
}

export function renderResponsePanel(input: ResponsePanelInput): string {
  const color = input.color === true;
  const width = Math.max(40, Math.min(100, (input.columns ?? 100) - 2));
  const statePassed = input.state === "completed";
  const status = paint(color, statePassed ? "1;32" : "1;31", statePassed ? "✓ completed" : `✗ ${input.state}`);
  const verification =
    input.verificationPassed === null
      ? paint(color, "2", "verify advisory")
      : input.verificationPassed
        ? paint(color, "32", "verify passed")
        : paint(color, "31", "verify failed");
  const usage =
    input.modelCalls === null || input.toolCalls === null || input.totalTokens === null
      ? "usage unavailable"
      : `${input.modelCalls} model · ${input.toolCalls} tools · ${input.totalTokens.toLocaleString("en-US")} tokens`;
  const headerLabel = ` ${paint(color, "1;36", "SEH RESPONSE")} `;
  const headerRule = "─".repeat(Math.max(1, width - terminalCellWidth(headerLabel) - 2));
  const footerContent = `${status} · ${verification} · ${usage} · ${input.sessionId.slice(-12)}`;
  const footerRule = "─".repeat(Math.max(1, width - terminalCellWidth(footerContent) - 4));
  const verificationDetail =
    input.verificationPassed === false && input.verificationSummary !== null
      ? `\n${paint(color, "31", `Verification: ${input.verificationSummary}`)}`
      : "";
  return [
    "",
    `╭─${headerLabel}${headerRule}`,
    "",
    input.text,
    verificationDetail,
    "",
    `╰─ ${footerContent} ${footerRule}`,
    "",
  ].join("\n");
}

function codePointIndex(value: string, logicalIndex: number): number {
  return [...value].slice(0, logicalIndex).join("").length;
}

function logicalLength(value: string): number {
  return [...value].length;
}

function insertAt(value: string, logicalIndex: number, insertion: string): string {
  const index = codePointIndex(value, logicalIndex);
  return `${value.slice(0, index)}${insertion}${value.slice(index)}`;
}

function removeBefore(value: string, logicalIndex: number): { readonly value: string; readonly cursor: number } {
  if (logicalIndex <= 0) return { value, cursor: logicalIndex };
  const characters = [...value];
  characters.splice(logicalIndex - 1, 1);
  return { value: characters.join(""), cursor: logicalIndex - 1 };
}

function removeAt(value: string, logicalIndex: number): string {
  const characters = [...value];
  characters.splice(logicalIndex, 1);
  return characters.join("");
}

export class TerminalLineEditor {
  readonly #input: ReadStream;
  readonly #output: WriteStream;
  readonly #color: boolean;
  readonly #history: string[];
  readonly #maxPaletteRows: number;
  #closed = false;
  #reading = false;

  public constructor(options: TerminalLineEditorOptions = {}) {
    this.#input = options.input ?? process.stdin;
    this.#output = options.output ?? process.stdout;
    this.#color = options.color === true;
    this.#history = [...(options.history ?? [])].slice(-100);
    this.#maxPaletteRows = Math.max(4, options.maxPaletteRows ?? 8);
    emitKeypressEvents(this.#input);
  }

  public async question(prompt: string): Promise<string | null> {
    if (this.#closed) return null;
    if (this.#reading) throw new Error("TerminalLineEditor cannot read two inputs concurrently");
    this.#reading = true;

    return new Promise<string | null>((resolve) => {
      let buffer = "";
      let cursor = 0;
      let selected = 0;
      let paletteSuppressed = false;
      let historyIndex = this.#history.length;
      let draft = "";
      const wasRaw = this.#input.isRaw;

      const suggestions = (): readonly SlashCommandSpec[] =>
        paletteSuppressed ? [] : slashCommandSuggestions(buffer);

      const cleanup = (): void => {
        this.#input.removeListener("keypress", onKeypress);
        if (this.#input.isTTY) this.#input.setRawMode(wasRaw === true);
        this.#input.pause();
        this.#reading = false;
      };

      const clearRendered = (): void => {
        this.#output.write("\r\u001B[0J");
      };

      const render = (): void => {
        clearRendered();
        this.#output.write("\u001B[?25l");
        this.#output.write(`${prompt}${buffer}`);
        const candidates = suggestions();
        const rowLimit = Math.min(this.#maxPaletteRows, candidates.length);
        const start = Math.max(0, Math.min(selected - rowLimit + 1, candidates.length - rowLimit));
        const visible = candidates.slice(start, start + rowLimit);
        const commandWidth = Math.max(
          12,
          ...visible.map((command) =>
            terminalCellWidth(`/${command.name}${command.argumentHint === null ? "" : ` ${command.argumentHint}`}`),
          ),
        );
        for (let index = 0; index < visible.length; index += 1) {
          const command = visible[index];
          if (command === undefined) continue;
          const absoluteIndex = start + index;
          const marker = absoluteIndex === selected ? "›" : " ";
          const commandText = `/${command.name}${command.argumentHint === null ? "" : ` ${command.argumentHint}`}`;
          const available = Math.max(18, (this.#output.columns ?? 100) - commandWidth - 8);
          this.#output.write(
            `\n  ${paint(this.#color, absoluteIndex === selected ? "1;36" : "2", marker)} ${paint(this.#color, absoluteIndex === selected ? "1;35" : "37", padCells(commandText, commandWidth))} ${paint(this.#color, "2", truncateCells(command.description, available))}`,
          );
        }
        if (visible.length > 0) {
          this.#output.write(
            `\n  ${paint(this.#color, "2", "↑↓ select · Tab complete · Enter choose · Esc close")}`,
          );
        }
        const renderedRows = visible.length + (visible.length > 0 ? 1 : 0);
        if (renderedRows > 0) this.#output.write(`\u001B[${renderedRows}A`);
        this.#output.write("\r");
        const beforeCursor = [...buffer].slice(0, cursor).join("");
        const cursorColumn = terminalCellWidth(prompt) + terminalCellWidth(beforeCursor);
        if (cursorColumn > 0) this.#output.write(`\u001B[${cursorColumn}C`);
        this.#output.write("\u001B[?25h");
      };

      const finish = (value: string | null): void => {
        clearRendered();
        if (value !== null) this.#output.write(`${prompt}${value}\n`);
        else this.#output.write("\n");
        if (value !== null && value.trim().length > 0 && this.#history.at(-1) !== value) {
          this.#history.push(value);
          if (this.#history.length > 100) this.#history.shift();
        }
        cleanup();
        resolve(value);
      };

      const resetSelection = (): void => {
        selected = 0;
        historyIndex = this.#history.length;
        paletteSuppressed = false;
      };

      const completeSelection = (): boolean => {
        const candidate = suggestions()[selected];
        if (candidate === undefined) return false;
        buffer = `/${candidate.name}${candidate.argumentHint === null ? "" : " "}`;
        cursor = logicalLength(buffer);
        selected = 0;
        paletteSuppressed = candidate.argumentHint !== null;
        return true;
      };

      const onKeypress = (text: string | undefined, key: Key): void => {
        if (key.ctrl === true && key.name === "c") {
          if (buffer.length === 0) {
            this.#output.write("^C");
            finish("");
          } else {
            buffer = "";
            cursor = 0;
            resetSelection();
            render();
          }
          return;
        }
        if (key.ctrl === true && key.name === "d") {
          if (buffer.length === 0) finish(null);
          else {
            buffer = removeAt(buffer, cursor);
            resetSelection();
            render();
          }
          return;
        }
        if (key.ctrl === true && key.name === "a") {
          cursor = 0;
          render();
          return;
        }
        if (key.ctrl === true && key.name === "e") {
          cursor = logicalLength(buffer);
          render();
          return;
        }
        if (key.ctrl === true && key.name === "u") {
          buffer = [...buffer].slice(cursor).join("");
          cursor = 0;
          resetSelection();
          render();
          return;
        }
        if (key.ctrl === true && key.name === "k") {
          buffer = [...buffer].slice(0, cursor).join("");
          resetSelection();
          render();
          return;
        }
        if (key.ctrl === true && key.name === "l") {
          this.#output.write("\u001Bc");
          render();
          return;
        }
        if (key.name === "return" || key.name === "enter") {
          const candidates = suggestions();
          const query = buffer.startsWith("/") ? buffer.slice(1) : "";
          const exact = INTERACTIVE_SLASH_COMMANDS.some(
            (command) => command.name === query || command.aliases.includes(query),
          );
          if (candidates.length > 0 && !exact) {
            const candidate = candidates[selected];
            if (candidate !== undefined && candidate.argumentHint !== null) {
              completeSelection();
              render();
              return;
            }
            if (candidate !== undefined) {
              finish(`/${candidate.name}`);
              return;
            }
          }
          finish(buffer);
          return;
        }
        if (key.name === "tab") {
          if (completeSelection()) render();
          return;
        }
        if (key.name === "escape") {
          paletteSuppressed = true;
          render();
          return;
        }
        if (key.name === "backspace") {
          const removed = removeBefore(buffer, cursor);
          buffer = removed.value;
          cursor = removed.cursor;
          resetSelection();
          render();
          return;
        }
        if (key.name === "delete") {
          buffer = removeAt(buffer, cursor);
          resetSelection();
          render();
          return;
        }
        if (key.name === "left") {
          cursor = Math.max(0, cursor - 1);
          render();
          return;
        }
        if (key.name === "right") {
          cursor = Math.min(logicalLength(buffer), cursor + 1);
          render();
          return;
        }
        if (key.name === "home") {
          cursor = 0;
          render();
          return;
        }
        if (key.name === "end") {
          cursor = logicalLength(buffer);
          render();
          return;
        }
        if (key.name === "up" || key.name === "down") {
          const candidates = suggestions();
          if (candidates.length > 0) {
            selected =
              key.name === "up"
                ? (selected - 1 + candidates.length) % candidates.length
                : (selected + 1) % candidates.length;
            render();
            return;
          }
          if (this.#history.length > 0) {
            if (key.name === "up" && historyIndex > 0) {
              if (historyIndex === this.#history.length) draft = buffer;
              historyIndex -= 1;
              buffer = this.#history[historyIndex] ?? buffer;
            } else if (key.name === "down" && historyIndex < this.#history.length) {
              historyIndex += 1;
              buffer = historyIndex === this.#history.length ? draft : (this.#history[historyIndex] ?? buffer);
            }
            cursor = logicalLength(buffer);
            render();
          }
          return;
        }
        if (key.ctrl === true || key.meta === true || text === undefined || text.length === 0) return;
        const printable = text.replace(/[\r\n]/gu, " ");
        buffer = insertAt(buffer, cursor, printable);
        cursor += logicalLength(printable);
        resetSelection();
        render();
      };

      this.#input.on("keypress", onKeypress);
      if (this.#input.isTTY) this.#input.setRawMode(true);
      this.#input.resume();
      render();
    });
  }

  public close(): void {
    this.#closed = true;
    if (this.#input.isTTY && this.#input.isRaw) this.#input.setRawMode(false);
    this.#input.pause();
  }
}
