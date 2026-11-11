# Native mixed filter slots

At a non-animated, spread-free View or Pressable root, the generated filter
composer reads both compiled and selected runtime slots in the existing
static resting → candidate → static owner-state order. It runs before authored
RN styles, preserving whole-property overrides and opaque registered style IDs.
Selected unassessed filters (such as drop-shadow) retain whole-property
replacement across the class chain, rather than producing a partial result.

`node --test --test-concurrency=1 packages/compiler/src/native-mixed-effect-slots.test.ts packages/compiler/src/candidate-filters.test.ts packages/compiler/src/conditional-filter-slots.test.ts packages/engine/src/filter-slots.test.ts`
checks the generated JSX and candidate data. It exercises a single-function
map, independent functions and transform axes on the same element, owner
reset/release, authored precedence and the unassessed drop-shadow fallback.
Omitting deferral in the negative control loses the static function.

Single-function namespaces emit an identity table but still install no filter
composer. Filter-free namespaces emit neither. There are no new subscriptions
or runtime parsing. This is a style-output check, not a device-pixel or
performance measurement; backdrop, secondary owners, spreads and animation
endpoints are not assessed here.
