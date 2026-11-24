use super::*;

#[test]
fn menu_button_and_action_divs_have_distinct_semantic_callbacks() {
    let source = r#"import { Menu } from '@hozo/core'; const el = <Menu trigger="Actions" items={items}
        className="disabled:opacity-25 enabled:opacity-50 text-red-500"
        triggerClassName="focus:opacity-50 enabled:px-3 aria-expanded:border-2 read-only:rounded-lg"
        menuClassName="read-only:rounded-lg disabled:opacity-25"
        itemClassName="focus:opacity-50 hover:opacity-75 aria-disabled:opacity-25 aria-selected:ml-8 disabled:mt-8 enabled:mb-8" />"#;
    let parsed = hozo_parser::parse_tsx(source);
    let out = lower(&parsed.roots[0].node, source, &Theme::default());
    assert!(out.diagnostics.is_empty(), "{:?}", out.diagnostics);
    assert!(out.jsx.starts_with("<HozoMenu"), "{}", out.jsx);
    assert!(out.jsx.contains("hozoTriggerStyle="), "{}", out.jsx);
    assert!(out.jsx.contains("hozoItemStyle="), "{}", out.jsx);
    let trigger = out
        .jsx
        .split("hozoTriggerStyle=")
        .nth(1)
        .unwrap()
        .split("menuStyle=")
        .next()
        .unwrap();
    assert!(
        trigger.contains("'aria-expanded': __hozoSlotAriaExpanded"),
        "{trigger}"
    );
    assert!(!trigger.contains("__hozoSlotAriaDisabled"), "{trigger}");
    let item = out.jsx.split("hozoItemStyle=").nth(1).unwrap();
    assert!(
        item.contains("'aria-disabled': __hozoSlotAriaDisabled"),
        "{item}"
    );
    assert!(!item.contains("__hozoSlotAriaExpanded"), "{item}");
    assert!(out.runtime_imports.contains(&"HozoMenu"));
}

#[test]
fn menu_non_control_roots_and_panel_cannot_borrow_child_events() {
    for slot in ["className", "menuClassName"] {
        for variant in ["hover", "not-active", "focus", "not-focus-visible"] {
            let source = format!("import {{ Menu }} from '@hozo/core'; const el = <Menu trigger=\"Actions\" items={{items}} {slot}=\"{variant}:opacity-50\" />");
            let parsed = hozo_parser::parse_tsx(&source);
            let out = lower(&parsed.roots[0].node, &source, &Theme::default());
            assert!(
                out.diagnostics
                    .iter()
                    .any(|d| d.code == DiagnosticCode::NotWiredOnNative),
                "{slot}/{variant}: {:?}",
                out.diagnostics
            );
        }
    }
    let source = "import { Menu } from '@hozo/core'; const el = <Menu trigger=\"Actions\" items={[]} className={choose()} />";
    let parsed = hozo_parser::parse_tsx(source);
    let out = lower(&parsed.roots[0].node, source, &Theme::default());
    assert!(
        out.jsx
            .contains("hozoClasses(choose(), { disabled: false, enabled: false, readOnly: true"),
        "{}",
        out.jsx
    );
}

#[test]
fn listbox_options_own_focus_and_selection_but_are_not_form_controls() {
    let source = r#"import { Listbox } from '@hozo/core'; const el = <Listbox options={options}
        className="disabled:opacity-25 enabled:opacity-50 text-red-500"
        optionClassName="focus:opacity-50 focus-visible:outline-2 hover:opacity-75 aria-selected:border-2 aria-disabled:opacity-25 read-only:rounded-lg disabled:mt-8 enabled:mb-8" />"#;
    let parsed = hozo_parser::parse_tsx(source);
    let out = lower(&parsed.roots[0].node, source, &Theme::default());
    assert!(out.diagnostics.is_empty(), "{:?}", out.diagnostics);
    assert!(out.jsx.starts_with("<HozoListbox"), "{}", out.jsx);
    assert!(out.jsx.contains("hozoOptionStyle="), "{}", out.jsx);
    assert!(out.jsx.contains("focused &&"), "{}", out.jsx);
    assert!(out.jsx.contains("focusVisible &&"), "{}", out.jsx);
    assert!(out.jsx.contains("'aria-selected': __hozoSlotAriaSelected"));
    assert!(out.jsx.contains("'aria-disabled': __hozoSlotAriaDisabled"));
    assert!(out.runtime_imports.contains(&"HozoListbox"));
    for variant in ["focus", "not-focus", "hover", "not-hover"] {
        let source = format!("import {{ Listbox }} from '@hozo/core'; const el = <Listbox options={{options}} className=\"{variant}:opacity-50\" />");
        let parsed = hozo_parser::parse_tsx(&source);
        let out = lower(&parsed.roots[0].node, &source, &Theme::default());
        assert!(
            out.diagnostics
                .iter()
                .any(|d| d.code == DiagnosticCode::NotWiredOnNative),
            "{variant}: {:?}",
            out.diagnostics
        );
    }
}

