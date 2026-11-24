use super::*;

#[test]
fn space_x_becomes_a_child_scoped_rule() {
    // `space-*` is the one utility that styles the element's children
    // rather than the element, so it can't be a declaration on the
    // node's own rule.
    let source = r#"
        import { View } from '@hozo/core'
        const el = <View className="space-x-2" />
        "#;
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());
    assert!(output.css.contains(":where(.hozo-0 > :not(:last-child)) {"));
    assert!(output.css.contains("margin-inline-end: 8px;"));
    // Not on the element itself.
    assert!(!output.css.contains(".hozo-0 { margin-inline-end"));
}

/// Compiles one element with `classes` and returns its CSS.
fn css_for(classes: &str) -> String {
    let source = format!(
        "import {{ View }} from '@hozo/core'\nconst el = <View className=\"{classes}\" />\n"
    );
    let parsed = hozo_parser::parse_tsx(&source);
    lower(&parsed.roots[0].node, &source, &Theme::default()).css
}

#[test]
fn stylesheets_are_laid_out_for_reading() {
    // What the REPL shows and what lands in a `.hozo.css`. The base rule
    // used to open `:where(.hozo-view) { display: flex;` -- a Rust line
    // continuation after `{ ` swallowed the newline -- and a query's
    // rules sat at the query's own indentation.
    let css = css_for("p-4 md:hover:p-8");
    assert!(
        css.contains(":where(.hozo-view) {\n    display: flex;\n"),
        "{css}"
    );
    assert!(
        css.contains(
            "@media (width >= 768px) {\n  @media (hover: hover) {\n    .hozo-0:hover {\n      padding-top: 32px;\n"
        ),
        "{css}"
    );
    assert!(!css.contains("{ display"), "{css}");
}

#[test]
fn the_translate_axes_share_one_declaration() {
    // CSS `translate` is one property taking up to three values. Until
    // 2026-08-15 each axis emitted its own `translate:`, so this pair
    // wrote two declarations and last-wins threw the x away. The
    // conformance suite can't see it -- it compiles one utility at a
    // time, and each was correct alone.
    assert!(css_for("translate-x-4").contains("translate: 16px 0;"));
    assert!(css_for("translate-y-8").contains("translate: 0 32px;"));
    let css = css_for("translate-x-4 translate-y-8");
    assert!(css.contains("translate: 16px 32px;"), "{css}");
    assert_eq!(css.matches("translate:").count(), 1, "{css}");
}

#[test]
fn responsive_text_defaults_read_the_explicit_leading_register() {
    for classes in [
        "text-lg sm:text-xl leading-relaxed",
        "leading-relaxed sm:text-xl text-lg",
    ] {
        let css = css_for(classes);
        assert!(css.contains("--tw-leading: 1.625;"), "{css}");
        assert!(
            css.contains("line-height: var(--tw-leading, 28px);"),
            "{css}"
        );
        assert!(css.contains("@property --tw-leading"), "{css}");
        assert!(css.contains("inherits: false"), "{css}");
    }
    let sheet = render_candidate_stylesheet(
        &["text-xl".to_string(), "leading-relaxed".to_string()],
        &Theme::default(),
    );
    assert_eq!(sheet.matches("@property --tw-leading").count(), 1);
    assert!(sheet.contains("--tw-leading: 1.625;"));
}

#[test]
fn scrollbar_thumb_and_track_share_one_declaration() {
    // `scrollbar-color` takes both halves at once, so writing only one
    // still has to name the other -- Tailwind's registers default to
    // transparent, not to the UA's own colours.
    assert!(css_for("scrollbar-thumb-red-500")
        .contains("scrollbar-color: oklch(63.7% 0.237 25.331) #0000;"));
    assert!(css_for("scrollbar-track-blue-500")
        .contains("scrollbar-color: #0000 oklch(62.3% 0.214 259.815);"));

    let css = css_for("scrollbar-thumb-red-500 scrollbar-track-blue-500");
    assert!(
        css.contains("scrollbar-color: oklch(63.7% 0.237 25.331) oklch(62.3% 0.214 259.815);"),
        "{css}"
    );
}

