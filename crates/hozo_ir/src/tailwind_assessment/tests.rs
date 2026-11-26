use super::*;
use crate::{portable_tailwind_snapshot, Length, TailwindOrderContext};

#[test]
fn simple_projections_share_exact_css_ownership_with_scalar_eligibility() {
    for (write, property) in [
        (StyleProperty::Opacity(0.5), "opacity"),
        (StyleProperty::ZIndex(Some(10)), "z-index"),
        (
            StyleProperty::FlexDirection(crate::FlexDirection::Row),
            "flex-direction",
        ),
        (StyleProperty::FlexGrow(1.0), "flex-grow"),
        (StyleProperty::FlexShrink(0.0), "flex-shrink"),
        (
            StyleProperty::AlignItems(crate::Align::Center),
            "align-items",
        ),
        (
            StyleProperty::AlignSelf(crate::AlignSelf::Center),
            "align-self",
        ),
        (
            StyleProperty::AlignContent(crate::Justify::Center),
            "align-content",
        ),
        (
            StyleProperty::JustifyContent(crate::Justify::Center),
            "justify-content",
        ),
        (
            StyleProperty::TextAlign(crate::TextAlign::Center),
            "text-align",
        ),
        (
            StyleProperty::TextAlign(crate::TextAlign::Css("justify")),
            "text-align",
        ),
        (
            StyleProperty::TextTransform(crate::TextTransform::Uppercase),
            "text-transform",
        ),
        (StyleProperty::Keyword("font-style", "italic"), "font-style"),
        (StyleProperty::Display(crate::Display::None), "display"),
        (
            StyleProperty::Position(crate::Position::Absolute),
            "position",
        ),
        (StyleProperty::Overflow(crate::Overflow::Hidden), "overflow"),
        (
            StyleProperty::Overflow(crate::Overflow::Css("clip")),
            "overflow",
        ),
        (
            StyleProperty::OverflowX(crate::Overflow::Css("auto")),
            "overflow-x",
        ),
        (
            StyleProperty::OverflowY(crate::Overflow::Hidden),
            "overflow-y",
        ),
        (StyleProperty::Flex(crate::FlexShorthand::Grow(1.0)), "flex"),
        (StyleProperty::Flex(crate::FlexShorthand::None), "flex"),
        (StyleProperty::Cursor("pointer".into()), "cursor"),
        (StyleProperty::ObjectFit("cover"), "object-fit"),
        (StyleProperty::MixBlendMode("multiply"), "mix-blend-mode"),
        (
            StyleProperty::LineHeight(crate::LineHeight::Ratio(1.25)),
            "line-height",
        ),
        (
            StyleProperty::LetterSpacing(crate::LetterSpacing::Em(crate::Em(0.025))),
            "letter-spacing",
        ),
        (
            StyleProperty::Columns(crate::ColumnCount::Count(2)),
            "columns",
        ),
        (
            StyleProperty::TextUnderlineOffset(crate::Dimension::Auto),
            "text-underline-offset",
        ),
        (
            StyleProperty::BackgroundBlendMode("screen"),
            "background-blend-mode",
        ),
        (
            StyleProperty::Display(crate::Display::InlineFlex),
            "display",
        ),
        (
            StyleProperty::FlexBasis(crate::Dimension::Auto),
            "flex-basis",
        ),
        (
            StyleProperty::TextDecorationLine("underline"),
            "text-decoration-line",
        ),
        (
            StyleProperty::TextDecorationColor(crate::Color::Token("red-500".into())),
            "text-decoration-color",
        ),
        (
            StyleProperty::TextDecorationStyle(crate::DecorationStyle::Wavy),
            "text-decoration-style",
        ),
        (StyleProperty::UserSelect("none"), "user-select"),
        (StyleProperty::Keyword("flex-wrap", "wrap"), "flex-wrap"),
        (
            StyleProperty::Keyword("backface-visibility", "hidden"),
            "backface-visibility",
        ),
        (
            StyleProperty::Keyword("box-sizing", "border-box"),
            "box-sizing",
        ),
        (StyleProperty::Keyword("isolation", "isolate"), "isolation"),
        (
            StyleProperty::Keyword("pointer-events", "none"),
            "pointer-events",
        ),
        (
            StyleProperty::Keyword("vertical-align", "middle"),
            "vertical-align",
        ),
        (StyleProperty::Display(crate::Display::Block), "display"),
        (StyleProperty::InsetTop(crate::Dimension::Auto), "top"),
        (StyleProperty::InsetRight(crate::Dimension::Auto), "right"),
        (StyleProperty::InsetBottom(crate::Dimension::Auto), "bottom"),
        (StyleProperty::InsetLeft(crate::Dimension::Auto), "left"),
        (StyleProperty::AspectRatio("16 / 9"), "aspect-ratio"),
        (StyleProperty::Order(1), "order"),
        (
            StyleProperty::BorderRadius(crate::Radius::Full),
            "border-radius",
        ),
        (
            StyleProperty::BorderTopLeftRadius(crate::Radius::Full),
            "border-top-left-radius",
        ),
        (
            StyleProperty::BorderEndStartRadius(crate::Radius::Full),
            "border-end-start-radius",
        ),
        (
            StyleProperty::BorderColor(crate::Color::Token("red-500".into())),
            "border-color",
        ),
        (
            StyleProperty::BorderInlineStartColor(crate::Color::Token("red-500".into())),
            "border-inline-start-color",
        ),
    ] {
        assert_eq!(scalar_css_property(&write), Some(property));
        assert!(crate::scalar_tailwind_property(&write));
        assert!(covers(property, &write));
        assert!(!covers("unrelated", &write));
    }
    for write in [
        StyleProperty::LetterSpacing(crate::LetterSpacing::Px(Length::Unit(
            1.0,
            crate::LengthUnit::Em,
        ))),
        StyleProperty::LineHeight(crate::LineHeight::Length(Length::Css("var(--line)".into()))),
        StyleProperty::ZIndex(None),
        StyleProperty::Keyword("font-style", "oblique"),
        StyleProperty::AlignContent(crate::Justify::Baseline),
        StyleProperty::JustifyContent(crate::Justify::Stretch),
        StyleProperty::TextDecorationLine("overline"),
        StyleProperty::UserSelect("contain"),
        StyleProperty::Keyword("vertical-align", "baseline"),
        StyleProperty::Keyword("pointer-events", "visiblePainted"),
    ] {
        assert_eq!(scalar_css_property(&write), None);
        assert!(!crate::scalar_tailwind_property(&write));
    }
}

