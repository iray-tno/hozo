# Native mixed shadow/ring composition

Part of #1230 / RFC010, following the static and candidate shadow writers.
This closes the mixed root shadow/ring boundary for Native View and
Pressable without JSX spreads, raw overrides or animation endpoints.

On the parent addon, `clsx('shadow-sm', classes)` with `classes = 'ring-2'`
rendered only the ring. A dynamic colour or a static colour alone lost
its value at the boundary. Selection now retains both sides' actual
shadow identities and defers only the candidate shadow composer.
Other candidate effects still compose. The selected class order stays
resting static → runtime residual → static owner state. Authored style
is applied afterward, including opaque registered style IDs.

A namespace containing shadow fields exposes its identity table for
mixed sites even if it only has one drawable slot. That case still has
no candidate composer import. Unrelated lists and sites don't invoke
the helper; the resolver reuses the ordinary cache or lazily caches the
deferred resting result, with no new parsing, sorting or subscriptions.

Four tests fail on the parent and pass with the rebuilt addon. Tests
execute emitted View/Pressable callbacks and the actual candidate module,
including mixed directions, active/inactive state, a competing static
state colour, unrelated dynamic gradient, explicit caller priority,
opaque style IDs, and caching. This is generated-style evidence, not
device pixels or equality across opaque JSX cascade tiers.

Isolated raw/gzip module bytes: padding unchanged at 399/236; a namespace
with two outer shadow sizes adds the metadata table (649/348 to 1,073/452),
still with no helper import; a combined shadow/colour/ring module grows
from 1,261/566 to 1,332/599. These are not app or frame-time results.