#[test]
fn mask_utilities_compose_into_one_resolved_layer_list() {
    // Tailwind assembles `mask-image` from `--tw-mask-*` registers, so
    // several utilities contribute to one declaration. The conformance
    // suite only ever compiles one at a time, so the combinations are
    // pinned here instead.
    let css = css_for("mask-x-from-4 mask-x-to-80%");
    assert!(
        css.contains(
            "mask-image: linear-gradient(to left, black 16px, transparent 80%), \
             linear-gradient(to right, black 16px, transparent 80%), \
             linear-gradient(#fff, #fff), linear-gradient(#fff, #fff), \
             linear-gradient(#fff, #fff), linear-gradient(#fff, #fff);"
        ),
        "{css}"
    );

    // An angle and a stop land in the same gradient.
    let css = css_for("mask-linear-45 mask-linear-from-red-500");
    assert!(
        css.contains(
            "mask-image: linear-gradient(45deg, oklch(63.7% 0.237 25.331) 0%, \
             transparent 100%), linear-gradient(#fff, #fff), linear-gradient(#fff, #fff);"
        ),
        "{css}"
    );

    // The radial shaping utilities paint nothing alone but change the
    // gradient another utility supplies.
    let css = css_for("mask-radial-from-4 mask-circle mask-radial-at-top");
    assert!(
        css.contains("radial-gradient(circle farthest-corner at top, "),
        "{css}"
    );
}

#[test]
fn a_mask_composite_alone_emits_no_layer_list() {
    // `mask-add` with nothing to composite is just the composite mode;
    // emitting a fully-opaque `mask-image` would be a no-op declaration
    // Tailwind doesn't write either.
    let css = css_for("mask-add");
    assert!(css.contains("mask-composite: add;"), "{css}");
    assert!(!css.contains("mask-image"), "{css}");
}

#[test]
fn radial_shaping_alone_paints_nothing() {
    assert!(!css_for("mask-circle").contains("mask-image"));
}

#[test]
fn placeholder_colour_scopes_itself_to_the_pseudo_element() {
    // The conformance suite cannot catch this: it compares
    // declarations, and the difference between tinting the placeholder
    // and tinting the real text lives entirely in the selector. Emitted
    // as a plain `color` this would score a false match while doing the
    // wrong thing.
    let css = css_for("placeholder-red-500");
    assert!(css.contains(".hozo-0::placeholder {"), "{css}");
    assert!(!css.contains(".hozo-0 {"), "{css}");
}

#[test]
fn divide_becomes_a_child_scoped_rule_like_space() {
    // `divide-*` styles the gaps *between* children, so like `space-*`
    // it can't be a declaration on the element itself.
    let css = css_for("divide-y-4");
    assert!(
        css.contains(":where(.hozo-0 > :not(:last-child)) {"),
        "{css}"
    );
    // Tailwind writes both edges, zeroing the leading one, so
    // `divide-*-reverse` can flip which edge carries the border without
    // a different rule -- matched here so the output stays identical.
    assert!(css.contains("border-top-width: 0;"), "{css}");
    assert!(css.contains("border-bottom-width: 4px;"), "{css}");
}

#[test]
fn outline_width_carries_a_style_so_it_actually_renders() {
    // Same reason border widths do: CSS defaults `outline-style` to
    // `none`, so a width alone shows nothing.
    let css = css_for("outline-2");
    assert!(css.contains("outline-style: solid;"), "{css}");
    assert!(css.contains("outline-width: 2px;"), "{css}");
}

#[test]
fn ring_and_shadow_compose_into_one_box_shadow() {
    // The whole point of keeping these as separate IR properties. A
    // single `BoxShadow` would make the later utility win under
    // `dedupe_last_wins`, and the conformance suite can't catch it --
    // it compares one utility at a time, and a ring colour paints
    // nothing on its own.
    let css = css_for("ring-2 ring-blue-500 shadow-lg");
    assert!(
        css.contains(
            "box-shadow: 0 0 0 2px oklch(62.3% 0.214 259.815), \
             0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1);"
        ),
        "{css}"
    );
}

#[test]
fn a_ring_defaults_to_currentcolor_and_stacks_inside_out() {
    // Tailwind's default ring colour, and its layer order: inset ring
    // before ring before shadow.
    let css = css_for("inset-ring-4 ring-2");
    assert!(
        css.contains("box-shadow: inset 0 0 0 4px currentcolor, 0 0 0 2px currentcolor;"),
        "{css}"
    );
}

#[test]
fn shadow_none_clears_the_shadow_without_taking_the_ring_with_it() {
    assert!(css_for("shadow-none").contains("box-shadow: none;"));
    // `none` as the whole declaration would erase the ring too, which
    // is not what Tailwind's register-clearing does.
    let css = css_for("shadow-none ring-2");
    assert!(css.contains("box-shadow: 0 0 0 2px currentcolor;"), "{css}");
}

