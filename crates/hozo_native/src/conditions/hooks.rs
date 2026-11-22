//! The ambient React hooks a generated component subscribes to, and the
//! bindings its guards read them through.

use super::*;

/// A React hook the generated component needs in order to observe an
/// ambient condition -- one whose value is the same app-wide at any moment.
///
/// These are why `dark:` and `md:` work on Native without the reactive
/// engine Hozo doesn't ship: the value isn't per-element, so
/// `@hozo/engine` keeps one subscription for the whole app and the hook
/// only exists to re-render *this* component when it changes.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum RuntimeHook {
    Dark,
    Breakpoint(Breakpoint),
    /// Window size, for the viewport-relative sizes (`h-screen`).
    ///
    /// Unlike the other two, this one's value is *used* rather than guarded
    /// on, so it reports the numbers instead of a boolean -- and it
    /// re-renders on every window change rather than only when a breakpoint
    /// is crossed. That is the price of a size that has to track the window
    /// exactly, and it's why the breakpoints keep their coarse snapshot
    /// rather than being rebuilt on top of this.
    Viewport,
    SafeArea,
    /// One environment query, by Tailwind's name for it.
    ///
    /// Seven queries, four subscriptions: the runtime answers
    /// `motion-safe` from `motion-reduce` and `landscape` from
    /// `portrait`, so the pairs cost nothing extra.
    Environment(Environment),
    /// A width threshold that is not one of the five named breakpoints.
    ///
    /// Its own hook rather than a number handed to the bucketed one,
    /// because the buckets are the five and this is not one of them. Just
    /// as cheap, though: the hook's snapshot is the *predicate* rather
    /// than the width, so React bails out on every resize that doesn't
    /// cross the threshold -- which is the same guarantee the buckets give
    /// by rounding.
    WidthAtLeast(u32),
    /// One of Tailwind's four looping animations.
    ///
    /// Was `Spin` alone, because spin was the only one wired. The other
    /// three move only opacity and transform too, so they run on the
    /// same native driver and differ from it in nothing a separate hook
    /// would have expressed.
    Animation(hozo_ir::Animation),
    /// A project's own `@keyframes`, by its index in
    /// `RuntimeNeeds::keyframes` (decision 007, slice 3). The spec is
    /// written into the declaration there, since it is not `Copy`.
    Keyframes(usize),
}

impl RuntimeHook {
    /// The local binding the rendered JSX guards on.
    pub(crate) fn binding(&self) -> String {
        match self {
            RuntimeHook::Dark => "__hozoDark".to_string(),
            RuntimeHook::Breakpoint(bp) => format!("__hozoBp_{}", breakpoint_name(bp)),
            RuntimeHook::WidthAtLeast(px) => format!("__hozoWidth_{px}"),
            RuntimeHook::Viewport => "__hozoViewport".to_string(),
            RuntimeHook::SafeArea => "__hozoSafeArea".to_string(),
            RuntimeHook::Animation(name) => format!("__hozoAnim_{}", animation_name(*name)),
            RuntimeHook::Keyframes(index) => format!("__hozoKeyframes_{index}"),
            RuntimeHook::Environment(query) => {
                format!("__hozoEnv_{}", environment_name(*query).replace('-', "_"))
            }
        }
    }

    pub(crate) fn import(&self) -> &'static str {
        match self {
            RuntimeHook::Dark => "useHozoDark",
            RuntimeHook::Breakpoint(_) => "useHozoBreakpoint",
            RuntimeHook::Viewport => "useHozoViewport",
            RuntimeHook::SafeArea => "useHozoSafeArea",
            RuntimeHook::Animation(_) => "useHozoAnimation",
            RuntimeHook::Keyframes(_) => "useHozoKeyframes",
            RuntimeHook::Environment(_) => "useHozoEnvironment",
            RuntimeHook::WidthAtLeast(_) => "useHozoWidthAtLeast",
        }
    }

    pub(crate) fn declaration(&self) -> String {
        match self {
            RuntimeHook::Dark => format!("const {} = useHozoDark()", self.binding()),
            RuntimeHook::Breakpoint(bp) => format!(
                "const {} = useHozoBreakpoint('{}')",
                self.binding(),
                breakpoint_name(bp)
            ),
            RuntimeHook::WidthAtLeast(px) => {
                format!("const {} = useHozoWidthAtLeast({px})", self.binding())
            }
            RuntimeHook::Viewport => format!("const {} = useHozoViewport()", self.binding()),
            RuntimeHook::SafeArea => format!("const {} = useHozoSafeArea()", self.binding()),
            // Written by the caller, which holds the spec.
            RuntimeHook::Keyframes(_) => {
                unreachable!("keyframes declarations are written from RuntimeNeeds")
            }
            RuntimeHook::Animation(name) => format!(
                "const {} = useHozoAnimation('{}')",
                self.binding(),
                animation_name(*name)
            ),
            // The query goes through as Tailwind's name, the way the
            // breakpoint one does -- so the generated call reads as the
            // class it came from.
            RuntimeHook::Environment(query) => format!(
                "const {} = useHozoEnvironment('{}')",
                self.binding(),
                environment_name(*query)
            ),
        }
    }
}

/// Tailwind's own names, which `@hozo/engine`'s breakpoint table also
/// uses. Distinct from `condition_suffix`, which needs an identifier-safe
/// form (`xl2`) for the generated style key.
pub(super) fn breakpoint_name(bp: &Breakpoint) -> &'static str {
    match bp {
        Breakpoint::Sm => "sm",
        Breakpoint::Md => "md",
        Breakpoint::Lg => "lg",
        Breakpoint::Xl => "xl",
        Breakpoint::Xl2 => "2xl",
    }
}
