use hozo_ir::{
    Breakpoint, Condition, Dimension, Display, GridLine, GridSpan, GridTracks, StyleDeclaration,
    StyleProperty, Theme,
};

use super::{RuntimeHook, RuntimeNeeds};

pub(super) struct NativeGrid {
    pub(super) tracks_js: String,
    pub(super) column_gap: String,
    pub(super) row_gap: String,
    /// Static only when every responsive branch has the same count. Item
    /// line resolution needs a compile-time explicit grid; auto-placement
    /// itself does not.
    pub(super) track_count: Option<usize>,
    pub(super) row_tracks_js: Option<String>,
    pub(super) row_track_count: Option<usize>,
    /// True when explicit row tracks resolve `%` / `%`-mixed `calc()` against
    /// the grid container's definite content-box height via `HozoMeasuredParent`.
    pub(super) uses_measured_height: bool,
}

/// Whether `declarations` give the grid container an unconditional definite
/// height that lowers on Native (`h-64`, `h-screen`, `h-full`, `h-[400px]`,
/// `size-*`, `block-*`, etc.), allowing `%` / `%`-`calc()` row tracks without
/// creating a self-referential auto-height layout loop.
pub(super) fn has_definite_grid_height(
    declarations: &[StyleDeclaration],
    parent_measured: bool,
) -> bool {
    let last_height = declarations.iter().rev().find(|declaration| {
        declaration.condition == Condition::Always
            && matches!(
                declaration.property,
                StyleProperty::Height(_) | StyleProperty::BlockSize(_)
            )
    });
    let Some(declaration) = last_height else {
        return false;
    };
    let (StyleProperty::Height(dim) | StyleProperty::BlockSize(dim)) = &declaration.property else {
        return false;
    };
    match dim {
        Dimension::Auto => false,
        Dimension::Percent(pct)
        | Dimension::ViewportWidth(pct)
        | Dimension::ViewportHeight(pct) => pct.is_finite(),
        Dimension::Length(length) => {
            (length.unresolved_unit().is_none() && length.css_expression().is_none())
                || crate::layout::is_viewport_sized(&declaration.property)
                || crate::measured::is_container_sized(&declaration.property)
                || (parent_measured && crate::measured::is_parent_measured(&declaration.property))
        }
        Dimension::Css(_) => {
            crate::layout::is_viewport_sized(&declaration.property)
                || crate::measured::is_container_sized(&declaration.property)
                || (parent_measured && crate::measured::is_parent_measured(&declaration.property))
        }
    }
}

/// Whether `declarations` declare `display: grid` with `%` / `%`-`calc()` row
/// tracks that could lower if the grid container had a definite height.
pub(super) fn grid_rows_needs_definite_height(declarations: &[StyleDeclaration]) -> bool {
    let is_grid = declarations.iter().rev().find_map(|declaration| {
        matches!(declaration.condition, Condition::Always)
            .then_some(&declaration.property)
            .and_then(|property| match property {
                StyleProperty::Display(display) => Some(*display),
                _ => None,
            })
    }) == Some(Display::Grid);
    if !is_grid {
        return false;
    }
    declarations.iter().any(|declaration| {
        if let StyleProperty::GridTemplateRows(tracks) = &declaration.property {
            parse_grid_tracks(tracks, None).is_none()
                && parse_grid_tracks(tracks, Some("__hozoGridH"))
                    .is_some_and(|parsed| parsed.iter().any(|t| matches!(t, NativeTrack::Calc(_))))
        } else {
            false
        }
    })
}

pub(super) fn grid_absorbs(property: &StyleProperty) -> bool {
    matches!(
        property,
        StyleProperty::Display(Display::Grid)
            | StyleProperty::GridTemplateColumns(_)
            | StyleProperty::GridTemplateRows(_)
    )
}

