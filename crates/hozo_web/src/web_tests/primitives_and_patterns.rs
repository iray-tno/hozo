use super::*;

#[test]
fn a_synthetic_state_fact_never_reuses_its_raw_source_expression_guard_class() {
    use hozo_ir::{
        Condition, ConditionExpr, Dimension, StyleDeclaration, StyleProperty, StyleSource,
    };
    let source = "import {View} from '@hozo/core';const el=<View accessibilityState={state}/>";
    let parsed = hozo_parser::parse_tsx(source);
    let mut node = parsed.roots[0].node.clone();
    let state = node.props.accessibility_state.unwrap();
    node.style = vec![
        StyleDeclaration {
            source: StyleSource::Unspecified,
            condition: Condition::Expr(ConditionExpr::Ref(state)),
            property: StyleProperty::Opacity(0.5),
        },
        StyleDeclaration {
            source: StyleSource::Unspecified,
            condition: Condition::Expr(ConditionExpr::StateDisabled(state)),
            property: StyleProperty::Height(Dimension::Auto),
        },
    ];
    let output = lower(&node, source, &Theme::default());
    let raw = css::expr_ref_class(state);
    let fact = css::state_disabled_ref_class(state);
    assert_ne!(raw, fact);
    for name in [raw, fact] {
        assert!(output.jsx.contains(&name), "{}", output.jsx);
        assert!(output.css.contains(&name), "{}", output.css);
    }
    assert!(output.jsx.contains("(state)?.disabled === true"));
}

#[test]
fn menu_retains_actual_button_and_div_classes_and_a_leaf_abi() {
    let source = r#"import { Menu } from '@hozo/core'; const el = <Menu trigger="Actions" items={items}
        className="enabled:opacity-50 disabled:opacity-25"
        triggerClassName="enabled:px-3 aria-expanded:border-2"
        itemClassName="disabled:opacity-25 enabled:opacity-50 aria-disabled:opacity-25" />"#;
    let parsed = hozo_parser::parse_tsx(source);
    let out = lower(&parsed.roots[0].node, source, &Theme::default());
    assert!(out.diagnostics.is_empty(), "{:?}", out.diagnostics);
    assert!(out.jsx.starts_with("<HozoMenu"), "{}", out.jsx);
    assert!(out.runtime_imports.contains(&"HozoMenu"));
    assert!(out.jsx.contains("triggerClassName="));
    assert!(out.jsx.contains("itemClassName="));
    assert!(!out.css.contains("data-hozo-disabled"), "{}", out.css);
    assert!(out.css.contains(":enabled"), "{}", out.css);
    let source = "import { Menu } from '@hozo/core'; const el = <Menu trigger=\"Actions\" items={[]} className={choose()} />";
    let parsed = hozo_parser::parse_tsx(source);
    let out = lower(&parsed.roots[0].node, source, &Theme::default());
    assert!(
        out.jsx
            .contains("hozo-candidate-owner hozo-candidate-slot-owner"),
        "{}",
        out.jsx
    );
}

#[test]
fn listbox_keeps_actual_div_selectors_and_its_runtime_abi() {
    let source = r#"import { Listbox } from '@hozo/core'; const el = <Listbox options={options}
        className="disabled:opacity-25 enabled:opacity-50"
        optionClassName="focus:opacity-50 aria-selected:border-2 aria-disabled:opacity-25 disabled:mt-8 enabled:mb-8" />"#;
    let parsed = hozo_parser::parse_tsx(source);
    let out = lower(&parsed.roots[0].node, source, &Theme::default());
    assert!(out.diagnostics.is_empty(), "{:?}", out.diagnostics);
    assert!(out.jsx.starts_with("<HozoListbox"), "{}", out.jsx);
    assert!(out.runtime_imports.contains(&"HozoListbox"));
    assert!(out.jsx.contains("optionClassName="));
    assert!(!out.css.contains("data-hozo-disabled"), "{}", out.css);
    assert!(out.css.contains(":disabled"), "{}", out.css);
    let source = "import { Listbox } from '@hozo/core'; const el = <Listbox options={[]} className={choose()} />";
    let parsed = hozo_parser::parse_tsx(source);
    let out = lower(&parsed.roots[0].node, source, &Theme::default());
    assert!(
        out.jsx
            .contains("hozo-candidate-owner hozo-candidate-slot-owner"),
        "{}",
        out.jsx
    );
}

