//! The `Compiler` object JS holds across files of one build.

use std::sync::Arc;

use napi_derive::napi;

use super::canvas::{lower_canvas_paints, CompiledCanvasPaint};
use super::classes::{component_class_lists, ClassHelper, ComponentClassList};
use super::native::{
    lower_native, lower_native_module, parse_native_module, CompiledNativeComponent,
    CompiledNativeModule, NativeModuleOptions,
};
use super::native_options::NativeCompileOptions;
use super::stylex::{external_bindings, StylexExternalBinding, StylexModuleSource};
use super::tailwind_order;
use super::tailwind_order::TailwindOrderInspection;
use super::text_forwarding::TextForwardingModule;
use super::theme::{to_theme, JsTheme};
use super::web::{lower_web, CompiledComponent, TailwindPlanOptions, WebModuleOptions};

/// A compiler holding what a project decided once: its theme and which
/// modules its primitives may come from.
///
/// The free functions above take neither, and that is the point. They used
/// to take both as optional arguments, so every caller marshalled 288
/// colours across this boundary on every file -- 0.134ms against the 0.003ms
/// it takes to compile a one-element file, a fixed cost with nothing to do
/// with the file. Worse, a theme is easy to leave out, and leaving it out
/// does not fail: the compiler quietly uses the default palette and spacing
/// scale, and the output looks entirely reasonable. `packages/compiler`
/// still carries a note about a declaration that "said `compile(source)`
/// while every caller passed three arguments".
///
/// So the argument is gone rather than defaulted. Compiling against a
/// project's theme now requires holding one of these, and there is nothing
/// left to forget.
/// A module whose folded primitives are JSX again, and the runtime they
/// were folded with -- which is the runtime they have to be folded back
/// with. See `hozo_parser::unfold::Unfolded`.
#[napi(object)]
pub struct UnfoldedModule {
    pub code: String,
    pub import_source: Option<String>,
}

#[napi]
pub struct Compiler {
    // Immutable project data can outlive Compiler through a prepared module,
    // without cloning the entire palette/animation table for every file.
    pub(crate) theme: Arc<hozo_ir::Theme>,
    /// Modules whose primitive-named exports may be lowered. `None` trusts
    /// every module, which is what a caller with no project configuration
    /// wants; it is per-project, not per-file, which is the other reason it
    /// belongs here.
    pub(crate) sources: Option<Vec<String>>,
    pub(crate) stylex: hozo_parser::StylexModuleRegistry,
    /// What components from a project's dependencies hand down as text
    /// styles, from their packages' manifests (#950).
    pub(crate) text_forwarding: hozo_parser::ForwardingTable,
    /// Functions the project's callers import that join classes as `clsx`
    /// does, declared or found (#964).
    pub(crate) class_helpers: Vec<hozo_parser::ClassHelper>,
    /// RFC 007 build-time context, consumed by the shared pre-lowering plan.
    pub(crate) tailwind_order: Option<Box<hozo_ir::TailwindOrderContext>>,
}

#[napi]
impl Compiler {
    #[napi(constructor)]
    pub fn new(theme: Option<JsTheme>, sources: Option<Vec<String>>) -> Self {
        Compiler {
            theme: Arc::new(to_theme(theme)),
            sources,
            stylex: Default::default(),
            text_forwarding: Default::default(),
            class_helpers: Vec::new(),
            tailwind_order: None,
        }
    }

    /// Replace once after project preparation, not once per component.
    /// Failed validation leaves the previous context intact.
    #[napi]
    pub fn set_tailwind_order(&mut self, snapshot: Option<String>) -> napi::Result<()> {
        let prepared = snapshot
            .as_deref()
            .map(tailwind_order::prepare)
            .transpose()?;
        self.tailwind_order = prepared;
        Ok(())
    }

    /// Internal binding evidence, not a support/cascade verdict. A build
    /// must eventually bind its existing parse, not call this before compile.
    #[napi]
    pub fn inspect_tailwind_order(
        &self,
        source: String,
        bindings: Option<Vec<StylexExternalBinding>>,
        source_file: Option<String>,
    ) -> TailwindOrderInspection {
        tailwind_order::inspect(self, &source, bindings, source_file.as_deref())
    }

    /// `rehome_react_native` is the project's `unloweredReactNativeJsx`
    /// policy, reduced to the one thing the parse needs from it: whether
    /// React Native's compatibility components may become `@hozo/rn-compat`
    /// imports. Absent means no, which is what an unconfigured project gets.
    #[napi]
    pub fn compile(
        &self,
        source: String,
        bindings: Option<Vec<StylexExternalBinding>>,
        rehome_react_native: Option<bool>,
        tag_evidence: Option<bool>,
        tailwind_plan: Option<bool>,
    ) -> Vec<CompiledComponent> {
        let bindings = external_bindings(bindings);
        let compat = if rehome_react_native.unwrap_or(false) {
            hozo_parser::ReactNativeCompat::Lower
        } else {
            hozo_parser::ReactNativeCompat::OnlyFromOwner
        };
        lower_web(
            &source,
            &self.theme,
            self.sources.as_deref(),
            Some((&self.stylex, &bindings)),
            WebModuleOptions {
                compat,
                evidence: tag_evidence.unwrap_or(false),
                owner_class: false,
                tailwind: TailwindPlanOptions {
                    context: self.tailwind_order.as_deref(),
                    capture: tailwind_plan.unwrap_or(false),
                    ..Default::default()
                },
            },
            &self.class_helpers,
        )
    }

