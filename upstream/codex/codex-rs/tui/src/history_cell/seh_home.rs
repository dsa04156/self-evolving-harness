use super::*;
use crate::line_truncation::line_width;
use crate::line_truncation::truncate_line_with_ellipsis_if_overflow;
use crate::width::display_width;
use serde::Deserialize;
use std::fs;
use std::path::Path;

#[derive(Debug)]
pub(crate) struct SehHomeHistoryCell {
    product_version: &'static str,
    model: String,
    provider: String,
    reasoning: String,
    project: String,
    directory: String,
    harness_version: String,
    evidence: String,
    session: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct HomePinSummary {
    harness_version_id: String,
    runtime_binding_hash: String,
}

#[derive(Debug)]
pub(crate) struct SehPanelHistoryCell {
    title: String,
    badge: String,
    rows: Vec<(String, String)>,
    footer: Option<String>,
}

pub(crate) fn new_seh_panel(
    title: impl Into<String>,
    badge: impl Into<String>,
    rows: Vec<(String, String)>,
    footer: Option<String>,
) -> SehPanelHistoryCell {
    SehPanelHistoryCell {
        title: title.into(),
        badge: badge.into(),
        rows,
        footer,
    }
}

pub(crate) fn new_seh_home(config: &Config, session: &ThreadSessionState) -> SehHomeHistoryCell {
    let thread_id = session.thread_id.to_string();
    let pin = load_home_pin(&config.codex_home, &thread_id);
    let harness_version = pin
        .as_ref()
        .map(|pin| short_identity(&pin.harness_version_id))
        .unwrap_or_else(|| "pin initializing".to_string());
    let evidence = pin.as_ref().map_or_else(
        || "initializing".to_string(),
        |pin| evidence_label(&config.codex_home, &thread_id, &pin.runtime_binding_hash),
    );
    let directory = SessionHeaderHistoryCell::format_directory_inner(
        config.cwd.as_path(),
        /*max_width*/ Some(48),
    );
    let project = config
        .cwd
        .file_name()
        .map(|name| name.to_string_lossy().into_owned())
        .filter(|name| !name.is_empty())
        .unwrap_or_else(|| directory.clone());
    let reasoning = session
        .reasoning_effort
        .as_ref()
        .map(ToString::to_string)
        .unwrap_or_else(|| "default".to_string());

    SehHomeHistoryCell {
        product_version: crate::version::SEH_PRODUCT_VERSION,
        model: session.model.clone(),
        provider: session.model_provider_id.clone(),
        reasoning,
        project,
        directory,
        harness_version,
        evidence,
        session: short_identity(&thread_id),
    }
}

impl SehHomeHistoryCell {
    #[cfg(test)]
    fn fixture() -> Self {
        Self {
            product_version: "1.2.3",
            model: "gpt-5.6-sol".to_string(),
            provider: "openai".to_string(),
            reasoning: "high".to_string(),
            project: "self-evolving-harness".to_string(),
            directory: "~/code/self-evolving-harness".to_string(),
            harness_version: "hv-sha256:4b9961ed3758…".to_string(),
            evidence: "signed stream ready".to_string(),
            session: "019fb208697a77c3…".to_string(),
        }
    }

    fn wide_lines(&self, width: u16) -> Vec<Line<'static>> {
        let content_width = usize::from(width.saturating_sub(4));
        let separator_width = 3;
        let columns_width = content_width.saturating_sub(separator_width);
        let left_width = (columns_width * 53 / 100).max(42);
        let right_width = columns_width.saturating_sub(left_width);

        let left = vec![
            Line::from(""),
            Line::from("          ╭╮        ╭╮").cyan(),
            Line::from("       ·  ╰╮╲      ╱╭╯").light_cyan(),
            Line::from("      ·     ╲╲    ╱╱").magenta(),
            Line::from("             ╲╲  ╱╱").light_magenta(),
            Line::from("             ╱╱  ╲╲").light_magenta(),
            Line::from("      ·     ╱╱    ╲╲").magenta(),
            Line::from("       ·  ╭╯╱      ╲╰╮").light_cyan(),
            Line::from("          ╰╯        ╰╯").cyan(),
            Line::from(""),
            Line::from("S E H   C O D E").cyan().bold(),
            Line::from("Execute · Observe · Evolve").dim(),
        ];

        let right = vec![
            Line::from(vec![
                " PROJECT PULSE".cyan().bold(),
                "  ─ runtime ready".dim(),
            ]),
            Line::from(" ─────────────────────────────────────────").dim(),
            pulse_row("repository", &self.project, Style::default()),
            pulse_row("directory", &self.directory, Style::default().dim()),
            pulse_row("model", &self.model, Style::default().cyan()),
            pulse_row("provider", &self.provider, Style::default()),
            pulse_row("reasoning", &self.reasoning, Style::default().magenta()),
            pulse_row(
                "harness",
                &format!("{} · PINNED", self.harness_version),
                Style::default().magenta(),
            ),
            pulse_row("evidence", &self.evidence, Style::default().green()),
            pulse_row("session", &self.session, Style::default()),
            Line::from(""),
            Line::from(" Evidence-backed · reproducible · bounded evolution").dim(),
        ];