#[test]
fn axis_and_logical_writes_own_their_shorthands_and_nothing_else() {
    let px = Length::Px(8.0);
    let edge = crate::Dimension::Length(px.clone());
    for (write, owners) in [
        (
            StyleProperty::PaddingInlineStart(edge.clone()),
            &["padding", "padding-inline", "padding-inline-start"][..],
        ),
        (
            StyleProperty::MarginInlineEnd(edge.clone()),
            &["margin", "margin-inline", "margin-inline-end"],
        ),
        (StyleProperty::Gap(edge.clone()), &["gap"]),
        (StyleProperty::RowGap(edge.clone()), &["gap", "row-gap"]),
        (
            StyleProperty::ColumnGap(edge.clone()),
            &["gap", "column-gap"],
        ),
        (StyleProperty::InsetTop(edge.clone()), &["inset", "top"]),
        (StyleProperty::InsetLeft(edge.clone()), &["inset", "left"]),
        (StyleProperty::InsetInline(edge.clone()), &["inset-inline"]),
        (
            StyleProperty::InsetInlineStart(edge.clone()),
            &["inset-inline-start"],
        ),
        (StyleProperty::InsetBlockEnd(edge), &["inset-block-end"]),
    ] {
        assert!(crate::scalar_tailwind_property(&write), "{write:?}");
        for property in [
            "padding",
            "padding-inline",
            "padding-inline-start",
            "padding-left",
            "margin",
            "margin-inline",
            "margin-inline-end",
            "gap",
            "column-gap",
            "row-gap",
            "inset",
            "inset-inline",
            "inset-inline-start",
            "inset-block",
            "inset-block-end",
            "top",
            "left",
        ] {
            assert_eq!(
                covers(property, &write),
                owners.contains(&property),
                "{write:?} / {property}"
            );
        }
    }
}

