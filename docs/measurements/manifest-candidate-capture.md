# Manifest candidates: what a capture before the module graph misses

[Decision 012](../decisions/012-where-the-styling-workstreams-meet.md) point 4
left two questions open, and #2047 asked for them to be measured on real
projects before the source scan of `@hozo/*` is replaced:

- How does Metro freeze a complete candidate map when a dependency edge
  appears late?
- What does a transitive or duplicated package instance cost at startup?

**Answer:** freeze a *carrier closure* where each adapter builds its candidate
universe today, and guard every later resolution. A carrier closure is the
app's declared packages, plus the packages under every package that declares
a manifest.

- **Frozen set.** In both measured apps, this set held every package with a
  manifest that the build reached: 3 of 3 in each of 4 builds. Capturing it
  took 26–103 ms.
- **Guard.** A resolution that lands in a package declaring a manifest
  outside the frozen set makes the capture incomplete. In these builds the
  guard would never have fired.
- **What it needs.** No second Metro pass and no file watcher.

## What was measured

There are two real apps and their real production builds. Neither build was
modified, apart from an observer.

| App | Bundler | Build | Packages with a manifest the app uses |
| --- | --- | --- | --- |
| `examples/native-showcase` | Metro 0.87.1 through `expo export --platform android` | 1 | `@hozo/ui`, `@hozo/patterns`, `@hozo/form` |
| `apps/landing` | Vite through `astro build` | 3 (client, prerender, client) | the same three |

For each build:

1. **Closure.** At the point where the adapter builds its candidate universe
   today, the closure was computed with the bundler's own resolver: Metro's
   `resolveRequest`, or Vite's `this.resolve`. For Metro that is the first
   resolution after the config loads, which comes before any module graph
   exists. For Vite it is `buildStart`.
2. **Reached.** Every resolution the build actually made was recorded.
3. **Late.** A *late* instance is one the build reached that the closure did
   not contain. Instances are compared by realpath, so two versions of one
   name are two instances.

Three closure variants were measured:

- **`declared`**: what `owner-manifest-preflight.ts` follows today. Each
  package's `dependencies`, `peerDependencies` and `optionalDependencies`,
  each located by resolving its bare name.
- **`instances`**: as `declared`, with two additions. The app's own
  `devDependencies` are followed, because an app bundles what it lists there.
  A name whose bare import resolves nothing is located through
  `<name>/package.json`.
- **`carriers`**: as `instances`, but past the app root it descends only into
  packages that declare `hozo.manifest`. Every declared name is still located,
  so a manifest on any of them is seen.

## Results

| Variant | Build | Closure instances | Unresolved names | Closure time | Reached instances | Late instances | **Late with a manifest** |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| declared | Metro android | 712 | 154 | 766 ms | 104 | 14 | **0** |
| declared | Vite client (1st) | 905 | 327 | 2417 ms | 17 | 3 | **0** |
| declared | Vite prerender | 865 | 322 | 1253 ms | 53 | 17 | **0** |
| declared | Vite client | 905 | 327 | 1314 ms | 25 | 1 | **0** |
| instances | Metro android | 833 | 100 | 1296 ms | 104 | 2 | **0** |
| instances | Vite client (1st) | 1049 | 200 | 3330 ms | 17 | 1 | **0** |
| instances | Vite prerender | 959 | 158 | 1421 ms | 53 | 12 | **0** |
| instances | Vite client | 1049 | 200 | 1512 ms | 25 | 0 | **0** |
| carriers | Metro android | 45 | 0 | 103 ms | 104 | 68 | **0** |
| carriers | Vite client (1st) | 38 | 0 | 3315 ms | 17 | 2 | **0** |
| carriers | Vite prerender | 32 | 6 | 34 ms | 53 | 33 | **0** |
| carriers | Vite client | 38 | 0 | 26 ms | 25 | 3 | **0** |

Every closure in the table contains all three packages with a manifest, and
so does every build's reached set.

The first Vite build costs 2.4–3.3 s in every variant, including the
38-instance one. That is the resolver's first use in the process, not the
closure's size.

A second run of the `carriers` variant reproduced every count. Its timings
were 65 ms for Metro and 0.9 s for the first Vite build, so the first-build
figure varies between runs.

### Why the full closures cost what they do

- **Unused instances.** In the `declared` closure, 87–98% of instances are
  never bundled: 622 of 712 for Metro, and 829–891 of 865–905 for Vite.
  Among them is build tooling that some package declares as a runtime
  dependency, such as Expo's CLI and its config packages.
- **Duplicate names.** The closure holds 61–98 names that appear as more than
  one instance. The bundles reach 0–4 of them, and none of those carries a
  manifest.
- **Cost per instance.** Each instance costs about 1–1.5 ms: reading its
  `package.json`, and resolving each declared name.

The `carriers` closure holds no duplicated names. A duplicated package with a
manifest would cost one more instance, and would count as two contributions
because instances are compared by realpath.

### Why instances arrive late

The first edge into each late instance was classified as follows:

