# Explicit Web owner-class preparation

RFC010's Native preparation exposes its actual style carrier. The Web probe
previously rendered generated JSX to recover its class attribute. That is a
test scaffold, not an API that normal caller lowering should depend on.

The retained Web module now accepts the internal `ownerClass` request. The
existing Web renderer records the root's allocated authored class before adding
the synthetic primitive's base class. It returns `ownerClass: {className, css}`
alongside its ordinary JSX/CSS; no generated JSX is parsed or reconstructed.
The class-owned CSS excludes the renderer's own shared primitive-default prefix
but retains content/leading/keyframe globals required by that same emission.
This makes the carrier independent of synthetic View/Pressable base differences
without asking the JS caller to parse or trim CSS.
Only leaf View/Pressable class-only input is admitted. Residual strings,
unknown carried classes, expression capture, children, extra props and runtime
effects retain ordinary output plus a diagnostic, without a partial carrier.
The caller must still retain its original class input when preparation is
unassessed. This does not narrow ordinary Web compilation.

The opt-in renderer uses the same declarations, conditions, CSS writer and
prepared Tailwind context as ordinary output. The request is captured in the
retained module, available on preview and one-shot emission, and cannot become
a compiler default. Ordinary `compile()` does not request it. The class string
does not authorize replacing a real component with the preparation leaf or
installing the synthetic View's `hozo-view` defaults on its destination.
Ordinary CSS may include the established shared base rules; those are not a
new runtime dependency or a different cascade policy.

Unit gates compare ordinary/requested JSX and CSS, reject incomplete carriers,
and preserve options/theme/evidence and disposal boundaries. These are compiler
transport checks, not real DOM delivery, a complete cross-platform owner audit,
default adapter activation or a coverage percentage. The next layers must
namespace classes through the existing Web helper, preserve the original
component/class-prop binding, and deliver the resulting CSS to real browser
owners before any rollout decision.

## Shared explicit caller preparation

The existing caller planner accepts the explicit `target: 'web'` request.
Discovery, import-symbol identity, unsafe/opaque refusal, literal/shape
deduplication, exact-context consumption and disposal remain shared with Native.
Only backend carrier assessment and final handoff differ. Native assessment is
extracted unchanged and still compares the complete destination/fact metadata;
Web requires an actual class/CSS carrier with no diagnostics or runtime imports.
Every declared shape must agree before a literal is rewritten.

The Web result retains the actual component and its existing class prop, and
returns companion `css`. The adapter still owns delivering that CSS. No Native
StyleSheet, callback, synthetic host or runtime resolver is introduced on Web.
The existing `namespaceHozoClasses` helper moves to a dependency-free module
without changing its established lower-module export or copied-source edit
behavior. Explicit owner recipes use a disjoint content/CSS-derived scope:
identical literals share one rule, different recipes or themes do not collide,
and absolute checkout paths are not part of the scope. CSS selection/order
still comes exclusively from the backend and supplied Tailwind context.

Unit tests preserve directives, authored evaluation syntax and unsafe inputs,
check per-recipe namespacing, and verify exact context identity and disposal on
incomplete or failed shape emission. They are not yet browser computed-style
proof or normal adapter activation. Dynamic inputs retain their original class
carrier in either target; this step does not add mixed-expression preparation.
