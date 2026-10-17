use super::*;

#[test]
fn starting_style_composes_but_cannot_be_asked_about() {
    assert_eq!(
        expand_utility("starting:opacity-0"),
        (Condition::StartingStyle, vec![StyleProperty::Opacity(0.0)])
    );
    // Stacking is fine in either order -- it is an at-rule like any
    // other and nests where it was written.
    assert_eq!(
        expand_utility("md:starting:opacity-0").0,
        Condition::All(vec![
            Condition::Responsive(Breakpoint::Md),
            Condition::StartingStyle,
        ])
    );
    // Wrapping is not. `@starting-style` describes a moment in the
    // rendering process, and there is no element to ask about it and
    // no absence of it to select on -- so the variant is left
    // unstripped and reported, which is what Tailwind does by emitting
    // nothing at all for these four.
    for token in [
        "not-starting:opacity-0",
        "has-starting:opacity-0",
        "group-starting:opacity-0",
        "peer-starting:opacity-0",
    ] {
        assert!(has_unstripped_variant(token), "{token}");
    }
}

#[test]
fn visited_is_a_plain_pseudo_class_and_composes_every_way() {
    assert_eq!(expand_utility("visited:text-red-500").0, Condition::Visited);
    // Unlike `starting:`, this one is a question about an element, so
    // all four wrappers take it -- Tailwind emits a rule for each.
    for token in [
        "not-visited:text-red-500",
        "has-visited:text-red-500",
        "group-visited:text-red-500",
        "peer-visited:text-red-500",
    ] {
        assert!(!has_unstripped_variant(token), "{token}");
    }
}

#[test]
fn parses_opacity_scale() {
    assert_eq!(
        expand_utility("opacity-50"),
        (Condition::Always, vec![StyleProperty::Opacity(0.5)])
    );
    assert_eq!(
        expand_utility("disabled:opacity-50"),
        (Condition::Disabled, vec![StyleProperty::Opacity(0.5)])
    );
}

#[test]
fn expands_login_example_utilities() {
    assert_eq!(
        expand_utility("flex-1"),
        (
            Condition::Always,
            vec![StyleProperty::Flex(FlexShorthand::Grow(1.0))]
        )
    );
    assert_eq!(
        expand_utility("p-6"),
        (
            Condition::Always,
            vec![
                StyleProperty::PaddingTop(Length::Spacing(6.0)),
                StyleProperty::PaddingRight(Length::Spacing(6.0)),
                StyleProperty::PaddingBottom(Length::Spacing(6.0)),
                StyleProperty::PaddingLeft(Length::Spacing(6.0)),
            ]
        )
    );
    assert_eq!(
        expand_utility("px-4"),
        (
            Condition::Always,
            vec![
                StyleProperty::PaddingInlineStart(Length::Spacing(4.0)),
                StyleProperty::PaddingInlineEnd(Length::Spacing(4.0))
            ]
        )
    );
    assert_eq!(
        expand_utility("text-xl"),
        (
            Condition::Always,
            vec![
                StyleProperty::FontSize(Length::Px(20.0)),
                StyleProperty::LineHeight(LineHeight::FontDefault(Length::Px(28.0)))
            ]
        )
    );
    assert_eq!(
        expand_utility("font-bold"),
        (
            Condition::Always,
            vec![StyleProperty::FontWeight(FontWeight(700))]
        )
    );
    assert_eq!(
        expand_utility("bg-blue-500"),
        (
            Condition::Always,
            vec![StyleProperty::BackgroundColor(Color::Token(
                "blue-500".to_string()
            ))]
        )
    );
    assert_eq!(
        expand_utility("unknown-utility"),
        (Condition::Always, Vec::<StyleProperty>::new())
    );
}

#[test]
fn recognizes_variant_prefixes() {
    assert_eq!(
        expand_utility("hover:bg-blue-500"),
        (
            Condition::Hover,
            vec![StyleProperty::BackgroundColor(Color::Token(
                "blue-500".to_string()
            ))]
        )
    );
    assert_eq!(
        expand_utility("focus:font-bold"),
        (
            Condition::Focus,
            vec![StyleProperty::FontWeight(FontWeight(700))]
        )
    );
    assert_eq!(
        expand_utility("disabled:text-xl"),
        (
            Condition::Disabled,
            vec![
                StyleProperty::FontSize(Length::Px(20.0)),
                StyleProperty::LineHeight(LineHeight::FontDefault(Length::Px(28.0)))
            ]
        )
    );
    assert_eq!(
        expand_utility("md:flex-row"),
        (
            Condition::Responsive(Breakpoint::Md),
            vec![StyleProperty::FlexDirection(FlexDirection::Row)]
        )
    );
}

#[test]
fn parses_position_and_inset() {
    assert_eq!(
        expand_utility("absolute"),
        (
            Condition::Always,
            vec![StyleProperty::Position(Position::Absolute)]
        )
    );
    assert_eq!(
        expand_utility("top-4"),
        (
            Condition::Always,
            vec![StyleProperty::InsetTop(Dimension::Length(Length::Spacing(
                4.0
            )))]
        )
    );
    assert_eq!(
        expand_utility("inset-0"),
        (
            Condition::Always,
            vec![
                StyleProperty::InsetTop(Dimension::Length(Length::Spacing(0.0))),
                StyleProperty::InsetRight(Dimension::Length(Length::Spacing(0.0))),
                StyleProperty::InsetBottom(Dimension::Length(Length::Spacing(0.0))),
                StyleProperty::InsetLeft(Dimension::Length(Length::Spacing(0.0))),
            ]
        )
    );
}

#[test]
fn border_width_always_carries_a_style_so_it_actually_renders() {
    // CSS defaults border-style to none, so a width with no style
    // renders nothing -- Tailwind pairs them for the same reason.
    let (_, props) = expand_utility("border");
    assert!(props.contains(&StyleProperty::BorderTopStyle(BorderStyle::Solid)));
    assert!(props.contains(&StyleProperty::BorderTopWidth(Length::Px(1.0))));
    assert_eq!(props.len(), 8); // 4 widths + 4 styles

    let (_, props) = expand_utility("border-2");
    assert!(props.contains(&StyleProperty::BorderLeftWidth(Length::Px(2.0))));
}

#[test]
fn parses_display_including_the_web_only_values() {
    assert_eq!(
        expand_utility("hidden"),
        (
            Condition::Always,
            vec![StyleProperty::Display(Display::None)]
        )
    );
    // Accepted at parse time even though Native can't lower it -- the
    // Web backend can, and hozo_native raises a build error naming it.
    assert_eq!(
        expand_utility("grid"),
        (
            Condition::Always,
            vec![StyleProperty::Display(Display::Grid)]
        )
    );
    assert!(!Display::Grid.is_supported_on_native());
    assert!(Display::InlineFlex.is_supported_on_native());
    assert!(Display::None.is_supported_on_native());
}