#[test]
fn combobox_keeps_actual_owner_classes_and_its_runtime_abi() {
    let source = r#"import { Combobox } from '@hozo/core'; const el = <Combobox options={options}
        className="disabled:opacity-25 enabled:opacity-50 read-only:rounded-lg"
        inputClassName="focus:opacity-50 aria-expanded:border-2"
        listClassName="read-only:rounded-lg" optionClassName="aria-selected:border-2" />"#;
    let parsed = hozo_parser::parse_tsx(source);
    let out = lower(&parsed.roots[0].node, source, &Theme::default());
    assert!(out.diagnostics.is_empty(), "{:?}", out.diagnostics);
    assert!(out.jsx.starts_with("<HozoCombobox"), "{}", out.jsx);
    assert!(out.runtime_imports.contains(&"HozoCombobox"));
    assert!(out.jsx.contains("inputClassName="));
    assert!(out.jsx.contains("listClassName="));
    assert!(out.jsx.contains("optionClassName="));
    assert!(!out.css.contains("data-hozo-disabled"), "{}", out.css);
    assert!(out.css.contains(":disabled"), "{}", out.css);
    let source = "import { Combobox } from '@hozo/core'; const el = <Combobox options={[]} className={choose()} />";
    let parsed = hozo_parser::parse_tsx(source);
    let out = lower(&parsed.roots[0].node, source, &Theme::default());
    assert!(
        out.jsx
            .contains("hozo-candidate-owner hozo-candidate-slot-owner"),
        "{}",
        out.jsx
    );
}

#[test]
fn semantic_boxes_keep_the_shared_base_and_explicit_overrides() {
    for primitive in [
        "Section",
        "Article",
        "Nav",
        "Main",
        "Header",
        "Footer",
        "Aside",
        "Search",
        "Figure",
        "Address",
        "Fieldset",
        "TermList",
        "Description",
        "List",
        "ListItem",
        "Skeleton",
    ] {
        let source = format!("import {{ {primitive} }} from '@hozo/core'; const el = <{primitive} className=\"flex-row shrink m-2 p-2 border-2\">x</{primitive}>");
        let parsed = hozo_parser::parse_tsx(&source);
        let out = lower(&parsed.roots[0].node, &source, &Theme::default());
        assert!(out.jsx.contains("hozo-view"), "{primitive}: {}", out.jsx);
        assert!(out.css.contains(VIEW_BASE_CSS), "{primitive}: {}", out.css);
        assert!(
            out.css.contains("flex-direction: row"),
            "{primitive}: {}",
            out.css
        );
        assert!(
            out.css.contains("flex-shrink: 1"),
            "{primitive}: {}",
            out.css
        );
        assert!(out.css.contains("@layer base"), "{primitive}: {}", out.css);
        assert!(
            out.diagnostics.is_empty(),
            "{primitive}: {:?}",
            out.diagnostics
        );
    }
}

#[test]
fn semantic_primitives_lower_to_native_html_elements() {
    let source = r#"
        import { Section, Heading, Paragraph } from '@hozo/core'
        const el = <Section><Heading level={2}>Title</Heading><Paragraph>Body</Paragraph></Section>
        "#;
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());
    assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
    assert_eq!(
        output.jsx,
        "<section className=\"hozo-view\"><h2>Title</h2><p>Body</p></section>"
    );
}

#[test]
fn typography_primitives_lower_to_semantic_html_elements() {
    let source = r#"
        import { Paragraph, Strong, Emphasis, Underline, Strikethrough, Sub, Sup, Code, Small, Mark, NoBreak, Ruby, RubyText } from '@hozo/core'
        const el = (
            <Paragraph>
                <Strong>bold</Strong>
                <Emphasis>italic</Emphasis>
                <Underline>underlined</Underline>
                <Strikethrough>deleted</Strikethrough>
                <Sub>sub</Sub>
                <Sup>sup</Sup>
                <Code>const x = 1</Code>
                <Small>fine print</Small>
                <Mark>highlight</Mark>
                <NoBreak>100 km/h</NoBreak>
                <Ruby>漢字<RubyText>かんじ</RubyText></Ruby>
            </Paragraph>
        )
        "#;
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());
    assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
    assert_eq!(
        output.jsx,
        "<p><strong>bold</strong><em>italic</em><u>underlined</u><s>deleted</s><sub>sub</sub><sup>sup</sup><code>const x = 1</code><small>fine print</small><mark>highlight</mark><span style={{ whiteSpace: 'nowrap' }}>100 km/h</span><ruby>漢字<rt>かんじ</rt></ruby></p>"
    );
}

