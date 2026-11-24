use super::*;

#[test]
fn an_avatar_is_hozo_avatar_and_each_part_gets_its_style() {
    // #144: four class lists, one per part, each a style prop here; the
    // avatar keeps its text styles, which it hands to the initials.
    let source = r#"
        import { Avatar } from '@hozo/core'
        const el = <Avatar src={photo} name="Ada Lovelace" status="online" className="size-10 rounded-full bg-slate-200 text-slate-700" imageClassName="opacity-90" fallbackClassName="p-1" statusClassName="size-3 bg-green-500" />
        "#;
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());
    assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
    assert!(
        output
            .jsx
            .starts_with("<HozoAvatar style={hozoStyles.hozo0}"),
        "{}",
        output.jsx
    );
    assert!(
        output.runtime_imports.contains(&"HozoAvatar"),
        "{:?}",
        output.runtime_imports
    );
    for prop in [
        "imageStyle={hozoStyles.hozo1}",
        "fallbackStyle={hozoStyles.hozo2}",
        "statusStyle={hozoStyles.hozo3}",
        "src={photo}",
        r#"status="online""#,
    ] {
        assert!(output.jsx.contains(prop), "{prop}: {}", output.jsx);
    }
    assert!(!output.jsx.contains("ClassName"), "{}", output.jsx);
    // The text colour stays on the avatar for its initials.
    let first = output.styles.split("hozo1").next().unwrap_or_default();
    assert!(first.contains("color:"), "{}", output.styles);
}

#[test]
fn a_pagination_is_hozo_pagination_with_a_style_per_state() {
    // #150: the current page and a disabled end are styled by class lists
    // the pattern applies, so each is a style prop here.
    let source = r#"
        import { Pagination } from '@hozo/core'
        const el = <Pagination page={page} pageCount={20} onPageChange={setPage} className="gap-1 text-sm" itemClassName="px-2" currentItemClassName="bg-blue-600 text-white" disabledItemClassName="opacity-50" ellipsisClassName="px-1" />
        "#;
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());
    assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
    assert!(
        output
            .jsx
            .starts_with("<HozoPagination style={hozoStyles.hozo0}"),
        "{}",
        output.jsx
    );
    for prop in [
        "itemStyle={hozoStyles.hozo1}",
        "currentItemStyle={hozoStyles.hozo2}",
        "disabledItemStyle={hozoStyles.hozo3}",
        "ellipsisStyle={hozoStyles.hozo4}",
        "pageCount={20}",
    ] {
        assert!(output.jsx.contains(prop), "{prop}: {}", output.jsx);
    }
    assert!(
        output.runtime_imports.contains(&"HozoPagination"),
        "{:?}",
        output.runtime_imports
    );
}