#[test]
fn parses_the_remaining_tier_one_utilities() {
    assert_eq!(
        expand_utility("z-10"),
        (Condition::Always, vec![StyleProperty::ZIndex(Some(10))])
    );
    assert_eq!(
        expand_utility("min-w-0"),
        (
            Condition::Always,
            vec![StyleProperty::MinWidth(Dimension::Length(Length::Spacing(
                0.0
            )))]
        )
    );
    // max-w-* uses Tailwind's named container scale, not the spacing one.
    assert_eq!(
        expand_utility("max-w-md"),
        (
            Condition::Always,
            vec![StyleProperty::MaxWidth(Dimension::Length(Length::Px(
                448.0
            )))]
        )
    );
    assert_eq!(
        expand_utility("self-center"),
        (
            Condition::Always,
            vec![StyleProperty::AlignSelf(AlignSelf::Center)]
        )
    );
    assert_eq!(
        expand_utility("content-center"),
        (
            Condition::Always,
            vec![StyleProperty::AlignContent(Justify::Center)]
        )
    );
    assert_eq!(
        expand_utility("uppercase"),
        (
            Condition::Always,
            vec![StyleProperty::TextTransform(TextTransform::Uppercase)]
        )
    );
}

#[test]
fn margins_accept_auto_where_padding_does_not() {
    assert_eq!(
        expand_utility("mx-auto"),
        (
            Condition::Always,
            vec![
                StyleProperty::MarginInlineStart(Dimension::Auto),
                StyleProperty::MarginInlineEnd(Dimension::Auto)
            ]
        )
    );
    assert_eq!(
        expand_utility("mt-auto"),
        (
            Condition::Always,
            vec![StyleProperty::MarginTop(Dimension::Auto)]
        )
    );
    // Padding has no `auto` in CSS, so this stays unrecognized rather
    // than being invented.
    assert_eq!(expand_utility("pt-auto"), (Condition::Always, vec![]));
}

#[test]
fn viewport_sizes_parse_as_a_viewport_dimension() {
    // Kept as a viewport dimension rather than resolved here, because
    // neither backend wants a number: Web writes `100vh` and lets the
    // browser resolve it, and Native reads the window at render time
    // (`hozo_native::viewport_object`). A pixel value baked in at
    // compile time would be wrong the moment the device rotated.
    let (_, props) = expand_utility("h-screen");
    assert_eq!(
        props,
        vec![StyleProperty::Height(Dimension::ViewportHeight(100.0))]
    );
    assert!(props[0].unsupported_on_native().is_none());
}

#[test]
fn parses_effects_and_transforms() {
    assert_eq!(
        expand_utility("blur-sm"),
        (
            Condition::Always,
            vec![StyleProperty::Filter(
                FilterFunction::Blur,
                "blur(8px)".to_string()
            )]
        )
    );
    assert_eq!(
        expand_utility("shadow-lg").1,
        vec![StyleProperty::BoxShadow(
            "0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)".to_string()
        )]
    );
    assert_eq!(
        expand_utility("rotate-45"),
        (
            Condition::Always,
            vec![StyleProperty::Rotate(Angle::Deg(45.0))]
        )
    );
    // Tailwind writes a percentage and the IR keeps it as authored.
    // Bare `scale-*` sets all three axes, so `scale-95 scale-x-50` can
    // resolve per-axis the way Tailwind does.
    assert_eq!(
        expand_utility("scale-95"),
        (
            Condition::Always,
            vec![
                StyleProperty::ScaleX(Scale::Percent(95.0)),
                StyleProperty::ScaleY(Scale::Percent(95.0)),
                StyleProperty::ScaleZ(Scale::Percent(95.0)),
            ]
        )
    );
    assert_eq!(
        expand_utility("translate-x-2"),
        (
            Condition::Always,
            vec![StyleProperty::TranslateX(Dimension::Length(
                Length::Spacing(2.0)
            ))]
        )
    );
}

#[test]
fn a_colour_slot_that_holds_a_keyword_does_not_go_through_the_palette() {
    // `accent-color: auto` and `fill: none` sit where a colour goes and
    // are not colours. Routing them through the token path produced
    // `var(--hozo-color-auto)` -- a plausible-looking wrong answer
    // rather than an unresolved one, which is the failure the palette
    // fallback exists to avoid in the first place.
    assert_eq!(
        expand_utility("accent-auto").1,
        vec![StyleProperty::AccentColor(Color::Keyword("auto"))]
    );
    assert_eq!(
        expand_utility("fill-none").1,
        vec![StyleProperty::Fill(Color::Keyword("none"))]
    );
}

#[test]
fn sr_only_expands_into_the_properties_it_sets() {
    // Expanded rather than held as a blob so a `w-4` beside it still
    // overrides the width: `dedupe_key` can only do that if each
    // declaration arrives as its own property.
    let (_, props) = expand_utility("sr-only");
    assert!(props.contains(&StyleProperty::Position(Position::Absolute)));
    assert!(props.contains(&StyleProperty::Width(Dimension::Length(Length::Px(1.0)))));
    assert!(props.contains(&StyleProperty::Overflow(Overflow::Hidden)));
    assert!(props.contains(&StyleProperty::Keyword("clip-path", "inset(50%)")));
    // A clipped one-pixel box, not `display: none` -- those remove the
    // element from the accessibility tree, which is the opposite of
    // what this utility is for.
    assert!(!props.iter().any(|p| matches!(p, StyleProperty::Display(_))));
    // Widths only: a zero width needs no style to render nothing, and
    // Tailwind writes none.
    assert!(props.contains(&StyleProperty::BorderTopWidth(Length::Px(0.0))));
    assert!(!props
        .iter()
        .any(|p| matches!(p, StyleProperty::BorderTopStyle(_))));

    let (_, props) = expand_utility("not-sr-only");
    assert!(props.contains(&StyleProperty::Position(Position::Static)));
    assert!(props.contains(&StyleProperty::Width(Dimension::Auto)));
}

#[test]
fn line_clamp_is_one_property_because_react_native_has_one_prop() {
    assert_eq!(
        expand_utility("line-clamp-3").1,
        vec![StyleProperty::LineClamp(Some(Clamp::Lines(3)))]
    );
    assert_eq!(
        expand_utility("line-clamp-none").1,
        vec![StyleProperty::LineClamp(None)]
    );
}

#[test]
fn position_static_is_not_refused() {
    // React Native has `static` and means what CSS means by it. It was
    // refused as part of the fixed/sticky group until the audit
    // objected.
    assert!(StyleProperty::Position(Position::Static)
        .unsupported_on_native()
        .is_none());
    assert!(StyleProperty::Position(Position::Css("sticky"))
        .unsupported_on_native()
        .is_some());
}

