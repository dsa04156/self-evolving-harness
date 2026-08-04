import path from "node:path";

import {
  Box,
  Text,
  render,
  useAnimation,
  useInput,
  usePaste,
  useWindowSize,
  type Instance,
} from "ink";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

import type { PermissionMode } from "./config.js";
import type { ModelReasoningEffort } from "../domain/model.js";
import {
  INTERACTIVE_SLASH_COMMANDS,
  slashCommandSuggestions,
  terminalCellWidth,
  type HomeSessionSummary,
  type SlashCommandSpec,
} from "./terminal-ui.js";

export type TuiMessageRole = "user" | "assistant" | "system" | "tool" | "error";

export interface TuiMessage {
  readonly messageId: number;
  readonly role: TuiMessageRole;
  readonly text: string;
  readonly title?: string;
  readonly meta?: string;
}

export interface TuiActivity {
  readonly kind: "thinking" | "tool" | "verifying" | "recovering";
  readonly label: string;
}

export interface TuiPickerItem {
  readonly id: string;
  readonly label: string;
  readonly description?: string;
}

interface TuiPickerState {
  readonly title: string;
  readonly hint: string;
  readonly items: readonly TuiPickerItem[];
}

export interface FullscreenTuiStatus {
  readonly version: string;
  readonly workspaceRoot: string;
  readonly provider: string;
  readonly model: string;
  readonly reasoningEffort: ModelReasoningEffort | null;
  readonly fastMode: boolean;
  readonly permissionMode: PermissionMode;
  readonly verificationCount: number;
  readonly coordinationLimit: number;
  readonly activeSkillIds: readonly string[];
  readonly threadNumber: number;
  readonly recentSessions: readonly HomeSessionSummary[];
}

interface FullscreenTuiSnapshot {
  readonly status: FullscreenTuiStatus;
  readonly messages: readonly TuiMessage[];
  readonly activity: TuiActivity | null;
  readonly composerEnabled: boolean;
  readonly composerEpoch: number;
  readonly composerSeed: string;
  readonly picker: TuiPickerState | null;
  readonly notice: string | null;
}

type Listener = () => void;

function logicalLength(value: string): number {
  return [...value].length;
}

function insertAt(value: string, cursor: number, insertion: string): string {
  const characters = [...value];
  characters.splice(cursor, 0, ...insertion);
  return characters.join("");
}

function removeBefore(value: string, cursor: number): { readonly value: string; readonly cursor: number } {
  if (cursor <= 0) return { value, cursor };
  const characters = [...value];
  characters.splice(cursor - 1, 1);
  return { value: characters.join(""), cursor: cursor - 1 };
}

function removeAt(value: string, cursor: number): string {
  const characters = [...value];
  characters.splice(cursor, 1);
  return characters.join("");
}

function commandIsExact(value: string): boolean {
  if (!value.startsWith("/")) return false;
  const query = value.slice(1);
  return INTERACTIVE_SLASH_COMMANDS.some(
    (command) => command.name === query || command.aliases.includes(query),
  );
}

function permissionText(mode: PermissionMode): string {
  return mode === "read-only" ? "READ ONLY" : "WORKSPACE WRITE";
}

function stateMark(state: string): { readonly glyph: string; readonly color: string } {
  if (state === "completed") return { glyph: "✓", color: "green" };
  if (state === "blocked") return { glyph: "!", color: "red" };
  if (state === "running" || state === "validating") return { glyph: "●", color: "yellow" };
  return { glyph: "·", color: "gray" };
}

export class FullscreenTuiController {
  #snapshot: FullscreenTuiSnapshot;
  readonly #listeners = new Set<Listener>();
  #questionResolver: ((value: string | null) => void) | null = null;
  #pickerResolver: ((value: string | null) => void) | null = null;
  #interruptHandler: (() => void) | null = null;
  #messageId = 0;
  #instance: Instance | null = null;
  #closed = false;

