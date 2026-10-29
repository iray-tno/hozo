# Native authored gap composition

This follows [authored gap normalization](./authored-gap-normalization.md).
It fixes the measured finite-pixel **compiled root and spread** cases; it
does not yet admit gap to canonical utility ordering or claim all fallback,
secondary-slot, function-style and grid paths are equivalent.

## Boundary

Native used to compose `[{rowGap:8}, {gap:16}]`. Both keys survive, so Yoga
keeps the8px row despite the author's stronger style tier. Reordering cannot
repair this. The compiler now projects the **author contribution alone**
before composing it with the class styles, reusing the parent's projection.

- Explicit root style values use `hozoAuthoredStyle` only when that node has
  a known gap write or an opaque class that might carry one. A known unrelated
  static class, or a node without explicit style, retains the direct path.
- A possibly gap-bearing spread imports `hozoGapSpreadStyles`. It shares the
  existing spread-copying/composition core, reads each source once, and
  normalizes only the resolved author's contribution. Compiled objects and
  the candidate map are not scanned or annotated.
- Pressable callbacks delivered through a spread are resolved once with the
  original state object, generated before authored, then composed. No callback
  is put inside the style array by this operation.
- Ordinary spreads still use `hozoSpreadStyles` without importing the gap
  module. A bundler graph test verifies that separation. The new generated
  `gap-styles` leaf is forwarded/generated normally, not through a barrel.

Simple no-gap author objects retain identity. Author arrays are flattened
once, without a getter-reading pre-scan; mutable contents are not cached.
Zero and defined generic-gap fallback use the same projection as Web. No new
provider, subscription, state fact, runtime rank sort or per-component gap
algorithm is introduced.

## Verification

The matrix retains ten curated inputs, both class orders and eight LTR/RTL
flex layouts. It now executes **four** Native deliveries: static, dynamic,
static+spread and dynamic+spread. All **640** selected-style Yoga layouts
agree with the reviewed browser contract; the96remaining class/inline
disagreements from the parent are no longer accepted expectations. These are
observations, not unique supported features or a compatibility denominator.

The browser side retains **480** observations: original raw CSS shorthand,
independently specified Native-shaped inline reference and actual compiled
output. A separate actual compiled Pressable spread verifies single getter
evaluation, two callback state changes and16Yoga layouts. The existing
after-class spread warning is asserted, not suppressed or counted as an
error-free compile. Setter-order and compiled-only-expansion counterexamples
remain to show why the old composition fails.

All local work uses CPU1/Idle/serial. Workspace Rust **1,082passed/1intentional
ignore**, fmt and all-target Clippy with warnings denied passed, then a fresh
addon and engine/compiler/Tailwind/Metro builds were produced. Engine tests,
Yoga and raw-source cache guards passed **111** combined tests (96engine).
The final compiler suite passed **360/1existing skip** and Tailwind **156**.
Metro passed **93**; host/source-receipt/runtime-class/cache guards passed
**25**. Metro's two old string-shape assertions now require the root
projection but explicitly keep secondary-style props unwrapped, so the test
does not pretend the remaining slot work is already implemented.
The complete real-browser composition file passed **38**, no skips, in90.30s
after supplying the real generated helpers in its VM harness.
Lint checked1,757files; metadata, generated documentation, ABI and source
receipt freshness checks passed. Turbo raw-source inputs include the new
projection/entry modules, and their guard passes.
The normal Native fixture generator updates only the source receipt; that is
not fresh device evidence.

Earlier failures are retained in ignored `artifacts/tailwind-order/namespace-invariance/`:
the initial Rust assertions expected the pre-projection strings/helper name;
the function-style probe initially assumed an after-class spread emitted no
warning; the first full browser run had five missing-runtime-helper VM errors.
The harness now supplies the actual new generated helpers. Existing owner,
callback, geometry and warning expectations were not weakened to hide them.

## Cost and imports

```sh
node packages/engine/scripts/measure-native-gap.mjs --baseline=47cdb00e
```

The script compares equivalent final styles on unchanged no-gap fixtures,
warms implementations, alternates nine100,000-call sample triples and emits
**all** samples. Style equality is checked after flattening outside the
timer. RN flattening, renderer time, device behavior and memory are not timed.

| Spread helper | No-gap object | No-gap nested array | Isolated minified/gzip |
| --- | ---: | ---: | ---: |
| Parent | 0.370µs | 0.368µs | 817/448bytes |
| Current ordinary | 0.434µs | 0.429µs | 937/489bytes |
| Gap-aware boundary | 0.565µs | 1.388µs | 1,392/707bytes |

The ordinary composition adds about0.06µs here (~17% of this sub-microsecond
helper, not an app slowdown). The bounded gap-aware array path pays about1µs
to resolve the author's contribution separately. These are real costs, not a
zero-overhead or speedup claim. Static unrelated nodes emit no new helper;
ordinary spread imports cannot reach the gap module. Sizes are isolated
helper bundles, not complete generated-leaf, app or Metro payload sizes.

The initial unconditional spread normalization penalized all spread calls
(object0.371→0.605µs; array0.363→1.343µs). That source was replaced by the
separate gap-aware boundary. Both its full samples and the final bounded
samples remain recorded, rather than selecting the fastest repeated run.

## Remaining work

CI40694163365 passed package checks but one Storybook Node assertion still
expected the ordinary spread helper on an opaque Listbox wrapper. The test
now requires `hozoGapSpreadStyles`, supplies the actual implementation, and
also verifies a caller gap reaches both16px axes while the bound, padding,
margin and single getter read survive. Focused1and the complete candidate
cascade42tests passed (58.57s), including its mutation controls. No production
behavior, timeout or expected value changed for this CI repair.

The [pattern owner follow-up](pattern-authored-gap-composition.md) applies
that boundary to four Native patterns and twelve authored props, including
the compiler's plain secondary-slot arrays. It is not an all-owner claim.
Wire the same boundary into the remaining uncompiled pattern/secondary-slot owners and
verify direct authored callback composition, clearing/null cases, percentages,
mixed StyleX/class tiers and contextual grid behavior. This slice does not
assert those are settled. Only then assess gap's original upstream write
ownership, enable canonical ordering and remove its legacy barrier. Logical
edge aliases and transform registers remain separate families.

No full local root suite, app build, device/Fabric/pixels/AT, new conformance
headline or report snapshot is claimed. Upstream Yoga3.2.1 WASM is not RN's
bundled device binary. ABI exports grow through the generator to58leaves/
81names; they are generated-code infrastructure, not a new author API.
