use super::*;
use hozo_ir::{Color, FlexShorthand, StyleProperty};
use oxc_allocator::Allocator;
use oxc_ast::ast::JSXAttributeValue;
use oxc_ast_visit::Visit;
use oxc_parser::Parser;
use oxc_span::SourceType;

/// Finds the first JSX element's `className` `ExpressionContainer` in
/// `source` and runs it through `decompose_class_name`.
fn decompose_source(source: &str) -> Decomposed {
    decompose_with_helpers(source, &[])
}

fn decompose_with_helpers(source: &str, helpers: &[ClassHelper]) -> Decomposed {
    let allocator = Allocator::default();
    let source_type = SourceType::from_extension("tsx").unwrap();
    let ret = Parser::new(&allocator, source, source_type).parse();

    struct Finder<'a, 'r> {
        module_record: &'r ModuleRecord<'a>,
        helpers: &'r [ClassHelper],
        import_refs: &'r crate::rest::ImportReferences,
        result: Option<Decomposed>,
    }
    impl<'a> Visit<'a> for Finder<'a, '_> {
        fn visit_jsx_attribute(&mut self, it: &oxc_ast::ast::JSXAttribute<'a>) {
            if self.result.is_some() {
                return;
            }
            if let Some(JSXAttributeValue::ExpressionContainer(container)) = &it.value {
                let constants = crate::rest::ConstantStrings::new();
                let units = Default::default();
                let joiners = Joiners {
                    module_record: self.module_record,
                    helpers: self.helpers,
                    import_refs: self.import_refs,
                    constants: &constants,
                    units: &units,
                };
                self.result = Some(decompose_class_name(&container.expression, &joiners));
            }
        }
    }
    let offsets = helper_import_offsets(&ret.module_record, helpers);
    let bindings = crate::rest::analyze_with_imports(&ret.program, &offsets);
    let mut finder = Finder {
        module_record: &ret.module_record,
        helpers,
        import_refs: &bindings.imports,
        result: None,
    };
    finder.visit_program(&ret.program);
    finder
        .result
        .expect("no className expression container found in source")
}

#[test]
fn decomposes_logical_and_guard() {
    let out = decompose_source(
        r#"
            import { View } from '@hozo/core'
            import { cn } from 'clsx'
            const el = <View className={cn('p-4', active && 'flex-1')} />
            "#,
    );
    assert_eq!(out.fallback.len(), 0);
    // 'p-4' -> 4 padding longhands under Always, 'flex-1' -> 1 declaration under Expr(active)
    assert_eq!(out.declarations.len(), 5);
    let flex_decl = out
        .declarations
        .iter()
        .find(|d| d.property == StyleProperty::Flex(FlexShorthand::Grow(1.0)));
    assert!(matches!(
        flex_decl.unwrap().condition,
        Condition::Expr(ConditionExpr::Ref(_))
    ));
}

#[test]
fn decomposes_ternary_into_true_and_false_branches() {
    let out = decompose_source(
        r#"
            import { View } from '@hozo/core'
            import { cn } from 'clsx'
            const el = <View className={cn(size === 'lg' ? 'p-6' : 'p-2')} />
            "#,
    );
    assert_eq!(out.fallback.len(), 0);
    assert_eq!(out.declarations.len(), 8); // 4 padding sides x 2 branches
    let has_not = out
        .declarations
        .iter()
        .any(|d| matches!(&d.condition, Condition::Expr(ConditionExpr::Not(_))));
    assert!(has_not, "the false branch should carry a Not(..) condition");
}

#[test]
fn variant_prefixed_literal_under_a_dynamic_guard_falls_back() {
    let out = decompose_source(
        r#"
            import { View } from '@hozo/core'
            import { cn } from 'clsx'
            const el = <View className={cn('p-4', active && 'hover:bg-blue-500')} />
            "#,
    );
    // 'p-4' still compiles normally (4 padding longhands, Always).
    assert_eq!(out.declarations.len(), 4);
    // The `hover:` literal can't combine with the `active &&` guard yet
    // (Condition doesn't compose a CSS pseudo-class with a JS-tracked
    // one), so it falls back rather than silently dropping either half.
    assert_eq!(out.fallback.len(), 1);
}

#[test]
fn falls_back_on_unverified_cx_import() {
    let out = decompose_source(
        r#"
            const cn = (a) => a
            import { View } from '@hozo/core'
            const el = <View className={cn('p-4', active && 'flex-1')} />
            "#,
    );
    // `cn` is locally defined here, not imported from clsx or
    // classnames, so the whole call must fall back rather than be
    // silently (mis)compiled as if it behaved like clsx.
    assert_eq!(out.declarations.len(), 0);
    assert_eq!(out.fallback.len(), 1);
}

