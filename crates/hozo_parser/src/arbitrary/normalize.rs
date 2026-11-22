//! An arbitrary value as Tailwind writes it into CSS: underscores to spaces,
//! and spaces around math operators.

/// The functions inside which Tailwind spaces out math operators, copied
/// from its own list. `rem` is a math function here (the remainder
/// operation), not the length unit -- the two are told apart by the
/// following `(`.
pub(super) const MATH_FUNCTIONS: &[&str] = &[
    "calc", "min", "max", "clamp", "mod", "rem", "sin", "cos", "tan", "asin", "acos", "atan",
    "atan2", "pow", "sqrt", "hypot", "log", "exp", "round",
];

/// Turns the text between the brackets into the CSS it stands for.
///
/// Two transformations, in this order because Tailwind does them in this
/// order: underscores become spaces, then math operators get breathing
/// room. Doing it the other way round would leave `calc(100%_-_2rem)`
/// with the operator still glued to an underscore.
pub fn normalize(raw: &str) -> String {
    space_math_operators(&substitute_underscores(raw))
}

/// `_` means a space, because a CSS class can't contain one.
///
/// Two exceptions, both Tailwind's. A backslash escapes an underscore that
/// was meant literally, and `url(...)` is left entirely alone -- an
/// underscore is an ordinary character in a path, and rewriting it would
/// turn a working image reference into a 404 that looks like a typo.
pub(super) fn substitute_underscores(raw: &str) -> String {
    let bytes = raw.as_bytes();
    let mut out = String::with_capacity(raw.len());
    let mut index = 0;
    while index < bytes.len() {
        if bytes[index] == b'\\' && index + 1 < bytes.len() {
            // The escape is consumed with what it escapes: `\_` is an
            // underscore, and the backslash itself doesn't reach the CSS.
            out.push(bytes[index + 1] as char);
            index += 2;
            continue;
        }
        if raw[index..].starts_with("url(") {
            if let Some(offset) = raw[index..].find(')') {
                out.push_str(&raw[index..index + offset + 1]);
                index += offset + 1;
                continue;
            }
            // Unbalanced, so there's no region to protect. Falling
            // through treats it as ordinary text rather than
            // swallowing the rest of the value.
        }
        let ch = raw[index..].chars().next().unwrap_or('\0');
        out.push(if ch == '_' { ' ' } else { ch });
        index += ch.len_utf8();
    }
    out
}