#[test]
fn opaque_listbox_root_has_constant_facts_not_option_focus_or_selection() {
    let source = "import { Listbox } from '@hozo/core'; const el = <Listbox options={[]} className={choose()} />";
    let parsed = hozo_parser::parse_tsx(source);
    let out = lower(&parsed.roots[0].node, source, &Theme::default());
    assert!(
        out.jsx
            .contains("hozoClasses(choose(), { disabled: false, enabled: false, readOnly: true"),
        "{}",
        out.jsx
    );
    assert!(!out.jsx.contains("focused, focusVisible"), "{}", out.jsx);
}

#[test]
fn combobox_slots_lower_to_independent_pattern_owners() {
    let source = r#"import { Combobox } from '@hozo/core'; const el = <Combobox options={options}
        className="read-only:rounded-lg disabled:opacity-25"
        inputClassName="focus:opacity-50 focus-visible:outline-2 enabled:px-3 aria-expanded:border-2"
        listClassName="read-only:rounded-lg not-disabled:mt-2"
        optionClassName="hover:opacity-50 aria-selected:border-2 aria-disabled:opacity-25 read-only:rounded-lg" />"#;
    let parsed = hozo_parser::parse_tsx(source);
    let out = lower(&parsed.roots[0].node, source, &Theme::default());
    assert!(out.diagnostics.is_empty(), "{:?}", out.diagnostics);
    assert!(out.jsx.starts_with("<HozoCombobox"), "{}", out.jsx);
    assert!(out.jsx.contains("hozoInputStyle="), "{}", out.jsx);
    assert!(out.jsx.contains("hozoOptionStyle="), "{}", out.jsx);
    assert!(out.jsx.contains("listStyle="), "{}", out.jsx);
    assert!(out.jsx.contains("'aria-expanded': __hozoSlotAriaExpanded"));
    assert!(out.jsx.contains("'aria-selected': __hozoSlotAriaSelected"));
    assert!(out.runtime_imports.contains(&"HozoCombobox"));
}

#[test]
fn combobox_placeholder_uses_its_real_field_prop_not_a_text_style() {
    let source = r#"import { Combobox } from '@hozo/core'; function C() {
        return <Combobox options={[]} inputClassName="text-green-500 placeholder:text-red-500 dark:placeholder:text-blue-500 aria-[invalid=true]:border-2" />;
    }"#;
    let parsed = hozo_parser::parse_tsx(source);
    let out = lower(&parsed.roots[0].node, source, &Theme::default());
    assert!(out.diagnostics.is_empty(), "{:?}", out.diagnostics);
    assert!(
        out.jsx
            .contains("hozoInputPlaceholderTextColor={__hozoDark ?"),
        "{}",
        out.jsx
    );
    assert!(out.jsx.contains("__hozoSlotAriaInvalid &&"), "{}", out.jsx);
    assert!(out.jsx.contains("'#fb2c36'"), "{}", out.jsx);
    assert!(!out.styles.contains("#fb2c36"), "{}", out.styles);
    assert!(out.prelude.iter().any(|line| line.contains("useHozoDark")));
}

#[test]
fn pattern_placeholder_adaptation_does_not_bless_other_owners_or_pseudo_styles() {
    for (slot, classes) in [
        ("optionClassName", "placeholder:text-red-500"),
        ("listClassName", "placeholder:text-red-500"),
        ("inputClassName", "placeholder:font-bold"),
        ("inputClassName", "focus:placeholder:text-red-500"),
        ("inputClassName", "placeholder:text-current"),
    ] {
        let source = format!("import {{ Combobox }} from '@hozo/core'; function C() {{ return <Combobox options={{[]}} {slot}=\"{classes}\" /> }}");
        let parsed = hozo_parser::parse_tsx(&source);
        let out = lower(&parsed.roots[0].node, &source, &Theme::default());
        assert!(
            out.diagnostics
                .iter()
                .any(|d| d.code == DiagnosticCode::NotWiredOnNative),
            "{slot}={classes}: {:?}",
            out.diagnostics
        );
    }
}

#[test]
fn combobox_does_not_lend_events_between_input_list_and_option() {
    for (slot, variant) in [
        ("inputClassName", "hover"),
        ("inputClassName", "not-active"),
        ("optionClassName", "focus"),
        ("optionClassName", "not-focus-visible"),
        ("listClassName", "not-hover"),
        ("className", "focus"),
    ] {
        let source = format!("import {{ Combobox }} from '@hozo/core'; const el = <Combobox options={{options}} {slot}=\"{variant}:opacity-50\" />");
        let parsed = hozo_parser::parse_tsx(&source);
        let out = lower(&parsed.roots[0].node, &source, &Theme::default());
        assert!(
            out.diagnostics
                .iter()
                .any(|d| d.code == DiagnosticCode::NotWiredOnNative),
            "{slot}/{variant}: {:?}",
            out.diagnostics
        );
    }
}

#[test]
fn opaque_combobox_root_candidates_keep_known_non_control_facts() {
    let source = "import { Combobox } from '@hozo/core'; const el = <Combobox options={[]} className={choose()} />";
    let parsed = hozo_parser::parse_tsx(source);
    let out = lower(&parsed.roots[0].node, source, &Theme::default());
    assert!(
        out.jsx
            .contains("hozoClasses(choose(), { disabled: false, enabled: false, readOnly: true"),
        "{}",
        out.jsx
    );
    assert!(!out.jsx.contains("focused, focusVisible"), "{}", out.jsx);
}

