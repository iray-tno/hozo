//! Typed CSS math expression parser and React Native JS emitter for
//! `calc()`, `min()`, `max()`, and `clamp()`.
//!
//! Enforces CSS Values & Units Level 4 dimension algebra (e.g. `length ± length`,
//! `length * number`, `length / number`) and classifies dynamic dependencies
//! (viewport, container width/height, percentage reference) so the Native
//! backend can emit exact runtime expressions only where a backing measurement
//! exists, and refuse everything else cleanly.

use super::{round, LengthUnit};

/// Which runtime measurements a CSS math expression depends on.
#[derive(Debug, Default, Clone, Copy, PartialEq, Eq)]
pub struct CalcNeeds {
    pub viewport: bool,
    pub container_width: bool,
    pub container_height: bool,
    pub percent: bool,
}

impl CalcNeeds {
    pub fn any(self) -> bool {
        self.viewport || self.container_width || self.container_height || self.percent
    }

    pub fn needs_container(self) -> bool {
        self.container_width || self.container_height
    }

    fn merge(self, other: Self) -> Self {
        Self {
            viewport: self.viewport || other.viewport,
            container_width: self.container_width || other.container_width,
            container_height: self.container_height || other.container_height,
            percent: self.percent || other.percent,
        }
    }
}

/// JS variable/expression bindings substituted when lowering a [`CalcExpr`].
#[derive(Debug, Default, Clone, Copy)]
pub struct CalcBindings<'a> {
    /// Viewport object with `.width` and `.height` (e.g. `"__hozoViewport"`).
    pub viewport: Option<&'a str>,
    /// Container size object with `.width` and `.height` (e.g. `"__hozoCqs[\"\"]"`).
    pub container: Option<&'a str>,
    /// Numeric expression for `100%` (e.g. `"__hozoSelf.width"` or `"__hozoParent.width"`).
    pub percent: Option<&'a str>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ViewportCalcUnit {
    Vw,
    Vh,
    Vmin,
    Vmax,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ContainerCalcUnit {
    Cqw,
    Cqh,
    Cqi,
    Cqb,
    Cqmin,
    Cqmax,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ValueKind {
    Number,
    Length,
    /// Literal `0`, valid as either a number or `0px` in CSS math.
    Zero,
}

impl ValueKind {
    fn is_length(self) -> bool {
        matches!(self, ValueKind::Length | ValueKind::Zero)
    }

    fn is_number(self) -> bool {
        matches!(self, ValueKind::Number | ValueKind::Zero)
    }
}

#[derive(Debug, Clone, PartialEq)]
pub enum CalcExpr {
    Px(f64),
    Number(f64),
    Viewport(ViewportCalcUnit, f64),
    Container(ContainerCalcUnit, f64),
    Percent(f64),
    Neg(Box<CalcExpr>),
    Add(Box<CalcExpr>, Box<CalcExpr>),
    Sub(Box<CalcExpr>, Box<CalcExpr>),
    Mul(Box<CalcExpr>, Box<CalcExpr>),
    Div(Box<CalcExpr>, Box<CalcExpr>),
    Min(Vec<CalcExpr>),
    Max(Vec<CalcExpr>),
    Clamp(Box<CalcExpr>, Box<CalcExpr>, Box<CalcExpr>),
}

impl CalcExpr {
    pub fn needs(&self) -> CalcNeeds {
        match self {
            CalcExpr::Px(_) | CalcExpr::Number(_) => CalcNeeds::default(),
            CalcExpr::Viewport(_, _) => CalcNeeds {
                viewport: true,
                ..CalcNeeds::default()
            },
            CalcExpr::Container(unit, _) => match unit {
                ContainerCalcUnit::Cqw | ContainerCalcUnit::Cqi => CalcNeeds {
                    container_width: true,
                    ..CalcNeeds::default()
                },
                ContainerCalcUnit::Cqh | ContainerCalcUnit::Cqb => CalcNeeds {
                    container_height: true,
                    ..CalcNeeds::default()
                },
                ContainerCalcUnit::Cqmin | ContainerCalcUnit::Cqmax => CalcNeeds {
                    container_width: true,
                    container_height: true,
                    ..CalcNeeds::default()
                },
            },
            CalcExpr::Percent(_) => CalcNeeds {
                percent: true,
                ..CalcNeeds::default()
            },
            CalcExpr::Neg(inner) => inner.needs(),
            CalcExpr::Add(a, b)
            | CalcExpr::Sub(a, b)
            | CalcExpr::Mul(a, b)
            | CalcExpr::Div(a, b) => a.needs().merge(b.needs()),
            CalcExpr::Min(args) | CalcExpr::Max(args) => args
                .iter()
                .fold(CalcNeeds::default(), |acc, arg| acc.merge(arg.needs())),
            CalcExpr::Clamp(lo, val, hi) => lo.needs().merge(val.needs()).merge(hi.needs()),
        }
    }

    /// Evaluates a constant (dependency-free) expression to static pixels.
    pub fn static_px(&self) -> Option<f64> {
        if self.needs().any() {
            return None;
        }
        self.eval_const().filter(|v| v.is_finite()).map(round)
    }

    fn eval_const(&self) -> Option<f64> {
        Some(match self {
            CalcExpr::Px(v) | CalcExpr::Number(v) => *v,
            CalcExpr::Neg(inner) => -inner.eval_const()?,
            CalcExpr::Add(a, b) => a.eval_const()? + b.eval_const()?,
            CalcExpr::Sub(a, b) => a.eval_const()? - b.eval_const()?,
            CalcExpr::Mul(a, b) => a.eval_const()? * b.eval_const()?,
            CalcExpr::Div(a, b) => {
                let rhs = b.eval_const()?;
                if rhs == 0.0 {
                    return None;
                }
                a.eval_const()? / rhs
            }
            CalcExpr::Min(args) => {
                let mut iter = args.iter();
                let mut acc = iter.next()?.eval_const()?;
                for arg in iter {
                    acc = acc.min(arg.eval_const()?);
                }
                acc
            }
            CalcExpr::Max(args) => {
                let mut iter = args.iter();
                let mut acc = iter.next()?.eval_const()?;
                for arg in iter {
                    acc = acc.max(arg.eval_const()?);
                }
                acc
            }
            CalcExpr::Clamp(lo, val, hi) => val
                .eval_const()?
                .max(lo.eval_const()?)
                .min(hi.eval_const()?),
            CalcExpr::Viewport(..) | CalcExpr::Container(..) | CalcExpr::Percent(_) => {
                return None;
            }
        })
    }

    /// Formats this expression as a JavaScript numeric expression using the
    /// supplied runtime bindings, or returns `None` if a required binding is
    /// absent.
    pub fn to_js(&self, bindings: &CalcBindings<'_>) -> Option<String> {
        let needs = self.needs();
        if needs.viewport && bindings.viewport.is_none() {
            return None;
        }
        if needs.needs_container() && bindings.container.is_none() {
            return None;
        }
        if needs.percent && bindings.percent.is_none() {
            return None;
        }
        Some(self.emit_js(bindings, 0))
    }

    fn emit_js(&self, bindings: &CalcBindings<'_>, parent_prec: u8) -> String {
        // Fold pure constant sub-expressions cleanly (`2rem` -> `32`, `10px + 20px` -> `30`).
        if let Some(value) = self.static_px() {
            return format_js_number(value);
        }
        let (prec, text) = match self {
            CalcExpr::Px(v) | CalcExpr::Number(v) => (3, format_js_number(round(*v))),
            CalcExpr::Viewport(unit, pct) => {
                let vp = bindings.viewport.expect("viewport binding checked");
                let base = match unit {
                    ViewportCalcUnit::Vw => format!("{vp}.width"),
                    ViewportCalcUnit::Vh => format!("{vp}.height"),
                    ViewportCalcUnit::Vmin => format!("Math.min({vp}.width, {vp}.height)"),
                    ViewportCalcUnit::Vmax => format!("Math.max({vp}.width, {vp}.height)"),
                };
                format_scaled(&base, *pct)
            }
            CalcExpr::Container(unit, pct) => {
                let cq = bindings.container.expect("container binding checked");
                let base = match unit {
                    ContainerCalcUnit::Cqw | ContainerCalcUnit::Cqi => format!("{cq}.width"),
                    ContainerCalcUnit::Cqh | ContainerCalcUnit::Cqb => format!("{cq}.height"),
                    ContainerCalcUnit::Cqmin => format!("Math.min({cq}.width, {cq}.height)"),
                    ContainerCalcUnit::Cqmax => format!("Math.max({cq}.width, {cq}.height)"),
                };
                format_scaled(&base, *pct)
            }
            CalcExpr::Percent(pct) => {
                let p = bindings.percent.expect("percent binding checked");
                format_scaled(p, *pct)
            }
            CalcExpr::Neg(inner) => (3, format!("-({})", inner.emit_js(bindings, 0))),
            CalcExpr::Add(a, b) => (
                1,
                format!("{} + {}", a.emit_js(bindings, 1), b.emit_js(bindings, 1)),
            ),
            CalcExpr::Sub(a, b) => (
                1,
                format!("{} - {}", a.emit_js(bindings, 1), b.emit_js(bindings, 2)),
            ),
            CalcExpr::Mul(a, b) => (
                2,
                format!("{} * {}", a.emit_js(bindings, 2), b.emit_js(bindings, 2)),
            ),
            CalcExpr::Div(a, b) => (
                2,
                format!("{} / {}", a.emit_js(bindings, 2), b.emit_js(bindings, 3)),
            ),
            CalcExpr::Min(args) => (
                3,
                format!(
                    "Math.min({})",
                    args.iter()
                        .map(|arg| arg.emit_js(bindings, 0))
                        .collect::<Vec<_>>()
                        .join(", ")
                ),
            ),
            CalcExpr::Max(args) => (
                3,
                format!(
                    "Math.max({})",
                    args.iter()
                        .map(|arg| arg.emit_js(bindings, 0))
                        .collect::<Vec<_>>()
                        .join(", ")
                ),
            ),
            CalcExpr::Clamp(lo, val, hi) => (
                3,
                format!(
                    "Math.min(Math.max({}, {}), {})",
                    val.emit_js(bindings, 0),
                    lo.emit_js(bindings, 0),
                    hi.emit_js(bindings, 0)
                ),
            ),
        };
        if prec < parent_prec {
            format!("({text})")
        } else {
            text
        }
    }
}

fn format_scaled(base: &str, pct: f64) -> (u8, String) {
    if (pct - 100.0).abs() < f64::EPSILON {
        (3, base.to_string())
    } else if (pct + 100.0).abs() < f64::EPSILON {
        (3, format!("-{base}"))
    } else {
        (
            2,
            format!("{base} * {}", format_js_number(round(pct / 100.0))),
        )
    }
}

fn format_js_number(value: f64) -> String {
    if value == 0.0 {
        "0".to_string()
    } else {
        format!("{value}")
    }
}

/// Parses a CSS length math function (`calc()`, `min()`, `max()`, `clamp()`)
/// into a dimension-checked [`CalcExpr`].
pub fn parse_calc_length(css: &str) -> Option<CalcExpr> {
    let trimmed = css.trim();
    let lower = trimmed.to_ascii_lowercase();
    if !(lower.starts_with("calc(")
        || lower.starts_with("min(")
        || lower.starts_with("max(")
        || lower.starts_with("clamp("))
    {
        return None;
    }
    let mut parser = CalcParser::new(trimmed);
    let (expr, kind) = parser.parse_function()?;
    parser.skip_ws();
    if !parser.is_eof() || !kind.is_length() {
        return None;
    }
    Some(expr)
}

/// Splits a CSS value list on top-level ASCII whitespace, keeping parenthesized
/// groups like `calc(100% - 2rem)` or `minmax(120px, 2fr)` intact.
pub fn split_top_level_tracks(text: &str) -> Vec<&str> {
    let mut parts = Vec::new();
    let mut depth = 0usize;
    let mut start: Option<usize> = None;
    for (index, ch) in text.char_indices() {
        match ch {
            '(' => {
                start.get_or_insert(index);
                depth += 1;
            }
            ')' => {
                start.get_or_insert(index);
                depth = depth.saturating_sub(1);
            }
            c if c.is_ascii_whitespace() && depth == 0 => {
                if let Some(s) = start.take() {
                    parts.push(&text[s..index]);
                }
            }
            _ => {
                start.get_or_insert(index);
            }
        }
    }
    if let Some(s) = start {
        parts.push(&text[s..]);
    }
    parts
}

struct CalcParser<'a> {
    src: &'a str,
    pos: usize,
}

