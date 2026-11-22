use super::escape_class_selector;

#[test]
fn selector_syntax_is_escaped_with_a_backslash() {
    assert_eq!(
        escape_class_selector("hover:bg-blue-500"),
        "hover\\:bg-blue-500"
    );
    assert_eq!(escape_class_selector("w-1/2"), "w-1\\/2");
    assert_eq!(escape_class_selector("p-1.5"), "p-1\\.5");
    assert_eq!(escape_class_selector("flex"), "flex");
}

#[test]
fn an_arbitrary_value_escapes_every_character_it_holds() {
    // The case that broke the build once the scanner stopped losing these
    // (#676): a quote is not selector syntax in any list somebody writes
    // from memory, and it ends a CSS string when it arrives unescaped.
    // lightningcss refused the whole stylesheet with
    // `Unexpected token String("")`.
    assert_eq!(
        escape_class_selector("before:content-['']"),
        "before\\:content-\\[\\'\\'\\]"
    );
    assert_eq!(
        escape_class_selector("data-[hozo-state=checked]:bg-red-500"),
        "data-\\[hozo-state\\=checked\\]\\:bg-red-500"
    );
    assert_eq!(escape_class_selector("text-[#fff]"), "text-\\[\\#fff\\]");
    assert_eq!(
        escape_class_selector("bg-[url(/a.png)]"),
        "bg-\\[url\\(\\/a\\.png\\)\\]"
    );
    assert_eq!(escape_class_selector("[&_p]:mt-4"), "\\[\\&_p\\]\\:mt-4");
}

#[test]
fn a_leading_digit_becomes_a_code_point() {
    // CSS forbids an identifier beginning with a digit, and a
    // backslash does not fix it: the escape is the code point in hex
    // with a space to end it. `.2xl\:block` is a selector no browser
    // matches, and lightningcss refuses to minify it -- which is how
    // this was found, as a build failure in the Storybook example the
    // first time a `2xl:` class reached the candidate stylesheet.
    assert_eq!(escape_class_selector("2xl:block"), "\\32 xl\\:block");
    assert_eq!(
        escape_class_selector("2xl:grid-cols-4"),
        "\\32 xl\\:grid-cols-4"
    );
    // Only when it leads. Every other digit is an ordinary character,
    // which is most of Tailwind's scale.
    assert_eq!(escape_class_selector("gap-2"), "gap-2");
    assert_eq!(
        escape_class_selector("hover:2xl:block"),
        "hover\\:2xl\\:block"
    );
}

#[test]
fn every_breakpoint_produces_a_selector_css_accepts() {
    // The rule rather than the one case: a name may start with a digit
    // and nothing else may, so this is the whole condition.
    for name in ["sm:flex", "md:flex", "lg:flex", "xl:flex", "2xl:flex"] {
        let escaped = escape_class_selector(name);
        let first = escaped.chars().next().unwrap();
        assert!(
            first.is_alphabetic() || first == '_' || first == '\\',
            "{name} escaped to {escaped}, which cannot begin a CSS identifier"
        );
    }
}
