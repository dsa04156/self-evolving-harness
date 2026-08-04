use super::*;
use crate::line_truncation::truncate_line_with_ellipsis_if_overflow;
use crate::width::display_width;

#[derive(Debug)]
pub(crate) struct SehHomeHistoryCell;

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

impl HistoryCell for SehHomeHistoryCell {
    fn display_lines(&self, width: u16) -> Vec<Line<'static>> {
        if width < 48 {
            return vec![
                Line::from(vec!["  ◈ ".magenta(), "SEH CODE".cyan().bold()]),
                "  Task loop × governed evolution".dim().into(),
                Line::from(vec![
                    "  ".into(),
                    "/".cyan(),
                    " commands · ".dim(),
                    "/model".cyan(),
                    " · ".dim(),
                    "/harness".cyan(),
                ]),
            ];
        }

        vec![
            Line::from(vec![
                "             ╭╮        ╭╮".cyan(),
                "       trace".dim(),
            ]),
            Line::from(vec![
                "             ╰╮╲      ╱╭╯".cyan(),
                "   evidence".dim(),
            ]),
            Line::from(vec![
                "               ╲╲    ╱╱".magenta(),
                "    attribute".dim(),
            ]),
            Line::from(vec![
                "                ╲╲  ╱╱".magenta(),
                "     mutate".dim(),
            ]),
            Line::from(vec![
                "                ╱╱  ╲╲".magenta(),
                "    evaluate".dim(),
            ]),
            Line::from(vec!["               ╱╱    ╲╲".cyan(), "     promote".dim()]),
            Line::from(vec![
                "             ╭╯╱      ╲╰╮".cyan(),
                "    rollback".dim(),
            ]),
            Line::from(vec![
                "             ╰╯        ╰╯".cyan(),
                "      audit".dim(),
            ]),
            Line::from(""),
            Line::from(vec![
                "                 ".into(),
                "S E H   C O D E".cyan().bold(),
            ]),
            Line::from(vec![
                "        ".into(),
                "Task loop".bold(),
                "  ×  ".dim(),
                "signed evidence".bold(),
                "  ×  ".dim(),
                "versioned harness".bold(),
            ]),
        ]
    }

    fn raw_lines(&self) -> Vec<Line<'static>> {
        vec![
            "SEH CODE — task execution with signed evidence and versioned harnesses".into(),
            "trace -> attribute -> mutate -> evaluate -> promote | reject | rollback".into(),
        ]
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