impl<'a> CalcParser<'a> {
    fn new(src: &'a str) -> Self {
        Self { src, pos: 0 }
    }

    fn rest(&self) -> &'a str {
        &self.src[self.pos..]
    }

    fn is_eof(&self) -> bool {
        self.pos >= self.src.len()
    }

    fn skip_ws(&mut self) {
        while let Some(ch) = self.rest().chars().next() {
            if ch.is_ascii_whitespace() {
                self.pos += ch.len_utf8();
            } else {
                break;
            }
        }
    }

    fn consume_char(&mut self, expected: char) -> bool {
        if self.rest().starts_with(expected) {
            self.pos += expected.len_utf8();
            true
        } else {
            false
        }
    }

    fn parse_function(&mut self) -> Option<(CalcExpr, ValueKind)> {
        self.skip_ws();
        let start = self.pos;
        while let Some(ch) = self.rest().chars().next() {
            if ch.is_ascii_alphabetic() || ch == '-' {
                self.pos += ch.len_utf8();
            } else {
                break;
            }
        }
        let name = self.src[start..self.pos].to_ascii_lowercase();
        if !self.consume_char('(') {
            return None;
        }
        let result = match name.as_str() {
            "calc" => {
                let expr = self.parse_sum()?;
                self.skip_ws();
                if !self.consume_char(')') {
                    return None;
                }
                expr
            }
            "min" | "max" => {
                let mut args = Vec::new();
                let mut common_kind = ValueKind::Zero;
                loop {
                    let (arg, kind) = self.parse_sum()?;
                    common_kind = unify_additive(common_kind, kind)?;
                    args.push(arg);
                    self.skip_ws();
                    if self.consume_char(',') {
                        continue;
                    }
                    if self.consume_char(')') {
                        break;
                    }
                    return None;
                }
                if args.is_empty() {
                    return None;
                }
                let expr = if args.len() == 1 {
                    args.remove(0)
                } else if name == "min" {
                    CalcExpr::Min(args)
                } else {
                    CalcExpr::Max(args)
                };
                (expr, common_kind)
            }
            "clamp" => {
                let (lo, lo_kind) = self.parse_sum()?;
                self.skip_ws();
                if !self.consume_char(',') {
                    return None;
                }
                let (val, val_kind) = self.parse_sum()?;
                self.skip_ws();
                if !self.consume_char(',') {
                    return None;
                }
                let (hi, hi_kind) = self.parse_sum()?;
                self.skip_ws();
                if !self.consume_char(')') {
                    return None;
                }
                let kind = unify_additive(unify_additive(lo_kind, val_kind)?, hi_kind)?;
                (
                    CalcExpr::Clamp(Box::new(lo), Box::new(val), Box::new(hi)),
                    kind,
                )
            }
            _ => return None,
        };
        Some(result)
    }

    fn parse_sum(&mut self) -> Option<(CalcExpr, ValueKind)> {
        let (mut lhs, mut lhs_kind) = self.parse_product()?;
        loop {
            let saved = self.pos;
            self.skip_ws();
            let op = match self.rest().chars().next() {
                Some('+') => '+',
                Some('-') => '-',
                _ => {
                    self.pos = saved;
                    break;
                }
            };
            // CSS requires whitespace around binary `+` and `-`.
            let had_ws_before = self.pos > saved;
            self.pos += 1;
            let after_op = self.pos;
            self.skip_ws();
            let had_ws_after = self.pos > after_op;
            if !had_ws_before || !had_ws_after {
                return None;
            }
            let (rhs, rhs_kind) = self.parse_product()?;
            lhs_kind = unify_additive(lhs_kind, rhs_kind)?;
            lhs = if op == '+' {
                CalcExpr::Add(Box::new(lhs), Box::new(rhs))
            } else {
                CalcExpr::Sub(Box::new(lhs), Box::new(rhs))
            };
        }
        Some((lhs, lhs_kind))
    }

    fn parse_product(&mut self) -> Option<(CalcExpr, ValueKind)> {
        let (mut lhs, mut lhs_kind) = self.parse_primary()?;
        loop {
            let saved = self.pos;
            self.skip_ws();
            let op = match self.rest().chars().next() {
                Some('*') => '*',
                Some('/') => '/',
                _ => {
                    self.pos = saved;
                    break;
                }
            };
            self.pos += 1;
            let (rhs, rhs_kind) = self.parse_primary()?;
            match op {
                '*' => {
                    let kind = if lhs_kind.is_number() && rhs_kind.is_number() {
                        ValueKind::Number
                    } else if (lhs_kind.is_number() && rhs_kind.is_length())
                        || (lhs_kind.is_length() && rhs_kind.is_number())
                    {
                        ValueKind::Length
                    } else {
                        return None;
                    };
                    lhs = CalcExpr::Mul(Box::new(lhs), Box::new(rhs));
                    lhs_kind = kind;
                }
                '/' => {
                    if !rhs_kind.is_number() {
                        return None;
                    }
                    if let Some(divisor) = rhs.eval_const() {
                        if divisor == 0.0 {
                            return None;
                        }
                    }
                    lhs = CalcExpr::Div(Box::new(lhs), Box::new(rhs));
                }
                _ => unreachable!(),
            }
        }
        Some((lhs, lhs_kind))
    }

    fn parse_primary(&mut self) -> Option<(CalcExpr, ValueKind)> {
        self.skip_ws();
        let next = self.rest().chars().next()?;
        if next == '(' {
            self.pos += 1;
            let inner = self.parse_sum()?;
            self.skip_ws();
            if !self.consume_char(')') {
                return None;
            }
            return Some(inner);
        }
        if next.is_ascii_alphabetic() {
            return self.parse_function();
        }
        // Unary sign before a parenthesized group or function, e.g. `-(10px)`.
        if (next == '+' || next == '-')
            && self
                .rest()
                .get(1..)
                .and_then(|s| s.chars().next())
                .is_some_and(|c| c == '(' || c.is_ascii_alphabetic())
        {
            self.pos += 1;
            let (inner, kind) = self.parse_primary()?;
            return Some((
                if next == '-' {
                    CalcExpr::Neg(Box::new(inner))
                } else {
                    inner
                },
                kind,
            ));
        }
        self.parse_number_or_dimension()
    }

    fn parse_number_or_dimension(&mut self) -> Option<(CalcExpr, ValueKind)> {
        self.skip_ws();
        let start = self.pos;
        let bytes = self.src.as_bytes();
        let mut i = self.pos;
        if i < bytes.len() && (bytes[i] == b'+' || bytes[i] == b'-') {
            i += 1;
        }
        let mut saw_digit = false;
        while i < bytes.len() && bytes[i].is_ascii_digit() {
            saw_digit = true;
            i += 1;
        }
        if i < bytes.len() && bytes[i] == b'.' {
            i += 1;
            while i < bytes.len() && bytes[i].is_ascii_digit() {
                saw_digit = true;
                i += 1;
            }
        }
        if !saw_digit {
            return None;
        }
        if i < bytes.len() && (bytes[i] == b'e' || bytes[i] == b'E') {
            let exp_start = i;
            i += 1;
            if i < bytes.len() && (bytes[i] == b'+' || bytes[i] == b'-') {
                i += 1;
            }
            let mut exp_digits = false;
            while i < bytes.len() && bytes[i].is_ascii_digit() {
                exp_digits = true;
                i += 1;
            }
            if !exp_digits {
                i = exp_start;
            }
        }
        let number: f64 = self.src[start..i].parse().ok()?;
        if !number.is_finite() {
            return None;
        }
        self.pos = i;

        if self.consume_char('%') {
            return Some((CalcExpr::Percent(number), ValueKind::Length));
        }

        let unit_start = self.pos;
        while let Some(ch) = self.rest().chars().next() {
            if ch.is_ascii_alphabetic() {
                self.pos += ch.len_utf8();
            } else {
                break;
            }
        }
        if self.pos == unit_start {
            return if number == 0.0 {
                Some((CalcExpr::Number(0.0), ValueKind::Zero))
            } else {
                Some((CalcExpr::Number(number), ValueKind::Number))
            };
        }
        let unit = &self.src[unit_start..self.pos];
        if unit.eq_ignore_ascii_case("px") {
            return Some((CalcExpr::Px(round(number)), ValueKind::Length));
        }
        let parsed_unit = LengthUnit::parse(unit)?;
        if let Some(scale) = parsed_unit.px() {
            return Some((CalcExpr::Px(round(number * scale)), ValueKind::Length));
        }
        match parsed_unit {
            LengthUnit::Vw => Some((
                CalcExpr::Viewport(ViewportCalcUnit::Vw, number),
                ValueKind::Length,
            )),
            LengthUnit::Vh => Some((
                CalcExpr::Viewport(ViewportCalcUnit::Vh, number),
                ValueKind::Length,
            )),
            LengthUnit::Vmin => Some((
                CalcExpr::Viewport(ViewportCalcUnit::Vmin, number),
                ValueKind::Length,
            )),
            LengthUnit::Vmax => Some((
                CalcExpr::Viewport(ViewportCalcUnit::Vmax, number),
                ValueKind::Length,
            )),
            LengthUnit::Cqw => Some((
                CalcExpr::Container(ContainerCalcUnit::Cqw, number),
                ValueKind::Length,
            )),
            LengthUnit::Cqh => Some((
                CalcExpr::Container(ContainerCalcUnit::Cqh, number),
                ValueKind::Length,
            )),
            LengthUnit::Cqi => Some((
                CalcExpr::Container(ContainerCalcUnit::Cqi, number),
                ValueKind::Length,
            )),
            LengthUnit::Cqb => Some((
                CalcExpr::Container(ContainerCalcUnit::Cqb, number),
                ValueKind::Length,
            )),
            LengthUnit::Cqmin => Some((
                CalcExpr::Container(ContainerCalcUnit::Cqmin, number),
                ValueKind::Length,
            )),
            LengthUnit::Cqmax => Some((
                CalcExpr::Container(ContainerCalcUnit::Cqmax, number),
                ValueKind::Length,
            )),
            _ => None,
        }
    }
}

