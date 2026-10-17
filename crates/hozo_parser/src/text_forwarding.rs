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
//! Exported `const` arrows, with either the same block or a concise JSX
//! body, use the same reader. Mutable bindings and call-wrapped components
//! are not unwrapped: their implementation is not this declaration alone.
//!
//! The classes are recorded as written, not as styles. The caller resolves
//! them against its own theme, so `text-hozo-on-accent` means what the
//! application's theme says it means.

use std::collections::{BTreeMap, BTreeSet};

use hozo_ir::{
    Child, Condition, ConditionExpr, EnclosingComponent, EnclosingValue, NestedNode, Node,
    StyleDeclaration,
};

use oxc_allocator::Allocator;
use oxc_ast::ast::{
    ArrowFunctionBody, ArrowFunctionExpression, BindingPattern, CallExpression, Declaration,
    Expression, FormalParameters, JSXAttributeItem, JSXAttributeName, JSXAttributeValue, JSXChild,
    JSXElement, JSXElementName, JSXExpression, Statement, VariableDeclarationKind,
};
use oxc_parser::Parser;
use oxc_span::SourceType;
use oxc_syntax::module_record::{
    ExportExportName, ExportImportName, ImportImportName, ModuleRecord,
};
use oxc_syntax::operator::{BinaryOperator, LogicalOperator};

use crate::tailwind;

/// Hosts whose text styles a Text inside them does not inherit, since React
/// Native inherits text styles only from a Text: the pressables, the ones
/// the Native backend forwards through `hozoTextStyle` (#876), and `View`,
/// which `@hozo/ui`'s Alert became in #983. A `Text` host is left out:
/// inheritance already reaches whatever is nested in it.
const FORWARDING_HOSTS: [&str; 3] = ["Pressable", "Button", "View"];
const HOST_MODULES: [&str; 2] = ["@hozo/core", "@hozo/primitives"];
/// Pattern components that render their children inside a `View`: their own
/// string child gets the text styles at runtime, a Text the caller nests
/// does not. `@hozo/ui`'s Alert wears the first since #983; its Checkbox
/// and Switch take their label as children the same way (#974).
///
/// The third field says whether the pattern's pressable shares its state
/// with that Text: Checkbox's and Switch's provide `HozoInteractionContext`
/// from `@hozo/behaviors`, which a `HozoText` reads; Alert has no state.
const PATTERN_HOSTS: [(&str, &str, bool); 3] = [
    ("@hozo/patterns", "Alert", false),
    ("@hozo/patterns", "Checkbox", true),
    ("@hozo/patterns", "Switch", true),
];

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
    /// Whether the host shares its pressed, hovered and focused state with
    /// a Text inside it, so a caller's Text can take the `hover:`,
    /// `active:` and `focus-visible:` classes it hands down. True for a
    /// pressable primitive: whenever its classes carry such a variant it is
    /// compiled to `HozoPressable`, which provides that state.
    pub host_states: bool,
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

    // Class lists a component names rather than writes (`alertAccent`), read
    // with no props in scope: a module constant cannot depend on one.
    let no_props = Params {
        props: BTreeMap::new(),
        rest: None,
    };
    let mut module_constants = BTreeMap::new();
    for statement in &ret.program.body {
        if let Statement::VariableDeclaration(declaration) = statement {
            let mut found = BTreeMap::new();
            read_constants(
                declaration,
                &Scope {
                    params: &no_props,
                    module,
                    constants: &module_constants,
                },
                &mut found,
            );
            module_constants.extend(found);
        }
    }

    let mut components = Vec::new();
    for statement in &ret.program.body {
        let declaration = match statement {
            Statement::ExportDeclaration(export) => Some(&export.declaration),
            other => other.as_declaration(),
        };
        let mut record = |local: &str, shape: ForwardingComponent| {
            for name in &exported_as[local] {
                components.push(ForwardingComponent {
                    name: name.clone(),
                    ..shape.clone()
                });
            }
        };
        match declaration {
            Some(Declaration::FunctionDeclaration(function)) => {
                let (Some(id), Some(body)) = (&function.id, &function.body) else {
                    continue;
                };
                if !exported_as.contains_key(id.name.as_str()) {
                    continue;
                }
                if let Some(shape) = read_component(
                    &function.params,
                    &body.statements,
                    module,
                    &module_constants,
                ) {
                    record(id.name.as_str(), shape);
                }
            }
            Some(Declaration::VariableDeclaration(declaration))
                if declaration.kind == VariableDeclarationKind::Const =>
            {
                for binding in &declaration.declarations {
                    let BindingPattern::BindingIdentifier(id) = &binding.id else {
                        continue;
                    };
                    if !exported_as.contains_key(id.name.as_str()) {
                        continue;
                    }
                    let Some(Expression::ArrowFunctionExpression(arrow)) =
                        binding.init.as_ref().map(Expression::without_parentheses)
                    else {
                        continue;
                    };
                    if let Some(shape) = read_arrow(arrow, module, &module_constants) {
                        record(id.name.as_str(), shape);
                    }
                }
            }
            _ => {}
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
                // A default that is not a string (`live = false`) is kept as
                // none. If the classes compare the prop, a caller who leaves
                // it out then gets nothing handed down, which is the safe
                // side; if they do not, it never mattered.
                match &assign.right {
                    Expression::StringLiteral(value) => Some(value.value.to_string()),
                    _ => None,
                }
            }
            // A renamed binding would need its local name tracked through
            // every comparison. Not worth it for the shape this reads.
            _ => return None,
        };
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

