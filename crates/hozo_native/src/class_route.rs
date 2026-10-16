//! Compiler-only routing for class lists whose actual pattern owner supplies
//! state. The ordinary primitive path keeps its existing cheap style emission.

use hozo_ir::Primitive;

use crate::pattern;

/// A non-interactive slot can still have known form/ARIA facts. Supplying
/// them here keeps compiled opaque residuals aligned with the component's
/// candidate path, without adding an event callback or resolving too early
/// against the enclosing widget's props.
pub(super) fn residual(primitive: Primitive, class_prop: &str, expression: &str) -> String {
    pattern::constant_facts(primitive, class_prop).map_or_else(
        || format!("hozoClasses({expression})"),
        |facts| format!("hozoClasses({expression}, {facts})"),
    )
}

fn parameters(primitive: Primitive, class_prop: &str) -> String {
    let owner = pattern::interaction_slot(primitive, class_prop)
        .expect("a pattern callback needs a registered consuming owner");
    let availability = if owner.optional_owner.is_some() {
        ", interactionAvailable"
    } else {
        ""
    };
    format!(
        "{{ pressed, hovered, focused, focusVisible{availability}{} }}",
        pattern::semantic_parameters(primitive),
    )
}

pub(super) fn static_callback(primitive: Primitive, class_prop: &str, parts: &[String]) -> String {
    format!(
        "({}) => [{}]",
        parameters(primitive, class_prop),
        parts.join(", ")
    )
}

/// An entirely opaque class list can travel as a normal prop: no capture or
/// second callback is needed. In a mixed list its residuals must instead sit
/// *between* compiled resting and state styles. Forwarding them as className
/// would put them before both and reverse the established cascade.
pub(super) struct PatternClasses {
    primitive: Primitive,
    class_prop: &'static str,
    expressions: Vec<String>,
    capture: Option<String>,
    evaluation: Option<String>,
}

impl PatternClasses {
    pub fn new(
        primitive: Primitive,
        class_prop: &'static str,
        expressions: Vec<String>,
        has_compiled_styles: bool,
        source: &str,
        evaluation: Option<&hozo_ir::ClassEvaluation>,
    ) -> Option<Self> {
        if (expressions.is_empty() && evaluation.is_none())
            || pattern::interaction_slot(primitive, class_prop).is_none()
        {
            return None;
        }
        let capture = evaluation
            .map(|evaluation| evaluation.name(source))
            .or_else(|| {
                (has_compiled_styles || expressions.len() != 1).then(|| {
                    // Authored guards inside the callback must not accidentally read
                    // one of our locals. A source-wide prefix check also protects
                    // property/shorthand references without another JS parse pass.
                    let mut index = 0;
                    loop {
                        let name = format!("__hozoClassSlot{index}");
                        if !source.contains(&name) {
                            break name;
                        }
                        index += 1;
                    }
                })
            });
        Some(Self {
            primitive,
            class_prop,
            expressions,
            capture,
            evaluation: evaluation.map(|evaluation| evaluation.render(source)),
        })
    }

    pub fn residuals(&self) -> Vec<String> {
        self.capture.as_ref().map_or_else(Vec::new, |name| {
            self.expressions
                .iter()
                .enumerate()
                .map(|(index, expr)| {
                    let value = if self.evaluation.is_some() {
                        expr.clone()
                    } else {
                        format!("{name}Value{index}")
                    };
                    format!("hozoClasses({value}, {name}State)")
                })
                .collect()
        })
    }

    pub fn prop(&self, parts: &[String]) -> String {
        let Some(name) = &self.capture else {
            return format!(" {}={{{}}}", self.class_prop, self.expressions[0]);
        };
        let owner = pattern::interaction_slot(self.primitive, self.class_prop).unwrap();
        if let Some(evaluation) = &self.evaluation {
            return format!(
                " {}={{(({name}) => ({name}State) => {{ const {} = {name}State; return [{}]; }})({evaluation})}}",
                owner.style_prop,
                parameters(self.primitive, self.class_prop),
                parts.join(", "),
            );
        }
        let values = (0..self.expressions.len())
            .map(|index| format!("{name}Value{index}"))
            .collect::<Vec<_>>()
            .join(", ");
        let arguments = self
            .expressions
            .iter()
            .map(|expr| format!("({expr})"))
            .collect::<Vec<_>>()
            .join(", ");
        // The IIFE captures values during the author's render, not when the
        // owner later handles focus/hover. Only the resolver sees owner state.
        format!(
            " {}={{(({values}) => ({name}State) => {{ const {} = {name}State; return [{}]; }})({arguments})}}",
            owner.style_prop,
            parameters(self.primitive, self.class_prop),
            parts.join(", "),
        )
    }
}