#[test]
fn extra_values_use_the_real_variant_when_one_exists() {
    // The refusal audit caught this: routing every new alignment value
    // through `Css` refused `items-baseline` and `items-stretch` on
    // Native, where React Native's alignItems has both. A `Css`
    // fallthrough is for values the platform genuinely lacks, not a
    // shortcut past the variants that already exist.
    assert_eq!(
        expand_utility("items-baseline").1,
        vec![StyleProperty::AlignItems(Align::Baseline)]
    );
    assert_eq!(
        expand_utility("self-stretch").1,
        vec![StyleProperty::AlignSelf(AlignSelf::Stretch)]
    );
    assert!(StyleProperty::AlignItems(Align::Baseline)
        .unsupported_on_native()
        .is_none());

    // `safe` is an overflow-alignment prefix, and the flexbox spelling
    // of the edge comes with it: `safe flex-end`, not `safe end`.
    assert_eq!(
        expand_utility("justify-end-safe").1,
        vec![StyleProperty::JustifyContent(Justify::Css("safe flex-end"))]
    );

    // align-content and justify-content share `Justify`, so which
    // values React Native accepts is decided per property: it has
    // stretch on alignContent and on neither for justifyContent.
    assert!(StyleProperty::AlignContent(Justify::Stretch)
        .unsupported_on_native()
        .is_none());
    assert!(StyleProperty::JustifyContent(Justify::Stretch)
        .unsupported_on_native()
        .is_some());
}

#[test]
fn underline_offset_is_plain_pixels_not_the_spacing_scale() {
    // `underline-offset-4` is 4px where `p-4` is 16px: an underline
    // offset is a typographic distance, not a layout step, so Tailwind
    // uses the bare number. Running it through the spacing scale
    // multiplied everything by four, which the oracle caught.
    assert_eq!(
        expand_utility("underline-offset-4").1,
        vec![StyleProperty::TextUnderlineOffset(Dimension::Length(
            Length::Px(4.0)
        ))]
    );
    assert_eq!(
        expand_utility("-underline-offset-2").1,
        vec![StyleProperty::TextUnderlineOffset(Dimension::Length(
            Length::Px(-2.0)
        ))]
    );
    assert_eq!(
        expand_utility("underline-offset-auto").1,
        vec![StyleProperty::TextUnderlineOffset(Dimension::Auto)]
    );
}

#[test]
fn the_keyword_table_carries_tailwinds_own_values() {
    // Spot checks on details a table written from memory would smooth
    // over. Each of these came out of Tailwind's compiled output.
    for (token, property, value) in [
        // "safe" is a prefix on the alignment, not a separate keyword.
        ("place-content-center-safe", "place-content", "safe center"),
        // Two values, in the order CSS wants them.
        ("bg-top-right", "background-position", "right top"),
        ("touch-pan-x", "touch-action", "pan-x"),
        ("scheme-only-dark", "color-scheme", "only dark"),
    ] {
        assert_eq!(
            expand_utility(token).1,
            vec![StyleProperty::Keyword(property, value)],
            "{token}"
        );
    }
    // A percentage, not the keyword `left`, now carried by the same
    // owned slot the StyleX frontend uses.
    assert_eq!(
        expand_utility("origin-left").1,
        vec![StyleProperty::TransformOrigin("0".to_string())]
    );
}

#[test]
fn no_keyword_property_is_also_written_by_a_variant() {
    // The other half of the `Keyword` invariant, and the half the
    // expansion test below cannot see: a token can expand to the
    // `Keyword` it claims and *still* collide, if some other utility
    // reaches the same CSS property through a variant. That is what
    // `z-auto` did -- it expanded to `Keyword("z-index", "auto")`
    // exactly as the table said, while `z-10` produced a `ZIndex`, so
    // the two stopped overriding each other.
    //
    // Checked by reading the Web emitter, because it is the only
    // exhaustive list of which CSS property each variant writes and
    // Rust can't enumerate enum variants. Coarse -- a property named in
    // a comment there would trip this -- but it fails loudly and in the
    // safe direction.
    let emitter = include_str!("../../../hozo_web/src/css.rs");
    for (token, property, _) in KEYWORD_UTILITIES {
        // The quoted name anywhere, not `("name",`: a wide match arm
        // puts the property on its own line, so anchoring on the paren
        // silently missed every multi-line one -- which is most of the
        // interesting ones (`align-items`, `position`, `text-align`).
        assert!(
            !emitter.contains(&format!("\"{property}\"")),
            "`{token}` sets `{property}`, which hozo_web also writes from a variant: \
             give it a property of its own instead of a Keyword"
        );
    }
}

#[test]
fn keyword_table_avoids_the_modelled_properties() {
    // The invariant `StyleProperty::Keyword` documents: no property may
    // be reachable both as a `Keyword` and as a variant of its own,
    // because `dedupe_key` tells two `Keyword`s apart by property name
    // and cannot see that a `Keyword("scroll-behavior", ..)` and a
    // `ScrollBehavior(..)` are the same declaration. Writing both would
    // then emit both.
    //
    // Checked against the *Web emitter's* own answer rather than a
    // hand-kept list: `property_and_value` is what decides a variant's
    // CSS property, so asking it is the only way to be sure. This is
    // how `scroll-auto` was caught -- it slipped into the table because
    // `scroll-behavior` wasn't on the list I wrote by hand.
    for (token, property, _) in KEYWORD_UTILITIES {
        let (_, props) = expand_utility(token);
        assert_eq!(
            props.len(),
            1,
            "{token} should be one declaration: {props:?}"
        );
        assert!(
            matches!(props[0], StyleProperty::Keyword(p, _) if p == *property),
            "{token} is shadowed by a modelled utility: {:?}",
            props[0]
        );
    }
}

#[test]
fn named_font_families_use_the_shared_owned_property() {
    for token in ["font-sans", "font-serif", "font-mono"] {
        let (_, props) = expand_utility(token);
        assert!(
            matches!(props.as_slice(), [StyleProperty::FontFamily(_)]),
            "{token}: {props:?}"
        );
    }
}

#[test]
fn the_sizes_css_can_state_and_hozo_cannot_compute_are_kept_as_text() {
    // Every one of these is resolved by the browser against state the
    // compiler doesn't have -- an intrinsic content size, or a viewport
    // that tracks browser chrome. There is nothing to compute, so the
    // CSS text is carried through and React Native refuses it.
    assert_eq!(
        expand_utility("h-fit").1,
        vec![StyleProperty::Height(Dimension::Css(
            "fit-content".to_string()
        ))]
    );
    assert_eq!(
        expand_utility("max-w-dvh").1,
        vec![StyleProperty::MaxWidth(Dimension::Css(
            "100dvh".to_string()
        ))]
    );
    assert!(!Dimension::Css("fit-content".to_string()).is_supported_on_native());
    // `h-screen` is the one viewport size that *is* answerable on
    // Native, from `Dimensions` -- so it stays a viewport dimension
    // rather than joining these.
    assert_eq!(
        expand_utility("h-screen").1,
        vec![StyleProperty::Height(Dimension::ViewportHeight(100.0))]
    );
}