/// Builds the supported subset of the Native grid solver input. Columns can
/// stay on the measurement-free path; explicit rows select its measured path.
/// Responsive track and gap changes reuse the same coarse breakpoint hooks
/// as ordinary Native variants. The ordinary column-only branch still stays
/// measurement-free: changing `tracks` only rebuilds Yoga flex rows.
pub(super) fn native_grid(
    declarations: &[StyleDeclaration],
    theme: &Theme,
    definite_height: bool,
    runtime: &mut RuntimeNeeds,
) -> Option<NativeGrid> {
    if declarations.iter().any(|declaration| {
        !matches!(
            declaration.condition,
            Condition::Always | Condition::Responsive(_)
        ) && matches!(
            declaration.property,
            StyleProperty::Display(_)
                | StyleProperty::GridTemplateColumns(_)
                | StyleProperty::GridTemplateRows(_)
                | StyleProperty::Gap(_)
                | StyleProperty::ColumnGap(_)
                | StyleProperty::RowGap(_)
        )
    }) {
        return None;
    }

    let display = declarations.iter().rev().find_map(|declaration| {
        matches!(declaration.condition, Condition::Always)
            .then_some(&declaration.property)
            .and_then(|property| match property {
                StyleProperty::Display(display) => Some(*display),
                _ => None,
            })
    });
    if display != Some(Display::Grid) {
        return None;
    }

    let (tracks_js, track_count, _) = responsive_grid_value(
        declarations,
        |property| match property {
            StyleProperty::GridTemplateColumns(tracks) => {
                Some(parse_grid_tracks(tracks, Some("__hozoGridW")))
            }
            _ => None,
        },
        Some(vec![NativeTrack::Fr(1.0)]),
        "__hozoGridW",
        runtime,
    )?;
    let has_rows = declarations
        .iter()
        .any(|declaration| matches!(declaration.property, StyleProperty::GridTemplateRows(_)));
    let (row_tracks_js, row_track_count, uses_measured_height) = if has_rows {
        let row_binding = definite_height.then_some("__hozoGridH");
        let (value, count, has_calc) = responsive_grid_value(
            declarations,
            |property| match property {
                StyleProperty::GridTemplateRows(tracks) => {
                    Some(parse_grid_tracks(tracks, row_binding))
                }
                _ => None,
            },
            Some(Vec::new()),
            "__hozoGridH",
            runtime,
        )?;
        (Some(value), count, has_calc)
    } else {
        (None, None, false)
    };
    let column_gap = responsive_gap(declarations, theme, true, runtime)?;
    let row_gap = responsive_gap(declarations, theme, false, runtime)?;
    Some(NativeGrid {
        tracks_js,
        column_gap,
        row_gap,
        track_count,
        row_tracks_js,
        row_track_count,
        uses_measured_height,
    })
}

#[derive(Clone)]
enum NativeTrack {
    Fr(f64),
    Points(f64),
    Minmax { min: f64, fr: f64 },
    Calc(String),
}

type NativeTracks = Vec<NativeTrack>;

fn parse_grid_tracks(tracks: &GridTracks, percent_binding: Option<&str>) -> Option<NativeTracks> {
    match tracks {
        GridTracks::Count(count) if *count > 0 => Some(vec![NativeTrack::Fr(1.0); *count as usize]),
        GridTracks::Css(css) => {
            parse_equal_grid_repeat(css).or_else(|| parse_native_grid_tracks(css, percent_binding))
        }
        GridTracks::None | GridTracks::Subgrid | GridTracks::Count(_) => None,
    }
}

fn parse_equal_grid_repeat(css: &str) -> Option<NativeTracks> {
    let compact = css
        .chars()
        .filter(|character| !character.is_whitespace())
        .collect::<String>();
    let count = compact
        .strip_prefix("repeat(")?
        .strip_suffix(",minmax(0,1fr))")?
        .parse::<usize>()
        .ok()?;
    (count > 0).then(|| vec![NativeTrack::Fr(1.0); count])
}

fn tracks_js(tracks: &NativeTracks, param_name: &str) -> String {
    format!(
        "[{}]",
        tracks
            .iter()
            .map(|track| match track {
                NativeTrack::Fr(value) => format!("{{ kind: 'fr', value: {value} }}"),
                NativeTrack::Points(value) => format!("{{ kind: 'points', value: {value} }}"),
                NativeTrack::Minmax { min, fr } => {
                    format!("{{ kind: 'minmax', min: {min}, value: {fr} }}")
                }
                NativeTrack::Calc(expr) => {
                    format!("{{ kind: 'calc', evaluate: ({param_name}) => Math.max(0, {expr}) }}")
                }
            })
            .collect::<Vec<_>>()
            .join(", ")
    )
}