#[test]
fn border_widths_and_written_styles_rank() {
    use crate::{BorderStyle, Edge};
    let px = Length::Px(2.0);
    let solid = BorderStyle::Solid;
    for (write, owners) in [
        (
            StyleProperty::BorderTopWidth(px.clone()),
            &["border-width", "border-top-width"][..],
        ),
        (
            StyleProperty::BorderLeftStyle(solid),
            &["border-style", "border-left-style"],
        ),
        (
            StyleProperty::BorderLogicalWidth(Edge::Inline, px.clone()),
            &["border-inline-width"],
        ),
        (
            StyleProperty::BorderLogicalStyle(Edge::InlineStart, solid),
            &["border-inline-start-style"],
        ),
    ] {
        assert!(crate::scalar_tailwind_property(&write), "{write:?}");
        for property in [
            "border-width",
            "border-top-width",
            "border-left-width",
            "border-inline-width",
            "border-style",
            "border-left-style",
            "border-inline-start-style",
            "border-inline-style",
            "--tw-border-style",
        ] {
            assert_eq!(
                covers(property, &write),
                owners.contains(&property),
                "{write:?} / {property}"
            );
        }
    }
    // A font-relative width folds through the font size.
    let em = Length::Css("0.5em".into());
    assert!(!crate::scalar_tailwind_property(
        &StyleProperty::BorderTopWidth(em)
    ));
    // `border-dashed` sets the register every width's style reads, but a
    // width's own style is `BorderStyle::Default`, which never beats a
    // written one, so the written style ranks like any other write.
    let style = StyleProperty::BorderTopStyle(solid);
    assert_eq!(style.origin(), Some(crate::Origin::Written));
    assert_eq!(
        StyleProperty::BorderTopStyle(BorderStyle::Default).origin(),
        Some(crate::Origin::Default)
    );
    assert!(crate::scalar_tailwind_property(
        &StyleProperty::BorderTopWidth(px)
    ));
}

#[test]
fn outline_writes_and_written_styles_rank() {
    use crate::BorderStyle;
    let px = Length::Px(2.0);
    for (write, property) in [
        (StyleProperty::OutlineWidth(px.clone()), "outline-width"),
        (
            StyleProperty::OutlineStyle(BorderStyle::Solid),
            "outline-style",
        ),
        (
            StyleProperty::OutlineColor(crate::Color::Token("red-500".into())),
            "outline-color",
        ),
        (StyleProperty::OutlineOffset(px.clone()), "outline-offset"),
    ] {
        assert!(crate::scalar_tailwind_property(&write), "{write:?}");
        assert!(covers(property, &write), "{write:?}");
        assert!(!covers("outline", &write), "{write:?}");
    }
    // `outline-none` is a written style like the others.
    assert!(crate::scalar_tailwind_property(
        &StyleProperty::OutlineStyle(BorderStyle::None)
    ));
    // `outline-hidden`'s forced-colors branch is not a second place.
    let forced = OrderRuleShape::AtRule {
        name: "@media".into(),
        params: "(forced-colors: active)".into(),
        nodes: vec![OrderRuleShape::Declaration {
            property: "outline".into(),
            important: false,
        }],
    };
    let own = OrderRuleShape::Declaration {
        property: "outline-style".into(),
        important: false,
    };
    assert!(forced_colors_fallback(&[own, forced.clone()], &forced));
    // Alone, it is the `forced-colors:` variant.
    assert!(!forced_colors_fallback(
        std::slice::from_ref(&forced),
        &forced
    ));
    // A width's implied style never beats a written one.
    assert_eq!(
        StyleProperty::OutlineStyle(BorderStyle::Dashed).origin(),
        Some(crate::Origin::Written)
    );
    assert_eq!(
        StyleProperty::OutlineStyle(BorderStyle::Default).origin(),
        Some(crate::Origin::Default)
    );
}