#[test]
fn the_keyword_families_are_flat_tables() {
    // `flex-<n>` is `n 1 0%` -- grow by n, start from nothing -- which
    // is the same shape `flex-1` always had.
    assert_eq!(
        expand_utility("flex-7").1,
        vec![StyleProperty::Flex(FlexShorthand::Grow(7.0))]
    );
    assert_eq!(
        expand_utility("mix-blend-multiply").1,
        vec![StyleProperty::MixBlendMode("multiply")]
    );
    assert_eq!(
        expand_utility("bg-blend-screen").1,
        vec![StyleProperty::BackgroundBlendMode("screen")]
    );
    assert_eq!(expand_utility("mix-blend-nonsense").1, vec![]);

    assert_eq!(
        expand_utility("inline-block").1,
        vec![StyleProperty::Display(Display::Css("inline-block"))]
    );
    // `hidden` is Tailwind's name for `display: none`, which Yoga does
    // have -- so it must not land in the grouped keywords that get
    // refused on Native.
    assert_eq!(
        expand_utility("hidden").1,
        vec![StyleProperty::Display(Display::None)]
    );
    assert!(Display::None.is_supported_on_native());
    assert!(!Display::Css("inline-block").is_supported_on_native());
}

#[test]
fn filter_functions_are_held_per_slot_so_they_compose() {
    // One property per function, not one string for the chain: holding
    // the whole chain would make `blur-md grayscale` last-wins instead
    // of composing, which is the same reason the ring and mask slots
    // are separate.
    assert_eq!(
        expand_utility("grayscale").1,
        vec![StyleProperty::Filter(
            FilterFunction::Grayscale,
            "grayscale(100%)".to_string()
        )]
    );
    assert_eq!(
        expand_utility("hue-rotate-15").1,
        vec![StyleProperty::Filter(
            FilterFunction::HueRotate,
            "hue-rotate(15deg)".to_string()
        )]
    );
    // The `-none` form clears one slot; Tailwind writes an empty
    // register for it, so it contributes nothing to the chain.
    assert_eq!(
        expand_utility("blur-none").1,
        vec![StyleProperty::Filter(FilterFunction::Blur, String::new())]
    );
    // `filter-none` is the whole chain off, which is a different thing.
    assert_eq!(
        expand_utility("filter-none").1,
        vec![StyleProperty::Filter(FilterFunction::None, String::new())]
    );

    // The backdrop forms are the same chain aimed at what's behind the
    // element, and an element can carry both.
    assert_eq!(
        expand_utility("backdrop-blur-md").1,
        vec![StyleProperty::BackdropFilter(
            FilterFunction::Blur,
            "blur(12px)".to_string()
        )]
    );
    // `opacity()` is a filter function only in its backdrop form --
    // bare `opacity-50` is the CSS property.
    assert_eq!(
        expand_utility("backdrop-opacity-50").1,
        vec![StyleProperty::BackdropFilter(
            FilterFunction::Opacity,
            "opacity(50%)".to_string()
        )]
    );
    assert_eq!(
        expand_utility("opacity-50").1,
        vec![StyleProperty::Opacity(0.5)]
    );
}

#[test]
fn the_axis_transforms_are_separate_properties_so_they_can_override() {
    // The point of holding each axis separately: `dedupe_last_wins`
    // keys on the property, so a bare `scale-*` followed by an axis
    // has to leave two distinguishable properties or the axis would
    // replace the whole thing.
    assert_eq!(
        expand_utility("scale-x-50").1,
        vec![StyleProperty::ScaleX(Scale::Percent(50.0))]
    );
    // Writing the z axis also switches the declaration to its
    // three-value form, which is a separate fact from the axis having
    // a value.
    assert_eq!(
        expand_utility("scale-z-50").1,
        vec![
            StyleProperty::ScaleZ(Scale::Percent(50.0)),
            StyleProperty::Scale3d
        ]
    );
    assert_eq!(expand_utility("scale-3d").1, vec![StyleProperty::Scale3d]);

    assert_eq!(
        expand_utility("rotate-x-45").1,
        vec![StyleProperty::RotateX(Angle::Deg(45.0))]
    );
    // Bare `skew-*` is both axes, the same way bare `scale-*` is all
    // three -- and must not be swallowed by the `skew-x-` branch.
    assert_eq!(
        expand_utility("skew-6").1,
        vec![
            StyleProperty::SkewX(Angle::Deg(6.0)),
            StyleProperty::SkewY(Angle::Deg(6.0))
        ]
    );
    assert_eq!(
        expand_utility("-rotate-y-12").1,
        vec![StyleProperty::RotateY(Angle::Deg(-12.0))]
    );
}

#[test]
fn negated_transforms_are_recognized() {
    assert_eq!(
        expand_utility("-rotate-45"),
        (
            Condition::Always,
            vec![StyleProperty::Rotate(Angle::Deg(-45.0))]
        )
    );
    assert_eq!(
        expand_utility("-translate-y-2"),
        (
            Condition::Always,
            vec![StyleProperty::TranslateY(Dimension::Length(
                Length::Spacing(-2.0)
            ))]
        )
    );
    assert_eq!(
        expand_utility("-translate-z-2"),
        (
            Condition::Always,
            vec![StyleProperty::TranslateZ(Dimension::Length(
                Length::Spacing(-2.0)
            ))]
        )
    );
    assert_eq!(
        expand_utility("-z-10"),
        (Condition::Always, vec![StyleProperty::ZIndex(Some(-10))])
    );
    assert_eq!(
        expand_utility("-outline-offset-2"),
        (
            Condition::Always,
            vec![StyleProperty::OutlineOffset(Length::Px(-2.0))]
        )
    );
}

#[test]
fn the_container_scale_is_inline_axis_only() {
    // Tailwind has no `max-h-md` or `h-2xl` -- a container is a measure
    // of line length, so a named one on the block axis means nothing.
    // Hozo accepted them until 2026-08-16, which the conformance report
    // structurally could not catch: a candidate Tailwind emits no rule
    // for isn't in the catalogue to compare against.
    let scale = Dimension::Length(Length::Px(448.0)); // --container-md
    for token in [
        "w-md",
        "min-w-md",
        "max-w-md",
        "basis-md",
        "inline-md",
        "max-inline-md",
    ] {
        let (_, props) = expand_utility(token);
        assert_eq!(props.len(), 1, "{token}: {props:?}");
        assert!(
            matches!(
                &props[0],
                StyleProperty::Width(d)
                    | StyleProperty::MinWidth(d)
                    | StyleProperty::MaxWidth(d)
                    | StyleProperty::FlexBasis(d)
                    | StyleProperty::InlineSize(d)
                    | StyleProperty::MaxInlineSize(d) if *d == scale
            ),
            "{token}: {props:?}"
        );
    }
    for token in ["h-md", "max-h-md", "min-h-2xl", "block-md", "max-block-md"] {
        assert_eq!(
            expand_utility(token),
            (Condition::Always, vec![]),
            "{token}"
        );
    }
}

