use std::fs;
use std::path::Path;
use std::sync::Arc;

use anyhow::Context;
use anyhow::Result;
use codex_core::config::Config;
use codex_extension_api::ExtensionRegistryBuilder;
use core_test_support::responses::ev_assistant_message;
use core_test_support::responses::ev_completed;
use core_test_support::responses::ev_function_call;
use core_test_support::responses::ev_response_created;
use core_test_support::responses::mount_sse_once;
use core_test_support::responses::sse;
use core_test_support::responses::start_mock_server;
use core_test_support::skip_if_no_network;
use core_test_support::test_codex::test_codex;
use pretty_assertions::assert_eq;
use serde_json::Value;
use serde_json::json;
use tokio::time::Duration;
use tokio::time::sleep;
use tokio::time::timeout;

fn read_numbered_json(directory: &Path) -> Result<Vec<Value>> {
    let mut paths = fs::read_dir(directory)?
        .map(|entry| entry.map(|entry| entry.path()))
        .collect::<std::io::Result<Vec<_>>>()?;
    paths.sort();
    paths
        .into_iter()
        .map(|path| {
            let bytes = fs::read(&path)?;
            serde_json::from_slice(&bytes).with_context(|| path.display().to_string())
        })
        .collect()
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn codex_runtime_records_allowlisted_model_and_tool_evidence() -> Result<()> {
    skip_if_no_network!(Ok(()));

    let server = start_mock_server().await;
    let mut extensions = ExtensionRegistryBuilder::<Config>::new();
    codex_seh::install_evidence_extension(&mut extensions);
    let mut builder = test_codex().with_extensions(Arc::new(extensions.build()));
    let test = builder.build(&server).await?;

    let call_id = "private-plan-call-id";
    let plan_args = json!({
        "explanation": "private plan explanation",
        "plan": [{"step": "private plan step", "status": "completed"}],
    })
    .to_string();
    mount_sse_once(
        &server,
        sse(vec![
            ev_response_created("resp-1"),
            ev_function_call(call_id, "update_plan", &plan_args),
            ev_completed("resp-1"),
        ]),
    )
    .await;
    mount_sse_once(
        &server,
        sse(vec![
            ev_assistant_message("msg-1", "private model response"),
            ev_completed("resp-2"),
        ]),
    )
    .await;

    let prompt = "private user prompt";
    test.submit_turn(prompt).await?;

    let thread_root = test
        .codex_home_path()
        .join("seh/evidence/threads")
        .join(test.session_configured.thread_id.to_string());
    let bindings = fs::read_dir(&thread_root)?
        .map(|entry| entry.map(|entry| entry.path()))
        .collect::<std::io::Result<Vec<_>>>()?;
    assert_eq!(bindings.len(), 1);

    let events_dir = bindings[0].join("events");
    let events = timeout(Duration::from_secs(10), async {
        loop {
            let events = read_numbered_json(&events_dir)?;
            if events
                .iter()
                .any(|event| event["eventType"] == "thread_runtime_idle")
            {
                return Ok::<_, anyhow::Error>(events);
            }
            sleep(Duration::from_millis(10)).await;
        }
    })
    .await
    .context("thread idle evidence was not recorded")??;
    let event_types = events
        .iter()
        .filter_map(|event| event["eventType"].as_str())
        .collect::<Vec<_>>();
    for required in [
        "thread_runtime_started",
        "thread_extensions_started",
        "turn_started",
        "tool_call_started",
        "tool_call_finished",
        "turn_stopped",
        "thread_runtime_idle",
    ] {
        assert!(
            event_types.contains(&required),
            "missing {required} in {event_types:?}"
        );
    }
    for (sequence, event) in events.iter().enumerate() {
        assert_eq!(event["schemaVersion"], 2);
        assert_eq!(event["sequence"], sequence);
        assert_eq!(event["epistemicClass"], "recorded_observation");
        assert_eq!(event["inference"], Value::Null);
        let expected_previous = sequence
            .checked_sub(1)
            .map_or(Value::Null, |index| events[index]["eventHash"].clone());
        assert_eq!(event["previousEventHash"], expected_previous);
    }

    let receipts = read_numbered_json(&bindings[0].join("receipts"))?;
    assert!(receipts.len() >= 2);
    assert_eq!(
        receipts[0]["receipt"]["receiptType"],
        "session_initialization"
    );
    assert!(
        receipts
            .iter()
            .any(|envelope| { envelope["receipt"]["receiptType"] == "session_checkpoint" })
    );

    let serialized = serde_json::to_string(&(events, receipts))?;
    for secret in [prompt, call_id, &plan_args, "private model response"] {
        assert!(!serialized.contains(secret), "evidence leaked {secret}");
    }

    Ok(())
}
