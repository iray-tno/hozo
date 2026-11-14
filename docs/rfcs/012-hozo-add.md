# RFC 012: `hozo add` — an `@hozo/ui` component as project source

- **Status**: Draft
- **Authors**: iray-tno
- **Tracking issue**: Not assigned
- **Target packages**: `@hozo/cli`; `@hozo/ui`
- **Baseline**: main `97ffaf0a` (2026-11-14)

## 1. Summary

RFC 011 reserved `hozo add <component>`: copy an `@hozo/ui` component into
the project as source, shadcn/ui style, so the project owns it and edits it.
This RFC specifies what is copied, where it goes, how a copied component
learns of a newer upstream, and what has to be measured before it ships.

`@hozo/ui` is already shipped as source and compiled by the project's own
build. What `add` changes is ownership: after `add`, the file is the
project's to edit, and `@hozo/ui` no longer changes it on upgrade.

## 2. Why this is smaller than it looks in shadcn/ui

Every `@hozo/ui` component picks class names and adds nothing else. Role,
keyboard contract and state machine belong to the primitive or pattern it
wraps, which is verified where it lives (#638 §2, and the header of
`packages/ui/src/button.tsx`). So:

- **What is copied is the look.** The behaviour a copied file depends on
  stays in `@hozo/core`, `@hozo/patterns`, `@hozo/form` and
  `@hozo/primitives`, still installed as packages and still covered by the
  Verification Matrix. A project that edits a copied component edits its
  classes, not a second implementation of the widget.
- **The dependency closure is small.** Measured on the baseline, the
  relative imports inside `packages/ui/src` are four:

  | File | Imports |
  | --- | --- |
  | `calendar.tsx` | `calendar-look.ts` |
  | `date-picker.tsx` | `calendar-look.ts` |
  | `date-range-picker.tsx` | `calendar-look.ts` |
  | `date-time-picker.tsx` | `calendar-look.ts`, `time-picker.tsx` |

  Every other component imports only `@hozo/*` packages and `react`.

## 3. Command

```
hozo add <component>...        # dry run: prints the files it would create
hozo add <component>... --write
hozo add --list                # every component, and each copy's state
hozo add --diff <component>    # what changed upstream since the copy, and what the project changed
hozo add --update <component> --write
hozo add theme --write         # the theme as well (§6.1)
```

- **Names** are the `@hozo/ui` file names without extension: `button`,
  `date-picker`, `command-palette`. `theme` names `theme.css`. A name that is
  neither exits `2` with the nearest names.
- **The closure** of relative imports is copied with the component. A file
  already copied (`calendar-look.ts`, shared by four components) is not
  copied twice.
- **Package dependencies** a copied file imports (`@hozo/patterns`, say) are
  checked against the project's `package.json`. One missing is reported with
  the install command for the project's package manager; `add` installs
  nothing.
- **Callers are not touched.** `import { Button } from '@hozo/ui'` keeps
  working, since `@hozo/ui` stays installed (§5). `add` lists the files that
  import the component from `@hozo/ui`, so the project can move them. See §8.
- It follows RFC 011's conventions: the write contract (§3.4: dry run by
  default, `--write`, refuse uncommitted target files unless `--force`, a
  second run changes nothing), `--format json`, and exit codes `0`/`1`/`2`.

## 4. Where copies go, and how they are configured

The destination is configured in either place, so a project that dislikes
another file at its root does not need one:

```jsonc
// package.json
{ "hozo": { "components": "src/components/ui" } }
```

```jsonc
// hozo.json
{ "components": "src/components/ui" }
```

- With neither, the destination is `src/components/ui`, or `components/ui`
  when the project has no `src`. That is shadcn/ui's default, which agents
  already expect.
- With both, `add` exits `2` naming both files, instead of picking one
  silently.
- The config holds settings only, never a record per component. A list that
  grows with every `add` belongs with the files it describes (§6), not in
  `package.json`.

## 5. What stays a package

- **`@hozo/ui`'s theme** (`@hozo/ui/theme.css`), by default. The copied
  classes name its tokens (`bg-hozo-accent`, `rounded-hozo-surface`), so the
  CSS entry keeps importing it, and `@hozo/ui` stays a dependency. A project
  may copy the theme as well (§6.1).