#[test]
fn order_cursor_and_columns_are_plain_tables() {
    assert_eq!(
        expand_utility("order-3"),
        (Condition::Always, vec![StyleProperty::Order(3)])
    );
    // Tailwind's own sentinels, not CSS keywords: `order` has none, so
    // "first" is a number far enough out that nothing outranks it.
    assert_eq!(
        expand_utility("order-first"),
        (Condition::Always, vec![StyleProperty::Order(-9999)])
    );
    assert_eq!(
        expand_utility("-order-3"),
        (Condition::Always, vec![StyleProperty::Order(-3)])
    );

    assert_eq!(
        expand_utility("cursor-pointer"),
        (
            Condition::Always,
            vec![StyleProperty::Cursor("pointer".to_string())]
        )
    );
    // The keyword list decides which names are utilities at all --
    // passing anything through would compile to CSS the browser drops.
    assert_eq!(
        expand_utility("cursor-nonsense"),
        (Condition::Always, vec![])
    );

    // A count and a width mean opposite things, so the two forms stay
    // distinguishable in the IR.
    assert_eq!(
        expand_utility("columns-3"),
        (
            Condition::Always,
            vec![StyleProperty::Columns(ColumnCount::Count(3))]
        )
    );
    assert_eq!(
        expand_utility("columns-md"),
        (
            Condition::Always,
            vec![StyleProperty::Columns(ColumnCount::Width(
                Dimension::Length(Length::Px(448.0))
            ))]
        )
    );
}

#[test]
fn direction_relative_utilities_stay_logical() {
    // These are the ones that actually flip between LTR and RTL, so
    // they must not be resolved to a physical side at compile time --
    // which side "start" is isn't known until runtime.
    assert_eq!(
        expand_utility("ps-4"),
        (
            Condition::Always,
            vec![StyleProperty::PaddingInlineStart(Length::Spacing(4.0))]
        )
    );
    assert_eq!(
        expand_utility("me-2"),
        (
            Condition::Always,
            vec![StyleProperty::MarginInlineEnd(Dimension::Length(
                Length::Spacing(2.0)
            ))]
        )
    );
    assert_eq!(
        expand_utility("start-2"),
        (
            Condition::Always,
            vec![StyleProperty::InsetInlineStart(Dimension::Length(
                Length::Spacing(2.0)
            ))]
        )
    );
    // The physical ones stay physical -- Tailwind has both families.
    assert_eq!(
        expand_utility("pl-4"),
        (
            Condition::Always,
            vec![StyleProperty::PaddingLeft(Length::Spacing(4.0))]
        )
    );
    assert_eq!(
        expand_utility("left-2"),
        (
            Condition::Always,
            vec![StyleProperty::InsetLeft(Dimension::Length(
                Length::Spacing(2.0)
            ))]
        )
    );
}

#[test]
fn mask_keyword_utilities_map_to_their_own_property() {
    // The family gives no hint from the name which property a keyword
    // belongs to, which is why the parser is a flat table.
    assert_eq!(
        expand_utility("mask-center").1,
        vec![StyleProperty::MaskPosition("center")]
    );
    assert_eq!(
        expand_utility("mask-cover").1,
        vec![StyleProperty::MaskSize("cover")]
    );
    assert_eq!(
        expand_utility("mask-alpha").1,
        vec![StyleProperty::MaskMode("alpha")]
    );
    assert_eq!(
        expand_utility("mask-clip-content").1,
        vec![StyleProperty::MaskClip("content-box")]
    );
    assert_eq!(
        expand_utility("mask-none").1,
        vec![StyleProperty::MaskImageNone]
    );
}

#[test]
fn stacked_variants_become_one_condition_each() {
    // These compiled to nothing at all before: the first prefix was
    // stripped and `hover:bg-blue-500` was handed to the utility
    // parser, which has never heard of it.
    assert_eq!(
        expand_utility("md:hover:flex").0,
        Condition::All(vec![
            Condition::Responsive(Breakpoint::Md),
            Condition::Hover
        ])
    );
    // Written order is kept, because it is the order the at-rules nest
    // in and Tailwind nests them the same way.
    assert_eq!(
        expand_utility("hover:md:flex").0,
        Condition::All(vec![
            Condition::Hover,
            Condition::Responsive(Breakpoint::Md)
        ])
    );
    assert_eq!(
        expand_utility("md:first:last:flex").0,
        Condition::All(vec![
            Condition::Responsive(Breakpoint::Md),
            Condition::FirstChild,
            Condition::LastChild,
        ])
    );
    // One variant stays what it always was, so everything matching on
    // `Condition::Hover` keeps working.
    assert_eq!(expand_utility("hover:flex").0, Condition::Hover);
}

#[test]
fn an_unrecognised_variant_stops_the_scan() {
    // Rather than being skipped: skipping it would apply the style
    // unconditionally, which is a wrong answer where nothing is an
    // honest gap. The colon may also belong to the value.
    assert_eq!(
        expand_utility("supports-grid:flex").1,
        Vec::<StyleProperty>::new()
    );
}

#[test]
fn container_is_six_utilities_wearing_one_name() {
    let groups = expand_class("container");
    assert_eq!(groups.len(), 6);
    assert_eq!(groups[0].0, Condition::Always);
    assert_eq!(
        groups[0].1,
        vec![StyleProperty::Width(Dimension::Percent(100.0))]
    );
    assert_eq!(groups[1].0, Condition::Responsive(Breakpoint::Sm));
    assert_eq!(
        groups[1].1,
        vec![StyleProperty::MaxWidth(Dimension::Length(Length::Unit(
            40.0,
            hozo_ir::LengthUnit::Rem
        )))]
    );
    // The variant rides onto every piece, so the two width queries
    // nest the way Tailwind's do.
    assert_eq!(
        expand_class("md:container")[1].0,
        Condition::All(vec![
            Condition::Responsive(Breakpoint::Md),
            Condition::Responsive(Breakpoint::Sm),
        ])
    );
}

#[test]
fn the_variants_tailwind_spells_differently() {
    assert_eq!(expand_utility("last:flex").0, Condition::LastChild);
    assert_eq!(
        expand_utility("focus-visible:flex").0,
        Condition::FocusVisible
    );
    // Hozo's own name and Tailwind's for the same state.
    assert_eq!(expand_utility("active:flex").0, Condition::Pressed);
    assert_eq!(expand_utility("pressed:flex").0, Condition::Pressed);
}

#[test]
fn a_gradient_constructor_carries_its_whole_prelude() {
    // The interpolation space is part of it, and Tailwind's default is
    // Oklab rather than sRGB -- which is why its red-to-blue ramps
    // don't go through grey.
    assert_eq!(
        expand_utility("bg-linear-to-r").1,
        vec![StyleProperty::Gradient(
            GradientKind::Linear,
            "to right in oklab".to_string()
        )]
    );
    assert_eq!(
        expand_utility("bg-linear-45").1,
        vec![StyleProperty::Gradient(
            GradientKind::Linear,
            "45deg in oklab".to_string()
        )]
    );
    assert_eq!(
        expand_utility("bg-conic-90").1,
        vec![StyleProperty::Gradient(
            GradientKind::Conic,
            "from 90deg in oklab".to_string()
        )]
    );
    // No direction at all, so the prelude is only the interpolation.
    assert_eq!(
        expand_utility("bg-radial").1,
        vec![StyleProperty::Gradient(
            GradientKind::Radial,
            "in oklab".to_string()
        )]
    );
    // The modifier replaces the space; a hue method brings one with it.
    assert_eq!(
        expand_utility("bg-linear-to-r/srgb").1,
        vec![StyleProperty::Gradient(
            GradientKind::Linear,
            "to right in srgb".to_string()
        )]
    );
    assert_eq!(
        expand_utility("bg-linear-to-r/longer").1,
        vec![StyleProperty::Gradient(
            GradientKind::Linear,
            "to right in oklch longer hue".to_string()
        )]
    );
}

