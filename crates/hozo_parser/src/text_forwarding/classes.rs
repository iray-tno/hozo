//! Class strings a component can pass to its host, read from literals,
//! lookups, maps and constants.

use std::collections::BTreeMap;

use oxc_ast::ast::{BindingPattern, CallExpression, Expression, JSXAttributeValue};
use oxc_syntax::module_record::ModuleRecord;
use oxc_syntax::operator::LogicalOperator;

use super::params::{read_comparison, Comparison, Params};

/// A class list as the source builds it, before any prop has a value.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) enum Classes {
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
    pub(super) fn normalized(self) -> Classes {
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

    pub(super) fn comparisons<'a>(&'a self, out: &mut Vec<&'a Comparison>) {
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

    pub(super) fn resolve(&self, holds: &dyn Fn(&Comparison) -> bool, out: &mut Vec<String>) {
        match self {
            Classes::Literal(text) => out.push(text.clone()),
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
pub(super) enum Named {
    Classes(Classes),
    Map(BTreeMap<String, Classes>),
}

/// What a class expression can refer to: the props, the module's imports,
/// and the constants already read, module-level and then the component's own.
pub(super) struct Scope<'a> {
    pub(super) params: &'a Params,
    pub(super) module: &'a ModuleRecord<'a>,
    pub(super) constants: &'a BTreeMap<String, Named>,
    pub(super) import_refs: &'a crate::rest::ImportReferences,
}

pub(super) fn read_classes(expr: &Expression, scope: &Scope) -> Option<Classes> {
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
        Expression::Identifier(id)
            if scope.params.prop_name(id.name.as_str()) == Some("className") =>
        {
            Some(Classes::Literal(String::new()))
        }
        // A prop/rest binding shadows a same-named module class list; it is
        // not a readable constant merely because the spellings match.
        Expression::Identifier(id) if scope.params.is_local(id.name.as_str()) => None,
        Expression::Identifier(id) => match scope.constants.get(id.name.as_str())? {
            Named::Classes(classes) => Some(classes.clone()),
            Named::Map(_) => None,
        },
        Expression::ComputedMemberExpression(member) => read_lookup(member, scope),
        Expression::ConditionalExpression(conditional) => {
            // `className ? `${own} ${className}` : own` -- the two branches
            // differ by the caller's part only, which is left out anyway.
            if matches!(conditional.test.without_parentheses(), Expression::Identifier(id) if scope.params.prop_name(id.name.as_str()) == Some("className"))
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
pub(super) fn read_lookup(
    member: &oxc_ast::ast::ComputedMemberExpression,
    scope: &Scope,
) -> Option<Classes> {
    let (Expression::Identifier(map), Expression::Identifier(prop)) = (
        member.object.without_parentheses(),
        member.expression.get_inner_expression(),
    ) else {
        return None;
    };
    if scope.params.is_local(map.name.as_str()) {
        return None;
    }
    let Named::Map(entries) = scope.constants.get(map.name.as_str())? else {
        return None;
    };
    let prop = scope.params.prop_name(prop.name.as_str())?;
    let mut classes = Classes::Literal(String::new());
    for (key, value) in entries.iter().rev() {
        classes = Classes::Choice {
            when: Comparison {
                prop: prop.to_string(),
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
pub(super) fn read_map(expr: &Expression, scope: &Scope) -> Option<BTreeMap<String, Classes>> {
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
pub(super) fn read_constants(
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

pub(super) fn read_class_name(value: &JSXAttributeValue, scope: &Scope) -> Option<Classes> {
    match value {
        JSXAttributeValue::StringLiteral(lit) => Some(Classes::Literal(lit.value.to_string())),
        JSXAttributeValue::ExpressionContainer(container) => {
            read_classes(container.expression.as_expression()?, scope)
        }
        _ => None,
    }
}

pub(super) fn read_join(call: &CallExpression, scope: &Scope) -> Option<Classes> {
    let Expression::Identifier(callee) = &call.callee else {
        return None;
    };
    let import = scope.import_refs.get(&callee.span.start)?;
    let entry = scope
        .module
        .import_entries
        .iter()
        .find(|entry| entry.local_name.span.start == *import)?;
    // A source-only manifest has no resolved merger entry. Its forwarding
    // contract can use a join, but cannot assume any conflict table.
    crate::dynamic_class::helper_import(entry, &[])?;
    let mut parts = Vec::new();
    for argument in &call.arguments {
        // A spread argument hides what is joined.
        parts.push(read_classes(argument.as_expression()?, scope)?);
    }
    Some(Classes::Join(parts))
}
