---
"@hozo/charts": minor
---

Charts with two or more series now draw a key above the plot, each swatch shaped like its series'
mark, so colour is no longer the only way to tell series apart; `legend={false}` turns it off.
`DEFAULT_PALETTE` is reordered from the third colour on: the old order put emerald beside pink, which
deuteranopia renders as one colour. Bars are at most 24px thick and round their value end, with a
2px gap between neighbours and between stacked segments. Gridlines, the baseline and value tick
labels are quieter, with tick labels kept at 4.5:1. Bar marks gain `end`, and `ChartModel` gains
`legend`.
