# CodeBlock: bounded preparation cost probe

This is a short measurement-only follow-up to [#1289](https://github.com/iray-tno/hozo/issues/1289).
It separates an illustrative token producer from the normalization used before
Native rendering. It does not implement windowing or establish a supported
Native performance envelope. Optimization is deferred at the maintainer's request.

## Reproduction and limits

Run from the repository root after installing the pinned dependencies, with Node
25. The script imports the TypeScript sources directly; no package build is needed.
The captured run used one logical CPU and below-normal priority on Windows:

```powershell
$taskProcess = Get-Process -Id $PID
$taskProcess.ProcessorAffinity = [IntPtr]8
$taskProcess.PriorityClass = 'BelowNormal'
$env:RAYON_NUM_THREADS = '1'
$env:CARGO_BUILD_JOBS = '1'
$env:TURBO_CONCURRENCY = '1'
$env:UV_THREADPOOL_SIZE = '1'
node scripts/measure-code-block-preparation.mjs artifacts/code-block-preparation/result.json
```

[Raw observations](code-block-preparation.json) retain every sample, source
SHA256, protocol and environment. The run completed in 6.343s on 2026-10-28,
against base revision `7c91f4c1f93f85db089c9311eaf80f1076532168` plus the probe
identified by its recorded SHA256. Host: Windows 10.0.26300 x64, Intel i7-12700KF,
Node/V8 v25.9.0. The measured parent process reported affinity mask 8 and
BelowNormal priority; child processes inherit that affinity. Shiki 4.4.3 is
resolved from the landing application's existing dependency, with TypeScript
and `github-dark`. No dependency was added to a portable component package.

The input is the existing Native performance fixture: 10, 100, 300 or 1000 lines
of `const item0000 = read("value", 0);`, varying the item index, with eight
precomputed tokens per line and 20% insertion/deletion marks. Shiki receives
the same text and produces twelve tokens per line; its output is not assumed
to have the fixture's token density. Source reconstruction is checked outside
the timing windows.

Each warm operation has two warmups and seven retained samples. Normalization
and adapter samples batch twenty calls and report time per call; tokenization
and fixture allocation use one call per sample. No forced GC, retries, p95 or
performance pass threshold are used. A 60s budget is checked between measured
samples, and each cold child has a timeout of at most 15s within that budget.
This is a bounded probe, not a statistical performance certification.

## Observations

Warm medians in milliseconds; all ranges and raw samples are in the JSON:

| Lines | Fixture / Shiki tokens | Shiki tokenization | `fromShiki` adapter | Two normalizations of fixture |
| ---: | ---: | ---: | ---: | ---: |
| 10 | 80 / 120 | 1.393 | 0.006 | 0.022 |
| 100 | 800 / 1200 | 10.560 | 0.060 | 0.185 |
| 300 | 2400 / 3600 | 17.209 | 0.152 | 0.573 |
| 1000 | 8000 / 12000 | 56.766 | 0.494 | 1.963 |

At 1000 lines (34,999 source bytes), warm tokenization ranged from 55.854 to
59.034ms; the two normalizations ranged from 1.939 to 2.021ms. These are
separate operations with different token densities, not stages of a measured
end-to-end pipeline. The double normalization follows the Native source path
from CodeBlock to CodeLines. Component execution, style resolution, React
element creation, reconciliation and Native work are not included.

Three fresh Node processes measured Shiki import, grammar/theme setup and the
first 1000-line tokenization. They exclude Node process startup, initial fixture
imports and fixture text construction. Their process-cold module caches do
not imply cold OS filesystem caches:

| Process, in run order | Import ms | Setup ms | First tokenize ms | Total ms |
| ---: | ---: | ---: | ---: | ---: |
| 1 | 2125.528 | 141.460 | 278.702 | 2545.691 |
| 2 | 61.044 | 44.775 | 279.925 | 385.744 |
| 3 | 60.136 | 44.171 | 269.295 | 373.603 |

The total median is 385.744ms, range 373.603–2545.691ms. The slow first import
is retained; this small probe does not identify its cause. Token acquisition
over a network, loading source from an application and other token producers
are not measured. Shiki in Node is an illustrative producer, not a claim that
the Native application uses Shiki or has the same startup cost.

Allocating the story's complete four-revision matrix at all four counts
(5640 lines, 45,120 fixture tokens) took median 1.780ms, range 1.245–5.636ms.
The existing Native story creates that matrix before its measured operations.

The wrapped, copy-free, numbered Native source describes `2 + 2N` View element
occurrences and `1 + 2N + T` Text occurrences for N lines and T fixture tokens:
12,003 total at 1000 lines, or 243 at 20 lines. These are source-derived React
host-element estimates, **not measured Android View or shadow-node counts**;
React Native may flatten Views and represent nested Text as spans. Story
controls and the outer scrolling container are excluded.

A preselected 20-line slice took median 0.037ms for two normalizations, range
0.036–0.037ms. Selecting that slice happened before timing. This is a preparation
control only: it does not measure a virtualized component, scrolling, wrapped
row heights, full-source Copy or accessibility behavior.

## What this means for the pending Native work

The [earlier Android observations](code-block-android.md) used precomputed
tokens. Their 1000-line mount/update medians of 1189.840/939.431ms therefore
exclude token production. This Node probe cannot be subtracted from those
numbers: hardware, engine and measurement endpoints differ. It does not isolate
JS rendering, Native layout or software-GPU cost.

Windowing could reduce the rows and token elements presented to React/Native.
It would not remove the cost of acquiring or tokenizing the full source unless
the application also changes that producer. The small sliced preparation
control is not evidence of a Native rendering improvement.

For now, retain the existing long-block warning and defer implementation.
[#1289](https://github.com/iray-tno/hozo/issues/1289) remains open for a future
application need: declare a latency/frame target, trace the Native cost and
compare any improvement in the same environment while preserving line, gutter
and reader semantics. No new emulator campaign or physical-device claim is
part of this measurement.
