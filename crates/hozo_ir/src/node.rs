//! The semantic tree: an element, its children, the component enclosing
//! it, the props carried through as written, and StyleX's residue.

use super::*;

#[derive(Debug, Clone, PartialEq)]
pub struct Node {
    pub primitive: Primitive,
    pub style: Vec<StyleDeclaration>,
    pub props: PropSet,
    /// Everything between this element's tags, in source order.
    ///
    /// Ordered and total: order matters (`<Text>Hello {name}</Text>` is not
    /// `<Text>{name} Hello</Text>`), and every JSX child is represented,
    /// including the ones the compiler doesn't understand. Before
    /// 2026-08-15 this was a `Vec<Node>` holding only Hozo primitives,
    /// with a separate `text` field -- which meant an unmodeled component,
    /// an expression, or a fragment had nowhere to go and was silently
    /// deleted from the output.
    pub children: Vec<Child>,
    /// Parts of a `className` expression that couldn't be statically
    /// decomposed into `style` (proposal §7's "truly dynamic" tier) --
    /// threaded through to `@hozo/engine`'s `cx()` at render time.
    /// Populated per-leaf, not per-node: a `cn(...)` call can contribute
    /// some declarations to `style` and some entries here in the same call.
    pub class_name_fallback: Vec<ExprRef>,
    /// Class names from a static `className` that produced no style.
    ///
    /// Carried into the output rather than deleted, which is the rule the
    /// rest of this file already follows for props and children and did
    /// not follow here: an unrecognised class was simply gone. A project's
    /// own `my-card` vanished, and so did Tailwind's `group` and `peer`,
    /// which carry no styles themselves and exist to be selected against
    /// by something else.
    ///
    /// The diagnostic for an unreadable arbitrary value has always told
    /// authors "the class still reaches the DOM, so a hand-written rule
    /// for it will still apply". This is what makes that true.
    pub carried_classes: Vec<String>,
    pub span: SourceSpan,
    /// Exact authored names, not the whole element: props and child expressions
    /// can still reference RN after its surrounding tag has been lowered.
    pub opening_tag_span: SourceSpan,
    pub closing_tag_span: Option<SourceSpan>,
}

/// One thing between an element's tags.
#[derive(Debug, Clone, PartialEq)]
#[allow(clippy::large_enum_variant)]
pub enum Child {
    /// A Hozo primitive, lowered like any other element.
    Node(Node),
    /// Literal text, already trimmed of surrounding JSX whitespace.
    Text(String),
    /// Everything else that renders: a component Hozo doesn't model, an
    /// expression container (`{name}`, `{cond && <A/>}`, `{items.map(..)}`),
    /// a fragment, a child spread.
    ///
    /// Re-emitted from the original source -- the same treatment
    /// `PropSet::passthrough` and `class_name_fallback` already give the
    /// parts of a component the compiler doesn't claim to understand. Not
    /// understanding something is a reason to leave it alone, not a reason
    /// to drop it.
    ///
    /// "Doesn't understand" applies to the *expression*, not to what's
    /// inside it. A Hozo primitive nested in there is perfectly readable,
    /// so each one is lowered and spliced back into the re-emitted text at
    /// `nested` -- `{show && <Text className="p-4">hi</Text>}` compiles its
    /// `Text` exactly as a top-level one, while `show &&` stays untouched.
    Verbatim {
        source: ExprRef,
        nested: Vec<NestedNode>,
    },
}

impl Node {
    /// Root capture uses the existing slot metadata, only when present. An
    /// optional field on every Node would enlarge ordinary trees too.
    pub fn root_class_evaluation(&self) -> Option<&ClassEvaluation> {
        self.props
            .class_slots
            .iter()
            .find(|slot| slot.slot == ClassSlot::ROOT)
            .and_then(|slot| slot.evaluation.as_deref())
    }

    /// Whether anything inside this element would be lost to a role that
    /// makes its children presentational.
    ///
    /// `aria-query` records that fact per role -- see
    /// `AriaRole::children_presentational`, generated from it -- and
    /// `img` is one of the fourteen that do. So naming a drawing
    /// `role="img"` is right for a picture and wrong for anything with
    /// content of its own: every control inside stops being reachable and
    /// every word inside stops being read, in exchange for a name.
    ///
    /// Two things count, and both are structural rather than guessed. A
    /// handler means a control, and a control nobody can reach is the
    /// failure this compiler exists to avoid. Text means words the label
    /// does not contain, since a label that repeated them would not need
    /// them drawn.
    ///
    /// Deliberately not "does it have children": a path and a rectangle
    /// are what a picture is made of, and hiding them is the point.
    pub fn has_exposable_content(&self) -> bool {
        self.children.iter().any(|child| match child {
            Child::Node(node) => {
                node.primitive == Primitive::Svg(SvgElement::Text)
                    || node.props.has_handler()
                    || node.has_exposable_content()
            }
            // A carried child is something the compiler did not model, so
            // what is inside it is unknown. Unknown is not "nothing".
            Child::Verbatim { .. } => true,
            Child::Text(text) => !text.trim().is_empty(),
        })
    }
}

