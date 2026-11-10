# Native filter functions across active conditions

Part of #1230 and RFC 010's register-composition boundary. No owner admission,
audit promotion, text-inheritance default or class-order policy changes.

## Failure and repair

`blur-sm md:blur-lg hover:sepia` used to produce `blur(8px) sepia(100%)`
while hovered at md. Copying the base into every condition preserved the
base blur, but let the hover object's copy overwrite the active 16px blur.
Without a base, `md:blur-lg hover:sepia` lost the blur entirely.

The Native backend now emits filter-slot metadata beside the actual style
objects when two conditions write different function sets. Each selected
object updates only its own slots; a generated-code leaf joins them into
RN's single `filter` string. Slot numbers and values come from the compiler's
IR function order, not a runtime class parser or a second ordering table.
The existing condition guards decide which objects participate.

Base folding is skipped for filters at these boundaries. Shadow and gradient
folding is unchanged. The metadata stays outside RN style objects.

The helper preserves object identity so the same styles can also participate
in transform composition. A caller-supplied RN `filter` still overrides the
whole property. Compiled resets retain their registers for a later function
write, just as CSS does. No React context or subscription is introduced.

## Receipts

- `packages/compiler/src/conditional-filter-slots.test.ts` executes emitted
  Native expressions across md/hover states, reverses authored classes,
  restores inactive conditions, checks reset revival, caller precedence and
  simultaneous transform composition. Replacing the helper with an identity
  function loses a function and fails the equality assertion.
- `packages/tailwind/src/native-filter-slots.test.ts` derives eight function
  writers and their reader order from the installed Tailwind engine, then
  compares the actual Native chain under two active conditions in both class
  orders. This is declaration-level evidence, not device pixel evidence.
- `packages/engine/src/filter-slots.test.ts` covers frozen objects, nesting,
  resets, authored chains, unknown caller overrides and preindexed metadata
  that cannot be iterated. Project-map-sized work is not needed to resolve
  selected styles.
- The existing conditional filter/shadow/gradient expression tests still pass.

## Cost and limits

CPU 1, Idle, serial, Node 25 debug-addon measurement: the new leaf bundles to
559 minified bytes / 350 gzip bytes with esbuild. It is imported only at a
split filter boundary. `p-4`, `blur-sm sepia` and `blur-sm md:blur-lg` retain
their direct style-array path and do not import it.

For `blur-sm md:blur-lg hover:sepia`, emitted JSX is 396 bytes and style
declarations are 138 bytes. A warmed 50,000-call helper loop over three
selected styles and their three metadata entries took 97.36ms (checksum
200,000). This includes per-call metadata indexing, not rendering, Yoga,
device filters, frame time or an application performance claim.

Drop-shadow size/colour composition and filter animation endpoints remain
on their existing paths. A later layer adds
[Native candidate-map function composition](native-candidate-filter-slots.md).
This static layer does not certify
mixed static/dynamic chains, shadow/gradient register composition or Native
platform support beyond the functions already accepted by Hozo. The helper
understands authored IR chains; it does not make unsupported arbitrary
Tailwind filter syntax newly supported.