/// A choice between two class lists, made by comparing a prop with a
/// literal.
#[derive(Debug, Clone, PartialEq, Eq)]
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

/// `prop !== undefined`, `prop != null` or a bare `prop`, on a destructured
/// prop: a question about whether it was passed, not about its value.
fn is_presence_test(expr: &Expression, params: &Params) -> bool {
    let is_prop = |expr: &Expression| matches!(expr.without_parentheses(), Expression::Identifier(id) if params.props.contains_key(id.name.as_str()));
    match expr.without_parentheses() {
        Expression::BinaryExpression(binary) => {
            let nothing = |expr: &Expression| match expr.without_parentheses() {
                Expression::Identifier(id) => id.name == "undefined",
                Expression::NullLiteral(_) => true,
                _ => false,
            };
            matches!(
                binary.operator,
                BinaryOperator::StrictInequality | BinaryOperator::Inequality
            ) && (is_prop(&binary.left) && nothing(&binary.right)
                || nothing(&binary.left) && is_prop(&binary.right))
        }
        other => is_prop(other),
    }
}

/// A class list as the source builds it, before any prop has a value.
#[derive(Debug, Clone, PartialEq, Eq)]
enum Classes {
    Literal(String),
    Choice {
        when: Comparison,
        then: Box<Classes>,
        otherwise: Box<Classes>,
    },
    Join(Vec<Classes>),
}

impl Classes {
    /// One shape per meaning: nested joins flattened, blank literals gone,
    /// a join of one reduced to it. So `${own} ${className}` with the
    /// caller's part left out compares equal to `own`.
    fn normalized(self) -> Classes {
        match self {
            Classes::Literal(text) => {
                Classes::Literal(text.split_whitespace().collect::<Vec<_>>().join(" "))
            }
            Classes::Choice {
                when,
                then,
                otherwise,
            } => Classes::Choice {
                when,
                then: Box::new(then.normalized()),
                otherwise: Box::new(otherwise.normalized()),
            },
            Classes::Join(parts) => {
                let mut flat = Vec::new();
                for part in parts {
                    match part.normalized() {
                        Classes::Join(inner) => flat.extend(inner),
                        Classes::Literal(text) if text.is_empty() => {}
                        other => flat.push(other),
                    }
                }
                match flat.len() {
                    0 => Classes::Literal(String::new()),
                    1 => flat.pop().expect("one part"),
                    _ => Classes::Join(flat),
                }
            }
        }
    }

    fn comparisons<'a>(&'a self, out: &mut Vec<&'a Comparison>) {
        match self {
            Classes::Literal(_) => {}
            Classes::Choice {
                when,
                then,
                otherwise,
            } => {
                out.push(when);
                then.comparisons(out);
                otherwise.comparisons(out);
            }
            Classes::Join(parts) => parts.iter().for_each(|part| part.comparisons(out)),
        }
    }

    fn resolve<'a>(&'a self, holds: &dyn Fn(&Comparison) -> bool, out: &mut Vec<&'a str>) {
        match self {
            Classes::Literal(text) => out.push(text),
            Classes::Choice {
                when,
                then,
                otherwise,
            } => {
                if holds(when) {
                    then.resolve(holds, out)
                } else {
                    otherwise.resolve(holds, out)
                }
            }
            Classes::Join(parts) => parts.iter().for_each(|part| part.resolve(holds, out)),
        }
    }
}

/// What a constant's name stands for: a class list, or an object of class
/// lists picked by a prop (`tones[tone]`, the shape `cva`-style libraries
/// write by hand). Kept apart so a map named where a class list belongs is
/// refused rather than read as one.
#[derive(Debug, Clone, PartialEq, Eq)]
enum Named {
    Classes(Classes),
    Map(BTreeMap<String, Classes>),
}

/// What a class expression can refer to: the props, the module's imports,
/// and the constants already read, module-level and then the component's own.
struct Scope<'a> {
    params: &'a Params,
    module: &'a ModuleRecord<'a>,
    constants: &'a BTreeMap<String, Named>,
}

