# Package candidate consumption: preserve one scanner and generator

The internal `withOwnerPackageCandidates` overlays a complete package
contribution set on the authored scan. Authored facts are replayed through
`exportFile`/`importFile`, not reparsed; manifest tokens become a JSON-escaped
string array for the existing Rust scanner. That scanner still decides which
tokens are recognized. This is not a second Tailwind parser or an assertion that
every declared token has a Native implementation.

The overlay is memory-only. It does not persist synthetic source facts, mutate
the authored cache or subtract manifest candidates merely because an authored
file uses the same utility statically. Only candidates are unioned; exports,
helpers, text facts and owner contracts keep their package-instance boundary.
Incomplete contributions, missing records and source-policy mismatch fail
before returning a usable overlay. Empty candidate contributions reuse the
authored cache without a copy.

The focused tests compare Web CSS and Native resolver bytes with an ordinary
dynamic-source reference using the same theme. They check static/dynamic
overlap, shared tokens, variants, important syntax, replay without authored
rescanning and no persistence. These are candidate transport/generation checks,
not broader owner audit, browser/device fidelity or a performance benchmark.

## Metro candidate-only vertical slice

`withHozoOwnerCandidates` on Metro's config entry explicitly consumes this
overlay before generating the project resolver and full lexical ordering seed.
Like `withHozoOwnerShadow`, it requires a caller-supplied, complete ready-resolver
preflight; it is not installed by normal `withHozo` or exposed as a root option.
The old assessment harness still does not consume candidates. Neither mode
installs package owner/helper/text facts. Web consumption is explicitly refused.

Generation now prepares bytes without publishing them. Config captures the
complete contribution set before asynchronous CSS/order preparation, revalidates
metadata and manifests afterwards, and compares the actual instance contents
before publishing the map, ordering sidecar and config. Changed input cannot
overwrite an existing map/state with mixed facts. Candidate consumption refuses
an unavailable CSS snapshot instead of labeling a fallback palette canonical.
Normal builds retain their existing warned fallback.

The actual Metro resolver fixture selects two versions of the same package
under Android and iOS conditions. Their manifest-only `p-2` reaches the generated
`hozoClasses` resolver as padding 14 under `--spacing: 7px`; the authored static
`p-4` and manifest/runtime `p-4` both yield 28. Tests execute the real generated
resolver with the actual engine resolver (not a hand-written style map), follow
the config's `@hozo/engine/project` resolution, run the static transform and
check the ordering transfer. Manifest-only use enables auto preflight; returning
to normal config removes the overlay without persistent synthetic records.

A generation-time manifest edit preserves the previous candidate module and
metro.json, incomplete/CSS failure publishes neither, and a successful but
unassessed subpath resolution retires pending actual upstream output. The first
subpath test attempted an undeclared export and stopped at Metro's warning
before reaching the guard; the fixture now declares that export before capture
so the test exercises the intended successful-but-unassessed resolution.

This proves explicit candidate consumption in a bounded real-resolver fixture,
not automatic Metro file-map bootstrap, a complete application graph, app/device
rendering, full manifest v2 or default promotion. Package source scanning and
legacy helper/text discovery have not been removed in this layer.

## Retire candidate extraction per actual instance, not every source analysis

The consuming path now passes its complete contribution set into `scanProject`.
For matching canonical dependency instances, manifest candidates replace the
source-candidate extraction pass. Old persistent candidate records for those
files are dropped; synthetic manifest records stay memory-only. Authored files
always retain extraction, including an authored path also admitted as package
source. Ordinary/unassessed packages and another version with the same name do
not inherit a participant's coverage. Escaping symlinked files are not covered
by the target package's manifest.

The bounded Metro fixture measures **8 package-source candidate scan calls on
the normal cold path versus 0 on the consuming path**, both when retiring old
records and with an empty source-candidate cache. It still keeps the package's
StyleX summary and exact helper-discovery results, authored/ordinary dependency
candidates, theme values and a clean return to normal config. This is a count of
one removed parsing pass, not elapsed-time or whole-build speed evidence.

Source discovery, StyleX analysis, helper discovery and the full lexical
ordering seed remain. Removing their shared source walk would erase unrelated
facts the candidate-only manifest does not replace. Likewise, the schema has no
separate `usesTailwind` fact: if its candidate union contains no recognized
utility, source extraction remains to preserve static-only auto preflight.
Empty/unrecognized manifest tests pin that behavior. The recognized-candidate
probe uses the same scanner once at startup, never a second utility parser or
per-transform manifest polling. A fresh manifest union conservatively reports
`changed`, rather than treating an authored cache hit as proof of identical
package contents.

This is a scoped F7 candidate-extraction replacement, **not** deletion of the
entire F7 source walk or F6 helper/text discovery. Default adapters and package
owner audit have not changed.