#[test]
fn hozo_core_cx_is_recognized_as_clsx_is() {
    let source = "
import { View, cx } from '@hozo/core'
const el = <View className={cx('p-4 hover:bg-blue-500', className)} />
";
    let out = decompose_source(source);
    assert_eq!(carried(source), ["className"]);
    assert!(out
        .declarations
        .iter()
        .any(|d| d.condition != Condition::Always));
    // Renamed on import, it is still core's helper.
    let renamed = "import { cx as join } from '@hozo/core'
const el = <View className={join('p-4', className)} />";
    assert_eq!(carried(renamed), ["className"]);
    // Where it is owned, for the packages below core.
    let engine = "import { cx } from '@hozo/engine'
const el = <View className={cx('p-4', className)} />";
    assert_eq!(carried(engine), ["className"]);
}

fn helper(module: &str, name: &str) -> ClassHelper {
    ClassHelper {
        module: module.to_string(),
        name: name.to_string(),
        merge: false,
    }
}

fn merge_helper(module: &str, name: &str) -> ClassHelper {
    ClassHelper {
        module: module.to_string(),
        name: name.to_string(),
        merge: true,
    }
}

#[test]
fn a_helper_the_project_declares_is_read_as_clsx_is() {
    // shadcn/ui's `cn`, which the compiler cannot see into (#964).
    let source = "import { View } from '@hozo/core'
import { cn } from '@/lib/utils'
const el = <View className={cn('p-4 hover:bg-blue-500', className)} />";
    let carried_with = |helpers: &[ClassHelper]| -> Vec<String> {
        decompose_with_helpers(source, helpers)
            .fallback
            .iter()
            .map(|r| source[r.0.start as usize..r.0.end as usize].to_string())
            .collect()
    };
    assert_eq!(carried_with(&[helper("@/lib/utils", "cn")]), ["className"]);
    // Undeclared, or declared for another module or name, it falls back whole.
    let whole = ["cn('p-4 hover:bg-blue-500', className)"];
    assert_eq!(carried_with(&[]), whole);
    assert_eq!(carried_with(&[helper("./utils", "cn")]), whole);
    assert_eq!(carried_with(&[helper("@/lib/utils", "cx")]), whole);
}

#[test]
fn a_declared_default_export_matches_a_default_import() {
    let source = "import { View } from '@hozo/core'
import join from './join'
const el = <View className={join('p-4', className)} />";
    let out = decompose_with_helpers(source, &[helper("./join", "default")]);
    assert_eq!(out.fallback.len(), 1);
    assert!(!out.declarations.is_empty());
}

#[test]
fn another_import_from_hozo_core_is_not_a_cx() {
    // A component imported from core, called like a function, is not
    // trusted to join classes just because of where it came from.
    let source = "import { View, Text } from '@hozo/core'
const el = <View className={Text('p-4', className)} />";
    assert_eq!(carried(source), ["Text('p-4', className)"]);
}

#[test]
fn falls_back_on_opaque_class_name() {
    let out = decompose_source(
        r#"
            import { View } from '@hozo/core'
            const el = <View className={classNameFromProps} />
            "#,
    );
    assert_eq!(out.declarations.len(), 0);
    assert_eq!(out.fallback.len(), 1);
}

#[test]
fn parses_color_token() {
    let out = decompose_source(
        r#"
            import { View } from '@hozo/core'
            import { cn } from 'clsx'
            const el = <View className={cn('bg-blue-500')} />
            "#,
    );
    assert_eq!(out.declarations.len(), 1);
    let declaration = &out.declarations[0];
    assert_eq!(
        declaration.property,
        StyleProperty::BackgroundColor(Color::Token("blue-500".to_string()))
    );
    assert_eq!(declaration.condition, Condition::Always);
    assert!(declaration.source.utility().is_some());
    assert_eq!(
        declaration.source.input(),
        hozo_ir::StyleSource::Tailwind(0)
    );
}

/// The source text of everything this decomposition gave up on.
fn carried(source: &str) -> Vec<String> {
    decompose_source(source)
        .fallback
        .iter()
        .map(|expr_ref| source[expr_ref.0.start as usize..expr_ref.0.end as usize].to_string())
        .collect()
}

fn wrap(expression: &str) -> String {
    format!(
        "
import {{ View }} from '@hozo/core'
import cn from 'clsx'
const el = <View className={{{expression}}} />
"
    )
}

