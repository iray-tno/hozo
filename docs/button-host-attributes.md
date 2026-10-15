# Button host identifiers and DOM metadata

Use `nativeID` for a stable identifier on the actual host. It becomes a DOM
`id` on Web and stays `nativeID` on React Native, including a destination-bearing
Button's link host. `testID` remains a test selector, not application identity.

```tsx
<Button
  nativeID="winget-copy"
  data-copy-label="Copy"
  data-copied-label="Copied"
>
  Copy install command
</Button>
```

`data-*` is the typed Web metadata channel (string, number, boolean or omitted).
It reaches the actual button or anchor in server-rendered HTML, so an Astro
script can use `getElementById`, `dataset` and `addEventListener` without React
hydration. Unknown non-data props are not forwarded indiscriminately by the
fallback. Metadata does not replace the visible label or accessibility name.

React Native has no DOM dataset or DOM event-listener installation. Static
Button data attributes receive a compiler warning; opaque spreads and the
uncompiled Native Button share a once-per-module runtime warning. Values are
never printed or converted into accessibility props. Authored evaluation and
prop identity are retained, but no Native consumer/DOM metadata capability is
claimed. Use shared callbacks for portable behavior. Buttons without metadata
need no new host component, event machine or subscription.

The action Button keeps `type="button"` on Web. This slice does not add HTML
submit/reset semantics to Native or infer submission from surrounding forms.
Use the existing form abstraction or an explicitly Web-owned form control for
that contract. Navigation remains a link; metadata changes neither its role
nor its router behavior.
