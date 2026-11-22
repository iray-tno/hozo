use hozo_ir::{Breakpoint, Condition, DiagnosticCode, StyleDeclaration};

fn conditions(class_name: &str) -> Vec<Condition> {
    let source = format!(
        "import {{ View }} from '@hozo/core'
const el = <View className=\"{class_name}\">x</View>
"
    );
    crate::parse_tsx(&source).roots[0]
        .node
        .style
        .iter()
        .map(|StyleDeclaration { condition, .. }| condition.clone())
        .collect()
}

#[test]
fn min_at_a_named_breakpoint_is_the_breakpoint() {
    // Tailwind emits identical CSS for `sm:` and `min-sm:`, so they
    // are one condition rather than two that agree -- which is what
    // lets React Native answer both from its cheap bucketed hook.
    assert_eq!(conditions("min-sm:flex"), conditions("sm:flex"));
    assert_eq!(
        conditions("min-md:flex"),
        vec![Condition::Responsive(Breakpoint::Md)]
    );
}

#[test]
fn max_at_a_named_breakpoint_is_that_width_from_the_other_side() {
    assert_eq!(
        conditions("max-md:flex"),
        vec![Condition::Width {
            at_least: false,
            value: "768px".to_string()
        }],
    );
    // `2xl` before `xl`, or the longer name would never be reached.
    assert_eq!(
        conditions("max-2xl:flex"),
        vec![Condition::Width {
            at_least: false,
            value: "1536px".to_string()
        }],
    );
}

#[test]
fn an_arbitrary_threshold_is_carried_as_written() {
    // Not parsed into a number here. Tailwind doesn't validate it
    // either, and a length is a length whatever unit it is in --
    // React Native is where it has to become a number, and that is
    // where failing to be one gets reported.
    assert_eq!(
        conditions("min-[500px]:flex"),
        vec![Condition::Width {
            at_least: true,
            value: "500px".to_string()
        }],
    );
    assert_eq!(
        conditions("max-[40rem]:flex"),
        vec![Condition::Width {
            at_least: false,
            value: "40rem".to_string()
        }],
    );
}

#[test]
fn the_sizing_utilities_that_share_the_prefix_are_untouched() {
    // `min-w-0` and `max-h-[50px]` start with the same four
    // characters. Neither has a top-level colon after the prefix,
    // which is what keeps them out.
    assert!(!conditions("min-w-0").is_empty());
    assert_eq!(conditions("min-w-0"), vec![Condition::Always]);
    assert_eq!(conditions("max-h-[50px]"), vec![Condition::Always]);
}

#[test]
fn a_width_is_a_query_and_therefore_relates_to_nothing() {
    // The same rule that refuses `group-dark:`: a media query is true
    // of the browser, so an ancestor cannot differ on it.
    let codes: Vec<DiagnosticCode> = {
        let source = "import { View } from '@hozo/core'
                          const el = <View className=\"group-max-md:flex\">x</View>
";
        crate::parse_tsx(source)
            .diagnostics
            .into_iter()
            .map(|d| d.code)
            .collect()
    };
    assert_eq!(codes, vec![DiagnosticCode::TailwindVariantNotSupported]);
}