- **The primitives and patterns** a component wraps (§2).
- **Tests.** `@hozo/ui`'s tests are not copied: they test the package's
  file, and the behaviour they care about is the wrapped primitive's.

## 6. Updating a copy

Each copied file starts with one line recording where it came from:

```tsx
// hozo add: @hozo/ui@0.5.0 src/button.tsx sha256:3f2a…
```

The hash is of the upstream file as it was copied, without this line.

- **The state of a copy** follows from the line and the file:
  - *current*: the installed `@hozo/ui` is the recorded version;
  - *upstream newer*: the installed version is newer, and the file is
    unchanged since it was copied;
  - *edited*: the file differs from the recorded hash;
  - both of the last two at once.

  `--list` prints each copy's state. `hozo square` reports *upstream newer*
  as information, never as a finding that fails CI.
- **`--diff`** prints a three-way comparison: upstream at the recorded
  version, upstream at the installed version, and the project's file. The
  old upstream comes from the package manager's cache, or from the registry
  once per version. Without either, it says so and shows the two-way diff it
  can.
- **`--update --write`** replaces an unedited copy with the installed
  upstream and moves the line to the new version. An edited copy is not
  merged: `add` prints the three-way diff and exits `2`, which is the write
  contract's answer to a change it cannot make safely. `--force` overwrites
  it.
- **Deleting the line** detaches the copy. It is then project code with no
  upstream, and `add` leaves it alone.

### 6.1 The theme: overridden or copied

Components, copied or installed, name tokens and nothing else. The project's
build resolves every token against the one theme the CSS entry imports
(`packages/ui/README.md`, "Theming"). Which file that is decides who owns the
defaults; either way there is one theme, so tokens never have two owners.

- **Overridden** (the default). The entry imports the package's theme and
  redefines what the project wants in its own `@theme`:

  ```css
  @import "@hozo/ui/theme.css";
  @theme {
    --color-hozo-accent: var(--color-emerald-600);
    --color-hozo-accent--dark: var(--color-emerald-400);
  }
  ```

  Upgrading `@hozo/ui` brings its new defaults: a token the project did not
  redefine can change value, and every component using it, copied ones
  included, changes look with it. That is intended, since it is how palette
  and contrast fixes reach a project, and `--list` says so next to each copy.
- **Copied**: `hozo add theme` copies `theme.css` to the destination, with
  the origin line as a CSS comment
  (`/* hozo add: @hozo/ui@0.5.0 src/theme.css sha256:… */`). `--imports`
  rewrites the entry's `@import "@hozo/ui/theme.css"` to the copy, under the
  write contract; an entry it cannot edit safely gets the line to change
  printed, and exit `2`. Upgrades then change no token, and `--diff theme` /
  `--update theme` work as in §6, which is where a token added upstream
  shows up. With every component and the theme copied and callers moved,
  `@hozo/ui` can be removed; `add` says so, and does not remove it.
- **Every token named must be defined.** `hozo square` reads the tokens each
  component's classes name, copied and installed alike, and looks each up in
  the theme the entry resolves. A missing one is a finding (CI fails): its
  class is dropped from the output, so the look is lost without any file in
  the project changing. One check catches both ways this happens: upstream
  renaming or removing a token a copy still names, and a copied theme older
  than a component installed or copied after it.

## 7. Plan

| Step | Work | Exit |
| --- | --- | --- |
| 1 | **Measure first**: compile, on both backends, a caller of each `@hozo/ui` component against the package and against a copy of the component in the project | The caller's output is the same both ways, or each difference is named with its cause. `@hozo/ui` ships `hozo.manifest.json` (text forwarding and variants) for callers in other packages; a copy is project code and has no manifest, so this step shows whether project-local facts reach its callers, or what RFC 010 and #1307 have to provide first |
| 2 | `hozo add` and `--list`: closure, origin line, config, the dependency check, the caller list | A fixture project per destination rule (config in `package.json`, in `hozo.json`, both, neither); a second run changes nothing; `pnpm test` passes in a project after `add button --write` |
| 3 | `--diff` and `--update` | One fixture for each state in §6, and the cache-less fallback |
| 4 | `hozo square`: the *upstream newer* information, and the undefined-token finding (§6.1) | *Upstream newer* reported with exit `0`; a fixture whose copy names a token the theme lacks, and one whose copied theme predates a component, each exit `1` |
| 5 | `hozo add theme`, and `--imports` for the CSS entry | The overridden and copied fixtures compile to the same output when the copy is unedited; an entry whose import is computed exits `2` with the line to change |

