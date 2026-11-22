//! The `@property` registers that split utilities write into.

/// The `@property` rules [`register_split_axes`] relies on.
///
/// Non-inheriting, as Tailwind declares its own `--tw-translate-*`,
/// `--tw-scale-*` and function registers: an ancestor's axis must not reach
/// a child that writes another one. An initial value is what an unwritten
/// axis means; a function register has none, so `var(--r,)` reads nothing.
pub fn axis_register_css() -> &'static str {
    static CSS: std::sync::OnceLock<String> = std::sync::OnceLock::new();
    CSS.get_or_init(|| render_register_css(None))
}

/// Candidate sheets need the registers their actual readers use, not every
/// unrelated static family. Values/order still come from the single registry.
pub fn candidate_register_css(required: &std::collections::BTreeSet<&str>) -> String {
    render_register_css(Some(required))
}

pub(super) const GRADIENT_REGISTERS: &[(&str, Option<&str>)] = &[
    ("gradient-position", None),
    ("gradient-from", Some("#0000")),
    ("gradient-via", Some("#0000")),
    ("gradient-to", Some("#0000")),
    ("gradient-stops", None),
    ("gradient-via-stops", None),
    ("gradient-from-position", Some("0%")),
    ("gradient-via-position", Some("50%")),
    ("gradient-to-position", Some("100%")),
];

pub(super) const SHADOW_REGISTERS: &[(&str, Option<&str>)] = &[
    ("shadow", Some("0 0 #0000")),
    ("shadow-color", None),
    ("inset-shadow", Some("0 0 #0000")),
    ("inset-shadow-color", None),
    ("ring-shadow", Some("0 0 #0000")),
    ("ring-color", None),
    ("inset-ring-shadow", Some("0 0 #0000")),
    ("inset-ring-color", None),
    ("ring-inset", None),
    ("ring-offset-width", Some("0px")),
    ("ring-offset-color", Some("#fff")),
    ("ring-offset-shadow", Some("0 0 #0000")),
];

pub(super) fn render_register_css(required: Option<&std::collections::BTreeSet<&str>>) -> String {
    const REGISTERS: &[(&str, Option<&str>)] = &[
        ("translate-x", Some("0")),
        ("translate-y", Some("0")),
        ("translate-z", Some("0")),
        ("scale-x", Some("1")),
        ("scale-y", Some("1")),
        ("scale-z", Some("1")),
        ("rotate-x", None),
        ("rotate-y", None),
        ("rotate-z", None),
        ("skew-x", None),
        ("skew-y", None),
        ("blur", None),
        ("brightness", None),
        ("contrast", None),
        ("grayscale", None),
        ("hue-rotate", None),
        ("invert", None),
        ("saturate", None),
        ("sepia", None),
        ("backdrop-blur", None),
        ("backdrop-brightness", None),
        ("backdrop-contrast", None),
        ("backdrop-grayscale", None),
        ("backdrop-hue-rotate", None),
        ("backdrop-invert", None),
        ("backdrop-opacity", None),
        ("backdrop-saturate", None),
        ("backdrop-sepia", None),
    ];
    REGISTERS
        .iter()
        .chain(SHADOW_REGISTERS)
        .chain(GRADIENT_REGISTERS)
        .filter(|(name, _)| required.is_none_or(|required| required.contains(*name)))
        .map(|(name, initial)| {
            let initial = initial.map_or(String::new(), |value| {
                format!("  initial-value: {value};\n")
            });
            format!(
                "@property --hozo-{name} {{\n  syntax: \"*\";\n  inherits: false;\n{initial}}}\n\n"
            )
        })
        .collect()
}
