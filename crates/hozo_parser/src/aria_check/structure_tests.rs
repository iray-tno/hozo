use hozo_ir::DiagnosticCode;

fn codes(element: &str) -> Vec<DiagnosticCode> {
    let source = format!(
            "import {{ View, Text, Pressable, Button, Heading }} from '@hozo/core'\nconst el = {element}\n"
        );
    crate::parse_tsx(&source)
        .diagnostics
        .into_iter()
        .map(|d| d.code)
        .collect()
}

#[test]
fn one_control_inside_another_is_reported() {
    // The DOM does not allow it, and a browser meeting one moves the
    // inner element out -- so what renders is not what was written.
    for element in [
        r#"<Pressable accessibilityRole="button" onPress={a}><Pressable accessibilityRole="button" onPress={b}>x</Pressable></Pressable>"#,
        r#"<Pressable accessibilityRole="link" onPress={a}><Button onPress={b}>x</Button></Pressable>"#,
        // Depth does not matter: a button three levels inside a link
        // is the same problem as one directly inside it.
        r#"<Pressable accessibilityRole="link" onPress={a}><View><View><Button onPress={b}>x</Button></View></View></Pressable>"#,
    ] {
        assert!(
            codes(element).contains(&DiagnosticCode::A11yInteractiveNesting),
            "{element}",
        );
    }
}

#[test]
fn controls_beside_each_other_are_not() {
    assert!(
        !codes(r#"<View><Button onPress={a}>x</Button><Button onPress={b}>y</Button></View>"#)
            .contains(&DiagnosticCode::A11yInteractiveNesting)
    );
    // A container inside a control is ordinary -- that is how a button
    // gets an icon and a label.
    assert!(
        !codes(r#"<Button onPress={a}><View><Text>x</Text></View></Button>"#)
            .contains(&DiagnosticCode::A11yInteractiveNesting)
    );
}

#[test]
fn a_press_handler_with_no_keyboard_path_is_reported() {
    // `onClick` on a View works with a pointer, is not in the tab
    // order and announces as nothing -- proposal 10.2's own example.
    assert!(codes(r#"<View onClick={go}>Tap</View>"#)
        .contains(&DiagnosticCode::A11yPressWithoutKeyboard));
    // `onPress` on a View is quieter and worse: neither platform has
    // that prop on a plain view, so it does nothing at all.
    assert!(codes(r#"<View onPress={go}>Tap</View>"#)
        .contains(&DiagnosticCode::A11yPressWithoutKeyboard));
    assert!(codes(r#"<Text onPress={go}>Tap</Text>"#)
        .contains(&DiagnosticCode::A11yPressWithoutKeyboard));
}

#[test]
fn the_primitive_that_is_a_control_is_not_reported() {
    // `Pressable` is Hozo's interactive primitive: the Web backend
    // gives it a `tabIndex`, and the role it is missing is reported
    // separately as `A11yInteractiveWithoutRole`.
    assert!(
        !codes(r#"<Pressable accessibilityRole="button" onPress={go}>Tap</Pressable>"#)
            .contains(&DiagnosticCode::A11yPressWithoutKeyboard)
    );
    assert!(!codes(r#"<Button onPress={go}>Tap</Button>"#)
        .contains(&DiagnosticCode::A11yPressWithoutKeyboard));
}

#[test]
fn two_elements_with_one_id_are_reported() {
    // Every reference naming it resolves to the first, so one of the
    // two points at the wrong element -- and it points somewhere,
    // which is why nothing looks broken.
    assert!(
        codes(r#"<View><Text nativeID="x">A</Text><Text nativeID="x">B</Text></View>"#)
            .contains(&DiagnosticCode::A11yDuplicateId)
    );
    // Different ids, and a repeated id in an expression the compiler
    // is only carrying, say nothing.
    assert!(
        !codes(r#"<View><Text nativeID="x">A</Text><Text nativeID="y">B</Text></View>"#)
            .contains(&DiagnosticCode::A11yDuplicateId)
    );
    assert!(
        !codes(r#"<View><Text nativeID={id}>A</Text><Text nativeID={id}>B</Text></View>"#)
            .contains(&DiagnosticCode::A11yDuplicateId)
    );
}