#[test]
fn each_transform_axis_owns_its_register_not_the_shared_declaration() {
    let x = crate::Dimension::Length(Length::Px(8.0));
    let half = crate::Scale::Percent(50.0);
    for (write, register) in [
        (StyleProperty::TranslateX(x.clone()), "--tw-translate-x"),
        (StyleProperty::TranslateY(x.clone()), "--tw-translate-y"),
        (StyleProperty::ScaleX(half.clone()), "--tw-scale-x"),
        (StyleProperty::ScaleZ(half.clone()), "--tw-scale-z"),
        (StyleProperty::Rotate(crate::Angle::Deg(45.0)), "rotate"),
    ] {
        assert!(crate::scalar_tailwind_property(&write), "{write:?}");
        assert!(covers(register, &write), "{write:?}");
        // Every axis rule also declares the shared `translate`/`scale`;
        // owning it would make `translate-4` ambiguous between its axes.
        assert!(!covers("translate", &write), "{write:?}");
        assert!(!covers("scale", &write), "{write:?}");
    }
    // Each 3D rotation and skew owns its register, not the shared
    // `transform` every one of those rules declares.
    for (write, register) in [
        (
            StyleProperty::RotateX(crate::Angle::Deg(45.0)),
            "--tw-rotate-x",
        ),
        (StyleProperty::SkewY(crate::Angle::Deg(6.0)), "--tw-skew-y"),
    ] {
        assert!(crate::scalar_tailwind_property(&write), "{write:?}");
        assert!(covers(register, &write), "{write:?}");
        assert!(!covers("transform", &write), "{write:?}");
    }
    // `scale-3d`, the resets and `transform`/`-gpu` own the shared
    // declaration itself: each writes its form, and the last one decides.
    for (write, declaration) in [
        (StyleProperty::Scale3d, "scale"),
        (StyleProperty::ScaleNone, "scale"),
        (StyleProperty::TranslateNone, "translate"),
        (StyleProperty::RotateNone, "rotate"),
        (StyleProperty::TransformNone, "transform"),
        (StyleProperty::TransformGpu, "transform"),
    ] {
        assert!(crate::scalar_tailwind_property(&write), "{write:?}");
        assert!(covers(declaration, &write), "{write:?}");
    }
}

#[test]
fn an_supports_refinement_of_a_declared_property_is_not_a_branch() {
    let declaration = |property: &str, important: bool| OrderRuleShape::Declaration {
        property: property.into(),
        important,
    };
    let supports = |nodes: Vec<OrderRuleShape>| OrderRuleShape::AtRule {
        name: "@supports".into(),
        params: "(background-image: linear-gradient(in lab, red, red))".into(),
        nodes,
    };
    let siblings = vec![
        declaration("--tw-gradient-position", false),
        declaration("background-image", false),
    ];
    assert!(supports_refinement(
        &siblings,
        &supports(vec![declaration("--tw-gradient-position", false)])
    ));
    // A new property, a different importance, an empty block or a
    // nested rule is a real branch.
    for nodes in [
        vec![declaration("color", false)],
        vec![declaration("--tw-gradient-position", true)],
        vec![],
        vec![OrderRuleShape::Rule {
            selector: "&:hover".into(),
            nodes: vec![declaration("background-image", false)],
        }],
    ] {
        assert!(!supports_refinement(&siblings, &supports(nodes)));
    }
    let media = OrderRuleShape::AtRule {
        name: "@media".into(),
        params: "(width >= 48rem)".into(),
        nodes: vec![declaration("background-image", false)],
    };
    assert!(!supports_refinement(&siblings, &media));
}

#[test]
fn each_shadow_layer_and_colour_owns_its_register_not_box_shadow() {
    let px = Length::Px(2.0);
    let red = crate::Color::Token("red-500".into());
    for (write, register) in [
        (
            StyleProperty::BoxShadow("0 1px 3px 0".into()),
            "--tw-shadow",
        ),
        (StyleProperty::ShadowColor(red.clone()), "--tw-shadow-color"),
        (StyleProperty::RingWidth(px.clone()), "--tw-ring-shadow"),
        (StyleProperty::RingColor(red.clone()), "--tw-ring-color"),
        (
            StyleProperty::RingOffsetWidth(px.clone()),
            "--tw-ring-offset-width",
        ),
        (StyleProperty::RingInset, "--tw-ring-inset"),
    ] {
        assert!(crate::scalar_tailwind_property(&write), "{write:?}");
        assert!(covers(register, &write), "{write:?}");
        assert!(!covers("box-shadow", &write), "{write:?}");
    }
    // The offset rule also writes the shadow that reads its width.
    assert!(!covers(
        "--tw-ring-offset-shadow",
        &StyleProperty::RingOffsetWidth(px)
    ));
}

