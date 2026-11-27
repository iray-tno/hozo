---
"@hozo/charts": minor
---

Add a chart theme. `ChartThemeProvider` sets it for every chart inside, and each chart takes a
`theme` prop on top: `palette` (one set for light and dark, or a `{ light, dark }` pair picked by the
system colour scheme or the provider's `colorScheme`), `bar` (`radius`, `maxWidth`, `gap`), `line`
(`width`, `pointRadius`) and `frame` (`grid`, `axis`). `Sparkline` takes its colour from it too.
`seriesColor` and `datumRows` take an optional palette, and the bar models take `bar`.
