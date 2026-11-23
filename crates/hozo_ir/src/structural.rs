//! Structural pseudo-classes (`first:`, `odd:`, `nth-[…]:`) and when a
//! position matches one.

/// Where an element sits among its siblings.
///
/// The distinctions are the DOM's, kept rather than flattened because they
/// are not interchangeable. `:nth-child` counts every sibling; `:nth-of-type`
/// counts only siblings with the same tag, which in a Hozo tree is the tag
/// Hozo chose. That dependency is real and is why `-of-type` was nearly
/// refused: see decision 003.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Structural {
    /// `only:` and `only-of-type:`.
    Only { of_type: bool },
    /// `first-of-type:` and `last-of-type:`. The plain `first:`/`last:` are
    /// `Condition::FirstChild`/`LastChild`.
    Edge { last: bool },
    /// `:empty` -- no children at all, including text and whitespace.
    ///
    /// Stricter than it looks, and the strictness is the DOM's: an element
    /// containing a single space does not match. Nothing here softens that,
    /// because a rule that matched more than `:empty` would be a different
    /// rule wearing its name.
    Empty,
    /// `odd:`, `even:`, `nth-3:`, `nth-[2n+1]:`, and the same four with
    /// `-last-` or `-of-type`.
    ///
    /// The formula is carried as written rather than parsed into a
    /// coefficient pair. `2n+1` and `odd` select the same elements and are
    /// not the same text, and the text is what Tailwind emits -- parsing it
    /// would mean choosing a spelling to emit and then defending the choice
    /// against Tailwind's.
    Nth {
        of_type: bool,
        from_end: bool,
        formula: String,
    },
}

impl Structural {
    /// The pseudo-class, written out.
    pub fn selector(&self) -> String {
        match self {
            Structural::Only { of_type: false } => ":only-child".to_string(),
            Structural::Only { of_type: true } => ":only-of-type".to_string(),
            Structural::Edge { last: false } => ":first-of-type".to_string(),
            Structural::Edge { last: true } => ":last-of-type".to_string(),
            Structural::Empty => ":empty".to_string(),
            Structural::Nth {
                of_type,
                from_end,
                formula,
            } => {
                let name = match (of_type, from_end) {
                    (false, false) => "nth-child",
                    (false, true) => "nth-last-child",
                    (true, false) => "nth-of-type",
                    (true, true) => "nth-last-of-type",
                };
                format!(":{name}({formula})")
            }
        }
    }

    /// Whether this selects the element at 1-based position `ordinal` out
    /// of `count` element siblings.
    ///
    /// `None` where the answer depends on something other than position --
    /// the `-of-type` spellings, which need to know which siblings share
    /// this element's tag, and a formula that isn't An+B.
    ///
    /// This is what lets React Native have the whole family for free.
    /// Native has no selector engine, but the compiler is looking at the
    /// JSX tree and a sibling position is a fact about that tree, so the
    /// question `:nth-child()` asks at runtime on Web is one that can be
    /// answered at build time here -- the same trade `first:` and `last:`
    /// already made.
    pub fn matches_position(&self, ordinal: usize, count: usize) -> Option<bool> {
        match self {
            // Which siblings share this element's tag is not a question
            // React Native can be asked: there are no tags, only
            // components, and the tag a Hozo element would have had is a
            // Web lowering decision.
            Structural::Only { of_type: true }
            | Structural::Edge { .. }
            | Structural::Nth { of_type: true, .. } => None,
            Structural::Only { of_type: false } => Some(count == 1),
            // Asked of the element's own children, not its siblings.
            Structural::Empty => None,
            Structural::Nth {
                of_type: false,
                from_end,
                formula,
            } => {
                let position = if *from_end {
                    count + 1 - ordinal
                } else {
                    ordinal
                };
                nth_matches(formula, position)
            }
        }
    }

    /// Whether this counts only siblings that share the element's tag: the
    /// `-of-type` spellings, which React Native cannot answer at all
    /// (decision 003), wherever the element sits.
    pub fn counts_by_type(&self) -> bool {
        matches!(
            self,
            Structural::Only { of_type: true }
                | Structural::Edge { .. }
                | Structural::Nth { of_type: true, .. }
        )
    }

    /// How the author spelled it, for a message that has to name it back.
    pub fn variant_name(&self) -> String {
        match self {
            Structural::Only { of_type: false } => "only".to_string(),
            Structural::Only { of_type: true } => "only-of-type".to_string(),
            Structural::Edge { last: false } => "first-of-type".to_string(),
            Structural::Edge { last: true } => "last-of-type".to_string(),
            Structural::Empty => "empty".to_string(),
            Structural::Nth {
                of_type,
                from_end,
                formula,
            } => {
                let stem = match (of_type, from_end) {
                    (false, false) => "nth",
                    (false, true) => "nth-last",
                    (true, false) => "nth-of-type",
                    (true, true) => "nth-last-of-type",
                };
                // `odd:` and `even:` are Tailwind's own names for two
                // formulas, not `nth-odd:`.
                match formula.as_str() {
                    "odd" | "even" if !of_type && !from_end => formula.clone(),
                    _ => format!("{stem}-{formula}"),
                }
            }
        }
    }
}

