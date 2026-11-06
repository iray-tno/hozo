# Native owner composition through actual source edits

Tracking: [#1458](https://github.com/iray-tno/hozo/issues/1458), RFC 010 §7E.
Baseline: main `d412c96e`, after the six-layer owner-alias stack.

## Native rewrite provenance

The shared Native transform can optionally report each actual stage input and
its UTF-16 edits: Canvas paints, lowered root JSX/hooks, author-import removal
and generated import/style prefixes. It does not reconstruct edits from a diff
or parse generated code. Multiple hook insertions at an equal source position
are reported as their exact combined replacement, matching the existing
back-to-front rewrite order. With no observer the ordinary path is unchanged.

The source-provenance regression checks byte equality with unobserved Native
output and one Native module parse. It checks emoji offsets, untouched sibling
attributes, Canvas/hook/candidate-import phases and a lowered-parent negative
control. A carried string inside regenerated JSX has no copy provenance merely
because it still matches the author's text.

```sh
node --test --test-concurrency=1 packages/metro/src/native-provenance.test.ts
```

This first layer does not enable mixed-owner composition. Next, the caller
planner must explicitly identify its module prelude, and the compositor must
map every remaining edit through verified unchanged runs. Missing or ambiguous
mapping must retain the whole ordinary result, not just the failing site.
The worker then needs one shared context, candidate freeze/lifecycle guards
and actual production Metro execution before claiming the new delivery path.

No ordinary routing/default, contract audit, text protocol or global score is
changed by this instrumentation. The Native showcase's source fingerprint is
regenerated even though its emitted fixture body remains unchanged.