fn breakpoint_rank(bp: &Breakpoint) -> u8 {
    match bp {
        Breakpoint::Sm => 0,
        Breakpoint::Md => 1,
        Breakpoint::Lg => 2,
        Breakpoint::Xl => 3,
        Breakpoint::Xl2 => 4,
    }
}

fn responsive_grid_value<F>(
    declarations: &[StyleDeclaration],
    pick: F,
    default: Option<NativeTracks>,
    param_name: &str,
    runtime: &mut RuntimeNeeds,
) -> Option<(String, Option<usize>, bool)>
where
    F: Fn(&StyleProperty) -> Option<Option<NativeTracks>>,
{
    let mut base = default;
    let mut responsive: Vec<(Breakpoint, NativeTracks)> = Vec::new();
    for declaration in declarations {
        let Some(parsed) = pick(&declaration.property) else {
            continue;
        };
        let parsed = parsed?;
        match declaration.condition {
            Condition::Always => base = Some(parsed),
            Condition::Responsive(bp) => {
                if let Some(entry) = responsive.iter_mut().find(|(known, _)| known == &bp) {
                    entry.1 = parsed;
                } else {
                    responsive.push((bp, parsed));
                }
            }
            _ => return None,
        }
    }
    let base = base?;
    let mut counts = vec![base.len()];
    let mut has_calc = base.iter().any(|t| matches!(t, NativeTrack::Calc(_)));
    // Hooks are min-width predicates and therefore overlap. Wrap from the
    // smallest to the largest so the largest active breakpoint is outermost
    // and wins, matching Tailwind's media-query ordering.
    responsive.sort_by_key(|(bp, _)| breakpoint_rank(bp));
    let mut value = tracks_js(&base, param_name);
    for (bp, tracks) in &responsive {
        runtime.hooks.push(RuntimeHook::Breakpoint(*bp));
        counts.push(tracks.len());
        has_calc |= tracks.iter().any(|t| matches!(t, NativeTrack::Calc(_)));
        value = format!(
            "{} ? {} : ({value})",
            RuntimeHook::Breakpoint(*bp).binding(),
            tracks_js(tracks, param_name)
        );
    }
    let count = counts
        .iter()
        .all(|count| *count == counts[0])
        .then_some(counts[0]);
    Some((value, count, has_calc))
}

fn responsive_gap(
    declarations: &[StyleDeclaration],
    theme: &Theme,
    column: bool,
    runtime: &mut RuntimeNeeds,
) -> Option<String> {
    let mut base = None;
    let mut responsive = Vec::new();
    for declaration in declarations {
        let dimension = match &declaration.property {
            StyleProperty::Gap(dimension) => dimension,
            StyleProperty::ColumnGap(dimension) if column => dimension,
            StyleProperty::RowGap(dimension) if !column => dimension,
            _ => continue,
        };
        let value = (&declaration.property, dimension);
        match declaration.condition {
            Condition::Always => base = Some(value),
            Condition::Responsive(bp) => {
                if let Some(entry) = responsive.iter_mut().find(|(known, _)| known == &bp) {
                    entry.1 = value;
                } else {
                    responsive.push((bp, value));
                }
            }
            // `native_grid` excludes other conditions before selecting
            // tracks and gaps; no new Grid variant policy is added here.
            _ => unreachable!("checked grid condition"),
        }
    }
    // Resolve only the winners, with the same expression used by the
    // outer View's row/column gap. A shadowed viewport value needs no hook.
    let resolve = |(property, dimension): (&StyleProperty, &Dimension),
                   runtime: &mut RuntimeNeeds|
     -> Option<String> {
        if let Some(value) = crate::layout::viewport_value(property) {
            runtime.hooks.push(RuntimeHook::Viewport);
            Some(value)
        } else if let Dimension::Length(length) = dimension {
            Some(length.px(theme).to_string())
        } else {
            None
        }
    };
    responsive.sort_by_key(|(bp, _)| breakpoint_rank(bp));
    let mut value = match base {
        Some(base) => resolve(base, runtime)?,
        None => "0".to_string(),
    };
    for (bp, gap) in responsive {
        let gap = resolve(gap, runtime)?;
        runtime.hooks.push(RuntimeHook::Breakpoint(bp));
        value = format!(
            "{} ? {gap} : ({value})",
            RuntimeHook::Breakpoint(bp).binding()
        );
    }
    Some(value)
}