        let mut body = Vec::with_capacity(left.len() + 4);
        body.push(fit_line(
            Line::from(vec![
                " SEH CODE".cyan().bold(),
                "  ·  GENOME OBSERVATORY".magenta(),
                format!("  ·  v{}", self.product_version).dim(),
            ]),
            content_width,
        ));
        body.push(Line::from(""));
        for (left, right) in left.into_iter().zip(right) {
            body.push(join_columns(left, right, left_width, right_width));
        }
        body.push(Line::from(""));
        body.push(fit_line(
            Line::from(vec![
                " /".cyan().bold(),
                " commands   ".dim(),
                "/model".cyan(),
                " model & reasoning   ".dim(),
                "/harness".cyan(),
                " pinned version   ".dim(),
                "/evidence".cyan(),
                " signed trail   ".dim(),
                "/evolution".magenta(),
                " lifecycle".dim(),
            ]),
            content_width,
        ));
        with_border_with_inner_width(body, content_width)
    }

    fn medium_lines(&self, width: u16) -> Vec<Line<'static>> {
        let content_width = usize::from(width.saturating_sub(4));
        let lines = vec![
            Line::from(vec![
                " ◈ ".magenta(),
                "SEH CODE".cyan().bold(),
                " · GENOME OBSERVATORY".magenta(),
            ]),
            Line::from(" Execute · Observe · Evolve").dim(),
            Line::from(""),
            pulse_row("repository", &self.project, Style::default()),
            pulse_row("model", &self.model, Style::default().cyan()),
            pulse_row("reasoning", &self.reasoning, Style::default().magenta()),
            pulse_row(
                "harness",
                &format!("{} · PINNED", self.harness_version),
                Style::default().magenta(),
            ),
            pulse_row("evidence", &self.evidence, Style::default().green()),
            Line::from(""),
            Line::from(vec![
                " /".cyan().bold(),
                " commands · ".dim(),
                "/model".cyan(),
                " · ".dim(),
                "/harness".cyan(),
                " · ".dim(),
                "/evolution".magenta(),
            ]),
        ]
        .into_iter()
        .map(|line| fit_line(line, content_width))
        .collect();
        with_border_with_inner_width(lines, content_width)
    }
}

impl HistoryCell for SehHomeHistoryCell {
    fn display_lines(&self, width: u16) -> Vec<Line<'static>> {
        if width < 64 {
            return vec![
                Line::from(vec!["  ◈ ".magenta(), "SEH CODE".cyan().bold()]),
                "  Execute · Observe · Evolve".dim().into(),
                Line::from(vec![
                    "  model ".dim(),
                    self.model.clone().cyan(),
                    " · ".dim(),
                    self.reasoning.clone().magenta(),
                ]),
                Line::from(vec![
                    "  harness ".dim(),
                    self.harness_version.clone().magenta(),
                ]),
                Line::from(vec![
                    "  ".into(),
                    "/".cyan(),
                    " commands · ".dim(),
                    "/model".cyan(),
                    " · ".dim(),
                    "/harness".cyan(),
                ]),
            ]
            .into_iter()
            .map(|line| truncate_line_with_ellipsis_if_overflow(line, usize::from(width)))
            .collect();
        }
        if width < 100 {
            return self.medium_lines(width);
        }
        self.wide_lines(width)
    }

    fn raw_lines(&self) -> Vec<Line<'static>> {
        vec![
            "SEH CODE — Execute · Observe · Evolve".into(),
            format!("model: {} ({})", self.model, self.reasoning).into(),
            format!("project: {} ({})", self.project, self.directory).into(),
            format!("harness: {} (pinned)", self.harness_version).into(),
            format!("evidence: {}", self.evidence).into(),
        ]
    }
}

fn pulse_row(label: &str, value: &str, value_style: Style) -> Line<'static> {
    Line::from(vec![
        format!(" {label:<12}").dim(),
        Span::styled(value.to_string(), value_style),
    ])
}

