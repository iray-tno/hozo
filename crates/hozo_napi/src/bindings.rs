//! Names a module imports or binds at its top level.

use napi_derive::napi;

/// Every binding a source file imports from one module, by local name.
///
/// The Native backend prepends `import { View, StyleSheet } from
/// 'react-native'`, and a React Native file already has its own -- so it
/// needs to know which names are taken before adding to them.
#[napi]
pub fn module_imports(source: String, module: String) -> Vec<String> {
    hozo_parser::module_imports(&source, &module)
}

/// Every name a module binds at its top level as a runtime value.
///
/// Lowering prepends imports of runtime components by fixed names, and a
/// module that already binds one would declare it twice -- a parse error in
/// generated code the author never wrote (#670). Parsed rather than searched,
/// so a comment or string mentioning a name does not count.
#[napi]
pub fn top_level_bindings(source: String) -> Vec<String> {
    hozo_parser::top_level_bindings(&source)
}

#[napi]
pub fn foreign_primitives(source: String, sources: Vec<String>) -> Vec<String> {
    let mut names: Vec<String> = hozo_parser::foreign_primitives(&source, &sources)
        .into_iter()
        .collect();
    names.sort();
    names
}