#[test]
fn decorative_pattern_semantics_belong_to_the_child_not_the_parent_control() {
    let slots = [
        ("Stepper", "indicatorClassName"),
        ("Stepper", "completedIndicatorClassName"),
        ("Stepper", "currentIndicatorClassName"),
        ("Stepper", "errorIndicatorClassName"),
        ("Stepper", "descriptionClassName"),
        ("Pagination", "ellipsisClassName"),
        ("CommandPalette", "groupHeadingClassName"),
        ("CommandPalette", "shortcutClassName"),
        ("CommandPalette", "emptyClassName"),
        ("Avatar", "imageClassName"),
        ("Avatar", "fallbackClassName"),
        ("Avatar", "statusClassName"),
    ];
    for (component, slot) in slots {
        let source = format!("import {{ {component} }} from '@hozo/core'; const el = <{component} disabled accessibilityState={{{{selected:true,disabled:true}}}} {slot}=\"disabled:opacity-25 enabled:opacity-50 not-disabled:px-2 not-enabled:py-1 read-only:rounded-lg not-read-only:rounded-none aria-selected:border-2 not-aria-selected:mt-2 aria-disabled:border-4\" />");
        let parsed = hozo_parser::parse_tsx(&source);
        let out = lower(&parsed.roots[0].node, &source, &Theme::default());
        assert!(out.diagnostics.is_empty(), "{slot}: {:?}", out.diagnostics);
        assert!(out.styles.contains("borderRadius: 8"), "{}", out.styles);
        assert!(out.styles.contains("paddingStart: 8"), "{}", out.styles);
        assert!(out.styles.contains("paddingTop: 4"), "{}", out.styles);
        for suffix in [
            "_disabled",
            "_enabled",
            "_notreadonly",
            "_ariaselected",
            "_ariadisabled",
        ] {
            assert!(
                !out.jsx.contains(suffix),
                "false child predicate {suffix}: {}",
                out.jsx
            );
        }
        for suffix in [
            "_notdisabled",
            "_notenabled",
            "_readonly",
            "_notariaselected",
        ] {
            assert!(
                out.jsx.contains(suffix),
                "true child predicate {suffix}: {}",
                out.jsx
            );
        }
        assert!(
            !out.jsx.contains("=>"),
            "no interaction callback: {}",
            out.jsx
        );
        assert!(
            out.prelude.is_empty(),
            "no new subscriptions: {:?}",
            out.prelude
        );
        for event in [
            "hover",
            "not-hover",
            "active",
            "not-active",
            "focus",
            "not-focus",
            "focus-visible",
            "not-focus-visible",
        ] {
            // A modeled parent Pressable must not silently lend its callback
            // to an audited child slot in either direction.
            let source = format!("import {{ Pressable, {component} }} from '@hozo/core'; const el = <Pressable><{component} {slot}=\"{event}:opacity-50\" /></Pressable>");
            let parsed = hozo_parser::parse_tsx(&source);
            let out = lower(&parsed.roots[0].node, &source, &Theme::default());
            assert!(
                out.diagnostics
                    .iter()
                    .any(|d| d.code == DiagnosticCode::NotWiredOnNative
                        && d.message.contains("decorative class owner")),
                "{slot}/{event}: {:?}",
                out.diagnostics
            );
        }
    }
}

