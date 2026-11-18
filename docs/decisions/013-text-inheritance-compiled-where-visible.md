# 13. Native text inheritance: one rule, compiled where the build can see it, read at run time where it cannot

**Status:** decided
**Date:** 2026-11-18
**Issue:** #2049

## Why

On the Web, `text-*` on a container reaches every piece of text inside it. On
React Native a `Text` inherits only from an enclosing `Text`, never from a
`View`. Hozo has two answers to this today, and neither is the default for
everything.

- **The ordinary route copies at build time.** The parser hands a container's
  text declarations down to each `Text` it can see in the same file. When a child
  is a component or an expression (`<Label/>`, `{children}`), the copy cannot
  happen. The compiler then warns that "it will come out at the default size".
- **RFC 006's runtime route** (`textInheritance`, an internal per-call option)
  makes every `Text` and `View` a context reader and publisher.
  - Of the 286 Native components in the repository (`78e95a58`), it admits 108.
    All 108 gain runtime readers.
  - Its static proof (`textStatic`) erases none of them. It requires a
    `memo()` root `Text` that sets all seven fields itself.
  - It refuses the other 178 components as a whole when any element in them is
    outside its assessed domain.

The cost of the second route comes from treating every element as possibly
reached from outside. Most are not.

- A `Text` inside a `Text` inherits natively.
- A `Text` under a container in the same file already receives that container's
  declarations from the parser.

The only elements the build cannot answer for are these two:

- the outermost `Text` of a component, because its caller is unknown;
- the opaque children of a text-styled container.

Hozo's own corpus has 0 opaque text drops in the packages that run on Native.
That number is shaped by the warning, so it says little about user code. A
project ported from Web Tailwind writes `<View className="text-lg"><Label/></View>`
as a matter of course.

## Decision

There is one rule: CSS inheritance of the seven protocol fields (`color`,
`fontSize`, `fontWeight`, `lineHeight`, `letterSpacing`, `textAlign`,
`textTransform`), where the nearest ancestor that sets a field wins. For each
element, the build picks how that rule is met. It uses the runtime only where it
cannot see.

1. **Visible ancestors are compiled, as today.** The parser's forwarding keeps
   copying a container's text declarations onto the `Text` it can see. These
   copies count as the `Text`'s own values.
2. **A `Text` nested in a `Text` stays a plain `Text`.** React Native already
   inherits there.
3. **An outermost `Text` reads only what it does not set.**
   - If its own and forwarded unconditional declarations cover all seven
     fields, it stays a plain `Text`. This is the static proof, generalised
     from "a `memo()` root" to any `Text`.
   - Otherwise it becomes `HozoInheritedLeafText`, which reads the two
     inheritance contexts. It publishes nothing: a `Text` its opaque children
     render inherits from this host natively. When it has such children it
     resets the contexts below it to empty, so they do not apply the outer
     frame over this host's own values.
4. **A text-styled container publishes only around what it cannot see.** When
   a container has text declarations and an opaque child, its children are
   wrapped in one `HozoInheritedScope`. This renders no host; it publishes the
   container's frame merged over the inherited one. A container with no opaque
   child publishes nothing, because the parser has already copied.
5. **Assessment is per element, not per component.** An element whose own
   styles fall outside the assessed domain is lowered as today. The domain
   covers conditional text classes, animation, relative metrics, font
   families and Chip/Pressable label owners. Such a `Text` does not read the
   context, and such a container keeps today's warning. Nothing is refused as a
   whole, and nothing becomes worse than the ordinary route.
6. **The adapters select this route by default for Native builds**, with a
   project option to turn it off. The previous whole-component runtime route
   stays callable for the existing comparison suites until it is deleted. It
   is not a second production route. It was deleted in #2057; the reference
   model and the comparison against it remain.

The Web output does not change. CSS already does this.

## Enough evidence

- The rendered result equals RFC 006's independent reference model on the
  existing comparison fixtures (`packages/tailwind-conformance`, compiler,
  Metro, shipped leaves and mock hosts), plus new fixtures for:
  - the outermost `Text` under an outer scope;
  - a nested `Text`;
  - a container with an opaque child;
  - a non-assessed element beside assessed ones.
- One JS cost comparison, once and not per owner.
  - Workloads: a list of rows, and a pressable whose label colour changes.
  - Compared: plain `Text`, the leaf reader, and today's runtime route.
  - Measured: React commit time and render executions.
  - Threshold: RFC 006's provisional one, the larger of 5% and 0.25 ms per
    commit on the median.
- The corpus count of readers, scopes and unchanged components, before and
  after.

No device run is required to change the default. The route changes which code
selects a value, not how a host draws it (decision 012, point 6). The existing
device jobs keep running.

## Rejected

- **Keep the ordinary route and the warning.** That leaves the most common
  Web-to-Native port silently wrong at run time. The warning is a build
  message the porter may never read.
- **Make every element a reader (RFC 006's route as it is).** It pays for
  elements whose answer is known at build time, and it refuses whole components
  over one unassessed element.
- **Publish at every text-styled container.** A container with only visible
  `Text` children gains a provider that no reader below it needs.

## Revisit

- If the cost comparison exceeds the threshold for the list workload, keep the
  route opt-in and measure whether a single context, rather than two, removes
  the difference.
- If a filed bug shows a combination where the compiled and runtime halves
  disagree, decide then whether that field leaves the protocol.
