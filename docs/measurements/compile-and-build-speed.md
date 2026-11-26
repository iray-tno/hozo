# Compile and build speed

Measured on Windows on 2026-11-26 at main `8e928278`, with the release native
addon (`pnpm --filter @hozo/compiler build:native:release`) and
`UV_THREADPOOL_SIZE=1`. The question was where a build's time goes once the
compiler's modules had been split up, and whether anything there was worth
fixing.

## The compiler itself is not the cost

Every `.tsx` under `packages/`, `examples/` and `apps/` was compiled once to
warm, then five times; the median per file is kept.

| Target | Files | Total | p50 | p95 | Max |
| --- | ---: | ---: | ---: | ---: | ---: |
| `compile` (Web) | 585 | 72 ms | 0.04 ms | 0.52 ms | 3.25 ms |
| `compileNative` | 585 | 80 ms | 0.04 ms | 0.5 ms | 3.7 ms |

380 of those files contain a Hozo root; the rest pass through. About 2.5 MB of
source is compiled for both targets in roughly 0.15 s, so a project would have
to be several hundred times this repository before the per-file compile is
noticeable in a build. The slowest file is `Behaviors.stories.tsx`.

## The cost was finding the sources

A CPU profile of `vite build` in `examples/login-demo` spent over 40% of its
time in directory walks under `notIgnoredAbove`. The plugin calls it in
`buildStart` and again in `buildEnd`, and it read the `.gitignore` chain above
the package by globbing every `.gitignore` in the repository -- crossing every
other package and Rust's `target/`. Metro and Next reach the same function.

[#2292](https://github.com/iray-tno/hozo/pull/2292) reads only the
`.gitignore` files on the path from the repository root down to the package,
and those inside it; a pattern in a sibling directory cannot match a path in
the package, so the answer is the same.

| | main | #2292 |
| --- | ---: | ---: |
| `discoverSources` over all 41 packages and examples | 17.1 s | 0.23 s |
| Files discovered over those 41 | 1,850 | 1,850 (identical lists) |
| login-demo `vite build`, wall time (3 runs) | 2,076 / 2,055 / 2,093 ms | 1,244 / 1,226 / 1,216 ms |
| login-demo profile, total | 1,613 ms | 740 ms |

After the change the profile has no dominant entry: `lstat` 75 ms,
`internalModuleStat` 67 ms, `classHelperCandidates` 45 ms, then module loading.

## Output size, for reference

| Output | Raw | gzip |
| --- | ---: | ---: |
| login-demo Web JS | 206.3 KiB | 64.1 KiB |
| login-demo Web CSS | 6.2 KiB | 1.9 KiB |
| native-demo Android application | 1,109,411 B | 273,897 B |
| native-demo Hozo increment over the matched React Native screen | 5,998 B | 1,331 B |

The Native increment is unchanged from
[native-development-budget.md](native-development-budget.md); the gate there
remains 8,000 raw / 3,000 gzip.

## Reproducing

The per-file timing and source-discovery comparison were one-off scripts, not
kept in the repository; each is a loop over the files above calling the addon
or `discoverSources`. The build times are `vite build` in `examples/login-demo`
after `pnpm build`, and the Native sizes are `pnpm run measure:production` in
`examples/native-demo`.
