//! Planning consumes the existing parse, after forwarding, before a backend
//! loses utility/source boundaries. No source text or AST parser is needed.
use crate::ParseOutput;
pub use hozo_ir::TailwindWriteEvidence as TailwindPlanWrite;
use hozo_ir::{
    Child, Condition, Node, SourceSpan, StyleDeclaration, StyleSource, TailwindOrderContext,
    TailwindRuleBinding, TailwindUnitBindings, TailwindUnits, TailwindWritePlan,
};

pub struct TailwindRootPlan {
    pub fingerprint: String,
    pub sites: Vec<TailwindPlanSite>,
}

pub struct TailwindPlanSite {
    pub span: SourceSpan,
    pub class_prop: &'static str,
    pub write_count: usize,
    pub blocks: Vec<TailwindPlanBlock>,
}

pub struct TailwindPlanBlock {
    pub start: usize,
    pub end: usize,
    pub source: StyleSource,
    pub guarded: bool,
    pub status: &'static str,
    pub candidate: Option<String>,
    pub candidate_id: Option<u32>,
    pub rule_ids: Vec<u32>,
    pub writes: Vec<TailwindPlanWrite>,
}

/// One shared module binding, not one rebind per root/element/slot. The report
/// is build-time evidence; descriptors never enter emitted application code.
pub fn plan_module_tailwind(
    output: &mut ParseOutput,
    context: &TailwindOrderContext,
    capture: bool,
) -> Vec<TailwindRootPlan> {
    plan_module(output, context, PlanMode::PassThrough { capture })
}

/// Explicit compiler-core operation, not a new user flag or adapter default.
/// Final static/fallback namespace publication must precede installation.
pub fn order_module_tailwind(output: &mut ParseOutput, context: &TailwindOrderContext) {
    plan_module(output, context, PlanMode::Scalars);
}

#[derive(Clone, Copy)]
enum PlanMode {
    PassThrough { capture: bool },
    Scalars,
}

impl PlanMode {
    fn capture(self) -> bool {
        matches!(self, Self::PassThrough { capture: true })
    }
}

fn plan_module(
    output: &mut ParseOutput,
    context: &TailwindOrderContext,
    mode: PlanMode,
) -> Vec<TailwindRootPlan> {
    let shared = output
        .roots
        .iter()
        .find_map(|root| root.tailwind_units.clone());
    let empty = TailwindUnits::default();
    let bindings = context.bind(shared.as_deref().unwrap_or(&empty));
    let mut reports = Vec::new();
    for root in &mut output.roots {
        let mut sites = Vec::new();
        plan_node(&mut root.node, &bindings, mode, &mut sites);
        if !root.forwarded.is_empty() {
            plan_site(
                &mut root.forwarded,
                root.node.span,
                "forwarded",
                &bindings,
                mode,
                &mut sites,
            );
        }
        if mode.capture() {
            reports.push(TailwindRootPlan {
                fingerprint: context.snapshot().fingerprint.clone(),
                sites,
            });
        }
    }
    reports
}

fn plan_site(
    declarations: &mut Vec<StyleDeclaration>,
    span: SourceSpan,
    class_prop: &'static str,
    bindings: &TailwindUnitBindings<'_>,
    mode: PlanMode,
    sites: &mut Vec<TailwindPlanSite>,
) {
    let plan = TailwindWritePlan::passthrough(std::mem::take(declarations), bindings);
    if matches!(mode, PlanMode::Scalars) {
        *declarations = plan.order_scalars().into_declarations();
        return;
    }
    if !mode.capture() {
        *declarations = plan.into_declarations();
        return;
    }
    let blocks = plan
        .blocks()
        .map(|block| {
            let (status, descriptor) = match block.binding {
                Some(TailwindRuleBinding::Described(candidate)) => ("described", Some(candidate)),
                Some(TailwindRuleBinding::NotGenerated(candidate)) => {
                    ("not-generated", Some(candidate))
                }
                Some(TailwindRuleBinding::Uncollected) => ("uncollected", None),
                None => (
                    match block.source {
                        StyleSource::Unspecified => "unspecified",
                        StyleSource::Stylex(_) => "stylex",
                        _ => "missing-identity",
                    },
                    None,
                ),
            };
            TailwindPlanBlock {
                start: block.range.start,
                end: block.range.end,
                source: block.source,
                guarded: *block.condition != Condition::Always,
                status,
                candidate: block
                    .source
                    .utility()
                    .and_then(|id| bindings.units().candidate(id))
                    .map(str::to_owned),
                candidate_id: descriptor.map(|candidate| candidate.id),
                rule_ids: descriptor.map_or_else(Vec::new, |candidate| {
                    candidate.rules.iter().map(|rule| rule.id).collect()
                }),
                writes: block
                    .declarations
                    .iter()
                    .enumerate()
                    .map(|(index, declaration)| {
                        let index = block.range.start + index;
                        match descriptor {
                            Some(candidate) => bindings.context().write_evidence(
                                &candidate.candidate,
                                index,
                                &declaration.property,
                            ),
                            None => TailwindPlanWrite::unknown(index, status),
                        }
                    })
                    .collect(),
            }
        })
        .collect();
    // This is the plan's actual output consumed by both lowerers, not a
    // side analysis over a second parse or reconstructed author expression.
    *declarations = plan.into_declarations();
    sites.push(TailwindPlanSite {
        span,
        class_prop,
        write_count: declarations.len(),
        blocks,
    });
}