#[test]
fn a_ring_colour_alone_paints_nothing() {
    // Correct, not a gap: there is no width to paint. Tailwind emits
    // only a custom property here for the same reason.
    assert!(!css_for("ring-blue-500").contains("box-shadow"));
}

#[test]
fn animation_emits_its_keyframes_once() {
    let source = r#"
        import { View, Text } from '@hozo/core'
        const el = (
          <View className="animate-spin">
            <Text className="animate-spin">x</Text>
          </View>
        )
        "#;
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());
    assert!(output.css.contains("animation: spin 1s linear infinite;"));
    // An `animation` declaration is inert without its keyframes, and
    // two users of the same animation must not duplicate the block.
    assert_eq!(output.css.matches("@keyframes spin").count(), 1);
}

#[test]
fn the_subtree_variants_move_the_styled_element_not_the_condition() {
    // The mirror of `group-`: that moves the condition onto another
    // element and styles this one, and this styles another element
    // under the condition as written. Which is why the two orders mean
    // different things and fall out of the fold rather than a list.
    assert!(css_for("*:flex").contains(":is(.hozo-0 > *) {"));
    assert!(css_for("**:flex").contains(":is(.hozo-0 *) {"));
    // The child is hovered.
    assert!(css_for("*:hover:flex").contains(":is(.hozo-0 > *):hover"));
    // The parent is hovered.
    assert!(css_for("hover:*:flex").contains(":is(.hozo-0:hover > *)"));
}

#[test]
fn a_container_query_asks_an_ancestor_the_width_question() {
    // Same shape as the viewport query, addressed to a container --
    // and the scale is Tailwind's container one, so `@sm` is 384px
    // where `sm:` is 640px.
    assert!(css_for("@sm:flex").contains("@container (width >= 384px)"));
    assert!(css_for("sm:flex").contains("@media (width >= 640px)"));
    assert!(css_for("@max-md:flex").contains("@container (width < 448px)"));
    // A name says which ancestor answers; without one it is the
    // nearest container.
    assert!(css_for("@sm/main:flex").contains("@container main (width >= 384px)"));
    // And declaring one under a name is two declarations.
    let named = css_for("@container/main");
    assert!(named.contains("container-type: inline-size;"), "{named}");
    assert!(named.contains("container-name: main;"), "{named}");
}

#[test]
fn the_breakpoints_are_written_as_ranges() {
    // `(min-width: 768px)` until `max-…:` arrived and turned out to
    // have no exact opposite in that spelling: `(max-width: 767.98px)`
    // is a convention that leaves a hundredth of a pixel unstyled.
    // Both directions use the range syntax, which is also what
    // Tailwind v4 writes.
    assert!(css_for("md:flex").contains("@media (width >= 768px)"));
    assert!(css_for("max-md:flex").contains("@media (width < 768px)"));
    // The unit is the author's. Nothing here resolves `rem`, because
    // the browser does and it knows the root font size.
    assert!(css_for("max-[40rem]:flex").contains("@media (width < 40rem)"));
    // And a nested pair nests, outermost first.
    let both = css_for("md:max-lg:flex");
    assert!(
        both.find("(width >= 768px)") < both.find("(width < 1024px)"),
        "{both}",
    );
}

#[test]
fn a_variant_can_be_more_than_one_rule() {
    // `condition_shape` returned one shape per condition until this,
    // and `marker:` is four: the element's own `::marker`, a
    // descendant's, and both again under Safari's
    // `::-webkit-details-marker`. Read out of Tailwind's output, which
    // documents none of it.
    let css = css_for("marker:flex");
    for suffix in ["::marker", " ::marker", "::-webkit-details-marker"] {
        assert!(
            css.contains(&format!(".hozo-0{suffix}")),
            "{suffix} missing from {css}"
        );
    }
    // Counted on the generated class rather than the declaration:
    // `View`'s own base rule sets `display: flex` too.
    assert_eq!(css.matches(".hozo-0").count(), 4, "{css}");
    // A selection crosses element boundaries, so it is two.
    assert_eq!(css_for("selection:flex").matches(".hozo-0").count(), 2);
}

