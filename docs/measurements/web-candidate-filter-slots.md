# Web candidate filter functions use the static registers

Continues #1230 / RFC010 §7C after the
[Native candidate-map repair](native-candidate-filter-slots.md).

## Change and boundaries

Separate runtime classes used to write separate whole `filter` declarations.
`blur-sm sepia` consequently kept only sepia, although Tailwind joins the two
function registers. The candidate renderer now uses the existing static
register writer for ordinary filter functions as well as transform axes.
There is no new value/order table, class parser or JavaScript engine.

The transform-only helper name is replaced by `register_candidate_slots`;
static split detection, register names, values, readers and blocking rules are
shared, not copied. Non-inheriting registrations are emitted once per sheet.
The existing full registration set is reused; a padding-only sheet emits none.

Backdrop filters are not widened: Native still lacks the corresponding
runtime domain. Raw/reset/drop-shadow entries retain their existing whole
declarations. Mixed static/dynamic, drop-shadow and arbitrary whole-value
chains are not certified. This is not owner admission, default inheritance,
audit promotion or an ordering-policy change.

## Evidence

- Web Rust224 pass. The new regression checks ordinary function writers, the
  common reader, a single registration set and retained backdrop/drop-shadow/
  reset boundaries.
- Complete compiler suite520 tests:518 pass/two platform skips. The new
  candidate-register regression fails against the previous addon, which emits
  only literal filter strings, and passes after rebuilding it. Existing static
  filter/transform tests remain unchanged.
- The existing browser suite now compares independent Tailwind and Hozo
  documents over eight filter functions, reversed lists, hover/focus/stacked
  states, removal/restoration, a child's own blur and stable DOM identity.
  Actual generated Native chains are normalized as CSS values and compared to
  the same oracle. Removing exactly the candidate sheet must change the result
  and restoring it must restore the result. Browser execution is CI-only;
  syntax/format checks are not relabelled as a local browser run or Native GPU
  pixel proof.

CPU1 / Idle / serial, fresh debug addon: a `p-4` sheet is325 raw/161 gzip bytes
with no registration. `blur-sm sepia hover:grayscale` is5519/619 with one
registration set; `translate-x-2 blur-sm sepia` is5171/598 and still one set.
These are unbundled candidate CSS sizes, not an app-size or frame-time claim.
Filter composition adds no browser-side JavaScript. The shared registration
set's coarse size is recorded, not presented as free.

A [following footprint optimization](candidate-register-footprint.md) removes
unrelated registrations from candidate sheets while keeping the same registry
and full reader families. The counts above are the initial layer's receipt.
