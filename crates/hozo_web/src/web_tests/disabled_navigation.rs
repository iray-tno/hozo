use crate::{lower, LowerOutput};
use hozo_ir::{DiagnosticCode, Theme};

fn compile(element: &str) -> LowerOutput {
    let source =
        format!("import {{Button, Link, Pressable}} from '@hozo/core'; const e = {element}");
    let parsed = hozo_parser::parse_tsx(&source);
    let mut output = lower(&parsed.roots[0].node, &source, &Theme::default());
    output.diagnostics.extend(parsed.diagnostics);
    output
}

#[test]
fn unavailable_destinations_use_the_anchor_contract_not_the_source_component_name() {
    for name in ["Button", "Link", "Pressable"] {
        let output = compile(&format!(
            "<{name} href=\"/docs\" disabled={{blocked}}>Docs</{name}>"
        ));
        assert!(output.jsx.starts_with("<a "), "{}", output.jsx);
        for expected in [
            "aria-disabled={blocked}",
            "tabIndex={(blocked) ? -1 : undefined}",
            "data-hozo-disabled=",
            "onClick=",
            "onAuxClick=",
        ] {
            assert!(output.jsx.contains(expected), "{}", output.jsx);
        }
        assert!(!output.jsx.contains(" disabled="), "{}", output.jsx);
        assert!(!output.jsx.contains("role=\"button\""), "{}", output.jsx);
        assert!(
            output.runtime_imports.is_empty(),
            "{:?}",
            output.runtime_imports
        );
    }
    let action = compile("<Button disabled={blocked}>Save</Button>");
    assert!(action.jsx.contains(" disabled={blocked}"), "{}", action.jsx);
    assert!(
        action.jsx.contains("aria-disabled={blocked}"),
        "{}",
        action.jsx
    );
}

#[test]
fn authored_dom_handlers_and_tabindex_cannot_overwrite_the_unavailable_branch() {
    let output = compile(
        "<Link href=\"/docs\" disabled={blocked} onClick={visit} onAuxClick={aux} tabIndex={tab}>Docs</Link>",
    );
    for name in ["onClick", "onAuxClick", "tabIndex", "aria-disabled"] {
        assert_eq!(
            output.jsx.matches(&format!(" {name}=")).count(),
            1,
            "{}",
            output.jsx
        );
    }
    assert!(
        output
            .jsx
            .contains("onClick={(blocked) ? (event) => event.preventDefault() : visit}"),
        "{}",
        output.jsx
    );
    assert!(
        output
            .jsx
            .contains("onAuxClick={(blocked) ? (event) => event.preventDefault() : aux}"),
        "{}",
        output.jsx
    );
    assert!(
        output.jsx.contains("tabIndex={(blocked) ? -1 : (tab)}"),
        "{}",
        output.jsx
    );
    let focusable = compile("<Link href=\"/docs\" disabled={blocked} focusable>Docs</Link>");
    assert_eq!(
        focusable.jsx.matches(" tabIndex=").count(),
        1,
        "{}",
        focusable.jsx
    );
    assert!(focusable
        .diagnostics
        .iter()
        .any(|d| d.code == DiagnosticCode::FocusableDisabledUnsupported));
}

#[test]
fn unavailable_state_and_disabled_prop_share_one_anchor_guard() {
    let output = compile(
        "<Pressable href=\"/docs\" disabled={blocked} accessibilityState={{disabled: busy}} onPress={visit}>Docs</Pressable>",
    );
    assert_eq!(
        output.jsx.matches(" aria-disabled=").count(),
        1,
        "{}",
        output.jsx
    );
    assert!(
        output
            .jsx
            .contains("aria-disabled={(blocked) || (({disabled: busy})?.disabled === true)}"),
        "{}",
        output.jsx
    );
}

#[test]
fn opaque_spreads_leave_canonical_props_with_the_component_that_owns_them() {
    for name in ["Button", "Link", "Pressable"] {
        let output = compile(&format!(
            "<{name} {{...props}} nativeID=\"docs\" disabled={{blocked}} onPress={{visit}}>Docs</{name}>"
        ));
        assert!(
            output.jsx.starts_with(&format!("<{name} ")),
            "{}",
            output.jsx
        );
        for expected in [
            // The props written after the spread come out of it, so the
            // author's later values win as in JSX (#1127).
            r#"{ "nativeID": _hozoOmit0, "disabled": _hozoOmit1, "onPress": _hozoOmit2, ..._hozoRest }"#,
            "_hozoRest)((props) ?? {})}",
            "nativeID={\"docs\"}",
            "disabled={blocked}",
            "onPress={visit}",
        ] {
            assert!(output.jsx.contains(expected), "{}", output.jsx);
        }
        assert!(!output.jsx.contains(" onClick="), "{}", output.jsx);
        assert!(!output.jsx.contains(" aria-disabled="), "{}", output.jsx);
    }
}
