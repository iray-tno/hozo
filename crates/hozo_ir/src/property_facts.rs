//! What a style property says about itself: its value, its length, and
//! whether React Native can draw it.

use super::*;

impl StyleProperty {
    /// `Some(description)` when React Native has no way to express this, so
    /// the Native backend can refuse it by name instead of dropping it. Kept
    /// here rather than in that backend so every such case is listed in one
    /// place as more are found.
    /// `Some(reason)` when React Native *could* express this and Hozo
    /// doesn't lower it yet -- `DiagnosticCode::NotWiredOnNative` rather
    /// than `WebOnlyPropertyOnNative`.
    ///
    /// Checked before `unsupported_on_native`, and separate from it because
    /// the two make different claims. Conflating them is not harmless: the
    /// refusal audit checks the Web-only claims against React Native's own
    /// types, and a gap filed as impossible is a gap nobody revisits.
    ///
    /// Only the cases decidable from the property alone live here. A gap
    /// that depends on the rest of the element -- a `leading-*` ratio with
    /// no font size beside it -- is decided in `hozo_native`, which can see
    /// the node.
    pub fn not_wired_on_native(&self) -> Option<String> {
        // `placeholder-*` used to live here. It lowers now: React Native
        // carries that colour as `placeholderTextColor` on `TextInput`,
        // and `TextInput` exists. What remains is the case where it is
        // written on something that isn't one, which `hozo_native`
        // decides because it can see the node.
        None
    }

    /// The `Dimension` this property carries, if it carries one.
    ///
    /// Exists so `unsupported_on_native` can ask about a *value* once
    /// instead of per property. Every size utility takes the same value
    /// vocabulary, so a value React Native can't hold (`fit-content`,
    /// `100dvh`) is unusable on all of them -- and listing the properties
    /// one at a time is how the last batch of those came to be dropped in
    /// silence rather than refused.
    /// The unit standing between this property's length and a pixel
    /// value, when one does.
    ///
    /// `Length::unresolved_unit` has existed for this since it was
    /// written and had no callers at all, so nothing ever asked. What
    /// happened instead is worse than a refusal: `Length::px` ends in
    /// `unwrap_or(0.0)`, so `p-[1.5em]` and `p-[100vh]` compiled to a
    /// padding of **zero** on React Native, with no diagnostic. A wrong
    /// number is not something the silence check can see -- a style was
    /// emitted -- and there is no oracle for the Native side to compare it
    /// against, so nothing in the report could have caught it either.
    ///
    /// `em` is answerable where a font size is on the same element and
    /// `vh`/`vw` where the viewport hook is in play; both of those resolve
    /// before this is asked. What reaches here is a length with nothing to
    /// resolve it against.
    pub fn unresolved_length_unit(&self) -> Option<LengthUnit> {
        self.length().and_then(Length::unresolved_unit)
    }

    /// The CSS expression this property's length is, when it is one.
    ///
    /// The other half of the same question `unresolved_length_unit` asks,
    /// split out because the answers are not interchangeable: a unit can
    /// sometimes be supplied from context, and `calc(100% - 2rem)` never
    /// can. Native refuses on this before it looks at units at all.
    pub fn css_expression_length(&self) -> Option<&str> {
        self.length().and_then(Length::css_expression)
    }

    /// The length this property carries, wherever it keeps it.
    ///
    /// Six shapes hold one, and `value()` is what knows which: the
    /// `Dimension`-typed properties, the ones typed directly as a length,
    /// and the three small enums that wrap one alongside something that is
    /// not a length at all -- a radius that may be `Full`, a line height
    /// that may be a ratio, a letter spacing that may be an `em`.
    ///
    /// The wildcard below is safe in a way the one this replaced was not.
    /// It falls through the seven kinds of value a property can hold, not
    /// the two hundred properties there are; a new property cannot reach it
    /// without `value()` having classified it first, and `value()` does not
    /// compile until someone does.
    /// The theme radius this property names, if any: `control` for
    /// `rounded-control`. See `Radius::Theme`.
    pub fn theme_radius(&self) -> Option<&str> {
        match self.value() {
            PropertyValue::Radius(Radius::Theme(name)) => Some(name),
            _ => None,
        }
    }

    fn length(&self) -> Option<&Length> {
        match self.value() {
            PropertyValue::Length(length) => Some(length),
            PropertyValue::Dimension(Dimension::Length(length)) => Some(length),
            PropertyValue::Radius(Radius::Length(length)) => Some(length),
            PropertyValue::LineHeight(
                LineHeight::Length(length) | LineHeight::FontDefault(length),
            ) => Some(length),
            PropertyValue::LetterSpacing(LetterSpacing::Px(length)) => Some(length),
            _ => None,
        }
    }

    /// The `Dimension` this property carries, if it carries one.
    ///
    /// Exists so `unsupported_on_native` can ask about a *value* once
    /// instead of per property. Every size utility takes the same value
    /// vocabulary, so a value React Native can't hold (`fit-content`,
    /// `100dvh`) is unusable on all of them.
    pub fn dimension(&self) -> Option<&Dimension> {
        match self.value() {
            PropertyValue::Dimension(dimension) => Some(dimension),
            _ => None,
        }
    }