#[test]
fn preformatted_lowers_to_pre_and_keeps_its_text_as_written() {
    // The whitespace is in a string expression, which JSX leaves alone,
    // and the compiler must carry it the same way.
    let source = r#"
        import { Preformatted, Code } from '@hozo/core'
        const el = <Preformatted><Code>{'a\n  b'}</Code></Preformatted>
        "#;
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());
    assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
    assert_eq!(output.jsx, "<pre><code>{'a\\n  b'}</code></pre>");
}

#[test]
fn a_preformatted_block_inside_a_paragraph_is_a_nesting_warning() {
    // `<pre>` is flow content and a `<p>` holds phrasing content only; the
    // browser would close the paragraph before it.
    let source = r#"
        import { Paragraph, Preformatted } from '@hozo/core'
        const el = <Paragraph><Preformatted>x</Preformatted></Paragraph>
        "#;
    let parsed = hozo_parser::parse_tsx(source);
    assert!(
        parsed
            .diagnostics
            .iter()
            .any(|d| d.code == hozo_ir::DiagnosticCode::InvalidSemanticNesting),
        "{:?}",
        parsed.diagnostics
    );
}

#[test]
fn landmark_primitives_lower_to_semantic_html_elements() {
    let source = r#"
        import { Main, Header, Footer, Aside, Search, Figure, Figcaption, Time, Address } from '@hozo/core'
        const el = (
            <Main>
                <Header>Banner</Header>
                <Aside>Sidebar</Aside>
                <Search>Searchbox</Search>
                <Figure>
                    <Figcaption>Caption</Figcaption>
                </Figure>
                <Time>2026-09-02</Time>
                <Address>Contact</Address>
                <Footer>Footer</Footer>
            </Main>
        )
        "#;
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());
    assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
    assert_eq!(
        output.jsx,
        "<main className=\"hozo-view\"><header className=\"hozo-view\">Banner</header><aside className=\"hozo-view\">Sidebar</aside><search className=\"hozo-view\">Searchbox</search><figure className=\"hozo-view\"><figcaption>Caption</figcaption></figure><time>2026-09-02</time><address className=\"hozo-view\">Contact</address><footer className=\"hozo-view\">Footer</footer></main>"
    );
}

#[test]
fn structural_form_and_disclosure_primitives_lower_to_semantic_html_elements() {
    let source = r#"
        import { Fieldset, Legend, Details, Summary, TermList, Term, Description } from '@hozo/semantics'
        const el = (
            <Fieldset>
                <Legend>Options</Legend>
                <Details>
                    <Summary>More</Summary>
                    <TermList>
                        <Term>Term</Term>
                        <Description>Detail</Description>
                        <TermList.Term>CompoundTerm</TermList.Term>
                        <TermList.Description>CompoundDetail</TermList.Description>
                    </TermList>
                </Details>
            </Fieldset>
        )
        "#;
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());
    assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
    assert_eq!(
        output.jsx,
        "<fieldset className=\"hozo-view\"><legend>Options</legend><details><summary>More</summary><dl className=\"hozo-view\"><dt>Term</dt><dd className=\"hozo-view\">Detail</dd><dt>CompoundTerm</dt><dd className=\"hozo-view\">CompoundDetail</dd></dl></details></fieldset>"
    );
}

#[test]
fn separator_and_link_lower_to_html_primitives() {
    let source = r#"
        import { View } from '@hozo/core'
        import { Separator } from '@hozo/semantics'
        import { Link } from '@hozo/typography'
        const el = (
            <View>
                <Link href="https://example.com">Visit</Link>
                <Separator />
            </View>
        )
        "#;
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());
    assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
    assert_eq!(
        output.jsx,
        "<div className=\"hozo-view\"><a href=\"https://example.com\">Visit</a><hr /></div>"
    );
}