#[test]
fn filter_functions_own_their_registers_and_resets_own_the_declaration() {
    use crate::FilterFunction;
    for (write, register) in [
        (
            StyleProperty::Filter(FilterFunction::Blur, "blur(8px)".into()),
            "--tw-blur",
        ),
        (
            StyleProperty::BackdropFilter(FilterFunction::Opacity, "opacity(50%)".into()),
            "--tw-backdrop-opacity",
        ),
        (
            StyleProperty::Filter(FilterFunction::DropShadow, "drop-shadow(0 0 1px)".into()),
            "--tw-drop-shadow-size",
        ),
    ] {
        assert!(crate::scalar_tailwind_property(&write), "{write:?}");
        assert!(covers(register, &write), "{write:?}");
        assert!(!covers("filter", &write), "{write:?}");
        assert!(!covers("backdrop-filter", &write), "{write:?}");
    }
    // `drop-shadow-none` owns the shadow register itself.
    let none = StyleProperty::Filter(FilterFunction::DropShadow, String::new());
    assert!(crate::scalar_tailwind_property(&none));
    assert!(covers("--tw-drop-shadow", &none));
    for (reset, declaration) in [
        (
            StyleProperty::Filter(FilterFunction::None, String::new()),
            "filter",
        ),
        (
            StyleProperty::BackdropFilter(FilterFunction::None, String::new()),
            "backdrop-filter",
        ),
    ] {
        assert!(crate::scalar_tailwind_property(&reset));
        assert!(covers(declaration, &reset));
        assert!(!covers("--tw-blur", &reset));
        assert!(!covers("--tw-backdrop-blur", &reset));
    }
    assert!(!crate::scalar_tailwind_property(&StyleProperty::FilterRaw(
        "contrast(.75)".into()
    )));
}

fn fixture(name: &str) -> OrderCandidateDescriptor {
    portable_tailwind_snapshot()
        .candidates
        .into_iter()
        .find(|entry| entry.candidate == name)
        .unwrap()
}

#[test]
fn boolean_aria_assessment_matches_actual_independent_owner_facts_not_class_names() {
    for state in [
        "busy", "checked", "expanded", "selected", "invalid", "disabled", "hidden", "pressed",
        "readonly", "required",
    ] {
        let mut snapshot = portable_tailwind_snapshot();
        let candidate = snapshot
            .candidates
            .iter_mut()
            .find(|c| c.candidate == "p-2")
            .unwrap();
        let OrderRuleShape::Rule { nodes, .. } = &mut candidate.rules[0].shape else {
            panic!()
        };
        *nodes = vec![OrderRuleShape::Rule {
            selector: format!("&[aria-{state}=\"true\"]"),
            nodes: std::mem::take(nodes),
        }];
        let assessment = assess_tailwind_rule("p-2", &candidate.rules[0]).unwrap();
        assert_eq!(assessment.specificity, [0, 2, 0]);
        assert_eq!(assessment.owner[aria_owner_index(state).unwrap()], 1);
        assert_eq!(assessment.owner[4], 0, "aria-disabled is not :disabled");
        let context = TailwindOrderContext::new(snapshot).unwrap();
        let write = StyleProperty::PaddingTop(crate::Dimension::Length(Length::Px(8.0)));
        assert!(context
            .scalar_write_priority("p-2", &crate::Condition::Aria(state.into()), &write)
            .is_some());
        for wrong in [
            crate::Condition::Always,
            crate::Condition::Disabled,
            crate::Condition::Aria("unsupported".into()),
            crate::Condition::All(vec![
                crate::Condition::Aria(state.into()),
                crate::Condition::Aria(state.into()),
            ]),
        ] {
            assert!(context
                .scalar_write_priority("p-2", &wrong, &write)
                .is_none());
        }
    }
}

