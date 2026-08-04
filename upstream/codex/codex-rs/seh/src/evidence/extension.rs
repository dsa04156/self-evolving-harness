use std::sync::Arc;

use codex_extension_api::ExtensionData;
use codex_extension_api::ExtensionFuture;
use codex_extension_api::ExtensionRegistryBuilder;
use codex_extension_api::SkillInvocationContributor;
use codex_extension_api::SkillInvocationInput;
use codex_extension_api::SkillInvocationKind;
use codex_extension_api::ThreadIdleInput;
use codex_extension_api::ThreadLifecycleContributor;
use codex_extension_api::ThreadResumeInput;
use codex_extension_api::ThreadStartInput;
use codex_extension_api::ThreadStopInput;
use codex_extension_api::TokenUsageContributor;
use codex_extension_api::ToolCallOutcome;
use codex_extension_api::ToolCallSource;
use codex_extension_api::ToolFinishInput;
use codex_extension_api::ToolLifecycleContributor;
use codex_extension_api::ToolLifecycleFuture;
use codex_extension_api::ToolStartInput;
use codex_extension_api::TurnAbortInput;
use codex_extension_api::TurnErrorInput;
use codex_extension_api::TurnLifecycleContributor;
use codex_extension_api::TurnStartInput;
use codex_extension_api::TurnStopInput;
use codex_protocol::protocol::CodexErrorInfo;
use codex_protocol::protocol::TokenUsageInfo;
use codex_protocol::protocol::TurnAbortReason;
use serde_json::json;

use super::model::EventOrigin;
use super::store::EvidenceHandle;

struct EvidenceExtension;

#[derive(Clone)]
struct TurnEvidenceId(String);

pub fn install<C: Sync + 'static>(builder: &mut ExtensionRegistryBuilder<C>) {
    let extension = Arc::new(EvidenceExtension);
    builder.thread_lifecycle_contributor(extension.clone());
    builder.turn_lifecycle_contributor(extension.clone());
    builder.tool_lifecycle_contributor(extension.clone());
    builder.token_usage_contributor(extension.clone());
    builder.skill_invocation_contributor(extension);
}

impl<C: Sync> ThreadLifecycleContributor<C> for EvidenceExtension {
    fn on_thread_start<'a>(&'a self, input: ThreadStartInput<'a, C>) -> ExtensionFuture<'a, ()> {
        Box::pin(async move {
            if let Some(handle) = evidence(input.thread_store) {
                handle.capture_observation(
                    "thread_extensions_started",
                    json!({
                        "persistentThreadStateAvailable": input.persistent_thread_state_available,
                    }),
                    EventOrigin::runtime("codex-extension-host"),
                );
            }
        })
    }

    fn on_thread_resume<'a>(&'a self, input: ThreadResumeInput<'a>) -> ExtensionFuture<'a, ()> {
        Box::pin(async move {
            if let Some(handle) = evidence(input.thread_store) {
                handle.capture_observation(
                    "thread_extensions_resumed",
                    json!({}),
                    EventOrigin::runtime("codex-extension-host"),
                );
            }
        })
    }

    fn on_thread_idle<'a>(&'a self, input: ThreadIdleInput<'a>) -> ExtensionFuture<'a, ()> {
        Box::pin(async move {
            if let Some(handle) = evidence(input.thread_store) {
                handle.capture_checkpoint(
                    "thread_runtime_idle",
                    json!({ "runtimeState": "waiting" }),
                );
            }
        })
    }

    fn on_thread_stop<'a>(&'a self, input: ThreadStopInput<'a>) -> ExtensionFuture<'a, ()> {
        Box::pin(async move {
            if let Some(handle) = evidence(input.thread_store) {
                handle.capture_checkpoint(
                    "thread_runtime_stopped",
                    json!({ "completionClaimed": false }),
                );
            }
        })
    }
}

impl TurnLifecycleContributor for EvidenceExtension {
    fn on_turn_start<'a>(&'a self, input: TurnStartInput<'a>) -> ExtensionFuture<'a, ()> {
        Box::pin(async move {
            input
                .turn_store
                .insert(TurnEvidenceId(input.turn_id.to_string()));
            if let Some(handle) = evidence(input.thread_store) {
                let collaboration_mode_hash = serde_json::to_string(input.collaboration_mode)
                    .map(|value| handle.hash_opaque(&value))
                    .unwrap_or_else(|_| handle.hash_opaque("unserializable-collaboration-mode"));
                handle.capture_observation(
                    "turn_started",
                    json!({
                        "collaborationModeHash": collaboration_mode_hash,
                        "runtimeState": "running",
                        "turnIdHash": handle.hash_opaque(input.turn_id),
                    }),
                    EventOrigin::runtime("codex-turn-runtime"),
                );
            }
        })
    }