    /// What this property holds, as a borrowed view.
    ///
    /// One list, and the only one. Three functions used to answer this
    /// question with three hand-written lists of variants, each ending in a
    /// `_ => None` that let a new property escape all of them -- and every
    /// one of the three was wrong at some point:
    ///
    /// - `dimension()` covered 17 of the 42 that carry one, so
    ///   `bottom-[calc(100%-2rem)]` was never refused and emitted nothing.
    /// - The direct length list did not exist until `p-[1.5em]` was found
    ///   compiling to a padding of **zero** on React Native, silently:
    ///   `Length::px` ends in `unwrap_or(0.0)`, and a wrong number looks
    ///   exactly like a right one.
    /// - It then still missed the three wrappers, so `rounded-[1.5em]` did
    ///   the same thing to a radius, months later.
    ///
    /// Three incidents of one shape: a list beside an enum of two hundred
    /// variants goes stale, and nothing says so, because adding a variant
    /// compiles.
    ///
    /// This match has no wildcard. Adding a variant to `StyleProperty` now
    /// fails to build until it is classified here, and every question about
    /// a property's value is asked through this instead of listing
    /// properties again. `unsupported_on_native` is deliberately left
    /// alone: its wildcards mean "nothing here is a problem on Native",
    /// which is a judgement about the platform rather than a fact about the
    /// shape of a variant, and mixing the two would make it unclear which
    /// kind of completeness the compiler was checking.
    pub fn value(&self) -> PropertyValue<'_> {
        match self {
            StyleProperty::FirstThatWorks(candidates) => candidates
                .first()
                .expect("firstThatWorks always has at least one candidate")
                .value(),
            StyleProperty::Gap(v)
            | StyleProperty::RowGap(v)
            | StyleProperty::ColumnGap(v)
            | StyleProperty::MarginTop(v)
            | StyleProperty::MarginRight(v)
            | StyleProperty::MarginBottom(v)
            | StyleProperty::MarginLeft(v)
            | StyleProperty::MarginInlineStart(v)
            | StyleProperty::MarginInlineEnd(v)
            | StyleProperty::PaddingTop(v)
            | StyleProperty::PaddingRight(v)
            | StyleProperty::PaddingBottom(v)
            | StyleProperty::PaddingLeft(v)
            | StyleProperty::PaddingInlineStart(v)
            | StyleProperty::PaddingInlineEnd(v)
            | StyleProperty::PaddingBlockStart(v)
            | StyleProperty::PaddingBlockEnd(v)
            | StyleProperty::Width(v)
            | StyleProperty::Height(v)
            | StyleProperty::MinWidth(v)
            | StyleProperty::MinHeight(v)
            | StyleProperty::MaxWidth(v)
            | StyleProperty::MaxHeight(v)
            | StyleProperty::TextUnderlineOffset(v)
            | StyleProperty::InsetTop(v)
            | StyleProperty::InsetRight(v)
            | StyleProperty::InsetBottom(v)
            | StyleProperty::InsetLeft(v)
            | StyleProperty::InsetInlineStart(v)
            | StyleProperty::InsetInlineEnd(v)
            | StyleProperty::InsetInline(v)
            | StyleProperty::InsetBlock(v)
            | StyleProperty::InsetBlockStart(v)
            | StyleProperty::InsetBlockEnd(v)
            | StyleProperty::TranslateX(v)
            | StyleProperty::TranslateY(v)
            | StyleProperty::TranslateZ(v)
            | StyleProperty::GradientStopPosition(_, v)
            | StyleProperty::MaskStopPosition(_, _, v)
            | StyleProperty::FlexBasis(v)
            | StyleProperty::BlockSize(v)
            | StyleProperty::InlineSize(v)
            | StyleProperty::MaxBlockSize(v)
            | StyleProperty::MaxInlineSize(v)
            | StyleProperty::MinBlockSize(v)
            | StyleProperty::MinInlineSize(v)
            | StyleProperty::TextIndent(v)
            | StyleProperty::BorderSpacingX(v)
            | StyleProperty::BorderSpacingY(v)
            | StyleProperty::MarginBlockStart(v)
            | StyleProperty::MarginBlockEnd(v)
            | StyleProperty::DivideX(v)
            | StyleProperty::DivideY(v)
            | StyleProperty::SpaceX(v)
            | StyleProperty::SpaceY(v) => PropertyValue::Dimension(v),

            StyleProperty::BorderLogicalWidth(_, v)
            | StyleProperty::BorderTopWidth(v)
            | StyleProperty::BorderRightWidth(v)
            | StyleProperty::BorderBottomWidth(v)
            | StyleProperty::BorderLeftWidth(v)
            | StyleProperty::RingWidth(v)
            | StyleProperty::InsetRingWidth(v)
            | StyleProperty::RingOffsetWidth(v)
            | StyleProperty::FontSize(v)
            | StyleProperty::ScrollMargin(_, v)
            | StyleProperty::ScrollPadding(_, v)
            | StyleProperty::TextDecorationThickness(v)
            | StyleProperty::OutlineWidth(v)
            | StyleProperty::OutlineOffset(v) => PropertyValue::Length(v),

            StyleProperty::BorderRadius(v)
            | StyleProperty::BorderTopLeftRadius(v)
            | StyleProperty::BorderTopRightRadius(v)
            | StyleProperty::BorderBottomRightRadius(v)
            | StyleProperty::BorderBottomLeftRadius(v)
            | StyleProperty::BorderStartStartRadius(v)
            | StyleProperty::BorderStartEndRadius(v)
            | StyleProperty::BorderEndStartRadius(v)
            | StyleProperty::BorderEndEndRadius(v) => PropertyValue::Radius(v),

            StyleProperty::LineHeight(v) => PropertyValue::LineHeight(v),

            StyleProperty::LetterSpacing(v) => PropertyValue::LetterSpacing(v),

            StyleProperty::BackgroundColor(v)
            | StyleProperty::BorderColor(v)
            | StyleProperty::BorderTopColor(v)
            | StyleProperty::BorderRightColor(v)
            | StyleProperty::BorderBottomColor(v)
            | StyleProperty::BorderLeftColor(v)
            | StyleProperty::BorderInlineColor(v)
            | StyleProperty::BorderBlockColor(v)
            | StyleProperty::BorderInlineStartColor(v)
            | StyleProperty::BorderInlineEndColor(v)
            | StyleProperty::BorderBlockStartColor(v)
            | StyleProperty::BorderBlockEndColor(v)
            | StyleProperty::RingColor(v)
            | StyleProperty::InsetRingColor(v)
            | StyleProperty::RingOffsetColor(v)
            | StyleProperty::ShadowColor(v)
            | StyleProperty::InsetShadowColor(v)
            | StyleProperty::DropShadowColor(v)
            | StyleProperty::TextShadowColor(v)
            | StyleProperty::GradientStopColor(_, v)
            | StyleProperty::MaskStopColor(_, _, v)
            | StyleProperty::ScrollbarThumbColor(v)
            | StyleProperty::ScrollbarTrackColor(v)
            | StyleProperty::Fill(v)
            | StyleProperty::Stroke(v)
            | StyleProperty::AccentColor(v)
            | StyleProperty::CaretColor(v)
            | StyleProperty::TextDecorationColor(v)
            | StyleProperty::PlaceholderColor(v)
            | StyleProperty::OutlineColor(v)
            | StyleProperty::DivideColor(v)
            | StyleProperty::TextColor(v) => PropertyValue::Color(v),

            StyleProperty::Display(..)
            | StyleProperty::FlexDirection(..)
            | StyleProperty::Flex(..)
            | StyleProperty::AlignItems(..)
            | StyleProperty::AlignSelf(..)
            | StyleProperty::AlignContent(..)
            | StyleProperty::JustifyContent(..)
            | StyleProperty::ZIndex(..)
            | StyleProperty::Order(..)
            | StyleProperty::Cursor(..)
            | StyleProperty::Columns(..)
            | StyleProperty::RotateNone
            | StyleProperty::ScaleNone
            | StyleProperty::TranslateNone
            | StyleProperty::TransformNone
            | StyleProperty::TransformEmpty
            | StyleProperty::TransformGpu
            | StyleProperty::Transform(..)
            | StyleProperty::TransformOrigin(..)
            | StyleProperty::LineClamp(..)
            | StyleProperty::FlexGrow(..)
            | StyleProperty::FlexShrink(..)
            | StyleProperty::AspectRatio(..)
            | StyleProperty::BorderLogicalStyle(..)
            | StyleProperty::OverflowX(..)
            | StyleProperty::OverflowY(..)
            | StyleProperty::ObjectFit(..)
            | StyleProperty::UserSelect(..)
            | StyleProperty::TextDecorationLine(..)
            | StyleProperty::MixBlendMode(..)
            | StyleProperty::BackgroundBlendMode(..)
            | StyleProperty::KeywordPair(..)
            | StyleProperty::ContainerName(..)
            | StyleProperty::Content(..)
            | StyleProperty::Keyword(..)
            | StyleProperty::LeadingRegister(..)
            | StyleProperty::Arbitrary(..)
            | StyleProperty::WebOnly(..)
            | StyleProperty::GridTemplateColumns(..)
            | StyleProperty::GridTemplateRows(..)
            | StyleProperty::GridColumnStart(..)
            | StyleProperty::GridColumnEnd(..)
            | StyleProperty::GridRowStart(..)
            | StyleProperty::GridRowEnd(..)
            | StyleProperty::GridColumn(..)
            | StyleProperty::GridRow(..)
            | StyleProperty::Position(..)
            | StyleProperty::Opacity(..)
            | StyleProperty::BorderTopStyle(..)
            | StyleProperty::BorderRightStyle(..)
            | StyleProperty::BorderBottomStyle(..)
            | StyleProperty::BorderLeftStyle(..)
            | StyleProperty::Rotate(..)
            | StyleProperty::Scale(..)
            | StyleProperty::Translate(..)
            | StyleProperty::ScaleX(..)
            | StyleProperty::ScaleY(..)
            | StyleProperty::ScaleZ(..)
            | StyleProperty::Scale3d
            | StyleProperty::RotateX(..)
            | StyleProperty::RotateY(..)
            | StyleProperty::RotateZ(..)
            | StyleProperty::SkewX(..)
            | StyleProperty::SkewY(..)
            | StyleProperty::BoxShadow(..)
            | StyleProperty::InsetShadow(..)
            | StyleProperty::ScrollSnapType(..)
            | StyleProperty::ScrollSnapStrictness(..)
            | StyleProperty::RingInset
            | StyleProperty::TextShadow(..)
            | StyleProperty::Filter(..)
            | StyleProperty::FilterRaw(..)
            | StyleProperty::BackdropFilter(..)
            | StyleProperty::FontWeight(..)
            | StyleProperty::FontFamily(..)
            | StyleProperty::FontVariant(..)
            | StyleProperty::Overflow(..)
            | StyleProperty::TextOverflow(..)
            | StyleProperty::WhiteSpace(..)
            | StyleProperty::TransitionProperty(..)
            | StyleProperty::TransitionDuration(..)
            | StyleProperty::TransitionDelay(..)
            | StyleProperty::TransitionTimingFunction(..)
            | StyleProperty::AnimationName(..)
            | StyleProperty::Animation(..)
            | StyleProperty::ThemeAnimation(..)
            | StyleProperty::BackgroundImageNone
            | StyleProperty::BackgroundImage(..)
            | StyleProperty::Gradient(..)
            | StyleProperty::MaskClip(..)
            | StyleProperty::MaskOrigin(..)
            | StyleProperty::MaskMode(..)
            | StyleProperty::MaskType(..)
            | StyleProperty::MaskSize(..)
            | StyleProperty::MaskPosition(..)
            | StyleProperty::MaskRepeat(..)
            | StyleProperty::MaskImageNone
            | StyleProperty::MaskSlotArgument(..)
            | StyleProperty::MaskRadialShape(..)
            | StyleProperty::MaskRadialSize(..)
            | StyleProperty::MaskRadialPosition(..)
            | StyleProperty::MaskComposite(..)
            | StyleProperty::ScrollbarWidth(..)
            | StyleProperty::ScrollbarGutter(..)
            | StyleProperty::ScrollBehavior(..)
            | StyleProperty::StrokeWidth(..)
            | StyleProperty::TextDecorationStyle(..)
            | StyleProperty::OutlineStyle(..)
            | StyleProperty::OutlineHiddenForcedColors
            | StyleProperty::DivideStyle(..)
            | StyleProperty::SpaceReverse(..)
            | StyleProperty::DivideReverse(..)
            | StyleProperty::TextAlign(..)
            | StyleProperty::TextTransform(..) => PropertyValue::Other,
        }
    }

    /// Theme-dependent validation belongs at emission, where named values
    /// are resolved. The theme-free API remains useful for lexical audits.
    pub fn unsupported_on_native_with_theme(&self, theme: &Theme) -> Option<String> {
        if let StyleProperty::FontWeight(weight) = self {
            if weight.native(theme).is_none() {
                return Some(format!(
                    "font-weight `{}` is not a stock React Native font weight (100 through 900 in steps of 100)",
                    weight.css(theme)
                ));
            }
        }
        self.unsupported_on_native()
    }

    pub fn unsupported_on_native(&self) -> Option<String> {
        if let StyleProperty::FirstThatWorks(candidates) = self {
            if candidates.iter().any(|candidate| {
                candidate.not_wired_on_native().is_none()
                    && candidate.unsupported_on_native().is_none()
            }) {
                return None;
            }
            return candidates
                .first()
                .and_then(StyleProperty::unsupported_on_native)
                .or_else(|| {
                    Some(
                        "none of the `firstThatWorks` candidates can be represented on React Native"
                            .to_string(),
                    )
                });
        }
        // A length with nothing to resolve it against. Asked before the
        // property match because it is about the value rather than the
        // property: an `em` is unresolvable in a padding for the same
        // reason it is in a border width.
        //
        // What this replaces is not a gap but a wrong answer. `Length::px`
        // ends in `unwrap_or(0.0)`, so `p-[1.5em]` compiled to a padding
        // of zero and said nothing -- and a wrong number is invisible to
        // the silence check, since a style *was* emitted.
        // Before the unit question, because the two are not alternatives:
        // `calc(100% - 2rem)` may contain no unit at all, or several, and
        // naming one of them would describe the wrong obstacle. The
        // arithmetic is against layout state, which a `StyleSheet` computed
        // ahead of time does not have.
        if let Some(css) = self.css_expression_length() {
            return Some(format!(
                "`{css}`: a CSS expression is resolved against layout, and a React Native style \
                 is a value decided before there is any -- so there is nothing here to compute \
                 it from, and computing it to zero is a size that looks deliberate"
            ));
        }
        if let Some(unit) = self.unresolved_length_unit() {
            return Some(format!(
                "`{unit:?}`: React Native has no viewport units and no font-relative lengths \
                 outside text, so there is nothing here to resolve this against -- and resolving \
                 it to zero, which is what happened before this refusal existed, is a layout \
                 that looks deliberate"
            ));
        }
        // An arbitrary value is a CSS property written out by name, and
        // React Native's style keys are a different vocabulary -- there is
        // no rule that turns one into the other, and guessing a camelCase
        // spelling would produce a key the platform ignores.
        //
        // The Native emitter said this was "refused upstream by
        // `unsupported_on_native`" and it was not: nothing refused it, and
        // `animate-[wiggle_1s_infinite]` compiled to an empty style object
        // with no diagnostic at all. That is the "silent" category the
        // conformance report keeps at zero, and the report did not see it
        // because the arbitrary catalogue is checked for *fidelity* on Web
        // and never for silence on Native.
        if let StyleProperty::Arbitrary(property, value) = self {
            // Except a safe-area inset, which is a value React Native does
            // have -- it arrives through a hook rather than through the
            // cascade. Same shape as the viewport sizes below, and for the
            // same reason: a number only the device knows, that changes
            // when the device rotates.
            if safe_area_inset(property, value).is_some() {
                return None;
            }
            return Some(format!(
                "`{property}: {value}`: an arbitrary value is a CSS property by name, and React \
                 Native's style keys are a different vocabulary -- there is nothing to translate \
                 it into"
            ));
        }
        if let StyleProperty::WebOnly(property, value) = self {
            return Some(format!(
                "`{property}: {value}` is part of StyleX's Web surface, but React Native has no corresponding style property"
            ));
        }
        // Asked before the property-by-property match: a value React Native
        // has no way to hold is unusable whichever size carries it.
        if let Some(Dimension::Css(value)) = self.dimension() {
            return Some(format!(
                "`{value}`: React Native has no intrinsic sizing and no viewport unit that tracks \
                 browser chrome -- there is nothing to resolve it against"
            ));
        }
        // Arbitrary CSS colour text that React Native's colour parser cannot
        // read (`var(--x)`, `calc(...)`, `nonsense`, or non-colour values that
        // fell into Tailwind's colour fallback like `border-[50%]` or `caret-[10px]`).
        if let PropertyValue::Color(color) = self.value() {
            if !color.is_valid_native_color() {
                let value = match color {
                    Color::Css(value) | Color::CssAlpha(value, _) => value.as_str(),
                    _ => "",
                };
                return Some(format!(
                    "`{value}`: React Native requires a resolved colour literal (hex, named colour, \
                     or rgb/hsl function), so this CSS value cannot be lowered"
                ));
            }
        }
        // Viewport-relative sizes were refused here until 2026-08-15. They
        // are not impossible on React Native, only impossible *statically*:
        // the value changes when the device rotates, so it can't live in a
        // `StyleSheet.create` object. The Native backend lowers them to an
        // inline style read from a hook -- see
        // `hozo_native::viewport_object`.
        match self {
            StyleProperty::Content(_) => Some(
                "`content-*`: React Native has no generated content. `::before` and `::after` are boxes the browser makes, and there is nothing here to make one"
                    .to_string(),
            ),
            StyleProperty::Display(d) if !d.is_supported_on_native() => Some(format!(
                "`display: {}`: React Native's layout engine supports only flex, none and contents",
                match d {
                    Display::Block => "block",
                    Display::InlineFlex => "inline-flex",
                    Display::Grid => "grid",
                    Display::Css(keyword) => keyword,
                    _ => unreachable!("guarded by is_supported_on_native"),
                }
            )),
            StyleProperty::GridTemplateColumns(_)
            | StyleProperty::GridTemplateRows(_)
            | StyleProperty::GridColumnStart(_)
            | StyleProperty::GridColumnEnd(_)
            | StyleProperty::GridRowStart(_)
            | StyleProperty::GridRowEnd(_)
            | StyleProperty::GridColumn(_)
            | StyleProperty::GridRow(_) => {
                Some(
                    "grid placement has no standalone React Native style; use it inside a supported Hozo grid container"
                        .to_string(),
                )
            }
            StyleProperty::Order(_) => Some(
                "`order-*`: Yoga lays children out in tree order and has no flex `order`, so the \
                 only way to reorder on React Native is to reorder the elements"
                    .to_string(),
            ),
            StyleProperty::Position(Position::Css(value)) => Some(format!(
                "`position: {value}`: React Native's position is relative or absolute"
            )),
            StyleProperty::TransformGpu => Some(
                "`transform-gpu` requests browser GPU compositing. React Native's transform \
                 array cannot force a hardware compositing layer; use ordinary transforms \
                 rather than assuming this hint controls the Native renderer"
                    .to_string(),
            ),
            StyleProperty::Flex(FlexShorthand::Fraction(_, 0)) => {
                Some("`flex` fraction cannot divide by zero".to_string())
            }
            StyleProperty::Flex(FlexShorthand::BasisUnit(_, unit)) if unit.px().is_none() => {
                Some(format!(
                    "`flex` basis unit `{}` has no fixed pixel size on React Native",
                    unit.css()
                ))
            }
            // Scale3d is metadata selecting the three-axis form. Native
            // lowers its Z component through RN's supported 4x4 matrix.
            StyleProperty::Scale3d => None,
            // The arbitrary transform cases. React Native's transform
            // array takes numbers -- a rotation is a number of degrees and
            // a scale is a ratio -- so a value that stayed CSS text has
            // nothing to become. Named here rather than left out of the
            // composed `transform`, which is where it would otherwise
            // vanish without a word.
            StyleProperty::Rotate(Angle::Css(value))
            | StyleProperty::RotateX(Angle::Css(value))
            | StyleProperty::RotateY(Angle::Css(value))
            | StyleProperty::RotateZ(Angle::Css(value))
            | StyleProperty::SkewX(Angle::Css(value))
            | StyleProperty::SkewY(Angle::Css(value)) => Some(format!(
                "`[{value}]`: React Native's transform takes a number of degrees, and this is CSS \
                 text that only a browser can resolve to one"
            )),
            StyleProperty::Scale(values)
                if values.is_empty()
                    || values.iter().any(|value| matches!(value, Scale::Css(_))) =>
            {
                Some(
                    "`scale`: React Native's scale takes numeric ratios or percentages, not raw \
                     CSS text"
                        .to_string(),
                )
            }
            StyleProperty::ScaleX(Scale::Css(value))
            | StyleProperty::ScaleY(Scale::Css(value))
            | StyleProperty::ScaleZ(Scale::Css(value)) => {
                Some(format!(
                    "`[{value}]`: React Native's scale is a ratio, and this is CSS text that only \
                     a browser can resolve to one"
                ))
            }
            StyleProperty::Translate(values)
                if values.is_empty()
                    || values.iter().any(|value| match value {
                        Dimension::Length(length) => {
                            length.css_expression().is_some()
                                || length.unresolved_unit().is_some()
                        }
                        Dimension::Percent(_) => false,
                        Dimension::Auto
                        | Dimension::ViewportWidth(_)
                        | Dimension::ViewportHeight(_)
                        | Dimension::Css(_) => true,
                    }) =>
            {
                Some(
                    "`translate`: React Native's translate transforms accept statically \
                     resolvable lengths or percentages"
                        .to_string(),
                )
            }
            StyleProperty::LineClamp(Some(Clamp::Css(value))) => Some(format!(
                "`line-clamp-[{value}]`: React Native's numberOfLines is a line count, and this \
                 isn't one"
            )),
            // React Native's `backgroundImage` parses CSS gradient syntax,
            // but only the linear and radial functions -- `BackgroundImageValue`
            // is `LinearGradientValue | RadialGradientValue` and there is no
            // conic one.
            StyleProperty::Gradient(GradientKind::Conic, _) => Some(
                "`bg-conic-*`: React Native's backgroundImage has linear and radial gradients \
                 and no conic one"
                    .to_string(),
            ),
            StyleProperty::Gradient(kind, prelude)
                if !native_gradient_prelude_valid(*kind, prelude) =>
            {
                Some(format!(
                    "`{prelude}`: React Native's {} requires a valid direction, angle, or radial \
                     shape/position prelude",
                    kind.css()
                ))
            }
            StyleProperty::BoxShadow(value) | StyleProperty::InsetShadow(value)
                if resolve_native_box_shadow(value).is_none() =>
            {
                Some(format!(
                    "`{value}`: React Native's boxShadow requires concrete offset lengths (in px \
                     or foldable units) and valid colours"
                ))
            }
            StyleProperty::Filter(function, value)
                if resolve_native_filter(*function, value).is_none() =>
            {
                Some(format!(
                    "`{value}`: React Native's filter requires concrete function arguments (px \
                     lengths, angles, or numeric/percentage factors)"
                ))
            }
            StyleProperty::TransformOrigin(value)
                if resolve_native_transform_origin(value).is_none() =>
            {
                Some(format!(
                    "`{value}`: React Native's transformOrigin accepts edge keywords, percentages, \
                     or statically resolvable lengths"
                ))
            }
            StyleProperty::DivideX(Dimension::Percent(_) | Dimension::Auto)
            | StyleProperty::DivideY(Dimension::Percent(_) | Dimension::Auto) => Some(
                "`divide-x`/`divide-y`: React Native's border widths take a numeric pixel value, \
                 not a percentage or `auto`"
                    .to_string(),
            ),
            StyleProperty::TranslateX(Dimension::Auto)
            | StyleProperty::TranslateY(Dimension::Auto) => Some(
                "`translate-x-[auto]`/`translate-y-[auto]`: React Native's translate transforms \
                 accept lengths or percentages, not `auto`"
                    .to_string(),
            ),
            StyleProperty::MaxWidth(Dimension::Auto)
            | StyleProperty::MaxHeight(Dimension::Auto) => Some(
                "`max-w-[auto]`/`max-h-[auto]`: `auto` is not a valid CSS maximum size"
                    .to_string(),
            ),
            StyleProperty::PaddingTop(Dimension::Auto)
            | StyleProperty::PaddingRight(Dimension::Auto)
            | StyleProperty::PaddingBottom(Dimension::Auto)
            | StyleProperty::PaddingLeft(Dimension::Auto)
            | StyleProperty::PaddingInlineStart(Dimension::Auto)
            | StyleProperty::PaddingInlineEnd(Dimension::Auto)
            | StyleProperty::PaddingBlockStart(Dimension::Auto)
            | StyleProperty::PaddingBlockEnd(Dimension::Auto)
            | StyleProperty::Gap(Dimension::Auto)
            | StyleProperty::RowGap(Dimension::Auto)
            | StyleProperty::ColumnGap(Dimension::Auto) => Some(
                "`auto`: padding and gap take lengths or percentages, not `auto`"
                    .to_string(),
            ),
            StyleProperty::ZIndex(None) => Some(
                "`z-auto`: React Native's zIndex is a number and has no auto".to_string(),
            ),
            StyleProperty::AspectRatio(value) if parse_native_aspect_ratio(value).is_none() => {
                Some(if value == "auto" {
                    "`aspect-auto`: React Native's aspectRatio is a number and has no auto"
                        .to_string()
                } else {
                    format!(
                        "`aspect-[{value}]`: React Native's aspectRatio requires a positive number \
                         or `w / h` ratio"
                    )
                })
            }
            StyleProperty::Columns(_) => {
                Some("`columns-*`: React Native has no multi-column layout".to_string())
            }
            // A CSS value React Native's union for that property doesn't
            // have. Each one is a genuine keyword there is no equivalent
            // for -- `overflow: clip`, `justify-content: safe center` --
            // rather than a spelling difference, so approximating would
            // change the layout rather than the text.
            StyleProperty::Overflow(Overflow::Css(value)) => Some(format!(
                "`overflow: {value}`: React Native's overflow is visible, hidden or scroll"
            )),
            StyleProperty::AlignItems(Align::Css(value))
            | StyleProperty::AlignContent(Justify::Css(value))
            | StyleProperty::JustifyContent(Justify::Css(value)) => Some(format!(
                "`{value}` alignment: React Native's alignment values don't include it"
            )),
            // RN's alignContent has stretch but not baseline; its
            // justifyContent has neither. The two share `Justify`, so the
            // legality is per property rather than per value.
            StyleProperty::AlignContent(Justify::Baseline) => Some(
                "`content-baseline`: React Native's alignContent has no baseline".to_string(),
            ),
            StyleProperty::JustifyContent(Justify::Stretch | Justify::Baseline) => Some(
                "`justify-stretch`/`justify-baseline`: React Native's justifyContent has neither"
                    .to_string(),
            ),
            StyleProperty::AlignSelf(AlignSelf::Css(value)) => Some(format!(
                "`self-{value}`: React Native's alignSelf values don't include it"
            )),
            StyleProperty::WhiteSpace(WhiteSpace::Css(value)) => Some(format!(
                "`white-space: {value}`: React Native's Text has no white-space control beyond \
                 wrapping"
            )),
            // React Native has only the combined `overflow`.
            StyleProperty::OverflowX(_) | StyleProperty::OverflowY(_) => Some(
                "`overflow-x-*`/`overflow-y-*`: React Native has one `overflow` for both axes"
                    .to_string(),
            ),
            // `border-s-2` writes `border-inline-start-style: solid` beside
            // its width, as Tailwind does. Solid is what React Native draws
            // every edge with unless told otherwise, so that one asks for
            // nothing and is not refused: it was failing the build for
            // `border-s-2`, whose width Native had already lowered.
            StyleProperty::BorderLogicalStyle(_, BorderStyle::Solid | BorderStyle::Default) => None,
            StyleProperty::BorderLogicalStyle(_, _) => Some(
                "logical or side-specific border styles: React Native has one `borderStyle` for all four edges"
                    .to_string(),
            ),
            StyleProperty::TextDecorationLine("overline") => Some(
                "`overline`: React Native's textDecorationLine has underline and line-through, \
                 not overline"
                    .to_string(),
            ),
            // The long tail. React Native has three of these properties and
            // none of the rest -- checked against its own StyleSheet types
            // rather than assumed, the same way the refusal audit checks
            // everything else here.
            StyleProperty::KeywordPair(_, _, property, _) => {
                Some(format!("`{property}`: React Native has no such style"))
            }
            // Two keyword properties React Native has but narrower than CSS.
            // Found by type-checking the emitted styles against RN rather
            // than by reading its docs -- the allowlist above only asked
            // whether the *property* exists.
            StyleProperty::Keyword("vertical-align", value)
                if !matches!(*value, "auto" | "top" | "bottom" | "middle") =>
            {
                Some(format!(
                    "`align-{value}`: React Native's verticalAlign is auto, top, bottom or middle"
                ))
            }
            // The colour half of a family whose other half React Native
            // does not have. `text-shadow` is refused by the keyword arm
            // below and the colour has to be refused with it, or a rule
            // that says nothing on Native would quietly say nothing *and*
            // report nothing.
            // Was refused by the keyword arm below until it stopped being
            // a keyword; naming it here keeps the refusal it always had.
            StyleProperty::ScrollSnapType(_) | StyleProperty::ScrollSnapStrictness(_) => Some(
                "`snap-*`: React Native scroll-snaps through ScrollView's own props, not \
                 through a style"
                    .to_string(),
            ),
            StyleProperty::TextShadow(TextShadowValue::Web(_))
            | StyleProperty::TextShadowColor(_) => Some(
                "`text-shadow-*`: React Native has textShadowColor, textShadowOffset and \
                 textShadowRadius on Text and no way to write more than one layer, which is \
                 what every size in this scale is"
                    .to_string(),
            ),
            StyleProperty::MixBlendMode("plus-darker") => Some(
                "`mix-blend-plus-darker`: React Native's blend modes have plus-lighter and not plus-darker"
                    .to_string(),
            ),
            // RN has no user-resize handle. Asking for *none* therefore has
            // its exact effect already; this does not sanction dropping a
            // request for a horizontal/vertical/both handle below.
            StyleProperty::Keyword("resize", "none") => None,
            // The `clip-path` companion emitted by `sr-only` / `not-sr-only`.
            // React Native visually hides screen-reader-only content via the
            // 1px `overflow: 'hidden'` box the rest of `sr-only` already sets
            // (and never via `opacity: 0`, which iOS VoiceOver hides); Web
            // keeps `clip-path: inset(50%)` / `none` verbatim. Arbitrary
            // `[clip-path:...]` and StyleX `clipPath` arrive via `Arbitrary` /
            // `WebOnly` and remain refused on Native.
            StyleProperty::Keyword("clip-path", "inset(50%)" | "none") => None,
            StyleProperty::Keyword(property, _)
                if !matches!(*property,
                    "user-select"
                        | "vertical-align"
                        | "transform-origin"
                        | "backface-visibility"
                        | "box-sizing"
                        | "isolation"
                        | "pointer-events"
                        | "font-style"
                        | "direction"
                        | "flex-wrap"
                        // Not a style on React Native, and not refused
                        // either: `@container` is honoured by rendering
                        // the element as a component that measures itself.
                        // The declaration is consumed there rather than
                        // emitted, the way the grid utilities are.
                        | "container-type"
                ) =>
            {
                Some(format!("`{property}`: React Native has no such style"))
            }
            StyleProperty::BackgroundBlendMode(_) => Some(
                "`bg-blend-*`: React Native has `mixBlendMode` but no background-blend-mode -- there is no separate background layer there to blend against"
                    .to_string(),
            ),
            // React Native has no backdrop-filter style key. The Native
            // backend consumes the supported static blur subset through an
            // opt-in component adapter; every other occurrence reaches this
            // explicit diagnostic instead of becoming an inert style.
            StyleProperty::BackdropFilter(..) => Some(
                "`backdrop-*`: React Native has no backdrop-filter style -- blurring what's \
                 behind a view needs the supported View adapter context"
                    .to_string(),
            ),
            // React Native's `cursor` is real but narrow: `auto` and
            // `pointer` only, which is what a pointer-capable target
            // (tablet with a trackpad, macOS/Windows/visionOS) can act on.
            // The rest are refused by name rather than silently flattened
            // to `pointer`, which would claim an affordance the app doesn't
            // have.
            StyleProperty::Cursor(keyword) if keyword != "auto" && keyword != "pointer" => {
                Some(format!(
                    "`cursor-{keyword}`: React Native's cursor accepts only `auto` and `pointer`"
                ))
            }
            // `letter-spacing` in em and a unitless `line-height` are
            // deliberately absent here even though React Native has neither
            // form as a style. Both are relative to the font size, and when
            // a font size is set on the same element the compiler can
            // resolve them -- so whether they're expressible depends on the
            // node, which this method can't see. `hozo_native`'s
            // `font_relative_reason` answers it for the cases it can't fold.
            // `text-overflow` and `white-space: nowrap` are deliberately
            // absent here even though React Native has neither as a style.
            // Together they describe truncation, which RN expresses as
            // `numberOfLines`/`ellipsizeMode` *props* on `Text` -- so
            // whether they're supportable depends on the node they're on,
            // which this function can't see. `hozo_native` decides,
            // absorbing them into props where it can and refusing them
            // where it can't.
            StyleProperty::TransitionProperty(_)
            | StyleProperty::TransitionDuration(..)
            | StyleProperty::TransitionDelay(..)
            | StyleProperty::TransitionTimingFunction(..) => Some(
                "CSS transitions: React Native has no declarative transition in its StyleSheet"
                    .to_string(),
            ),
            // Lowered to `useHozoKeyframes` (decision 007, slice 3).
            StyleProperty::AnimationName(_) => None,
            // All four of Tailwind's loops are wired now. They move only
            // opacity and transform, which is what let them share one
            // native-driver hook -- and what keeps them running on the UI
            // thread while JavaScript is busy, the moment a spinner or a
            // skeleton is usually on screen.
            StyleProperty::Animation(_) => None,
            // Paint on an SVG element is lowered as a *prop*, which is
            // where `react-native-svg` takes it -- so it is not refused
            // there. This message is for paint on anything else, where
            // there is no SVG element under it to paint.
            StyleProperty::Fill(_) | StyleProperty::Stroke(_) | StyleProperty::StrokeWidth(_) => {
                Some(
                    "SVG paint on something that is not an SVG element. React Native has no SVG \
                     in core; inside `<Svg>` Hozo lowers this to a `react-native-svg` prop, and \
                     outside one there is nothing for it to paint"
                        .to_string(),
                )
            }
            StyleProperty::AccentColor(_) => Some(
                "`accent-*`: it tints native form controls, which React Native doesn't have"
                    .to_string(),
            ),
            StyleProperty::CaretColor(_) => Some(
                "`caret-*`: React Native carries this on `TextInput`'s `cursorColor` prop, not \
                 in a StyleSheet; a runtime-resolved class has no target primitive to put it on"
                    .to_string(),
            ),
            StyleProperty::MaskClip(_)
            | StyleProperty::MaskOrigin(_)
            | StyleProperty::MaskMode(_)
            | StyleProperty::MaskType(_)
            | StyleProperty::MaskSize(_)
            | StyleProperty::MaskPosition(_)
            | StyleProperty::MaskRepeat(_)
            | StyleProperty::MaskImageNone
            | StyleProperty::MaskStopColor(..)
            | StyleProperty::MaskStopPosition(..)
            | StyleProperty::MaskSlotArgument(..)
            | StyleProperty::MaskRadialShape(_)
            | StyleProperty::MaskRadialSize(_)
            | StyleProperty::MaskRadialPosition(_)
            | StyleProperty::MaskComposite(_) => Some(
                "`mask-*`: React Native has no masking of any kind -- no mask-image, no \
                 mask-clip, nothing to approximate it with"
                    .to_string(),
            ),
            StyleProperty::TranslateZ(_) => Some(
                "`translate-z-*`: React Native's transform has no 3D translation".to_string(),
            ),
            StyleProperty::TextIndent(_) => {
                Some("`indent-*`: React Native has no text-indent".to_string())
            }
            StyleProperty::BorderSpacingX(_) | StyleProperty::BorderSpacingY(_) => Some(
                "`border-spacing-*`: it applies to a separated-border table, which React Native \
                 has no equivalent of"
                    .to_string(),
            ),
            StyleProperty::ScrollbarWidth(_)
            | StyleProperty::ScrollbarGutter(_)
            | StyleProperty::ScrollbarThumbColor(_)
            | StyleProperty::ScrollbarTrackColor(_) => Some(
                "`scrollbar-*`: React Native's scroll indicators are configured with props on \
                 ScrollView (`indicatorStyle`, `showsVerticalScrollIndicator`), not styled"
                    .to_string(),
            ),
            StyleProperty::ScrollMargin(..)
            | StyleProperty::ScrollPadding(..)
            | StyleProperty::ScrollBehavior(_) => Some(
                "`scroll-m-*`/`scroll-p-*`/`scroll-smooth`: these tune CSS scroll-snap and \
                 smooth scrolling, neither of which React Native's ScrollView exposes as a style"
                    .to_string(),
            ),
            StyleProperty::TextDecorationThickness(_) | StyleProperty::TextUnderlineOffset(_) => {
                Some(
                    "`decoration-<n>`/`underline-offset-*`: React Native draws its text \
                     decorations at a fixed thickness and offset, and exposes neither"
                        .to_string(),
                )
            }
            StyleProperty::BorderTopStyle(BorderStyle::Double | BorderStyle::Hidden)
            | StyleProperty::BorderRightStyle(BorderStyle::Double | BorderStyle::Hidden)
            | StyleProperty::BorderBottomStyle(BorderStyle::Double | BorderStyle::Hidden)
            | StyleProperty::BorderLeftStyle(BorderStyle::Double | BorderStyle::Hidden)
            | StyleProperty::OutlineStyle(BorderStyle::Double | BorderStyle::Hidden) => Some(
                "`double`/`hidden` border styles: React Native accepts only solid, dotted and \
                 dashed"
                    .to_string(),
            ),
            StyleProperty::DivideStyle(BorderStyle::Double | BorderStyle::Hidden) => Some(
                "`divide-double`/`divide-hidden`: React Native's borderStyle accepts only solid, \
                 dotted and dashed"
                    .to_string(),
            ),
            _ => None,
        }
    }
}