#[test]
fn negated_aria_requires_exact_original_polarity_and_multiplicity() {
    for state in [
        "busy", "checked", "expanded", "selected", "invalid", "disabled", "hidden", "pressed",
        "readonly", "required",
    ] {
        let mut snapshot = portable_tailwind_snapshot();
        let candidate = snapshot
            .candidates
            .iter_mut()
            .find(|c| c.candidate == "p-2")
            .unwrap();
        let OrderRuleShape::Rule { nodes, .. } = &mut candidate.rules[0].shape else {
            panic!()
        };
        *nodes = vec![OrderRuleShape::Rule {
            selector: format!("&:not(*[aria-{state}=\"true\"])"),
            nodes: std::mem::take(nodes),
        }];
        let assessed = assess_tailwind_rule("p-2", &candidate.rules[0]).unwrap();
        assert_eq!(assessed.specificity, [0, 2, 0]);
        assert_eq!(assessed.owner[negated_aria_owner_index(state).unwrap()], 1);
        assert_eq!(assessed.owner[aria_owner_index(state).unwrap()], 0);
        let context = TailwindOrderContext::new(snapshot).unwrap();
        let write = StyleProperty::PaddingTop(crate::Dimension::Length(Length::Px(8.0)));
        let negative = crate::Condition::Not(Box::new(crate::Condition::Aria(state.into())));
        assert!(context
            .scalar_write_priority("p-2", &negative, &write)
            .is_some());
        for wrong in [
            crate::Condition::Always,
            crate::Condition::Aria(state.into()),
            crate::Condition::Not(Box::new(negative.clone())),
            crate::Condition::Not(Box::new(crate::Condition::All(vec![
                crate::Condition::Aria(state.into()),
            ]))),
            crate::Condition::All(vec![negative.clone(), negative.clone()]),
        ] {
            assert!(context
                .scalar_write_priority("p-2", &wrong, &write)
                .is_none());
        }
    }
    for selector in [
        "&:not(*[aria-selected=\"false\"])",
        "&:not(*[aria-selected])",
        "&:not(*[aria-checked=\"mixed\"])",
        "&:not(*[aria-selected=\"true\" i])",
        "&:not(*[aria-selected=\"true\"]) > *",
        "&:not(*[aria-selected=\"true\"], *[aria-checked=\"true\"])",
        "&:not(*[aria-current=\"true\"])",
    ] {
        let mut candidate = fixture("p-2");
        let OrderRuleShape::Rule { nodes, .. } = &mut candidate.rules[0].shape else {
            panic!()
        };
        *nodes = vec![OrderRuleShape::Rule {
            selector: selector.into(),
            nodes: std::mem::take(nodes),
        }];
        assert_eq!(
            assess_tailwind_rule("p-2", &candidate.rules[0]).unwrap_err(),
            RuleAssessmentError::Selector,
            "{selector}"
        );
    }
}

#[test]
fn aria_assessment_does_not_guess_false_mixed_presence_flags_or_relational_selectors() {
    for selector in [
        "&[aria-checked=\"false\"]",
        "&[aria-checked=\"mixed\"]",
        "&[aria-selected]",
        "&[aria-selected=\"TRUE\"]",
        "&[aria-selected=\"true\" i]",
        "&:not([aria-selected=\"true\"])",
        "&[aria-selected=\"true\"] > *",
        "&[aria-disabled=\"false\"]",
        "&[aria-pressed=\"mixed\"]",
        "&[aria-current=\"true\"]",
    ] {
        let mut candidate = fixture("p-2");
        let OrderRuleShape::Rule { nodes, .. } = &mut candidate.rules[0].shape else {
            panic!()
        };
        *nodes = vec![OrderRuleShape::Rule {
            selector: selector.into(),
            nodes: std::mem::take(nodes),
        }];
        assert_eq!(
            assess_tailwind_rule("p-2", &candidate.rules[0]).unwrap_err(),
            RuleAssessmentError::Selector,
            "{selector}"
        );
    }
}