#[test]
fn a_gradient_stop_is_a_colour_or_a_position() {
    assert_eq!(
        expand_utility("from-red-500").1,
        vec![StyleProperty::GradientStopColor(
            GradientStop::From,
            Color::Token("red-500".to_string())
        )]
    );
    assert_eq!(
        expand_utility("via-30%").1,
        vec![StyleProperty::GradientStopPosition(
            GradientStop::Via,
            Dimension::Percent(30.0)
        )]
    );
}

#[test]
fn ring_offset_is_its_own_layer() {
    // Not a ring colour called `offset-white`, which is what reading it
    // as part of the ring would give.
    assert_eq!(
        expand_utility("ring-offset-2").1,
        vec![StyleProperty::RingOffsetWidth(Length::Px(2.0))]
    );
    assert_eq!(
        expand_utility("ring-offset-white").1,
        vec![StyleProperty::RingOffsetColor(Color::Token(
            "white".to_string()
        ))]
    );
}

#[test]
fn a_shadow_suffix_the_size_table_declines_is_a_colour() {
    assert_eq!(
        expand_utility("shadow-blue-500").1,
        vec![StyleProperty::ShadowColor(Color::Token(
            "blue-500".to_string()
        ))]
    );
    // And the sizes still win, since they are tried first.
    assert_eq!(
        expand_utility("shadow-lg").1,
        vec![StyleProperty::BoxShadow(
            "0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)".to_string()
        )]
    );
}

#[test]
fn mask_gradients_name_their_slot_and_stop() {
    assert_eq!(
        expand_utility("mask-t-from-4").1,
        vec![StyleProperty::MaskStopPosition(
            MaskSlot::Top,
            MaskStop::From,
            Dimension::Length(Length::Spacing(4.0))
        )]
    );
    assert_eq!(
        expand_utility("mask-radial-to-red-500").1,
        vec![StyleProperty::MaskStopColor(
            MaskSlot::Radial,
            MaskStop::To,
            Color::Token("red-500".to_string())
        )]
    );
    // An axis names two slots, exactly as Tailwind does.
    assert_eq!(
        expand_utility("mask-x-from-4").1,
        vec![
            StyleProperty::MaskStopPosition(
                MaskSlot::Left,
                MaskStop::From,
                Dimension::Length(Length::Spacing(4.0))
            ),
            StyleProperty::MaskStopPosition(
                MaskSlot::Right,
                MaskStop::From,
                Dimension::Length(Length::Spacing(4.0))
            ),
        ]
    );
    assert_eq!(
        expand_utility("-mask-linear-45").1,
        vec![StyleProperty::MaskSlotArgument(
            MaskSlot::Linear,
            Angle::Deg(-45.0)
        )]
    );
    assert_eq!(
        expand_utility("mask-subtract").1,
        vec![StyleProperty::MaskComposite("subtract")]
    );
}

#[test]
fn a_leading_minus_is_handled_once_for_every_family() {
    // `expand_negatable` flips the expanded result rather than each
    // parser growing its own sign handling.
    assert_eq!(
        expand_utility("-mt-4").1,
        vec![StyleProperty::MarginTop(Dimension::Length(
            Length::Spacing(-4.0)
        ))]
    );
    assert_eq!(
        expand_utility("-top-4").1,
        vec![StyleProperty::InsetTop(Dimension::Length(Length::Spacing(
            -4.0
        )))]
    );
    assert_eq!(
        expand_utility("-rotate-45").1,
        vec![StyleProperty::Rotate(Angle::Deg(-45.0))]
    );
    // ...and refuses where CSS has no negative, rather than inventing
    // a negative padding.
    assert!(expand_utility("-p-4").1.is_empty());
    assert!(expand_utility("-scroll-p-4").1.is_empty());
}

#[test]
fn dimension_families_accept_fractions_and_keywords() {
    assert_eq!(
        expand_utility("top-1/2").1,
        vec![StyleProperty::InsetTop(Dimension::Percent(50.0))]
    );
    assert_eq!(
        expand_utility("basis-1/3").1,
        vec![StyleProperty::FlexBasis(Dimension::Percent(
            1.0 / 3.0 * 100.0
        ))]
    );
    assert_eq!(
        expand_utility("basis-auto").1,
        vec![StyleProperty::FlexBasis(Dimension::Auto)]
    );
    // Longest prefix wins: `max-block-` must not be read as `block-`.
    assert_eq!(
        expand_utility("max-block-4").1,
        vec![StyleProperty::MaxBlockSize(Dimension::Length(
            Length::Spacing(4.0)
        ))]
    );
    // Bare `translate-*` sets both axes.
    assert_eq!(
        expand_utility("translate-1/2").1,
        vec![
            StyleProperty::TranslateX(Dimension::Percent(50.0)),
            StyleProperty::TranslateY(Dimension::Percent(50.0)),
        ]
    );
}

#[test]
fn scroll_margin_and_padding_cover_every_edge() {
    assert_eq!(
        expand_utility("scroll-mt-4").1,
        vec![StyleProperty::ScrollMargin(Edge::Top, Length::Spacing(4.0))]
    );
    assert_eq!(
        expand_utility("scroll-pe-2").1,
        vec![StyleProperty::ScrollPadding(
            Edge::InlineEnd,
            Length::Spacing(2.0)
        )]
    );
    assert_eq!(
        expand_utility("-scroll-mx-4").1,
        vec![StyleProperty::ScrollMargin(
            Edge::Inline,
            Length::Spacing(-4.0)
        )]
    );
    // Padding takes no negative value, in CSS or in Tailwind.
    assert!(expand_utility("-scroll-p-4").1.is_empty());
    // Both values live in the same variant. `scroll-auto` used to be
    // left unsupported -- a coverage gap justified as a choice, since
    // it *is* the initial value -- but Tailwind emits a declaration for
    // it, and once it lowered it had to lower here rather than as a
    // `Keyword`, or `scroll-smooth scroll-auto` would emit both.
    assert_eq!(
        expand_utility("scroll-smooth").1,
        vec![StyleProperty::ScrollBehavior("smooth")]
    );
    assert_eq!(
        expand_utility("scroll-auto").1,
        vec![StyleProperty::ScrollBehavior("auto")]
    );
}

