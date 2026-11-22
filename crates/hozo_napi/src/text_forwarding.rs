//! Components that forward text styles to a child, summarized for JS.

use napi_derive::napi;

/// One package's text forwarding, as its manifest lists it.
#[napi(object)]
pub struct TextForwardingModule {
    /// The specifier a caller imports the components from.
    pub module: String,
    pub components: Vec<ForwardingComponent>,
}

/// Primitive-named bindings a file must not have lowered.
///
/// One implementation of the rule, shared with the backends: the Native
/// transform has its own guards that need to tell a component Hozo
/// declined from one it failed to lower.
#[napi(object)]
pub struct TextForwardingSummary {
    pub components: Vec<ForwardingComponent>,
    pub reexports: Vec<ForwardingReexport>,
}

#[napi(object)]
pub struct ForwardingComponent {
    pub name: String,
    pub props: Vec<ForwardingProp>,
    pub variants: Vec<ForwardingVariant>,
    pub disabled_prop: Option<String>,
    /// Absent in a manifest written before #974 said it, which is false.
    pub host_states: Option<bool>,
}

#[napi(object)]
pub struct ForwardingProp {
    pub name: String,
    pub default: Option<String>,
    pub values: Vec<String>,
}

#[napi(object)]
pub struct ForwardingVariant {
    pub when: Vec<String>,
    pub classes: String,
}

#[napi(object)]
pub struct ForwardingReexport {
    pub specifier: String,
    pub imported: String,
    pub exported: String,
}

/// What each exported component hands its children as text styles (#950).
///
/// Computed from one file alone, so a package can ship it in its manifest
/// and a caller's build can read it without the component's source.
#[napi]
pub fn summarize_text_forwarding(source: String) -> TextForwardingSummary {
    let summary = hozo_parser::summarize_text_forwarding(&source);
    TextForwardingSummary {
        components: summary
            .components
            .into_iter()
            .map(|component| ForwardingComponent {
                name: component.name,
                props: component
                    .props
                    .into_iter()
                    .map(|prop| ForwardingProp {
                        name: prop.name,
                        default: prop.default,
                        values: prop.values,
                    })
                    .collect(),
                variants: component
                    .variants
                    .into_iter()
                    .map(|variant| ForwardingVariant {
                        when: variant.when,
                        classes: variant.classes,
                    })
                    .collect(),
                disabled_prop: component.disabled_prop,
                host_states: Some(component.host_states),
            })
            .collect(),
        reexports: summary
            .reexports
            .into_iter()
            .map(|r| ForwardingReexport {
                specifier: r.specifier,
                imported: r.imported,
                exported: r.exported,
            })
            .collect(),
    }
}