fn read_classes(expr: &Expression, scope: &Scope) -> Option<Classes> {
    match expr.without_parentheses() {
        Expression::StringLiteral(lit) => Some(Classes::Literal(lit.value.to_string())),
        Expression::TemplateLiteral(template) => {
            let mut parts = Vec::new();
            for (index, quasi) in template.quasis.iter().enumerate() {
                parts.push(Classes::Literal(quasi.value.cooked.as_ref()?.to_string()));
                if let Some(expr) = template.expressions.get(index) {
                    parts.push(read_classes(expr, scope)?);
                }
            }
            Some(Classes::Join(parts))
        }
        // The caller's own className: compiled in the caller's file, on the
        // element the caller wrote, so it is not this component's to hand down.
        Expression::Identifier(id) if id.name == "className" => {
            Some(Classes::Literal(String::new()))
        }
        Expression::Identifier(id) => match scope.constants.get(id.name.as_str())? {
            Named::Classes(classes) => Some(classes.clone()),
            Named::Map(_) => None,
        },
        Expression::ComputedMemberExpression(member) => read_lookup(member, scope),
        Expression::ConditionalExpression(conditional) => {
            // `className ? `${own} ${className}` : own` -- the two branches
            // differ by the caller's part only, which is left out anyway.
            if matches!(conditional.test.without_parentheses(), Expression::Identifier(id) if id.name == "className")
            {
                let with = read_classes(&conditional.consequent, scope)?.normalized();
                let without = read_classes(&conditional.alternate, scope)?.normalized();
                return (with == without).then_some(without);
            }
            Some(Classes::Choice {
                when: read_comparison(&conditional.test, scope.params)?,
                then: Box::new(read_classes(&conditional.consequent, scope)?),
                otherwise: Box::new(read_classes(&conditional.alternate, scope)?),
            })
        }
        Expression::LogicalExpression(logical) if logical.operator == LogicalOperator::And => {
            Some(Classes::Choice {
                when: read_comparison(&logical.left, scope.params)?,
                then: Box::new(read_classes(&logical.right, scope)?),
                otherwise: Box::new(Classes::Literal(String::new())),
            })
        }
        Expression::CallExpression(call) => read_join(call, scope),
        _ => None,
    }
}

/// `tones[tone]`: one comparison per key, the way the `if` chain it replaces
/// would be written. A value with no key reads `undefined`, which every
/// join drops, so it falls through to nothing.
fn read_lookup(member: &oxc_ast::ast::ComputedMemberExpression, scope: &Scope) -> Option<Classes> {
    let (Expression::Identifier(map), Expression::Identifier(prop)) = (
        member.object.without_parentheses(),
        member.expression.get_inner_expression(),
    ) else {
        return None;
    };
    let Named::Map(entries) = scope.constants.get(map.name.as_str())? else {
        return None;
    };
    if !scope.params.props.contains_key(prop.name.as_str()) {
        return None;
    }
    let mut classes = Classes::Literal(String::new());
    for (key, value) in entries.iter().rev() {
        classes = Classes::Choice {
            when: Comparison {
                prop: prop.name.to_string(),
                value: key.clone(),
            },
            then: Box::new(value.clone()),
            otherwise: Box::new(classes),
        };
    }
    Some(classes)
}

/// `{ accent: '…', neutral: '…' }`, with `as const` or `satisfies` allowed
/// around it. Every key has to be written out and every value has to be a
/// class list: a map with one unreadable entry would hand down the wrong
/// look for the value that picks it.
fn read_map(expr: &Expression, scope: &Scope) -> Option<BTreeMap<String, Classes>> {
    let Expression::ObjectExpression(object) = expr.get_inner_expression() else {
        return None;
    };
    let mut entries = BTreeMap::new();
    for property in &object.properties {
        let oxc_ast::ast::ObjectPropertyKind::ObjectProperty(property) = property else {
            return None;
        };
        if property.method || property.kind != oxc_ast::ast::PropertyKind::Init {
            return None;
        }
        let key = match &property.key {
            oxc_ast::ast::PropertyKey::StaticIdentifier(id) if !property.computed => {
                id.name.to_string()
            }
            oxc_ast::ast::PropertyKey::StringLiteral(lit) => lit.value.to_string(),
            _ => return None,
        };
        entries.insert(key, read_classes(&property.value, scope)?);
    }
    (!entries.is_empty()).then_some(entries)
}

/// `const name = <class expression>`, for every declarator that is one.
/// Anything else is skipped, not refused: a constant nothing reads is not
/// this reader's concern, and one that is read and missing refuses there.
fn read_constants(
    declaration: &oxc_ast::ast::VariableDeclaration,
    scope: &Scope,
    into: &mut BTreeMap<String, Named>,
) {
    if declaration.kind != oxc_ast::ast::VariableDeclarationKind::Const {
        return;
    }
    for declarator in &declaration.declarations {
        let (BindingPattern::BindingIdentifier(id), Some(init)) =
            (&declarator.id, &declarator.init)
        else {
            continue;
        };
        if let Some(classes) = read_classes(init, scope) {
            into.insert(id.name.to_string(), Named::Classes(classes));
        } else if let Some(entries) = read_map(init, scope) {
            into.insert(id.name.to_string(), Named::Map(entries));
        }
    }
}

struct Branch {
    guard: Option<Comparison>,
    host: Host,
}

struct Host {
    classes: Classes,
    disabled_prop: Option<String>,
    states: bool,
}

fn read_arrow(
    arrow: &ArrowFunctionExpression,
    module: &ModuleRecord,
    module_constants: &BTreeMap<String, Named>,
) -> Option<ForwardingComponent> {
    if arrow.r#async {
        return None;
    }
    match &arrow.body {
        ArrowFunctionBody::FunctionBody(body) => {
            read_component(&arrow.params, &body.statements, module, module_constants)
        }
        concise => {
            let Expression::JSXElement(element) = concise.as_expression()?.without_parentheses()
            else {
                return None;
            };
            let params = read_params(&arrow.params)?;
            let host = read_host(
                element,
                &Scope {
                    params: &params,
                    module,
                    constants: module_constants,
                },
            )?;
            summarize_branches(&params, &[Branch { guard: None, host }])
        }
    }
}