Step 1 decides whether steps 2–5 can ship as written. If a copy compiles its
callers differently, `add` would hand the project a component that behaves
worse than the one it replaced, and the fix belongs in the compiler, not in
`add`.

### 7.1 Step 1's result

Measured in
[`docs/measurements/hozo-add-copied-callers.md`](../measurements/hozo-add-copied-callers.md):

- **A copied file compiles the same** as the package's, for all 43 files on
  both Native platforms. `packages/metro/src/copied-component.test.ts` pins
  it.
- **Its callers do not, on the Native backend.** A `Text` nested in a copied
  `Alert`, `Button`, `Checkbox` or `Switch` loses the component's text
  classes: 14 of 33 caller cases differ, the same on `ios`, `android` and
  Metro's `web`. Text forwarding reaches Metro only from a dependency's
  manifest, keyed by package name; a copy has no manifest and its callers
  import it by a relative path. The DOM Web backend does not read forwarding
  and is unaffected.

So steps 2–5 wait on one compiler change, added as step 1b:

| Step | Work | Exit |
| --- | --- | --- |
| 1b | **Text forwarding for project components on Metro.** `withHozo` summarises the project's own component files the way the manifest builder summarises a package's (`summarizeTextForwarding`), and records the result by file in `metro.json`, as it records class helpers (#964). `transform` resolves the caller's imports (relative, and `tsconfig` `paths`) to files and registers each recorded file's forwarding under the specifier the caller wrote, for that compile only. The summary joins the cache key | The 14 differing cases of step 1 compile the same; a copy edited after Metro started is reported by `square`'s existing stale-`metro.json` check, the same restart rule as class helpers |

Step 1b is the project-file half of RFC 010's F6, which #1307's per-file
record would later absorb; it does not wait for #1307.

## 8. Resolved questions

- **Moving callers: behind `--imports`.** By default `add` only lists the
  files importing the component from `@hozo/ui`. `--imports` rewrites those
  imports to the copy, under the write contract (`--imports --write`). Without
  the flag, an agent would repeat the same rewrite by hand after every `add`;
  doing it by default would make `add` edit files the project did not name.
  It is implemented after step 2 shows the list is right.
- **The theme: both, overridden by default (§6.1).** Overriding tokens in
  the project's `@theme` is the default, and keeps upstream's defaults
  arriving on upgrade. `hozo add theme` copies it for a project that wants
  to own every default or drop `@hozo/ui`. Installed components read tokens
  by name, so a copied theme does not split ownership as long as the entry
  imports one theme. `square`'s undefined-token finding covers both modes.
- **A copied component and the Verification Matrix: noted in `--diff`, never
  a `square` finding.** The matrix covers the wrapped primitive, which the
  copy still uses, and the look is the project's. But a copy that drops
  `focus-visible:` or another state variant loses something the matrix's
  look was built around (README: the focus ring is part of the only class
  list an interactive component can have). `--diff` marks a removed state
  variant (`focus-visible:`, `disabled:`, `aria-*:`, `data-*:`) as a note,
  so there is one place an edit like that is seen; CI does not fail on it.

## History

- Draft (2026-11-14): first version. Configuration in `package.json` or
  `hozo.json`, both accepted; origin recorded in each copied file, not in the
  config; edited copies are diffed, never merged.
- Draft (2026-11-14): open questions resolved. `--imports` rewrites callers
  on request; the theme is overridden by default and copied by
  `hozo add theme` (§6.1), with `square` failing on a token the theme does
  not define; a removed state variant is a note in `--diff`.
- Draft (2026-11-14): step 1 measured (§7.1). A copy compiles the same; its
  Native callers lose text forwarding, so step 1b brings project components'
  forwarding to Metro before `add` ships.