pub(super) struct NativeGridItem {
    pub(super) span: usize,
    pub(super) column_start: Option<usize>,
    pub(super) row_span: usize,
    pub(super) row_start: Option<usize>,
}

pub(super) fn native_grid_item(
    declarations: &[StyleDeclaration],
    grid_columns: Option<usize>,
    grid_rows: Option<usize>,
) -> Option<NativeGridItem> {
    let columns = grid_columns?;
    if declarations.iter().any(|declaration| {
        !matches!(declaration.condition, Condition::Always)
            && matches!(
                declaration.property,
                StyleProperty::GridColumn(_)
                    | StyleProperty::GridColumnStart(_)
                    | StyleProperty::GridColumnEnd(_)
                    | StyleProperty::GridRow(_)
                    | StyleProperty::GridRowStart(_)
                    | StyleProperty::GridRowEnd(_)
            )
    }) {
        return None;
    }
    let find = |pick: fn(&StyleProperty) -> Option<GridLine>| {
        declarations.iter().rev().find_map(|declaration| {
            matches!(declaration.condition, Condition::Always)
                .then(|| pick(&declaration.property))
                .flatten()
        })
    };
    let mut start = find(|property| match property {
        StyleProperty::GridColumnStart(line) => Some(*line),
        _ => None,
    })
    .and_then(|line| resolve_grid_line(line, columns));
    let end = find(|property| match property {
        StyleProperty::GridColumnEnd(line) => Some(*line),
        _ => None,
    })
    .and_then(|line| resolve_grid_line(line, columns));
    let shorthand = declarations.iter().rev().find_map(|declaration| {
        if !matches!(declaration.condition, Condition::Always) {
            return None;
        }
        match declaration.property {
            StyleProperty::GridColumn(value) => Some(value),
            _ => None,
        }
    });
    let row_start_line = find(|property| match property {
        StyleProperty::GridRowStart(line) => Some(*line),
        _ => None,
    });
    let row_end_line = find(|property| match property {
        StyleProperty::GridRowEnd(line) => Some(*line),
        _ => None,
    });
    let row_shorthand = declarations.iter().rev().find_map(|declaration| {
        if !matches!(declaration.condition, Condition::Always) {
            return None;
        }
        match declaration.property {
            StyleProperty::GridRow(value) => Some(value),
            _ => None,
        }
    });
    if start.is_none()
        && end.is_none()
        && shorthand.is_none()
        && row_start_line.is_none()
        && row_end_line.is_none()
        && row_shorthand.is_none()
    {
        return None;
    }

    let mut span = match shorthand {
        Some(GridSpan::Span(span)) => span as usize,
        Some(GridSpan::Full) => {
            start = Some(0);
            columns
        }
        Some(GridSpan::Auto) | None => 1,
    };
    if let (Some(start), Some(end)) = (start, end) {
        span = end.checked_sub(start)?;
    } else if let (None, Some(end)) = (start, end) {
        start = end.checked_sub(span);
    }
    let start_fits = start.is_none_or(|start| start + span <= columns);
    let mut row_start = row_start_line.and_then(|line| resolve_row_line(line, grid_rows));
    let row_end = row_end_line.and_then(|line| resolve_row_line(line, grid_rows));
    let mut row_span = match row_shorthand {
        Some(GridSpan::Span(span)) => span as usize,
        Some(GridSpan::Auto) | None => 1,
        Some(GridSpan::Full) => {
            row_start = Some(0);
            grid_rows?
        }
    };
    if let (Some(start), Some(end)) = (row_start, row_end) {
        row_span = end.checked_sub(start)?;
    } else if let (None, Some(end)) = (row_start, row_end) {
        row_start = end.checked_sub(row_span);
    }
    (span > 0 && span <= columns && start_fits && row_span > 0).then_some(NativeGridItem {
        span,
        column_start: start,
        row_span,
        row_start,
    })
}

