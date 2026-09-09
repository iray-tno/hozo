//! Turns `_jsx(View, { className: "p-4" })` back into `<View className={"p-4"}>`.
//!
//! Hozo reads JSX. An MDX plugin that is not told `jsx: true` folds the
//! document to automatic-runtime calls before any of this runs, so there
//! is no JSX left to lower and every `className` in the file passes
//! through as written -- silently, because the elements are still right
//! and a project that also runs Tailwind over the same tree gets rules for
//! those classes anyway. `@astrojs/mdx` exposes no `jsx` option at all
//! (#137), so on Astro this is not a setting anybody forgot.
//!
//! #137 listed the fix as "teach Hozo to read `_jsx()` calls, which also
//! means teaching both backends to emit them". It does not. Measured: the
//! existing pipeline lowers a primitive written as JSX *inside* a
//! `_jsxs(_Fragment, { children: [...] })`, with `_components.h1`, the
//! `"\n"` separators and the `MDXLayout` branch around it, and the Vite
//! plugin already folds its own output back to calls on the way out --
//! it hands the transformed source to oxc as `.tsx`. So the only missing
//! step is at the entrance, and it is this one: put the JSX back, let
//! everything downstream stay exactly as it is, and let the existing fold
//! undo it.
//!
//! That leaves one obligation, which is the whole design of this file:
//! **the un-fold has to be exactly what the fold would have produced.**
//! Anything that cannot be written as JSX and folded back to the same
//! call is left alone -- not approximated. A call this file declines is a
//! call that still reaches the existing warning.

use std::collections::HashMap;

use oxc_allocator::Allocator;
use oxc_ast::ast::{
    Argument, ArrayExpressionElement, CallExpression, Expression, ObjectPropertyKind, PropertyKey,
};
use oxc_ast_visit::walk::walk_call_expression;
use oxc_ast_visit::Visit;
use oxc_parser::Parser;
use oxc_span::{GetSpan, SourceType, Span};

use crate::{import_bindings, primitive_aliases_from_imports};