/// A Hozo primitive found inside a `Child::Verbatim`, with the source
/// range its lowered output replaces.
#[derive(Debug, Clone, PartialEq)]
pub struct NestedNode {
    pub span: SourceSpan,
    pub node: Node,
    /// The components between the carried expression and this element,
    /// outermost first. See `EnclosingComponent`.
    pub enclosing: Vec<EnclosingComponent>,
    /// Text styles those components hand down, from their package's
    /// manifest (#950). Empty until something resolves `enclosing`.
    pub forwarded: Vec<StyleDeclaration>,
}

/// A component the compiler does not model, written around an element it
/// does: the `Button` in `<Button tone="accent"><Text>Save</Text></Button>`.
///
/// Recorded as facts about the call site only. What the component does with
/// them is not knowable from this file; a package's manifest says, and is
/// applied after parsing (#950).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EnclosingComponent {
    /// The tag's local binding.
    pub local: String,
    pub props: Vec<EnclosingProp>,
    /// A spread may set any prop, so what the literal props say is not
    /// the whole story.
    pub spread: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EnclosingProp {
    pub name: String,
    pub value: EnclosingValue,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum EnclosingValue {
    /// `tone="accent"` or `tone={'accent'}`.
    Literal(String),
    /// `disabled`, with no value.
    True,
    /// Anything else, kept by its source range.
    Expr(ExprRef),
}

impl Child {
    /// Whether this occupies a position `:first-child` would count. CSS
    /// counts elements only, so literal text doesn't shift anything.
    ///
    /// `Verbatim` is the interesting case: it may render nothing, one
    /// element, or a hundred (`{items.map(..)}`), so a sibling after one
    /// has no compile-time position at all.
    pub fn is_element_position(&self) -> bool {
        matches!(self, Child::Node(_) | Child::Verbatim { .. })
    }
}

/// A JSX attribute Hozo doesn't model, carried through to output
/// untouched. Stored as the span of the *whole* attribute rather than a
/// name/value pair, because that one representation covers every form
/// uniformly -- `testID="row"`, `onLayout={fn}`, bare `autoFocus`, and
/// `{...rest}` (which has no name at all, so a name/value pair couldn't
/// represent it).
#[derive(Debug, Clone, PartialEq)]
pub struct PassthroughProp {
    pub span: ExprRef,
    /// The attribute's name, or `None` for a `{...spread}` whose contents
    /// are not knowable at compile time.
    ///
    /// Carried so a backend can tell whether the author already wrote a
    /// prop it was about to add. The Native backend emits semantic props
    /// like `accessibilityRole="list"` and re-emits passthrough ones after
    /// them, so a React Native file that already set the role got it
    /// twice: harmless, since JSX resolves duplicates last-wins and the
    /// author's is last, but wrong to read and noise in any snapshot of
    /// the output.
    pub name: Option<String>,
    /// The value, when it is a literal.
    ///
    /// `None` for anything the compiler cannot read at build time -- an
    /// expression, a template with a hole, a spread. Several
    /// accessibility checks are about a value rather than a presence:
    /// `aria-hidden="true"` hides a subtree and `aria-hidden="false"` does
    /// not, `tabIndex={3}` breaks the tab order and `tabIndex={0}` is how
    /// you join it. Carrying only the name meant those could not be told
    /// apart, and a check that cannot tell them apart is one that has to
    /// stay silent.
    ///
    /// A boolean shorthand (`<View hidden />`) reads as `"true"`, which is
    /// what JSX means by it.
    pub literal: Option<String>,
    /// True for `{...expr}`. Tracked separately because a spread's
    /// *position* matters: JSX resolves duplicate props last-wins, so a
    /// spread after Hozo's compiled className can silently override it at
    /// runtime (see `DiagnosticCode::UnsafePropSpreadAfterStyle`).
    pub is_spread: bool,
    /// For a spread, the props it provably does not carry: the keys taken
    /// out by name from the object pattern that bound it, as in
    /// `function Button({ href, ...rest })`. Empty when nothing is known.
    pub spread_excludes: Vec<String>,
    /// For a spread, the attributes written after it, by name.
    ///
    /// JSX lets a later prop override a spread: in `<View {...rest}
    /// testID="t">` the explicit `testID` wins. A backend that emits its
    /// modeled props before the spread has to take these keys out of the
    /// spread to keep that, or the spread's copy wins instead (#1127).
    pub later_names: Vec<String>,
    /// For a class prop the backend does not lower (a pattern's
    /// `sheetClassName`), every class list its value can be that the file
    /// spells out: literals, module constants, both arms of a ternary, a
    /// joiner's arguments. Empty for anything else. The Native backend
    /// checks the classes in them, which otherwise reached React Native's
    /// runtime resolver unexamined (#1165).
    pub class_literals: Vec<String>,
    /// Hozo primitives inside an opaque prop expression such as
    /// `renderItem={() => <View />}`.
    pub nested: Vec<NestedNode>,
}

/// The unsupported half of a partially lowered static StyleX `props()` call.
///
/// This is source-rewrite metadata rather than style IR: supported
/// declarations already became `StyleProperty`, while these property spans
/// must be handed to the official StyleX transform without also handing it
/// the supported declarations a second time.
#[derive(Debug, Clone, PartialEq)]
pub struct StylexResidual {
    pub namespace: String,
    pub arguments: Vec<StylexResidualArgument>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct StylexResidualArgument {
    /// Full object-property source spans, including each key and value.
    pub properties: Vec<ExprRef>,
    /// The condition selecting this argument, including nested array and
    /// ternary guards. Leaves remain source spans so the official StyleX
    /// transform receives the author's expression rather than a reparse.
    pub condition: Option<ConditionExpr>,
}

pub(super) fn render_stylex_condition(source: &str, condition: &ConditionExpr) -> String {
    match condition {
        ConditionExpr::Static(value) => value.to_string(),
        ConditionExpr::Ref(reference) => source
            .get(reference.0.start as usize..reference.0.end as usize)
            .unwrap_or("false")
            .to_string(),
        ConditionExpr::StateDisabled(reference) => format!(
            "({})?.disabled === true",
            &source[reference.0.start as usize..reference.0.end as usize]
        ),
        ConditionExpr::Captured(capture) => {
            format!(
                "{}[{}]",
                ClassEvaluation::binding(source, capture.plan),
                capture.index
            )
        }
        ConditionExpr::ClassConflict(conflict) => {
            let value = match &conflict.capture {
                Some(capture) => format!(
                    "{}[{}]",
                    ClassEvaluation::binding(source, capture.plan),
                    capture.index
                ),
                None => source
                    .get(conflict.reference.0.start as usize..conflict.reference.0.end as usize)
                    .unwrap_or("false")
                    .to_string(),
            };
            format!("/{}/.test({value})", conflict.pattern)
        }
        ConditionExpr::RawJs(expr) => expr.clone(),
        ConditionExpr::Not(inner) => format!("!({})", render_stylex_condition(source, inner)),
        ConditionExpr::And(left, right) => format!(
            "({}) && ({})",
            render_stylex_condition(source, left),
            render_stylex_condition(source, right)
        ),
        ConditionExpr::Or(left, right) => format!(
            "({}) || ({})",
            render_stylex_condition(source, left),
            render_stylex_condition(source, right)
        ),
    }
}

impl StylexResidual {
    /// Rebuild a StyleX call containing only the declarations Hozo left for
    /// the official transform. Inline `create` is intentionally used here:
    /// StyleX's Babel plugin hoists it, while the original mixed definition
    /// becomes unreferenced and can disappear.
    pub fn render_expression(&self, source: &str) -> String {
        let arguments = self
            .arguments
            .iter()
            .enumerate()
            .map(|(index, argument)| {
                let key = format!("__hozo{index}");
                let properties = argument
                    .properties
                    .iter()
                    .filter_map(|property| {
                        source.get(property.0.start as usize..property.0.end as usize)
                    })
                    .collect::<Vec<_>>()
                    .join(", ");
                let style = format!(
                    "{}.create({{ {key}: {{ {properties} }} }}).{key}",
                    self.namespace
                );
                argument
                    .condition
                    .as_ref()
                    .map_or(style.clone(), |condition| {
                        let condition = render_stylex_condition(source, condition);
                        format!("({condition}) && {style}")
                    })
            })
            .collect::<Vec<_>>()
            .join(", ");
        format!("{}.props({arguments})", self.namespace)
    }
}