fn plan_node(
    node: &mut Node,
    bindings: &TailwindUnitBindings<'_>,
    mode: PlanMode,
    sites: &mut Vec<TailwindPlanSite>,
) {
    plan_site(
        &mut node.style,
        node.span,
        "className",
        bindings,
        mode,
        sites,
    );
    for slot in &mut node.props.class_slots {
        plan_site(
            &mut slot.style,
            slot.span,
            slot.slot.class_prop,
            bindings,
            mode,
            sites,
        );
    }
    for prop in &mut node.props.passthrough {
        for nested in &mut prop.nested {
            plan_node(&mut nested.node, bindings, mode, sites);
        }
    }
    for child in &mut node.children {
        match child {
            Child::Node(node) => plan_node(node, bindings, mode, sites),
            Child::Verbatim { nested, .. } => {
                for entry in nested {
                    plan_node(&mut entry.node, bindings, mode, sites);
                }
            }
            Child::Text(_) => {}
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use hozo_ir::TailwindOrderSnapshot;

    #[test]
    fn scalar_ordering_visits_real_nested_and_secondary_ir_without_touching_captured_expressions() {
        let source = r#"import {View,Text,Avatar,cx} from '@hozo/core';
            const el=<View className="p-4 p-2">
              <Avatar fallbackClassName="text-red-500 text-blue-500"/>
              <Unknown><Text className="text-red-500 text-blue-500">Nested</Text></Unknown>
              <View className={cx('p-4', check() && 'p-2')}/>
            </View>;"#;
        let mut parsed = crate::parse_tsx(source);
        let before = parsed.roots.clone();
        let mut pointers = Vec::new();
        for root in &parsed.roots {
            allocations(&root.node, &mut pointers);
        }
        let context = TailwindOrderContext::new(hozo_ir::portable_tailwind_snapshot()).unwrap();
        order_module_tailwind(&mut parsed, &context);
        let mut after = Vec::new();
        for root in &parsed.roots {
            allocations(&root.node, &mut after);
        }
        assert_eq!(after, pointers);
        assert_eq!(parsed.roots[0].node.span, before[0].node.span);
        let root = &parsed.roots[0];
        let units = root.tailwind_units.as_ref().unwrap();
        let last_name = |style: &[StyleDeclaration]| {
            units
                .candidate(style.last().unwrap().source.utility().unwrap())
                .unwrap()
        };
        assert_eq!(last_name(&root.node.style), "p-4");
        let Child::Node(avatar) = &root.node.children[0] else {
            panic!()
        };
        assert_eq!(
            last_name(&avatar.props.class_slots[0].style),
            "text-red-500"
        );
        // The parser's own full-IR equality checks below remain the ordinary
        // pass-through control; this checks the changed objects, not a report.
        assert!(root
            .node
            .style
            .iter()
            .all(|decl| matches!(decl.source, StyleSource::TailwindOrdered { .. })));
        let Child::Node(guarded) = root.node.children.last().unwrap() else {
            panic!()
        };
        let Child::Node(old_guarded) = before[0].node.children.last().unwrap() else {
            panic!()
        };
        assert_eq!(
            guarded, old_guarded,
            "captured JS guards are a complete-input barrier"
        );
    }

    #[test]
    fn portable_context_plans_existing_ir_without_a_node_callback_or_a_second_parse() {
        let mut parsed = crate::parse_tsx(
            r#"import {View,Avatar,cx} from '@hozo/core';
            const el=<View className={cx('px-2 hover:focus:p-4', ready && 'p-2')}>
              <Avatar fallbackClassName="text-blue-500"/><View className="p-3"/>
            </View>;"#,
        );
        let before = parsed.roots.clone();
        let context = TailwindOrderContext::new(hozo_ir::portable_tailwind_snapshot()).unwrap();
        let report = plan_module_tailwind(&mut parsed, &context, true);
        assert_eq!(parsed.roots[0].node, before[0].node);
        let blocks = report
            .iter()
            .flat_map(|root| &root.sites)
            .flat_map(|site| &site.blocks)
            .collect::<Vec<_>>();
        assert!(blocks
            .iter()
            .any(|block| block.candidate.as_deref() == Some("p-2")
                && block.guarded
                && block
                    .writes
                    .iter()
                    .all(|write| write.specificity == Some([0, 1, 0]))));
        assert!(blocks.iter().any(
            |block| block.candidate.as_deref() == Some("hover:focus:p-4")
                && block
                    .writes
                    .iter()
                    .all(|write| write.specificity == Some([0, 3, 0]))
        ));
        assert!(blocks.iter().any(
            |block| block.candidate.as_deref() == Some("p-3") && block.status == "uncollected"
        ));
        assert!(blocks
            .iter()
            .any(|block| block.candidate.as_deref() == Some("text-blue-500")
                && block
                    .writes
                    .iter()
                    .all(|write| write.css_property.as_deref() == Some("color"))));
    }

    fn allocations(node: &Node, out: &mut Vec<(*const StyleDeclaration, usize)>) {
        out.push((node.style.as_ptr(), node.style.capacity()));
        for slot in &node.props.class_slots {
            out.push((slot.style.as_ptr(), slot.style.capacity()));
        }
        for prop in &node.props.passthrough {
            for nested in &prop.nested {
                allocations(&nested.node, out);
            }
        }
        for child in &node.children {
            match child {
                Child::Node(node) => allocations(node, out),
                Child::Verbatim { nested, .. } => {
                    for nested in nested {
                        allocations(&nested.node, out);
                    }
                }
                Child::Text(_) => {}
            }
        }
    }

    #[test]
    fn planning_existing_ir_preserves_every_node_capture_and_allocation_with_or_without_evidence() {
        let mut parsed = crate::parse_tsx(
            r#"
import {Pressable,View,Text,Avatar,cx} from '@hozo/core';
const el=<Pressable className={cx('p-2 hover:p-4', check() && 'p-4', extra)}>
  <Avatar fallbackClassName={cx('font-bold', ready && 'text-lg', extra)}/>
  {ready && <Text className="text-lg">Nested</Text>}
  <Unknown><View className="p-2"/></Unknown>
  <View renderItem={()=> <Text className="font-bold">Prop</Text>}/>
</Pressable>;
const other=<View className="p-2"/>;
"#,
        );
        // Direct Rust callers can omit provenance for an authored write.
        // Absence must not be misreported as proof of a synthetic default.
        parsed.roots[1].node.style[0].source = StyleSource::Unspecified;
        let before = parsed.roots.clone();
        let mut pointers = Vec::new();
        for root in &parsed.roots {
            allocations(&root.node, &mut pointers);
        }
        let context = TailwindOrderContext::new(TailwindOrderSnapshot {
            schema: 1,
            policy: "tailwind-rule-signatures-v1".into(),
            tailwind_version: "test".into(),
            fingerprint: "a".repeat(64),
            stylesheets: vec![],
            candidates: vec![],
        })
        .unwrap();
        for capture in [false, true] {
            let report = plan_module_tailwind(&mut parsed, &context, capture);
            assert_eq!(report.len(), if capture { parsed.roots.len() } else { 0 });
            if capture {
                assert!(report
                    .iter()
                    .flat_map(|root| &root.sites)
                    .flat_map(|site| &site.blocks)
                    .any(|block| block.status == "unspecified"
                        && block.candidate.is_none()
                        && block.candidate_id.is_none()));
            }
            let mut after = Vec::new();
            for (root, expected) in parsed.roots.iter().zip(&before) {
                assert_eq!(root.node, expected.node);
                assert_eq!(root.forwarded, expected.forwarded);
                assert_eq!(root.hook_slot, expected.hook_slot);
                assert!(std::sync::Arc::ptr_eq(
                    root.tailwind_units.as_ref().unwrap(),
                    expected.tailwind_units.as_ref().unwrap()
                ));
                allocations(&root.node, &mut after);
            }
            assert_eq!(
                after, pointers,
                "the plan must not clone/reallocate style vectors"
            );
        }
    }
}
