//! Compile-time evaluation of CSS `@supports` feature queries (`supports-[...]:`)
//! against React Native's actual Yoga / StyleSheet capability.
//!
//! Because React Native has a fixed, known style engine at build time (unlike a
//! browser matrix unknown until runtime), feature queries over known CSS
//! properties fold statically to `true` or `false`:
//! - Supported capabilities (`supports-[display:flex]:`, `supports-[gap:1px]:`,
//!   `not-supports-[display:grid]:`, `supports-[not_(display:grid)]:`) apply
//!   cleanly with zero runtime overhead.
//! - Unsupported CSS features (`supports-[display:grid]:`,
//!   `supports-[position:sticky]:`) evaluate to `false` with a non-blocking
//!   warning so progressive-enhancement markup compiles cleanly on Native
//!   without silent drops.
//! - Unevaluable browser-only syntax (`selector(...)`, `font-tech(...)`, or
//!   unrecognized CSS property names) returns an error rather than guessing.

use hozo_ir::Condition;

/// True when `condition` mentions a `Condition::Supports(_)` query (directly,
/// negated, or inside a stacked `Condition::All`).
pub(crate) fn mentions_supports(condition: &Condition) -> bool {
    match condition {
        Condition::Supports(_) => true,
        Condition::Not(inner) => mentions_supports(inner),
        Condition::All(items) => items.iter().any(mentions_supports),
        _ => false,
    }
}

/// True when `condition`'s `@supports` predicate(s) statically evaluate to
/// `false` on React Native (so Web-only declarations guarded by them are dead
/// progressive-enhancement branches on Native).
pub(crate) fn statically_false(condition: &Condition) -> bool {
    match condition {
        Condition::Supports(query) => evaluate(query) == Ok(false),
        Condition::Not(inner) => match inner.as_ref() {
            Condition::Supports(query) => evaluate(query) == Ok(true),
            other => eval_pure_supports(other) == Some(true),
        },
        Condition::All(items) => items.iter().any(statically_false),
        _ => false,
    }
}

fn eval_pure_supports(condition: &Condition) -> Option<bool> {
    match condition {
        Condition::Supports(query) => evaluate(query).ok(),
        Condition::Not(inner) => eval_pure_supports(inner).map(|v| !v),
        Condition::All(items) => {
            let mut saw = false;
            for item in items {
                if let Some(val) = eval_pure_supports(item) {
                    saw = true;
                    if !val {
                        return Some(false);
                    }
                }
            }
            saw.then_some(true)
        }
        _ => None,
    }
}

/// Evaluates a normalized Tailwind `supports-[...]` query against React Native
/// capability. Returns `Err(reason)` for browser-only functions (`selector()`,
/// `font-tech()`, `font-format()`) or unrecognized CSS properties.
pub(crate) fn evaluate(query: &str) -> Result<bool, String> {
    let trimmed = query.trim();
    if trimmed.is_empty() {
        return Err("`supports-[]:` is empty and cannot be evaluated on React Native.".into());
    }
    let mut parser = Parser::new(trimmed);
    let result = parser.parse_or()?;
    parser.skip_ws();
    if !parser.is_eof() {
        return Err(format!(
            "`supports-[{trimmed}]:` has unexpected trailing tokens `{}` that cannot be evaluated on React Native. On Web the `@supports` query evaluates in the browser.",
            parser.rest()
        ));
    }
    Ok(result)
}

struct Parser<'a> {
    input: &'a str,
    pos: usize,
}

impl<'a> Parser<'a> {
    fn new(input: &'a str) -> Self {
        Self { input, pos: 0 }
    }