#[test]
fn hoisted_property_definitions_do_not_become_owner_writes_or_selector_weight() {
    let candidate = fixture("font-bold");
    let assessment = assess_tailwind_rule("font-bold", &candidate.rules[0]).unwrap();
    assert_eq!(assessment.properties, ["--tw-font-weight", "font-weight"]);
    assert_eq!(assessment.specificity, [0, 1, 0]);
    assert_eq!(assessment.owner, [0; OWNER_PREDICATE_COUNT]);
    let context = TailwindOrderContext::new(portable_tailwind_snapshot()).unwrap();
    assert!(context
        .scalar_write_priority(
            "font-bold",
            &crate::Condition::Always,
            &StyleProperty::FontWeight(crate::FontWeight::Theme {
                name: "bold",
                fallback: 700
            })
        )
        .is_some());
}

#[test]
fn registration_normalization_never_discards_arbitrary_hoisted_css() {
    let base = fixture("font-bold");
    let OrderRuleShape::Rule { nodes, .. } = &base.rules[0].shape else {
        panic!()
    };
    let registration = nodes
        .iter()
        .find(|node| matches!(node, OrderRuleShape::AtRoot { .. }))
        .unwrap();
    assert!(property_registration(registration));
    for (name, fields) in [
        ("@media", vec!["syntax", "inherits"]),
        ("@property", vec!["syntax"]),
        ("@property", vec!["syntax", "inherits", "color"]),
        ("@property", vec!["syntax", "inherits", "inherits"]),
    ] {
        let bad = OrderRuleShape::AtRoot {
            nodes: vec![OrderRuleShape::AtRule {
                name: name.into(),
                params: "--tw-font-weight".into(),
                nodes: fields
                    .into_iter()
                    .map(|property| OrderRuleShape::Declaration {
                        property: property.into(),
                        important: false,
                    })
                    .collect(),
            }],
        };
        assert!(!property_registration(&bad));
    }
}

#[test]
fn portable_facts_are_opt_in_exact_and_validate_in_the_project_context_type() {
    let context = TailwindOrderContext::new(portable_tailwind_snapshot()).unwrap();
    assert_eq!(context.snapshot().tailwind_version, "4.3.3");
    assert_eq!(context.snapshot().candidates.len(), 90);
    assert_eq!(
        context.snapshot().stylesheets[0].file,
        "builtin:tailwindcss/theme.css"
    );
    assert!(context.lookup("p-3").is_none());
    assert!(context.lookup("unrecognized:p-2").is_none());
    assert!(context.lookup("notautility").unwrap().rules.is_empty());
}

#[test]
fn original_owner_selectors_not_ir_guard_counts_supply_bounded_specificity() {
    for (name, weight, media) in [
        ("p-2", 1, 0),
        ("p-[3px]", 1, 0),
        ("p-0.5", 1, 0),
        ("w-1/2", 1, 0),
        ("bg-[#123456]", 1, 0),
        ("p-2!", 1, 0),
        ("hover:p-4", 2, 1),
        ("focus:p-4", 2, 0),
        ("focus-visible:p-4", 2, 0),
        ("disabled:p-4", 2, 0),
        ("hover:focus:p-4", 3, 1),
        ("hover:p-2!", 2, 1),
        // A query adds no weight; it is recorded for the write to match.
        ("sm:p-2", 1, 1),
        // A relation weighs its inner compound and keeps its query.
        ("group-hover:p-2", 2, 1),
    ] {
        let candidate = fixture(name);
        assert_eq!(candidate.rules.len(), 1, "{name}");
        let assessed = assess_tailwind_rule(name, &candidate.rules[0]).unwrap();
        assert_eq!(assessed.specificity, [0, weight, 0], "{name}");
        assert_eq!(assessed.media.len(), media, "{name}");
    }
    // A pseudo-element weighs one type.
    let candidate = fixture("placeholder:text-red-500");
    let assessed = assess_tailwind_rule("placeholder:text-red-500", &candidate.rules[0]).unwrap();
    assert_eq!(assessed.specificity, [0, 1, 1]);
    // `not-hover:` is read through its selector branch: one class, and
    // the negated hover fact.
    let candidate = fixture("not-hover:p-2");
    let assessed = assess_tailwind_rule("not-hover:p-2", &candidate.rules[0]).unwrap();
    assert_eq!(assessed.specificity, [0, 2, 0]);
    assert_eq!(assessed.owner[negated_interaction_index(0).unwrap()], 1);
    assert!(assessed.media.is_empty());
    for name in ["[&:where(:hover)]:p-2", "[&>span]:p-2"] {
        let candidate = fixture(name);
        assert!(!candidate.rules.is_empty());
        assert!(
            candidate
                .rules
                .iter()
                .any(|rule| assess_tailwind_rule(name, rule).is_err()),
            "{name}"
        );
    }
}

