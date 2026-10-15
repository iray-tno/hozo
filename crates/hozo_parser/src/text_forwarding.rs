//! What a component hands its children as text styles, read from its source
//! so another file can use it (#950).
//!
//! React Native does not inherit text styles from a View. Within one file
//! the compiler hands a pressable's `text-*` down to the Text inside it;
//! across files it cannot, because the caller never sees the component's
//! classes. This summary is that missing fact, for one file, computed from
//! that file alone so it can be shipped in a package's manifest and read by
//! a caller's build (see the direction recorded on #656).
//!
//! Only a narrow, common shape is read, and anything else yields no entry,
//! which leaves the caller exactly where it was:
//!
//! ```tsx
//! export function Button({ tone = 'neutral', size = 'md', className, disabled, ...rest }) {
//!   if (tone === 'accent') return <Host {...rest} disabled={disabled} className={cx('…', size === 'sm' ? '…' : '…', className)} />
//!   return <Host {...rest} … />
//! }
//! ```
//!
//! The classes are recorded as written, not as styles. The caller resolves
//! them against its own theme, so `text-hozo-on-accent` means what the
//! application's theme says it means.

use std::collections::{BTreeMap, BTreeSet};

use oxc_allocator::Allocator;
use oxc_ast::ast::{
    BindingPattern, CallExpression, Expression, FormalParameters, JSXAttributeItem,
    JSXAttributeName, JSXAttributeValue, JSXChild, JSXElement, JSXElementName, JSXExpression,
    Statement,
};
use oxc_parser::Parser;
use oxc_span::SourceType;
use oxc_syntax::module_record::{
    ExportExportName, ExportImportName, ImportImportName, ModuleRecord,
};
use oxc_syntax::operator::{BinaryOperator, LogicalOperator};

/// Hosts that hand their text styles to their label: the ones the Native
/// backend forwards through `hozoTextStyle` (#876).
const FORWARDING_HOSTS: [&str; 2] = ["Pressable", "Button"];
const HOST_MODULES: [&str; 2] = ["@hozo/core", "@hozo/primitives"];

/// The `cx`-shaped helpers whose arguments are read one by one, as
/// `dynamic_class` reads them.
const JOIN_MODULES: [&str; 3] = ["clsx", "classnames", "tailwind-merge"];
const HOZO_JOIN_MODULES: [&str; 2] = ["@hozo/core", "@hozo/engine"];