    fn rest(&self) -> &'a str {
        &self.input[self.pos..]
    }

    fn is_eof(&self) -> bool {
        self.pos >= self.input.len()
    }

    fn skip_ws(&mut self) {
        while let Some(ch) = self.rest().chars().next() {
            if ch.is_whitespace() {
                self.pos += ch.len_utf8();
            } else {
                break;
            }
        }
    }

    fn eat_keyword(&mut self, kw: &str) -> bool {
        self.skip_ws();
        let rest = self.rest();
        if rest.len() < kw.len() || !rest[..kw.len()].eq_ignore_ascii_case(kw) {
            return false;
        }
        let after = &rest[kw.len()..];
        if after
            .chars()
            .next()
            .is_some_and(|ch| ch.is_ascii_alphanumeric() || ch == '-' || ch == '_')
        {
            return false;
        }
        self.pos += kw.len();
        true
    }

    fn parse_or(&mut self) -> Result<bool, String> {
        let mut lhs = self.parse_and()?;
        while self.eat_keyword("or") {
            let rhs = self.parse_and()?;
            lhs = lhs || rhs;
        }
        Ok(lhs)
    }

    fn parse_and(&mut self) -> Result<bool, String> {
        let mut lhs = self.parse_not()?;
        while self.eat_keyword("and") {
            let rhs = self.parse_not()?;
            lhs = lhs && rhs;
        }
        Ok(lhs)
    }

    fn parse_not(&mut self) -> Result<bool, String> {
        if self.eat_keyword("not") {
            return self.parse_not().map(|v| !v);
        }
        self.parse_primary()
    }

    fn parse_primary(&mut self) -> Result<bool, String> {
        self.skip_ws();
        let rest = self.rest();
        if rest.starts_with('(') {
            let inner = self.take_balanced_parens()?;
            let inner_trimmed = inner.trim();
            // Decide whether `(...)` holds a nested boolean expression (`(a) and (b)`,
            // `not (a)`, `((a))`) or a single CSS declaration (`prop: value`).
            if starts_with_boolean_group(inner_trimmed) {
                let mut sub = Parser::new(inner_trimmed);
                let val = sub.parse_or()?;
                sub.skip_ws();
                if !sub.is_eof() {
                    return Err(format!(
                        "`supports-[{}]:` could not evaluate `{inner_trimmed}` on React Native.",
                        self.input
                    ));
                }
                return Ok(val);
            }
            return eval_atomic(inner_trimmed, self.input);
        }
        // Bare feature expression without outer parens, e.g. `display:grid`,
        // `gap`, `selector(:has(*))`. Read until top-level `and` / `or` or EOF.
        let start = self.pos;
        let mut depth = 0usize;
        while !self.is_eof() {
            if depth == 0 && self.peek_combinator() {
                break;
            }
            let ch = self.rest().chars().next().expect("not eof");
            match ch {
                '(' => depth += 1,
                ')' => {
                    if depth == 0 {
                        break;
                    }
                    depth -= 1;
                }
                _ => {}
            }
            self.pos += ch.len_utf8();
        }
        let atom = self.input[start..self.pos].trim();
        if atom.is_empty() {
            return Err(format!(
                "`supports-[{}]:` has an incomplete feature condition.",
                self.input
            ));
        }
        eval_atomic(atom, self.input)
    }

    fn peek_combinator(&self) -> bool {
        let rest = self.rest();
        for kw in ["and", "or"] {
            if rest.len() >= kw.len()
                && rest[..kw.len()].eq_ignore_ascii_case(kw)
                && self.pos > 0
                && self.input[..self.pos]
                    .chars()
                    .next_back()
                    .is_some_and(char::is_whitespace)
                && rest[kw.len()..]
                    .chars()
                    .next()
                    .is_some_and(|ch| ch.is_whitespace() || ch == '(')
            {
                return true;
            }
        }
        false
    }

    fn take_balanced_parens(&mut self) -> Result<&'a str, String> {
        let rest = self.rest();
        let mut depth = 0usize;
        let mut end = None;
        for (idx, ch) in rest.char_indices() {
            match ch {
                '(' => depth += 1,
                ')' => {
                    depth -= 1;
                    if depth == 0 {
                        end = Some(idx);
                        break;
                    }
                }
                _ => {}
            }
        }
        let Some(close_idx) = end else {
            return Err(format!(
                "`supports-[{}]:` has unbalanced parentheses.",
                self.input
            ));
        };
        let inner = &rest[1..close_idx];
        self.pos += close_idx + 1;
        Ok(inner)
    }
}

fn starts_with_boolean_group(text: &str) -> bool {
    if text.starts_with('(') {
        return true;
    }
    if text.len() >= 3
        && text[..3].eq_ignore_ascii_case("not")
        && text[3..]
            .chars()
            .next()
            .is_some_and(|ch| ch.is_whitespace() || ch == '(')
    {
        return true;
    }
    false
}