/// The automatic runtime's three spellings, and the renamed import.
///
/// `jsx` takes one child, `jsxs` takes several, and `jsxDEV` is what the
/// development runtime exports instead of both -- which is what a Vite dev
/// server actually produces. A reader that knew only the production
/// spelling would work in a build and be blind in the place people work.
/// The leading underscore is the renamed import MDX and Babel emit; a
/// source importing the runtime itself would have neither.
fn jsx_call_kind(callee: &str) -> Option<CallKind> {
    match callee.strip_prefix('_').unwrap_or(callee) {
        "jsx" => Some(CallKind::Single),
        "jsxs" => Some(CallKind::Several),
        "jsxDEV" => Some(CallKind::Dev),
        _ => None,
    }
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum CallKind {
    /// `_jsx(type, props, key?)` -- `children` is one child, whatever its shape.
    Single,
    /// `_jsxs(type, props, key?)` -- an array `children` is several children.
    Several,
    /// `_jsxDEV(type, props, key?, isStaticChildren?, source?, self?)`.
    ///
    /// The fourth argument is what `jsxs` says by being itself, so it is
    /// what decides here too. The last two carry debug positions the fold
    /// regenerates, and are dropped: they describe the file the reader is
    /// about to stop being.
    Dev,
}

/// A module with its folded primitives written back as JSX.
pub struct Unfolded {
    pub code: String,
    /// The JSX runtime the calls came from, as an `importSource` -- `astro`
    /// for `@astrojs/mdx`, `react` for `@mdx-js/rollup` and `@next/mdx`.
    ///
    /// Returned because the caller has to fold this back, and folding it
    /// back to a *different* runtime is not a round trip. Astro's MDX
    /// output is `_jsx` from `astro/jsx-runtime`; re-folded under a
    /// project's default the same tree is built by React's runtime, which
    /// Astro cannot render and prints as `[object Object]` -- no error,
    /// on a page whose stylesheet is correct. Measured on `apps/landing`
    /// before this was returned at all.
    ///
    /// `None` when the runtime was not imported, which leaves the caller
    /// its own default.
    pub import_source: Option<String>,
}

/// Rewrites every foldable primitive call in a module, or `None` if there
/// were none.
///
/// `sources` is the project's trusted-module list, applied per tag exactly
/// as lowering applies it: a `<Button>` folded from `@expo/ui` is not
/// something Hozo was going to lower, so it is not something to unfold.
pub fn unfold_jsx_calls(source_text: &str, sources: Option<&[String]>) -> Option<Unfolded> {
    // A byte check before a parse, because most files are neither MDX nor
    // machine-written and this runs on all of them.
    if !source_text.contains("jsx") {
        return None;
    }

    let allocator = Allocator::default();
    let source_type = SourceType::from_extension("tsx").expect("\"tsx\" is a known extension");
    let ret = Parser::new(&allocator, source_text, source_type).parse();
    let imports = import_bindings(&ret.module_record);
    let primitives = primitive_aliases_from_imports(&imports, sources);
    if primitives.is_empty() {
        return None;
    }

    let mut collector =
        Unfolder { source_text, primitives: &primitives, edits: Vec::new(), callees: Vec::new() };
    collector.visit_program(&ret.program);
    if collector.edits.is_empty() {
        return None;
    }

    // Where the runtime these calls used came from. The binding is the
    // link: `jsx as _jsx from "astro/jsx-runtime"` is what a rewritten
    // `_jsx(...)` was calling.
    let import_source = imports
        .iter()
        .find(|entry| {
            collector.callees.iter().any(|callee| callee == &entry.local)
                && jsx_call_kind(&entry.imported).is_some()
        })
        .map(|entry| runtime_package(&entry.source));

    // Last span first, so the offsets of the edits still to come stay the
    // offsets they were measured at.
    let mut edits = collector.edits;
    edits.sort_by_key(|(span, _)| std::cmp::Reverse(span.start));
    let mut out = source_text.to_string();
    for (span, jsx) in edits {
        out.replace_range(span.start as usize..span.end as usize, &jsx);
    }
    Some(Unfolded { code: out, import_source })
}

/// The package an `importSource` names, from the runtime module it exports.
///
/// A fold appends the suffix -- `react` becomes `react/jsx-runtime`, and
/// `react/jsx-dev-runtime` in development -- so putting one back means
/// taking it off.
fn runtime_package(module: &str) -> String {
    module
        .strip_suffix("/jsx-dev-runtime")
        .or_else(|| module.strip_suffix("/jsx-runtime"))
        .unwrap_or(module)
        .to_string()
}

struct Unfolder<'s, 'm> {
    source_text: &'s str,
    /// Local name -> primitive name, for the bindings lowering would read.
    primitives: &'m HashMap<String, String>,
    edits: Vec<(Span, String)>,
    /// The local names of the runtime calls actually rewritten, which is
    /// how the import they came from is found.
    callees: Vec<String>,
}

impl<'a> Visit<'a> for Unfolder<'_, '_> {
    fn visit_call_expression(&mut self, call: &CallExpression<'a>) {
        if let Some(jsx) = self.render(call) {
            if let Expression::Identifier(callee) = &call.callee {
                self.callees.push(callee.name.to_string());
            }
            // Rendered rather than walked into: `render` has already
            // handled everything inside, including nested primitive calls,
            // and walking would collect an edit whose span this one
            // contains.
            //
            // The span reaches back over the call's `/* @__PURE__ */`,
            // which the JSX replacing it does not need and the fold after
            // this one writes again.
            let start = self.pure_annotated_start(call.span.start);
            self.edits.push((Span::new(start, call.span.end), jsx));
            return;
        }
        walk_call_expression(self, call);
    }
}

impl Unfolder<'_, '_> {
    /// The source of a span, plus the `/* @__PURE__ */` in front of it.
    ///
    /// A fold puts that annotation before every call it writes, and it
    /// belongs to the call rather than to the statement. Taken by the span
    /// alone it stays where it was while the call moves, which for a
    /// rewritten call leaves it stranded in the middle of the arguments
    /// the *next* fold writes -- and for a call carried verbatim loses it
    /// entirely, since it sits outside the expression.
    fn text(&self, span: Span) -> &str {
        &self.source_text[self.pure_annotated_start(span.start) as usize..span.end as usize]
    }

    /// Where a span really starts, counting an annotation as part of it.
    fn pure_annotated_start(&self, start: u32) -> u32 {
        let before = &self.source_text[..start as usize];
        let trimmed = before.trim_end();
        let Some(open) = trimmed.strip_suffix("*/").and_then(|rest| rest.rfind("/*")) else {
            return start;
        };
        // Only the annotation. Any other comment is a person's, and moving
        // one is a change to the file nobody asked for.
        if matches!(&trimmed[open..], "/* @__PURE__ */" | "/*#__PURE__*/" | "/* #__PURE__ */") {
            open as u32
        } else {
            start
        }
    }

    /// One primitive call as JSX, or `None` if it is not one, or not one
    /// this file can put back without changing it.
    fn render(&self, call: &CallExpression<'_>) -> Option<String> {
        let Expression::Identifier(callee) = &call.callee else { return None };
        let kind = jsx_call_kind(callee.name.as_str())?;

        let Argument::Identifier(tag) = call.arguments.first()? else { return None };
        let local = tag.name.as_str();
        if !self.primitives.contains_key(local) {
            return None;
        }

        let mut attributes = String::new();
        // The key argument becomes a `key` attribute, which is where it
        // came from: the fold lifts a static `key` out of the props and
        // into the third position, so putting it back first restores the
        // same call.
        if let Some(key) = call.arguments.get(2).and_then(|argument| argument.as_expression()) {
            // Except when it is the placeholder. `jsxDEV` takes six
            // arguments and fills the ones it does not need, so an element
            // with no key still has a third one -- `void 0` -- and reading
            // that as a key would put `key={void 0}` on every element a
            // development server ever emitted.
            if !is_absent(key) {
                attributes.push_str(&format!(" key={{{}}}", self.text(key.span())));
            }
        }

        let mut children: Option<String> = None;
        match call.arguments.get(1) {
            None => {}
            Some(Argument::ObjectExpression(props)) => {
                for property in &props.properties {
                    match property {
                        ObjectPropertyKind::SpreadProperty(spread) => {
                            attributes
                                .push_str(&format!(" {{...{}}}", self.text(spread.argument.span())));
                        }
                        ObjectPropertyKind::ObjectProperty(entry) => {
                            if entry.computed {
                                // `{ [name]: value }` has no JSX spelling.
                                return None;
                            }
                            let name = match &entry.key {
                                PropertyKey::StaticIdentifier(identifier) => {
                                    identifier.name.to_string()
                                }
                                PropertyKey::StringLiteral(literal) => literal.value.to_string(),
                                _ => return None,
                            };
                            if name == "children" {
                                children =
                                    Some(self.render_children(kind, call, &entry.value)?);
                                continue;
                            }
                            if !is_jsx_attribute_name(&name) {
                                return None;
                            }
                            // Always an expression container, never a
                            // quoted JSX string. `className="a\nb"` in JSX
                            // is the six characters as written and
                            // `"a\nb"` in JavaScript is four with a
                            // newline in them, and JSX reads HTML entities
                            // in an attribute where JavaScript does not.
                            // Copying the literal into a container is the
                            // same value under both, always -- and the
                            // parser reads a static `className={"p-4"}`
                            // exactly as it reads `className="p-4"`.
                            attributes
                                .push_str(&format!(" {}={{{}}}", name, self.text(entry.value.span())));
                        }
                    }
                }
            }
            // `_jsx(View, null)` and `_jsx(View, someProps)`: the second
            // is a props object this file cannot take apart, and spreading
            // it would reorder nothing but would still be a guess.
            Some(_) => return None,
        }

        Some(match children {
            None => format!("<{local}{attributes} />"),
            Some(inner) => format!("<{local}{attributes}>{inner}</{local}>"),
        })
    }

    /// The `children` prop as JSX children.
    ///
    /// Which shape means "several" is the call's own spelling, and getting
    /// it backwards would change the tree: `_jsx(View, { children: [a, b] })`
    /// is one child that happens to be an array -- `<View>{[a, b]}</View>` --
    /// while `_jsxs(View, { children: [a, b] })` is two.
    fn render_children(
        &self,
        kind: CallKind,
        call: &CallExpression<'_>,
        value: &Expression<'_>,
    ) -> Option<String> {
        let several = match kind {
            CallKind::Single => false,
            CallKind::Several => true,
            // `isStaticChildren`, which is what `jsxs` says by being itself.
            CallKind::Dev => matches!(
                call.arguments.get(3).and_then(|argument| argument.as_expression()),
                Some(Expression::BooleanLiteral(literal)) if literal.value
            ),
        };

        if !several {
            return Some(self.render_child(value));
        }
        let Expression::ArrayExpression(array) = value else {
            return Some(self.render_child(value));
        };
        let mut out = String::new();
        for element in &array.elements {
            match element {
                // `<View>{...items}</View>` is not JSX, and a hole in an
                // array has no spelling either.
                ArrayExpressionElement::SpreadElement(_) | ArrayExpressionElement::Elision(_) => {
                    return None;
                }
                _ => out.push_str(&self.render_child(element.as_expression()?)),
            }
        }
        Some(out)
    }

    /// One child.
    ///
    /// A nested primitive becomes a real JSX element, so the parser sees a
    /// child rather than an opaque expression. Everything else becomes an
    /// expression container holding the source exactly as written --
    /// including a string, which must not become JSX text: `"\n"` as text
    /// is whitespace JSX is entitled to collapse, and text cannot hold a
    /// `{` or a `<` at all.
    fn render_child(&self, expression: &Expression<'_>) -> String {
        if let Expression::CallExpression(call) = expression {
            if let Some(jsx) = self.render(call) {
                return jsx;
            }
        }
        format!("{{{}}}", self.text(expression.span()))
    }
}

/// Whether an argument is a filled-in absence rather than a value.
fn is_absent(expression: &Expression<'_>) -> bool {
    match expression {
        Expression::NullLiteral(_) => true,
        Expression::Identifier(identifier) => identifier.name.as_str() == "undefined",
        // `void 0`, which is what the runtime's own callers write.
        Expression::UnaryExpression(unary) => {
            unary.operator == oxc_syntax::operator::UnaryOperator::Void
        }
        _ => false,
    }
}

/// Whether a prop name can be written as a JSX attribute.
///
/// JSX allows a hyphen and a namespace colon where an identifier does not,
/// which is how `data-*`, `aria-*` and `xlink:href` are written. Anything
/// else -- a space, a digit first, an empty name -- has no spelling, and a
/// call carrying one is left folded.
fn is_jsx_attribute_name(name: &str) -> bool {
    let mut characters = name.chars();
    let Some(first) = characters.next() else { return false };
    if !(first.is_ascii_alphabetic() || first == '_' || first == '$') {
        return false;
    }
    characters.all(|character| {
        character.is_ascii_alphanumeric()
            || character == '_'
            || character == '$'
            || character == '-'
            || character == ':'
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sources() -> Vec<String> {
        vec!["@hozo/core".to_string(), "react-native".to_string()]
    }

    fn unfold(source: &str) -> Option<String> {
        unfold_jsx_calls(source, Some(&sources())).map(|unfolded| unfolded.code)
    }

    const IMPORT: &str = "import { View, Text } from '@hozo/core';\n";

    #[test]
    fn puts_a_folded_primitive_back_as_jsx() {
        let out = unfold(&format!(
            "{IMPORT}const page = _jsx(View, {{ className: \"p-4\" }});\n"
        ))
        .expect("the call is foldable");
        assert!(out.contains("const page = <View className={\"p-4\"} />;"), "{out}");
    }

    #[test]
    fn a_single_child_stays_one_child_even_when_it_is_an_array() {
        // The call's own spelling is what says how many children there
        // are. Read backwards, `_jsx(View, { children: [a, b] })` -- one
        // child that happens to be an array -- would become two.
        let out = unfold(&format!("{IMPORT}const page = _jsx(View, {{ children: [a, b] }});\n"))
            .expect("foldable");
        assert!(out.contains("<View>{[a, b]}</View>"), "{out}");

        let several =
            unfold(&format!("{IMPORT}const page = _jsxs(View, {{ children: [a, b] }});\n"))
                .expect("foldable");
        assert!(several.contains("<View>{a}{b}</View>"), "{several}");
    }

    #[test]
    fn the_development_runtime_says_it_with_its_fourth_argument() {
        // `jsxDEV` is what a Vite dev server emits instead of both, so the
        // count comes from `isStaticChildren` rather than from the name.
        let one = unfold(&format!(
            "{IMPORT}const page = _jsxDEV(View, {{ children: [a, b] }}, void 0, false, s, this);\n"
        ))
        .expect("foldable");
        assert!(one.contains("<View>{[a, b]}</View>"), "{one}");

        let many = unfold(&format!(
            "{IMPORT}const page = _jsxDEV(View, {{ children: [a, b] }}, void 0, true, s, this);\n"
        ))
        .expect("foldable");
        assert!(many.contains("<View>{a}{b}</View>"), "{many}");
    }

    #[test]
    fn a_nested_primitive_becomes_a_real_child() {
        let out = unfold(&format!(
            "{IMPORT}const page = _jsx(View, {{ className: \"p-4\", children: _jsx(Text, {{ className: \"text-xl\" }}) }});\n"
        ))
        .expect("foldable");
        assert!(
            out.contains("<View className={\"p-4\"}><Text className={\"text-xl\"} /></View>"),
            "{out}"
        );
    }

    #[test]
    fn the_key_argument_goes_back_where_the_fold_took_it_from() {
        let out = unfold(&format!("{IMPORT}const page = _jsx(View, {{}}, \"row-1\");\n"))
            .expect("foldable");
        assert!(out.contains("<View key={\"row-1\"} />"), "{out}");
    }

    #[test]
    fn a_spread_stays_a_spread_and_keeps_its_place() {
        let out = unfold(&format!(
            "{IMPORT}const page = _jsx(View, {{ ...rest, className: \"p-4\" }});\n"
        ))
        .expect("foldable");
        assert!(out.contains("<View {...rest} className={\"p-4\"} />"), "{out}");
    }

    #[test]
    fn an_alias_keeps_the_name_the_call_site_uses() {
        let out = unfold("import { View as Box } from '@hozo/core';\nconst p = _jsx(Box, { className: \"p-4\" });\n")
            .expect("foldable");
        assert!(out.contains("<Box className={\"p-4\"} />"), "{out}");
    }

    #[test]
    fn leaves_alone_what_it_cannot_put_back_unchanged() {
        // Each of these has no JSX spelling, and approximating one would
        // change the program. They stay folded, and stay reported by the
        // warning that has always named them.
        let cases = [
            // A computed key.
            "const p = _jsx(View, { [name]: 1 });",
            // A prop name no attribute can be called.
            "const p = _jsx(View, { \"a b\": 1 });",
            // A spread child.
            "const p = _jsxs(View, { children: [...items] });",
            // Props that are not an object literal.
            "const p = _jsx(View, props);",
            "const p = _jsx(View, null);",
        ];
        for case in cases {
            assert_eq!(unfold(&format!("{IMPORT}{case}\n")), None, "{case}");
        }
    }

    #[test]
    fn a_primitive_name_from_a_module_the_project_does_not_trust_is_not_one() {
        // The same per-tag rule lowering applies. `@expo/ui` exports a
        // `Button` sharing nothing with Hozo's but its spelling, and a
        // folded one is not something Hozo was going to lower.
        let source = "import { Button } from '@expo/ui';\nconst p = _jsx(Button, { label: \"Save\" });\n";
        assert_eq!(unfold(source), None);
    }

    #[test]
    fn says_nothing_about_a_module_with_no_folded_primitive() {
        assert_eq!(unfold("export const x = 1;\n"), None);
        assert_eq!(unfold(&format!("{IMPORT}const p = <View className=\"p-4\" />;\n")), None);
    }

    #[test]
    fn rewrites_only_the_calls_it_understands_inside_a_document() {
        // The shape `@astrojs/mdx` actually produces: a fragment holding
        // the document, with the primitives somewhere inside it. Nothing
        // but the primitive subtree may move.
        let source = format!(
            "{IMPORT}function _createMdxContent(props) {{\n  const _components = {{ h1: \"h1\", ...props.components }};\n  return _jsxs(_Fragment, {{ children: [_jsx(_components.h1, {{ children: \"Title\" }}), \"\\n\", _jsx(View, {{ className: \"p-4\" }})] }});\n}}\n"
        );
        let out = unfold(&source).expect("foldable");
        assert!(out.contains("_jsx(_components.h1, { children: \"Title\" })"), "{out}");
        assert!(out.contains("\"\\n\""), "{out}");
        assert!(out.contains("<View className={\"p-4\"} />"), "{out}");
        assert!(!out.contains("_jsx(View"), "{out}");
    }
}

#[cfg(test)]
mod runtime_tests {
    use super::*;

    fn import_source(source: &str) -> Option<String> {
        let sources = vec!["@hozo/core".to_string()];
        unfold_jsx_calls(source, Some(&sources)).and_then(|unfolded| unfolded.import_source)
    }

    #[test]
    fn reports_the_runtime_the_calls_came_from() {
        // Astro's MDX output, which is the case #137 is about. Folding
        // this back under a project's default would build the tree with
        // React's runtime, and Astro renders that as `[object Object]` --
        // silently, on a page whose stylesheet came out correct.
        let astro = concat!(
            "import { jsx as _jsx } from \"astro/jsx-runtime\";\n",
            "import { View } from \"@hozo/core\";\n",
            "const page = _jsx(View, { className: \"p-4\" });\n",
        );
        assert_eq!(import_source(astro).as_deref(), Some("astro"));
    }

    #[test]
    fn the_development_runtime_names_the_same_package() {
        // `react/jsx-dev-runtime` is `react` with a suffix a fold puts
        // back on, so taking it off has to know both spellings.
        let dev = concat!(
            "import { jsxDEV as _jsxDEV } from \"react/jsx-dev-runtime\";\n",
            "import { View } from \"@hozo/core\";\n",
            "const page = _jsxDEV(View, { className: \"p-4\" }, void 0, false, s, this);\n",
        );
        assert_eq!(import_source(dev).as_deref(), Some("react"));
    }

    #[test]
    fn a_module_that_did_not_import_the_runtime_leaves_the_caller_its_default() {
        let bare = concat!(
            "import { View } from \"@hozo/core\";\n",
            "const page = _jsx(View, { className: \"p-4\" });\n",
        );
        assert_eq!(import_source(bare), None);
    }
}