/// A rule's own two props, which the DOM has no meaning for.
///
/// `decorative` and `orientation` are Hozo's spellings. Both used to
/// reach `<hr>` verbatim -- attributes nothing reads -- while the two
/// things they are for went unsaid: a decorative rule was still
/// announced as a separator, and a vertical one never said which way
/// it ran. The uncompiled fallback has always emitted both (#309).
#[test]
fn a_separator_says_what_its_props_mean() {
    let cases = [
        (r#"<Separator />"#, "<hr />"),
        (
            r#"<Separator decorative />"#,
            r#"<hr role="none" aria-hidden={true} />"#,
        ),
        (
            r#"<Separator orientation="vertical" />"#,
            r#"<hr aria-orientation="vertical" />"#,
        ),
    ];
    for (element, expected) in cases {
        let source = format!(
            "import {{ Separator }} from '@hozo/core'
const el = {element}"
        );
        let parsed = hozo_parser::parse_tsx(&source);
        let output = lower(&parsed.roots[0].node, &source, &Theme::default());
        assert!(
            output.diagnostics.is_empty(),
            "{element}: {:?}",
            output.diagnostics
        );
        assert_eq!(output.jsx, expected, "{element}");
    }
}

#[test]
fn a_skeleton_is_hidden_and_its_animation_stops_under_reduced_motion() {
    let source = "import { Skeleton } from '@hozo/core'
const el = <Skeleton className=\"h-4 animate-pulse\" />
";
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());
    assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
    assert!(
        output
            .jsx
            .contains("aria-hidden={true} data-hozo-skeleton=\"\""),
        "{}",
        output.jsx
    );
    assert!(
        output.css.contains("[data-hozo-skeleton] * {"),
        "{}",
        output.css
    );
    assert!(
        output.css.contains("animation: none !important;"),
        "{}",
        output.css
    );
    // Only where there is a skeleton.
    let plain = "import { View } from '@hozo/core'
const el = <View className=\"animate-pulse\" />
";
    let parsed = hozo_parser::parse_tsx(plain);
    assert!(!lower(&parsed.roots[0].node, plain, &Theme::default())
        .css
        .contains("data-hozo-skeleton"));
}

#[test]
fn a_badge_is_hozo_badge_with_its_classes_compiled() {
    let source = "import { Badge } from '@hozo/core'
const el = <Badge count={n} accessibilityLabel=\"3 unread\" className=\"rounded-full\" />
";
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());
    assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
    assert!(
        output.jsx.starts_with("<HozoBadge className=\"hozo-0\""),
        "{}",
        output.jsx
    );
    assert!(
        output.runtime_imports.contains(&"HozoBadge"),
        "{:?}",
        output.runtime_imports
    );
    assert!(output.css.contains("border-radius"), "{}", output.css);
}

#[test]
fn a_chip_is_hozo_chip_with_both_class_lists_compiled() {
    // #787: the remove button's classes are compiled like the chip's and
    // handed over under the prop the author wrote.
    let source = "import { Chip } from '@hozo/core'
const el = <Chip onRemove={drop} disabled={busy} className=\"bg-red-500 my-chip\" removeClassName=\"p-2 hover:bg-red-700\">Remote</Chip>
";
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());
    assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
    assert!(
        output
            .jsx
            .starts_with("<HozoChip className=\"hozo-0 my-chip\""),
        "{}",
        output.jsx
    );
    assert!(
        output.jsx.contains(" removeClassName=\"hozo-1\""),
        "{}",
        output.jsx
    );
    assert!(output.jsx.contains("disabled={busy}"), "{}", output.jsx);
    assert!(!output.jsx.contains("aria-disabled"), "{}", output.jsx);
    assert!(
        output.runtime_imports.contains(&"HozoChip"),
        "{:?}",
        output.runtime_imports
    );
    assert!(output.css.contains(".hozo-1:hover"), "{}", output.css);
}