/// Whether an An+B formula selects the element at 1-based `position`.
///
/// `None` for anything that isn't An+B. The grammar has more in it than
/// this -- `of S` takes a whole selector list -- and a formula this cannot
/// read is reported rather than guessed at, because guessing here means
/// styling the wrong row.
pub(super) fn nth_matches(formula: &str, position: usize) -> Option<bool> {
    let text: String = formula.chars().filter(|c| !c.is_whitespace()).collect();
    let (a, b) = match text.as_str() {
        "odd" => (2i64, 1i64),
        "even" => (2, 0),
        _ => parse_an_plus_b(&text)?,
    };
    let position = position as i64;
    // `an+b` selects `position` when some whole `n >= 0` produces it.
    Some(match a {
        0 => position == b,
        a if a > 0 => position >= b && (position - b) % a == 0,
        a => position <= b && (b - position) % -a == 0,
    })
}

/// `2n+1`, `-n+3`, `n`, `5`.
pub(super) fn parse_an_plus_b(text: &str) -> Option<(i64, i64)> {
    let Some((before_n, after_n)) = text.split_once('n') else {
        // No `n` at all: a fixed position.
        return Some((0, text.parse().ok()?));
    };
    let a = match before_n {
        "" | "+" => 1,
        "-" => -1,
        other => other.parse().ok()?,
    };
    let b = match after_n {
        "" => 0,
        other => other.strip_prefix('+').unwrap_or(other).parse().ok()?,
    };
    Some((a, b))
}

#[cfg(test)]
mod structural_tests {
    use super::*;

    /// Which of `count` siblings a variant selects.
    fn selected(structural: &Structural, count: usize) -> Vec<usize> {
        (1..=count)
            .filter(|ordinal| structural.matches_position(*ordinal, count) == Some(true))
            .collect()
    }

    fn nth(formula: &str) -> Structural {
        Structural::Nth {
            of_type: false,
            from_end: false,
            formula: formula.to_string(),
        }
    }

    #[test]
    fn the_named_formulas_are_the_ones_they_name() {
        assert_eq!(selected(&nth("odd"), 5), vec![1, 3, 5]);
        assert_eq!(selected(&nth("even"), 5), vec![2, 4]);
        // `2n+1` and `odd` select the same elements. They are still two
        // different strings, which is why the formula is carried as
        // written rather than parsed into a pair and re-spelled.
        assert_eq!(selected(&nth("2n+1"), 5), selected(&nth("odd"), 5));
    }

    #[test]
    fn an_plus_b_is_read_the_way_css_reads_it() {
        // `n` starts at zero and counts up, so `b` is a floor and not an
        // offset -- `3n+2` selects the 2nd, not the 5th onwards only.
        assert_eq!(selected(&nth("3n+2"), 9), vec![2, 5, 8]);
        assert_eq!(selected(&nth("n"), 3), vec![1, 2, 3]);
        assert_eq!(selected(&nth("3"), 5), vec![3]);
        // A negative coefficient counts down instead, which is how CSS
        // spells "the first three".
        assert_eq!(selected(&nth("-n+3"), 6), vec![1, 2, 3]);
    }

    #[test]
    fn counting_from_the_end_is_the_same_formula_on_a_flipped_position() {
        let last_two = Structural::Nth {
            of_type: false,
            from_end: true,
            formula: "-n+2".to_string(),
        };
        assert_eq!(selected(&last_two, 5), vec![4, 5]);
    }

    #[test]
    fn a_formula_that_is_not_an_plus_b_is_not_guessed_at() {
        // The grammar has more in it than An+B -- `odd of .visible` is
        // legal CSS. Answering "no match" for one of those would style the
        // wrong rows silently, so it answers "I don't know" and Native
        // reports it.
        assert_eq!(nth("odd of .visible").matches_position(1, 3), None);
        assert_eq!(nth("").matches_position(1, 3), None);
        assert_eq!(nth("2x+1").matches_position(1, 3), None);
    }

    #[test]
    fn of_type_is_unanswerable_without_element_types() {
        // Not a gap to fill later: React Native has no tags, and the tag a
        // Hozo element would have had on Web is a lowering decision that
        // was never made here.
        assert_eq!(
            Structural::Edge { last: false }.matches_position(1, 3),
            None
        );
        assert_eq!(
            Structural::Only { of_type: true }.matches_position(1, 1),
            None
        );
        assert_eq!(
            Structural::Nth {
                of_type: true,
                from_end: false,
                formula: "1".to_string()
            }
            .matches_position(1, 3),
            None,
        );
        // The plain spelling of the same position is answerable.
        assert_eq!(
            Structural::Only { of_type: false }.matches_position(1, 1),
            Some(true)
        );
        assert_eq!(
            Structural::Only { of_type: false }.matches_position(1, 2),
            Some(false)
        );
    }

    #[test]
    fn every_variant_names_itself_the_way_tailwind_spells_it() {
        // The name goes into a diagnostic, so it has to be the string the
        // author typed rather than the selector it became.
        assert_eq!(nth("odd").variant_name(), "odd");
        assert_eq!(nth("3").variant_name(), "nth-3");
        assert_eq!(nth("2n+1").variant_name(), "nth-2n+1");
        assert_eq!(Structural::Empty.variant_name(), "empty");
        assert_eq!(
            Structural::Edge { last: true }.variant_name(),
            "last-of-type"
        );
    }

    #[test]
    fn the_selectors_are_the_ones_tailwind_emits() {
        assert_eq!(nth("odd").selector(), ":nth-child(odd)");
        assert_eq!(
            Structural::Only { of_type: false }.selector(),
            ":only-child"
        );
        assert_eq!(
            Structural::Only { of_type: true }.selector(),
            ":only-of-type"
        );
        assert_eq!(Structural::Empty.selector(), ":empty");
        assert_eq!(
            Structural::Nth {
                of_type: true,
                from_end: true,
                formula: "3".to_string()
            }
            .selector(),
            ":nth-last-of-type(3)",
        );
    }
}