#[test]
fn pagination_compiles_control_state_slots_not_the_row_or_ellipsis() {
    let compile = |props: &str| {
        let source = format!("import {{ Pagination }} from '@hozo/core'\nconst el = <Pagination pageCount={{20}} {props} />");
        let parsed = hozo_parser::parse_tsx(&source);
        lower(&parsed.roots[0].node, &source, &Theme::default())
    };
    let output = compile(
        r#"itemClassName="px-2 hover:text-white active:opacity-50" currentItemClassName="bg-red-500 focus-visible:outline-4" disabledItemClassName="opacity-25 not-hover:border-2" itemStyle={extra} currentItemStyle={currentExtra} disabledItemStyle={disabledExtra}"#,
    );
    assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
    for prop in [
        "hozoItemStyle",
        "hozoCurrentItemStyle",
        "hozoDisabledItemStyle",
    ] {
        assert!(output.jsx.contains(&format!("{prop}={{({{ pressed, hovered, focused, focusVisible, disabled: __hozoSlotDisabled, enabled: __hozoSlotEnabled, 'aria-disabled': __hozoSlotAriaDisabled }}) => [")), "{}", output.jsx);
    }
    for expected in [
        "hovered &&",
        "pressed &&",
        "focusVisible &&",
        "!(hovered) &&",
        "itemStyle={extra}",
        "currentItemStyle={currentExtra}",
        "disabledItemStyle={disabledExtra}",
    ] {
        assert!(
            output.jsx.contains(expected),
            "{expected} missing from {}",
            output.jsx
        );
    }
    for slot in ["className", "ellipsisClassName"] {
        let output = compile(&format!(r#"{slot}="focus-visible:outline-2""#));
        assert!(
            output.diagnostics.iter().any(
                |d| d.code == DiagnosticCode::NotWiredOnNative && d.severity == Severity::Error
            ),
            "{slot}: {:?}",
            output.diagnostics
        );
    }
}

#[test]
fn stepper_compiles_only_authored_button_slots_and_scopes_negation_to_that_owner() {
    let compile = |props: &str| {
        let source = format!("import {{ Stepper }} from '@hozo/core'\nconst el = <Stepper steps={{steps}} activeStep={{1}} {props} />");
        let parsed = hozo_parser::parse_tsx(&source);
        lower(&parsed.roots[0].node, &source, &Theme::default())
    };
    let output = compile(
        r#"onStepPress={handler} stepClassName="px-2 hover:text-white active:opacity-50 not-hover:border-2" completedStepClassName="focus:bg-blue-500" currentStepClassName="bg-red-500 focus-visible:outline-4" errorStepClassName="md:not-hover:opacity-25" stepStyle={extra} currentStepStyle={currentExtra}"#,
    );
    assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
    for prop in [
        "hozoStepStyle",
        "hozoCompletedStepStyle",
        "hozoCurrentStepStyle",
        "hozoErrorStepStyle",
    ] {
        assert!(output.jsx.contains(&format!("{prop}={{({{ pressed, hovered, focused, focusVisible, interactionAvailable, disabled: __hozoSlotDisabled, enabled: __hozoSlotEnabled }}) => [")), "{}", output.jsx);
    }
    for expected in [
        "(interactionAvailable && hovered) &&",
        "(interactionAvailable && pressed) &&",
        "(interactionAvailable && !(hovered)) &&",
        "(interactionAvailable && focused) &&",
        "(interactionAvailable && focusVisible) &&",
        "stepStyle={extra}",
        "currentStepStyle={currentExtra}",
    ] {
        assert!(
            output.jsx.contains(expected),
            "{expected} missing from {}",
            output.jsx
        );
    }
    for slot in [
        "stepClassName",
        "completedStepClassName",
        "currentStepClassName",
        "errorStepClassName",
    ] {
        for condition in ["hover", "not-hover", "md:not-focus-visible"] {
            let output = compile(&format!(r#"{slot}="{condition}:opacity-50""#));
            assert!(
                output
                    .diagnostics
                    .iter()
                    .any(|d| d.code == DiagnosticCode::NotWiredOnNative
                        && d.severity == Severity::Error
                        && d.message.contains("onStepPress")),
                "{slot}/{condition}: {:?}",
                output.diagnostics
            );
            assert!(
                !output.jsx.contains("interactionAvailable"),
                "{}",
                output.jsx
            );
        }
    }
    // Even with a handler, the ol and decorative spans are not step buttons.
    for slot in [
        "className",
        "indicatorClassName",
        "completedIndicatorClassName",
        "currentIndicatorClassName",
        "errorIndicatorClassName",
        "descriptionClassName",
    ] {
        let output = compile(&format!(
            r#"onStepPress={{handler}} {slot}="not-focus-visible:outline-2""#
        ));
        assert!(
            output.diagnostics.iter().any(
                |d| d.code == DiagnosticCode::NotWiredOnNative && d.severity == Severity::Error
            ),
            "{slot}: {:?}",
            output.diagnostics
        );
    }
    for condition in ["aria-checked", "not-aria-expanded", "hover:aria-pressed"] {
        let output = compile(&format!(
            r#"onStepPress={{handler}} stepClassName="{condition}:opacity-50""#
        ));
        assert!(
            output.diagnostics.iter().any(
                |d| d.code == DiagnosticCode::NotWiredOnNative && d.severity == Severity::Error
            ),
            "{condition}: {:?}",
            output.diagnostics
        );
    }
}

#[test]
fn stepper_semantics_describe_the_class_owner_even_without_a_button() {
    for slot in [
        "stepClassName",
        "completedStepClassName",
        "currentStepClassName",
        "errorStepClassName",
    ] {
        let source = format!(
            r#"import {{ Stepper }} from '@hozo/core'
          const el = <Stepper steps={{steps}} activeStep={{0}}
            {slot}="px-2 disabled:opacity-50 enabled:border-2 not-disabled:bg-blue-500 not-enabled:outline-4 not-aria-selected:font-bold not-aria-disabled:text-red-500 disabled:not-enabled:underline"
            />"#
        );
        let parsed = hozo_parser::parse_tsx(&source);
        let output = lower(&parsed.roots[0].node, &source, &Theme::default());
        assert!(
            output.diagnostics.is_empty(),
            "{slot}: {:?}",
            output.diagnostics
        );
        for predicate in [
            "__hozoSlotDisabled &&",
            "__hozoSlotEnabled &&",
            "!(__hozoSlotDisabled) &&",
            "!(__hozoSlotEnabled) &&",
            "__hozoSlotDisabled && !(__hozoSlotEnabled) &&",
        ] {
            assert!(
                output.jsx.contains(predicate),
                "{predicate}: {}",
                output.jsx
            );
        }
        // The callback needs local facts, not an event-owner gate around all
        // entries: descriptive rows must match both negative pseudo-classes.
        assert!(
            !output.jsx.contains("interactionAvailable &&"),
            "{}",
            output.jsx
        );
        assert!(
            output.styles.contains("fontWeight: '700'")
                && output.styles.contains("color: '#fb2c36'"),
            "{}",
            output.styles
        );
    }
    let source = r#"import { Stepper } from '@hozo/core'
      const el = <Stepper steps={steps} activeStep={0} onStepPress={handler}
        stepClassName="not-disabled:not-hover:opacity-50" />"#;
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());
    assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
    assert!(
        output.jsx.contains("(interactionAvailable && !(hovered))"),
        "{}",
        output.jsx
    );
    assert!(
        output.jsx.contains("!(__hozoSlotDisabled)"),
        "{}",
        output.jsx
    );
}

#[test]
fn text_input_focus_styles_use_the_field_and_keep_value_typography() {
    let compile = |props: &str| {
        let source = format!("import {{ TextInput }} from '@hozo/core'\nfunction C() {{ return <TextInput accessibilityLabel=\"Field\" {props} /> }}");
        let parsed = hozo_parser::parse_tsx(&source);
        lower(&parsed.roots[0].node, &source, &Theme::default())
    };
    let plain = compile(r#"className="text-red-500 text-sm border""#);
    assert!(plain.diagnostics.is_empty(), "{:?}", plain.diagnostics);
    assert!(plain.jsx.starts_with("<TextInput style="), "{}", plain.jsx);
    assert!(
        plain.runtime_imports.is_empty(),
        "{:?}",
        plain.runtime_imports
    );
    assert!(
        plain.styles.contains("color: '#fb2c36'"),
        "{}",
        plain.styles
    );
    assert!(plain.styles.contains("fontSize: 14"), "{}", plain.styles);
    let output = compile(
        r#"className="px-2 text-red-500 focus:text-blue-500 focus-visible:outline-4 not-focus:opacity-50 md:not-focus-visible:outline-1" style={extra} ref={input} onFocus={focused} onBlur={blurred}"#,
    );
    assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
    assert!(
        output.jsx.starts_with("<HozoTextInput ") && output.jsx.contains("hozoStyle="),
        "{}",
        output.jsx
    );
    assert!(
        output.runtime_imports.contains(&"HozoTextInput"),
        "{:?}",
        output.runtime_imports
    );
    for expected in [
        "focused &&",
        "focusVisible &&",
        "!(focused) &&",
        "!(focusVisible)",
        "style={[extra]}",
        "ref={input}",
        "onFocus={focused}",
        "onBlur={blurred}",
    ] {
        assert!(
            output.jsx.contains(expected),
            "{expected} missing from {}",
            output.jsx
        );
    }
    assert!(
        output.styles.contains("color: '#2b7fff'"),
        "{}",
        output.styles
    );
    assert!(
        !output.jsx.contains("HozoPressable") && !output.jsx.contains("HozoText "),
        "{}",
        output.jsx
    );
    for condition in [
        "hover",
        "active",
        "not-hover",
        "md:not-active",
        "hover:focus-visible",
        "not-focus-within",
    ] {
        let output = compile(&format!(r#"className="{condition}:opacity-50""#));
        assert!(
            output.diagnostics.iter().any(
                |d| d.code == DiagnosticCode::NotWiredOnNative && d.severity == Severity::Error
            ),
            "{condition}: {:?}",
            output.diagnostics
        );
    }
}

#[test]
fn runtime_text_input_classes_receive_only_field_focus_facts() {
    let source = "import { TextInput } from '@hozo/core'; function C({extra}) {return <TextInput accessibilityLabel=\"Field\" className={extra} style={custom} ref={input} />}";
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());
    assert!(
        output
            .diagnostics
            .iter()
            .all(|d| d.code == DiagnosticCode::DynamicClassNameNotResolved),
        "{:?}",
        output.diagnostics
    );
    assert!(output.jsx.starts_with("<HozoTextInput "), "{}", output.jsx);
    assert!(
        output
            .jsx
            .contains("hozoClasses(extra, { focused, focusVisible })"),
        "{}",
        output.jsx
    );
    for expected in [
        "hozoStyle=",
        "style={[hozoAuthoredStyle(custom)]}",
        "ref={input}",
    ] {
        assert!(output.jsx.contains(expected), "{}", output.jsx);
    }
    assert!(
        !output.jsx.contains("hozoClasses(extra, { pressed"),
        "{}",
        output.jsx
    );
}

#[test]
fn a_stepper_is_hozo_stepper_with_a_style_per_status() {
    let source = r#"
        import { Stepper } from '@hozo/core'
        const el = <Stepper steps={steps} activeStep={1} className="gap-2" currentStepClassName="font-bold" completedIndicatorClassName="bg-blue-600" errorIndicatorClassName="bg-red-600" />
        "#;
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());
    assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
    assert!(
        output
            .jsx
            .starts_with("<HozoStepper style={hozoStyles.hozo0}"),
        "{}",
        output.jsx
    );
    for prop in [
        "currentStepStyle={hozoStyles.hozo1}",
        "completedIndicatorStyle={hozoStyles.hozo2}",
        "errorIndicatorStyle={hozoStyles.hozo3}",
        "steps={steps}",
        "activeStep={1}",
    ] {
        assert!(output.jsx.contains(prop), "{prop}: {}", output.jsx);
    }
    assert!(
        output.runtime_imports.contains(&"HozoStepper"),
        "{:?}",
        output.runtime_imports
    );
}

#[test]
fn a_table_is_runtime_parts_whose_cells_keep_their_text_styles() {
    // #144: a cell is nearly always `{row.price}`, so its text styles stay
    // on the cell, which wraps its own content in a Text; a header cell is
    // the same component told it is one.
    let source = r#"
        import { Table, TableBody, TableRow, TableHead, TableCell } from '@hozo/core'
        const el = <Table className="w-full"><TableBody><TableRow><TableHead scope="row">{name}</TableHead><TableCell className="text-right font-bold">{price}</TableCell></TableRow></TableBody></Table>
        "#;
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());
    assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
    assert!(
        output
            .jsx
            .starts_with("<HozoTable style={hozoStyles.hozo0}>"),
        "{}",
        output.jsx
    );
    assert!(
        output.jsx.contains(r#"<HozoTableSection section="body">"#),
        "{}",
        output.jsx
    );
    assert!(
        output
            .jsx
            .contains(r#"<HozoTableCell head scope="row">{name}</HozoTableCell>"#),
        "{}",
        output.jsx
    );
    assert!(
        output.jsx.contains("{price}</HozoTableCell>"),
        "{}",
        output.jsx
    );
    assert!(!output.jsx.contains("<Text"), "{}", output.jsx);
    assert!(
        output.styles.contains("textAlign: 'right'"),
        "{}",
        output.styles
    );
    for name in [
        "HozoTable",
        "HozoTableSection",
        "HozoTableRow",
        "HozoTableCell",
    ] {
        assert!(
            output.runtime_imports.contains(&name),
            "{name}: {:?}",
            output.runtime_imports
        );
    }
}

#[test]
fn otp_input_focus_belongs_to_the_field_not_wrapper_or_virtual_cells() {
    let compile = |props: &str| {
        let source = format!("import {{ OtpInput }} from '@hozo/core'\nconst el = <OtpInput accessibilityLabel=\"Code\" {props} />");
        let parsed = hozo_parser::parse_tsx(&source);
        lower(&parsed.roots[0].node, &source, &Theme::default())
    };
    let output = compile(
        r#"disabled={blocked} inputClassName="rounded-lg focus:outline-2 focus-visible:outline-4 not-focus:opacity-50 md:not-focus-visible:outline-1 disabled:opacity-25" inputStyle={extra}"#,
    );
    assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
    assert!(output.jsx.contains("hozoInputStyle={({ pressed, hovered, focused, focusVisible, disabled: __hozoSlotDisabled, enabled: __hozoSlotEnabled, readOnly: __hozoSlotReadOnly }) => ["), "{}", output.jsx);
    for expected in [
        "focused &&",
        "focusVisible &&",
        "!(focused) &&",
        "!(focusVisible)",
        "inputStyle={extra}",
        "disabled={blocked}",
    ] {
        assert!(
            output.jsx.contains(expected),
            "{expected} missing from {}",
            output.jsx
        );
    }
    let base = compile(r#"inputClassName="rounded-lg""#);
    assert!(base.diagnostics.is_empty(), "{:?}", base.diagnostics);
    assert!(
        base.jsx.contains("inputStyle={hozoStyles.hozo1}"),
        "{}",
        base.jsx
    );
    assert!(!base.jsx.contains("hozoInputStyle"), "{}", base.jsx);
    for slot in [
        "className",
        "cellClassName",
        "activeCellClassName",
        "filledCellClassName",
    ] {
        for condition in ["focus", "not-focus-visible", "md:not-focus"] {
            let output = compile(&format!(r#"{slot}="{condition}:outline-2""#));
            assert!(
                output
                    .diagnostics
                    .iter()
                    .any(|d| d.code == DiagnosticCode::NotWiredOnNative
                        && d.severity == Severity::Error),
                "{slot}/{condition}: {:?}",
                output.diagnostics
            );
        }
    }
    for condition in ["hover", "active", "not-hover", "md:not-active"] {
        let output = compile(&format!(r#"inputClassName="{condition}:opacity-50""#));
        assert!(
            output
                .diagnostics
                .iter()
                .any(|d| d.code == DiagnosticCode::NotWiredOnNative
                    && d.severity == Severity::Error
                    && d.message.contains("different owner")),
            "{condition}: {:?}",
            output.diagnostics
        );
        assert!(!output.jsx.contains("hozoInputStyle"), "{}", output.jsx);
    }
}

#[test]
fn otp_input_semantics_use_internal_field_facts_without_authored_drivers() {
    let source = r#"import { OtpInput } from '@hozo/core'
        const el = <OtpInput accessibilityLabel="Code"
          inputClassName="disabled:opacity-25 enabled:rounded-lg read-only:outline-2 not-read-only:outline-4 not-disabled:outline-offset-2 not-enabled:outline-offset-4 read-only:focus:opacity-50 aria-disabled:border-8 not-aria-disabled:border-2" />"#;
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());
    assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
    for expected in [
        "disabled: __hozoSlotDisabled",
        "enabled: __hozoSlotEnabled",
        "readOnly: __hozoSlotReadOnly",
        "__hozoSlotDisabled &&",
        "__hozoSlotEnabled &&",
        "__hozoSlotReadOnly &&",
        "!(__hozoSlotReadOnly) &&",
        "__hozoSlotReadOnly && focused &&",
    ] {
        assert!(output.jsx.contains(expected), "{expected}: {}", output.jsx);
    }
    for slot in [
        "className",
        "cellClassName",
        "activeCellClassName",
        "filledCellClassName",
    ] {
        let source = format!(
            r#"import {{ OtpInput }} from '@hozo/core'
            const el = <OtpInput accessibilityLabel="Code" disabled
              {slot}="disabled:opacity-25 enabled:outline-8 read-only:rounded-lg not-read-only:opacity-50 not-disabled:border-2 not-enabled:pt-1 aria-disabled:outline-8" />"#
        );
        let parsed = hozo_parser::parse_tsx(&source);
        let output = lower(&parsed.roots[0].node, &source, &Theme::default());
        assert!(
            output.diagnostics.is_empty(),
            "{slot}: {:?}",
            output.diagnostics
        );
        assert!(
            !output.jsx.contains("__hozoSlotDisabled")
                && !output.jsx.contains("__hozoSlotReadOnly"),
            "constants need no callback: {}",
            output.jsx
        );
    }
    for (slot, variant) in [
        ("cellClassName", "aria-expanded"),
        ("activeCellClassName", "aria-expanded"),
        ("filledCellClassName", "not-aria-expanded"),
        ("inputClassName", "not-aria-expanded"),
    ] {
        let source = format!(
            r#"import {{ OtpInput }} from '@hozo/core'
            const el = <OtpInput accessibilityLabel="Code" {slot}="{variant}:opacity-50" />"#
        );
        let parsed = hozo_parser::parse_tsx(&source);
        let output = lower(&parsed.roots[0].node, &source, &Theme::default());
        assert!(
            output.diagnostics.iter().any(
                |d| d.code == DiagnosticCode::NotWiredOnNative && d.severity == Severity::Error
            ),
            "{slot}/{variant}: {:?}",
            output.diagnostics
        );
    }
}

#[test]
fn an_otp_input_is_hozo_otp_input_with_a_style_per_cell_state() {
    let source = r#"
        import { OtpInput } from '@hozo/core'
        const el = <OtpInput length={6} onComplete={verify} accessibilityLabel="Verification code" className="gap-2" cellClassName="size-10 border text-lg" activeCellClassName="border-blue-600" filledCellClassName="bg-slate-100" />
        "#;
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());
    assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
    assert!(
        output
            .jsx
            .starts_with("<HozoOtpInput style={hozoStyles.hozo0}"),
        "{}",
        output.jsx
    );
    for prop in [
        "cellStyle={hozoStyles.hozo1}",
        "activeCellStyle={hozoStyles.hozo2}",
        "filledCellStyle={hozoStyles.hozo3}",
        "onComplete={verify}",
    ] {
        assert!(output.jsx.contains(prop), "{prop}: {}", output.jsx);
    }
    assert!(
        output.runtime_imports.contains(&"HozoOtpInput"),
        "{:?}",
        output.runtime_imports
    );
}

#[test]
fn an_image_srcset_of_widths_is_said_to_be_density_only_on_native() {
    // React Native picks a `srcSet` candidate by density and skips a width
    // descriptor at runtime, so a set of widths can draw nothing on device.
    let compile = |src_set: &str| {
        let source = format!(
            "import {{ Image }} from '@hozo/core'\nconst el = <Image src=\"a.jpg\" srcSet=\"{src_set}\" alt=\"A\" />\n"
        );
        let parsed = hozo_parser::parse_tsx(&source);
        lower(&parsed.roots[0].node, &source, &Theme::default())
    };
    let widths = compile("a-400.jpg 400w, a-800.jpg 800w");
    assert!(
        widths
            .diagnostics
            .iter()
            .any(|d| d.code == hozo_ir::DiagnosticCode::NotWiredOnNative
                && d.severity == hozo_ir::Severity::Warning
                && d.message.contains("density")),
        "{:?}",
        widths.diagnostics
    );
    // Passed through either way: React Native reads it.
    assert!(
        widths
            .jsx
            .contains(r#"srcSet="a-400.jpg 400w, a-800.jpg 800w""#),
        "{}",
        widths.jsx
    );
    let densities = compile("a.jpg 1x, a@2x.jpg 2x");
    assert!(
        densities.diagnostics.is_empty(),
        "{:?}",
        densities.diagnostics
    );
}

#[test]
fn a_command_palette_is_hozo_command_palette_with_a_style_per_part() {
    let source = r#"
        import { CommandPalette } from '@hozo/core'
        const el = <CommandPalette open={open} onOpenChange={setOpen} commands={commands} panelClassName="bg-white text-sm" itemClassName="px-3" activeItemClassName="bg-slate-100" groupHeadingClassName="text-xs" />
        "#;
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());
    assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
    assert!(
        output.jsx.starts_with("<HozoCommandPalette "),
        "{}",
        output.jsx
    );
    for prop in [
        // Numbered in the slot table's order, not the order they were written.
        "panelStyle={hozoStyles.hozo1}",
        "groupHeadingStyle={hozoStyles.hozo2}",
        "itemStyle={hozoStyles.hozo3}",
        "activeItemStyle={hozoStyles.hozo4}",
        "commands={commands}",
        "onOpenChange={setOpen}",
    ] {
        assert!(output.jsx.contains(prop), "{prop}: {}", output.jsx);
    }
    assert!(
        output.runtime_imports.contains(&"HozoCommandPalette"),
        "{:?}",
        output.runtime_imports
    );
}

#[test]
fn command_item_pointer_states_compile_without_inventing_input_focus() {
    let source = r#"import { CommandPalette } from '@hozo/core'
        const el = <CommandPalette open commands={commands}
            itemClassName="px-2 hover:bg-blue-500 active:opacity-50 not-hover:text-white md:hover:text-black"
            activeItemClassName="border-2 hover:opacity-75 active:opacity-25"
            itemStyle={extra} activeItemStyle={activeExtra} />"#;
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());
    assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
    for prop in ["hozoItemStyle", "hozoActiveItemStyle"] {
        assert!(output.jsx.contains(&format!("{prop}={{({{ pressed, hovered, focused, focusVisible, 'aria-disabled': __hozoSlotAriaDisabled, 'aria-selected': __hozoSlotAriaSelected }}) => [")), "{}", output.jsx);
    }
    for expected in [
        "hovered &&",
        "pressed &&",
        "!(hovered) &&",
        "__hozoBp_md && hovered &&",
        "itemStyle={extra}",
        "activeItemStyle={activeExtra}",
    ] {
        assert!(
            output.jsx.contains(expected),
            "{expected} missing from {}",
            output.jsx
        );
    }
    assert!(
        !output.jsx.contains("hozoClasses(") && !output.jsx.contains("HozoPressable"),
        "{}",
        output.jsx
    );
}

#[test]
fn command_option_semantics_are_not_native_button_pseudo_classes() {
    for slot in ["itemClassName", "activeItemClassName"] {
        let source = format!(
            r#"import {{ CommandPalette }} from '@hozo/core'
            const el = <CommandPalette commands={{commands}}
              {slot}="disabled:ml-8 enabled:mr-8 not-disabled:mt-1 not-enabled:mb-1 aria-selected:border-2 not-aria-selected:opacity-50 aria-disabled:rounded-lg not-aria-disabled:pt-1 aria-selected:hover:text-white aria-checked:outline-8 not-aria-checked:pb-1" />"#
        );
        let parsed = hozo_parser::parse_tsx(&source);
        let output = lower(&parsed.roots[0].node, &source, &Theme::default());
        assert!(
            output.diagnostics.is_empty(),
            "{slot}: {:?}",
            output.diagnostics
        );
        for expected in [
            "__hozoSlotAriaSelected &&",
            "!(__hozoSlotAriaSelected) &&",
            "__hozoSlotAriaDisabled &&",
            "!(__hozoSlotAriaDisabled) &&",
            "__hozoSlotAriaSelected && hovered &&",
        ] {
            assert!(output.jsx.contains(expected), "{expected}: {}", output.jsx);
        }
        // Neither positive pseudo-class applies to the div, but its negations
        // do. No outer prop or Native button state is consulted for them.
        assert!(
            !output.jsx.contains("__hozoSlotDisabled") && !output.jsx.contains("__hozoSlotEnabled"),
            "{}",
            output.jsx
        );
        assert!(
            output.styles.contains("marginTop: 4") && output.styles.contains("marginBottom: 4"),
            "{}",
            output.styles
        );
        let unsupported = source.replace("not-aria-checked:pb-1", "not-aria-expanded:pb-1");
        let parsed = hozo_parser::parse_tsx(&unsupported);
        let output = lower(&parsed.roots[0].node, &unsupported, &Theme::default());
        assert!(
            output.diagnostics.iter().any(
                |d| d.code == DiagnosticCode::NotWiredOnNative && d.severity == Severity::Error
            ),
            "{:?}",
            output.diagnostics
        );
    }
    for slot in [
        "className",
        "scrimClassName",
        "panelClassName",
        "inputClassName",
        "listClassName",
        "shortcutClassName",
        "groupHeadingClassName",
        "emptyClassName",
    ] {
        let source = format!(
            r#"import {{ CommandPalette }} from '@hozo/core'
            const el = <CommandPalette commands={{commands}} {slot}="aria-selected:opacity-50" />"#
        );
        let parsed = hozo_parser::parse_tsx(&source);
        let output = lower(&parsed.roots[0].node, &source, &Theme::default());
        assert!(
            output.diagnostics.is_empty(),
            "{slot}: {:?}",
            output.diagnostics
        );
        assert!(
            !output.jsx.contains("_ariaselected"),
            "this owner is never selected: {}",
            output.jsx
        );
    }
}

#[test]
fn command_item_focus_is_refused_alone_stacked_and_negated() {
    for slot in ["itemClassName", "activeItemClassName"] {
        for variant in [
            "focus",
            "focus-visible",
            "not-focus",
            "not-focus-visible",
            "hover:focus",
            "md:not-focus-visible",
        ] {
            let source = format!(
                r#"import {{ CommandPalette }} from '@hozo/core'; const el = <CommandPalette commands={{commands}} {slot}="{variant}:opacity-50" />"#
            );
            let parsed = hozo_parser::parse_tsx(&source);
            let output = lower(&parsed.roots[0].node, &source, &Theme::default());
            assert!(
                output
                    .diagnostics
                    .iter()
                    .any(|d| d.code == DiagnosticCode::NotWiredOnNative
                        && d.severity == Severity::Error
                        && d.message.contains("Web input keeps focus")),
                "{slot} {variant}: {:?}",
                output.diagnostics
            );
            assert!(
                !output.jsx.contains("_focus"),
                "a refused predicate must not apply: {}",
                output.jsx
            );
        }
    }
    for slot in [
        "className",
        "scrimClassName",
        "panelClassName",
        "inputClassName",
        "shortcutClassName",
        "groupHeadingClassName",
        "emptyClassName",
    ] {
        let source = format!(
            r#"import {{ CommandPalette }} from '@hozo/core'; const el = <CommandPalette commands={{commands}} {slot}="hover:opacity-50" />"#
        );
        let parsed = hozo_parser::parse_tsx(&source);
        let output = lower(&parsed.roots[0].node, &source, &Theme::default());
        assert!(
            output.diagnostics.iter().any(
                |d| d.code == DiagnosticCode::NotWiredOnNative && d.severity == Severity::Error
            ),
            "{slot}: {:?}",
            output.diagnostics
        );
    }
}

#[test]
fn a_color_picker_is_hozo_color_picker_with_a_style_per_part() {
    let source = r#"
        import { ColorPicker } from '@hozo/core'
        const el = <ColorPicker value={color} onChange={setColor} presets={presets} accessibilityLabel="Theme" swatchClassName="size-8" selectedSwatchClassName="border-2" sliderClassName="h-3" thumbClassName="size-5" inputClassName="px-2" />
        "#;
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());
    assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
    assert!(
        output.jsx.starts_with("<HozoColorPicker "),
        "{}",
        output.jsx
    );
    for prop in [
        "swatchStyle={hozoStyles.hozo1}",
        "selectedSwatchStyle={hozoStyles.hozo2}",
        "sliderStyle={hozoStyles.hozo3}",
        "thumbStyle={hozoStyles.hozo4}",
        "inputStyle={hozoStyles.hozo5}",
        "presets={presets}",
    ] {
        assert!(output.jsx.contains(prop), "{prop}: {}", output.jsx);
    }
    assert!(
        output.runtime_imports.contains(&"HozoColorPicker"),
        "{:?}",
        output.runtime_imports
    );
}

#[test]
fn color_picker_compiles_only_the_slots_with_real_swatch_interaction() {
    let compile = |props: &str| {
        let source = format!("import {{ ColorPicker }} from '@hozo/core'\nconst el = <ColorPicker accessibilityLabel=\"Theme\" {props} />");
        let parsed = hozo_parser::parse_tsx(&source);
        lower(&parsed.roots[0].node, &source, &Theme::default())
    };
    let output = compile(
        r#"swatchClassName="size-8 hover:opacity-50 not-focus:border-2" selectedSwatchClassName="border-2 md:focus-visible:outline-2" swatchStyle={extra} selectedSwatchStyle={selectedExtra}"#,
    );
    assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
    for expected in [
        "hozoSwatchStyle={({ pressed, hovered, focused, focusVisible, disabled: __hozoSlotDisabled, enabled: __hozoSlotEnabled, 'aria-checked': __hozoSlotAriaChecked }) => [",
        "hozoSelectedSwatchStyle={({ pressed, hovered, focused, focusVisible, disabled: __hozoSlotDisabled, enabled: __hozoSlotEnabled, 'aria-checked': __hozoSlotAriaChecked }) => [",
        "hovered &&", "!(focused) &&", "__hozoBp_md && focusVisible &&",
        "swatchStyle={extra}", "selectedSwatchStyle={selectedExtra}",
    ] {
        assert!(output.jsx.contains(expected), "{expected} missing from {}", output.jsx);
    }
    for slot in [
        "className",
        "sliderClassName",
        "thumbClassName",
        "inputClassName",
    ] {
        let output = compile(&format!(r#"{slot}="hover:opacity-50""#));
        assert!(
            output.diagnostics.iter().any(
                |d| d.code == DiagnosticCode::NotWiredOnNative && d.severity == Severity::Error
            ),
            "{slot}: {:?}",
            output.diagnostics
        );
    }
}

#[test]
fn color_picker_semantics_belong_to_each_radio_not_the_group() {
    for slot in ["swatchClassName", "selectedSwatchClassName"] {
        let source = format!(
            r#"import {{ ColorPicker }} from '@hozo/core'
          const el = <ColorPicker accessibilityLabel="Theme"
            {slot}="disabled:opacity-25 enabled:border-2 not-disabled:mt-1 not-enabled:mb-1 aria-checked:outline-4 not-aria-checked:rounded-lg not-aria-disabled:pt-1 not-aria-selected:pb-1 aria-checked:hover:opacity-50 disabled:not-enabled:border-4" />"#
        );
        let parsed = hozo_parser::parse_tsx(&source);
        let output = lower(&parsed.roots[0].node, &source, &Theme::default());
        assert!(
            output.diagnostics.is_empty(),
            "{slot}: {:?}",
            output.diagnostics
        );
        for expected in [
            "disabled: __hozoSlotDisabled",
            "enabled: __hozoSlotEnabled",
            "'aria-checked': __hozoSlotAriaChecked",
            "__hozoSlotDisabled &&",
            "__hozoSlotEnabled &&",
            "!(__hozoSlotDisabled) &&",
            "!(__hozoSlotEnabled) &&",
            "!(__hozoSlotAriaChecked) &&",
            "__hozoSlotAriaChecked && hovered &&",
        ] {
            assert!(output.jsx.contains(expected), "{expected}: {}", output.jsx);
        }
        assert!(
            !output.jsx.contains("interactionAvailable"),
            "{}",
            output.jsx
        );
        // A truly unknown state is still an error, including under negation.
        let unsupported = source.replace("not-aria-selected:pb-1", "not-aria-expanded:pb-1");
        let parsed = hozo_parser::parse_tsx(&unsupported);
        let output = lower(&parsed.roots[0].node, &unsupported, &Theme::default());
        assert!(
            output.diagnostics.iter().any(
                |d| d.code == DiagnosticCode::NotWiredOnNative && d.severity == Severity::Error
            ),
            "{:?}",
            output.diagnostics
        );
    }
    // Every non-swatch slot has audited absent checked state on its own owner.
    for slot in [
        "className",
        "sliderClassName",
        "thumbClassName",
        "inputClassName",
    ] {
        let source = format!(
            r#"import {{ ColorPicker }} from '@hozo/core'
          const el = <ColorPicker accessibilityLabel="Theme" {slot}="aria-checked:opacity-50" />"#
        );
        let parsed = hozo_parser::parse_tsx(&source);
        let output = lower(&parsed.roots[0].node, &source, &Theme::default());
        assert!(
            output.diagnostics.is_empty(),
            "{slot}: {:?}",
            output.diagnostics
        );
        assert!(
            !output.jsx.contains("_ariachecked"),
            "{slot} is never a checked radio: {}",
            output.jsx
        );
    }
}
