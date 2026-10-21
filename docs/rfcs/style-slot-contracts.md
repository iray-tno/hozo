# Style-slot contracts

Tracking: [#987](https://github.com/iray-tno/hozo/issues/987). Follow-up to #909
and #985; these are successive slices, not a completed parity certification.

## Resolution and ownership are independent

There are two resolution engines, AOT and the candidate-runtime resolver.
Mixed expressions use both. A literal `hover:*` utility has statically known
style data but a runtime predicate; it is not an opaque dynamic class string.
The owner supplying that predicate is a separate contract.

Root `className` and named secondary class props must eventually share one
plan for static, dynamic and mixed input. Neither should resolve an opaque
string before its actual owner can supply state. Authored expressions must
not be moved inside event callbacks or evaluated more often than before.

### Own/caller provenance is also a text-integration prerequisite

[#1152](https://github.com/iray-tno/hozo/issues/1152) exposes a composition
gap even when the runtime candidate owner is correct: retained whole ternaries
and opaque local helpers can place the component's own classes at the caller's
tier too. Root and secondary decomposition must preserve the source boundary
and [decision 009](../decisions/009-a-callers-class-sits-between-rest-and-state.md),
without re-evaluating author code or inventing provenance for an opaque string.
A known UI joiner can reuse the verified joiner contract rather than demand
general function-body analysis. Fixing one component's default classes is not
acceptance for the shared route.

[RFC 006's inheritance protocol](006-native-text-inheritance.md#composition-correctness-precedes-inheritance-correctness)
consumes the owner's resolved declarations; it does not repair their cascade.
Keep cross-platform own/caller/state/explicit-style tests at this shared layer,
and test text propagation separately against their independent expected result.
An inherited value carries no parent specificity or interaction ownership.

## First slice: canonical build-time metadata

`scripts/style-slots/catalog.mjs` inventories top-level class props of every
exported `@hozo/patterns` component on Web and Native. Public types are the
independent denominator, checked through the installed TypeScript CLI. A new
component/prop absent from the catalog, a spurious catalog prop, a missing
Native style prop or a missing private callback declaration fails the check.
Nested data/indicator callback class lists are not top-level component props
and are not covered by that inventory yet.

The catalog generates the IR's secondary class/style mapping, the Native
compiler's existing owner/semantic/callback ABI tables, and Native semantic
fact types. Components calculate their own facts using existing events and
shape, with type-only imports and `satisfies` checks. This does not move state
machines into the compiler or use RN announcements as Web CSS attributes.

Known true, known false and unavailable are different: boolean profile entries
are constants; alias entries are supplied by the actual owner; omitted facts
are unavailable. Constant truth must survive negation. Missing event owners
must not become false and then unconditional through negation.

Owner identity, application gate and composition annotations make the intended
boundary explicit, but do not generate behavior in this first slice. Entries
marked `pending-audit` are inventory, not evidence that stateful classes work.
ColorPicker's eyedropper is explicitly unused on Native, not silently claimed
supported. Callback type declarations do not prove runtime consumption; the
existing lifecycle/mutation tests still provide that separate evidence.

Run `node scripts/style-slots/generate.mjs` after editing the catalog. The
generated-file and actual public-prop checks run outside Turbo's test cache in
`scripts/style-slots.test.mjs`, included by root `test:publishing`. Generated
metadata is checked in and requires no JS generator to compile a Rust crate.

`node scripts/style-slots/measure.mjs --benchmark > artifacts/slots-before.json`
captures browser-free codegen/runtime-JS evidence and optional timings. After
rebuilding the other revision with the same fixture/catalog, pass
`--baseline=artifacts/slots-before.json` and redirect to a different file.
The output comparison is exact; timings are descriptive, not a flaky CI gate.

## Next slices

1. The first routing increment shares pattern callback emission and opaque
   class forwarding between root and secondary slots. Chip's dynamic root
   now reaches its actual owner, like its secondary removal class. A mixed
   root captures opaque residual values once during the author's render and
   resolves them with owner facts between AOT resting and state styles.
   Entirely opaque lists keep direct prop forwarding; static lists keep the
   existing callbacks. No Native component JS or primitive fast path changes.
   The next increment shares the root expression decomposer with secondary
   slots. Literal expressions, recognized joiners (including project helpers)
   and separated templates keep AOT pieces and carry residual source spans in
   `SlotStyle`. Fully opaque input keeps its zero-capture forwarding path.
   Secondary expressions with authored JS conditions now use a source-ordered
   capture plan where the shared decomposition's guards/residuals do not
   overlap. Its emitted value array retains branch selection and ordering;
   callbacks read captured predicates, never re-run author code on events.
   Inputs remain outside the generated closure, preserving `await`, `yield`,
   `this` and `arguments`. Web guard classes go to the slot owner, not the
   widget root, and false-only branches cannot leave truthy internal markers.
   Overlapping guarded fallbacks, spread iteration and guarded template
   coercions still travel **whole** rather than evaluating a guard twice or
   changing which side effects run.
   Root authored predicates now use that same plan where the entire rendered
   subtree can be safely enclosed. Inherited Text declarations and forwarded
   label callbacks read the same immutable capture; each `map` element gets
   its own binding. No provider, host or fragment is inserted. The parser
   stores the root plan in the existing slot metadata only when needed, not
   in an optional field enlarging every ordinary Node. Scope is a property
   of the shared plan, rather than a second expression-analysis engine.
   The parser records whether a JSX child/attribute replacement needs braces, including
   roots beneath an unknown component. Backend source-copy evidence shifts
   with the generated prefix instead of being rediscovered by a text search.
   Class inputs remain outside the arrow, preserving their lexical suspension.
   An evaluated prop/spread before className, or await/yield/direct eval in
   the JSX being moved, keeps the legacy root AOT/residual path. Nested
   functions retain their own scope. Overlapping guarded fallbacks also stay
   legacy on root; single evaluation is **not** newly certified on those
   excluded routes. Literal/opaque/unguarded root fast paths are unchanged.
   Existing label reach and unsupported Native conditions are not broadened
   merely by enclosing a capture correctly.
   Secondary Web CSS asks the real DOM child about disabled/enabled, including
   stacking and negation; it does not expect a marker on the widget root.

   The mixed-ternary increment for #1152 separates guarded templates when
   every interpolation is wholly compiled or wholly opaque. An emitted
   capture preserves branch selection and string conversion immediately
   after each opaque expression (including hint-string conversion and Symbol
   errors), before evaluating the next one. Only opaque strings reach the
   candidate tier; compiled pieces do not re-enter it beside the caller.
   Root/secondary slots share that plan. Partial literals, nested partial
   template expressions and unsafe root lexical boundaries retain their
   existing route and diagnostics. UI's local joiners and function-local
   opaque class selections are separate follow-ups, not fixed by this step.

   OTP and Stepper now use the trusted `cx` helper on their thirteen root
   and secondary slots. Their own literals compile below the caller tier;
   only caller strings reach the candidate resolver. ColorPicker initially
   exposed a missing thumb focus owner rather than a safe helper-only
   migration. #1169 connects that slot to each actual adjustable Slider
   View's non-touch focus/blur, using the shared interaction hook and one
   snapshot for its runtime resolver and generated callback. The track's
   pointer hit testing/PanResponder are unchanged; pointer conditions remain
   unavailable, not false. `aria-disabled` describes the slider div, not
   form `disabled`/`enabled`. Like the Web div, changing `aria-disabled`
   does not itself invent blur; actual host focus/blur owns those facts.
   Its six Native-owned slots now compile their resting classes via `cx`.
   EyeDropper remains a Web-only passthrough; this is not a claim that its
   own/caller boundary or every unmodelled widget has been fixed.

   Card's flat choice and Stack's direction/gap/alignment choices now live
   directly in `cx` arguments as finite conditionals. No function interpreter
   is added: the shared decomposer already understands those choices. The
   browser/Native regression covers both Card branches, all 32 Stack
   combinations and defaults, with absent, empty and conflicting caller
   classes. Generated static declarations grow rather than re-resolving
   the component's own strings at render time. Custom `--shadow-*` scales
   are still outside the current theme-loader payload; this slice preserves
   Card's authored flat selection and old resolver behaviour, not new
   custom-shadow coverage.

   Avatar's size and status choices are likewise finite `cx` arguments;
   its root/image/status slots keep only caller strings in the residual.
   This does not generalise to every UI wrapper: Toolbar and RadioGroup,
   for example, are not modelled primitive tags in the current parser. A
   `cx` substitution alone leaves their whole wrapper unlowered. Those
   owners require a compiler boundary/slot design, not another local joiner
   or a claim that every UI component is fixed by the same substitution.

   Skeleton now declares its default corners as a compiled resting look.
   Its old `choosesCorners` string scan is removed: `md:rounded-none` must
   not erase the default below `md`. The browser regression tests default,
   full and responsive radii at 375/1024px with both stylesheet orders,
   and deliberately leaks the default candidate to verify that the oracle
   catches the original bug. Native generated-style checks cover the
   unconditional caller override; dynamic environment variants retain
   their existing Native resolver limitation. Pulse/reduced-motion ownership
   is unchanged and is not newly certified by the composition probe.
2. Audit pending owners and decorative semantics. Require literal/dynamic/
   mixed, shape changes, absent owners, explicit style overrides and status
   gates in matrix fixtures. A decorative label can inherit text styling
   without borrowing the parent's focus predicate.

   The first audited group is Stepper's five indicator/description props
   and Pagination's ellipsis. Their Web owners are non-editable spans/li,
   neither enabled nor disabled, with no selected/disabled/checked ARIA
   attributes. The catalog supplies these constant facts to AOT and to
   compiled opaque/mixed residual resolution; the actual Native components
   supply the same constants for files outside the compiler. Metadata is
   generated at build time, not looked up in a render-time registry. Compiled
   residual calls pass a small fact object during author rendering, but add
   no callbacks, hosts or subscriptions. Static-only slots need no fact
   object at runtime. Source fallbacks reuse a shared immutable object.

   Status gates and explicit style order remain component-owned. Parent text
   inheritance is independent of a child's own form/ARIA predicates. Neither
   positive nor negated pointer/focus predicates borrow surrounding events:
   this Native child has not measured them. Those unsupported diagnostics
   remain visible, including inside a modeled Pressable. This is not a claim
   that the Web child cannot itself be hovered. The existing candidate
   resolver's condition subset (in particular unsupported negation/enabled)
   is unchanged; AOT retains its broader vocabulary. Tests compare the shared
   supported subset and separately check the extra AOT predicates, rather
   than silently shrinking static coverage to the runtime intersection.

   Other pending owners are still unaudited. This six-slot group does not
   certify the remaining catalog. The separate root selector gap #993 was
   subsequently fixed by #1005, not by this six-slot Native audit.

   CommandPalette's shortcut, group heading and empty-state props reuse that
   same NonControl contract. They have distinct existence gates (a ranked
   command with shortcut content, a named ranked group, or no ranked commands),
   not three new resolver implementations. The shortcut keeps inherited option
   typography without borrowing the option's events or selected/disabled facts;
   query changes mount/remove the appropriate decorative owners. The root,
   scrim, panel, real input and list are not certified by this three-slot audit.

   Avatar's image, fallback and status props reuse NonControl too: an `img`
   and two non-editable spans, not enabled/disabled controls. Image failure
   mounts the fallback; a different src retries the image; absent status mounts
   no dot. These existence gates are independent of CSS predicates. The
   fallback retains root typography and explicit style precedence without
   borrowing a surrounding control's events. Avatar's root is still unaudited.

   The real CommandPalette search field uses OTP's existing keyboard-input
   focus policy and shared TextInput form-fact profile. While mounted on Web it
   is enabled, editable and aria-expanded; its options never lend it selected
   or pointer state. Closing resets its own focus as well as the query. Callback
   semantic parameters are generated per slot, not from the union of sibling
   owners' profiles. Source input callbacks omit unmeasured pointer keys so
   opaque/mixed candidates can still diagnose missing hover/press facts.

   ColorPicker's hex input consumes that same TextInput profile and focus
   policy, separate from its checked swatches. Disabled is read-only, not an
   aria-disabled attribute. Disabling clears stale input focus/draft even if
   editable=false delivers no Native blur; re-enabling requires a fresh focus
   event. Class/callback styles remain before explicit inputStyle. Unmodeled
   field predicates (for example aria-invalid) are not newly claimed here.

   Combobox is registered as a compiler-retained pattern too. Its wrapper and
   listbox reuse NonControl; its editable input uses the same keyboard-input
   policy with its own expanded fact; each option div owns pointer and active
   selection facts, not form-button disabled/enabled or the field's focus.
   The active filtered index is separate from the committed value. Native
   focus alone no longer opens the popup; editing/arrows open it, blur/Escape
   close it, and a disabled active option cannot commit, matching the existing
   Web contract. Arrow delivery remains platform-owned; Native inline
   autocomplete is not added by this audit. Root/list typography reaches
   labels and explicit input/option styles stay last. No runtime registry,
   provider, global listener or additional host is introduced.

   Listbox is registered too. Its wrapper reuses NonControl and its options
   share Combobox's ListOption form/ARIA profile, not its focus policy or
   selection meaning. A Listbox option owns focus and committed single/multi
   selection; a Combobox option owns active filtered highlight while focus
   stays on the input. Native disabled still blocks activation and is exposed
   to accessibility, but it does not make the Web option div match :disabled
   or :enabled. Root typography and explicit option text styles reach labels.
   The existing value/id keys preserve each option's interaction state across
   reordering. This audit adds no Native hardware keyboard navigation claim
   and does not infer unmodeled facts such as root aria-multiselectable.

   Menu reuses NonControl for its wrapper and popup panel. Its real button
   trigger owns enabled and expanded facts; its focusable action divs own
   aria-disabled, not form disabled/enabled or selected/checked state. Root
   text reaches the trigger and menu; menu text reaches string item labels,
   with explicit slot text/box styles last. The compiler keeps those semantic
   callbacks separate. The popup remains gated by the existing Web open state
   and Native Modal.visible contract; no Modal lifecycle or OS focus-return
   claim is introduced. Positional action keys and disabled activation guards
   remain unchanged. Unsupported wrapper/panel events remain unavailable.
   The browser audit exposed an independent opening-focus race: the original
   effect could focus an item while FloatingPositioner still hid its subtree.
   That existing effect now observes readiness and active index from a
   headless child, without adding a DOM host, timer or listener. Geometry-only
   updates do not refocus an item. Native Modal focus behavior is unchanged.

   Opaque/mixed secondary Web class lists identify the same real DOM owner
   as their AOT counterpart. Candidate form predicates exclude that slot
   from portable-marker rules (including the lower-priority layered copy),
   and use actual :disabled/:enabled with stacking/negation. Only form
   predicates gain an owner-specific rule; unconditional/other candidates
   keep their existing two copies. Ordinary root portable behavior stays
   unchanged. This adds a static class marker, not an event listener or
   render-time lookup. Browser oracles are isolated from the target's
   document and candidate source is scanned before requiring populated CSS.

   Every exported top-level pattern class prop needs an ownership disposition,
   but not every component needs a behavioral patch. Auditing a new owner can
   reuse a reviewed profile, record a component-managed route, or leave an
   explicit limitation. Ordinary primitive root handling is not rewritten once
   per pattern. Pending inventory entries are neither bug counts nor passing
   cases; whole-catalog completion still requires independent owner evidence.

Use actual Web DOM/Tailwind as an independent semantic oracle, and execute
generated Native output against actual component source. Stand-in hosts do
not certify device pixels, event delivery or assistive technology.

The separate `@hozo/form` source boundary is not yet a compiler-retained
slot family. Its Native Form wrapper and TextArea wrapper/field/counter now
use the existing project candidate resolver rather than accepting and
discarding their class props (#1175). The field alone owns focus/visible
focus, disabled/read-only and authored invalid/required facts. Non-editable
wrappers/counters share constant form facts without borrowing input events.
Explicit Native styles follow classes; TextArea's existing measured height
still follows its field style. Measurement now reads class-supplied line
height and padding from the same resolved field style that is drawn.

This runtime repair is not an AOT/caller-composition audit or a rollout of
the text-inheritance protocol. It adds one local interaction hook to a
TextArea, not a provider, global listener or resolver. Negated/environment
conditions and placeholder/numeric-font features retain the candidate
resolver's existing limitations and warnings. Root typography propagation
and the remaining Form controls are not certified by this slice. The
independent Web TextArea browser test establishes disabled/read-only/focus
semantics; Native host tests establish callback/style routing, not device
event delivery or pixel parity.

The next Form slice routes NativeSelect's closed-control classes through
that same candidate resolver. A shared engine partition (extracted unchanged
from patterns) moves resolved text properties to its owned value Text,
while explicit box/text styles retain precedence. The control alone tracks
events through the existing interaction hook, without a new Provider. Its
form facts follow an actual Web select: it is read-only even when enabled,
and its implicit popup state is not an authored `aria-expanded` attribute.
Native accessibility still announces its expanded state independently.
ActionSheet, presenter and fallback selection/dismissal behavior are preserved.
The subsequent Native-only popup slice resolves sheet/scrim classes
only while Hozo's own fallback is open. Sheet typography reaches its owned
row labels, with explicit box/text styles last. The trigger cannot lend
its own events or form predicates to the sheet/scrim. Unmeasured hover/focus
keys remain absent and are diagnosed on use. The following row-owner slice
resolves option classes using each Native row's actual selected/disabled
accessibility state and RN press snapshot. Sheet text precedes row text,
then explicit textStyle; explicit optionStyle follows its classes. It does
not infer row focus/hover or borrow them from the trigger, add hooks, or
change selection behavior. Disabled press snapshots cannot activate a row's
pressed look. These Native-only class facts are not assertions about an
authored ARIA attribute on the Web select's OS-owned option list.
This is the Native-only popup API, not CSS compatibility with an OS-drawn Web
option list. Unused system/presenter popup classes are neither resolved nor
warned about. No new hook, provider or host is added by the popup slice.
Neither operating-system picker drawing nor Native hardware event delivery
is established by host tests.

Calendar's group/header/grid now resolve their classes against NonControl
facts, without borrowing a month button's disabled state or events. The grid
requires one Native box around weekday headings and weeks: per-week padding
or borders cannot represent the Web table's single box. Weeks default to row
layout (explicit weekStyle wins); this is not a table/border-collapse engine.
Root typography reaches owned labels, then the relevant header or grid
typography, then explicit dayTextStyle. Custom renderDay elements remain
caller-owned: no cloning, text provider or default inheritance rollout is
implied. Day-cell class contracts remain a separate follow-up.

Each Calendar month button now resolves its own class with its actual Web
button form facts and the existing Native local interaction tracker. It owns
disabled/enabled but no authored aria-selected/aria-disabled attribute. Disabled
press/focus are cleared; hover remains an independent observation. Button
typography follows inherited root/header declarations, and explicit
monthButtonStyle follows its classes. A leaf React component scopes the two
local hooks so hover/focus/press does not rerender every day or reevaluate
renderDay. No additional Native host, provider or global listener is added.
Hardware event delivery and actual screen-reader paging remain unmeasured.

The first routing probe exposed a separate existing Web gap,
[#993](https://github.com/iray-tno/hozo/issues/993): AOT Chip `disabled:`
expected a marker the retained component does not supply. Raw-Tailwind owner
tests did not detect that pipeline gap. A root whose owner the catalog has
audited (`Primitive::root_owner_is_audited`, generated from the catalog) now
asks that element as a secondary slot does: `:disabled`, `:enabled` and
their negations, never the marker. A browser probe compares compiled Chip in
all four shapes, disabled and not, with Tailwind on the same Chip. Roots
still `pending-audit` keep the portable marker. Native explicit style is
tested separately because Web Chip does not publish a style prop.

## Performance and coverage constraints

- Keep static work AOT, including existing negated and ambient conditions.
  Do not reduce it to the runtime condition subset.
- Keep the existing candidate cache/resolver for opaque residual strings.
  Do not add an application-time metadata registry or AST interpreter.
- Add no event subscription, state machine, provider or layout host solely
  for metadata uniformity. Type-only consumer checks erase from runtime JS.
- Before/after the first refactor, compare generated JSX, styles, hooks,
  imports, diagnostics, candidate module and stripped/minified Native JS.
  Measure compilation cost separately from output identity; timing on one
  host is not a proof of universal zero regression.
- Heavy bundle/performance/browser suites remain hosted. A catalog count is
  not a compatibility percentage, and declared pending owners are not passes.