| Reason | What it is | Seen in |
| --- | --- | --- |
| path | imported by a relative path, not a package name: `native-showcase` stories import `apps/landing` demo sources, and the landing's `llms.txt.ts` reads 15 workspace `package.json` files | both apps, every variant |
| declared, not located | the importer declares the name, but its bare import resolves nothing (`storybook`, `@expo/metro` and `metro-runtime` are imported only by subpath), or it is a devDependency of the app (`@hozo/compiler` and `@hozo/tailwind` in the landing) | `declared`; `instances` recovers all but 2, packages whose `exports` allow neither `.` nor `./package.json` |
| behind a late instance | a dependency of an instance that was itself missed (the `storybook` subtree) | `declared`, `carriers` |
| undeclared | imported but declared by nobody | — |

None of the late instances carries a manifest. Each of the first three reasons
could still produce one: a manifest package imported by path, by an
unlocatable name, or from inside an undeclared wrapper library. That is why
the guard is part of the approach, and not just the frozen set.

### Today's scan and the existing collector

- **Today's scan.** For comparison, today's `@hozo/*` source scan walks only
  the `@hozo/` packages the app declares directly (`hozoDependencies` in
  `project.ts`). For `native-showcase` that is 12 packages and 899 files. It
  does not include `@hozo/form`, which `@hozo/ui` depends on and the bundle
  reaches.
  Parsing those files cold took about 1.6 s for `native-showcase` and 1.3 s
  for the landing (594 files), on a second process run. A warm start reuses
  the persisted cache. The script used for this is a separate approximation
  of the walk, not `scanProject` itself.
- **The existing collector.** `collectMetroOwnerPreflight` refuses
  `native-showcase` in 18 ms on its first unresolvable declaration
  (`storybook`'s `main`), as `untrusted`. Its budgets of 128 instances and 512
  edges are also below the `declared` closure's 712 instances and 1835 edges.
  Unresolvable names are ordinary in real apps: types-only packages,
  subpath-only packages, and optional platform dependencies such as
  `react-native-windows`. So the collector's policy has to change, not only
  its budgets.

## Decision

### 1. Capture the carrier closure where the candidate universe is built today

That point is Metro's config load and Vite's `buildStart`.

- **What it follows.** The app root's `dependencies`, `devDependencies`,
  `peerDependencies` and `optionalDependencies`. Below the root, only the
  declarations of packages that themselves declare `hozo.manifest`.
- **How each name is located.** With the bundler's resolver, falling back to
  `<name>/package.json`. A name that still resolves nothing is not an error,
  since the guard covers it.
- **What is frozen.** The project seed plus each carrier's `candidates`,
  identified by instance and content, as `owner-manifest-capture.ts` already
  does.

### 2. Guard every resolution after the freeze

- **What trips it.** A resolution that lands in an instance whose
  `package.json` declares `hozo.manifest`, and that is not in the frozen set,
  makes the capture incomplete.
- **What does not.** Any other late instance is ignored. That is 68 in the
  Metro build above, so a guard that refused every unknown package would
  refuse this app. The guard reads the instance's metadata once and then
  answers from a cache.
- **In a one-shot build** (`expo export`, `vite build`), every resolution
  happens before output. A guard trip fails the build before anything is
  published, and names the instance. Declaring that package in the app puts it
  in the next start's closure.
- **In the Metro dev server**, a trip means restart, as the existing worker
  transfer already requires for a changed package set.

### 3. What freezing needs

Nothing beyond the resolver calls the adapters already make: no second Metro
pass and no file watcher on `node_modules`. This is #2047's go condition.

The approach is complete for the measured shapes. Where a shape would be
missed, the guard makes that loud instead of silent.

## What this does not show

- **Scope.** This covers two apps in this repository, built on Windows, with
  one Metro platform (Android). There is no app outside the workspace. A
  package with a manifest that is not `@hozo/*`, or that is installed from a
  registry, does not occur in either app.
- **Guard cost.** The guard was not built, so its per-resolution cost is not
  measured. It amounts to a metadata lookup per resolved instance, which the
  observer here performed for 4,071 Metro resolutions without a separate
  timing.
- **Dev servers.** The Metro dev server and the Vite dev server were not run.
  Their late edges arrive after output by construction, which point 2 treats
  as a restart. How often that happens in practice is unmeasured.
- **Shared state between runs.** Closure times are from processes that also
  ran a full build. They were measured inside the build's resolver, with
  whatever caches it had warmed by then.

## Reproduce

```sh
pnpm turbo run build --filter="./packages/*"
node scripts/measure-metro-late-edges.mjs examples/native-showcase android
(cd apps/landing && node scripts/copy-wasm.mjs && node scripts/ui-native-status.mjs)
node scripts/measure-vite-late-edges.mjs apps/landing
```

Add `--variant instances` or `--variant carriers` to either script for the
other variants; `declared` is the default. Each script prints one JSON report
per build. Each late instance in the report includes its reason and the first
edge into it.