fn unify_additive(a: ValueKind, b: ValueKind) -> Option<ValueKind> {
    match (a, b) {
        (ValueKind::Zero, other) | (other, ValueKind::Zero) => Some(other),
        (ValueKind::Length, ValueKind::Length) => Some(ValueKind::Length),
        (ValueKind::Number, ValueKind::Number) => Some(ValueKind::Number),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_viewport_calc_min_max_clamp() {
        let bindings = CalcBindings {
            viewport: Some("__hozoViewport"),
            ..Default::default()
        };
        assert_eq!(
            parse_calc_length("calc(100vw - 2rem)")
                .unwrap()
                .to_js(&bindings)
                .as_deref(),
            Some("__hozoViewport.width - 32")
        );
        assert_eq!(
            parse_calc_length("calc(5vh + 2rem)")
                .unwrap()
                .to_js(&bindings)
                .as_deref(),
            Some("__hozoViewport.height * 0.05 + 32")
        );
        assert_eq!(
            parse_calc_length("clamp(200px, 50vw, 400px)")
                .unwrap()
                .to_js(&bindings)
                .as_deref(),
            Some("Math.min(Math.max(__hozoViewport.width * 0.5, 200), 400)")
        );
        assert_eq!(
            parse_calc_length("min(100vw - 2rem, 48rem)")
                .unwrap()
                .to_js(&bindings)
                .as_deref(),
            Some("Math.min(__hozoViewport.width - 32, 768)")
        );
    }

    #[test]
    fn parses_percent_and_container_expressions() {
        let self_bindings = CalcBindings {
            percent: Some("__hozoSelf.width"),
            ..Default::default()
        };
        assert_eq!(
            parse_calc_length("calc(100% - 2rem)")
                .unwrap()
                .to_js(&self_bindings)
                .as_deref(),
            Some("__hozoSelf.width - 32")
        );
        assert_eq!(
            parse_calc_length("calc(50% - 8px)")
                .unwrap()
                .to_js(&self_bindings)
                .as_deref(),
            Some("__hozoSelf.width * 0.5 - 8")
        );
        assert_eq!(
            parse_calc_length("calc((100% - 2rem) / 2)")
                .unwrap()
                .to_js(&self_bindings)
                .as_deref(),
            Some("(__hozoSelf.width - 32) / 2")
        );

        let cq_bindings = CalcBindings {
            container: Some("__hozoCqs[\"\"]"),
            ..Default::default()
        };
        let cq = parse_calc_length("calc(100cqw - 2rem)").unwrap();
        assert!(cq.needs().container_width);
        assert!(!cq.needs().container_height);
        assert_eq!(
            cq.to_js(&cq_bindings).as_deref(),
            Some("__hozoCqs[\"\"].width - 32")
        );
    }

    #[test]
    fn rejects_invalid_dimensions_and_unresolvable_units() {
        for invalid in [
            "calc(5vh +)",
            "calc(5vh 2rem)",
            "calc(5vh + - + 2rem)",
            "calc(5vh - 2em)",
            "calc(10px * 10px)",
            "calc(100% / 10px)",
            "calc(100% / 0)",
            "calc(100% + 5)",
            "calc(var(--x) + 10px)",
            "calc(100dvh - 2rem)",
            "calc(2 + 3)",
            "10px",
        ] {
            assert_eq!(parse_calc_length(invalid), None, "{invalid}");
        }
    }

    #[test]
    fn splits_top_level_grid_tracks() {
        assert_eq!(
            split_top_level_tracks("calc(100% - 2rem) 1fr minmax(120px, 2fr)"),
            vec!["calc(100% - 2rem)", "1fr", "minmax(120px, 2fr)"]
        );
    }
}