fn read_component(
    params: &FormalParameters,
    statements: &[Statement],
    module: &ModuleRecord,
    module_constants: &BTreeMap<String, Named>,
) -> Option<ForwardingComponent> {
    let params = read_params(params)?;
    let mut constants = module_constants.clone();
    let (last, guarded) = statements.split_last()?;
    // The fallthrough may itself be a presence pair, as the last tone is.
    let (trailing, guarded) = match guarded.split_last() {
        Some((Statement::IfStatement(branch), before)) if is_presence_branch(branch, &params) => {
            (Some(&**branch), before)
        }
        _ => (None, guarded),
    };
    let mut branches = Vec::new();
    for statement in guarded {
        if let Statement::VariableDeclaration(declaration) = statement {
            let mut found = BTreeMap::new();
            read_constants(
                declaration,
                &Scope {
                    params: &params,
                    module,
                    constants: &constants,
                },
                &mut found,
            );
            constants.extend(found);
            continue;
        }
        let Statement::IfStatement(branch) = statement else {
            return None;
        };
        if branch.alternate.is_some() {
            return None;
        }
        let scope = Scope {
            params: &params,
            module,
            constants: &constants,
        };
        let guard = read_comparison(&branch.test, &params)?;
        let host = read_return(&branch.consequent, &scope)?;
        branches.push(Branch {
            guard: Some(guard),
            host,
        });
    }
    let scope = Scope {
        params: &params,
        module,
        constants: &constants,
    };
    branches.push(Branch {
        guard: None,
        host: match trailing {
            Some(branch) => read_pair(branch, last, &scope)?,
            None => read_return(last, &scope)?,
        },
    });
    summarize_branches(&params, &branches)
}

