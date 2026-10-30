---
'@hozo/compiler': patch
---

An `Svg.*` element inside an expression, such as `{rows.map(() => <Svg.Text className="…" />)}` or a conditional, inside another element now compiles in place. It used to reach the page with its classes uncompiled and no diagnostic.
