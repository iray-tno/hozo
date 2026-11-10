# Candidate registration footprints come from the actual reader families

Continues #1230 / RFC010 §7C cost/deletion work above
[candidate filter composition](web-candidate-filter-slots.md).

The candidate renderer used to request all49 shared registrations whenever
any transform/filter family needed registers. A filter-only sheet consequently
carried translate, scale, shadow, gradient and backdrop declarations too.

The existing family writer now records its reader's entire register set in a
deduplicated build-time set. The candidate sheet requests only those names
from the same registry/formatter that static output uses. There is no copied
list of defaults or family classifier. Register order, syntax, inheritance
and initial values remain the registry's authority.

The whole reader family is recorded, not merely the functions written in the
candidate list: an otherwise-unset slot must not inherit from an ancestor.
For ordinary filters that means8 registrations; translate plus scale6;
translate plus filter11. Each is emitted once even if many classes use it.
Content/leading registrations retain their separate existing handling.

The old all-family request is removed from candidate generation. The full
static path remains deliberately: static shadow/gradient lowering also uses
that registry, and its selective emission needs a separate proof. The new
test executes static compilation too and pins its unchanged49 registrations.
No owner/default inheritance/ranking/admission/audit routing changes.

## Evidence and cost

CPU1 / Idle / serial, rebuilt debug addon: Web Rust224 pass. The candidate
subset regressions fail against the preceding addon (49 instead of8/11) and
pass after rebuilding. They check the actual register reader, non-inheriting
declarations, translate initial values, deduplication, absent unrelated
families and unchanged static output. Existing independent-document browser
comparisons remain CI work, not a local browser or Native pixel claim.

Same candidate inputs, before/after unbundled CSS raw/gzip bytes:

| Input | Before | After |
| --- | --- | --- |
| `p-4` | 325/161 | 325/161 |
| `blur-sm sepia hover:grayscale` | 5519/619 | 2189/350 |
| `translate-x-2 blur-sm sepia` | 5171/598 | 2105/359 |

These measurements come from the same debug-addon script and inputs on the
two layers. Native output and browser-side JavaScript are unchanged. No app
bundle-size, compilation-throughput or frame-time conclusion is drawn.