    fn on_turn_stop<'a>(&'a self, input: TurnStopInput<'a>) -> ExtensionFuture<'a, ()> {
        Box::pin(async move {
            if let Some(handle) = evidence(input.thread_store) {
                handle.capture_observation(
                    "turn_stopped",
                    json!({
                        "runtimeState": "validating",
                        "turnIdHash": turn_id_hash(&handle, input.turn_store),
                    }),
                    EventOrigin::runtime("codex-turn-runtime"),
                );
            }
        })
    }

    fn on_turn_abort<'a>(&'a self, input: TurnAbortInput<'a>) -> ExtensionFuture<'a, ()> {
        Box::pin(async move {
            if let Some(handle) = evidence(input.thread_store) {
                handle.capture_observation(
                    "turn_aborted",
                    json!({
                        "abortReason": abort_reason(&input.reason),
                        "runtimeState": "blocked",
                        "turnIdHash": turn_id_hash(&handle, input.turn_store),
                    }),
                    EventOrigin::runtime("codex-turn-runtime"),
                );
            }
        })
    }

    fn on_turn_error<'a>(&'a self, input: TurnErrorInput<'a>) -> ExtensionFuture<'a, ()> {
        Box::pin(async move {
            if let Some(handle) = evidence(input.thread_store) {
                handle.capture_observation(
                    "turn_error_observed",
                    json!({
                        "errorClass": error_class(&input.error),
                        "runtimeState": "blocked",
                        "turnIdHash": handle.hash_opaque(input.turn_id),
                    }),
                    EventOrigin::runtime("codex-turn-runtime"),
                );
            }
        })
    }
}

impl ToolLifecycleContributor for EvidenceExtension {
    fn on_tool_start<'a>(&'a self, input: ToolStartInput<'a>) -> ToolLifecycleFuture<'a> {
        Box::pin(async move {
            if let Some(handle) = evidence(input.thread_store) {
                handle.capture_observation(
                    "tool_call_started",
                    json!({
                        "callIdHash": handle.hash_opaque(input.call_id),
                        "sourceClass": source_class(&input.source),
                        "toolIdentityHash": handle.hash_opaque(&input.tool_name.to_string()),
                        "toolIsNamespaced": input.tool_name.namespace.is_some(),
                        "turnIdHash": handle.hash_opaque(input.turn_id),
                    }),
                    EventOrigin::tool("codex-tool-router"),
                );
            }
        })
    }

    fn on_tool_finish<'a>(&'a self, input: ToolFinishInput<'a>) -> ToolLifecycleFuture<'a> {
        Box::pin(async move {
            if let Some(handle) = evidence(input.thread_store) {
                let (outcome, success, handler_executed) = outcome_fields(input.outcome);
                handle.capture_observation(
                    "tool_call_finished",
                    json!({
                        "callIdHash": handle.hash_opaque(input.call_id),
                        "handlerExecuted": handler_executed,
                        "outcome": outcome,
                        "sourceClass": source_class(&input.source),
                        "success": success,
                        "toolIdentityHash": handle.hash_opaque(&input.tool_name.to_string()),
                        "turnIdHash": handle.hash_opaque(input.turn_id),
                    }),
                    EventOrigin::tool("codex-tool-router"),
                );
            }
        })
    }
}

impl TokenUsageContributor for EvidenceExtension {
    fn on_token_usage<'a>(
        &'a self,
        _session_store: &'a ExtensionData,
        thread_store: &'a ExtensionData,
        _turn_store: &'a ExtensionData,
        usage: &'a TokenUsageInfo,
    ) -> ExtensionFuture<'a, ()> {
        Box::pin(async move {
            if let Some(handle) = evidence(thread_store) {
                let last = &usage.last_token_usage;
                let total = &usage.total_token_usage;
                handle.capture_observation(
                    "model_token_usage_recorded",
                    json!({
                        "last": {
                            "cachedInputTokens": last.cached_input_tokens,
                            "inputTokens": last.input_tokens,
                            "outputTokens": last.output_tokens,
                            "reasoningOutputTokens": last.reasoning_output_tokens,
                            "totalTokens": last.total_tokens,
                        },
                        "modelContextWindow": usage.model_context_window,
                        "total": {
                            "cachedInputTokens": total.cached_input_tokens,
                            "inputTokens": total.input_tokens,
                            "outputTokens": total.output_tokens,
                            "reasoningOutputTokens": total.reasoning_output_tokens,
                            "totalTokens": total.total_tokens,
                        },
                    }),
                    EventOrigin::provider("model-provider"),
                );
            }
        })
    }
}