#[test]
fn a_chip_is_hozo_chip_and_its_class_lists_are_style_props() {
    // #787: on the Web a chip takes two class lists, one for itself and one
    // for its remove button. React Native hands a component styles, so both
    // become style props -- and neither may be dropped on the way.
    let compile = |element: &str| {
        let source = format!("import {{ Chip }} from '@hozo/core'\nconst el = {element}\n");
        let parsed = hozo_parser::parse_tsx(&source);
        lower(&parsed.roots[0].node, &source, &Theme::default())
    };
    let both = compile(
        r#"<Chip selected={on} onRemove={drop} disabled={busy} className="bg-red-500 text-white px-2 md:px-4" removeClassName="p-2">Remote</Chip>"#,
    );
    assert!(both.diagnostics.is_empty(), "{:?}", both.diagnostics);
    assert!(both.jsx.starts_with("<HozoChip "), "{}", both.jsx);
    assert!(
        both.runtime_imports.contains(&"HozoChip"),
        "{:?}",
        both.runtime_imports
    );
    assert!(
        both.jsx
            .contains("style={[hozoStyles.hozo0, __hozoBp_md && hozoStyles.hozo0_md]}"),
        "{}",
        both.jsx
    );
    assert!(
        both.jsx.contains("removeStyle={hozoStyles.hozo1}"),
        "{}",
        both.jsx
    );
    assert!(!both.jsx.contains("className"), "{}", both.jsx);
    // The pattern's own props, as written: `disabled` is not a host's state
    // to translate, and the label stays a string the pattern can name its
    // remove button from.
    assert!(
        both.jsx.contains("disabled={busy}") && both.jsx.contains("onRemove={drop}"),
        "{}",
        both.jsx
    );
    assert!(both.jsx.contains(">Remote</HozoChip>"), "{}", both.jsx);
    // The text colour stays with the chip, which hands it to its label.
    assert!(both.styles.contains("color: '#fff'"), "{}", both.styles);
    assert!(
        both.styles.contains("padding: 8") || both.styles.contains("paddingTop: 8"),
        "{}",
        both.styles
    );

    // An expression reaches the remove button before resolution, so it can
    // supply its state. An authored `removeStyle` still wins, last.
    let dynamic =
        compile(r#"<Chip onRemove={drop} removeClassName={tone} removeStyle={extra}>x</Chip>"#);
    assert!(
        dynamic.jsx.contains("removeClassName={tone}"),
        "{}",
        dynamic.jsx
    );
    assert!(
        dynamic.jsx.contains("removeStyle={extra}"),
        "{}",
        dynamic.jsx
    );
    assert!(
        !dynamic.jsx.contains("hozoClasses(tone)"),
        "{}",
        dynamic.jsx
    );
    assert!(
        dynamic
            .diagnostics
            .iter()
            .any(|d| d.code == hozo_ir::DiagnosticCode::DynamicClassNameNotResolved),
        "{:?}",
        dynamic.diagnostics
    );

    // The remove button now consumes a compiler callback with its own state.
    let hovered = compile(r#"<Chip onRemove={drop} removeClassName="hover:bg-red-500">x</Chip>"#);
    assert!(hovered.diagnostics.is_empty(), "{:?}", hovered.diagnostics);
    assert!(hovered.jsx.contains("hozoRemoveStyle={({ pressed, hovered, focused, focusVisible, disabled: __hozoSlotDisabled, enabled: __hozoSlotEnabled, 'aria-pressed': __hozoSlotAriaPressed }) => [hovered && hozoStyles.hozo1_hover]}"), "{}", hovered.jsx);
}

#[test]
fn dynamic_secondary_pattern_classes_reach_only_registered_owners() {
    for (name, primitive) in [
        ("Chip", Primitive::Chip),
        ("Pagination", Primitive::Pagination),
        ("ColorPicker", Primitive::ColorPicker),
        ("Stepper", Primitive::Stepper),
        ("CommandPalette", Primitive::CommandPalette),
        ("OtpInput", Primitive::OtpInput),
    ] {
        for slot in primitive.class_slots() {
            let owned = crate::pattern::interaction_slot(primitive, slot.class_prop).is_some();
            let source = format!(
                "import {{ {} }} from '@hozo/core'; const el = <{} {}={{selectClasses()}} {}={{extra}} />",
                name, name, slot.class_prop, slot.style_prop,
            );
            let parsed = hozo_parser::parse_tsx(&source);
            let output = lower(&parsed.roots[0].node, &source, &Theme::default());
            assert_eq!(
                output.jsx.matches("selectClasses()").count(),
                1,
                "{}",
                output.jsx
            );
            let warning = output
                .diagnostics
                .iter()
                .find(|d| d.code == DiagnosticCode::DynamicClassNameNotResolved)
                .expect("dynamic candidates are not build-time validated");
            assert_eq!(warning.severity, hozo_ir::Severity::Warning);
            if owned {
                assert!(
                    output
                        .jsx
                        .contains(&format!("{}={{selectClasses()}}", slot.class_prop)),
                    "{}",
                    output.jsx
                );
                assert!(
                    output
                        .jsx
                        .contains(&format!("{}={{extra}}", slot.style_prop)),
                    "{}",
                    output.jsx
                );
                assert!(!output.jsx.contains("hozoClasses("), "{}", output.jsx);
                assert!(
                    warning.message.contains("owner's available state"),
                    "{}",
                    warning.message
                );
            } else if let Some(facts) = crate::pattern::constant_facts(primitive, slot.class_prop) {
                assert!(
                    output
                        .jsx
                        .contains(&format!("hozoClasses(selectClasses(), {facts})")),
                    "{}",
                    output.jsx
                );
                assert!(
                    !output.jsx.contains("=>"),
                    "no event callback: {}",
                    output.jsx
                );
                assert!(
                    warning.message.contains("owner's available state"),
                    "{}",
                    warning.message
                );
            } else {
                assert!(
                    output.jsx.contains("hozoClasses(selectClasses())"),
                    "{}",
                    output.jsx
                );
                assert!(
                    !output.jsx.contains(&format!("{}=", slot.class_prop)),
                    "{}",
                    output.jsx
                );
                assert!(
                    warning.message.contains("Conditional utilities can't"),
                    "{}",
                    warning.message
                );
            }
        }
    }
}

#[test]
fn chip_static_state_callbacks_keep_base_styles_and_explicit_overrides() {
    let source = r#"import { Chip } from '@hozo/core'
        const el = <Chip defaultSelected={false} onRemove={drop} disabled={busy}
            className="bg-red-500 hover:bg-blue-500 active:opacity-50 md:focus:opacity-25 not-hover:text-white focus-visible:outline-2"
            removeClassName="p-2 focus-visible:outline-2 motion-safe:hover:opacity-50"
            style={extra} removeStyle={removeExtra}>Remote</Chip>"#;
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());
    assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
    assert!(output.jsx.contains("hozoStyle={({ pressed, hovered, focused, focusVisible, disabled: __hozoSlotDisabled, enabled: __hozoSlotEnabled, 'aria-pressed': __hozoSlotAriaPressed }) => ["), "{}", output.jsx);
    for guard in [
        "hovered &&",
        "pressed &&",
        "__hozoBp_md && focused &&",
        "!(hovered) &&",
        "__hozoEnv_motion_safe && hovered &&",
    ] {
        assert!(
            output.jsx.contains(guard),
            "{guard} missing from {}",
            output.jsx
        );
    }
    assert!(output.jsx.contains("style={[extra]}"), "{}", output.jsx);
    assert!(
        output.jsx.contains("removeStyle={removeExtra}"),
        "{}",
        output.jsx
    );
    assert!(output.styles.contains("color: '#fff'"), "{}", output.styles);
    assert!(
        output
            .prelude
            .iter()
            .any(|line| line.contains("__hozoBp_md")),
        "{:?}",
        output.prelude
    );
    // These are static styles: no candidate-map lookup, per-slot hooks or
    // extra Pressable wrapping, and no state can escape into a Text child.
    assert!(
        !output.jsx.contains("hozoClasses(") && !output.jsx.contains("HozoText"),
        "{}",
        output.jsx
    );
}

#[test]
fn mixed_secondary_slots_use_the_shared_owner_route_without_a_runtime_downgrade() {
    for (name, primitive) in [
        ("Chip", Primitive::Chip),
        ("Pagination", Primitive::Pagination),
        ("ColorPicker", Primitive::ColorPicker),
        ("Stepper", Primitive::Stepper),
        ("CommandPalette", Primitive::CommandPalette),
        ("OtpInput", Primitive::OtpInput),
    ] {
        for slot in primitive.class_slots() {
            let Some(owner) = crate::pattern::interaction_slot(primitive, slot.class_prop) else {
                continue;
            };
            let state = if owner.pointer { "hover" } else { "focus" };
            let source = format!("import {{{name},cx}} from '@hozo/core'; const el = <{name} onStepPress={{press}} {}={{cx('p-2 {state}:opacity-50 not-{state}:rounded-lg md:mt-2', choose())}} {}={{extra}} />", slot.class_prop, slot.style_prop);
            let parsed = hozo_parser::parse_tsx(&source);
            let output = lower(&parsed.roots[0].node, &source, &Theme::default());
            assert!(
                output
                    .diagnostics
                    .iter()
                    .all(|d| d.code == DiagnosticCode::DynamicClassNameNotResolved),
                "{name}.{}: {:?}",
                slot.class_prop,
                output.diagnostics
            );
            assert_eq!(output.jsx.matches("choose()").count(), 1, "{}", output.jsx);
            assert!(
                output.jsx.contains(&format!("{}={{((", owner.style_prop)),
                "{}",
                output.jsx
            );
            assert!(
                output
                    .jsx
                    .contains("hozoClasses(__hozoClassSlot0Value0, __hozoClassSlot0State)"),
                "{}",
                output.jsx
            );
            assert!(
                output
                    .jsx
                    .contains(&format!("{}={{extra}}", slot.style_prop)),
                "{}",
                output.jsx
            );
            assert!(
                output.jsx.contains("__hozoBp_md &&") && output.jsx.contains("!("),
                "{}",
                output.jsx
            );
            assert!(
                !output.jsx.contains(&format!(" {}=", slot.class_prop)),
                "{}",
                output.jsx
            );
        }
    }
}

#[test]
fn guarded_secondary_slots_share_capture_and_owner_routes() {
    let mut checked = 0;
    for (name, primitive) in [
        ("Chip", Primitive::Chip),
        ("Pagination", Primitive::Pagination),
        ("ColorPicker", Primitive::ColorPicker),
        ("Stepper", Primitive::Stepper),
        ("CommandPalette", Primitive::CommandPalette),
        ("OtpInput", Primitive::OtpInput),
    ] {
        for slot in primitive.class_slots() {
            let Some(owner) = crate::pattern::interaction_slot(primitive, slot.class_prop) else {
                continue;
            };
            let source = format!("import {{{name},cx}} from '@hozo/core'; const el = <{name} onStepPress={{press}} {}={{cx(first(), guard() ? 'p-2' : 'p-4', last())}} {}={{extra}} />", slot.class_prop, slot.style_prop);
            let parsed = hozo_parser::parse_tsx(&source);
            let output = lower(&parsed.roots[0].node, &source, &Theme::default());
            assert!(
                output
                    .diagnostics
                    .iter()
                    .all(|d| d.code == DiagnosticCode::DynamicClassNameNotResolved),
                "{:?}",
                output.diagnostics
            );
            assert!(
                output
                    .jsx
                    .contains(&format!("{}={{((__hozoClassPlan", owner.style_prop)),
                "{}",
                output.jsx
            );
            for call in ["first()", "guard()", "last()"] {
                assert_eq!(output.jsx.matches(call).count(), 1, "{}", output.jsx);
            }
            assert!(
                output
                    .jsx
                    .contains("[(first()), ...((guard()) ? [true] : [false]), (last())]"),
                "{}",
                output.jsx
            );
            assert!(
                output
                    .jsx
                    .contains(&format!("{}={{extra}}", slot.style_prop)),
                "{}",
                output.jsx
            );
            assert!(
                output.styles.contains("paddingTop: 8") && output.styles.contains("paddingTop: 16"),
                "{}",
                output.styles
            );
            checked += 1;
        }
    }
    assert_eq!(checked, 16);
}

#[test]
fn command_search_owns_focus_and_form_facts_but_not_unmeasured_pointer_events() {
    for variant in ["hover", "not-hover", "active", "not-active"] {
        let source = format!("import {{ CommandPalette }} from '@hozo/core'; const el = <CommandPalette commands={{[]}} inputClassName=\"{variant}:opacity-50\" />");
        let parsed = hozo_parser::parse_tsx(&source);
        let out = lower(&parsed.roots[0].node, &source, &Theme::default());
        assert!(
            out.diagnostics
                .iter()
                .any(|d| d.code == DiagnosticCode::NotWiredOnNative),
            "{variant}: {:?}",
            out.diagnostics
        );
    }
}

#[test]
fn chip_root_residuals_use_the_same_owner_route_as_secondary_classes() {
    let compile = |classes: &str| {
        let source = format!("import {{ Chip, cx }} from '@hozo/core'; const el = <Chip className={{{classes}}} style={{extra}} />");
        let parsed = hozo_parser::parse_tsx(&source);
        lower(&parsed.roots[0].node, &source, &Theme::default())
    };
    let opaque = compile("chooseClasses()");
    assert!(
        opaque.jsx.contains("className={chooseClasses()}"),
        "{}",
        opaque.jsx
    );
    assert!(!opaque.jsx.contains("hozoClasses("), "{}", opaque.jsx);
    assert!(
        opaque.jsx.contains("style={[hozoAuthoredStyle(extra)]}"),
        "{}",
        opaque.jsx
    );

    let mixed = compile(
        "cx('p-2 hover:opacity-50 not-focus:rounded-lg md:mt-2', chooseClasses(), chooseOther())",
    );
    assert_eq!(
        mixed.jsx.matches("chooseClasses()").count(),
        1,
        "{}",
        mixed.jsx
    );
    assert_eq!(
        mixed.jsx.matches("chooseOther()").count(),
        1,
        "{}",
        mixed.jsx
    );
    assert!(mixed.jsx.contains("hozoStyles.hozo0, __hozoBp_md && hozoStyles.hozo0_md, hozoClasses(__hozoClassSlot0Value0, __hozoClassSlot0State), hozoClasses(__hozoClassSlot0Value1, __hozoClassSlot0State), hovered &&"), "{}", mixed.jsx);
    assert!(mixed.jsx.contains("!(focused) &&"), "{}", mixed.jsx);
    assert!(
        mixed
            .jsx
            .contains("})((chooseClasses()), (chooseOther()))}"),
        "{}",
        mixed.jsx
    );
    assert!(!mixed.jsx.contains("className="), "{}", mixed.jsx);

    // Even without AOT declarations, several residual leaves must be
    // captured together rather than silently dropping all but the first.
    let multiple = compile("cx(chooseClasses(), chooseOther())");
    assert!(multiple.jsx.contains("hozoClasses(__hozoClassSlot0Value0, __hozoClassSlot0State), hozoClasses(__hozoClassSlot0Value1, __hozoClassSlot0State)"), "{}", multiple.jsx);
    assert_eq!(
        multiple.jsx.matches("chooseClasses()").count(),
        1,
        "{}",
        multiple.jsx
    );
    assert_eq!(
        multiple.jsx.matches("chooseOther()").count(),
        1,
        "{}",
        multiple.jsx
    );

    // An authored reference must not be shadowed by a capture/local name.
    let hygienic = compile("cx(__hozoClassSlot0State && 'hover:opacity-50', chooseClasses())");
    assert!(
        hygienic.jsx.contains("__hozoClassSlot1Value0"),
        "{}",
        hygienic.jsx
    );
    assert!(
        hygienic.jsx.contains("__hozoClassSlot0State"),
        "{}",
        hygienic.jsx
    );
}

#[test]
fn chip_semantic_predicates_read_the_class_owners_private_state() {
    let source = r#"import { Chip } from '@hozo/core'
      const el = <Chip defaultSelected={true} onRemove={maybeRemove}
        className="aria-pressed:bg-blue-500 not-aria-pressed:opacity-50 disabled:opacity-25 enabled:border-2 aria-pressed:hover:text-white aria-checked:outline-4 aria-disabled:border-4"
        removeClassName="disabled:opacity-25 enabled:border-2 aria-pressed:bg-red-500" />"#;
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());
    assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
    for guard in [
        "__hozoSlotAriaPressed &&",
        "!(__hozoSlotAriaPressed) &&",
        "__hozoSlotDisabled &&",
        "__hozoSlotEnabled &&",
        "__hozoSlotAriaPressed && hovered &&",
    ] {
        assert!(output.jsx.contains(guard), "{guard}: {}", output.jsx);
    }
    assert!(output.jsx.contains("hozoRemoveStyle={({"), "{}", output.jsx);
    assert!(
        !output.jsx.contains("accessibilityState"),
        "RN announcements remain the pattern's job: {}",
        output.jsx
    );
    let unsupported = source.replace("aria-checked:outline-4", "aria-expanded:outline-4");
    let parsed = hozo_parser::parse_tsx(&unsupported);
    let output = lower(&parsed.roots[0].node, &unsupported, &Theme::default());
    assert!(
        output
            .diagnostics
            .iter()
            .any(|d| d.code == DiagnosticCode::NotWiredOnNative),
        "{:?}",
        output.diagnostics
    );
}

