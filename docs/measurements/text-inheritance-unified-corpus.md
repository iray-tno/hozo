# Text inheritance: what the default changes in this repository

[Decision 013](../decisions/013-text-inheritance-compiled-where-visible.md)
asks for a corpus count of readers, scopes and unchanged components before
and after its route becomes the Native default. The cost of those readers is
in [text-inheritance-unified-cost.md](text-inheritance-unified-cost.md).

**Script:** `packages/tailwind-conformance/src/text-inheritance-unified-corpus.ts`

```sh
node packages/tailwind-conformance/src/text-inheritance-unified-corpus.ts
```

## What it counts

- **The corpus:** every tracked `.tsx` file under `packages/ui`, `packages/patterns`,
  `packages/form`, `packages/typography`, `examples` and `apps/landing`, except
  tests, stories and `.web.tsx` halves. The same corpus decision 013 was
  measured on.
- **Before:** ordinary Native lowering, as Metro selected it until this change.
- **After:** the same compiler with `textUnified`, as Metro now selects it.
- **Per component:** whether its output changed, and how many readers
  (`HozoInheritedLeafText`) and scopes (`HozoInheritedScope`) it emits.

## Results

On `feat/text-inheritance-default`, over 261 files with 287 Native components. Decision 013 counted 286 on `78e95a58`, walking the directories rather than git's index.

| | Count |
| --- | ---: |
| Components with unchanged output | 95 |
| Components with at least one reader | 192 |
| Components with at least one scope | 11 |
| Readers | 599 |
| of which reset their context for an opaque child (`hozoOpaque`) | 212 |
| Scopes | 18 |
| `Text` left plain (nested, or setting all seven fields) | 98 |
| Components with an error diagnostic ordinary lowering did not report | 0 |

For comparison, RFC 006's whole-component route on the same corpus admitted
108 components and refused 178. This route refuses none, because an element it
cannot assess is lowered as it was before.

## What it shows

- **Nothing becomes an error.** The route adds no refusal, as decision 013
  requires.
- **Most components gain a reader.** Every outermost `Text` that does not set
  all seven fields reads the rest, so readers are common. Their cost is the
  0.25 µs per `Text` per commit measured beside this.
- **Scopes are rare:** 18, in the 11 components where a text-styled `View` has a child the compiler cannot see. Before, those children got none of the container's text styles.
- **A component that reads its own children gets no scope.** A table section or a pressable is one, and so is a `ScrollView`, whose sticky headers are counted by index. It keeps the ordinary warning.