#[cfg(test)]
mod property_value_tests {
    use super::*;

    #[test]
    fn a_length_is_found_in_every_shape_that_wraps_one() {
        let em = Length::Unit(1.5, LengthUnit::Em);
        // Typed as a length, inside a `Dimension`, and inside each of the
        // three small enums that carry one beside something that is not a
        // length. The last three are the ones a hand-written list kept
        // missing, and each miss was a zero emitted in silence.
        for property in [
            StyleProperty::PaddingTop(Dimension::Length(em.clone())),
            StyleProperty::Width(Dimension::Length(em.clone())),
            StyleProperty::BorderRadius(Radius::Length(em.clone())),
            StyleProperty::LineHeight(LineHeight::Length(em.clone())),
            StyleProperty::LetterSpacing(LetterSpacing::Px(em.clone())),
            // The value is the last field wherever a property carries more
            // than one, which is what lets `value()` group them.
            StyleProperty::ScrollMargin(Edge::Top, em.clone()),
        ] {
            assert_eq!(
                property.unresolved_length_unit(),
                Some(LengthUnit::Em),
                "{property:?} hides its length from `value()`"
            );
        }
    }

    #[test]
    fn the_alternatives_inside_those_wrappers_carry_no_length() {
        // `Full` and `Ratio` are the halves that are not lengths, and
        // answering for them would be worse than answering nothing.
        assert_eq!(
            StyleProperty::BorderRadius(Radius::Full).unresolved_length_unit(),
            None
        );
        let ratio = StyleProperty::LineHeight(LineHeight::Ratio(1.5));
        assert_eq!(ratio.unresolved_length_unit(), None);
    }

    #[test]
    fn a_gradient_stop_position_is_a_dimension_like_any_other() {
        // Both of these carry a `Dimension` and neither was in the list
        // `dimension()` used to keep, which is what the exhaustive match
        // found the moment it was written.
        let css = Dimension::Css("calc(100% - 2rem)".to_string());
        let stop = StyleProperty::GradientStopPosition(GradientStop::From, css.clone());
        assert_eq!(stop.dimension(), Some(&css));
        let mask = StyleProperty::MaskStopPosition(MaskSlot::Top, MaskStop::From, css.clone());
        assert_eq!(mask.dimension(), Some(&css));
    }

    #[test]
    fn a_property_that_holds_no_value_says_so() {
        assert_eq!(
            StyleProperty::Display(Display::Flex).value(),
            PropertyValue::Other
        );
        assert_eq!(StyleProperty::TransformNone.value(), PropertyValue::Other);
        assert_eq!(
            StyleProperty::Arbitrary("z-index".to_string(), "3".to_string()).value(),
            PropertyValue::Other
        );
    }
}
