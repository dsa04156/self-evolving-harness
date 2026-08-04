use super::*;

#[test]
fn wide_home_screen_snapshot() {
    insta::assert_snapshot!(
        "seh_home_wide",
        SehHomeHistoryCell
            .display_lines(80)
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
        SehHomeHistoryCell
            .display_lines(40)
            .iter()
            .map(Line::to_string)
            .collect::<Vec<_>>()
            .join("\n")
    );
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