fn fit_line(line: Line<'static>, width: usize) -> Line<'static> {
    let mut line = truncate_line_with_ellipsis_if_overflow(line, width);
    let used = line_width(&line);
    if used < width {
        line.spans.push(" ".repeat(width - used).into());
    }
    line
}

fn centered_line(line: Line<'static>, width: usize) -> Line<'static> {
    let line = truncate_line_with_ellipsis_if_overflow(line, width);
    let used = line_width(&line);
    let left = width.saturating_sub(used) / 2;
    let mut spans = vec![" ".repeat(left).into()];
    spans.extend(line.spans);
    fit_line(Line::from(spans), width)
}

fn join_columns(
    left: Line<'static>,
    right: Line<'static>,
    left_width: usize,
    right_width: usize,
) -> Line<'static> {
    let mut spans = centered_line(left, left_width).spans;
    spans.push(" │ ".dim());
    spans.extend(fit_line(right, right_width).spans);
    Line::from(spans)
}

fn load_home_pin(codex_home: &Path, thread_id: &str) -> Option<HomePinSummary> {
    let directory = codex_home.join("seh").join("threads").join(thread_id);
    let mut paths = fs::read_dir(directory)
        .ok()?
        .filter_map(|entry| {
            let entry = entry.ok()?;
            let file_type = entry.file_type().ok()?;
            let path = entry.path();
            (file_type.is_file()
                && path
                    .extension()
                    .is_some_and(|extension| extension == "json"))
            .then_some(path)
        })
        .collect::<Vec<_>>();
    paths.sort();
    let bytes = fs::read(paths.pop()?).ok()?;
    serde_json::from_slice(&bytes).ok()
}

fn evidence_label(codex_home: &Path, thread_id: &str, runtime_binding_hash: &str) -> String {
    if !safe_path_segment(runtime_binding_hash) {
        return "identity unavailable".to_string();
    }
    let root = codex_home
        .join("seh")
        .join("evidence")
        .join("threads")
        .join(thread_id)
        .join(runtime_binding_hash);
    if !root.is_dir() {
        return "initializing".to_string();
    }
    let receipt_paths = fs::read_dir(root.join("receipts"))
        .ok()
        .into_iter()
        .flatten()
        .filter_map(Result::ok)
        .filter(|entry| {
            entry.file_type().is_ok_and(|kind| kind.is_file())
                && entry
                    .path()
                    .extension()
                    .is_some_and(|extension| extension == "json")
        })
        .map(|entry| entry.path())
        .collect::<Vec<_>>();
    let receipt_count = receipt_paths.len();
    if receipt_count == 0 {
        "signed stream ready".to_string()
    } else if receipt_paths.iter().all(|path| {
        fs::read(path)
            .ok()
            .and_then(|bytes| serde_json::from_slice::<serde_json::Value>(&bytes).ok())
            .and_then(|value| {
                value
                    .pointer("/receipt/attestation/signature")
                    .and_then(serde_json::Value::as_str)
                    .map(str::to_owned)
            })
            .is_some_and(|signature| !signature.is_empty())
    }) {
        format!("signed · {receipt_count} receipts")
    } else {
        format!("{receipt_count} receipts · inspect /evidence")
    }
}

fn safe_path_segment(value: &str) -> bool {
    !value.is_empty()
        && value.chars().all(|character| {
            character.is_ascii_alphanumeric() || matches!(character, '-' | '_' | '.' | ':')
        })
}

fn short_identity(value: &str) -> String {
    let (prefix, digest) = value
        .rsplit_once(':')
        .map_or(("", value), |(prefix, digest)| (prefix, digest));
    if digest.chars().count() <= 16 {
        return value.to_string();
    }
    if prefix.is_empty() {
        format!("{}…", digest.chars().take(16).collect::<String>())
    } else {
        format!("{prefix}:{}…", digest.chars().take(12).collect::<String>())
    }
}

impl HistoryCell for SehPanelHistoryCell {
    fn display_lines(&self, width: u16) -> Vec<Line<'static>> {
        let Some(inner_width) = card_inner_width(width, SESSION_HEADER_MAX_INNER_WIDTH) else {
            return Vec::new();
        };
        let label_width = self
            .rows
            .iter()
            .map(|(label, _)| display_width(label))
            .max()
            .unwrap_or(0)
            .min(14);
        let mut lines = vec![Line::from(vec![
            "◈ ".magenta(),
            self.title.clone().cyan().bold(),
            "  ".into(),
            self.badge.clone().magenta(),
        ])];
        lines.push(Line::from(""));
        for (label, value) in &self.rows {
            lines.push(Line::from(vec![
                format!("{label:<label_width$}  ").dim(),
                value.clone().into(),
            ]));
        }
        if let Some(footer) = &self.footer {
            lines.push(Line::from(""));
            lines.push(footer.clone().dim().into());
        }
        let lines = lines
            .into_iter()
            .map(|line| truncate_line_with_ellipsis_if_overflow(line, inner_width))
            .collect();
        with_border(lines)
    }

    fn raw_lines(&self) -> Vec<Line<'static>> {
        let mut lines = vec![Line::from(format!("{} [{}]", self.title, self.badge))];
        lines.extend(
            self.rows
                .iter()
                .map(|(label, value)| Line::from(format!("{label}: {value}"))),
        );
        if let Some(footer) = &self.footer {
            lines.push(Line::from(footer.clone()));
        }
        lines
    }
}

#[cfg(test)]
#[path = "seh_home_tests.rs"]
mod tests;
