use super::*;

#[test]
fn wide_home_screen_snapshot() {
    insta::assert_snapshot!(
        "seh_home_wide",
        SehHomeHistoryCell::fixture()
            .display_lines(120)
            .iter()
            .map(Line::to_string)
            .collect::<Vec<_>>()
            .join("\n")
    );
}

#[test]
fn narrow_home_screen_snapshot() {
    insta::assert_snapshot!(
        "seh_home_narrow",
        SehHomeHistoryCell::fixture()
            .display_lines(40)
            .iter()
            .map(Line::to_string)
            .collect::<Vec<_>>()
            .join("\n")
    );
}

#[test]
fn medium_home_screen_snapshot() {
    insta::assert_snapshot!(
        "seh_home_medium",
        SehHomeHistoryCell::fixture()
            .display_lines(80)
            .iter()
            .map(Line::to_string)
            .collect::<Vec<_>>()
            .join("\n")
    );
}

#[test]
fn home_never_overflows_terminal_width() {
    let home = SehHomeHistoryCell::fixture();
    for width in [32, 48, 63, 64, 80, 99, 100, 120, 160] {
        assert!(
            home.display_lines(width)
                .iter()
                .all(|line| line_width(line) <= usize::from(width)),
            "home overflowed at {width} columns"
        );
    }
}

#[test]
fn evidence_label_only_reports_signed_receipts_with_attestation_metadata() -> anyhow::Result<()> {
    let codex_home = tempfile::tempdir()?;
    let thread_id = "thread-1";
    let binding_hash = "sha256:binding";
    let receipts = codex_home
        .path()
        .join("seh/evidence/threads")
        .join(thread_id)
        .join(binding_hash)
        .join("receipts");
    std::fs::create_dir_all(&receipts)?;

    std::fs::write(
        receipts.join("00000000000000000000.json"),
        serde_json::to_vec(&serde_json::json!({
            "receipt": { "attestation": { "signature": "" } }
        }))?,
    )?;
    assert_eq!(
        evidence_label(codex_home.path(), thread_id, binding_hash),
        "1 receipts · inspect /evidence"
    );

    std::fs::write(
        receipts.join("00000000000000000000.json"),
        serde_json::to_vec(&serde_json::json!({
            "receipt": { "attestation": { "signature": "base64url-signature" } }
        }))?,
    )?;
    assert_eq!(
        evidence_label(codex_home.path(), thread_id, binding_hash),
        "signed · 1 receipts"
    );

    Ok(())
}

#[test]
fn harness_panel_snapshot() {
    insta::assert_snapshot!(
        "seh_harness_panel",
        new_seh_panel(
            "Pinned HarnessVersion",
            "IMMUTABLE SESSION PIN",
            vec![
                ("version".to_string(), "hv-sha256:4b9961ed3758…".to_string()),
                ("model".to_string(), "gpt-5.6-sol · max · fast".to_string()),
                ("components".to_string(), "24 · verified".to_string()),
            ],
            Some("Retry and resume reuse this exact version.".to_string()),
        )
        .display_lines(64)
        .iter()
        .map(Line::to_string)
        .collect::<Vec<_>>()
        .join("\n")
    );
}
