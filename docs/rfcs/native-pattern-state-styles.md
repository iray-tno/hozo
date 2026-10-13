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

Selection/disabled predicates need a separate per-slot semantic contract;
this first slice does not infer internal state from authored props or remove
their existing diagnostics. Other patterns and group selectors remain
unsupported until their own owner and consuming ABI are verified.

Tests must execute full Metro lowering and then drive the real Native
pattern's handlers. A JSX callback or unused StyleSheet entry alone is not
evidence. Host stand-ins establish wiring and React state, not physical
pointer delivery, accessibility focus, layout or device rendering.
