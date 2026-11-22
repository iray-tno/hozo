use super::*;

#[test]
fn react_natives_button_is_not_hozos() {
    // Trusting `react-native` wholesale turned an ordinary
    // `<Button title="Go" onPress={f} />` into
    // `<Pressable onPress={f} title="Go"></Pressable>` -- a control
    // that renders nothing at all, in a file nobody asked Hozo to
    // change. The two components share a name and no API.
    let sources = vec!["react-native".to_string(), "@hozo/core".to_string()];
    let foreign = foreign_primitives("import { Button, View } from 'react-native'\n", &sources);
    assert!(foreign.contains("Button"));
    assert!(
        !foreign.contains("View"),
        "the rest of react-native is the same component"
    );
}

#[test]
fn an_aliased_react_native_button_is_still_incompatible() {
    let sources = vec!["react-native".to_string(), "@hozo/core".to_string()];
    let foreign = foreign_primitives(
        "import { Button as NativeButton } from 'react-native'
",
        &sources,
    );
    assert!(foreign.contains("NativeButton"));
}

#[test]
fn hozos_own_button_is_lowered() {
    let sources = vec!["react-native".to_string(), "@hozo/core".to_string()];
    let foreign = foreign_primitives("import { Button } from '@hozo/core'\n", &sources);
    assert!(foreign.is_empty());
}

#[test]
fn an_untrusted_module_is_foreign_whatever_it_exports() {
    let sources = vec!["react-native".to_string()];
    let foreign = foreign_primitives(
        "import { Text, Button } from '@expo/ui/swift-ui'\n",
        &sources,
    );
    assert!(foreign.contains("Text"));
    assert!(foreign.contains("Button"));
}
