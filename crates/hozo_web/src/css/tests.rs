use hozo_ir::{
    Color, Condition, ConditionExpr, Dimension, ExprRef, FilterFunction, GradientKind,
    GradientStop, Length, SourceSpan, StyleProperty, Theme,
};

use super::filter::filter_value;
use super::property::property_and_value;
use super::shape::fill_selector;
use super::*;

#[test]
fn not_and_compose_into_a_selector() {
    let a = ConditionExpr::Ref(ExprRef(SourceSpan { start: 0, end: 1 }));
    let b = ConditionExpr::Ref(ExprRef(SourceSpan { start: 2, end: 3 }));
    let expr = ConditionExpr::And(Box::new(a), Box::new(ConditionExpr::Not(Box::new(b))));
    let (at_rule, selector) = condition_shape(&Condition::Expr(expr));
    assert!(at_rule.is_empty());
    assert_eq!(
        selector,
        "&:where(.hozo-cond-0-1):not(:where(.hozo-cond-2-3))"
    );
}

#[test]
fn an_arbitrary_selector_places_the_element_where_the_ampersand_is() {
    // The reason `condition_shape` returns a template rather than a
    // suffix: here the element's class lands at the end, and there is
    // no suffix that can say that.
    let (at_rule, selector) = condition_shape(&Condition::ArbitrarySelector(".dark &".to_string()));
    assert!(at_rule.is_empty());
    assert_eq!(fill_selector(&selector, "hozo-0"), ".dark .hozo-0");
}

#[test]
fn an_arbitrary_at_rule_wraps_the_whole_rule() {
    let (at_rule, selector) = condition_shape(&Condition::ArbitraryAtRule(
        "@supports (display:grid)".to_string(),
    ));
    assert_eq!(at_rule, vec!["@supports (display:grid)"]);
    assert_eq!(fill_selector(&selector, "hozo-0"), ".hozo-0");
}

#[test]
fn the_filter_chain_is_ordered_by_function_not_by_how_it_was_written() {
    // Filter functions don't commute: grayscale-then-invert and
    // invert-then-grayscale render differently. Tailwind fixes the
    // order by where each register sits in the value, so writing
    // `invert grayscale` must still come out grayscale-first.
    let props = [
        StyleProperty::Filter(FilterFunction::Invert, "invert(100%)".to_string()),
        StyleProperty::Filter(FilterFunction::Grayscale, "grayscale(100%)".to_string()),
        StyleProperty::Filter(FilterFunction::Blur, "blur(8px)".to_string()),
    ];
    let refs: Vec<&StyleProperty> = props.iter().collect();
    assert_eq!(
        filter_value(&refs, false, &Theme::default()),
        Some("blur(8px) grayscale(100%) invert(100%)".to_string())
    );
    // The element's own chain and the backdrop's are independent.
    assert_eq!(filter_value(&refs, true, &Theme::default()), None);
}

#[test]
fn separate_writers_under_the_same_guard_still_need_registers() {
    let theme = Theme::default();
    for (first, last, writer) in [
        (
            StyleProperty::Filter(FilterFunction::Blur, "blur(8px)".into()),
            StyleProperty::Filter(FilterFunction::Sepia, "sepia(100%)".into()),
            register_split_axes as fn(&mut [(Condition, Vec<StyleProperty>)], &Theme) -> bool,
        ),
        (
            StyleProperty::TranslateX(Dimension::Length(Length::Px(8.0))),
            StyleProperty::TranslateY(Dimension::Length(Length::Px(12.0))),
            register_split_axes,
        ),
        (
            StyleProperty::BoxShadow("0 1px 2px #123".into()),
            StyleProperty::RingWidth(Length::Px(2.0)),
            register_split_shadows,
        ),
        (
            StyleProperty::Gradient(GradientKind::Linear, "to right".into()),
            StyleProperty::GradientStopColor(GradientStop::From, Color::Keyword("red")),
            register_split_gradients,
        ),
    ] {
        let mut one = vec![(Condition::Hover, vec![first.clone(), last.clone()])];
        assert!(
            !writer(&mut one, &theme),
            "a single rule can write a literal"
        );
        let mut same_slots = vec![
            (Condition::Hover, vec![first.clone()]),
            (Condition::Hover, vec![first.clone()]),
        ];
        assert!(
            !writer(&mut same_slots, &theme),
            "identical slot masks need no registers"
        );
        let mut repeated = vec![
            (Condition::Hover, vec![first]),
            (Condition::Pressed, vec![StyleProperty::Opacity(0.5)]),
            (Condition::Hover, vec![last]),
        ];
        assert!(writer(&mut repeated, &theme), "{repeated:?}");
        assert_eq!(repeated[1].1, vec![StyleProperty::Opacity(0.5)]);
        for (_, props) in [&repeated[0], &repeated[2]] {
            assert!(props.iter().any(|prop| matches!(
                prop, StyleProperty::Arbitrary(name, _) if name.starts_with("--hozo-")
            )));
        }
    }

    let mut raw = vec![
        (
            Condition::Hover,
            vec![StyleProperty::Filter(
                FilterFunction::Blur,
                "blur(8px)".into(),
            )],
        ),
        (
            Condition::Pressed,
            vec![StyleProperty::FilterRaw("url(#external)".into())],
        ),
        (
            Condition::Hover,
            vec![StyleProperty::Filter(
                FilterFunction::Sepia,
                "sepia(100%)".into(),
            )],
        ),
    ];
    assert!(
        !register_split_axes(&mut raw, &theme),
        "raw filters still block register lowering"
    );
}

