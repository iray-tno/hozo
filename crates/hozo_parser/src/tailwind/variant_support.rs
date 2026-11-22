//! Whether a token keeps a variant Hozo does not read, and what it still writes.

use super::expand::expand_class;
use super::variant::parse_variant_prefix;

use hozo_ir::StyleProperty;

/// Whether a class still holds a variant separator after every variant Hozo
/// knows has been stripped.
///
/// A top-level colon separates variants from their utility, so one left
/// over means the front of the token is a variant Hozo did not recognise.
/// The rest of the token is therefore not a utility name, and reading it as
/// one invents a value out of the variant's own text: `bg-nonsense:p-4`
/// became `background-color: var(--hozo-color-nonsense:p-4)` -- a custom
/// property whose name contains a colon, which is not a name at all.
///
/// Colons inside brackets are the arbitrary value's own (`bg-[url(a:b)]`),
/// and do not count. Nor do those inside v4's parenthesised shorthand,
/// where a colon is a type hint: `bg-(color:--brand)` (#1477).
///
/// Both callers need this and only one had it. The project-wide scan has
/// tested it since it was written, because a scan also sees CSS text such
/// as `border-bottom:12px` and would have resolved that to a border colour.
/// The `className` path sees the same shape whenever an author writes a
/// variant Hozo has not implemented, which is a far more ordinary thing to
/// do than to write a stylesheet inside a class attribute.
pub fn has_unstripped_variant(token: &str) -> bool {
    let (_, base) = parse_variant_prefix(token);
    let mut depth = 0usize;
    base.bytes().any(|byte| match byte {
        b'[' | b'(' => {
            depth += 1;
            false
        }
        b']' | b')' => {
            depth = depth.saturating_sub(1);
            false
        }
        b':' => depth == 0,
        _ => false,
    })
}

/// The name of the Tailwind variant in `token` that Hozo does not compile.
///
/// `None` for a class that was never Tailwind's. A project's own `my-card`
/// is not a gap in Hozo and saying so would be noise -- the whole value of
/// this is telling the two apart, which needs Tailwind's own list rather
/// than a set of prefixes somebody remembered.
///
/// Reads the prefix Hozo could not strip: `parse_variant_prefix` removes
/// the variants it implements, so whatever colon is left is the first one
/// it did not.
pub fn unsupported_variant_name(token: &str) -> Option<&str> {
    let (_, rest) = parse_variant_prefix(token);
    let (prefix, _) = rest.split_once(':')?;
    // An arbitrary variant (`[&:hover]:p-4`) is a different report -- it
    // is not a name Tailwind defines, and `is_arbitrary` covers it.
    if prefix.starts_with('[') {
        return None;
    }
    // A functional variant written with a bracketed argument is named by the
    // part in front of the bracket: `aria-[sort=ascending]:` is `aria`, which
    // Tailwind defines and Hozo implements only for the boolean states. Read
    // whole, it matched nothing in the variant list, so a class Tailwind
    // compiles was neither compiled nor reported here -- which is the one
    // outcome decision 003 rules out. The scan reaches this function with
    // those tokens intact now (#676), so it had to learn the spelling.
    let name = match prefix.split_once("-[") {
        Some((name, _)) => name,
        None => prefix,
    };
    crate::tailwind_variants::is_variant(name).then_some(name)
}

/// What a class Hozo carries would write, read past its variants, for a
/// carried class whose variant Tailwind defines (#1752).
///
/// Every variant Hozo does not compile still reaches the page through the
/// project's Tailwind, in `@layer utilities`, and a compiled rule is
/// unlayered, so wherever both match the compiled one wins. Comparing what
/// the two write is how that gets said. An `!important` utility is left
/// out: a layered important declaration beats an unlayered normal one.
pub fn carried_writes(token: &str) -> Vec<StyleProperty> {
    if unsupported_variant_name(token).is_none() {
        return Vec::new();
    }
    let mut depth = 0usize;
    let mut base = token;
    for (index, byte) in token.bytes().enumerate() {
        match byte {
            b'[' | b'(' => depth += 1,
            b']' | b')' => depth = depth.saturating_sub(1),
            b':' if depth == 0 => base = &token[index + 1..],
            _ => {}
        }
    }
    if base.starts_with('!') || base.ends_with('!') {
        return Vec::new();
    }
    expand_class(base)
        .into_iter()
        .flat_map(|(_, properties)| properties)
        .collect()
}
