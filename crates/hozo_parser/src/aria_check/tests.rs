use hozo_ir::DiagnosticCode;

fn codes(element: &str) -> Vec<DiagnosticCode> {
    let source = format!(
            "import {{ Button, Link, Image, Heading, List, ListItem, Progress, Meter, Separator, Table, TableRow, TableCell, Pressable, View, Text, Paragraph, Section, Modal, Dialog, OtpInput, ColorPicker, Pagination, Listbox, Menu }} from '@hozo/core'\n\
             const el = {element}\n"
        );
    crate::parse_tsx(&source)
        .diagnostics
        .into_iter()
        .map(|d| d.code)
        .collect()
}

#[test]
fn a_state_the_role_does_not_take_is_reported() {
    // `role="button"` accepts `aria-expanded`, `aria-busy` and
    // `aria-disabled`. Not `aria-selected` -- and the state was going
    // into the output regardless, where nothing would read it.
    assert_eq!(
        codes(
            r#"<Pressable accessibilityRole="button" accessibilityState={{ selected: s }} onPress={go}>x</Pressable>"#
        ),
        vec![DiagnosticCode::AriaPropNotAllowed],
    );
    assert!(
            codes(r#"<Pressable accessibilityRole="button" accessibilityState={{ expanded: o }} onPress={go}>x</Pressable>"#)
                .is_empty()
        );
}

#[test]
fn implicit_roles_reject_states_the_same_way_as_explicit_roles() {
    for element in [
        r#"<Button accessibilityState={{ selected: s }} onPress={go}>x</Button>"#,
        r#"<Button accessibilityState={{ checked: s }} onPress={go}>x</Button>"#,
        r#"<Link href="/docs" accessibilityState={{ selected: s }}>x</Link>"#,
        r#"<Image src="/image.png" accessibilityLabel="Picture" accessibilityState={{ checked: s }} />"#,
        r#"<Heading accessibilityState={{ checked: s }}>x</Heading>"#,
        r#"<List accessibilityState={{ checked: s }} />"#,
        r#"<ListItem accessibilityState={{ selected: s }}>x</ListItem>"#,
        r#"<Progress value={.5} accessibilityState={{ checked: s }} />"#,
        r#"<Meter value={.5} accessibilityState={{ selected: s }} />"#,
        r#"<Separator accessibilityState={{ checked: s }} />"#,
        r#"<Table accessibilityState={{ checked: s }} />"#,
        r#"<TableRow accessibilityState={{ checked: s }} />"#,
        r#"<TableCell accessibilityState={{ checked: s }}>x</TableCell>"#,
    ] {
        assert_eq!(
            codes(element),
            vec![DiagnosticCode::AriaPropNotAllowed],
            "{element}"
        );
    }
}

#[test]
fn navigation_and_authored_roles_keep_their_own_allowed_states() {
    for element in [
        r#"<Button accessibilityState={{ expanded: s, busy: b, disabled: d }} onPress={go}>x</Button>"#,
        r#"<Button accessibilityRole="checkbox" accessibilityState={{ checked: s }} onPress={go}>x</Button>"#,
        r#"<Button href="/docs" accessibilityState={{ expanded: s }}>x</Button>"#,
        r#"<Button accessibilityState={state}>x</Button>"#,
        r#"<Button accessibilityState={{ ...state }}>x</Button>"#,
        r#"<Button {...props} accessibilityState={{ selected: s }}>x</Button>"#,
        r#"<Button accessibilityRole={role} accessibilityState={{ selected: s }}>x</Button>"#,
        r#"<Button role={role} accessibilityState={{ selected: s }}>x</Button>"#,
    ] {
        assert!(codes(element).is_empty(), "{element}: {:?}", codes(element));
    }
    let source = "import { Button } from '@hozo/core'; const el = <Button href=\"/docs\" accessibilityState={{ selected: s }}>x</Button>";
    let diagnostic = crate::parse_tsx(source)
        .diagnostics
        .into_iter()
        .find(|d| d.code == DiagnosticCode::AriaPropNotAllowed)
        .unwrap();
    assert!(diagnostic.message.contains("role=\"link\""));
}

#[test]
fn an_opaque_state_is_not_guessed_at() {
    // The rule the rest of this module follows: where the source stops
    // being readable, say nothing rather than something.
    assert!(
            codes(r#"<Pressable accessibilityRole="button" accessibilityState={state} onPress={go}>x</Pressable>"#)
                .is_empty()
        );
}

#[test]
fn a_name_on_something_that_cannot_be_named_is_reported() {
    // `generic` is what a bare `<div>` or `<span>` is, and ARIA
    // prohibits naming it -- so the label is written, rendered, and
    // may never be announced.
    for element in [
        r#"<View accessibilityLabel="Sidebar" className="p-4">x</View>"#,
        r#"<Text accessibilityLabel="Hint">x</Text>"#,
        r#"<Paragraph accessibilityLabel="Intro">x</Paragraph>"#,
        r#"<Pressable accessibilityLabel="Open">x</Pressable>"#,
    ] {
        assert_eq!(
            codes(element),
            vec![DiagnosticCode::AriaNameProhibited],
            "{element}"
        );
    }
}

#[test]
fn a_name_on_something_that_can_be_named_is_not() {
    // Which is the whole point of the semantic primitives: `Section`
    // becomes a region, and a region takes a name.
    assert!(codes(r#"<Section accessibilityLabel="Messages">x</Section>"#).is_empty());
    assert!(
            codes(r#"<Pressable accessibilityRole="button" accessibilityLabel="Save" onPress={go}>x</Pressable>"#)
                .is_empty()
        );
}

#[test]
fn a_name_on_a_modal_is_reported_because_neither_platform_forwards_it() {
    for element in [
        r#"<Modal visible={open} accessibilityLabel="Settings">x</Modal>"#,
        r#"<Modal visible={open} aria-label="Settings">x</Modal>"#,
        r#"<Modal visible={open} aria-labelledby="title">x</Modal>"#,
    ] {
        assert_eq!(
            codes(element),
            vec![DiagnosticCode::A11yNameNotForwarded],
            "{element}"
        );
    }
}

#[test]
fn a_modal_named_from_inside_or_through_a_spread_is_not() {
    assert!(codes(
            r#"<Modal visible={open}><View accessibilityLabel="Settings" role="dialog">x</View></Modal>"#
        )
        .is_empty());
    assert!(codes(r#"<Modal visible={open} {...rest}>x</Modal>"#).is_empty());
    assert!(codes(
        r#"<Dialog open={open} onClose={close} accessibilityLabel="Settings">x</Dialog>"#
    )
    .iter()
    .all(|code| *code != DiagnosticCode::A11yNameNotForwarded));
}

#[test]
fn a_pattern_with_nothing_else_to_announce_needs_a_name() {
    for element in [
        r#"<OtpInput length={6} value={code} onChange={setCode} />"#,
        r#"<ColorPicker value={color} onChange={setColor} />"#,
        r#"<Listbox options={options} value={fruit} onValueChange={setFruit} />"#,
    ] {
        assert_eq!(
            codes(element),
            vec![DiagnosticCode::A11yMissingAccessibleName],
            "{element}"
        );
    }
}

#[test]
fn a_named_pattern_or_one_with_a_default_name_is_not_reported() {
    for element in [
        r#"<OtpInput length={6} value={code} onChange={setCode} accessibilityLabel="Code" />"#,
        r#"<ColorPicker value={color} onChange={setColor} aria-labelledby="accent" />"#,
        r#"<OtpInput length={6} value={code} onChange={setCode} {...field} />"#,
        // A translated "Pagination" is the name when none is written.
        r#"<Pagination page={page} pageCount={10} onPageChange={setPage} />"#,
        r#"<Listbox options={options} value={fruit} onValueChange={setFruit} accessibilityLabel="Fruit" />"#,
        // The trigger's text is the menu's name.
        r#"<Menu trigger="Actions" items={items} />"#,
    ] {
        assert!(codes(element).is_empty(), "{element}");
    }
}

#[test]
fn a_required_state_written_as_a_literal_key_counts_as_supplied() {
    // `aria-checked` was missing from the hand-copied list of which
    // properties `accessibilityState` can carry, so a checkbox written
    // with the one state it needs was reported as missing it.
    assert!(
            codes(r#"<Pressable accessibilityRole="checkbox" accessibilityState={{ checked: c }} onPress={go}>x</Pressable>"#)
                .is_empty()
        );
    assert_eq!(
        codes(r#"<Pressable accessibilityRole="checkbox" onPress={go}>x</Pressable>"#),
        vec![DiagnosticCode::AriaIncompletePattern],
    );
}
