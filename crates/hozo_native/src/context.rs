//! What rendering one element can see: the names allocated so far, the
//! runtime it needs, and what its ancestors pass down.

use hozo_ir::{Diagnostic, Node, StyleDeclaration, Theme};

use super::conditions::RuntimeHook;
use super::owner_style::{OwnerStyle, OwnerStyleInputs};
use super::structural::SiblingPosition;
use super::{OwnerCallback, StyleEntry};

/// What the generated module will need from `@hozo/engine`, accumulated
/// as the tree is walked.
///
/// Hooks and components are kept apart because only hooks constrain where
/// they may appear: a hook has to be declared once, unconditionally, in the
/// enclosing function body (`LowerOutput::prelude`), while a component is
/// just an element in the JSX. They share this struct only so that adding a
/// second kind of runtime dependency didn't mean threading a second `&mut`
/// through every rendering function.
#[derive(Default)]
pub(crate) struct RuntimeNeeds {
    pub hooks: Vec<RuntimeHook>,
    pub components: Vec<&'static str>,
    /// Tags this lowering emitted that `react-native` exports.
    ///
    /// Derived rather than listed. A tag reaching the output is one of
    /// three things and the other two are recognisable: `Primitive::Svg`
    /// comes from `react-native-svg`, and anything Hozo ships is spelled
    /// `Hozo…` -- so what is left is React Native's own. A list beside the
    /// mapping would be a second copy of it, and this repository has
    /// already paid three times for that shape.
    pub native: Vec<&'static str>,
    /// `useHozoKeyframes` arguments, one per distinct animation;
    /// `RuntimeHook::Keyframes` holds the index.
    pub keyframes: Vec<String>,
}

impl RuntimeNeeds {
    pub(crate) fn need_component(&mut self, name: &'static str) {
        if !self.components.contains(&name) {
            self.components.push(name);
        }
    }

    /// The hook for a keyframes spec, sharing one call between elements
    /// that run the same animation.
    pub(crate) fn keyframes_hook(&mut self, spec: String) -> RuntimeHook {
        let index = match self.keyframes.iter().position(|known| *known == spec) {
            Some(index) => index,
            None => {
                self.keyframes.push(spec);
                self.keyframes.len() - 1
            }
        };
        RuntimeHook::Keyframes(index)
    }

    pub(crate) fn need_native(&mut self, name: &'static str) {
        let name = name.split_once('.').map_or(name, |(root, _)| root);
        if !name.starts_with("Hozo") && !self.native.contains(&name) {
            self.native.push(name);
        }
    }
}

pub(crate) struct NameAllocator {
    pub next: u32,
}

impl NameAllocator {
    pub(crate) fn alloc(&mut self) -> String {
        let name = format!("hozo{}", self.next);
        self.next += 1;
        name
    }
}

/// Bundles compiler output and mutable state across native lowering.
pub(crate) struct NativeRenderContext<'a> {
    pub source: &'a str,
    pub theme: &'a Theme,
    pub allocator: &'a mut NameAllocator,
    pub style_entries: &'a mut Vec<StyleEntry>,
    pub diagnostics: &'a mut Vec<Diagnostic>,
    pub runtime: &'a mut RuntimeNeeds,
    /// RFC 006 experiment only; normal lowering never enables it. The
    /// resulting owner styles require the private contextual test hosts.
    pub text_reference: bool,
    /// Decision 013: forwarding stays compiled; only what the build cannot
    /// see reads the inheritance protocol at run time.
    pub text_unified: bool,
    /// How many text hosts enclose the element being rendered. React Native
    /// inherits inside a Text, so only an element at depth 0 is outermost.
    pub text_depth: usize,
    /// Only the explicit RFC010 preparation request observes this carrier.
    pub owner_style: Option<&'a mut Option<OwnerStyle>>,
    pub owner_inputs: OwnerStyleInputs<'a>,
    pub source_evidence: bool,
    /// See `LowerOutput::owner_callbacks`.
    pub owner_callbacks: &'a mut Vec<OwnerCallback>,
    /// See `LowerOutput::runtime_states`.
    pub runtime_states: &'a mut Vec<OwnerCallback>,
}

/// Nearest enclosing same-component `.group` ancestor, carried down so
/// `group-aria-*`, `group-disabled`, `group-enabled`, `group-rtl`/`group-ltr`,
/// `group-first`/`last`/`odd`/`even`/`only`/`nth-*`, and `group-read-only` /
/// `group-placeholder-shown` can resolve from the ancestor's own props and
/// compile-time sibling position without adding a runtime wrapper.
#[derive(Clone, Copy)]
pub(crate) struct GroupAncestor<'a> {
    pub node: &'a Node,
    pub position: SiblingPosition,
}

/// Context passed down from an ancestor to lower layout, text, and tree properties.
#[derive(Clone, Copy)]
pub(crate) struct AncestorContext<'a> {
    pub inherited: &'a [StyleDeclaration],
    pub parent_font_size: Option<f64>,
    pub parent_size_opaque: bool,
    pub in_dynamic_ruby: bool,
    pub from_ancestor: FromAncestor<'a>,
    pub grid_columns: Option<usize>,
    pub grid_rows: Option<usize>,
    /// True when the direct parent element in the same component measures its
    /// layout box via `HozoMeasuredParent` and provides `HozoParentSizeContext`.
    pub parent_measured: bool,
    pub group_ancestor: Option<GroupAncestor<'a>>,
}

/// Declarations an ancestor handed down through `*:` or `**:`.
///
/// React Native has no selector, so a style written on the parent has to
/// arrive at the child as the child's own. The compiler is looking at the
/// children this would style, which is what makes that possible -- the
/// same trade `first:` and `odd:` already make.
///
/// Two lists because the two variants stop at different depths, and
/// nothing else in this backend needed that distinction: `inherited`
/// carries text properties to every descendant and is re-derived at each
/// level, which is `**:` behaviour and not `*:` behaviour.
#[derive(Clone, Copy, Default)]
pub(crate) struct FromAncestor<'a> {
    /// The parent's `*:`. Applied here, not passed on.
    pub direct: &'a [StyleDeclaration],
    /// An ancestor's `**:`. Applied here and passed on.
    pub all: &'a [StyleDeclaration],
    /// Whether this element is inside a `Skeleton`. Web's reduced-motion
    /// rule matches `[data-hozo-skeleton] *`, so a spinner drawn inside a
    /// placeholder stops with it; this carries the same guard down to
    /// every descendant the compiler renders. What it cannot reach is a
    /// child it does not read -- a component or an expression renders
    /// whatever it renders, and its animations are its own.
    pub in_skeleton: bool,
}
