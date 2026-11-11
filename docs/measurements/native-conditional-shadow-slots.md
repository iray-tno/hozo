# Native shadow and ring registers across conditions

Part of #1230 / RFC010. At parent `2b1373e7`, two active conditions
carried separate whole `boxShadow` values, each with a copy of the base.
For `shadow-sm md:ring-2 hover:shadow-red-500`, the hovered copy lost the
ring. Likewise an active outer reset could lose another condition's ring.

When active condition groups write different fields, their original
style objects now carry external compiler metadata. The existing ordered
selection is unchanged; the generated helper joins the five layers.
The compiler resolves colours, widths, defaults, and repaint pieces.
It no longer copies base shadow declarations into each condition on
these boundaries. A single condition, same-field replacement, and
animated endpoints keep their existing path. No runtime CSS parser,
extra subscription or owner/default change.

Two emitted-style regressions failed with the parent addon and passed
with the rebuilt one. Tests exercise both class orders, condition
on/off, shadow reset, modifier-only output, explicit caller style and
an identity-composer negative control. Engine tests preserve original
object identity, don't enumerate a prebuilt map, and don't override
opaque registered style IDs. Rust Native: 365 passed.

This is executable RN style-value evidence, not device pixels.
Candidate maps, mixed static/dynamic ownership, animation and
Web/Native colour normalization remain separate boundaries.
