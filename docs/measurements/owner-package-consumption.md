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

## Real packed non-Hozo consumer boundary

The test packs `acme-frozen-styles` into a real npm tarball, checks its six-file
inventory, and installs that tarball offline into a temporary consumer. Both
operations disable lifecycle scripts; fixture lifecycle hooks and entry modules
throw if executed. The fixture is test data, not a workspace/public package or
a registry publication. The installed package includes the declared manifest,
not the checkout-only `not-packed.js` and its `p-96` token.

With the actual Metro resolver selecting its Android export, normal package
source extraction and manifest-backed consumption produce byte-identical
candidate modules and identical dynamic JSX transform output. Executing the
generated resolver produces padding 21/35 for `p-3`/`p-5` under spacing 7px,
does not resolve `p-96`, and leaves no package-source candidate record. Authored
records remain. Raw fixture files are explicit Turbo test inputs, guarded
outside Turbo; the test performs no repository install or application build.

The first Windows test timed out in the `npm.cmd` shell invocation, while a
standalone pack succeeded. Calling the pinned Node distribution's npm CLI
directly avoids that wrapper and completed pack/install without increasing the
15-second subprocess deadline. This isolates the invocation boundary, not a
claim to have diagnosed the wrapper's internal cause. The next test failure
was an over-specific assertion requiring an unused state argument in
`hozoClasses(token, ...)`; the actual View output correctly uses
`hozoClasses(token)`. The corrected assertion checks that actual output rather
than changing lowering.

Packed evidence here is Android resolver/config/transform and generated-engine
execution, not an Android device, full Metro bundle, end-user app runtime or
registry install. The two-instance iOS resolver case is tested separately above.

## Child-process lifecycle follow-up

A subsequent CPU-1/Idle local run timed out in the direct npm CLI too, with no
child output. Thus avoiding npm.cmd did not establish the cause or guarantee
startup reliability. The original 15-second timeout is retained and the timeout
is not retried or counted as a successful observation.

The fixture now awaits an asynchronous direct npm invocation with bounded
output, the test's abort signal and verbose pack failure context. The parent
event loop remains available for output, cancellation and test deadlines.
A controlled regression child emits stderr and then waits: its output triggers
abort without sleeps/retries. This exposed a real cleanup race on Windows:
promisified execFile rejects on AbortError before the child closes, and deleting
its cwd at that point failed with EPERM. The helper now waits for `close` on
both success and failure before delivering a result. The regression checks
preserved stderr and process termination before fixture cleanup.

This hardens observation and cleanup, not a claim that the unexplained original
startup timeout is proven eliminated. Offline/lifecycle-disabled pack/install
and all candidate-equivalence assertions remain mandatory, with no deadline
increase or success-until-green retry loop.