#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub struct TextForwardingSummary {
    /// One entry per exported component whose shape was read.
    pub components: Vec<ForwardingComponent>,
    /// `export { A as B } from './x'`, so a package's entry can be followed
    /// to the file that defines each component.
    pub reexports: Vec<ForwardingReexport>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ForwardingComponent {
    /// The exported name, not the local one.
    pub name: String,
    /// The props the classes depend on, each with every value it is
    /// compared against.
    pub props: Vec<ForwardingProp>,
    /// The host's classes for every combination of `props`.
    pub variants: Vec<ForwardingVariant>,
    /// The component prop the host's `disabled` comes from, so a caller's
    /// `disabled={off}` can drive the `disabled:` classes it hands down.
    pub disabled_prop: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ForwardingProp {
    pub name: String,
    pub default: Option<String>,
    pub values: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ForwardingVariant {
    /// One value per prop in `props`, in the same order.
    pub when: Vec<String>,
    pub classes: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ForwardingReexport {
    pub specifier: String,
    pub imported: String,
    pub exported: String,
}

pub fn summarize_text_forwarding(source: &str) -> TextForwardingSummary {
    let allocator = Allocator::default();
    let source_type = SourceType::from_extension("tsx").expect("\"tsx\" is a known extension");
    let ret = Parser::new(&allocator, source, source_type).parse();
    if !ret.diagnostics.is_empty() {
        return TextForwardingSummary::default();
    }
    let module = &ret.module_record;

    let mut exported_as: BTreeMap<String, Vec<String>> = BTreeMap::new();
    for entry in &module.local_export_entries {
        if entry.is_type {
            continue;
        }
        let (Some(local), ExportExportName::Name(name)) =
            (entry.local_name.name(), &entry.export_name)
        else {
            continue;
        };
        exported_as
            .entry(local.to_string())
            .or_default()
            .push(name.name.to_string());
    }

    let mut components = Vec::new();
    for statement in &ret.program.body {
        let function = match statement {
            Statement::FunctionDeclaration(function) => function,
            Statement::ExportDeclaration(export) => match &export.declaration {
                oxc_ast::ast::Declaration::FunctionDeclaration(function) => function,
                _ => continue,
            },
            _ => continue,
        };
        let (Some(id), Some(body)) = (&function.id, &function.body) else {
            continue;
        };
        let Some(names) = exported_as.get(id.name.as_str()) else {
            continue;
        };
        let Some(shape) = read_component(&function.params, &body.statements, module) else {
            continue;
        };
        for name in names {
            components.push(ForwardingComponent {
                name: name.clone(),
                ..shape.clone()
            });
        }
    }
    components.sort_by(|a, b| a.name.cmp(&b.name));

    let mut reexports: Vec<ForwardingReexport> = module
        .indirect_export_entries
        .iter()
        .filter(|entry| !entry.is_type)
        .filter_map(|entry| {
            let specifier = entry.module_request.as_ref()?.name.to_string();
            let ExportImportName::Name(imported) = &entry.import_name else {
                return None;
            };
            let ExportExportName::Name(exported) = &entry.export_name else {
                return None;
            };
            Some(ForwardingReexport {
                specifier,
                imported: imported.name.to_string(),
                exported: exported.name.to_string(),
            })
        })
        .collect();
    reexports.sort_by(|a, b| a.exported.cmp(&b.exported));

    TextForwardingSummary {
        components,
        reexports,
    }
}

/// The destructured props: name to default, plus the rest binding.
struct Params {
    props: BTreeMap<String, Option<String>>,
    rest: Option<String>,
}

fn read_params(params: &FormalParameters) -> Option<Params> {
    let [first] = params.items.as_slice() else {
        return None;
    };
    let BindingPattern::ObjectPattern(object) = &first.pattern else {
        return None;
    };
    let mut props = BTreeMap::new();
    for property in &object.properties {
        let key = property.key.static_name()?.to_string();
        let default = match &property.value {
            BindingPattern::BindingIdentifier(local) if local.name == key.as_str() => None,
            BindingPattern::AssignmentPattern(assign) => {
                let BindingPattern::BindingIdentifier(local) = &assign.left else {
                    return None;
                };
                if local.name != key.as_str() {
                    return None;
                }
                let Expression::StringLiteral(value) = &assign.right else {
                    return None;
                };
                Some(value.value.to_string())
            }
            // A renamed binding would need its local name tracked through
            // every comparison. Not worth it for the shape this reads.
            _ => return None,
        };
        // A default that is not a string literal was refused above, so a
        // `None` here means the prop simply has none.
        props.insert(key, default);
    }
    let rest = match &object.rest {
        None => None,
        Some(rest) => match &rest.argument {
            BindingPattern::BindingIdentifier(id) => Some(id.name.to_string()),
            _ => return None,
        },
    };
    Some(Params { props, rest })
}

/// A choice between two class strings, made by comparing a prop with a
/// literal.
struct Comparison {
    prop: String,
    value: String,
}

fn read_comparison(expr: &Expression, params: &Params) -> Option<Comparison> {
    let Expression::BinaryExpression(binary) = expr.without_parentheses() else {
        return None;
    };
    if binary.operator != BinaryOperator::StrictEquality {
        return None;
    }
    let pair = match (&binary.left, &binary.right) {
        (Expression::Identifier(id), Expression::StringLiteral(lit))
        | (Expression::StringLiteral(lit), Expression::Identifier(id)) => (id, lit),
        _ => return None,
    };
    let prop = pair.0.name.to_string();
    if !params.props.contains_key(&prop) {
        return None;
    }
    Some(Comparison {
        prop,
        value: pair.1.value.to_string(),
    })
}

/// One argument of the host's class list.
enum Part {
    Always(String),
    Choice {
        when: Comparison,
        then: String,
        otherwise: String,
    },
}

struct Branch {
    guard: Option<Comparison>,
    host: Host,
}

struct Host {
    parts: Vec<Part>,
    disabled_prop: Option<String>,
}

fn read_component(
    params: &FormalParameters,
    statements: &[Statement],
    module: &ModuleRecord,
) -> Option<ForwardingComponent> {
    let params = read_params(params)?;
    let (last, guarded) = statements.split_last()?;
    let mut branches = Vec::new();
    for statement in guarded {
        let Statement::IfStatement(branch) = statement else {
            return None;
        };
        if branch.alternate.is_some() {
            return None;
        }
        let guard = read_comparison(&branch.test, &params)?;
        let host = read_return(&branch.consequent, &params, module)?;
        branches.push(Branch {
            guard: Some(guard),
            host,
        });
    }
    branches.push(Branch {
        guard: None,
        host: read_return(last, &params, module)?,
    });

    // Every value a prop is compared against, plus its default: the values
    // a caller can write that change the classes.
    let mut domain: BTreeMap<String, BTreeSet<String>> = BTreeMap::new();
    let mut note = |c: &Comparison| {
        domain
            .entry(c.prop.clone())
            .or_default()
            .insert(c.value.clone());
    };
    for branch in &branches {
        if let Some(guard) = &branch.guard {
            note(guard);
        }
        for part in &branch.host.parts {
            if let Part::Choice { when, .. } = part {
                note(when);
            }
        }
    }
    let mut props = Vec::new();
    for (name, values) in &mut domain {
        let default = params.props.get(name).cloned().flatten();
        if let Some(default) = &default {
            values.insert(default.clone());
        }
        props.push(ForwardingProp {
            name: name.clone(),
            default,
            values: values.iter().cloned().collect(),
        });
    }

    let mut variants = Vec::new();
    let mut disabled_prop = None;
    for when in combinations(&props) {
        let value_of = |prop: &str| {
            let index = props.iter().position(|p| p.name == prop)?;
            Some(when[index].as_str())
        };
        let holds = |c: &Comparison| value_of(&c.prop) == Some(c.value.as_str());
        let branch = branches
            .iter()
            .find(|b| b.guard.as_ref().is_none_or(holds))?;
        let mut classes = Vec::new();
        for part in &branch.host.parts {
            match part {
                Part::Always(text) => classes.push(text.as_str()),
                Part::Choice {
                    when,
                    then,
                    otherwise,
                } => {
                    classes.push(if holds(when) { then } else { otherwise });
                }
            }
        }
        let classes = classes
            .join(" ")
            .split_whitespace()
            .collect::<Vec<_>>()
            .join(" ");
        variants.push(ForwardingVariant { when, classes });
        // Every branch has to agree, or a caller could not tell which
        // prop drives `disabled:`.
        match (&disabled_prop, &branch.host.disabled_prop) {
            (None, found) => disabled_prop = found.clone(),
            (Some(seen), found) if Some(seen) != found.as_ref() => return None,
            _ => {}
        }
    }
    Some(ForwardingComponent {
        name: String::new(),
        props,
        variants,
        disabled_prop,
    })
}

fn combinations(props: &[ForwardingProp]) -> Vec<Vec<String>> {
    let mut out = vec![Vec::new()];
    for prop in props {
        out = out
            .into_iter()
            .flat_map(|prefix| {
                prop.values.iter().map(move |value| {
                    let mut next = prefix.clone();
                    next.push(value.clone());
                    next
                })
            })
            .collect();
    }
    out
}

fn read_return(statement: &Statement, params: &Params, module: &ModuleRecord) -> Option<Host> {
    let statement = match statement {
        Statement::BlockStatement(block) => match block.body.as_slice() {
            [only] => only,
            _ => return None,
        },
        other => other,
    };
    let Statement::ReturnStatement(ret) = statement else {
        return None;
    };
    let Expression::JSXElement(element) = ret.argument.as_ref()?.without_parentheses() else {
        return None;
    };
    read_host(element, params, module)
}

fn read_host(element: &JSXElement, params: &Params, module: &ModuleRecord) -> Option<Host> {
    let JSXElementName::IdentifierReference(tag) = &element.opening_element.name else {
        return None;
    };
    let is_host = module.import_entries.iter().any(|entry| {
        entry.local_name.name == tag.name.as_str()
            && HOST_MODULES.contains(&entry.module_request.name.as_str())
            && matches!(&entry.import_name, ImportImportName::Name(n) if FORWARDING_HOSTS.contains(&n.name.as_str()))
    });
    if !is_host {
        return None;
    }

    // The caller's children have to reach the host: through the rest spread
    // when `children` was not destructured, or as `{children}` when it was.
    let children_destructured = params.props.contains_key("children");
    let mut forwards_children = false;
    let mut parts = None;
    let mut disabled_prop = None;
    for attribute in &element.opening_element.attributes {
        match attribute {
            JSXAttributeItem::SpreadAttribute(spread) => {
                let Expression::Identifier(id) = &spread.argument else {
                    return None;
                };
                if params.rest.as_deref() != Some(id.name.as_str()) {
                    return None;
                }
                forwards_children |= !children_destructured;
            }
            JSXAttributeItem::Attribute(attribute) => {
                let JSXAttributeName::Identifier(name) = &attribute.name else {
                    continue;
                };
                match name.name.as_str() {
                    "className" => {
                        parts = Some(read_class_name(attribute.value.as_ref()?, params, module)?)
                    }
                    "disabled" => {
                        let Some(JSXAttributeValue::ExpressionContainer(container)) =
                            &attribute.value
                        else {
                            return None;
                        };
                        let JSXExpression::Identifier(id) = &container.expression else {
                            return None;
                        };
                        if !params.props.contains_key(id.name.as_str()) {
                            return None;
                        }
                        disabled_prop = Some(id.name.to_string());
                    }
                    _ => {}
                }
            }
        }
    }
    match element.children.as_slice() {
        [] => {}
        [JSXChild::ExpressionContainer(container)] if children_destructured => {
            let JSXExpression::Identifier(id) = &container.expression else {
                return None;
            };
            forwards_children = id.name == "children";
        }
        _ => return None,
    }
    if !forwards_children {
        return None;
    }
    Some(Host {
        parts: parts?,
        disabled_prop,
    })
}

fn read_class_name(
    value: &JSXAttributeValue,
    params: &Params,
    module: &ModuleRecord,
) -> Option<Vec<Part>> {
    match value {
        JSXAttributeValue::StringLiteral(lit) => Some(vec![Part::Always(lit.value.to_string())]),
        JSXAttributeValue::ExpressionContainer(container) => match &container.expression {
            JSXExpression::StringLiteral(lit) => Some(vec![Part::Always(lit.value.to_string())]),
            JSXExpression::CallExpression(call) => read_join(call, params, module),
            _ => None,
        },
        _ => None,
    }
}

fn read_join(call: &CallExpression, params: &Params, module: &ModuleRecord) -> Option<Vec<Part>> {
    let Expression::Identifier(callee) = &call.callee else {
        return None;
    };
    let recognized = module.import_entries.iter().any(|entry| {
        let from = entry.module_request.name.as_str();
        entry.local_name.name == callee.name.as_str()
            && (JOIN_MODULES.contains(&from)
                || HOZO_JOIN_MODULES.contains(&from)
                    && matches!(&entry.import_name, ImportImportName::Name(n) if n.name == "cx"))
    });
    if !recognized {
        return None;
    }
    let mut parts = Vec::new();
    for argument in &call.arguments {
        // A spread argument hides what is joined.
        let expr = argument.as_expression()?;
        match expr.without_parentheses() {
            Expression::StringLiteral(lit) => parts.push(Part::Always(lit.value.to_string())),
            Expression::ConditionalExpression(conditional) => {
                let when = read_comparison(&conditional.test, params)?;
                let (Expression::StringLiteral(then), Expression::StringLiteral(otherwise)) = (
                    conditional.consequent.without_parentheses(),
                    conditional.alternate.without_parentheses(),
                ) else {
                    return None;
                };
                parts.push(Part::Choice {
                    when,
                    then: then.value.to_string(),
                    otherwise: otherwise.value.to_string(),
                });
            }
            Expression::LogicalExpression(logical) if logical.operator == LogicalOperator::And => {
                let when = read_comparison(&logical.left, params)?;
                let Expression::StringLiteral(then) = logical.right.without_parentheses() else {
                    return None;
                };
                parts.push(Part::Choice {
                    when,
                    then: then.value.to_string(),
                    otherwise: String::new(),
                });
            }
            // The caller's own className: compiled in the caller's file, on
            // the element the caller wrote, so it is not this component's
            // to hand down.
            Expression::Identifier(id) if id.name == "className" => {}
            _ => return None,
        }
    }
    Some(parts)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn button(body: &str) -> String {
        format!(
            "import {{ cx }} from '@hozo/core'
import {{ Button as Host }} from '@hozo/primitives'
export function HozoButton({{ tone = 'neutral', size = 'md', className, disabled, ...rest }}) {{
{body}
}}
"
        )
    }

    #[test]
    fn a_tone_chain_is_read_for_every_combination() {
        let source = button(
            "  if (tone === 'accent') {
    return (
      <Host {...rest} disabled={disabled} className={cx('font-semibold text-white disabled:text-gray-500', size === 'sm' ? 'text-sm' : 'text-base', className)} />
    )
  }
  return <Host {...rest} disabled={disabled} className={cx('text-black', className)} />",
        );
        let summary = summarize_text_forwarding(&source);
        let [component] = summary.components.as_slice() else {
            panic!("{summary:?}")
        };
        assert_eq!(component.name, "HozoButton");
        assert_eq!(component.disabled_prop.as_deref(), Some("disabled"));
        let props: Vec<_> = component
            .props
            .iter()
            .map(|p| (p.name.as_str(), p.default.as_deref(), p.values.clone()))
            .collect();
        assert_eq!(
            props,
            [
                ("size", Some("md"), vec!["md".to_string(), "sm".to_string()]),
                (
                    "tone",
                    Some("neutral"),
                    vec!["accent".to_string(), "neutral".to_string()]
                ),
            ]
        );
        let variant = |size: &str, tone: &str| {
            component
                .variants
                .iter()
                .find(|v| v.when == [size, tone])
                .map(|v| v.classes.as_str())
        };
        assert_eq!(
            variant("sm", "accent"),
            Some("font-semibold text-white disabled:text-gray-500 text-sm")
        );
        assert_eq!(
            variant("md", "accent"),
            Some("font-semibold text-white disabled:text-gray-500 text-base")
        );
        assert_eq!(variant("md", "neutral"), Some("text-black"));
        assert_eq!(component.variants.len(), 4);
    }

    #[test]
    fn a_shape_it_cannot_read_gives_no_entry() {
        // A class list built at runtime.
        let joined = button("  return <Host {...rest} className={[base, className].join(' ')} />");
        assert!(summarize_text_forwarding(&joined).components.is_empty());
        // Children that do not reach the host.
        let dropped = "import { Button as Host } from '@hozo/primitives'
export function Icon({ className }) { return <Host className=\"text-white\" /> }";
        assert!(summarize_text_forwarding(dropped).components.is_empty());
        // A host that is not a pressable.
        let view = "import { View } from '@hozo/primitives'
export function Box({ ...rest }) { return <View {...rest} className=\"text-white\" /> }";
        assert!(summarize_text_forwarding(view).components.is_empty());
        // A join helper defined locally.
        let local = "import { Button as Host } from '@hozo/primitives'
const cx = (...a) => a.join(' ')
export function B({ className, ...rest }) { return <Host {...rest} className={cx('text-white', className)} /> }";
        assert!(summarize_text_forwarding(local).components.is_empty());
    }

    #[test]
    fn children_named_in_the_props_must_be_rendered() {
        let source = "import { Pressable } from '@hozo/core'
export function Chip({ children, onPress }) { return <Pressable onPress={onPress} className=\"text-blue-600\">{children}</Pressable> }";
        let summary = summarize_text_forwarding(source);
        assert_eq!(summary.components[0].variants[0].classes, "text-blue-600");
        assert!(summary.components[0].props.is_empty());
    }

    #[test]
    fn an_entry_records_its_reexports() {
        let source = "export { HozoButton as Button, HozoButton } from './button.tsx'";
        let summary = summarize_text_forwarding(source);
        let exported: Vec<_> = summary
            .reexports
            .iter()
            .map(|r| (r.exported.as_str(), r.imported.as_str()))
            .collect();
        assert_eq!(
            exported,
            [("Button", "HozoButton"), ("HozoButton", "HozoButton")]
        );
    }
}