#[test]
fn pagination_semantic_predicates_have_per_control_button_link_facts() {
    let source = r#"import { Pagination } from '@hozo/core'
      const el = <Pagination pageCount={3} getPageHref={maybeHref}
        itemClassName="disabled:opacity-25 enabled:border-2 aria-disabled:bg-red-500 not-aria-disabled:hover:text-white aria-selected:outline-4"
        currentItemClassName="disabled:opacity-50"
        disabledItemClassName="aria-disabled:border-4" />"#;
    let parsed = hozo_parser::parse_tsx(source);
    let output = lower(&parsed.roots[0].node, source, &Theme::default());
    assert!(output.diagnostics.is_empty(), "{:?}", output.diagnostics);
    for guard in [
        "__hozoSlotDisabled &&",
        "__hozoSlotEnabled &&",
        "__hozoSlotAriaDisabled &&",
        "!(__hozoSlotAriaDisabled) && hovered &&",
    ] {
        assert!(output.jsx.contains(guard), "{guard}: {}", output.jsx);
    }
    for callback in [
        "hozoItemStyle",
        "hozoCurrentItemStyle",
        "hozoDisabledItemStyle",
    ] {
        assert!(output.jsx.contains(&format!("{callback}={{({{ pressed, hovered, focused, focusVisible, disabled: __hozoSlotDisabled, enabled: __hozoSlotEnabled, 'aria-disabled': __hozoSlotAriaDisabled }}")), "{}", output.jsx);
    }
    let unsupported = source.replace("aria-selected:outline-4", "aria-checked:outline-4");
    let parsed = hozo_parser::parse_tsx(&unsupported);
    let output = lower(&parsed.roots[0].node, &unsupported, &Theme::default());
    assert!(
        output
            .diagnostics
            .iter()
            .any(|d| d.code == DiagnosticCode::NotWiredOnNative),
        "{:?}",
        output.diagnostics
    );
}

