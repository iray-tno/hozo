use std::collections::BTreeSet;

use cssparser::{serialize_identifier, ParseError, Parser, ParserInput, Token};
use hozo_ir::Theme;

/// Deliver each referenced declaration and its dependency closure at the scope
/// where Tailwind defines it. Inlining the closure at the consuming element
/// would change ordinary aliases when a descendant overrides their dependency.
pub(crate) fn render(css: &str, theme: &Theme) -> String {
    let variables = theme.web_variables();
    if variables.is_empty() {
        return String::new();
    }
    let mut pending = references(css);
    let mut used = BTreeSet::new();
    while let Some(name) = pending.pop() {
        let Some(value) = variables.get(&name) else {
            continue;
        };
        if used.insert(name) {
            pending.extend(references(value));
        }
    }
    if used.is_empty() {
        return String::new();
    }
    let mut out = String::from("@layer theme {\n  :root, :host {\n");
    for name in used {
        let value = variables.get(&name).expect("collected theme declaration");
        out.push_str("    ");
        serialize_identifier(&name, &mut out).expect("String accepts CSS identifiers");
        out.push_str(&format!(": {value};\n"));
    }
    out.push_str("  }\n}\n\n");
    out
}

fn references(css: &str) -> Vec<String> {
    let mut input = ParserInput::new(css);
    let mut out = Vec::new();
    collect(&mut Parser::new(&mut input), &mut out);
    out
}

// CSS tokens distinguish references from quoted content and URLs, and decode
// escaped identifiers the same way as Tailwind's declaration keys.
fn collect<'i>(parser: &mut Parser<'i, '_>, out: &mut Vec<String>) {
    while let Ok(token) = parser.next().cloned() {
        match token {
            Token::Function(name) if name.eq_ignore_ascii_case("var") => {
                let _ = parser.parse_nested_block(|nested| {
                    let name = nested.expect_ident_cloned()?;
                    if name.starts_with("--") && name.len() > 2 {
                        if nested.is_exhausted() {
                            out.push(name.to_string());
                        } else if nested.try_parse(|p| p.expect_comma()).is_ok() {
                            out.push(name.to_string());
                            collect(nested, out);
                        }
                    }
                    Ok::<_, ParseError<'i, ()>>(())
                });
            }
            Token::Function(_)
            | Token::ParenthesisBlock
            | Token::SquareBracketBlock
            | Token::CurlyBracketBlock => {
                let _ = parser.parse_nested_block(|nested| {
                    collect(nested, out);
                    Ok::<_, ParseError<'i, ()>>(())
                });
            }
            _ => {}
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn closure_keeps_aliases_cycles_and_only_referenced_defaults() {
        let theme = Theme::default().with_web_variables(
            [
                ("--color-alias", "var(--color-base, var(--fallback))"),
                ("--color-base", "#ff0000"),
                ("--fallback", "var(--color-alias)"),
                ("--unused", "#00ff00"),
            ]
            .map(|(name, value)| (name.to_string(), value.to_string()))
            .into(),
        );
        let output = render(".x { color: var(--color-alias); }", &theme);
        assert!(output.contains("--color-alias: var(--color-base, var(--fallback));"));
        assert!(output.contains("--color-base: #ff0000;"));
        assert!(output.contains("--fallback: var(--color-alias);"));
        assert!(!output.contains("--unused"));
        assert_eq!(render(".x { color: red; }", &theme), "");
    }

    #[test]
    fn references_use_css_tokens_for_strings_comments_urls_and_escapes() {
        assert_eq!(
            references(
                r#".x { content: "var(--string)" 'var(--single)';
                /* var(--comment) */ color: var( /*name*/ --色 /*end*/, VAR(--fallback));
                custom: myvar(--suffix); escaped: \76 ar(--c\6flor);
                image: url(var--url); invalid: var(--a.b); }"#
            ),
            ["--色", "--fallback", "--color"]
        );
    }

    #[test]
    fn escaped_names_are_looked_up_and_serialized_as_css_identifiers() {
        let theme = Theme::default()
            .with_web_variables([("--color-dot.name".into(), "#ff0000".into())].into());
        let output = render(r#".x { color: var(--color-dot\.name); }"#, &theme);
        assert!(output.contains(r#"--color-dot\.name: #ff0000;"#));
    }
}