pub(super) fn resolve_row_line(line: GridLine, rows: Option<usize>) -> Option<usize> {
    match line {
        GridLine::Line(line) if line > 0 => Some(line as usize - 1),
        GridLine::Line(line) => {
            let rows = rows?;
            (rows as i32 + 1 + line)
                .try_into()
                .ok()
                .filter(|line: &usize| *line <= rows)
        }
        GridLine::Auto => None,
    }
}

fn resolve_grid_line(line: GridLine, columns: usize) -> Option<usize> {
    match line {
        GridLine::Auto => None,
        GridLine::Line(line) if line > 0 => Some(line as usize - 1),
        GridLine::Line(line) => (columns as i32 + 1 + line)
            .try_into()
            .ok()
            .filter(|line: &usize| *line <= columns),
    }
}

fn parse_native_grid_tracks(css: &str, percent_binding: Option<&str>) -> Option<NativeTracks> {
    let tracks: Option<Vec<_>> = hozo_ir::split_top_level_tracks(css)
        .into_iter()
        .map(|token| {
            if let Some(inner) = token
                .strip_prefix("minmax(")
                .and_then(|value| value.strip_suffix(')'))
            {
                let (min, max) = inner.split_once(',')?;
                let min = hozo_ir::resolve_native_length_px(min.trim())?;
                let fr = max.trim().strip_suffix("fr")?.parse::<f64>().ok()?;
                return (min >= 0.0 && fr > 0.0).then_some(NativeTrack::Minmax { min, fr });
            }
            if let Some(value) = token.strip_suffix("fr") {
                let value = value.parse::<f64>().ok()?;
                return (value > 0.0).then_some(NativeTrack::Fr(value));
            }
            if let Some(value) = hozo_ir::resolve_native_length_px(token) {
                return (value >= 0.0).then_some(NativeTrack::Points(value));
            }
            if let Some(binding) = percent_binding {
                if let Some(pct) = token
                    .strip_suffix('%')
                    .and_then(|value| value.parse::<f64>().ok())
                    .filter(|pct| pct.is_finite() && *pct >= 0.0)
                {
                    let js = if (pct - 100.0).abs() < f64::EPSILON {
                        binding.to_string()
                    } else {
                        format!("{binding} * {}", pct / 100.0)
                    };
                    return Some(NativeTrack::Calc(js));
                }
                if let Some(expr) = hozo_ir::parse_calc_length(token) {
                    let needs = expr.needs();
                    if needs.percent && !needs.viewport && !needs.needs_container() {
                        if let Some(js) = expr.to_js(&hozo_ir::CalcBindings {
                            percent: Some(binding),
                            ..Default::default()
                        }) {
                            return Some(NativeTrack::Calc(js));
                        }
                    }
                }
            }
            None
        })
        .collect();
    tracks.filter(|tracks| !tracks.is_empty())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::lower;
    use hozo_ir::Theme;

    #[test]
    fn grid_lowers_equal_tracks_and_gap_to_the_solver_boundary() {
        let source = r#"
            import { View } from '@hozo/core'
            const el = <View className="grid grid-cols-3 gap-4"><View /><View /></View>
            "#;
        let parsed = hozo_parser::parse_tsx(source);
        let output = lower(&parsed.roots[0].node, source, &Theme::default());

        assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
        assert!(output.runtime_imports.contains(&"HozoGrid"));
        assert!(output.jsx.contains("<HozoGrid tracks={[{ kind: 'fr', value: 1 }, { kind: 'fr', value: 1 }, { kind: 'fr', value: 1 }]} columnGap={16} rowGap={16}>"), "{}", output.jsx);
        assert!(output.styles.contains("rowGap: 16,"), "{}", output.styles);
        assert!(
            output.styles.contains("columnGap: 16,"),
            "{}",
            output.styles
        );
    }

    #[test]
    fn grid_accepts_simple_unequal_fr_and_fixed_tracks_without_measurement() {
        let source = r#"
            import { View } from '@hozo/core'
            const el = <View className="grid grid-cols-[120px_2fr_1fr]"><View /></View>
            "#;
        let parsed = hozo_parser::parse_tsx(source);
        let output = lower(&parsed.roots[0].node, source, &Theme::default());

        assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
        assert!(
            output.jsx.contains("{ kind: 'points', value: 120 }"),
            "{}",
            output.jsx
        );
        assert!(
            output.jsx.contains("{ kind: 'fr', value: 2 }"),
            "{}",
            output.jsx
        );
        assert!(
            output.jsx.contains("{ kind: 'fr', value: 1 }"),
            "{}",
            output.jsx
        );
    }

    #[test]
    fn grid_accepts_fixed_minimum_fractional_tracks_without_measurement() {
        let source = r#"
            import { View } from '@hozo/core'
            const el = <View className="grid grid-cols-[minmax(120px,2fr)_1fr]"><View /></View>
            "#;
        let parsed = hozo_parser::parse_tsx(source);
        let output = lower(&parsed.roots[0].node, source, &Theme::default());

        assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
        assert!(
            output
                .jsx
                .contains("{ kind: 'minmax', min: 120, value: 2 }"),
            "{}",
            output.jsx
        );
        assert!(
            output.jsx.contains("{ kind: 'fr', value: 1 }"),
            "{}",
            output.jsx
        );
    }

    #[test]
    fn grid_column_span_is_passed_to_the_auto_placer() {
        let source = r#"
            import { View } from '@hozo/core'
            const el = <View className="grid grid-cols-3"><View className="col-span-2" /><View /></View>
            "#;
        let parsed = hozo_parser::parse_tsx(source);
        let output = lower(&parsed.roots[0].node, source, &Theme::default());

        assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
        assert!(
            output.jsx.contains("<HozoGridItem columnSpan={2}><View"),
            "{}",
            output.jsx
        );
        assert!(output.runtime_imports.contains(&"HozoGridItem"));
    }

    #[test]
    fn grid_column_lines_become_zero_based_placer_coordinates() {
        let source = r#"
            import { View } from '@hozo/core'
            const el = <View className="grid grid-cols-3"><View className="col-start-2 col-end-4" /></View>
            "#;
        let parsed = hozo_parser::parse_tsx(source);
        let output = lower(&parsed.roots[0].node, source, &Theme::default());

        assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
        assert!(
            output
                .jsx
                .contains("<HozoGridItem columnSpan={2} columnStart={1}>"),
            "{}",
            output.jsx
        );
    }

    #[test]
    fn grid_row_span_selects_the_measured_placer_path() {
        let source = r#"
            import { View } from '@hozo/core'
            const el = <View className="grid grid-cols-2 gap-2"><View className="row-span-2" /><View /><View /></View>
            "#;
        let parsed = hozo_parser::parse_tsx(source);
        let output = lower(&parsed.roots[0].node, source, &Theme::default());

        assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
        assert!(output.jsx.contains("rowSpan={2}"), "{}", output.jsx);
        assert!(output.jsx.contains("rowGap={8}"), "{}", output.jsx);
    }

    #[test]
    fn explicit_grid_rows_resolve_full_row_spans() {
        let source = r#"
            import { View } from '@hozo/core'
            const el = <View className="grid grid-cols-2 grid-rows-3"><View className="row-span-full" /></View>
            "#;
        let parsed = hozo_parser::parse_tsx(source);
        let output = lower(&parsed.roots[0].node, source, &Theme::default());

        assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
        assert!(output.jsx.contains("rowTracks={[{ kind: 'fr', value: 1 }, { kind: 'fr', value: 1 }, { kind: 'fr', value: 1 }]}"), "{}", output.jsx);
        assert!(
            output.jsx.contains("rowSpan={3} rowStart={0}"),
            "{}",
            output.jsx
        );
        assert_eq!(resolve_row_line(GridLine::Line(-1), Some(3)), Some(3));
        assert_eq!(resolve_row_line(GridLine::Line(-2), Some(3)), Some(2));
        assert_eq!(resolve_row_line(GridLine::Line(-1), None), None);
    }

    #[test]
    fn grid_declines_tracks_that_need_the_future_measured_solver() {
        let source = r#"
            import { View } from '@hozo/core'
            const el = <View className="grid grid-cols-[auto_1fr]" />
            "#;
        let parsed = hozo_parser::parse_tsx(source);
        let output = lower(&parsed.roots[0].node, source, &Theme::default());

        assert!(!output.diagnostics.is_empty());
        assert!(!output.runtime_imports.contains(&"HozoGrid"));
    }

    #[test]
    fn responsive_grid_tracks_and_gaps_reuse_breakpoint_hooks() {
        let source = r#"
            import { View } from '@hozo/core'
            function Cards() {
              return <View className="grid grid-cols-1 gap-2 md:grid-cols-3 md:gap-4 lg:grid-cols-4"><View /><View /></View>
            }
            "#;
        let parsed = hozo_parser::parse_tsx(source);
        let output = lower(&parsed.roots[0].node, source, &Theme::default());

        assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
        assert!(
            output.jsx.contains("tracks={__hozoBp_lg ?"),
            "{}",
            output.jsx
        );
        assert!(output.jsx.contains("__hozoBp_md ?"), "{}", output.jsx);
        assert!(
            output.jsx.contains("columnGap={__hozoBp_md ? 16 : (8)}"),
            "{}",
            output.jsx
        );
        assert!(
            output.jsx.contains("rowGap={__hozoBp_md ? 16 : (8)}"),
            "{}",
            output.jsx
        );
        assert!(output
            .prelude
            .contains(&"const __hozoBp_md = useHozoBreakpoint('md')".to_string()));
        assert!(output
            .prelude
            .contains(&"const __hozoBp_lg = useHozoBreakpoint('lg')".to_string()));
    }

    #[test]
    fn definite_height_grid_lowers_percent_and_calc_row_tracks_while_auto_height_refuses() {
        let source = r#"
            import { View } from '@hozo/core'
            function Screen() {
              return <View className="grid h-64 p-4 grid-rows-[calc(100%-2rem)_2rem]"><View /><View /></View>
            }
            "#;
        let parsed = hozo_parser::parse_tsx(source);
        let output = lower(&parsed.roots[0].node, source, &Theme::default());
        assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
        assert!(output.runtime_imports.contains(&"HozoMeasuredParent"));
        assert!(output.runtime_imports.contains(&"HozoParentSizeQuery"));
        assert!(output.runtime_imports.contains(&"HozoGrid"));
        assert!(output.jsx.contains("<HozoMeasuredParent"), "{}", output.jsx);
        assert!(
            output
                .jsx
                .contains("containerHeight={__hozoParent?.height}"),
            "{}",
            output.jsx
        );
        assert!(
            output.jsx.contains(
                "{ kind: 'calc', evaluate: (__hozoGridH) => Math.max(0, __hozoGridH - 32) }"
            ),
            "{}",
            output.jsx
        );

        // Plain percentage columns and definite-height percentage rows also lower.
        let pct_source = r#"
            import { View } from '@hozo/core'
            function Split() {
              return <View className="grid h-screen grid-cols-[30%_70%] grid-rows-[50%_50%]"><View /><View /></View>
            }
            "#;
        let parsed = hozo_parser::parse_tsx(pct_source);
        let output = lower(&parsed.roots[0].node, pct_source, &Theme::default());
        assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
        assert!(
            output.jsx.contains(
                "{ kind: 'calc', evaluate: (__hozoGridW) => Math.max(0, __hozoGridW * 0.3) }"
            ),
            "{}",
            output.jsx
        );
        assert!(
            output.jsx.contains(
                "{ kind: 'calc', evaluate: (__hozoGridH) => Math.max(0, __hozoGridH * 0.5) }"
            ),
            "{}",
            output.jsx
        );

        // Auto-height grid with `%`-calc row track stays honestly refused with guidance.
        let auto_source = r#"
            import { View } from '@hozo/core'
            function AutoGrid() {
              return <View className="grid grid-rows-[calc(100%-2rem)]"><View /></View>
            }
            "#;
        let parsed = hozo_parser::parse_tsx(auto_source);
        let output = lower(&parsed.roots[0].node, auto_source, &Theme::default());
        assert!(
            output
                .diagnostics
                .iter()
                .any(|d| d.message.contains("definite height")),
            "{:?}",
            output.diagnostics
        );
        assert!(!output.jsx.contains("HozoGrid"), "{}", output.jsx);
    }
}