#[test]
fn not_hover_is_the_two_rules_it_always_was() {
    // The one variant Hozo refused, and the refusal was about the
    // backend rather than the variant: negating a condition that is
    // both a query and a selector needs a rule for each, and there was
    // nowhere to put the second.
    let css = css_for("not-hover:flex");
    assert!(css.contains(".hozo-0:not(:hover)"), "{css}");
    assert!(css.contains("@media not (hover: hover)"), "{css}");
}

#[test]
fn a_negated_container_query_preserves_its_optional_lookup_name() {
    for (class, query) in [
        ("not-@md:flex", "@container not (width >= 448px)"),
        ("not-@max-md:flex", "@container not (width < 448px)"),
        ("not-@md/main:flex", "@container main not (width >= 448px)"),
        (
            "md:not-@min-[400px]/main:flex",
            "@container main not (width >= 400px)",
        ),
        ("not-not-@md/main:flex", "@container main (width >= 448px)"),
    ] {
        let css = css_for(class);
        assert!(css.contains(query), "{class}: {css}");
        assert_eq!(css.matches("@container").count(), 1, "{css}");
    }
}

#[test]
fn generated_content_is_written_where_the_box_is_made() {
    // A `::before` with no `content` generates nothing, so the
    // declaration is unconditional even when the style is not:
    // `before:md:flex` makes the box at every width.
    let narrow = css_for("before:md:flex");
    assert!(
        narrow.contains(
            ".hozo-0::before {
  content: var(--hozo-content);
}"
        ),
        "{narrow}"
    );
    assert!(narrow.contains("@media (width >= 768px)"), "{narrow}");
    // Two pseudo-elements, two boxes, two `content` declarations --
    // the outer one is not inherited by the inner.
    assert_eq!(css_for("before:after:flex").matches("content:").count(), 3);
    // And the register they read, once per file.
    assert!(css_for("before:flex").contains("@property --hozo-content"));
    assert!(!css_for("hover:flex").contains("@property"));
}

#[test]
fn the_content_utility_sets_what_those_rules_read() {
    // Which is the whole reason it is a custom property: the utility
    // and the `before:` rule that picks it up need not be the same
    // rule, or written in any particular order.
    assert!(css_for("content-['x']").contains("--hozo-content: 'x';"));
    assert!(css_for("content-['x']").contains("content: var(--hozo-content);"));
    // `none` resolves at the declaration instead, because a
    // `var()` holding `none` would still be a string.
    assert!(css_for("content-none").contains("content: none;"));
}

#[test]
fn an_unrecognized_variant_does_not_become_part_of_a_utility_name() {
    // The one failure mode that reports success. An unknown variant
    // leaves its own text in front of the utility, and the utility
    // parser read that text as a *value*: `placeholder-shown:` matched
    // the `placeholder-<colour>` family and wrote
    //
    //   .hozo-0::placeholder { color: var(--hozo-color-shown:bg-blue-500) }
    //
    // -- a rule for a pseudo-element nobody asked about, naming a
    // custom property whose name contains a colon and so cannot exist.
    // Nothing was reported, because a diagnostic is what happens when a
    // class produces *nothing*, and this produced something.
    //
    // Checked on the CSS rather than only on the diagnostic, because
    // the missing diagnostic was the consequence and not the defect.
    //
    // `placeholder-shown:` is compiled now, so the example that found
    // this is no longer one -- but the shape is unchanged and the
    // collision is still there for any `placeholder-…` Hozo does not
    // know, which is what the first entry keeps.
    for classes in [
        "placeholder-nonsense:bg-blue-500",
        "bg-nonsense:p-4",
        "text-x:y",
        "border-bottom:12px",
    ] {
        // `.hozo-0` is the class the element's own utilities go into;
        // `View`'s base rule is always there and is not this.
        assert!(
            !css_for(classes).contains(".hozo-0"),
            "{classes}: {}",
            css_for(classes)
        );
    }
}

#[test]
fn a_colon_inside_an_arbitrary_value_is_the_values_own() {
    // The guard is "a colon left at the top level", so it has to know
    // that brackets hold their own. Both of these are real utilities
    // whose value contains a colon.
    assert!(css_for("bg-[url(a:b)]").contains("background-image: url(a:b);"));
    assert!(css_for("supports-[display:grid]:p-4").contains("@supports (display:grid)"));
    // And the pseudo-element family still works where it is genuinely
    // the utility rather than a variant that resembled one.
    assert!(css_for("placeholder-blue-500").contains("::placeholder"));
}
