import { sha256, type JsonValue } from "../core/canonical.js";
import type { Clock, IdFactory } from "../core/determinism.js";
import { HarnessError, asHarnessError } from "../core/errors.js";
import type {
  ModelInputItem,
  ModelProvider,
  ModelResponse,
  ModelUsage,
  ToolCallOutput,
} from "../domain/model.js";
import type { AgentRunResult, SessionPins, ToolCallRequest } from "../domain/runtime.js";
import type { RuntimeEventStream } from "../evidence/runtime-events.js";
import type { PrincipalIdentity } from "../trust/identity.js";
import type { BudgetAccount } from "./budget.js";
import type { ContextBuilder, PromptPayload } from "./context.js";
import type { FilesystemMemory, MemoryRetrievalPolicy } from "./memory.js";
import type { DeclarativeSkill } from "./skills.js";
import { SessionStateMachine } from "./state-machines.js";
import type { ToolDescriptionBinding, ToolExecutor, ToolRegistry } from "./tools.js";
import type { TaskVerifier } from "./verifier.js";

function emptyModelUsage(): ModelUsage {
  return {
    inputTokens: 0,
    outputTokens: 0,
    reasoningTokens: 0,
    cachedInputTokens: 0,
    totalTokens: 0,
  };
}

function addUsage(target: ModelUsage, usage: ModelUsage): ModelUsage {
  return {
    inputTokens: target.inputTokens + usage.inputTokens,
    outputTokens: target.outputTokens + usage.outputTokens,
    reasoningTokens: target.reasoningTokens + usage.reasoningTokens,
    cachedInputTokens: target.cachedInputTokens + usage.cachedInputTokens,
    totalTokens: target.totalTokens + usage.totalTokens,
  };
}

function providerOutputPayload(response: ModelResponse): JsonValue {
  return {
    responseId: response.responseId,
    modelIdentity: response.modelIdentity,
    output: response.output.map((item) => {
      if (item.kind === "assistant_message") {
        return { kind: item.kind, textHash: sha256({ text: item.text }) };
      }
      if (item.kind === "tool_call") {
        return {
          kind: item.kind,
          callId: item.callId,
          toolName: item.toolName,
          argumentsHash: sha256(item.arguments),
        };
      }
      return {
        kind: item.kind,
        providerItemHash: sha256(item.providerItem),
      };
    }),
    usage: {
      inputTokens: response.usage.inputTokens,
      outputTokens: response.usage.outputTokens,
      reasoningTokens: response.usage.reasoningTokens,
      cachedInputTokens: response.usage.cachedInputTokens,
      totalTokens: response.usage.totalTokens,
    },
    providerMetadata: response.providerMetadata,
  };
}

function toolRequest(call: ToolCallOutput): ToolCallRequest {
  return {
    callId: call.callId,
    toolName: call.toolName,
    arguments: call.arguments,
  };
}

export interface AgentLoopConfiguration {
  readonly sessionId: string;
  readonly pins: SessionPins;
  readonly modelIdentity: string;
  readonly maxOutputTokensPerCall: number;
  readonly reasoningEffort?: "none" | "low" | "medium" | "high" | "xhigh" | "max";
  readonly workspaceRoot: string;
  readonly prompt: PromptPayload;
  readonly skills: readonly DeclarativeSkill[];
  readonly toolDescriptions: readonly ToolDescriptionBinding[];
  readonly memory?: {
    readonly store: FilesystemMemory;
    readonly policy: MemoryRetrievalPolicy;
  };
}

export class AgentExecutionLoop {
  readonly #configuration: AgentLoopConfiguration;
  readonly #provider: ModelProvider;
  readonly #tools: ToolRegistry;
  readonly #toolExecutor: ToolExecutor;
  readonly #context: ContextBuilder;
  readonly #verifier: TaskVerifier;
  readonly #events: RuntimeEventStream;
  readonly #budget: BudgetAccount;
  readonly #clock: Clock;
  readonly #ids: IdFactory;
  readonly #runtimeIdentity: PrincipalIdentity;
  readonly #state: SessionStateMachine;

  public constructor(input: {
    configuration: AgentLoopConfiguration;
    provider: ModelProvider;
    tools: ToolRegistry;
    toolExecutor: ToolExecutor;
    context: ContextBuilder;
    verifier: TaskVerifier;
    events: RuntimeEventStream;
    budget: BudgetAccount;
    clock: Clock;
    ids: IdFactory;
    runtimeIdentity: PrincipalIdentity;
    initialState?: "created" | "initialized" | "running";
  }) {
    this.#configuration = input.configuration;
    this.#provider = input.provider;
    this.#tools = input.tools;
    this.#toolExecutor = input.toolExecutor;
    this.#context = input.context;
    this.#verifier = input.verifier;
    this.#events = input.events;
    this.#budget = input.budget;
    this.#clock = input.clock;
    this.#ids = input.ids;
    this.#runtimeIdentity = input.runtimeIdentity;
    this.#state = new SessionStateMachine(input.initialState);
  }

