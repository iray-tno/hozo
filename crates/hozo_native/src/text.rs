//! Text-specific lowering for the React Native backend.
//!
//! React Native models inheritance and several CSS text concepts differently
//! from the browser, so wrappers, metric folding, and prop lowering live here.

use super::*;

mod field_colours;
mod font_relative;
mod line_breaks;
mod wrap;

pub(crate) use field_colours::{
    caret_colour, caret_only_reason, caret_props, placeholder_colour, placeholder_only_reason,
    placeholder_props, placeholder_value, selection_colour, selection_props,
};
pub(crate) use font_relative::{fold_font_relative, font_relative_reason};
pub(crate) use line_breaks::{
    is_truncation_declaration, line_break_strategy_ios, line_breaking, text_break_strategy,
    truncation_only_reason, truncation_props,
};
pub(crate) use wrap::{is_text_primitive, is_text_property, text_reach, wrap_in_text, TextReach};

/// React Native's own default, from `RCTFont.mm`:
/// `const CGFloat defaultFontSize = 14`.
///
/// What a relative size scales against when nothing named one, which is
/// most text. Mirrored by `HOZO_DEFAULT_FONT_SIZE` in `@hozo/engine`,
/// where the runtime half falls back to the same number.
///
/// Two shapes it gets wrong, both of which were wrong before it existed
/// too -- the old behaviour was to emit nothing, so the text simply did
/// not shrink:
///
/// 1. A component the compiler cannot read that renders a `Text` around
///    its children and sets a size on it. React Native inherits only
///    `Text` to `Text`, so that is the one shape a foreign component can
///    affect -- a design system's `<Body>` with a Hozo `<Small>` inside.
///    Nothing fixes it: handing the ratio to `HozoRelativeText` reads the
///    same default, because that component publishes into no context, and
///    React Native offers no way to ask what size is being inherited.
///    Using a Hozo `Text` in between is what makes it work.
///
/// 2. A project that changes the default globally -- `Text.defaultProps`,
///    or an Android theme. Everything then scales from a number that is
///    no longer the default.
///
/// If either turns out to bite, the answer is a diagnostic rather than a
/// cleverer guess: say that the base is not visible here and that 14 was
/// assumed. It is not written yet because it would fire on ordinary
/// migration code, and a warning nobody can act on is noise. Someone
/// hitting it is the evidence that would settle that.
pub(super) const DEFAULT_FONT_SIZE: f64 = 14.0;
/// How much smaller than the text around it each of these draws, in a
/// project that ships Tailwind's preflight.
///
/// Mirrored by `packages/typography/src/text-size.ts`, which the fallback
/// components use, and checked against it by `ratios.test.ts`. Two copies
/// of a number is how a compiled build and an uncompiled one come to
/// render the same source at different sizes.
///
/// These were described as the user agent's, and are not: preflight sets
/// `sub`/`sup` to 75% and `small` to 80%, while the bare user agent sets
/// all three to `smaller`. Measured in headless Chrome at bases 16, 20 and
/// 32, with and without this repository's own generated preflight:
///
/// ```text
///             bare UA    preflight
///   small     0.8333     0.80
///   sub, sup  0.8333     0.75
///   rt        0.50       0.50
///   code      1.0        1.0
/// ```
///
/// So `small` was 0.85 in both copies and 0.85 is neither number: small
/// print came out a size the browser never draws it at, whichever project
/// it was compiled for. `sub` and `sup` were right, for reset projects
/// only (#315).
///
/// `rt` and `code` are the same on both sides and stay single constants.
/// The 13px a bare `<code>` measures at is Chrome's fixed-font default
/// applying to a `medium` size, not a ratio -- give any ancestor a size in
/// pixels, which every Hozo utility does, and it inherits it whole.
pub(super) const SUB_RATIO: f64 = 0.75;
pub(super) const SUP_RATIO: f64 = 0.75;
pub(super) const SMALL_RATIO: f64 = 0.8;
/// `font-size: smaller`, which is what the user agent gives all three of
/// `small`, `sub` and `sup` when nothing has reset it.
///
/// The CSS scaling factor, not a rounded measurement: Chrome divides by
/// 1.2, and measured the same at every base tried.
pub(super) const SMALLER_RATIO: f64 = 1.0 / 1.2;
pub(super) const RUBY_TEXT_RATIO: f64 = 0.5;
pub(super) const HEADING_RATIOS: [f64; 6] = [2.0, 1.5, 1.17, 1.0, 0.83, 0.67];

/// What this element scales the surrounding text size by, if it does.
///
/// `None` for everything that is not relative, and for a heading whose
/// level is a runtime expression -- that is one of six ratios and the
/// compiler cannot tell which.
///
/// The theme, because three of these are one number under a reset and a
/// different one without it, and because a reset heading is not relative
/// at all: preflight gives `h1`-`h6` `font-size: inherit`, which is the
/// absence of a ratio rather than a ratio of one. Answering it here rather
/// than at each caller is what makes the runtime path agree with the
/// compiled one -- an opaque parent hands this ratio to
/// `HozoRelativeText`, and a heading scaling by 2 there while the compiled
/// one scales by nothing is the same source at two sizes (#315).
pub(super) fn size_ratio(node: &Node, theme: &Theme) -> Option<f64> {
    let reset = theme.preflight();
    match node.primitive {
        Primitive::Sub => Some(if reset { SUB_RATIO } else { SMALLER_RATIO }),
        Primitive::Sup => Some(if reset { SUP_RATIO } else { SMALLER_RATIO }),
        Primitive::Small => Some(if reset { SMALL_RATIO } else { SMALLER_RATIO }),
        Primitive::RubyText => Some(RUBY_TEXT_RATIO),
        Primitive::Heading if reset => None,
        Primitive::Heading => {
            let level = match &node.props.heading_level {
                Some(hozo_ir::HeadingLevel::Static(level)) => *level,
                Some(hozo_ir::HeadingLevel::Dynamic(_)) => return None,
                // What both `Heading` components default to.
                None => 1,
            };
            Some(HEADING_RATIOS[(level.clamp(1, 6) - 1) as usize])
        }
        _ => None,
    }
}

/// Whether this element carries a style the compiler cannot read.
///
/// A `style={{...}}` prop or a `{...spread}`. Either can name a font
/// size, and neither is a declaration Hozo resolved -- so a ratio
/// resolved against what the compiler *can* see would be scaling from a
/// number that is not the one on screen.
pub(super) fn size_is_opaque(node: &Node) -> bool {
    node.props
        .passthrough
        .iter()
        .any(|prop| prop.is_spread || prop.name.as_deref() == Some("style"))
}

/// Whether anything below this element scales against its size.
///
/// Asked of an opaque element, to decide whether it has to publish the
/// size it resolves at runtime. Most do not, and a component boundary
/// nobody reads is one nobody should pay for.
pub(super) fn has_relative_descendant(node: &Node, theme: &Theme) -> bool {
    node.children.iter().any(|child| match child {
        hozo_ir::Child::Node(child) => {
            size_ratio(child, theme).is_some() || has_relative_descendant(child, theme)
        }
        _ => false,
    })
}
#[cfg(test)]
mod tests;