#[test]
fn per_side_border_colors_reach_the_right_side() {
    // Until 2026-08-15 every one of these compiled to `border-color`
    // -- all four sides -- from a token that isn't a colour name
    // (`var(--hozo-color-b-red-500)`). Wrong property, wrong value.
    assert_eq!(
        expand_utility("border-b-red-500").1,
        vec![StyleProperty::BorderBottomColor(Color::Token(
            "red-500".to_string()
        ))]
    );
    assert_eq!(
        expand_utility("border-s-red-500").1,
        vec![StyleProperty::BorderInlineStartColor(Color::Token(
            "red-500".to_string()
        ))]
    );
    // The axis forms stay shorthands, which is what Tailwind emits.
    assert_eq!(
        expand_utility("border-x-red-500").1,
        vec![StyleProperty::BorderInlineColor(Color::Token(
            "red-500".to_string()
        ))]
    );
    // A number on a side is still a width, not a colour called "4".
    assert_eq!(
        expand_utility("border-b-4").1,
        vec![
            StyleProperty::BorderBottomWidth(Length::Px(4.0)),
            StyleProperty::BorderBottomStyle(BorderStyle::Solid),
        ]
    );
}

#[test]
fn inset_covers_its_axis_and_logical_forms_and_negatives() {
    assert_eq!(
        expand_utility("inset-x-4").1,
        vec![StyleProperty::InsetInline(Dimension::Length(
            Length::Spacing(4.0)
        ))]
    );
    assert_eq!(
        expand_utility("inset-bs-2").1,
        vec![StyleProperty::InsetBlockStart(Dimension::Length(
            Length::Spacing(2.0)
        ))]
    );
    assert_eq!(
        expand_utility("-inset-y-4").1,
        vec![StyleProperty::InsetBlock(Dimension::Length(
            Length::Spacing(-4.0)
        ))]
    );
    // Bare `inset-*` is still all four physical sides.
    assert_eq!(expand_utility("inset-0").1.len(), 4);
}

#[test]
fn a_radius_outside_the_scale_is_held_by_name_for_the_theme() {
    let control = Radius::Theme("hozo-control".to_string());
    assert_eq!(
        expand_utility("rounded-hozo-control").1,
        vec![StyleProperty::BorderRadius(control.clone())]
    );
    // A corner splits off only when it is one: `hozo` is not.
    assert_eq!(
        expand_utility("rounded-t-hozo-control").1,
        vec![
            StyleProperty::BorderTopLeftRadius(control.clone()),
            StyleProperty::BorderTopRightRadius(control),
        ]
    );
    // The scale is still the scale, and a bare corner is still not a
    // radius named after it.
    assert_eq!(
        expand_utility("rounded-lg").1,
        vec![StyleProperty::BorderRadius(Radius::Scale {
            name: "lg",
            fallback_px: 8.0
        })]
    );
    assert!(expand_utility("rounded-t").1.is_empty());
    assert!(expand_utility("rounded-[13px]")
        .1
        .iter()
        .all(|property| property.theme_radius().is_none()));
}

#[test]
fn rounded_corners_expand_to_the_longhands_tailwind_emits() {
    let lg = Radius::Scale {
        name: "lg",
        fallback_px: 8.0,
    };
    assert_eq!(
        expand_utility("rounded-t-lg").1,
        vec![
            StyleProperty::BorderTopLeftRadius(lg.clone()),
            StyleProperty::BorderTopRightRadius(lg.clone()),
        ]
    );
    assert_eq!(
        expand_utility("rounded-tl-lg").1,
        vec![StyleProperty::BorderTopLeftRadius(lg.clone())]
    );
    // Logical corners stay logical, so RTL keeps working.
    assert_eq!(
        expand_utility("rounded-s-lg").1,
        vec![
            StyleProperty::BorderStartStartRadius(lg.clone()),
            StyleProperty::BorderEndStartRadius(lg.clone()),
        ]
    );
    // The all-corners form is unaffected.
    assert_eq!(
        expand_utility("rounded-lg").1,
        vec![StyleProperty::BorderRadius(lg.clone())]
    );
}

#[test]
fn per_side_border_scopes_its_style_to_that_side() {
    // The important part: NOT an all-sides `border-style`. That would
    // leave the other three sides styled but width-less, so CSS's
    // `border-width: medium` initial value kicks in and draws them --
    // turning `border-t` into a full box.
    assert_eq!(
        expand_utility("border-t").1,
        vec![
            StyleProperty::BorderTopWidth(Length::Px(1.0)),
            StyleProperty::BorderTopStyle(BorderStyle::Solid)
        ]
    );
    assert_eq!(
        expand_utility("border-b-4").1,
        vec![
            StyleProperty::BorderBottomWidth(Length::Px(4.0)),
            StyleProperty::BorderBottomStyle(BorderStyle::Solid)
        ]
    );
}

#[test]
fn standalone_border_style_utilities_cover_all_sides() {
    assert_eq!(
        expand_utility("border-dashed").1,
        vec![
            StyleProperty::BorderTopStyle(BorderStyle::Dashed),
            StyleProperty::BorderRightStyle(BorderStyle::Dashed),
            StyleProperty::BorderBottomStyle(BorderStyle::Dashed),
            StyleProperty::BorderLeftStyle(BorderStyle::Dashed),
        ]
    );
}

#[test]
fn border_color_is_not_mistaken_for_a_width() {
    assert_eq!(
        expand_utility("border-red-500"),
        (
            Condition::Always,
            vec![StyleProperty::BorderColor(Color::Token(
                "red-500".to_string()
            ))]
        )
    );
}

#[test]
fn parses_radius_scale() {
    assert_eq!(
        expand_utility("rounded-lg"),
        (
            Condition::Always,
            vec![StyleProperty::BorderRadius(Radius::Scale {
                name: "lg",
                fallback_px: 8.0
            })]
        )
    );
    assert_eq!(
        expand_utility("rounded"),
        (
            Condition::Always,
            vec![StyleProperty::BorderRadius(Radius::Length(Length::Px(4.0)))]
        )
    );
}

#[test]
fn radius_scales_keep_names_but_literals_and_fixed_intents_do_not() {
    for (name, fallback_px) in [
        ("xs", 2.0),
        ("sm", 4.0),
        ("md", 6.0),
        ("lg", 8.0),
        ("xl", 12.0),
        ("2xl", 16.0),
        ("3xl", 24.0),
        ("4xl", 32.0),
    ] {
        let properties = expand_utility(&format!("rounded-{name}")).1;
        assert_eq!(
            properties,
            vec![StyleProperty::BorderRadius(Radius::Scale {
                name,
                fallback_px
            })]
        );
        // Built-in names always have a fallback, so their original CSS
        // class need not be carried as if they were unknown custom names.
        assert!(properties[0].theme_radius().is_none());
    }
    assert_eq!(
        expand_utility("rounded-none").1,
        vec![StyleProperty::BorderRadius(Radius::Length(Length::Px(0.0)))]
    );
    assert_eq!(
        expand_utility("rounded-[8px]").1,
        vec![StyleProperty::BorderRadius(Radius::Length(Length::Px(8.0)))]
    );
}

#[test]
fn rounded_full_stays_an_intent_not_a_number() {
    // Each backend needs a different answer -- CSS can say `infinity`,
    // RN can't -- so the choice can't be baked in at parse time.
    assert_eq!(
        expand_utility("rounded-full"),
        (
            Condition::Always,
            vec![StyleProperty::BorderRadius(Radius::Full)]
        )
    );
}