  public get state(): SessionStateMachine {
    return this.#state;
  }

  public async run(task: string, abortSignal?: AbortSignal): Promise<AgentRunResult> {
    let aggregateUsage = emptyModelUsage();
    let verification: AgentRunResult["verification"] = null;
    let finalText: string | null = null;
    let terminationReason: AgentRunResult["terminationReason"];
    const transcript: ModelInputItem[] = [];
    let verificationFeedback: string | null = null;

    try {
      if (this.#state.state === "created") {
        this.#state.transition("initialized");
        await this.#emitState("created", "initialized");
      }
      if (this.#state.state === "initialized") {
        this.#state.transition("running");
        await this.#emitState("initialized", "running");
      }
      await this.#events.emit({
        eventType: "task_submitted",
        payload: { taskHash: sha256({ task }) },
        origin: {
          originClass: "user",
          originId: "user.task",
          trustLevel: "untrusted_input",
        },
      });

      while (true) {
        this.#budget.assertTime();
        const memory =
          this.#configuration.memory === undefined
            ? []
            : (
                await this.#configuration.memory.store.retrieve(
                  `${task}\n${verificationFeedback ?? ""}`,
                  this.#configuration.memory.policy,
                )
              ).selected;
        const modelTools = this.#tools.modelCatalog(this.#configuration.toolDescriptions);
        const constructed = this.#context.construct({
          task,
          prompt: this.#configuration.prompt,
          transcript,
          memory,
          skills: this.#configuration.skills,
          verificationFeedback,
          tools: modelTools,
        });
        await this.#events.emit({
          eventType: "context_constructed",
          payload: constructed.manifest as unknown as { readonly [key: string]: JsonValue },
          origin: {
            originClass: "runtime",
            originId: this.#runtimeIdentity.principalId,
            trustLevel: "authenticated_principal",
          },
        });

        const requestId = this.#ids.next("model-request");
        const request = {
          requestId,
          modelIdentity: this.#configuration.modelIdentity,
          instructions: constructed.instructions,
          input: constructed.input,
          tools: constructed.tools,
          maxOutputTokens: this.#configuration.maxOutputTokensPerCall,
          ...(this.#configuration.reasoningEffort === undefined
            ? {}
            : { reasoningEffort: this.#configuration.reasoningEffort }),
          ...(abortSignal === undefined ? {} : { abortSignal }),
        } as const;
        this.#budget.reserveModelCall();
        await this.#events.emit({
          eventType: "model_request_started",
          payload: {
            requestId,
            providerId: this.#provider.providerId,
            modelIdentity: request.modelIdentity,
            requestHash: sha256({
              requestId,
              modelIdentity: request.modelIdentity,
              instructionsHash: sha256({ instructions: request.instructions }),
              input: request.input,
              tools: request.tools,
              maxOutputTokens: request.maxOutputTokens,
            }),
          },
          origin: {
            originClass: "runtime",
            originId: this.#runtimeIdentity.principalId,
            trustLevel: "authenticated_principal",
          },
        });
        const response = await this.#provider.generate(request);
        this.#budget.chargeModelUsage(response.usage);
        aggregateUsage = addUsage(aggregateUsage, response.usage);
        await this.#events.emit({
          eventType: "model_response_received",
          payload: providerOutputPayload(response) as { readonly [key: string]: JsonValue },
          origin: {
            originClass: "provider",
            originId: this.#provider.providerId,
            trustLevel: "authenticated_principal",
          },
        });

        const calls = response.output.filter(
          (item): item is ToolCallOutput => item.kind === "tool_call",
        );
        const messages = response.output.filter((item) => item.kind === "assistant_message");
        for (const item of response.output) {
          if ("providerItem" in item && item.providerItem !== undefined) {
            transcript.push({ kind: "provider_item", value: item.providerItem });
          } else if (item.kind === "assistant_message") {
            transcript.push({ kind: "text", role: "assistant", content: item.text });
          }
        }
        if (calls.length > 0) {
          for (const call of calls) {
            await this.#events.emit({
              eventType: "tool_call_requested",
              payload: {
                callId: call.callId,
                toolName: call.toolName,
                argumentsHash: sha256(call.arguments),
              },
              origin: {
                originClass: "model",
                originId: response.responseId,
                trustLevel: "untrusted_input",
              },
            });
            const result = await this.#toolExecutor.execute(toolRequest(call));
            transcript.push({
              kind: "tool_output",
              callId: result.callId,
              output: result.output,
              isError: !result.ok,
            });
            await this.#events.emit({
              eventType: "tool_call_completed",
              payload: {
                callId: result.callId,
                toolName: result.toolName,
                ok: result.ok,
                outputHash: sha256(result.output),
                durationMillis: result.durationMillis,
                errorCode: result.errorCode ?? null,
              },
              origin: {
                originClass: "tool",
                originId: result.toolName,
                trustLevel: "sandbox_observation",
              },
            });
          }
          continue;
        }

        finalText = messages.map((message) => message.text).join("\n").trim();
        if (finalText.length === 0) {
          this.#state.transition("blocked");
          await this.#emitState("running", "blocked");
          break;
        }
        this.#state.transition("validating");
        await this.#emitState("running", "validating");
        verification = await this.#verifier.verify({
          sessionId: this.#configuration.sessionId,
          task,
          proposedAnswer: finalText,
          workspaceRoot: this.#configuration.workspaceRoot,
        });
        await this.#events.emit({
          eventType: "verification_completed",
          payload: {
            verifierId: this.#verifier.verifierId,
            verifierHash: this.#verifier.verifierHash,
            passed: verification.passed,
            summary: verification.summary,
            evidence: verification.evidence,
            retryable: verification.retryable,
          },
          origin: {
            originClass: "evaluator",
            originId: this.#verifier.verifierId,
            trustLevel: "trusted_evaluator",
          },
          epistemicClass: "verifier_outcome",
        });
        if (verification.passed) {
          this.#state.transition("completed");
          await this.#emitState("validating", "completed");
          break;
        }
        if (!verification.retryable) {
          this.#state.transition("blocked");
          await this.#emitState("validating", "blocked");
          break;
        }
        this.#budget.reserveRetry();
        verificationFeedback = verification.summary;
        this.#state.transition("running");
        await this.#emitState("validating", "running");
      }
    } catch (error) {
      const failure = asHarnessError(error);
      await this.#events.emit({
        eventType: "runtime_failure_observed",
        payload: {
          code: failure.code,
          detail: failure.safeDetail,
          retryable: failure.retryable,
        },
        origin: {
          originClass: "runtime",
          originId: this.#runtimeIdentity.principalId,
          trustLevel: "authenticated_principal",
        },
      });
      if (failure.code === "BUDGET_EXHAUSTED" || failure.code === "DEADLINE_EXCEEDED") {
        const reason = failure.code === "BUDGET_EXHAUSTED" ? "budget_exhaustion" : "deadline_expiry";
        terminationReason = reason;
        const descriptor = this.#state.beginTermination({
          terminationTransactionId: this.#ids.next("termination"),
          initiatingRecordId: this.#ids.next("lifecycle"),
          initiatingPrincipal: this.#runtimeIdentity.principalId,
          reason,
        });
        await this.#emitState(descriptor.preTerminationState, "terminating");
        this.#state.completeTermination(descriptor);
        await this.#emitState("terminating", "terminated");
      } else if (
        this.#state.state !== "retired" &&
        this.#state.state !== "terminated" &&
        this.#state.state !== "terminating" &&
        this.#state.state !== "blocked"
      ) {
        this.#state.transition("blocked");
        await this.#events.emit({
          eventType: "session_blocked",
          payload: { failureCode: failure.code },
          origin: {
            originClass: "runtime",
            originId: this.#runtimeIdentity.principalId,
            trustLevel: "authenticated_principal",
          },
        });
      }
      if (!(failure instanceof HarnessError)) throw failure;
    }

    const events = await this.#events.events();
    const resultState =
      this.#state.state === "completed"
        ? "completed"
        : this.#state.state === "terminated"
          ? "terminated"
          : "blocked";
    return {
      sessionId: this.#configuration.sessionId,
      state: resultState,
      finalText,
      verification,
      usage: this.#budget.snapshot(),
      modelUsage: aggregateUsage,
      eventHeadHash: await this.#events.headHash(),
      eventCount: events.length,
      ...(terminationReason === undefined ? {} : { terminationReason }),
    };
  }

  async #emitState(from: string, to: string): Promise<void> {
    await this.#events.emit({
      eventType: "session_state_changed",
      payload: { from, to },
      origin: {
        originClass: "runtime",
        originId: this.#runtimeIdentity.principalId,
        trustLevel: "authenticated_principal",
      },
    });
  }
}