/// Transcribed from Tailwind's `addWhitespaceAroundMathOperators`.
///
/// Transcribed rather than reimplemented, and that is the point: the rules
/// are not derivable from CSS. `calc(100%-2rem)` is subtraction and
/// `w-[-1px]` is a negative number; `1e-3` is neither. Commas gain a space
/// inside `min()` and keep none inside `repeat()`. Every one of those is a
/// choice Tailwind made, and matching it is the whole requirement -- the
/// conformance harness compares emitted CSS byte for byte.
pub(super) fn space_math_operators(input: &str) -> String {
    if !MATH_FUNCTIONS.iter().any(|name| input.contains(name)) {
        return input.to_string();
    }

    let bytes = input.as_bytes();
    let mut out: Vec<u8> = Vec::with_capacity(bytes.len());
    // Innermost first: whether each open paren belongs to a math function.
    let mut math_stack: Vec<bool> = Vec::new();
    // The run of digits/unit characters currently being read, and where the
    // previous one ended. The latter is what lets `2rem-4px` be read as a
    // subtraction: the `-` sits immediately after a completed number.
    let mut run_start: Option<usize> = None;
    let mut previous_run_end: Option<usize> = None;

    let mut index = 0;
    while index < bytes.len() {
        let byte = bytes[index];
        let in_math = *math_stack.first().unwrap_or(&false);

        let continues_run = byte.is_ascii_digit()
            || (run_start.is_some() && (byte == b'%' || byte.is_ascii_alphabetic()));
        if continues_run {
            run_start = Some(index);
        } else {
            previous_run_end = run_start;
            run_start = None;
        }

        if byte == b'(' {
            out.push(byte);
            // The function name is the run of letters and digits directly
            // before the paren.
            let mut start = index;
            for probe in (0..index).rev() {
                let c = bytes[probe];
                if c.is_ascii_digit() || c.is_ascii_lowercase() {
                    start = probe;
                } else {
                    break;
                }
            }
            let name = &input[start..index];
            // A bare `(` inside a math function is still math -- CSS lets
            // you group with parentheses there.
            let is_math = MATH_FUNCTIONS.contains(&name) || (in_math && name.is_empty());
            math_stack.insert(0, is_math);
            index += 1;
            continue;
        }

        if byte == b')' {
            out.push(byte);
            if !math_stack.is_empty() {
                math_stack.remove(0);
            }
            index += 1;
            continue;
        }

        if byte == b',' && in_math {
            out.extend_from_slice(b", ");
            index += 1;
            continue;
        }

        if byte == b' ' && in_math && out.last() == Some(&b' ') {
            index += 1;
            continue;
        }

        if matches!(byte, b'+' | b'*' | b'/' | b'-') && in_math {
            let trimmed = trim_end(&out);
            let last = trimmed.last().copied();
            let second_last = if trimmed.len() >= 2 {
                Some(trimmed[trimmed.len() - 2])
            } else {
                None
            };
            let next = bytes.get(index + 1).copied();

            let after_exponent = matches!(last, Some(b'e') | Some(b'E'))
                && second_last.is_some_and(|c| c.is_ascii_digit());
            let after_operator = matches!(last, Some(b'+') | Some(b'*') | Some(b'/') | Some(b'-'));
            let after_open = matches!(last, Some(b'(') | Some(b','));

            if after_exponent || after_operator || after_open {
                // All three mean this isn't a binary operator: it's an
                // exponent's sign, a doubled operator, or the sign of the
                // first term.
                out.push(byte);
            } else if index > 0 && bytes[index - 1] == b' ' {
                out.push(byte);
                out.push(b' ');
            } else if last.is_some_and(|c| c.is_ascii_digit())
                || next.is_some_and(|c| c.is_ascii_digit())
                || last == Some(b')')
                || matches!(
                    next,
                    Some(b'(') | Some(b'+') | Some(b'*') | Some(b'/') | Some(b'-')
                )
                || previous_run_end.is_some_and(|end| end + 1 == index)
            {
                out.push(b' ');
                out.push(byte);
                out.push(b' ');
            } else {
                out.push(byte);
            }
            index += 1;
            continue;
        }

        out.push(byte);
        index += 1;
    }

    String::from_utf8(out).unwrap_or_else(|_| input.to_string())
}

pub(super) fn trim_end(bytes: &[u8]) -> &[u8] {
    let mut end = bytes.len();
    while end > 0 && bytes[end - 1] == b' ' {
        end -= 1;
    }
    &bytes[..end]
}

// ---------------------------------------------------------------------------
// Reading a normalized value
// ---------------------------------------------------------------------------

/// A length, where the value is one.
///
/// `32px` becomes `Px` rather than `Unit(32, Px)` -- there is no pixel
/// variant, because a pixel is what every other length resolves *to*.
/// Unitless zero is a length too, which CSS allows and RN needs.
/// Whether the value is one of CSS's math functions.
///
/// Named here because three questions depend on it -- `is_color`,
/// `is_line_width` and `is_length_percentage` all reduce to "does
/// `parse_length` accept this?" -- and all three used to get the same wrong
/// answer for the same reason. Tailwind resolves a math function to the
/// *size* side of every slot that has one, and to the colour side only
/// where there is no size to resolve to; `var()` goes the other way,
/// because nothing about it says which type it holds.
///
/// The list is CSS Values 4's math functions. `attr()` and `env()` are
/// deliberately absent: neither is arithmetic, and both can hold a colour.
pub(super) fn is_math(value: &str) -> bool {
    let Some((function, _)) = value.split_once('(') else {
        return false;
    };
    matches!(
        function.to_ascii_lowercase().as_str(),
        "calc" | "min" | "max" | "clamp" | "round" | "mod" | "rem" | "abs" | "sign"
    )
}