#[test]
fn a_class_it_cannot_compile_is_carried_rather_than_deleted() {
    // The static path learned this when `group` and `peer` turned out
    // to be vanishing from it. This path kept the `continue`, so a
    // project's own class written under a condition was deleted and
    // nothing said so.
    assert_eq!(
        carried(&wrap("cond ? 'my-card' : 'p-8'")),
        ["cond ? 'my-card' : 'p-8'"]
    );
    assert_eq!(
        carried(&wrap("cn('p-4', 'aria-[sort=ascending]:p-4')")),
        ["'aria-[sort=ascending]:p-4'"]
    );
}

#[test]
fn what_is_carried_keeps_the_condition_around_it() {
    // The reason the whole guarded expression goes back rather than the
    // literal inside it. Carrying `'my-card'` alone would put the class
    // on the element unconditionally -- a different wrong answer from
    // deleting it, and not a better one.
    assert!(carried(&wrap("cond ? 'my-card' : 'p-8'"))[0].starts_with("cond ?"));
    assert!(carried(&wrap("cond && 'my-card'"))[0].starts_with("cond &&"));
    // Including the guard that is not the nearest one. An inner ternary
    // re-emitted alone applies whenever *it* holds, whether or not the
    // outer test did.
    assert_eq!(
        carried(&wrap("a ? (b ? 'my-card' : 'p-4') : 'p-8'")),
        ["a ? (b ? 'my-card' : 'p-4') : 'p-8'"],
    );
}

#[test]
fn one_expression_is_carried_once() {
    // Both branches fail, and they are one expression.
    assert_eq!(carried(&wrap("cond ? 'my-card' : 'other-card'")).len(), 1);
    // Two failing tokens in one literal, likewise.
    assert_eq!(carried(&wrap("cn('my-card other-card')")).len(), 1);
}

#[test]
fn a_variant_tailwind_defines_and_hozo_does_not_is_named() {
    let out = decompose_source(&wrap("cn('aria-[sort=ascending]:p-4')"));
    assert_eq!(out.unsupported_variants.len(), 1);
    assert_eq!(out.unsupported_variants[0].variant, "aria");
    // A project's own class is not a gap in Hozo, so it gets carried
    // without being reported.
    assert!(decompose_source(&wrap("cn('my-card')"))
        .unsupported_variants
        .is_empty());
}

#[test]
fn a_class_that_compiles_is_still_compiled_away() {
    // The carry is for what fails. Everything that worked before has to
    // keep producing no fallback at all, or this fix would have turned
    // every dynamic className into a runtime string.
    assert!(carried(&wrap("cond ? 'p-4' : 'p-8'")).is_empty());
    assert!(carried(&wrap("cn('p-4', 'bg-blue-500')")).is_empty());
}

// #874: a template literal, the merge written without a helper.

#[test]
fn a_template_compiles_its_text_and_carries_only_what_it_cannot_read() {
    let source = wrap("`p-4 hover:bg-blue-500 ${className}`");
    let out = decompose_source(&source);
    assert_eq!(carried(&source), ["className"]);
    // padding's four sides, and the hover background with its own condition.
    assert_eq!(out.declarations.len(), 5, "{:?}", out.declarations);
    assert!(out
        .declarations
        .iter()
        .any(|d| d.condition != Condition::Always));
}

#[test]
fn an_interpolation_decomposes_as_any_other_part() {
    let source = wrap("`p-4 ${big ? 'px-8' : 'px-2'}`");
    let out = decompose_source(&source);
    assert!(out.fallback.is_empty(), "{:?}", carried(&source));
    let has_not = out
        .declarations
        .iter()
        .any(|d| matches!(&d.condition, Condition::Expr(ConditionExpr::Not(_))));
    assert!(has_not, "the ternary's false branch keeps its guard");
}

#[test]
fn a_class_assembled_across_text_and_interpolation_falls_back_whole() {
    assert_eq!(carried(&wrap("`bg-${tone}-500`")), ["`bg-${tone}-500`"]);
    assert_eq!(carried(&wrap("`p-4 ${a}${b}`")), ["`p-4 ${a}${b}`"]);
    assert_eq!(carried(&wrap("`p-4${extra}`")), ["`p-4${extra}`"]);
}

#[test]
fn a_template_whose_text_holds_a_class_hozo_cannot_compile_falls_back_whole() {
    // A string literal is carried as written; a template's text alone is
    // not an expression, so the template goes as a whole.
    assert_eq!(carried(&wrap("`p-4 my-card ${x}`")), ["`p-4 my-card ${x}`"]);
}