#[test]
fn mixed_secondary_classes_keep_aot_and_residual_values_on_the_actual_slot() {
    let source = "import { Chip, cx } from '@hozo/core'; const el = <Chip onRemove={remove} removeClassName={cx('p-2 md:mt-2 not-focus:rounded-lg disabled:opacity-25 enabled:border-2 not-disabled:outline-2', first(), last())} />";
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());
    assert_eq!(output.jsx.matches("first()").count(), 1, "{}", output.jsx);
    assert_eq!(output.jsx.matches("last()").count(), 1, "{}", output.jsx);
    assert!(output.jsx.contains("removeClassName={[\"hozo-1\", first(), last()].filter(Boolean).join(' ').replace(/\\S/, 'hozo-candidate-owner hozo-candidate-slot-owner $&')}"), "{}", output.jsx);
    for selector in [
        ".hozo-1:disabled",
        ".hozo-1:enabled",
        ".hozo-1:not(:disabled)",
        ".hozo-1:not(:focus)",
    ] {
        assert!(output.css.contains(selector), "{selector}: {}", output.css);
    }
    assert!(
        !output.css.contains("data-hozo-disabled"),
        "slot state is not a root marker: {}",
        output.css
    );
    assert!(
        output.css.contains("padding-top: 8px") && output.css.contains("768px"),
        "{}",
        output.css
    );
}

/// #993: Chip's root lands on a button or a span the pattern draws, and
/// no Hozo marker reaches either; a Pressable's still does.
#[test]
fn an_audited_root_asks_its_actual_owner_whether_it_is_disabled() {
    let source = "import { Chip } from '@hozo/core'; const el = <Chip defaultSelected disabled={disabled} className=\"disabled:opacity-25 enabled:border-2 not-disabled:mt-1 not-enabled:mb-1\">Token</Chip>";
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());
    for selector in [
        ".hozo-0:disabled",
        ".hozo-0:enabled",
        ".hozo-0:not(:disabled)",
        ".hozo-0:not(:enabled)",
    ] {
        assert!(output.css.contains(selector), "{selector}: {}", output.css);
    }
    assert!(!output.css.contains("data-hozo-disabled"), "{}", output.css);

    let source = "import { Pressable } from '@hozo/core'; const el = <Pressable disabled={disabled} className=\"disabled:opacity-25\" />";
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());
    assert!(
        output.css.contains(".hozo-0[data-hozo-disabled]"),
        "{}",
        output.css
    );
}

#[test]
fn secondary_guard_classes_and_capture_values_stay_on_the_slot() {
    let source = "import {Chip,cx} from '@hozo/core'; const el = <Chip removeClassName={cx(first(), guard() ? 'p-2' : 'p-4', last())} />";
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());
    let (root, slot) = output.jsx.split_once(" removeClassName=").unwrap();
    assert!(!root.contains("hozo-cond-"), "{}", output.jsx);
    assert!(
        slot.contains("hozo-cond-") && slot.contains("__hozoClassPlan"),
        "{}",
        output.jsx
    );
    assert!(
        slot.contains("[(first()), ...((guard()) ? [true] : [false]), (last())]"),
        "{}",
        output.jsx
    );
    for call in ["first()", "guard()", "last()"] {
        assert_eq!(output.jsx.matches(call).count(), 1, "{}", output.jsx);
    }
    assert!(
        output.css.contains("padding-top: 8px") && output.css.contains("padding-top: 16px"),
        "{}",
        output.css
    );
}

#[test]
fn an_avatar_is_hozo_avatar_with_every_class_list_compiled() {
    let source = "import { Avatar } from '@hozo/core'
const el = <Avatar name=\"Ada Lovelace\" status=\"busy\" className=\"size-10 rounded-full\" statusClassName=\"size-3 bg-red-500\" />
";
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());
    assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
    assert!(
        output.jsx.starts_with("<HozoAvatar className=\"hozo-0\""),
        "{}",
        output.jsx
    );
    assert!(
        output.jsx.contains(" statusClassName=\"hozo-1\""),
        "{}",
        output.jsx
    );
    assert!(
        output.runtime_imports.contains(&"HozoAvatar"),
        "{:?}",
        output.runtime_imports
    );
}

