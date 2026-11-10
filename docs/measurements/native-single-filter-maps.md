# Single-function candidate maps need no filter composer

Continues #1230 / RFC010 §7C after
[Native candidate filter composition](native-candidate-filter-slots.md).

Blur values replacing other blur values already match RN's whole-property
semantics. The generator now omits the filter import, identity map and compose
callback when the entire assessed namespace contains at most one function.
Resets and raw whole values do not introduce independent function slots.

The function mask is collected in the same metadata pass that emits each
slot's numeric identity and value. It is not derived from class-name prefixes,
serialized code or a second parser. Ordinary and state entries contribute to
the union once, at generation time. Multiple independent functions retain
their existing emitted composition code byte for byte.

The new candidate regression checks direct blur replacement under hover,
deactivation and reset/revival, with zero helper calls and no emitted table or
import. It fails against the preceding addon because that addon emits the
extra machinery. Existing multi-function, stacked-state, opaque-chain fallback,
text/transform coexistence and dynamic Pressable regressions remain passing.

CPU1 / Idle / serial with a fresh debug addon: Native Rust365; complete
compiler521 tests,519 pass/two platform skips; typecheck and scoped Clippy/fmt
pass. The generated single `blur-sm` module is342 raw/220 gzip bytes. The
`blur-sm hover:blur-lg filter-none` module is571/317; both omit the helper,
also avoiding its350-gzip-byte leaf when nothing else imports it. The
two-function module remains936/433; the plain namespace remains500/290, as in
the preceding measurement. No runtime throughput, app-size or frame-time
improvement is inferred from those byte counts.

This is a generation optimization, not a new semantic/admission/ranking domain.
Static Native lowering and Web output are unchanged. The namespace-wide mask
is deliberately conservative: two functions anywhere retain composition even
if a particular selected list happens to contain only one.
