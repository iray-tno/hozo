# Web candidate shadow and ring registers

Part of #1230, extending the [conditional shadow writer](conditional-shadow-layers.md).

Dynamic shadow, inset shadow and ring constructors now read the same
five-layer declaration as split static output. Colour, ring inset and
offset candidates write only their slots: an offset alone does not paint
and a colour alone does not take ownership of `box-shadow`. This replaces
whole-shadow assembly for these candidate rules. Same-condition static
output retains its literal fast path.

The sheet registers the 12 non-inheriting shadow/ring slots once, in the
same order as the static registry. A sheet with backdrop-filter as well
registers 21 slots; padding-only sheets still register none. No browser
JavaScript is added.

Three compiler assertions fail against the parent addon and pass with
the rebuilt one. They cover the five-layer reader, writer-only
modifiers, and family deduplication. The Storybook browser fixture compares
the independent Tailwind and Hozo sheets across class and state changes,
including descendant isolation and a stylesheet-removal negative control.
Only fully transparent zero-geometry layers are omitted in that comparison.
Browser execution is remote-only.

This does not change Native, arbitrary candidate admission, the known
shadow-colour serialization difference, or mixed static/dynamic ownership.