#[test]
fn a_pagination_is_hozo_pagination_with_its_state_class_lists_compiled() {
    let source = "import { Pagination } from '@hozo/core'
const el = <Pagination pageCount={9} className=\"flex gap-1\" currentItemClassName=\"font-bold\" />
";
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());
    assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
    assert!(
        output
            .jsx
            .starts_with("<HozoPagination className=\"hozo-0\""),
        "{}",
        output.jsx
    );
    assert!(
        output.jsx.contains(" currentItemClassName=\"hozo-1\""),
        "{}",
        output.jsx
    );
    assert!(
        output.runtime_imports.contains(&"HozoPagination"),
        "{:?}",
        output.runtime_imports
    );
}

#[test]
fn a_stepper_is_hozo_stepper_with_its_status_class_lists_compiled() {
    let source = "import { Stepper } from '@hozo/core'
const el = <Stepper steps={steps} activeStep={0} className=\"flex gap-2\" currentIndicatorClassName=\"bg-blue-600\" />
";
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());
    assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
    assert!(
        output.jsx.starts_with("<HozoStepper className=\"hozo-0\""),
        "{}",
        output.jsx
    );
    assert!(
        output.jsx.contains(" currentIndicatorClassName=\"hozo-1\""),
        "{}",
        output.jsx
    );
    assert!(
        output.runtime_imports.contains(&"HozoStepper"),
        "{:?}",
        output.runtime_imports
    );
}

#[test]
fn a_table_is_the_table_elements_and_a_header_cell_heads_its_column() {
    let source = "import { Table, TableHeader, TableRow, TableHead, TableCell } from '@hozo/core'
const el = <Table className=\"w-full\"><TableHeader><TableRow><TableHead>Item</TableHead><TableHead scope=\"row\">x</TableHead><TableCell>y</TableCell></TableRow></TableHeader></Table>
";
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());
    assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
    assert!(
        output
            .jsx
            .starts_with("<table className=\"hozo-0\"><thead><tr>"),
        "{}",
        output.jsx
    );
    assert!(
        output.jsx.contains("<th scope=\"col\">Item</th>"),
        "{}",
        output.jsx
    );
    assert!(
        output.jsx.contains("<th scope=\"row\">x</th><td>y</td>"),
        "{}",
        output.jsx
    );
    assert!(
        output.runtime_imports.is_empty(),
        "{:?}",
        output.runtime_imports
    );
}

#[test]
fn an_otp_input_is_hozo_otp_input_with_its_cell_class_lists_compiled() {
    let source = "import { OtpInput } from '@hozo/core'
const el = <OtpInput accessibilityLabel=\"Code\" className=\"flex gap-2\" activeCellClassName=\"border-blue-600\" />
";
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());
    assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
    assert!(
        output.jsx.starts_with("<HozoOtpInput className=\"hozo-0\""),
        "{}",
        output.jsx
    );
    assert!(
        output.jsx.contains(" activeCellClassName=\"hozo-1\""),
        "{}",
        output.jsx
    );
    assert!(
        output.runtime_imports.contains(&"HozoOtpInput"),
        "{:?}",
        output.runtime_imports
    );
}

#[test]
fn a_command_palette_is_hozo_command_palette_with_its_class_lists_compiled() {
    let source = "import { CommandPalette } from '@hozo/core'
const el = <CommandPalette open={open} commands={commands} panelClassName=\"w-96\" activeItemClassName=\"bg-slate-100\" />
";
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());
    assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
    assert!(
        output
            .jsx
            .starts_with("<HozoCommandPalette panelClassName=\"hozo-1\""),
        "{}",
        output.jsx
    );
    assert!(
        output.jsx.contains(" activeItemClassName=\"hozo-2\""),
        "{}",
        output.jsx
    );
    assert!(
        output.runtime_imports.contains(&"HozoCommandPalette"),
        "{:?}",
        output.runtime_imports
    );
}

