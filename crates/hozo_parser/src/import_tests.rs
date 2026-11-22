use super::*;

fn trusted() -> Vec<String> {
    vec!["react-native".to_string(), "@hozo/core".to_string()]
}

#[test]
fn web_carries_react_natives_compat_components_unless_rewriting_was_asked_for() {
    let sources = vec!["react-native".to_string(), "@hozo/rn-compat".to_string()];
    let from_react_native = "import { TouchableOpacity, Animated, View } from 'react-native'
export const A = () => <View><TouchableOpacity /><Animated.View /></View>
";
    let parse = |source, compat| parse_tsx_for_web(source, Some(&sources), None, &[], compat);

    // Unconfigured: the wrapper lowers, the two compat components are
    // carried as written for React Native Web to resolve.
    let carried = parse(from_react_native, ReactNativeCompat::OnlyFromOwner);
    assert_eq!(carried.roots[0].node.primitive, hozo_ir::Primitive::View);
    assert!(carried.foreign_primitives.contains("TouchableOpacity"));
    assert!(
        carried.roots[0]
            .node
            .children
            .iter()
            .all(|child| !matches!(child, hozo_ir::Child::Node(_))),
        "{:?}",
        carried.roots[0].node.children
    );

    // Opted in: exactly what the Native backend has always seen.
    let lowered = parse(from_react_native, ReactNativeCompat::Lower);
    let primitives: Vec<_> = lowered.roots[0]
        .node
        .children
        .iter()
        .filter_map(|child| match child {
            hozo_ir::Child::Node(node) => Some(node.primitive),
            _ => None,
        })
        .collect();
    assert_eq!(
        primitives,
        vec![
            hozo_ir::Primitive::TouchableOpacity,
            hozo_ir::Primitive::AnimatedView
        ]
    );

    // Imported from the owner, the author declared it: lowered either way.
    let from_owner = "import { TouchableOpacity } from '@hozo/rn-compat'
export const B = () => <TouchableOpacity />
";
    let owned = parse(from_owner, ReactNativeCompat::OnlyFromOwner);
    assert_eq!(
        owned.roots[0].node.primitive,
        hozo_ir::Primitive::TouchableOpacity
    );
}

#[test]
fn a_renamed_import_is_judged_by_its_export_and_its_local_binding() {
    // A known export behind an alias is lowerable only from a trusted
    // module, so the untrusted copy must be marked by its local name.
    let aliased = foreign_primitives(
        "import { View as Box } from 'some-ui-kit'
",
        &trusted(),
    );
    assert!(aliased.contains("Box"));

    // The reverse is dangerous too: `Pressable as View` from a module
    // nobody trusts puts a foreign component behind a canonical name.

    let foreign = foreign_primitives(
        "import { Pressable as View } from 'some-ui-kit'
",
        &trusted(),
    );
    assert!(foreign.contains("View"));
}

#[test]
fn trusted_primitive_aliases_build_the_canonical_ir() {
    let source = "import { Text as RNText, Pressable as NativePressable } from 'react-native'
export const Card = () => <NativePressable><RNText>Hello</RNText></NativePressable>
";
    let output = parse_tsx_with(source, Some(&trusted()));

    assert_eq!(output.roots.len(), 1);
    assert_eq!(
        output.roots[0].node.primitive,
        hozo_ir::Primitive::Pressable
    );
    assert_eq!(output.roots[0].node.children.len(), 1);
    let hozo_ir::Child::Node(text) = &output.roots[0].node.children[0] else {
        panic!("aliased Text was not lowered as a child")
    };
    assert_eq!(text.primitive, hozo_ir::Primitive::Text);
    assert!(output.foreign_primitives.is_empty());

    assert_eq!(
        parse_tsx(source).roots.len(),
        1,
        "the trust-all parser must agree"
    );
}

#[test]
fn a_configured_parser_does_not_lower_a_same_file_primitive_name() {
    let source = "function Text({ children }) {
  return <span className=\"font-bold\">{children}</span>
}
export function Panel() {
  return <Text>hello</Text>
}
";

    let configured = parse_tsx_with(source, Some(&trusted()));
    assert!(
        configured.roots.is_empty(),
        "a local Text declaration is not a trusted primitive import"
    );

    // Keep the intentionally unconstrained low-level parser useful for
    // compact fixtures that spell primitives without import boilerplate.
    let unconstrained = parse_tsx(source);
    assert_eq!(unconstrained.roots.len(), 1);
    assert_eq!(
        unconstrained.roots[0].node.primitive,
        hozo_ir::Primitive::Text
    );
}

#[test]
fn a_type_only_import_binds_nothing_at_runtime() {
    // Nothing a JSX tag can resolve to, so nothing to decline.
    assert!(foreign_primitives(
        "import type { View } from 'some-ui-kit'
",
        &trusted()
    )
    .is_empty());
    assert!(foreign_primitives(
        "import { type View } from 'some-ui-kit'
",
        &trusted()
    )
    .is_empty());
}

#[test]
fn ordinary_imports_are_not_primitives() {
    assert!(foreign_primitives(
        "import { useState } from 'react'
",
        &trusted()
    )
    .is_empty());
}

#[test]
fn the_component_parse_keeps_runtime_import_metadata() {
    let source = "import DefaultThing, { View as Box, type Text } from 'react-native'\n\
                      import * as UI from '@expo/ui'\n\
                      import { Pressable as View } from 'some-ui-kit'\n\
                      export const Card = () => <View />\n";
    let output = parse_tsx_with(source, Some(&trusted()));

    assert!(output.imports.contains(&ImportBinding {
        source: "react-native".to_string(),
        imported: "default".to_string(),
        local: "DefaultThing".to_string(),
    }));
    assert!(output.imports.contains(&ImportBinding {
        source: "react-native".to_string(),
        imported: "View".to_string(),
        local: "Box".to_string(),
    }));
    assert!(output.imports.contains(&ImportBinding {
        source: "@expo/ui".to_string(),
        imported: "*".to_string(),
        local: "UI".to_string(),
    }));
    assert!(!output.imports.iter().any(|entry| entry.local == "Text"));
    assert!(output.foreign_primitives.contains("View"));
}