fn summarize_branches(params: &Params, branches: &[Branch]) -> Option<ForwardingComponent> {
    // Every value a prop is compared against, plus its default: the values
    // a caller can write that change the classes.
    let mut domain: BTreeMap<String, BTreeSet<String>> = BTreeMap::new();
    for branch in branches {
        let mut seen = Vec::new();
        if let Some(guard) = &branch.guard {
            seen.push(guard);
        }
        branch.host.classes.comparisons(&mut seen);
        for c in seen {
            domain
                .entry(c.prop.clone())
                .or_default()
                .insert(c.value.clone());
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
    let mut host_states = true;
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
        branch.host.classes.resolve(&holds, &mut classes);
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
        // A caller cannot tell which host it is in either.
        host_states &= branch.host.states;
    }
    Some(ForwardingComponent {
        name: String::new(),
        props,
        variants,
        disabled_prop,
        host_states,
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

fn is_presence_branch(branch: &oxc_ast::ast::IfStatement, params: &Params) -> bool {
    branch.alternate.is_none() && is_presence_test(&branch.test, params)
}

/// `if (href !== undefined) return <A …/>` and the return after it: two
/// elements for one look, read as one when their classes agree.
fn read_pair(branch: &oxc_ast::ast::IfStatement, last: &Statement, scope: &Scope) -> Option<Host> {
    let with = read_return(&branch.consequent, scope)?;
    let without = read_return(last, scope)?;
    let same = with.disabled_prop == without.disabled_prop
        && with.states == without.states
        && with.classes.normalized() == without.classes.clone().normalized();
    same.then_some(without)
}

fn read_return(statement: &Statement, scope: &Scope) -> Option<Host> {
    let statement = match statement {
        Statement::BlockStatement(block) => match block.body.as_slice() {
            [only] => only,
            // `{ if (href !== undefined) return <A …/>; return <B …/> }`: two
            // elements for one look, read as one when their classes agree.
            [Statement::IfStatement(branch), last] if is_presence_branch(branch, scope.params) => {
                return read_pair(branch, last, scope);
            }
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
    read_host(element, scope)
}

fn read_host(element: &JSXElement, scope: &Scope) -> Option<Host> {
    let (params, module) = (scope.params, scope.module);
    let JSXElementName::IdentifierReference(tag) = &element.opening_element.name else {
        return None;
    };
    let host = module.import_entries.iter().find_map(|entry| {
        let ImportImportName::Name(imported) = &entry.import_name else {
            return None;
        };
        let (from, name) = (entry.module_request.name.as_str(), imported.name.as_str());
        if entry.local_name.name != tag.name.as_str() {
            return None;
        }
        if HOST_MODULES.contains(&from) && FORWARDING_HOSTS.contains(&name) {
            // The pressable primitives share their state; a View has none.
            return Some(matches!(name, "Pressable" | "Button"));
        }
        PATTERN_HOSTS
            .iter()
            .find(|(module, pattern, _)| *module == from && *pattern == name)
            .map(|(_, _, states)| *states)
    });
    let states = host?;

    // The caller's children have to reach the host: through the rest spread
    // when `children` was not destructured, or as `{children}` when it was.
    let children_destructured = params.props.contains_key("children");
    let mut forwards_children = false;
    let mut spreads_rest = false;
    let mut classes = None;
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
                spreads_rest = true;
            }
            JSXAttributeItem::Attribute(attribute) => {
                let JSXAttributeName::Identifier(name) = &attribute.name else {
                    continue;
                };
                match name.name.as_str() {
                    "className" => {
                        classes = Some(read_class_name(attribute.value.as_ref()?, scope)?)
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
    // A formatter puts `{children}` on its own line; the whitespace around it
    // is not a child React renders.
    let children: Vec<&JSXChild> = element
        .children
        .iter()
        .filter(|child| !matches!(child, JSXChild::Text(text) if text.value.trim().is_empty() && text.value.contains('\n')))
        .collect();
    match children.as_slice() {
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
    // A `disabled` left in the rest reaches the host through the spread, so
    // the caller's own `disabled` decides `disabled:` as if it were named.
    // `@hozo/ui`'s Checkbox and Switch take it this way (#974).
    if disabled_prop.is_none() && spreads_rest && !params.props.contains_key("disabled") {
        disabled_prop = Some("disabled".to_string());
    }
    Some(Host {
        classes: classes?,
        disabled_prop,
        states,
    })
}

fn read_class_name(value: &JSXAttributeValue, scope: &Scope) -> Option<Classes> {
    match value {
        JSXAttributeValue::StringLiteral(lit) => Some(Classes::Literal(lit.value.to_string())),
        JSXAttributeValue::ExpressionContainer(container) => {
            read_classes(container.expression.as_expression()?, scope)
        }
        _ => None,
    }
}

fn read_join(call: &CallExpression, scope: &Scope) -> Option<Classes> {
    let Expression::Identifier(callee) = &call.callee else {
        return None;
    };
    let recognized = scope.module.import_entries.iter().any(|entry| {
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
        parts.push(read_classes(argument.as_expression()?, scope)?);
    }
    Some(Classes::Join(parts))
}

/// Manifests' text forwarding, keyed by the module a caller imports from and
/// the name it imports.
#[derive(Debug, Default, Clone)]
pub struct ForwardingTable {
    entries: std::collections::HashMap<(String, String), ForwardingComponent>,
}

impl ForwardingTable {
    pub fn insert(&mut self, module: &str, component: ForwardingComponent) {
        self.entries
            .insert((module.to_string(), component.name.clone()), component);
    }

    pub fn is_empty(&self) -> bool {
        self.entries.is_empty()
    }
}

/// Fills in what each element's enclosing components hand down (#950).
///
/// Declarations for every property the classes set, not only text ones: the
/// backend decides what a text element inherits, as it does for the
/// declarations an ancestor in the same file hands down.
pub fn apply_text_forwarding(output: &mut crate::ParseOutput, table: &ForwardingTable) {
    if table.is_empty() {
        return;
    }
    let imports = &output.imports;
    for root in &mut output.roots {
        root.forwarded = forwarded_by(&root.enclosing, imports, table);
        apply_to_node(&mut root.node, imports, table);
    }
}

fn apply_to_nested(
    nested: &mut [NestedNode],
    imports: &[crate::ImportBinding],
    table: &ForwardingTable,
) {
    for entry in nested {
        entry.forwarded = forwarded_by(&entry.enclosing, imports, table);
        apply_to_node(&mut entry.node, imports, table);
    }
}

fn apply_to_node(node: &mut Node, imports: &[crate::ImportBinding], table: &ForwardingTable) {
    for prop in &mut node.props.passthrough {
        apply_to_nested(&mut prop.nested, imports, table);
    }
    for child in &mut node.children {
        match child {
            Child::Node(inner) => apply_to_node(inner, imports, table),
            Child::Verbatim { nested, .. } => apply_to_nested(nested, imports, table),
            Child::Text(_) => {}
        }
    }
}

/// Outermost first, so an inner component's classes come later and win.
fn forwarded_by(
    enclosing: &[EnclosingComponent],
    imports: &[crate::ImportBinding],
    table: &ForwardingTable,
) -> Vec<StyleDeclaration> {
    enclosing
        .iter()
        .flat_map(|component| resolve(component, imports, table))
        .collect()
}

fn resolve(
    component: &EnclosingComponent,
    imports: &[crate::ImportBinding],
    table: &ForwardingTable,
) -> Vec<StyleDeclaration> {
    // A spread may set the very prop the classes depend on.
    if component.spread {
        return Vec::new();
    }
    let Some(import) = imports
        .iter()
        .find(|import| import.local == component.local)
    else {
        return Vec::new();
    };
    let key = (import.source.clone(), import.imported.clone());
    let Some(entry) = table.entries.get(&key) else {
        return Vec::new();
    };
    let value_of = |name: &str| {
        component
            .props
            .iter()
            .find(|p| p.name == name)
            .map(|p| &p.value)
    };

    // Every prop the classes depend on has to be known here: a literal, or
    // absent with a default. Anything else is decided at runtime, where the
    // direct-child forwarding of #876 still applies.
    let mut when = Vec::new();
    for prop in &entry.props {
        let value = match value_of(&prop.name) {
            Some(EnclosingValue::Literal(value)) => value.clone(),
            None => match &prop.default {
                Some(default) => default.clone(),
                None => return Vec::new(),
            },
            Some(_) => return Vec::new(),
        };
        when.push(value);
    }
    let Some(variant) = entry.variants.iter().find(|v| v.when == when) else {
        return Vec::new();
    };

    // `disabled:` is driven by the prop the component hands to its host's
    // `disabled`, so the caller's own expression for that prop decides it.
    let disabled = entry.disabled_prop.as_deref().and_then(value_of);
    let mut out = Vec::new();
    for token in variant.classes.split_whitespace() {
        if tailwind::has_unstripped_variant(token) {
            continue;
        }
        let (condition, properties) = tailwind::expand_utility(token);
        let condition = match condition {
            Condition::Always | Condition::Responsive(_) => condition,
            Condition::Disabled => match disabled {
                Some(EnclosingValue::True) => Condition::Always,
                Some(EnclosingValue::Expr(expr)) => Condition::Expr(ConditionExpr::Ref(*expr)),
                // Not disabled, or not by anything this file can see.
                _ => continue,
            },
            Condition::Enabled => match disabled {
                Some(EnclosingValue::True) => continue,
                Some(EnclosingValue::Expr(expr)) => {
                    Condition::Expr(ConditionExpr::Not(Box::new(ConditionExpr::Ref(*expr))))
                }
                _ => Condition::Always,
            },
            // Pressed, hovered and focused belong to the component's own
            // pressable. A host that shares them hands them to the Text,
            // which reads them at runtime; any other is not wired to it,
            // so they are left out rather than applied unconditionally.
            Condition::Pressed | Condition::Hover | Condition::Focus | Condition::FocusVisible
                if entry.host_states =>
            {
                condition
            }
            _ => continue,
        };
        for property in properties {
            out.push(StyleDeclaration {
                property,
                condition: condition.clone(),
            });
        }
    }
    out
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
        assert!(
            component.host_states,
            "a pressable primitive shares its state"
        );
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
    fn an_exported_const_arrow_block_has_the_same_summary_as_a_function() {
        let source = button(
            "const own = size === 'sm' ? 'text-sm' : 'text-base'
  if (tone === 'accent') return <Host {...rest} disabled={disabled} className={cx('text-white hover:text-red-500', own, className)} />
  return <Host {...rest} disabled={disabled} className={cx('text-black', own, className)} />",
        );
        let arrow = source.replace(
            "export function HozoButton({ tone = 'neutral', size = 'md', className, disabled, ...rest }) {",
            "export const HozoButton = ({ tone = 'neutral', size = 'md', className, disabled, ...rest }) => {",
        );
        let expected = summarize_text_forwarding(&source);
        assert_eq!(expected.components.len(), 1);
        assert_eq!(summarize_text_forwarding(&arrow), expected);
    }

    #[test]
    fn a_concise_arrow_uses_the_same_host_and_variant_reader() {
        let imports = "import { Checkbox as Host } from '@hozo/patterns'
const own = 'text-sm hover:text-red-500 disabled:text-gray-400'
";
        let params = "{ tone = 'quiet', children, className, ...rest }: Props";
        let host = "<Host {...rest} className={tone === 'loud' ? `font-bold ${own} ${className}` : own}>{children}</Host>";
        let source = format!("{imports}export function Check({params}) {{ return ({host}) }}");
        let arrow = format!("{imports}export const Check = ({params}) => ({host})");
        let expected = summarize_text_forwarding(&source);
        assert_eq!(expected.components.len(), 1);
        assert_eq!(
            expected.components[0].disabled_prop.as_deref(),
            Some("disabled")
        );
        assert!(expected.components[0].host_states);
        assert_eq!(summarize_text_forwarding(&arrow), expected);
    }

    #[test]
    fn arrows_are_recorded_only_under_their_exported_names() {
        let source = "import { View } from '@hozo/core'
const Private = ({children}) => <View className=\"text-red-500\">{children}</View>
const Local = ({children}) => <View className=\"text-sm\">{children}</View>,
      Other = ({children}) => { return <View className=\"font-bold\">{children}</View> }
export { Local as Label, Local as Alternate, Other }
export const Direct = ({children}) => <View className=\"text-lg\">{children}</View>,
             Second = ({children}) => <View className=\"text-xl\">{children}</View>";
        let summary = summarize_text_forwarding(source);
        let names: Vec<_> = summary.components.iter().map(|c| c.name.as_str()).collect();
        assert_eq!(names, ["Alternate", "Direct", "Label", "Other", "Second"]);
        assert_eq!(summary.components[0].variants[0].classes, "text-sm");
        assert_eq!(summary.components[2].variants[0].classes, "text-sm");
        assert!(!summary.components[0].host_states);
    }

    #[test]
    fn arrow_support_does_not_guess_through_mutation_wrappers_or_unknown_bodies() {
        for definition in [
            "export let B = ({children}) => <Host className=\"text-sm\">{children}</Host>",
            "export var B = ({children}) => <Host className=\"text-sm\">{children}</Host>",
            "export const B = async ({children}) => <Host className=\"text-sm\">{children}</Host>",
            "export const B = memo(({children}) => <Host className=\"text-sm\">{children}</Host>)",
            "export const B = forwardRef(({children}, ref) => <Host ref={ref} className=\"text-sm\">{children}</Host>)",
            "export const B = ({children}) => makeHost(children)",
            "export const B = ({children}) => { effect(); return <Host className=\"text-sm\">{children}</Host> }",
            "export const B = ({children}) => <Host className=\"text-sm\" />",
            "export const B = ({children}) => <Text className=\"text-sm\">{children}</Text>",
            "export const B = ({children}) => <><Host className=\"text-sm\">{children}</Host></>",
            "export const B = ({children}) => <Host className={compute()}>{children}</Host>",
            "export const B = ({children, tone: t}) => <Host className={t === 'loud' ? 'text-lg' : 'text-sm'}>{children}</Host>",
        ] {
            let source = format!(
                "import {{ Button as Host, Text }} from '@hozo/primitives'\n{definition}"
            );
            assert!(
                summarize_text_forwarding(&source).components.is_empty(),
                "{definition}"
            );
        }
    }

    #[test]
    fn an_object_map_reads_as_the_chain_it_replaces() {
        let chain = button(
            "  return <Host {...rest} disabled={disabled} className={cx('font-semibold', tone === 'accent' ? 'text-white hover:text-red-500' : tone === 'neutral' ? 'text-black' : '', size === 'sm' ? 'text-sm' : size === 'md' ? 'text-base' : '', className)} />",
        );
        let map = button(
            "  const sizes = { sm: 'text-sm', 'md': 'text-base' }
  return <Host {...rest} disabled={disabled} className={cx('font-semibold', tones[tone], sizes[size as Size], className)} />",
        )
        .replace(
            "export function",
            "const tones = { accent: 'text-white hover:text-red-500', neutral: 'text-black' } as const satisfies Record<Tone, string>\nexport function",
        );
        let expected = summarize_text_forwarding(&chain);
        assert_eq!(expected.components.len(), 1);
        assert_eq!(expected.components[0].variants.len(), 4);
        assert_eq!(summarize_text_forwarding(&map), expected);
    }

    #[test]
    fn a_value_the_map_has_no_key_for_hands_down_nothing_from_it() {
        // The default is not a key: `tones['plain']` is undefined, which
        // the join drops.
        let source =
            button("  return <Host {...rest} className={`text-sm ${tones[tone]} ${className}`} />")
                .replace("tone = 'neutral'", "tone = 'plain'")
                .replace(
                    "export function",
                    "const tones = { accent: 'text-white' }\nexport function",
                );
        let summary = summarize_text_forwarding(&source);
        let [component] = summary.components.as_slice() else {
            panic!("{summary:?}")
        };
        let classes: Vec<_> = component
            .variants
            .iter()
            .map(|v| (v.when.join(","), v.classes.as_str()))
            .collect();
        assert_eq!(
            classes,
            [
                ("accent".to_string(), "text-sm text-white"),
                ("plain".to_string(), "text-sm"),
            ]
        );
    }

    #[test]
    fn a_map_it_cannot_read_whole_gives_no_entry() {
        for (map, class_name) in [
            // A spread could hold any key.
            ("{ ...base, accent: 'text-white' }", "tones[tone]"),
            // A computed key is a value the reader would have to guess.
            ("{ [accent]: 'text-white' }", "tones[tone]"),
            ("{ accent() { return 'text-white' } }", "tones[tone]"),
            // One unreadable entry is a wrong look for the value that picks it.
            (
                "{ accent: 'text-white', neutral: compute() }",
                "tones[tone]",
            ),
            ("{}", "tones[tone]"),
            // Picked by something other than a prop.
            ("{ accent: 'text-white' }", "tones[other]"),
            ("{ accent: 'text-white' }", "tones['accent' + tone]"),
            // A map named where a class list belongs.
            ("{ accent: 'text-white' }", "tones"),
            ("{ accent: 'text-white' }", "tones.accent"),
            ("['text-white']", "tones[tone]"),
        ] {
            let source = button(&format!(
                "  return <Host {{...rest}} className={{cx({class_name}, className)}} />"
            ))
            .replace(
                "export function",
                &format!("const tones = {map}\nexport function"),
            );
            assert!(
                summarize_text_forwarding(&source).components.is_empty(),
                "{map} / {class_name}"
            );
        }
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
        // A Text host: a Text nested in it inherits without help.
        let text = "import { Text } from '@hozo/primitives'
export function Label({ ...rest }) { return <Text {...rest} className=\"text-white\" /> }";
        assert!(summarize_text_forwarding(text).components.is_empty());
        // The caller's className changes more than the caller's part.
        let differs = "import { View } from '@hozo/core'
export function Box({ children, className }) { return <View className={className ? `text-sm ${className}` : 'text-lg'}>{children}</View> }";
        assert!(summarize_text_forwarding(differs).components.is_empty());
        // A constant that is not a class list, read where one is needed.
        let computed = "import { View } from '@hozo/core'
const own = ['text-sm'].join(' ')
export function Box({ children }) { return <View className={own}>{children}</View> }";
        assert!(summarize_text_forwarding(computed).components.is_empty());
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
    fn a_view_whose_classes_are_named_constants_is_read() {
        // `@hozo/ui`'s Alert, as #983 left it.
        let source = "import { View } from '@hozo/core'
const neutral = 'px-4 text-sm text-gray-700'
const accent = 'px-4 text-sm text-blue-700'
const danger = 'px-4 text-sm text-red-700'
export function HozoAlert({ children, tone = 'neutral', live = false, className }) {
  const own = tone === 'accent' ? accent : tone === 'danger' ? danger : neutral
  return (
    <View role={live === 'assertive' ? 'alert' : undefined} className={className ? `${own} ${className}` : own}>
      {children}
    </View>
  )
}
export { HozoAlert as Alert }";
        let summary = summarize_text_forwarding(source);
        let names: Vec<_> = summary.components.iter().map(|c| c.name.as_str()).collect();
        assert_eq!(names, ["Alert", "HozoAlert"]);
        let alert = &summary.components[0];
        assert_eq!(alert.props.len(), 1, "only `tone` decides the classes");
        assert_eq!(alert.props[0].values, ["accent", "danger", "neutral"]);
        let classes = |tone: &str| {
            alert
                .variants
                .iter()
                .find(|v| v.when == [tone])
                .map(|v| v.classes.as_str())
        };
        assert_eq!(classes("danger"), Some("px-4 text-sm text-red-700"));
        assert_eq!(classes("neutral"), Some("px-4 text-sm text-gray-700"));
        assert_eq!(alert.disabled_prop, None);
        assert!(!alert.host_states, "a View has no state to share");

        // And the same through `@hozo/patterns`' Alert, which it wears now.
        let worn = source
            .replace(
                "import { View } from '@hozo/core'",
                "import { Alert as AlertPattern } from '@hozo/patterns'",
            )
            .replace(
                "<View role={live === 'assertive' ? 'alert' : undefined}",
                "<AlertPattern live={live}",
            )
            .replace("</View>", "</AlertPattern>");
        assert_eq!(
            summarize_text_forwarding(&worn).components.len(),
            2,
            "{worn}"
        );
    }

    #[test]
    fn a_pattern_handed_its_label_and_disabled_through_the_rest_is_read() {
        // `@hozo/ui`'s Checkbox: children and `disabled` both stay in the
        // rest, so the caller's `disabled` is the one that reaches the host.
        let source = "import { Checkbox as CheckboxPattern } from '@hozo/patterns'
const box = 'ps-9 text-sm text-gray-900 disabled:text-gray-400'
export function HozoCheckbox({ className, ...rest }) {
  return <CheckboxPattern {...rest} indicator={indicator} className={className ? `${box} ${className}` : box} />
}
export { HozoCheckbox as Checkbox }";
        let summary = summarize_text_forwarding(source);
        let names: Vec<_> = summary.components.iter().map(|c| c.name.as_str()).collect();
        assert_eq!(names, ["Checkbox", "HozoCheckbox"]);
        let checkbox = &summary.components[0];
        assert_eq!(
            checkbox.variants[0].classes,
            "ps-9 text-sm text-gray-900 disabled:text-gray-400"
        );
        assert_eq!(checkbox.disabled_prop.as_deref(), Some("disabled"));
        // The pattern's pressable shares its state with the caller's Text.
        assert!(checkbox.host_states);

        // A `disabled` the component takes for itself is not the caller's.
        let kept = source.replace("{ className, ...rest }", "{ className, disabled, ...rest }");
        assert_eq!(
            summarize_text_forwarding(&kept).components[0].disabled_prop,
            None
        );
    }

    #[test]
    fn an_href_branch_with_the_same_classes_is_one_look() {
        // `@hozo/ui`'s Button since #656: the element changes with `href`,
        // the classes do not.
        let pair = |name: &str| {
            format!(
                "if (href !== undefined) return <Host {{...rest}} href={{href}} className={{cx({name}, className)}} />
    return <Host {{...rest}} className={{cx({name}, className)}} />"
            )
        };
        let source = format!(
            "import {{ cx }} from '@hozo/core'
import {{ Button as Host }} from '@hozo/primitives'
const LOUD = 'text-white'
const CALM = 'text-black'
export function B({{ tone = 'calm', className, href, ...rest }}) {{
  if (tone === 'loud') {{
    {}
  }}
  {}
}}",
            pair("LOUD"),
            pair("CALM")
        );
        let summary = summarize_text_forwarding(&source);
        let [component] = summary.components.as_slice() else {
            panic!("{summary:?}\n{source}")
        };
        let classes: Vec<_> = component
            .variants
            .iter()
            .map(|v| v.classes.as_str())
            .collect();
        assert_eq!(classes, ["text-black", "text-white"]);
        // Different classes per branch is not one look.
        let differs = source.replacen("cx(CALM, className)", "cx(LOUD, className)", 1);
        assert!(summarize_text_forwarding(&differs).components.is_empty());
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
