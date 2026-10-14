# Native pattern state styles

Static pattern class props must consume the same facts as their runtime
counterparts. A pattern is not itself a Pressable: its row, action, label
and decorative parts can have different owners. Do not enable interaction
conditions for every class slot or invent an ancestor Text context.

The Native compiler lists supported `(primitive, class prop)` pairs in
`hozo_native::pattern`. For these slots, the existing condition resolver
builds the same base, ambient and interaction style entries it builds for
primitives, including stacked and negated conditions. It does not duplicate
the candidate resolver or modality tracker.

When interaction entries exist, a private generated-code prop carries a
pure callback over `{ pressed, hovered, focused, focusVisible }`. All static
styles for that slot travel together, so a compiled unconditional style
cannot accidentally override its conditional counterpart. Ambient hooks
remain in the enclosing component's prelude, never inside the callback.
Authored `style` stays separate and is applied last by the pattern.
Unconditional-only slots retain their existing static style output.

The first supported pairs are Chip's `className` (`hozoStyle`) and
`removeClassName` (`hozoRemoveStyle`). The former receives toggle state for
a standalone toggle, or ancestor hover/press and false focus facts for a
row. The latter receives only the remove button's state. Box and string
label share their owner's evaluated style. No extra host, hook, subscription
or animation node is introduced by the compiled callback.

ColorPicker also supports `swatchClassName` (`hozoSwatchStyle`) and
`selectedSwatchClassName` (`hozoSelectedSwatchStyle`). Both read the same
radio's interaction; the selected slot is applied only while selected. Its
existing slot order remains intact and the preset's background colour still
comes last. Root, slider, thumb and hex-input slots are not swatch owners
and are not enabled by this contract.

Pagination's `itemClassName`, `currentItemClassName` and
`disabledItemClassName` consume `hozoItemStyle`, `hozoCurrentItemStyle` and
`hozoDisabledItemStyle` on the actual page control. Current/disabled select
which slot is applied, never which interaction state is observed. Box and
string label share that owner's style evaluation; the outer row and hidden
ellipsis do not consume a control callback.

CommandPalette's active-item class names the return-key target, not a
pressed or focused element. Both backends use `currentCommand` to keep it
enabled and visible; Native pointer hover selects it as Web pointer movement
does, and a new query or reopen resets that choice. Web mouse-down prevents
the option from taking input focus. This is a selection contract, not a
reason to copy input focus onto an item or its hidden shortcut.

Its `itemClassName` and `activeItemClassName` consume `hozoItemStyle` and
`hozoActiveItemStyle` for **pointer state only**. The slot registry records
this narrower capability: hover/press, supported negation and ambient stacks
reuse the existing guards, while focus/focus-visible (also stacked/negated)
remain errors. An unsupported focus predicate is not false, so negating it
must not produce an unconditional style. Shortcut, input, scrim and other
slots are not enabled by this slice. Existing runtime candidate focus
behavior is unchanged and remains a separate ownership audit; these static
callbacks do not certify or broaden it.

Selection/disabled predicates need a separate per-slot semantic contract;
this first slice does not infer internal state from authored props or remove
their existing diagnostics. Other patterns and group selectors remain
unsupported until their own owner and consuming ABI are verified.

Stepper's `stepClassName`, `completedStepClassName`, `currentStepClassName`
and `errorStepClassName` consume `hozoStepStyle`, `hozoCompletedStepStyle`,
`hozoCurrentStepStyle` and `hozoErrorStepStyle` on each actual step button.
Static interaction classes require an authored `onStepPress`; status selects
the slot, not the interaction owner. Its callback adds `interactionAvailable`:
if the handler becomes absent at runtime, only base/ambient entries apply to
the descriptive row. Availability guards the resolved predicate, including
negation and stacks, so an absent button is never interpreted as not-hovered.
Root, indicator and description slots remain outside this contract. Web marks
and descriptions are spans, not their parent's focus owner; static callbacks
do not certify the existing runtime candidate propagation to those children.
Internal disabled/current state does not yet enable semantic variants.

OtpInput's `inputClassName` is now a class slot (`inputStyle`), with
`hozoInputStyle` consuming only the real input's focus/focus-visible facts,
including supported negation and ambient stacks. No wrapper hover/press is
borrowed: those input predicates remain diagnosed. The virtual cells are Web
spans, not focus owners; `activeCellClassName` still selects the next cell
while focused but does not enable a cell's focus variants. Existing runtime
candidate propagation to cells is unchanged, not certified by this slice.

The input uses the shared tracker's `keyboard-input` policy, like static
TextInput focus styles: touch or pointer input does not remove a typing
field's visible focus. Button modality remains separate. See
[Native input state styles](../native-input-state-styles.md) for the Web
input exception and the limits of this Native policy.

Native paints the field decoration in an absolute, non-hit-testable,
accessibility-hidden View only when input styles exist. The same evaluated
style reaches the actual TextInput, while its invisible glyph/caret policy
and fixed overlay geometry remain intact. The decoration is not attenuated
by the TextInput's autofill-safe near-zero opacity. An authored inputStyle
overrides compiled look, not the field's behavior/geometry; this matches the
Web input's fixed inline overlay, transparent background and zero border.
This introduces no second field, focus owner, modality tracker or hook.

Tests must execute full Metro lowering and then drive the real Native
pattern's handlers. A JSX callback or unused StyleSheet entry alone is not
evidence. Host stand-ins establish wiring and React state, not physical
pointer delivery, accessibility focus, layout or device rendering.