#[test]
fn a_template_inside_clsx_decomposes_too() {
    let source = wrap("cn(`p-4 ${className}`, 'bg-blue-500')");
    assert_eq!(carried(&source), ["className"]);
}

#[test]
fn only_surviving_tokens_suppress_earlier_tokens_under_each_guard() {
    fn holds(expr: &ConditionExpr, source: &str, a: bool, b: bool) -> bool {
        match expr {
            ConditionExpr::Ref(reference) => {
                match &source[reference.0.start as usize..reference.0.end as usize] {
                    "a" => a,
                    "b" => b,
                    other => panic!("unexpected predicate {other}"),
                }
            }
            ConditionExpr::Not(inner) => !holds(inner, source, a, b),
            ConditionExpr::And(left, right) => {
                holds(left, source, a, b) && holds(right, source, a, b)
            }
            ConditionExpr::Or(left, right) => {
                holds(left, source, a, b) || holds(right, source, a, b)
            }
            other => panic!("unexpected guard {other:?}"),
        }
    }
    fn applies(condition: &Condition, source: &str, a: bool, b: bool) -> bool {
        match condition {
            Condition::Always => true,
            Condition::Expr(expr) => holds(expr, source, a, b),
            Condition::All(items) => items.iter().all(|item| applies(item, source, a, b)),
            other => panic!("unexpected condition {other:?}"),
        }
    }
    for (expression, left_nested) in [
        (
            "twMerge('overflow-x-auto', a && 'overflow-hidden', b && 'line-clamp-2')",
            false,
        ),
        (
            "twMerge('overflow-x-auto', twMerge(a && 'overflow-hidden', b && 'line-clamp-2'))",
            false,
        ),
        (
            "twMerge(twMerge('overflow-x-auto', a && 'overflow-hidden'), b && 'line-clamp-2')",
            true,
        ),
    ] {
        let source = format!("import {{ View }} from '@hozo/core'; import {{ twMerge }} from 'tailwind-merge'; const el = <View className={{{expression}}} />");
        let decomposed =
            decompose_with_helpers(&source, &[merge_helper("tailwind-merge", "twMerge")]);
        assert!(decomposed.fallback.is_empty());
        for a in [false, true] {
            for b in [false, true] {
                let actual: std::collections::BTreeSet<_> = decomposed
                    .declarations
                    .iter()
                    .zip(&decomposed.declaration_tokens)
                    .filter(|(decl, _)| applies(&decl.condition, &source, a, b))
                    .map(|(_, token)| token.as_ref().unwrap().class_group_id.as_str())
                    .collect();
                let mut expected = std::collections::BTreeSet::new();
                if !a || (b && !left_nested) {
                    expected.insert("overflow-x");
                }
                if a && !b {
                    expected.insert("overflow");
                }
                if b {
                    expected.insert("line-clamp");
                }
                assert_eq!(actual, expected, "{expression}, a={a}, b={b}");
            }
        }
    }
}

#[test]
fn tw_merge_resolves_known_conflicts_and_keeps_opaque_calls() {
    let static_override = decompose_with_helpers(
        r#"
            import { View } from '@hozo/core'
            import { twMerge } from 'tailwind-merge'
            const el = <View className={twMerge('px-3 py-1', 'px-2')} />
            "#,
        &[merge_helper("tailwind-merge", "twMerge")],
    );
    assert!(static_override.fallback.is_empty());
    // py-1 (2 decls) + px-2 (2 decls) = 4 decls; px-3 was dropped.
    assert_eq!(static_override.declarations.len(), 4);

    let cond_override = decompose_with_helpers(
        r#"
            import { View } from '@hozo/core'
            import { twMerge } from 'tailwind-merge'
            const el = <View className={twMerge('px-3', active && 'px-2')} />
            "#,
        &[merge_helper("tailwind-merge", "twMerge")],
    );
    assert!(cond_override.fallback.is_empty());
    assert_eq!(cond_override.declarations.len(), 4);
    assert!(cond_override
        .declarations
        .iter()
        .any(|d| matches!(d.condition, Condition::Expr(ConditionExpr::Not(_)))));

    let runtime_fallback = decompose_with_helpers(
        r#"
            import { View } from '@hozo/core'
            import { cn } from '@/lib/utils'
            const el = <View className={cn('px-3 hover:bg-blue-500', className)} />
            "#,
        &[merge_helper("@/lib/utils", "cn")],
    );
    assert_eq!(runtime_fallback.fallback.len(), 1);
    assert!(runtime_fallback.declarations.is_empty());
}
