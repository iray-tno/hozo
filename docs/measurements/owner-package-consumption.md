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

At this layer the adapters do not yet consume the overlay. The next boundary is
to install it before Metro's candidate-map freeze and check that package-only
styles reach the real generated resolver, without changing normal builds or
letting stale snapshots publish output.