fn eval_atomic(atom: &str, full_query: &str) -> Result<bool, String> {
    let trimmed = atom.trim();
    let lower = trimmed.to_ascii_lowercase();
    if lower.starts_with("selector(")
        || lower.starts_with("font-tech(")
        || lower.starts_with("font-format(")
    {
        return Err(format!(
            "`supports-[{full_query}]:` uses `{}` which asks a browser-only CSS engine question and cannot be evaluated on React Native. On Web the `@supports` query evaluates in the browser.",
            trimmed.split('(').next().unwrap_or(trimmed)
        ));
    }

    let (prop_raw, val_raw) = match trimmed.split_once(':') {
        Some((p, v)) => (p.trim(), v.trim()),
        // Tailwind v4 shorthand `supports-[gap]:` -> `@supports (gap: var(--tw))`
        None => (trimmed, "var(--tw)"),
    };
    let prop = prop_raw.to_ascii_lowercase();
    let val = val_raw.to_ascii_lowercase();

    if prop.is_empty()
        || !prop
            .bytes()
            .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-')
    {
        return Err(format!(
            "`supports-[{full_query}]:` contains an unreadable CSS feature `{trimmed}`. On Web the `@supports` query evaluates in the browser."
        ));
    }

    // CSS custom properties do not exist in React Native's StyleSheet.
    if prop.starts_with("--") {
        return Ok(false);
    }

    if val.is_empty() {
        return Err(format!(
            "`supports-[{full_query}]:` is missing a value for `{prop}`."
        ));
    }

    // Values that require Web-only colour spaces, viewport units, sizing
    // keywords, or CSS functions never resolve natively in React Native.
    if has_web_only_value(&val) {
        return Ok(false);
    }

    let is_presence_probe = val == "var(--tw)";

    match prop.as_str() {
        "display" => Ok(
            is_presence_probe || matches!(val.as_str(), "flex" | "none" | "contents")
        ),
        "flex-direction" => Ok(is_presence_probe
            || matches!(
                val.as_str(),
                "row" | "row-reverse" | "column" | "column-reverse"
            )),
        "flex-wrap" => Ok(is_presence_probe
            || matches!(val.as_str(), "wrap" | "nowrap" | "wrap-reverse")),
        "justify-content" => Ok(is_presence_probe
            || matches!(
                val.as_str(),
                "flex-start"
                    | "flex-end"
                    | "center"
                    | "space-between"
                    | "space-around"
                    | "space-evenly"
            )),
        "align-items" => Ok(is_presence_probe
            || matches!(
                val.as_str(),
                "flex-start" | "flex-end" | "center" | "stretch" | "baseline"
            )),
        "align-self" => Ok(is_presence_probe
            || matches!(
                val.as_str(),
                "auto" | "flex-start" | "flex-end" | "center" | "stretch" | "baseline"
            )),
        "align-content" => Ok(is_presence_probe
            || matches!(
                val.as_str(),
                "flex-start"
                    | "flex-end"
                    | "center"
                    | "stretch"
                    | "space-between"
                    | "space-around"
                    | "space-evenly"
            )),
        "position" => Ok(is_presence_probe || matches!(val.as_str(), "relative" | "absolute" | "static")),
        "overflow" => Ok(is_presence_probe || matches!(val.as_str(), "visible" | "hidden" | "scroll")),
        "backdrop-filter" => Ok(is_presence_probe || val == "none" || val.starts_with("blur(")),
        "box-sizing" => Ok(is_presence_probe || matches!(val.as_str(), "border-box" | "content-box")),
        "object-fit" => Ok(is_presence_probe
            || matches!(
                val.as_str(),
                "cover" | "contain" | "fill" | "scale-down" | "none"
            )),
        "pointer-events" => Ok(is_presence_probe || matches!(val.as_str(), "auto" | "none" | "box-none" | "box-only")),
        "direction" => Ok(is_presence_probe || matches!(val.as_str(), "ltr" | "rtl" | "inherit")),
        "backface-visibility" => Ok(is_presence_probe || matches!(val.as_str(), "visible" | "hidden")),
        "isolation" => Ok(is_presence_probe || matches!(val.as_str(), "auto" | "isolate")),
        // Yoga / React Native ViewStyle + TextStyle properties.
        "gap"
        | "row-gap"
        | "column-gap"
        | "flex"
        | "flex-grow"
        | "flex-shrink"
        | "flex-basis"
        | "aspect-ratio"
        | "width"
        | "height"
        | "min-width"
        | "min-height"
        | "max-width"
        | "max-height"
        | "padding"
        | "padding-top"
        | "padding-right"
        | "padding-bottom"
        | "padding-left"
        | "padding-inline"
        | "padding-inline-start"
        | "padding-inline-end"
        | "padding-block"
        | "padding-block-start"
        | "padding-block-end"
        | "margin"
        | "margin-top"
        | "margin-right"
        | "margin-bottom"
        | "margin-left"
        | "margin-inline"
        | "margin-inline-start"
        | "margin-inline-end"
        | "margin-block"
        | "margin-block-start"
        | "margin-block-end"
        | "top"
        | "right"
        | "bottom"
        | "left"
        | "inset"
        | "inset-inline"
        | "inset-inline-start"
        | "inset-inline-end"
        | "inset-block"
        | "inset-block-start"
        | "inset-block-end"
        | "opacity"
        | "z-index"
        | "background-color"
        | "color"
        | "border-width"
        | "border-top-width"
        | "border-right-width"
        | "border-bottom-width"
        | "border-left-width"
        | "border-color"
        | "border-top-color"
        | "border-right-color"
        | "border-bottom-color"
        | "border-left-color"
        | "border-radius"
        | "border-top-left-radius"
        | "border-top-right-radius"
        | "border-bottom-right-radius"
        | "border-bottom-left-radius"
        | "border-style"
        | "outline-width"
        | "outline-color"
        | "outline-style"
        | "outline-offset"
        | "font-size"
        | "font-weight"
        | "font-family"
        | "font-style"
        | "font-variant"
        | "line-height"
        | "letter-spacing"
        | "text-align"
        | "text-transform"
        | "text-decoration-line"
        | "text-decoration-color"
        | "text-decoration-style"
        | "text-shadow"
        | "transform"
        | "transform-origin"
        | "box-shadow"
        | "filter"
        | "mix-blend-mode"
        | "user-select" => Ok(true),
        // Known Web-only CSS properties React Native has no native support for.
        "grid"
        | "grid-template"
        | "grid-template-columns"
        | "grid-template-rows"
        | "grid-template-areas"
        | "grid-auto-columns"
        | "grid-auto-rows"
        | "grid-auto-flow"
        | "grid-column"
        | "grid-column-start"
        | "grid-column-end"
        | "grid-row"
        | "grid-row-start"
        | "grid-row-end"
        | "grid-area"
        | "place-items"
        | "place-content"
        | "place-self"
        | "container"
        | "container-type"
        | "container-name"
        | "scroll-snap-type"
        | "scroll-snap-align"
        | "scroll-snap-stop"
        | "scroll-behavior"
        | "overscroll-behavior"
        | "overscroll-behavior-x"
        | "overscroll-behavior-y"
        | "touch-action"
        | "clip-path"
        | "mask"
        | "mask-image"
        | "mask-size"
        | "mask-position"
        | "mask-repeat"
        | "mask-clip"
        | "mask-origin"
        | "mask-composite"
        | "float"
        | "clear"
        | "columns"
        | "column-count"
        | "column-width"
        | "break-inside"
        | "break-before"
        | "break-after"
        | "white-space"
        | "word-break"
        | "overflow-wrap"
        | "overflow-x"
        | "overflow-y"
        | "hyphens"
        | "writing-mode"
        | "text-wrap"
        | "text-indent"
        | "text-underline-offset"
        | "text-decoration-thickness"
        | "accent-color"
        | "appearance"
        | "content-visibility"
        | "contain"
        | "will-change"
        | "animation-timeline"
        | "animation-range"
        | "view-transition-name"
        | "anchor-name"
        | "position-anchor"
        | "field-sizing"
        | "interpolate-size"
        | "scrollbar-width"
        | "scrollbar-gutter"
        | "scrollbar-color"
        | "background-blend-mode"
        | "background-clip"
        | "background-attachment"
        | "resize"
        | "order" => Ok(false),
        _ => Err(format!(
            "`supports-[{full_query}]:` asks about CSS property `{prop}`, whose React Native support is unknown at build time. On Web the `@supports` query evaluates in the browser."
        )),
    }
}

fn has_web_only_value(val: &str) -> bool {
    const WEB_ONLY_TOKENS: &[&str] = &[
        "subgrid",
        "masonry",
        "oklch(",
        "oklab(",
        "lch(",
        "lab(",
        "color-mix(",
        "light-dark(",
        "anchor(",
        "anchor-size(",
        "fit-content",
        "min-content",
        "max-content",
        "stretch",
        "dvh",
        "dvw",
        "svh",
        "svw",
        "lvh",
        "lvw",
        "cqi",
        "cqb",
    ];
    // Allow `stretch` where it IS a valid Yoga align value (handled per-property above).
    WEB_ONLY_TOKENS
        .iter()
        .any(|needle| *needle != "stretch" && val.contains(needle))
}
