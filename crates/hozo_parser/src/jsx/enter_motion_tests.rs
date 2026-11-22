use hozo_ir::{DiagnosticCode, Severity};

fn hints(class_name: &str) -> bool {
    let source = format!(
        "import {{ View }} from '@hozo/core'\n\
             const el = <View className=\"{class_name}\">x</View>\n"
    );
    crate::parse_tsx(&source)
        .diagnostics
        .into_iter()
        .any(|d| d.code == DiagnosticCode::MotionIgnoresReducedMotion)
}

#[test]
fn an_element_that_enters_moving_is_hinted() {
    assert!(hints("transition starting:translate-y-4"));
    assert!(hints("transition starting:opacity-0 starting:scale-95"));
    assert!(hints("transition starting:rotate-12"));
    assert!(hints("transition md:starting:-translate-x-full"));
}

#[test]
fn an_element_that_leaves_moving_is_hinted_too() {
    assert!(hints("transition data-[state=closed]:translate-y-4"));
    assert!(hints(
        "transition data-[state=closed]:opacity-0 data-[state=closed]:scale-95"
    ));
    assert!(!hints("transition data-[state=closed]:opacity-0"));
    assert!(!hints(
        "transition motion-safe:data-[state=closed]:translate-y-4"
    ));
    // Some other attribute is not `Presence` leaving.
    assert!(!hints("transition data-[state=open]:translate-y-4"));
}

#[test]
fn a_fade_is_not_motion() {
    // WCAG 2.3.3 is about motion. A fade changes nothing's position.
    assert!(!hints("transition starting:opacity-0"));
    assert!(!hints("transition starting:bg-white"));
}

#[test]
fn a_word_about_reduced_motion_anywhere_on_the_element_answers_it() {
    assert!(!hints("transition motion-safe:starting:translate-y-4"));
    assert!(!hints(
        "transition starting:translate-y-4 motion-reduce:transition-none"
    ));
    assert!(!hints("motion-safe:transition starting:translate-y-4"));
}

#[test]
fn a_translate_that_is_not_an_entrance_is_not_this() {
    assert!(!hints("translate-y-4"));
    assert!(!hints("transition hover:scale-105"));
}

#[test]
fn it_is_a_hint() {
    let source = "import { View } from '@hozo/core'\n\
                      const el = <View className=\"starting:translate-y-4\">x</View>\n";
    let found = crate::parse_tsx(source)
        .diagnostics
        .into_iter()
        .find(|d| d.code == DiagnosticCode::MotionIgnoresReducedMotion)
        .expect("the diagnostic fires");
    assert_eq!(found.severity, Severity::Info);
    assert!(found.message.contains("motion-safe:starting:"));
}