#[test]
fn a_color_picker_is_hozo_color_picker_with_its_class_lists_compiled() {
    let source = "import { ColorPicker } from '@hozo/core'
const el = <ColorPicker value={color} accessibilityLabel=\"Theme\" className=\"flex gap-3\" selectedSwatchClassName=\"ring-2\" />
";
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());
    assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
    assert!(
        output
            .jsx
            .starts_with("<HozoColorPicker className=\"hozo-0\""),
        "{}",
        output.jsx
    );
    assert!(
        output.jsx.contains(" selectedSwatchClassName=\"hozo-1\""),
        "{}",
        output.jsx
    );
    assert!(
        output.runtime_imports.contains(&"HozoColorPicker"),
        "{:?}",
        output.runtime_imports
    );
}

#[test]
fn a_meter_is_the_meter_element_with_its_range_as_written() {
    let source = "import { Meter } from '@hozo/core'
const el = <Meter aria-label=\"Disk usage\" value={0.6} low={0.3} high={0.8} />
";
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());
    assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
    assert!(output.jsx.starts_with("<meter "), "{}", output.jsx);
    assert!(
        output.jsx.contains("low={0.3} high={0.8}"),
        "{}",
        output.jsx
    );
    // The amount as a percentage, as Native reads it, rather than the
    // "0.6" both desktop readers said without it.
    assert!(
        output.jsx.contains("aria-valuetext={'60%'}"),
        "{}",
        output.jsx
    );
    let dynamic = "import { Meter } from '@hozo/core'
const el = <Meter value={used} max={total} />
";
    let parsed = hozo_parser::parse_tsx(dynamic);
    let output = lower(&parsed.roots[0].node, dynamic, &Theme::default());
    assert!(
        output.jsx.contains("aria-valuetext={`${Math.round(Math.min(Math.max(((used) - (0)) / ((total) - (0)), 0), 1) * 100)}%`}"),
        "{}",
        output.jsx
    );
}

#[test]
fn progress_and_button_with_href_lower_to_html_primitives() {
    let source = r#"
        import { Button, View } from '@hozo/core'
        import { Progress } from '@hozo/semantics'
        const el = (
            <View>
                <Progress value={50} max={100}>50%</Progress>
                <Button href="https://example.com">Go</Button>
            </View>
        )
        "#;
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());
    assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
    assert_eq!(
        output.jsx,
        "<div className=\"hozo-view\"><progress value={50} max={100}>50%</progress><a href=\"https://example.com\">Go</a></div>"
    );
}

#[test]
fn audited_container_primitive_roots_use_real_dom_predicates_and_slot_owner_marker() {
    for (name, attrs) in [
        ("Avatar", r#"name="Ada""#),
        ("Pagination", "pageCount={3}"),
        ("Stepper", "steps={steps} activeStep={0}"),
        ("ColorPicker", r#"accessibilityLabel="Theme""#),
        (
            "Dialog",
            r#"open={showing} onClose={dismiss} accessibilityLabel="Confirm""#,
        ),
        ("CommandPalette", "open commands={commands}"),
    ] {
        let static_src = format!(
            "import {{ {name} }} from '@hozo/core'\nconst el = <{name} {attrs} className=\"pt-2 read-only:rounded-lg disabled:opacity-25 enabled:pb-4 not-disabled:px-2\" />"
        );
        let parsed = hozo_parser::parse_tsx(&static_src);
        let out = lower(&parsed.roots[0].node, &static_src, &Theme::default());
        assert!(out.diagnostics.is_empty(), "{name}: {:?}", out.diagnostics);
        assert!(
            !out.css.contains("data-hozo-disabled"),
            "{name} root must ask the real DOM element, not [data-hozo-disabled]: {}",
            out.css
        );
        assert!(out.css.contains(":disabled"), "{name}: {}", out.css);
        assert!(out.css.contains(":enabled"), "{name}: {}", out.css);
        assert!(out.css.contains(":read-only"), "{name}: {}", out.css);

        let dynamic_src = format!(
            "import {{ {name} }} from '@hozo/core'\nconst el = <{name} {attrs} className={{classes}} />"
        );
        let parsed = hozo_parser::parse_tsx(&dynamic_src);
        let out = lower(&parsed.roots[0].node, &dynamic_src, &Theme::default());
        assert!(
            out.jsx
                .contains("hozo-candidate-owner hozo-candidate-slot-owner"),
            "{name} dynamic root must mark slot-owner form predicates: {}",
            out.jsx
        );
    }
}