  public constructor(status: FullscreenTuiStatus) {
    this.#snapshot = {
      status,
      messages: [],
      activity: null,
      composerEnabled: false,
      composerEpoch: 0,
      composerSeed: "",
      picker: null,
      notice: null,
    };
  }

  public readonly subscribe = (listener: Listener): (() => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  public readonly getSnapshot = (): FullscreenTuiSnapshot => this.#snapshot;

  public attach(instance: Instance): void {
    this.#instance = instance;
  }

  public updateStatus(status: FullscreenTuiStatus): void {
    this.#update({ status });
  }

  public appendMessage(
    role: TuiMessageRole,
    text: string,
    options: { readonly title?: string; readonly meta?: string } = {},
  ): void {
    this.#messageId += 1;
    const message: TuiMessage = {
      messageId: this.#messageId,
      role,
      text,
      ...(options.title === undefined ? {} : { title: options.title }),
      ...(options.meta === undefined ? {} : { meta: options.meta }),
    };
    this.#update({ messages: [...this.#snapshot.messages, message].slice(-250), notice: null });
  }

  public clearMessages(): void {
    this.#update({ messages: [], notice: null, activity: null });
  }

  public setActivity(activity: TuiActivity | null): void {
    this.#update({ activity });
  }

  public setNotice(notice: string | null): void {
    this.#update({ notice });
  }

  public setInterruptHandler(handler: (() => void) | null): void {
    this.#interruptHandler = handler;
  }

  public interrupt(): void {
    this.#interruptHandler?.();
  }

  public question(initialValue = ""): Promise<string | null> {
    if (this.#closed) return Promise.resolve(null);
    if (this.#questionResolver !== null) {
      return Promise.reject(new Error("Fullscreen TUI already has an active composer"));
    }
    this.#update({
      composerEnabled: true,
      composerEpoch: this.#snapshot.composerEpoch + 1,
      composerSeed: initialValue,
      activity: null,
    });
    return new Promise((resolve) => {
      this.#questionResolver = resolve;
    });
  }

  public submit(value: string | null): void {
    const resolver = this.#questionResolver;
    if (resolver === null) return;
    this.#questionResolver = null;
    if (value !== null) this.#update({ composerEnabled: false, notice: null });
    resolver(value);
  }

  public select(
    title: string,
    items: readonly TuiPickerItem[],
    hint = "↑↓ select · Enter open · Esc cancel",
  ): Promise<string | null> {
    if (this.#closed) return Promise.resolve(null);
    if (this.#pickerResolver !== null) {
      return Promise.reject(new Error("Fullscreen TUI already has an active picker"));
    }
    this.#update({ picker: { title, items, hint }, composerEnabled: false });
    return new Promise((resolve) => {
      this.#pickerResolver = resolve;
    });
  }

  public resolvePicker(value: string | null): void {
    const resolver = this.#pickerResolver;
    if (resolver === null) return;
    this.#pickerResolver = null;
    this.#update({ picker: null });
    resolver(value);
  }

  public async close(): Promise<void> {
    if (this.#closed) return;
    this.#closed = true;
    this.#questionResolver?.(null);
    this.#pickerResolver?.(null);
    this.#questionResolver = null;
    this.#pickerResolver = null;
    const instance = this.#instance;
    if (instance !== null) {
      instance.unmount();
      await instance.waitUntilExit();
      instance.cleanup();
    }
  }

  #update(patch: Partial<FullscreenTuiSnapshot>): void {
    this.#snapshot = { ...this.#snapshot, ...patch };
    for (const listener of this.#listeners) listener();
  }
}

function Header({ status, compact }: { readonly status: FullscreenTuiStatus; readonly compact: boolean }) {
  const accessColor = status.permissionMode === "read-only" ? "yellow" : "green";
  return (
    <Box borderStyle="single" borderColor="#334155" paddingX={1} flexDirection="column">
      <Box justifyContent="space-between">
        <Text>
          <Text bold color="cyan">SEH</Text>
          <Text dimColor> v{status.version}</Text>
          <Text bold>  SELF-EVOLVING CODING AGENT</Text>
        </Text>
        {!compact && <Text dimColor>thread {status.threadNumber}</Text>}
      </Box>
      <Box justifyContent="space-between">
        <Box flexGrow={1} flexShrink={1} marginRight={1}>
          <Text wrap="truncate-end">
            <Text color="cyan">{path.basename(status.workspaceRoot)}</Text>
            {!compact && <Text dimColor>  {status.workspaceRoot}</Text>}
          </Text>
        </Box>
        <Text wrap="truncate-end">
          <Text color="magenta">{status.provider}/{status.model}</Text>
          <Text dimColor> · </Text>
          <Text color="yellow">{(status.reasoningEffort ?? "AUTO").toUpperCase()}</Text>
          {status.fastMode && <Text bold color="green"> · FAST</Text>}
          <Text dimColor> · </Text>
          <Text color={accessColor}>{permissionText(status.permissionMode)}</Text>
          {!compact && status.coordinationLimit > 0 && (
            <Text dimColor> · agents {status.coordinationLimit}</Text>
          )}
          {!compact && status.activeSkillIds.length > 0 && (
            <Text color="blue"> · skills {status.activeSkillIds.length}</Text>
          )}
          {!compact && <Text dimColor> · verify {status.verificationCount || "advisory"}</Text>}
        </Text>
      </Box>
    </Box>
  );
}

function EvolutionCore({ compact }: { readonly compact: boolean }) {
  const { frame } = useAnimation({ interval: 420, isActive: true });
  const orbit = ["·", "◦", "●", "◦"] as const;
  const taskParticle = orbit[frame % orbit.length] ?? "●";
  const evolutionParticle = orbit[(frame + 2) % orbit.length] ?? "·";
  return (
    <Box flexDirection="column" alignItems="center" flexShrink={0}>
      <Text>
        <Text color="cyan">{taskParticle} ╭────── </Text>
        <Text bold color="cyan">TASK EXECUTION</Text>
        <Text color="cyan"> ──────╮ {evolutionParticle}</Text>
      </Text>
      <Text>
        <Text color="cyan">    ╲ </Text>
        <Text dimColor>{compact ? "context → model → tools → verify" : "context  →  model  →  tools  →  verification"}</Text>
        <Text color="cyan"> ╱</Text>
      </Text>
      <Text>
        <Text color="cyan">      ╲       </Text>
        <Text bold>◈  S E H  ◈</Text>
        <Text color="magenta">       ╱</Text>
      </Text>
      <Text>
        <Text color="magenta">    ╱ </Text>
        <Text dimColor>{compact ? "traces → attribute → version → gate" : "traces  →  attribution  →  version  →  evaluation"}</Text>
        <Text color="magenta"> ╲</Text>
      </Text>
      <Text>
        <Text color="magenta">{evolutionParticle} ╰───── </Text>
        <Text bold color="magenta">HARNESS EVOLUTION</Text>
        <Text color="magenta"> ─────╯ {taskParticle}</Text>
      </Text>
      <Text>
        <Text color="yellow">◆ </Text>
        <Text bold color="yellow">IMMUTABLE TRUST</Text>
        <Text dimColor> · evaluator · policy · audit · </Text>
        <Text color="green">LOCKED</Text>
        <Text color="yellow"> ◆</Text>
      </Text>
    </Box>
  );
}

function Home({
  status,
  compact,
  commandPaletteOpen,
}: {
  readonly status: FullscreenTuiStatus;
  readonly compact: boolean;
  readonly commandPaletteOpen: boolean;
}) {
  if (commandPaletteOpen) {
    return (
      <Box flexDirection="column" flexGrow={1} flexShrink={1} minHeight={0} overflow="hidden" paddingX={3} paddingY={1}>
        <Text bold color="magenta">Command palette</Text>
        <Text dimColor>Keep typing to filter, then choose a command below.</Text>
      </Box>
    );
  }
  return (
    <Box flexDirection="column" flexGrow={1} flexShrink={1} minHeight={0} overflow="hidden" paddingX={compact ? 1 : 3} paddingTop={1}>
      <EvolutionCore compact={compact} />
      <Box marginTop={1} justifyContent="center">
        <Text bold color="cyan">Ready in {path.basename(status.workspaceRoot)}</Text>
        <Text dimColor> · describe a task or press </Text>
        <Text bold color="magenta">/</Text>
      </Box>
      <Box justifyContent="center">
        <Text><Text color="magenta">/model</Text><Text dimColor> route  </Text><Text color="magenta">/agent</Text><Text dimColor> delegate  </Text><Text color="magenta">/resume</Text><Text dimColor> history  </Text><Text color="magenta">/review</Text><Text dimColor> diff  </Text><Text color="magenta">/tools</Text><Text dimColor> authority</Text></Text>
      </Box>
      <Box marginTop={1} flexDirection="column" alignItems="center">
        {status.recentSessions.length === 0 ? (
          <Text dimColor>No durable threads yet · your first task starts the evidence trail.</Text>
        ) : (
          status.recentSessions.slice(0, compact ? 2 : 5).map((session) => {
            const mark = stateMark(session.state);
            return (
              <Text key={session.sessionId} wrap="truncate-end">
                <Text color={mark.color}>{mark.glyph}</Text>
                <Text dimColor> {session.sessionId.slice(-10)} </Text>
                {session.task.replace(/\s+/gu, " ")}
              </Text>
            );
          })
        )}
      </Box>
      {!compact && <Box marginTop={1} justifyContent="center">
        <Text dimColor>Task retry stays in the task lifecycle. Harness evolution always creates and evaluates a new version.</Text>
      </Box>}
    </Box>
  );
}

/*
 * Transcript rows are flattened before rendering so PageUp/PageDown can move
 * through one long model answer instead of skipping whole messages.
 */
interface TranscriptLine {
  readonly key: string;
  readonly text: string;
  readonly color?: string;
  readonly bold?: boolean;
  readonly dim?: boolean;
}

function clipTranscriptText(value: string, maximum: number): string {
  if (maximum <= 0) return "";
  if (terminalCellWidth(value) <= maximum) return value;
  let output = "";
  for (const character of value) {
    if (terminalCellWidth(`${output}${character}…`) > maximum) break;
    output += character;
  }
  return `${output}…`;
}

function wrapTranscriptText(value: string, maximum: number): readonly string[] {
  const width = Math.max(1, maximum);
  const output: string[] = [];
  for (const sourceLine of value.split("\n")) {
    if (sourceLine.length === 0) {
      output.push("");
      continue;
    }
    let current = "";
    for (const character of sourceLine) {
      if (current.length > 0 && terminalCellWidth(`${current}${character}`) > width) {
        output.push(current);
        current = character;
      } else {
        current += character;
      }
    }
    output.push(current);
  }
  return output.length === 0 ? [""] : output;
}

export function buildTranscriptLines(
  messages: readonly TuiMessage[],
  columns: number,
): readonly TranscriptLine[] {
  const width = Math.max(20, columns);
  const bodyWidth = Math.max(1, width - 3);
  const lines: TranscriptLine[] = [];
  for (const message of messages) {
    const presentation = {
      user: { label: "YOU", color: "magenta" },
      assistant: { label: "SEH", color: "cyan" },
      system: { label: message.title ?? "SYSTEM", color: "yellow" },
      tool: { label: message.title ?? "TOOL", color: "gray" },
      error: { label: message.title ?? "ERROR", color: "red" },
    }[message.role];
    if (message.role === "tool") {
      lines.push({
        key: `${message.messageId}:tool`,
        text: clipTranscriptText(
          `  ${message.text}${message.meta === undefined ? "" : ` · ${message.meta}`}`,
          width,
        ),
        color: presentation.color,
        dim: true,
      });
      continue;
    }
    const heading = `${presentation.label}${message.meta === undefined ? "" : ` · ${message.meta}`}`;
    lines.push({
      key: `${message.messageId}:header`,
      text: `╭─ ${clipTranscriptText(heading, Math.max(1, width - 3))}`,
      color: presentation.color,
      bold: true,
    });
    wrapTranscriptText(message.text, bodyWidth).forEach((line, index) => {
      lines.push({
        key: `${message.messageId}:body:${index}`,
        text: `│  ${line}`,
        ...(message.role === "error" ? { color: "red" } : {}),
      });
    });
    lines.push({
      key: `${message.messageId}:footer`,
      text: "╰─",
      color: presentation.color,
    });
    lines.push({ key: `${message.messageId}:space`, text: "" });
  }
  return lines;
}

function Transcript({
  lines,
  scrollOffset,
  rows,
}: {
  readonly lines: readonly TranscriptLine[];
  readonly scrollOffset: number;
  readonly rows: number;
}) {
  const hasScroll = lines.length > rows;
  const capacity = Math.max(1, rows - (hasScroll ? 1 : 0));
  const end = Math.max(0, lines.length - scrollOffset);
  const start = Math.max(0, end - capacity);
  const visible = lines.slice(start, end);
  return (
    <Box flexDirection="column" flexGrow={1} flexShrink={1} minHeight={0} overflowY="hidden" paddingX={1} paddingTop={1}>
      {hasScroll && (
        <Text dimColor>
          ↑ {start} earlier row{start === 1 ? "" : "s"} · {lines.length - end} newer · PageUp/PageDown
        </Text>
      )}
      {visible.map((line) => (
        <Text
          key={line.key}
          {...(line.color === undefined ? {} : { color: line.color })}
          bold={line.bold === true}
          dimColor={line.dim === true}
        >
          {line.text}
        </Text>
      ))}
    </Box>
  );
}

function Activity({ activity }: { readonly activity: TuiActivity | null }) {
  const { frame } = useAnimation({ interval: 80, isActive: activity !== null });
  const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"] as const;
  if (activity === null) return <Box height={1}><Text> </Text></Box>;
  const color = activity.kind === "tool" ? "yellow" : activity.kind === "verifying" ? "green" : "cyan";
  return (
    <Box height={1} paddingX={2}>
      <Text color={color}>{frames[frame % frames.length] ?? "⠋"} {activity.label}</Text>
      <Text dimColor>  Ctrl-C interrupt</Text>
    </Box>
  );
}

function CommandPalette({
  candidates,
  selected,
  maximumRows,
}: {
  readonly candidates: readonly SlashCommandSpec[];
  readonly selected: number;
  readonly maximumRows: number;
}) {
  if (candidates.length === 0) return null;
  const count = Math.min(maximumRows, candidates.length);
  const start = Math.max(0, Math.min(selected - count + 1, candidates.length - count));
  return (
    <Box borderStyle="round" borderColor="magenta" flexDirection="column" paddingX={1} marginX={1}>
      {candidates.slice(start, start + count).map((command, index) => {
        const active = start + index === selected;
        return (
          <Box key={command.name}>
            <Text color={active ? "cyan" : "gray"}>{active ? "›" : " "} </Text>
            <Text bold={active} {...(active ? { color: "magenta" } : {})}>
              /{command.name}{command.argumentHint === null ? "" : ` ${command.argumentHint}`}
            </Text>
            <Text dimColor>  {command.description}</Text>
          </Box>
        );
      })}
      <Text dimColor>↑↓ select · Tab complete · Enter choose · Esc close</Text>
    </Box>
  );
}

function Picker({
  picker,
  items,
  query,
  selected,
  maximumRows,
}: {
  readonly picker: TuiPickerState;
  readonly items: readonly TuiPickerItem[];
  readonly query: string;
  readonly selected: number;
  readonly maximumRows: number;
}) {
  const maximum = Math.max(1, maximumRows);
  const start = Math.max(0, Math.min(selected - maximum + 1, items.length - maximum));
  const visible = items.slice(start, start + maximum);
  return (
    <Box flexGrow={1} flexShrink={1} minHeight={0} overflow="hidden" alignItems="center" justifyContent="center">
      <Box width="85%" borderStyle="double" borderColor="cyan" flexDirection="column" paddingX={2} paddingY={1}>
        <Text bold color="cyan">{picker.title}</Text>
        <Text dimColor>{picker.hint}</Text>
        <Text>
          <Text color="magenta">Search </Text>
          {query}<Text inverse> </Text>
          <Text dimColor>  {items.length}/{picker.items.length}</Text>
        </Text>
        <Box marginTop={1} flexDirection="column">
          {visible.length === 0 ? <Text dimColor>No matching choices.</Text> : visible.map((item, index) => {
            const active = start + index === selected;
            return (
              <Box key={item.id} width="100%">
                <Box width={2} flexShrink={0}>
                  <Text color={active ? "cyan" : "gray"}>{active ? "›" : " "}</Text>
                </Box>
                <Box width={27} flexShrink={0}>
                  <Text bold={active} wrap="truncate-end">{item.label}</Text>
                </Box>
                {item.description !== undefined && (
                  <Box flexGrow={1} flexShrink={1} minWidth={0}>
                    <Text dimColor wrap="truncate-end">{item.description}</Text>
                  </Box>
                )}
              </Box>
            );
          })}
        </Box>
      </Box>
    </Box>
  );
}

function Composer({
  value,
  cursor,
  enabled,
}: {
  readonly value: string;
  readonly cursor: number;
  readonly enabled: boolean;
}) {
  const characters = [...value];
  const before = characters.slice(0, cursor).join("");
  const current = characters[cursor] ?? " ";
  const after = characters.slice(cursor + (characters[cursor] === undefined ? 0 : 1)).join("");
  return (
    <Box borderStyle="round" borderColor={enabled ? "cyan" : "gray"} paddingX={1} marginX={1} minHeight={3}>
      <Text color={enabled ? "cyan" : "gray"}>❯ </Text>
      {enabled ? (
        <Text>
          {before}<Text inverse>{current}</Text>{after}
        </Text>
      ) : (
        <Text dimColor>Agent is working…</Text>
      )}
    </Box>
  );
}

export function FullscreenTuiApp({ controller }: { readonly controller: FullscreenTuiController }) {
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  const { columns, rows } = useWindowSize();
  const compact = columns < 100 || rows <= 26;
  const [editor, setEditor] = useState({ value: "", cursor: 0 });
  const editorRef = useRef(editor);
  const updateEditor = (
    update: { readonly value: string; readonly cursor: number } | (
      (current: { readonly value: string; readonly cursor: number }) => {
        readonly value: string;
        readonly cursor: number;
      }
    ),
  ): void => {
    const next = typeof update === "function" ? update(editorRef.current) : update;
    editorRef.current = next;
    setEditor(next);
  };
  const { value, cursor } = editor;
  const [selectedCommand, setSelectedCommand] = useState(0);
  const [selectedPicker, setSelectedPicker] = useState(0);
  const [pickerQuery, setPickerQuery] = useState("");
  const [paletteSuppressed, setPaletteSuppressed] = useState(false);
  const [history, setHistory] = useState<readonly string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [historyDraft, setHistoryDraft] = useState("");
  const [scrollOffset, setScrollOffset] = useState(0);
  const candidates = useMemo(
    () => (paletteSuppressed ? [] : slashCommandSuggestions(value)),
    [paletteSuppressed, value],
  );
  const filteredPickerItems = useMemo(() => {
    if (snapshot.picker === null) return [];
    const query = pickerQuery.trim().toLowerCase();
    if (query.length === 0) return snapshot.picker.items;
    return snapshot.picker.items.filter((item) =>
      `${item.label} ${item.description ?? ""}`.toLowerCase().includes(query)
    );
  }, [pickerQuery, snapshot.picker]);
  const paletteRows = candidates.length === 0 ? 0 : Math.min(compact ? 4 : 8, candidates.length) + 2;
  const transcriptRows = Math.max(4, rows - 9 - paletteRows);
  const transcriptLines = useMemo(
    () => buildTranscriptLines(snapshot.messages, Math.max(20, columns - 2)),
    [columns, snapshot.messages],
  );
  const transcriptCapacity = Math.max(1, transcriptRows - (transcriptLines.length > transcriptRows ? 1 : 0));
  const maxScroll = Math.max(0, transcriptLines.length - transcriptCapacity);
  const pageScrollRows = Math.max(3, transcriptCapacity - 2);

  useEffect(() => {
    updateEditor({
      value: snapshot.composerSeed,
      cursor: logicalLength(snapshot.composerSeed),
    });
    setSelectedCommand(0);
    setPaletteSuppressed(false);
    setHistoryIndex(history.length);
  }, [snapshot.composerEpoch, history.length]);

  useEffect(() => {
    setSelectedPicker(0);
    setPickerQuery("");
  }, [snapshot.picker]);

  useEffect(() => {
    setScrollOffset(0);
  }, [snapshot.messages.length]);

  useEffect(() => {
    setScrollOffset((current) => Math.min(current, maxScroll));
  }, [maxScroll]);

  const submit = (submitted: string): void => {
    if (submitted.trim().length > 0 && history.at(-1) !== submitted) {
      setHistory((current) => [...current, submitted].slice(-100));
    }
    controller.submit(submitted);
  };

  const completeSelected = (): SlashCommandSpec | null => {
    const command = candidates[selectedCommand];
    if (command === undefined) return null;
    const completed = `/${command.name}${command.argumentHint === null ? "" : " "}`;
    updateEditor({ value: completed, cursor: logicalLength(completed) });
    setPaletteSuppressed(command.argumentHint !== null);
    setSelectedCommand(0);
    return command;
  };

  usePaste(
    (text) => {
      updateEditor((current) => ({
        value: insertAt(current.value, current.cursor, text),
        cursor: current.cursor + logicalLength(text),
      }));
      setPaletteSuppressed(false);
    },
    { isActive: snapshot.composerEnabled && snapshot.picker === null },
  );

  useInput((input, key) => {
    const currentEditor = editorRef.current;
    if (snapshot.picker !== null) {
      if (key.escape) {
        if (pickerQuery.length > 0) {
          setPickerQuery("");
          setSelectedPicker(0);
        } else {
          controller.resolvePicker(null);
        }
      } else if (key.upArrow) {
        if (filteredPickerItems.length > 0) {
          setSelectedPicker((current) => (current - 1 + filteredPickerItems.length) % filteredPickerItems.length);
        }
      } else if (key.downArrow) {
        if (filteredPickerItems.length > 0) {
          setSelectedPicker((current) => (current + 1) % filteredPickerItems.length);
        }
      } else if (key.pageUp) {
        setSelectedPicker((current) => Math.max(0, current - 8));
      } else if (key.pageDown) {
        setSelectedPicker((current) => Math.min(Math.max(0, filteredPickerItems.length - 1), current + 8));
      } else if (key.return) {
        const selected = filteredPickerItems[selectedPicker];
        if (selected !== undefined) controller.resolvePicker(selected.id);
      } else if (key.backspace) {
        setPickerQuery((current) => [...current].slice(0, -1).join(""));
        setSelectedPicker(0);
      } else if (key.ctrl && input === "u") {
        setPickerQuery("");
        setSelectedPicker(0);
      } else if (!key.ctrl && !key.meta && input.length > 0) {
        setPickerQuery((current) => `${current}${input}`);
        setSelectedPicker(0);
      }
      return;
    }

    if (key.pageUp) {
      setScrollOffset((current) => Math.min(maxScroll, current + pageScrollRows));
      return;
    }
    if (key.pageDown) {
      setScrollOffset((current) => Math.max(0, current - pageScrollRows));
      return;
    }
    if (!snapshot.composerEnabled) {
      if (key.ctrl && input === "c") controller.interrupt();
      return;
    }
    if (key.ctrl && input === "c") {
      if (currentEditor.value.length === 0) controller.setNotice("Input is already clear · Ctrl-D exits");
      else updateEditor({ value: "", cursor: 0 });
      setPaletteSuppressed(false);
      return;
    }
    if (key.ctrl && input === "d") {
      if (currentEditor.value.length === 0) controller.submit(null);
      else {
        updateEditor({
          value: removeAt(currentEditor.value, currentEditor.cursor),
          cursor: currentEditor.cursor,
        });
        setPaletteSuppressed(false);
      }
      return;
    }
    if (key.ctrl && input === "a") {
      updateEditor({ value: currentEditor.value, cursor: 0 });
      return;
    }
    if (key.ctrl && input === "e") {
      updateEditor({ value: currentEditor.value, cursor: logicalLength(currentEditor.value) });
      return;
    }
    if (key.ctrl && input === "u") {
      updateEditor({
        value: [...currentEditor.value].slice(currentEditor.cursor).join(""),
        cursor: 0,
      });
      setPaletteSuppressed(false);
      return;
    }
    if (key.ctrl && input === "k") {
      updateEditor({
        value: [...currentEditor.value].slice(0, currentEditor.cursor).join(""),
        cursor: currentEditor.cursor,
      });
      setPaletteSuppressed(false);
      return;
    }
    if (key.ctrl && input === "l") {
      controller.clearMessages();
      controller.setNotice("Returned to the workspace home");
      return;
    }
    if (key.escape) {
      setPaletteSuppressed(true);
      return;
    }
    if (key.tab) {
      completeSelected();
      return;
    }
    if (key.return) {
      if (key.shift) {
        updateEditor((current) => ({
          value: insertAt(current.value, current.cursor, "\n"),
          cursor: current.cursor + 1,
        }));
        return;
      }
      if (candidates.length > 0 && !commandIsExact(currentEditor.value)) {
        const command = completeSelected();
        if (command?.argumentHint === null) submit(`/${command.name}`);
        return;
      }
      submit(currentEditor.value);
      return;
    }
    if (key.backspace) {
      const removed = removeBefore(currentEditor.value, currentEditor.cursor);
      updateEditor(removed);
      setPaletteSuppressed(false);
      setSelectedCommand(0);
      return;
    }
    if (key.delete) {
      updateEditor({
        value: removeAt(currentEditor.value, currentEditor.cursor),
        cursor: currentEditor.cursor,
      });
      setPaletteSuppressed(false);
      return;
    }
    if (key.leftArrow) {
      updateEditor({ value: currentEditor.value, cursor: Math.max(0, currentEditor.cursor - 1) });
      return;
    }
    if (key.rightArrow) {
      updateEditor({
        value: currentEditor.value,
        cursor: Math.min(logicalLength(currentEditor.value), currentEditor.cursor + 1),
      });
      return;
    }
    if (key.home) {
      updateEditor({ value: currentEditor.value, cursor: 0 });
      return;
    }
    if (key.end) {
      updateEditor({ value: currentEditor.value, cursor: logicalLength(currentEditor.value) });
      return;
    }
    if (key.upArrow || key.downArrow) {
      if (candidates.length > 0) {
        setSelectedCommand((current) =>
          key.upArrow
            ? (current - 1 + candidates.length) % candidates.length
            : (current + 1) % candidates.length,
        );
      } else if (!currentEditor.value.includes("\n") && history.length > 0) {
        if (key.upArrow && historyIndex > 0) {
          if (historyIndex === history.length) setHistoryDraft(currentEditor.value);
          const next = historyIndex - 1;
          const recalled = history[next] ?? currentEditor.value;
          setHistoryIndex(next);
          updateEditor({ value: recalled, cursor: logicalLength(recalled) });
        } else if (key.downArrow && historyIndex < history.length) {
          const next = historyIndex + 1;
          const recalled = next === history.length ? historyDraft : (history[next] ?? currentEditor.value);
          setHistoryIndex(next);
          updateEditor({ value: recalled, cursor: logicalLength(recalled) });
        }
      }
      return;
    }
    if (key.ctrl || key.meta || input.length === 0) return;
    updateEditor((current) => ({
      value: insertAt(current.value, current.cursor, input),
      cursor: current.cursor + logicalLength(input),
    }));
    setPaletteSuppressed(false);
    setSelectedCommand(0);
    setHistoryIndex(history.length);
  });

  return (
    <Box width={columns} height={rows} flexDirection="column" overflow="hidden">
      <Header status={snapshot.status} compact={compact} />
      {snapshot.picker !== null ? (
        <Picker
          picker={snapshot.picker}
          items={filteredPickerItems}
          query={pickerQuery}
          selected={selectedPicker}
          maximumRows={compact ? 6 : 8}
        />
      ) : snapshot.messages.length === 0 ? (
        <Home
          status={snapshot.status}
          compact={compact}
          commandPaletteOpen={candidates.length > 0}
        />
      ) : (
        <Transcript lines={transcriptLines} scrollOffset={scrollOffset} rows={transcriptRows} />
      )}
      <Activity activity={snapshot.activity} />
      {snapshot.picker === null && (
        <>
          <CommandPalette candidates={candidates} selected={selectedCommand} maximumRows={compact ? 4 : 8} />
          <Composer value={value} cursor={cursor} enabled={snapshot.composerEnabled} />
        </>
      )}
      <Box paddingX={2} justifyContent="space-between">
        <Text dimColor>{snapshot.notice ?? "Shift+Enter newline · PageUp transcript · / commands"}</Text>
        <Text dimColor>{snapshot.activity === null ? "ready" : snapshot.activity.kind}</Text>
      </Box>
    </Box>
  );
}

export function startFullscreenTui(status: FullscreenTuiStatus): FullscreenTuiController {
  const controller = new FullscreenTuiController(status);
  const instance = render(<FullscreenTuiApp controller={controller} />, {
    alternateScreen: true,
    exitOnCtrlC: false,
    incrementalRendering: true,
    maxFps: 30,
    kittyKeyboard: { mode: "auto" },
  });
  controller.attach(instance);
  return controller;
}
