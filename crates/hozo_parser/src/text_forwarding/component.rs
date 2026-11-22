//! Recognizing a component: its declaration, React wrappers and render
//! parameters.

use std::collections::BTreeMap;

use oxc_ast::ast::{
    ArrowFunctionBody, ArrowFunctionExpression, BindingPattern, Expression, FormalParameters,
    Statement,
};
use oxc_syntax::module_record::{ImportImportName, ModuleRecord};

use super::branches::{
    is_presence_branch, read_host, read_pair, read_return, read_switch, summarize_branches,
};
use super::classes::{read_constants, Classes, Named, Scope};
use super::params::{read_comparison, read_params, read_props, Comparison, Params};
use super::ForwardingComponent;

pub(super) struct Branch {
    pub(super) guard: Option<Comparison>,
    pub(super) host: Host,
}

#[derive(Clone)]
pub(super) struct Host {
    pub(super) classes: Classes,
    pub(super) disabled_prop: Option<String>,
    pub(super) states: bool,
}

#[derive(Clone, Copy, PartialEq, Eq)]
pub(super) enum ReactWrapper {
    Memo,
    ForwardRef,
}

/// Only module-level calls are unwrapped. Their callee must name a React
/// value import, not a same-spelled local helper or an arbitrary HOC.
pub(super) fn react_wrapper(callee: &Expression, module: &ModuleRecord) -> Option<ReactWrapper> {
    let name = match callee.without_parentheses() {
        Expression::Identifier(id) => {
            let entry = module.import_entries.iter().find(|entry| {
                !entry.is_type
                    && entry.module_request.name == "react"
                    && entry.local_name.name == id.name
            })?;
            let ImportImportName::Name(name) = &entry.import_name else {
                return None;
            };
            name.name.as_str()
        }
        Expression::StaticMemberExpression(member) => {
            let Expression::Identifier(id) = member.object.without_parentheses() else {
                return None;
            };
            let imported = module.import_entries.iter().any(|entry| {
                !entry.is_type
                    && entry.module_request.name == "react"
                    && entry.local_name.name == id.name
                    && matches!(
                        entry.import_name,
                        ImportImportName::Default(_) | ImportImportName::NamespaceObject
                    )
            });
            if !imported {
                return None;
            }
            member.property.name.as_str()
        }
        _ => return None,
    };
    match name {
        "memo" => Some(ReactWrapper::Memo),
        "forwardRef" => Some(ReactWrapper::ForwardRef),
        _ => None,
    }
}

pub(super) fn read_initializer(
    expression: &Expression,
    module: &ModuleRecord,
    import_refs: &crate::rest::ImportReferences,
    constants: &BTreeMap<String, Named>,
    wrapper: Option<ReactWrapper>,
    depth: usize,
) -> Option<ForwardingComponent> {
    match expression.without_parentheses() {
        Expression::ArrowFunctionExpression(arrow) => {
            let params = read_render_params(&arrow.params, module, constants, wrapper, None)?;
            read_arrow(arrow, &params, module, import_refs, constants)
        }
        Expression::FunctionExpression(function) if wrapper.is_some() => {
            if function.r#async || function.generator {
                return None;
            }
            let params = read_render_params(
                &function.params,
                module,
                constants,
                wrapper,
                function.id.as_ref().map(|id| id.name.as_str()),
            )?;
            read_component(
                &params,
                &function.body.as_ref()?.statements,
                module,
                import_refs,
                constants,
            )
        }
        Expression::CallExpression(call)
            if wrapper != Some(ReactWrapper::ForwardRef) && depth < 8 =>
        {
            let wrapper = react_wrapper(&call.callee, module)?;
            // React.memo takes an optional comparator. It is not executed or
            // interpreted here; it cannot be a hidden spread of arguments.
            let valid_count = match wrapper {
                ReactWrapper::Memo => matches!(call.arguments.len(), 1 | 2),
                ReactWrapper::ForwardRef => call.arguments.len() == 1,
            };
            if !valid_count
                || call
                    .arguments
                    .iter()
                    .any(|arg| arg.as_expression().is_none())
            {
                return None;
            }
            read_initializer(
                call.arguments[0].as_expression()?,
                module,
                import_refs,
                constants,
                Some(wrapper),
                depth + 1,
            )
        }
        _ => None,
    }
}

