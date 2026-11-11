# Native shadow and ring registers in candidate maps

Part of #1230 / RFC010, following the
[conditional Native writer](native-conditional-shadow-slots.md).
Candidate resolution previously let the last whole shadow replace other
layers and discarded a colour-only candidate with no Native declaration.
Now the actual selected style objects use the same emitted shadow metadata
and generated leaf as static conditions.

Colour and inset modifiers survive as metadata-only writes. Their
build-time composition keys describe a real register conflict without
claiming a fictitious Native `boxShadow` property. The existing compiler
priority facts decide ranks; the runtime does not add a sort or class/CSS
parser. A single drawable slot or a project without shadows needs no
composer. Other selected classes in a shadow project bypass the leaf.
The gradient and shadow metadata tables share one generator.

Two generated-map cases fail on the parent addon and pass on the rebuilt
one. The actual Tailwind priority-context test compares static and dynamic
Native output in **16 cases**: both input orders times hover/focus/active
on/off. A separate context test proves colour-only collisions activate
compact ordering when only one class writes the literal Native property.
The compiler tests also check the absent-helper fast paths, no paint
from colour-only input, identity preservation across effects, and cached
unconditional results.

Fresh debug addon, isolated candidate modules (raw/gzip bytes): padding
399/236, outer-shadow-only 649/348, outer shadow plus hover colour and
focus ring 1,261/566. The first two have no helper import. The shared
helper bundles to 965 minified / 496 gzip bytes with esbuild. These are
module sizes, not an application or frame-time measurement.

These are executable style-value/priority checks, not device pixels or
complete browser equality. Mixed static/dynamic boundaries, animation,
unassessed CSS shapes and Native responsive/dark candidate admission
remain separate. No default route, owner audit or global score promotion.
