//! Indentation, divider defaults and class selector escaping.

use hozo_ir::StyleProperty;

/// The `solid` a divider width implies, which Tailwind reads from
/// `--tw-border-style`: it applies only where no written style does, the
/// divider's own (`divide-dashed`, also at zero specificity) or the child's.
/// So it goes in the base layer, which every unlayered rule beats whatever
/// its order or condition.
pub(super) fn divider_default_styles(props: &[&&StyleProperty]) -> String {
    let mut body = String::new();
    for prop in props {
        let names: &[&str] = match ***prop {
            StyleProperty::DivideX(_) => &["border-inline-style"],
            StyleProperty::DivideY(_) => &["border-top-style", "border-bottom-style"],
            _ => continue,
        };
        for name in names {
            body.push_str(&format!("    {name}: solid;\n"));
        }
    }
    body
}

/// Two spaces in front of every non-empty line. A CSS string cannot hold a
/// raw newline, so no line break here is inside a value.
pub(super) fn indent_block(text: &str) -> String {
    text.lines()
        .map(|line| {
            if line.is_empty() {
                String::new()
            } else {
                format!("  {line}")
            }
        })
        .collect::<Vec<_>>()
        .join("\n")
}

/// Escapes a class name for use in a CSS selector. Tailwind class names
/// contain characters that are selector syntax -- `hover:bg-blue-500`,
/// `w-1/2`, `p-1.5` -- and must be backslash-escaped to be matched
/// literally.
///
/// A leading digit is the case a backslash cannot carry. CSS forbids an
/// identifier that begins with one, and the escape is the code point in
/// hex followed by a space that terminates it: `2xl:block` is
/// `.\32 xl\:block`. Writing `.2xl\:block` produces a selector no
/// browser matches and that a minifier rejects outright -- which is how
/// this was found, as a build failure in the Storybook example the first
/// time a `2xl:` class reached the candidate stylesheet.
///
/// Only the candidate stylesheet spells a Tailwind name; a class the
/// compiler reads becomes `hozo-…` and never touches this. That is why
/// the conformance audit's variant section, which compiles
/// `<View className="2xl:block" />` and reads back `.hozo-0`, reported a
/// match for every one of them.
pub fn escape_class_selector(class_name: &str) -> String {
    let mut out = String::with_capacity(class_name.len());
    for (index, c) in class_name.chars().enumerate() {
        if index == 0 && c.is_ascii_digit() {
            out.push_str(&format!("\\{:x} ", c as u32));
            continue;
        }
        // Everything that is not an identifier character, rather than a list
        // of the punctuation somebody remembered. The list form was wrong the
        // moment the scanner learned to keep a quote (#676): a candidate
        // `before:content-['']` came out as `.before\:content-\[''\]::before`,
        // which is not a selector -- lightningcss refused the whole stylesheet
        // with `Unexpected token String("")` and the build stopped.
        //
        // A minifier rejecting it is the good case. The bad one is a browser
        // parsing `.a\[b='c'\]` as far as it can and matching nothing, which
        // is what every unescaped character in the old list would have done
        // quietly. CSS says an identifier is `[A-Za-z0-9_-]` plus non-ASCII,
        // so that is the test, and non-ASCII is left alone because CSS allows
        // it unescaped and Tailwind emits it that way.
        if !(c.is_ascii_alphanumeric() || c == '-' || c == '_' || !c.is_ascii()) {
            out.push('\\');
        }
        out.push(c);
    }
    out
}