#[test]
fn literal_backdrop_functions_share_the_conditional_register_order() {
    let props = [
        StyleProperty::BackdropFilter(FilterFunction::Sepia, "sepia(100%)".into()),
        StyleProperty::BackdropFilter(FilterFunction::Saturate, "saturate(150%)".into()),
        StyleProperty::BackdropFilter(FilterFunction::Opacity, "opacity(50%)".into()),
    ];
    for refs in [
        props.iter().collect::<Vec<_>>(),
        props.iter().rev().collect::<Vec<_>>(),
    ] {
        assert_eq!(
            filter_value(&refs, true, &Theme::default()),
            Some("opacity(50%) saturate(150%) sepia(100%)".into())
        );
    }
}

#[test]
fn a_cleared_filter_slot_drops_out_but_filter_none_clears_everything() {
    let cleared = [
        StyleProperty::Filter(FilterFunction::Blur, String::new()),
        StyleProperty::Filter(FilterFunction::Invert, "invert(100%)".to_string()),
    ];
    let refs: Vec<&StyleProperty> = cleared.iter().collect();
    assert_eq!(
        filter_value(&refs, false, &Theme::default()),
        Some("invert(100%)".to_string())
    );

    let off = [
        StyleProperty::Filter(FilterFunction::Invert, "invert(100%)".to_string()),
        StyleProperty::Filter(FilterFunction::None, String::new()),
    ];
    let refs: Vec<&StyleProperty> = off.iter().collect();
    assert_eq!(
        filter_value(&refs, false, &Theme::default()),
        Some("none".to_string())
    );
}

#[test]
fn a_raw_filter_keeps_authored_order_and_replaces_the_earlier_chain() {
    let props = [
        StyleProperty::Filter(FilterFunction::Blur, "blur(8px)".to_string()),
        StyleProperty::FilterRaw("sepia(60%) hue-rotate(20deg)".to_string()),
    ];
    let refs: Vec<&StyleProperty> = props.iter().collect();
    assert_eq!(
        filter_value(&refs, false, &Theme::default()),
        Some("sepia(60%) hue-rotate(20deg)".to_string())
    );
}

#[test]
fn known_color_token_resolves_to_real_oklch() {
    let prop = StyleProperty::BackgroundColor(Color::Token("blue-500".to_string()));
    let (name, value) = property_and_value(&prop, &Theme::default());
    assert_eq!(name, "background-color");
    assert_eq!(value, "oklch(62.3% 0.214 259.815)");
}

#[test]
fn an_opacity_modifier_becomes_a_color_mix() {
    // Tailwind's own output for `bg-blue-500/50` is two declarations:
    // an `in srgb` fallback holding the literal colour and an
    // `in oklab` holding the theme variable. Hozo resolves the literal
    // already, so one declaration says the same thing -- and the later
    // of Tailwind's two is the one a declaration map keeps.
    let prop = StyleProperty::BackgroundColor(Color::Token("blue-500/50".to_string()));
    let (name, value) = property_and_value(&prop, &Theme::default());
    assert_eq!(name, "background-color");
    assert_eq!(
        value,
        "color-mix(in oklab, oklch(62.3% 0.214 259.815) 50%, transparent)"
    );
}

#[test]
fn arbitrary_numeric_alpha_modifiers_resolve_while_dynamic_ones_stay_unresolved() {
    for token in ["blue-500/[0.5]", "blue-500/[50%]"] {
        let prop = StyleProperty::BackgroundColor(Color::Token(token.to_string()));
        let (_, value) = property_and_value(&prop, &Theme::default());
        assert_eq!(
            value,
            "color-mix(in oklab, oklch(62.3% 0.214 259.815) 50%, transparent)"
        );
    }
    // Dynamic modifiers cannot be evaluated at build time, so they keep the
    // unresolved marker rather than guessing.
    for token in ["blue-500/(--alpha)", "blue-500/[var(--alpha)]"] {
        let prop = StyleProperty::BackgroundColor(Color::Token(token.to_string()));
        let (_, value) = property_and_value(&prop, &Theme::default());
        assert_eq!(value, format!("var(--hozo-color-{token})"));
    }
}

#[test]
fn unknown_color_token_falls_back_to_a_css_custom_property() {
    let (_, value) = property_and_value(
        &StyleProperty::TextColor(Color::Token("brand-primary".to_string())),
        &Theme::default(),
    );
    assert_eq!(value, "var(--hozo-color-brand-primary)");
}