impl SkillInvocationContributor for EvidenceExtension {
    fn on_skill_invocation<'a>(
        &'a self,
        input: SkillInvocationInput<'a>,
    ) -> ExtensionFuture<'a, ()> {
        Box::pin(async move {
            if let Some(handle) = evidence(input.thread_store) {
                handle.capture_observation(
                    "skill_invoked",
                    json!({
                        "invocationKind": match input.kind {
                            SkillInvocationKind::Explicit => "explicit",
                            SkillInvocationKind::Implicit => "implicit",
                        },
                        "skillResourceHash": handle.hash_opaque(input.skill_resource),
                        "turnIdHash": handle.hash_opaque(input.turn_id),
                    }),
                    EventOrigin::runtime("codex-skill-runtime"),
                );
            }
        })
    }
}

fn evidence(thread_store: &ExtensionData) -> Option<Arc<EvidenceHandle>> {
    thread_store.get::<EvidenceHandle>()
}

fn turn_id_hash(handle: &EvidenceHandle, turn_store: &ExtensionData) -> String {
    turn_store
        .get::<TurnEvidenceId>()
        .map(|turn| handle.hash_opaque(&turn.0))
        .unwrap_or_else(|| handle.hash_opaque("missing-turn-id"))
}

fn source_class(source: &ToolCallSource) -> &'static str {
    match source {
        ToolCallSource::Direct => "direct",
        ToolCallSource::CodeMode { .. } => "code_mode",
    }
}

fn outcome_fields(outcome: ToolCallOutcome) -> (&'static str, Option<bool>, Option<bool>) {
    match outcome {
        ToolCallOutcome::Completed { success } => ("completed", Some(success), Some(true)),
        ToolCallOutcome::Blocked => ("blocked", None, Some(false)),
        ToolCallOutcome::Failed { handler_executed } => {
            ("failed", Some(false), Some(handler_executed))
        }
        ToolCallOutcome::Aborted => ("aborted", None, None),
    }
}

fn abort_reason(reason: &TurnAbortReason) -> &'static str {
    match reason {
        TurnAbortReason::Interrupted => "interrupted",
        TurnAbortReason::Replaced => "replaced",
        TurnAbortReason::ReviewEnded => "review_ended",
        TurnAbortReason::BudgetLimited => "budget_limited",
    }
}

fn error_class(error: &CodexErrorInfo) -> &'static str {
    match error {
        CodexErrorInfo::ContextWindowExceeded => "context_window_exceeded",
        CodexErrorInfo::SessionBudgetExceeded => "session_budget_exceeded",
        CodexErrorInfo::UsageLimitExceeded => "usage_limit_exceeded",
        CodexErrorInfo::ServerOverloaded => "server_overloaded",
        CodexErrorInfo::CyberPolicy => "cyber_policy",
        CodexErrorInfo::HttpConnectionFailed { .. } => "http_connection_failed",
        CodexErrorInfo::ResponseStreamConnectionFailed { .. } => {
            "response_stream_connection_failed"
        }
        CodexErrorInfo::InternalServerError => "internal_server_error",
        CodexErrorInfo::Unauthorized => "unauthorized",
        CodexErrorInfo::BadRequest => "bad_request",
        CodexErrorInfo::SandboxError => "sandbox_error",
        CodexErrorInfo::ResponseStreamDisconnected { .. } => "response_stream_disconnected",
        CodexErrorInfo::ResponseTooManyFailedAttempts { .. } => "response_too_many_failed_attempts",
        CodexErrorInfo::ActiveTurnNotSteerable { .. } => "active_turn_not_steerable",
        CodexErrorInfo::ThreadRollbackFailed => "thread_rollback_failed",
        CodexErrorInfo::Other => "other",
    }
}
