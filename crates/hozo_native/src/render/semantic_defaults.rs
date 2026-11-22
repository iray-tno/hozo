//! What a semantic primitive looks like before any class: bold `Strong`,
//! italic `Emphasis`, a heading's size, `Small` and ruby text scaled
//! against the size they sit in, a highlighted `Mark`, a rule's height.

use super::*;

/// The element's default declarations, ahead of its own. `style` is the
/// element's style so far; `inherited`, `parent_font_size` and
/// `parent_size_opaque` come from the element above it.
pub(super) fn semantic_defaults(
    node: &Node,
    theme: &Theme,
    style: &[StyleDeclaration],
    inherited: &[StyleDeclaration],
    parent_font_size: Option<f64>,
    parent_size_opaque: bool,
) -> Vec<StyleDeclaration> {
    // The size a relative one scales against, per condition.
    //
    // `parent_font_size` before `inherited`, which is the other way round
    // from how this used to read. The parent's is the *nearer* of the two:
    // it is that element's own size with its semantic default folded in,
    // while `inherited` is whatever a View further up handed down. Reading
    // the farther one first is why a `Small` inside an `<Heading level={1}>`
    // scaled against the page's 16 rather than the heading's 32, and came
    // out smaller than the body text it was supposed to be smaller than.
    //
    // Conditions rather than one number, because a conditional size still
    // reaches the element -- `md:text-xl` is carried down like any other
    // text declaration -- and a ratio that exists only at `Always` left the
    // inherited value standing above the breakpoint. A `Small` under
    // `text-base md:text-xl` rendered at 20px on a tablet: the same size as
    // the body, with the shrink gone.
    let base_font_sizes = || -> Vec<(Condition, f64)> {
        let find = |list: &[StyleDeclaration], want: &Condition| {
            list.iter().rev().find_map(|d| match &d.property {
                StyleProperty::FontSize(Length::Px(px)) if &d.condition == want => Some(*px),
                _ => None,
            })
        };
        let mut conditions: Vec<Condition> = vec![Condition::Always];
        for declaration in style.iter().chain(inherited.iter()) {
            if matches!(declaration.property, StyleProperty::FontSize(_))
                && !conditions.contains(&declaration.condition)
            {
                conditions.push(declaration.condition.clone());
            }
        }
        conditions
            .into_iter()
            .filter_map(|condition| {
                let px = find(style, &condition)
                    .or_else(|| {
                        // The unconditional fallbacks answer for a condition
                        // of their own only.
                        if condition == Condition::Always {
                            parent_font_size
                        } else {
                            None
                        }
                    })
                    .or_else(|| find(inherited, &condition))
                    .or_else(|| {
                        if condition == Condition::Always {
                            None
                        } else {
                            // A conditional ratio still needs a base when the
                            // size at that breakpoint came from further up.
                            find(style, &Condition::Always)
                                .or(parent_font_size)
                                .or_else(|| find(inherited, &Condition::Always))
                        }
                    })
                    .or_else(|| {
                        // Nothing named a size anywhere, so React Native's own
                        // default is the size this will be drawn at.
                        //
                        // This used to emit nothing, and `<Text>a<Small>x</Small></Text>`
                        // -- the commonest shape there is -- rendered small
                        // print at the size of the print around it. Three
                        // answers to one source: 13.6 on the Web, 12 through
                        // the components in `@hozo/typography`, and no
                        // reduction at all here.
                        //
                        // Not a guess. `RCTFont.mm` reads
                        // `const CGFloat defaultFontSize = 14`, and
                        // `packages/typography/src/text-size.ts` already scales
                        // against it -- the constants it replaced, 11 and 12,
                        // are these ratios applied to exactly this number.
                        //
                        // Only for a condition of its own, like the fallbacks
                        // above: a base invented for `md:` would apply a ratio
                        // at a breakpoint where nothing set a size.
                        (condition == Condition::Always).then_some(DEFAULT_FONT_SIZE)
                    })?;
                Some((condition, px))
            })
            .collect()
    };

    // One `fontSize` per condition a base is known for.
    let scaled = |ratio: f64, bases: Vec<(Condition, f64)>| -> Vec<StyleDeclaration> {
        bases
            .into_iter()
            .map(|(condition, base)| StyleDeclaration {
                source: Default::default(),
                property: StyleProperty::FontSize(Length::Px((base * ratio).round())),
                condition,
            })
            .collect()
    };

    let semantic_defaults: Vec<StyleDeclaration> = match node.primitive {
        Primitive::Strong | Primitive::Legend | Primitive::Term => vec![StyleDeclaration {
            source: Default::default(),
            property: StyleProperty::FontWeight(hozo_ir::FontWeight::Absolute(700)),
            condition: Condition::Always,
        }],
        Primitive::Emphasis => vec![StyleDeclaration {
            source: Default::default(),
            property: StyleProperty::Keyword("font-style", "italic"),
            condition: Condition::Always,
        }],
        Primitive::Underline => vec![StyleDeclaration {
            source: Default::default(),
            property: StyleProperty::TextDecorationLine("underline"),
            condition: Condition::Always,
        }],
        Primitive::Strikethrough => vec![StyleDeclaration {
            source: Default::default(),
            property: StyleProperty::TextDecorationLine("line-through"),
            condition: Condition::Always,
        }],
        // The browser gives `<pre>` a monospace face from its own
        // stylesheet; a `Text` has none to give.
        Primitive::Code | Primitive::Preformatted => vec![StyleDeclaration {
            source: Default::default(),
            property: StyleProperty::FontFamily(hozo_ir::FontFamily::Literal(
                "monospace".to_string(),
            )),
            condition: Condition::Always,
        }],
        // The rule itself, which the browser draws and React Native does
        // not. `<hr>` gets its line from the UA stylesheet; a `View` with
        // no size is zero pixels tall and draws nothing, so a compiled
        // separator was invisible while the uncompiled fallback -- which
        // has always set this -- drew one. Turning the compiler on removed
        // a divider from the screen (#309).
        //
        // No colour. The fallback sets none either, and a rule takes its
        // line from a `border-*` or `bg-*` utility the author writes; a
        // default here would be a colour nobody asked for that a theme
        // could not see coming.
        // The bar itself, which the browser sizes and React Native does
        // not. `<progress>` has an intrinsic box; a `View` has none, so a
        // compiled progress bar was zero pixels in both directions --
        // invisible on the screen, and absent from the accessibility tree
        // as well, because a zero-area view is not something Android
        // reports. A device found the second half first (#309).
        //
        // Measured rather than recalled, in headless Chrome with this
        // project's own preflight applied, which is the stylesheet a Hozo
        // page actually renders under:
        //
        //     <progress> -> 160 x 16
        //     <hr>       -> 1 tall (Tailwind sets border-top-width: 1px)
        //
        // The width is as literal as the height. It is an odd default for
        // a React Native layout -- a fixed-width bar in a flex column --
        // and it is what the Web half renders, which is the number that
        // matters: an author who overrides one overrides both, and an
        // author who overrides neither gets the same bar on both
        // platforms. Choosing a nicer number here would buy a divergence
        // that is invisible precisely when nobody is looking.
        // `<meter>`'s box, 80 x 16 in Chrome, is `HozoMeter`'s own, with the
        // track colour the same measurement found.
        Primitive::Progress => vec![
            StyleDeclaration {
                source: Default::default(),
                property: StyleProperty::Width(hozo_ir::Dimension::Length(Length::Px(160.0))),
                condition: Condition::Always,
            },
            StyleDeclaration {
                source: Default::default(),
                property: StyleProperty::Height(hozo_ir::Dimension::Length(Length::Px(16.0))),
                condition: Condition::Always,
            },
        ],
        Primitive::Separator => {
            let vertical = node
                .props
                .passthrough
                .iter()
                .find(|prop| prop.name.as_deref() == Some("orientation"))
                .is_some_and(|prop| prop.literal.as_deref() == Some("vertical"));
            // One pixel under a reset, two without one. Measured: the
            // preflight sets `hr { height: 0; border-top-width: 1px }` and
            // the bare user agent draws a 2px inset border (#315).
            let px = if theme.preflight() { 1.0 } else { 2.0 };
            let thickness = StyleDeclaration {
                source: Default::default(),
                property: if vertical {
                    StyleProperty::Width(hozo_ir::Dimension::Length(Length::Px(px)))
                } else {
                    StyleProperty::Height(hozo_ir::Dimension::Length(Length::Px(px)))
                },
                condition: Condition::Always,
            };
            vec![
                thickness,
                StyleDeclaration {
                    source: Default::default(),
                    property: StyleProperty::AlignSelf(hozo_ir::AlignSelf::Stretch),
                    condition: Condition::Always,
                },
            ]
        }
        Primitive::Sub | Primitive::Sup | Primitive::Small | Primitive::RubyText => {
            match (parent_size_opaque, size_ratio(node, theme)) {
                // Answered at runtime instead; see `rendered_component`.
                (true, Some(_)) => Vec::new(),
                (false, Some(ratio)) => scaled(ratio, base_font_sizes()),
                (_, None) => Vec::new(),
            }
        }
        // The browser's UA stylesheet for h1...h6, which React Native has
        // no equivalent of. `heading_level` reached the Web backend and was
        // dropped here, so a level-1 and a level-6 heading rendered at the
        // same size and the same weight -- identical on a phone, an outline
        // on the Web.
        Primitive::Heading if theme.preflight() => {
            // Nothing, which is what the browser renders here.
            //
            // Tailwind’s preflight resets `h1`-`h6` to `font-size: inherit;
            // font-weight: inherit`, so in a project that ships it a heading
            // is body text until the author says otherwise -- measured at
            // 16px and weight 400, against 32px and 700 without it. Supplying
            // a size and a weight here would make the phone show an outline
            // the browser does not (#315).
            //
            // The level is not lost: `accessibilityRole="header"` carries it
            // to a screen reader either way, which is the half that is about
            // structure rather than about looks.
            Vec::new()
        }
        Primitive::Heading => {
            let mut defs = vec![StyleDeclaration {
                source: Default::default(),
                property: StyleProperty::FontWeight(hozo_ir::FontWeight::Absolute(700)),
                condition: Condition::Always,
            }];
            // The weight holds for every level, so it is above rather than
            // here. The size is one of six, and `size_ratio` declines a
            // level chosen at runtime -- that one the compiler cannot pick.
            if let (false, Some(ratio)) = (parent_size_opaque, size_ratio(node, theme)) {
                defs.extend(scaled(ratio, base_font_sizes()));
            }
            defs
        }
        // Ruby annotation at half the size it annotates, which is what the
        // UA stylesheet says (`rt { font-size: 50% }`) and what JIS X 4051
        // says for 振り仮名. Missing entirely until now: the annotation
        // drew at the base size, so ruby and its text were the same size.
        // `mark` has no highlight without one. The UA stylesheet sets the
        // pair -- `background-color: Mark; color: MarkText` -- and both are
        // needed: a yellow ground under inherited light text is less
        // readable than no highlight at all.
        Primitive::Mark => vec![
            StyleDeclaration {
                source: Default::default(),
                property: StyleProperty::BackgroundColor(hozo_ir::Color::Css(
                    "#ffff00".to_string(),
                )),
                condition: Condition::Always,
            },
            StyleDeclaration {
                source: Default::default(),
                property: StyleProperty::TextColor(hozo_ir::Color::Css("#000000".to_string())),
                condition: Condition::Always,
            },
        ],
        _ => Vec::new(),
    };
    semantic_defaults
}