    /// Puts a machine-folded `_jsx(View, {...})` back as `<View ...>`.
    ///
    /// `None` when there is nothing to put back, which is every
    /// hand-written file. See `hozo_parser::unfold_jsx_calls` for why this
    /// exists, what it declines to touch, and why the caller is told which
    /// runtime to fold it back to.
    #[napi]
    pub fn unfold_jsx_calls(&self, source: String) -> Option<UnfoldedModule> {
        hozo_parser::unfold_jsx_calls(&source, self.sources.as_deref()).map(|unfolded| {
            UnfoldedModule {
                code: unfolded.code,
                import_source: unfolded.import_source,
            }
        })
    }

    #[napi]
    pub fn compile_native(
        &self,
        source: String,
        bindings: Option<Vec<StylexExternalBinding>>,
        tailwind_plan: Option<bool>,
    ) -> Vec<CompiledNativeComponent> {
        let bindings = external_bindings(bindings);
        lower_native(
            &source,
            &self.theme,
            self.sources.as_deref(),
            Some((&self.stylex, &bindings)),
            &self.text_forwarding,
            &self.class_helpers,
            TailwindPlanOptions {
                context: self.tailwind_order.as_deref(),
                capture: tailwind_plan.unwrap_or(false),
                ..Default::default()
            },
        )
    }

    /// Native output plus module metadata collected by the same source parse.
    /// Metro needs both to rewrite imports without reparsing the file. Optional
    /// source_file selects grammar; omitted retains the historical TSX API.
    /// options.text_reference is internal RFC 006 test wiring, never a project option;
    /// its output requires private contextual hosts and is not a shipped ABI.
    /// options.text_unified selects decision 013's route, Metro's default.
    #[napi]
    pub fn compile_native_module(
        &self,
        source: String,
        bindings: Option<Vec<StylexExternalBinding>>,
        source_file: Option<String>,
        options: Option<NativeCompileOptions>,
    ) -> napi::Result<CompiledNativeModule> {
        let bindings = external_bindings(bindings);
        let options = options.unwrap_or_default();
        options.validate_owner_style()?;
        Ok(lower_native_module(
            &source,
            &self.theme,
            self.sources.as_deref(),
            Some((&self.stylex, &bindings)),
            NativeModuleOptions {
                source_file: source_file.as_deref(),
                source_evidence: options.source_evidence.unwrap_or(false),
                owner_facts: options.owner_facts()?,
                owner_events: options.owner_events()?,
                owner_split_text: options.owner_text.is_some(),
                text_reference: options.text_reference.unwrap_or(false),
                owner_style: options.owner_style.unwrap_or(false),
                text_unified: options.text_unified.unwrap_or(false),
                tailwind: TailwindPlanOptions {
                    context: self.tailwind_order.as_deref(),
                    capture: options.tailwind_plan.unwrap_or(false),
                    ..Default::default()
                },
            },
            &self.text_forwarding,
            &self.class_helpers,
        ))
    }

    /// The class props written on an element this compiler does not lower:
    /// a component, handed the list as a prop to resolve itself. Read from
    /// the parse `compile_native` lowers, with this compiler's sources.
    #[napi]
    pub fn component_class_lists(&self, source: String) -> Vec<ComponentClassList> {
        let bindings = external_bindings(None);
        let parsed = parse_native_module(
            &source,
            self.sources.as_deref(),
            Some((&self.stylex, &bindings)),
            None,
            &self.text_forwarding,
            &self.class_helpers,
        );
        component_class_lists(&source, &parsed)
    }

    /// Replaces the class-joining functions both backends read argument by
    /// argument, beside `clsx` and the rest (#964).
    #[napi]
    pub fn set_class_helpers(&mut self, helpers: Vec<ClassHelper>) {
        self.class_helpers = helpers
            .into_iter()
            .filter(|helper| {
                helper.merge != Some(true)
                    || helper.merge_config.as_deref()
                        == Some(hozo_parser::tw_merge::DEFAULT_CONFIG_ID)
            })
            .map(|helper| hozo_parser::ClassHelper {
                module: helper.module,
                name: helper.name,
                merge: helper.merge.unwrap_or(false),
            })
            .collect();
    }

    /// Replaces the text forwarding the Native backend applies (#950).
    #[napi]
    pub fn set_text_forwarding(&mut self, modules: Vec<TextForwardingModule>) {
        let mut table = hozo_parser::ForwardingTable::default();
        for module in modules {
            for component in module.components {
                table.insert(
                    &module.module,
                    hozo_parser::ForwardingComponent {
                        name: component.name,
                        props: component
                            .props
                            .into_iter()
                            .map(|prop| hozo_parser::ForwardingProp {
                                name: prop.name,
                                default: prop.default,
                                values: prop.values,
                            })
                            .collect(),
                        variants: component
                            .variants
                            .into_iter()
                            .map(|variant| hozo_parser::ForwardingVariant {
                                when: variant.when,
                                classes: variant.classes,
                            })
                            .collect(),
                        disabled_prop: component.disabled_prop,
                        host_states: component.host_states.unwrap_or(false),
                    },
                );
            }
        }
        self.text_forwarding = table;
    }

    #[napi]
    pub fn set_stylex_modules(&mut self, modules: Vec<StylexModuleSource>) {
        let modules = modules
            .into_iter()
            .map(|module| hozo_parser::StylexModuleSource {
                id: module.id,
                content_hash: module.content_hash,
                source: module.source,
                source_file: module.source_file,
                links: module
                    .links
                    .into_iter()
                    .map(|link| hozo_parser::StylexExternalBinding {
                        specifier: link.specifier,
                        module_id: link.module_id,
                    })
                    .collect(),
            })
            .collect::<Vec<_>>();
        self.stylex.replace(&modules);
    }

    #[napi]
    pub fn compile_canvas_paints(&self, source: String, native: bool) -> Vec<CompiledCanvasPaint> {
        lower_canvas_paints(&source, &self.theme, native)
    }
}