#[test]
fn parses_sizing_including_fractions_and_size_shorthand() {
    assert_eq!(
        expand_utility("w-4"),
        (
            Condition::Always,
            vec![StyleProperty::Width(Dimension::Length(Length::Spacing(
                4.0
            )))]
        )
    );
    assert_eq!(
        expand_utility("w-1/2"),
        (
            Condition::Always,
            vec![StyleProperty::Width(Dimension::Percent(50.0))]
        )
    );
    assert_eq!(
        expand_utility("size-4"),
        (
            Condition::Always,
            vec![
                StyleProperty::Width(Dimension::Length(Length::Spacing(4.0))),
                StyleProperty::Height(Dimension::Length(Length::Spacing(4.0))),
            ]
        )
    );
}

#[test]
fn text_size_sets_line_height_too() {
    // Regression: this used to emit font-size only, silently dropping
    // the line-height half of what Tailwind's text-* utilities mean.
    for (token, size, line_height) in [
        ("text-xs", 12.0, 16.0),
        ("text-base", 16.0, 24.0),
        ("text-4xl", 36.0, 40.0),
    ] {
        assert_eq!(
            expand_utility(token),
            (
                Condition::Always,
                vec![
                    StyleProperty::FontSize(Length::Px(size)),
                    StyleProperty::LineHeight(LineHeight::FontDefault(Length::Px(line_height))),
                ]
            ),
            "{token}"
        );
    }
    // From text-5xl up the ratio is a flat 1, so the two match.
    assert_eq!(
        expand_utility("text-5xl").1,
        vec![
            StyleProperty::FontSize(Length::Px(48.0)),
            StyleProperty::LineHeight(LineHeight::FontDefault(Length::Px(48.0)))
        ]
    );
}

#[test]
fn text_size_still_does_not_swallow_color_tokens() {
    // `text-<size>` is handled before the `text-<color>` fallthrough;
    // this guards the boundary between them in both directions.
    assert_eq!(
        expand_utility("text-red-500"),
        (
            Condition::Always,
            vec![StyleProperty::TextColor(Color::Token(
                "red-500".to_string()
            ))]
        )
    );
    assert_eq!(
        expand_utility("text-center"),
        (
            Condition::Always,
            vec![StyleProperty::TextAlign(TextAlign::Center)]
        )
    );
}

#[test]
fn explicit_leading_beats_a_text_size_fallback_in_either_order() {
    let (_, text_props) = expand_utility("text-xl");
    let (_, leading_props) = expand_utility("leading-6");
    for combined in [
        text_props.iter().chain(&leading_props).cloned().collect(),
        leading_props.iter().chain(&text_props).cloned().collect(),
    ] {
        let deduped = hozo_ir::dedupe_last_wins(combined);
        assert!(
            deduped.contains(&StyleProperty::LineHeight(LineHeight::Length(
                Length::Spacing(6.0)
            )))
        );
        assert!(
            !deduped.contains(&StyleProperty::LineHeight(LineHeight::FontDefault(
                Length::Px(28.0)
            )))
        );
    }
}

#[test]
fn named_leading_stays_a_ratio_rather_than_being_faked_as_pixels() {
    // The named scale is a unitless multiple of the element's own font
    // size. It's kept as a ratio -- which CSS states directly -- rather
    // than converted here to a pixel value that would only be right for
    // one font size. The Native backend resolves it against a font size
    // on the same element (`hozo_native::fold_font_relative`), which is
    // information this function doesn't have.
    let (_, props) = expand_utility("leading-tight");
    assert_eq!(
        props,
        vec![StyleProperty::LineHeight(LineHeight::Ratio(1.25))]
    );

    // The numeric scale is spacing-based and resolves to a length on
    // both platforms.
    let (_, props) = expand_utility("leading-6");
    assert_eq!(
        props,
        vec![StyleProperty::LineHeight(LineHeight::Length(
            Length::Spacing(6.0)
        ))]
    );
    assert!(props[0].unsupported_on_native().is_none());
}

#[test]
fn truncate_expands_to_its_three_declarations() {
    assert_eq!(
        expand_utility("truncate").1,
        vec![
            StyleProperty::Overflow(Overflow::Hidden),
            StyleProperty::TextOverflow(TextOverflow::Ellipsis),
            StyleProperty::WhiteSpace(WhiteSpace::NoWrap),
        ]
    );
}

#[test]
fn parses_dark_and_first_variants() {
    assert_eq!(
        expand_utility("dark:bg-black"),
        (
            Condition::Dark,
            vec![StyleProperty::BackgroundColor(Color::Token(
                "black".to_string()
            ))]
        )
    );
    assert_eq!(
        expand_utility("first:mt-0"),
        (
            Condition::FirstChild,
            vec![StyleProperty::MarginTop(Dimension::Length(
                Length::Spacing(0.0)
            ))]
        )
    );
}

#[test]
fn parses_transition_and_tracking() {
    assert_eq!(
        expand_utility("duration-200").1,
        vec![StyleProperty::TransitionDuration(200, Origin::Written)]
    );
    assert_eq!(
        expand_utility("tracking-wide").1,
        vec![StyleProperty::LetterSpacing(LetterSpacing::Em(Em(0.025)))]
    );
    assert_eq!(
        expand_utility("grid-cols-3").1,
        vec![StyleProperty::GridTemplateColumns(GridTracks::Count(3))]
    );
}

#[test]
fn grid_placement_distinguishes_a_line_from_a_span() {
    // `col-start-2` pins one edge to line 2; `col-span-2` says "two
    // tracks, wherever this lands". Same digit, different meaning, and
    // CSS spells them with different properties -- so collapsing them
    // would put an item in the wrong place rather than merely format it
    // differently.
    assert_eq!(
        expand_utility("col-start-2").1,
        vec![StyleProperty::GridColumnStart(GridLine::Line(2))]
    );
    assert_eq!(
        expand_utility("col-span-2").1,
        vec![StyleProperty::GridColumn(GridSpan::Span(2))]
    );
    // The shorthands must be matched before the bare-line form, or
    // `col-span-2` would parse as the `col-` line `span-2` and fail.
    assert_eq!(
        expand_utility("row-span-full").1,
        vec![StyleProperty::GridRow(GridSpan::Full)]
    );
    assert_eq!(
        expand_utility("col-auto").1,
        vec![StyleProperty::GridColumn(GridSpan::Auto)]
    );
    assert_eq!(
        expand_utility("col-end-auto").1,
        vec![StyleProperty::GridColumnEnd(GridLine::Auto)]
    );
    // A negative line counts back from the end of the explicit grid.
    assert_eq!(
        expand_utility("-col-end-1").1,
        vec![StyleProperty::GridColumnEnd(GridLine::Line(-1))]
    );
    assert_eq!(
        expand_utility("grid-rows-subgrid").1,
        vec![StyleProperty::GridTemplateRows(GridTracks::Subgrid)]
    );
}

#[test]
fn pressed_variant_is_recognized() {
    assert_eq!(
        expand_utility("pressed:opacity-50"),
        (Condition::Pressed, vec![StyleProperty::Opacity(0.5)])
    );
}
