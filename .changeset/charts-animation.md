---
'@hozo/charts': minor
---

Charts move their marks to new data over 300 ms instead of jumping: bars grow and shrink, new bars rise from the baseline, and lines and points slide. Nothing moves when the reader asks for reduced motion, and `animate={false}` turns it off. The table, summary and announcement describe the new data at once.