#[test]
fn pattern_state_callbacks_do_not_invent_other_slots_or_group_context() {
    for element in [
        r#"<Avatar name="Ada" statusClassName="hover:opacity-50" />"#,
        r#"<Chip onRemove={drop} removeClassName="group-hover:opacity-50">x</Chip>"#,
        r#"<Pressable accessibilityRole="button"><Chip defaultSelected={false} className="group-hover:opacity-50">x</Chip></Pressable>"#,
        r#"<View className="hover:opacity-50" />"#,
    ] {
        let source = format!(
            "import {{ Chip, Avatar, View, Pressable }} from '@hozo/core'\nconst el = {element}"
        );
        let parsed = hozo_parser::parse_tsx(&source);
        let output = lower(&parsed.roots[0].node, &source, &Theme::default());
        assert!(
            output.diagnostics.iter().any(
                |d| d.code == DiagnosticCode::NotWiredOnNative && d.severity == Severity::Error
            ),
            "{element}: {:?}",
            output.diagnostics
        );
    }
}

#[test]
fn audited_container_primitive_roots_resolve_non_control_facts_and_reject_events() {
    let expected_facts = "{ disabled: false, enabled: false, readOnly: true, 'aria-disabled': false, 'aria-selected': false, 'aria-checked': false }";
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
            "import {{ {name} }} from '@hozo/core'\nconst el = <{name} {attrs} className=\"pt-2 read-only:rounded-lg not-disabled:px-2 not-enabled:py-1 disabled:opacity-25 enabled:pb-4 aria-selected:mt-8 aria-disabled:mb-8 aria-checked:ml-8\" />"
        );
        let parsed = hozo_parser::parse_tsx(&static_src);
        let out = lower(&parsed.roots[0].node, &static_src, &Theme::default());
        assert!(out.diagnostics.is_empty(), "{name}: {:?}", out.diagnostics);
        assert!(out.jsx.contains("hozo0_readonly"), "{name}: {}", out.jsx);
        assert!(out.jsx.contains("hozo0_notdisabled"), "{name}: {}", out.jsx);
        assert!(out.jsx.contains("hozo0_notenabled"), "{name}: {}", out.jsx);
        assert!(!out.jsx.contains("hozo0_disabled"), "{name}: {}", out.jsx);
        assert!(!out.jsx.contains("hozo0_enabled"), "{name}: {}", out.jsx);
        assert!(
            !out.jsx.contains("hozo0_ariaselected"),
            "{name}: {}",
            out.jsx
        );
        assert!(
            !out.jsx.contains("hozo0_ariadisabled"),
            "{name}: {}",
            out.jsx
        );
        assert!(
            !out.jsx.contains("hozo0_ariachecked"),
            "{name}: {}",
            out.jsx
        );

        for variant in ["hover", "active", "focus", "focus-visible", "not-hover"] {
            let bad_src = format!(
                "import {{ {name} }} from '@hozo/core'\nconst el = <{name} {attrs} className=\"{variant}:opacity-50\" />"
            );
            let parsed = hozo_parser::parse_tsx(&bad_src);
            let out = lower(&parsed.roots[0].node, &bad_src, &Theme::default());
            assert!(
                out.diagnostics.iter().any(|d| {
                    d.code == DiagnosticCode::NotWiredOnNative
                        && d.severity == Severity::Error
                        && d.message.contains("decorative class owner")
                }),
                "{name} {variant}: {:?}",
                out.diagnostics
            );
        }

        let dynamic_src = format!(
            "import {{ {name} }} from '@hozo/core'\nconst el = <{name} {attrs} className={{classes}} />"
        );
        let parsed = hozo_parser::parse_tsx(&dynamic_src);
        let out = lower(&parsed.roots[0].node, &dynamic_src, &Theme::default());
        assert!(
            out.jsx
                .contains(&format!("hozoClasses(classes, {expected_facts})")),
            "{name}: {}",
            out.jsx
        );
    }
    // ColorPicker.sliderClassName and Dialog scroll/backdrop layers retain their own contracts.
    let slider_src = r#"import { ColorPicker } from '@hozo/core'