pub(super) fn read_render_params(
    parameters: &FormalParameters,
    module: &ModuleRecord,
    constants: &BTreeMap<String, Named>,
    wrapper: Option<ReactWrapper>,
    function_name: Option<&str>,
) -> Option<Params> {
    if wrapper.is_none() {
        return read_params(parameters);
    }
    if parameters.rest.is_some() {
        return None;
    }
    let (first, ref_name) = match parameters.items.as_slice() {
        [first] => (first, None),
        [first, second] if wrapper == Some(ReactWrapper::ForwardRef) => {
            let BindingPattern::BindingIdentifier(id) = &second.pattern else {
                return None;
            };
            if second.initializer.is_some() {
                return None;
            }
            (first, Some(id.name.as_str()))
        }
        _ => return None,
    };
    let params = read_props(&first.pattern)?;
    // The extra ref and a named render function introduce bindings that a
    // plain arrow did not. Refuse collisions rather than mistaking a local
    // binding for an imported host, named class list or caller className.
    if ref_name == Some("className") || function_name == Some("className") {
        return None;
    }
    let shadows = params
        .locals
        .keys()
        .map(String::as_str)
        .chain(params.rest.as_deref())
        .chain(ref_name)
        .chain(function_name)
        .any(|name| {
            constants.contains_key(name)
                || module
                    .import_entries
                    .iter()
                    .any(|entry| entry.local_name.name == name)
        });
    if shadows {
        return None;
    }
    Some(params)
}

pub(super) fn read_arrow(
    arrow: &ArrowFunctionExpression,
    params: &Params,
    module: &ModuleRecord,
    import_refs: &crate::rest::ImportReferences,
    module_constants: &BTreeMap<String, Named>,
) -> Option<ForwardingComponent> {
    if arrow.r#async {
        return None;
    }
    match &arrow.body {
        ArrowFunctionBody::FunctionBody(body) => read_component(
            params,
            &body.statements,
            module,
            import_refs,
            module_constants,
        ),
        concise => {
            let Expression::JSXElement(element) = concise.as_expression()?.without_parentheses()
            else {
                return None;
            };
            let host = read_host(
                element,
                &Scope {
                    params,
                    module,
                    import_refs,
                    constants: module_constants,
                },
            )?;
            summarize_branches(params, &[Branch { guard: None, host }])
        }
    }
}

pub(super) fn read_component(
    params: &Params,
    statements: &[Statement],
    module: &ModuleRecord,
    import_refs: &crate::rest::ImportReferences,
    module_constants: &BTreeMap<String, Named>,
) -> Option<ForwardingComponent> {
    let mut constants = module_constants.clone();
    let (last, guarded) = statements.split_last()?;
    // A terminal switch owns its fallback; one immediately before the last
    // return can use that return instead. Other switch control flow is not
    // a return-only component shape this reader understands.
    let (switch, guarded) = match last {
        Statement::SwitchStatement(switch) => (Some((&**switch, None)), guarded),
        _ => match guarded.split_last() {
            Some((Statement::SwitchStatement(switch), before)) => {
                (Some((&**switch, Some(last))), before)
            }
            _ => (None, guarded),
        },
    };
    // The fallthrough may itself be a presence pair, as the last tone is.
    let (trailing, guarded) = match guarded.split_last() {
        Some((Statement::IfStatement(branch), before))
            if switch.is_none() && is_presence_branch(branch, params) =>
        {
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
                    params,
                    module,
                    import_refs,
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
            params,
            module,
            import_refs,
            constants: &constants,
        };
        let guard = read_comparison(&branch.test, params)?;
        let host = read_return(&branch.consequent, &scope)?;
        branches.push(Branch {
            guard: Some(guard),
            host,
        });
    }
    let scope = Scope {
        params,
        module,
        import_refs,
        constants: &constants,
    };
    if let Some((switch, following)) = switch {
        branches.extend(read_switch(switch, following, &scope)?);
    } else {
        branches.push(Branch {
            guard: None,
            host: match trailing {
                Some(branch) => read_pair(branch, last, &scope)?,
                None => read_return(last, &scope)?,
            },
        });
    }
    summarize_branches(params, &branches)
}