#[test]
fn ownership_survives_longhand_expansion_and_names_absolute_text_writes() {
    for (name, write, expected) in [
        (
            "p-2",
            StyleProperty::PaddingLeft(crate::Dimension::Length(Length::Px(8.0))),
            "padding",
        ),
        (
            "px-2",
            StyleProperty::PaddingRight(crate::Dimension::Length(Length::Px(8.0))),
            "padding-inline",
        ),
        (
            "py-2",
            StyleProperty::PaddingBottom(crate::Dimension::Length(Length::Px(8.0))),
            "padding-block",
        ),
    ] {
        let candidate = fixture(name);
        let TailwindWriteOwnership::Unique {
            rule_id,
            css_property,
            ..
        } = assess_tailwind_write(&candidate, &write)
        else {
            panic!("{name}")
        };
        assert_eq!(rule_id, candidate.rules[0].id);
        assert_eq!(css_property, expected);
    }
    let text = fixture("text-lg");
    assert!(matches!(
        assess_tailwind_write(&text, &StyleProperty::FontSize(Length::Px(18.0))),
        TailwindWriteOwnership::Unique {
            css_property: "font-size",
            ..
        }
    ));
}

#[test]
fn multiple_rules_require_unique_property_ownership_not_an_assumed_first_rule() {
    let mut candidate = fixture("p-2");
    let mut second = fixture("bg-red-500").rules.remove(0);
    second.id = 999;
    second.candidate_id = candidate.id;
    if let OrderRuleShape::Rule { selector, .. } = &mut second.shape {
        *selector = ".p-2".into();
    }
    candidate.rules.push(second);
    let write = StyleProperty::BackgroundColor(crate::Color::Token("red-500".into()));
    assert!(matches!(
        assess_tailwind_write(&candidate, &write),
        TailwindWriteOwnership::Unique {
            rule_id: 999,
            css_property: "background-color",
            ..
        }
    ));
    let mut repeated = fixture("p-2").rules.remove(0);
    repeated.id = 1000;
    candidate.rules.push(repeated);
    assert!(matches!(
        assess_tailwind_write(
            &candidate,
            &StyleProperty::PaddingLeft(crate::Dimension::Length(Length::Px(8.0)))
        ),
        TailwindWriteOwnership::Unknown("ambiguous-property-owner")
    ));
    // Unknown siblings might overlap; do not discard one then declare
    // the assessed remainder uniquely owned.
    if let OrderRuleShape::Rule { selector, .. } = &mut candidate.rules[2].shape {
        *selector = ".p-2 > span".into();
    }
    assert!(matches!(
        assess_tailwind_write(&candidate, &write),
        TailwindWriteOwnership::Unknown("unassessed-selector")
    ));
}

#[test]
fn mixed_branches_and_importance_are_not_collapsed_into_a_single_scope() {
    let mut candidate = fixture("p-2");
    if let OrderRuleShape::Rule { nodes, .. } = &mut candidate.rules[0].shape {
        nodes.push(OrderRuleShape::Rule {
            selector: "&:hover".into(),
            nodes: vec![],
        });
    }
    assert_eq!(
        assess_tailwind_rule("p-2", &candidate.rules[0]).unwrap_err(),
        RuleAssessmentError::Branching
    );
    let mut candidate = fixture("p-2");
    candidate.rules[0].important = true;
    assert_eq!(
        assess_tailwind_rule("p-2", &candidate.rules[0]).unwrap_err(),
        RuleAssessmentError::Importance
    );
}
