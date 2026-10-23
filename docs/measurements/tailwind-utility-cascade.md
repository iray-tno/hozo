# Builtin spacing utility conflicts: first correction

## Scope and source of order

For #1230, input provenance alone is not enough: `p-10 p-2` must choose
`p-10`, not the last authored class, and `p-8 px-2 pt-1` must retain the
more-specific axis/side utilities even if the class string is reversed.

`scripts/generate-tailwind-utility-order.mjs` asks the installed Tailwind
design system for `propertySort` metadata. The assessed domain is builtin
physical padding/margin, their axis forms, and gap/row-gap/column-gap. Each
generated root is checked to have a single-property, single-declaration
signature. The numeric/string tiebreak follows Tailwind's
[alphanumeric comparison](https://github.com/tailwindlabs/tailwindcss/blob/main/packages/tailwindcss/src/utils/compare.ts),
including equal-number representation ties. ASCII comparisons allocate no
temporary character buffers; non-ASCII strings use JavaScript's UTF-16 order.

The key is retained as compile-time utility provenance shared by a utility's
expanded longhands. Input identity remains the JSX attribute, not the key:
sorting must not turn every utility into a new styling input. Literals,
constant/helper literal pieces and secondary class slots share normalization.
StyleX input order/atomic priority is not reinterpreted.

## Where the work happens

- Static Web and Native: sort assessed utilities only within an identical
  condition and input, before last-wins flattening. Disjoint non-spacing
  declarations do not prevent sorting. Unmodeled overlapping spacing is a
  barrier rather than an invented low priority.
- Web candidate CSS: the default, no-project-order API applies these keys
  within each condition. An explicit project order from `loadClassOrder`
  remains authoritative.
- Native candidate fallback: emit small numeric ranks for the project's
  participating candidates, plus null barriers for overlapping unassessed
  candidates. Read/sort only on a new class-string cache entry. Existing
  base/state tiers stay separate; utility ties sort inside each condition (also
  `disabled:`/ARIA/data conditions, not just ranked owner interactions).
  Existing owner-interaction order still controls assessed different states.
  Legacy modules without this optional metadata keep their previous behavior.

No runtime class parser, subscription or per-state-update utility sorting is
added. A project with fewer than two assessed spacing candidates emits no
utility-order argument. Static output gains no ordering helper. Compiler IR
does gain shared metadata, and mixed candidate projects gain rank data/code;
this is not an assertion of zero compilation or bundle-size cost.

Standalone resolver size against main `99e9c03a` (esbuild, ESM ES2022,
minified; Node gzip of that output): 1,559 → 2,195 bytes minified, 845 → 1,147
bytes gzip (**+636 / +302 bytes**). This final measurement includes the
condition/barrier checks added after the earlier +252 / +113-byte probe;
it supersedes that intermediate result. It excludes generated project rank
data and is not an application-bundle or Native-render-time measurement.

## Native horizontal pairs are not individual logical sides

Native's fixed logical-edge priority can defeat a later physical side even
after array order is corrected. Equal inline pairs (`px`/`mx`) can represent
the same horizontal pair in LTR and RTL, so closed static inputs with physical
horizontal competition normalize the pair to physical edges. Lone axes keep
their prior output. Inputs with individual logical edges or opaque class
leaves keep their existing static representation until broader composition
can assess them safely.

Generated Native candidate pairs also clear earlier logical edges with
undefined entries, so an earlier owner/class does not silently dominate the
pair; later individual logical edges still apply. This is static generated
style data, not a direction subscription. The Web keeps inline properties,
including its own writing-mode semantics; vertical writing is not claimed
for Native.

## Evidence and boundaries

- Permutations of same-root numeric/arbitrary values and shorthand/axis/side
  conflicts across actual Native compiled output and generated fallback.
- Source-backed literal/helper and hover-state cases; cache-read counters
  verify cached strings do not reread rank metadata.
- Chromium compares real Tailwind CSS with Hozo static CSS and default
  candidate CSS under both class orders and LTR/RTL. The same independently
  measured values are compared with Native selected styles, including gap
  shorthand fallback. Browser hover is exercised, not a fake hover class.
- Installed-engine generator drift and raw-source cache guards; existing
  compiler/engine, StyleX, caller composition, inheritance and fixture checks.

This does not close #1230. Other utility families, individual logical/physical
aliasing, utility conflicts across different expression guards, broader
variant weights and static/caller-state conflicts remain. Mixed unranked state
domains are not newly claimed: Native's prop-guard and owner-state tiers can
still disagree with CSS or the fallback
when different conditions compete. Safe-area extension utilities are not
assigned a builtin Tailwind rank. Unknown inputs are not dropped or newly
refused. Device pixels/AT, vertical Native layout, full
conformance-report numbers and an overall speedup are not claimed. Decision
009 tiers, decision 011 input composition and the inheritance default remain
unchanged.
