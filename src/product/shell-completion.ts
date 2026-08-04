import { HarnessError } from "../core/errors.js";

export type SupportedShell = "bash" | "zsh" | "fish";

export const PRODUCT_TOP_LEVEL_COMMANDS = [
  "init",
  "run",
  "exec",
  "chat",
  "continue",
  "sessions",
  "status",
  "resume",
  "fork",
  "thread",
  "doctor",
  "config",
  "harness",
  "evolution",
  "memory",
  "completion",
] as const;

const COMMON_OPTIONS = [
  "--workspace",
  "--provider",
  "--model",
  "--effort",
  "--fast",
  "--endpoint",
  "--read-only",
  "--write",
  "--verify",
  "--skill",
] as const;

const SKILL_IDS = "debug review tests refactor docs secure-review performance parallel-research";

function bashCompletion(): string {
  const commands = PRODUCT_TOP_LEVEL_COMMANDS.join(" ");
  const options = [...COMMON_OPTIONS, "--help", "--version"].join(" ");
  return `# SEH shell completion for bash
_seh_completion() {
  local current previous command
  current="\${COMP_WORDS[COMP_CWORD]}"
  previous="\${COMP_WORDS[COMP_CWORD-1]}"
  command="\${COMP_WORDS[1]}"

  if [[ \${COMP_CWORD} -eq 1 ]]; then
    COMPREPLY=( $(compgen -W '${commands} ${options}' -- "\${current}") )
    return
  fi

  case "\${previous}" in
    --workspace) COMPREPLY=( $(compgen -d -- "\${current}") ); return ;;
    --provider) COMPREPLY=( $(compgen -W 'openai openrouter ollama' -- "\${current}") ); return ;;
    --effort) COMPREPLY=( $(compgen -W 'auto none minimal low medium high xhigh max' -- "\${current}") ); return ;;
    --skill) COMPREPLY=( $(compgen -W '${SKILL_IDS}' -- "\${current}") ); return ;;
    --max-descendants) COMPREPLY=( $(compgen -W '0 1 2 4 8' -- "\${current}") ); return ;;
    --read-only|--write) return ;;
  esac

  case "\${command}" in
    completion) COMPREPLY=( $(compgen -W 'bash zsh fish' -- "\${current}") ); return ;;
    memory) COMPREPLY=( $(compgen -W 'add list' -- "\${current}") ); return ;;
    config) COMPREPLY=( $(compgen -W '${options} --max-descendants' -- "\${current}") ); return ;;
  esac

  COMPREPLY=( $(compgen -W '${options}' -- "\${current}") )
}
complete -F _seh_completion seh
`;
}

function zshCompletion(): string {
  return `#compdef seh
_seh() {
  local -a commands
  commands=(
    'init:Initialize the current workspace'
    'run:Run one task non-interactively'
    'exec:Alias for run'
    'chat:Open the interactive coding agent'
    'continue:Continue the latest thread'
    'sessions:List durable sessions'
    'status:Show session evidence and usage'
    'resume:Resume a durable session'
    'fork:Fork a session with its pinned HarnessVersion'
    'thread:Show the Thread / Turn / Item projection'
    'doctor:Check the local runtime'
    'config:Show project configuration'
    'harness:Show the latest pinned HarnessVersion'
    'evolution:Show trace and version evolution readiness'
    'memory:Manage persistent project memory'
    'completion:Generate shell completion'
  )
  _arguments -C \\
    '1:command:->command' \\
    '*::argument:->arguments'
  case $state in
    command) _describe 'command' commands ;;
    arguments)
      case $words[2] in
        completion) _values 'shell' bash zsh fish ;;
        memory) _values 'action' add list ;;
        config) _arguments '--workspace[workspace path]:directory:_directories' '--max-descendants[bounded child/job count]:count:(0 1 2 4 8)' ;;
        *) _arguments '--workspace[workspace path]:directory:_directories' '--provider[provider]:provider:(openai openrouter ollama)' '--model[model name]:model' '--effort[reasoning effort]:effort:(auto none minimal low medium high xhigh max)' '--fast[OpenAI priority processing]' '--read-only[disable mutation tools]' '--write[enable workspace mutation tools]' '--verify[verification command]:command' '--skill[workflow skill]:skill:(${SKILL_IDS})' ;;
      esac
      ;;
  esac
}
_seh "$@"
`;
}

function fishCompletion(): string {
  const commandRows = [
    ["init", "Initialize the current workspace"],
    ["run", "Run one task non-interactively"],
    ["exec", "Alias for run"],
    ["chat", "Open the interactive coding agent"],
    ["continue", "Continue the latest thread"],
    ["sessions", "List durable sessions"],
    ["status", "Show session evidence and usage"],
    ["resume", "Resume a durable session"],
    ["fork", "Fork a session with its pinned HarnessVersion"],
    ["thread", "Show the Thread / Turn / Item projection"],
    ["doctor", "Check the local runtime"],
    ["config", "Show project configuration"],
    ["harness", "Show the latest pinned HarnessVersion"],
    ["evolution", "Show evolution readiness"],
    ["memory", "Manage persistent project memory"],
    ["completion", "Generate shell completion"],
  ] as const;
  return [
    "# SEH shell completion for fish",
    "complete -c seh -f",
    ...commandRows.map(
      ([command, description]) =>
        `complete -c seh -n '__fish_use_subcommand' -a '${command}' -d '${description}'`,
    ),
    "complete -c seh -l workspace -r -a '(__fish_complete_directories)' -d 'Workspace path'",
    "complete -c seh -l provider -r -a 'openai openrouter ollama' -d 'Model provider'",
    "complete -c seh -l model -r -d 'Model name'",
    "complete -c seh -l effort -r -a 'auto none minimal low medium high xhigh max' -d 'Reasoning effort'",
    "complete -c seh -l fast -d 'OpenAI priority processing'",
    "complete -c seh -l read-only -d 'Disable mutation tools'",
    "complete -c seh -l write -d 'Enable workspace mutation tools'",
    "complete -c seh -l verify -r -d 'Verification command'",
    `complete -c seh -l skill -r -a '${SKILL_IDS}' -d 'Workflow skill'`,
    "complete -c seh -n '__fish_seen_subcommand_from config' -l max-descendants -r -a '0 1 2 4 8' -d 'Bounded child and job count'",
    "complete -c seh -n '__fish_seen_subcommand_from completion' -a 'bash zsh fish' -d 'Shell'",
    "complete -c seh -n '__fish_seen_subcommand_from memory' -a 'add list' -d 'Memory action'",
    "",
  ].join("\n");
}

export function renderShellCompletion(shell: string): string {
  if (shell === "bash") return bashCompletion();
  if (shell === "zsh") return zshCompletion();
  if (shell === "fish") return fishCompletion();
  throw new HarnessError(
    "SCHEMA_INVALID",
    "completion requires one shell: bash, zsh, or fish",
  );
}