const el = <ColorPicker accessibilityLabel="Theme" sliderClassName="pt-2 read-only:rounded-lg not-disabled:px-2 disabled:opacity-25 aria-selected:mt-8" />"#;
    let parsed = hozo_parser::parse_tsx(slider_src);
    let out = lower(&parsed.roots[0].node, slider_src, &Theme::default());
    assert!(out.diagnostics.is_empty(), "{:?}", out.diagnostics);
    assert!(out.jsx.contains("_readonly"), "{}", out.jsx);
    assert!(out.jsx.contains("_notdisabled"), "{}", out.jsx);
    assert!(!out.jsx.contains("_disabled"), "{}", out.jsx);
    assert!(!out.jsx.contains("_ariaselected"), "{}", out.jsx);

    let dialog_src = r#"import { Dialog } from '@hozo/core'
const el = <Dialog open={showing} onClose={dismiss} accessibilityLabel="Confirm" className="overflow-y-auto backdrop:bg-black/50 read-only:rounded-lg disabled:opacity-25">Body</Dialog>"#;
    let parsed = hozo_parser::parse_tsx(dialog_src);
    let out = lower(&parsed.roots[0].node, dialog_src, &Theme::default());
    assert!(out.diagnostics.is_empty(), "{:?}", out.diagnostics);
    assert!(out.jsx.contains("hozoScrollY"), "{}", out.jsx);
    assert!(out.jsx.contains("hozoBackdropStyle="), "{}", out.jsx);
    assert!(out.jsx.contains("hozo0_readonly"), "{}", out.jsx);
    assert!(!out.jsx.contains("hozo0_disabled"), "{}", out.jsx);

    // CommandPalette scrim/panel/list share NonControl facts and retain scroll-y on list.
    for slot in ["scrimClassName", "panelClassName", "listClassName"] {
        let scroll = if slot == "listClassName" {
            "overflow-y-auto "
        } else {
            ""
        };
        let palette_src = format!(
            r#"import {{ CommandPalette }} from '@hozo/core'
const el = <CommandPalette open commands={{commands}} {slot}="{scroll}pt-2 read-only:rounded-lg not-disabled:px-2 disabled:opacity-25 aria-selected:mt-8" />"#
        );
        let parsed = hozo_parser::parse_tsx(&palette_src);
        let out = lower(&parsed.roots[0].node, &palette_src, &Theme::default());
        assert!(out.diagnostics.is_empty(), "{slot}: {:?}", out.diagnostics);
        assert!(out.jsx.contains("_readonly"), "{slot}: {}", out.jsx);
        assert!(out.jsx.contains("_notdisabled"), "{slot}: {}", out.jsx);
        assert!(!out.jsx.contains("_disabled"), "{slot}: {}", out.jsx);
        assert!(!out.jsx.contains("_ariaselected"), "{slot}: {}", out.jsx);
        if slot == "listClassName" {
            assert!(out.jsx.contains("hozoListScrollY"), "{slot}: {}", out.jsx);
        }
        let bad_src = format!(
            r#"import {{ CommandPalette }} from '@hozo/core'
const el = <CommandPalette open commands={{commands}} {slot}="hover:opacity-50" />"#
        );
        let parsed = hozo_parser::parse_tsx(&bad_src);
        let out = lower(&parsed.roots[0].node, &bad_src, &Theme::default());
        assert!(
            out.diagnostics.iter().any(|d| {
                d.code == DiagnosticCode::NotWiredOnNative
                    && d.severity == Severity::Error
                    && d.message.contains("decorative class owner")
            }),
            "{slot}: {:?}",
            out.diagnostics
        );
    }
}
