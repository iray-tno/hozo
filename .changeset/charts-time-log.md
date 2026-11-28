---
'@hozo/charts': minor
---

A time axis and a log value axis. `x.type: 'time'` places Line and Area rows by date, with ticks on calendar boundaries, and makes every chart read the field as a date; it is UTC unless `timeZone: 'local'`. `y.scale: 'log'` on Line and Scatter spaces each tenfold step evenly, leaves zero and below undrawn but read, and the summary says "Values on a log scale."
