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
```

- **Names** are the `@hozo/ui` file names without extension: `button`,
  `date-picker`, `command-palette`. A name that is not a component exits `2`
  with the nearest names.
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

- **`@hozo/ui`'s theme** (`@hozo/ui/theme.css`). The copied classes name its
  tokens (`bg-hozo-accent`, `rounded-hozo-surface`), so the CSS entry keeps
  importing it, and `@hozo/ui` stays a dependency. Copying the theme as well
  is §8.
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

## 7. Plan

| Step | Work | Exit |
| --- | --- | --- |
| 1 | **Measure first**: compile, on both backends, a caller of each `@hozo/ui` component against the package and against a copy of the component in the project | The caller's output is the same both ways, or each difference is named with its cause. `@hozo/ui` ships `hozo.manifest.json` (text forwarding and variants) for callers in other packages; a copy is project code and has no manifest, so this step shows whether project-local facts reach its callers, or what RFC 010 and #1307 have to provide first |
| 2 | `hozo add` and `--list`: closure, origin line, config, the dependency check, the caller list | A fixture project per destination rule (config in `package.json`, in `hozo.json`, both, neither); a second run changes nothing; `pnpm test` passes in a project after `add button --write` |
| 3 | `--diff` and `--update` | One fixture for each state in §6, and the cache-less fallback |
| 4 | `hozo square`: the *upstream newer* information | Reported, and exit `0` |

Step 1 decides whether steps 2–4 can ship as written. If a copy compiles its
callers differently, `add` would hand the project a component that behaves
worse than the one it replaced, and the fix belongs in the compiler, not in
`add`.

## 8. Open questions

- **Moving callers.** `add` lists the files importing the component from
  `@hozo/ui`. Should a flag rewrite them to the copy, under the write
  contract? The recommendation is yes, behind `--imports`, once step 2 shows
  the list is right.
- **Copying the theme.** A project that wants to own its tokens would copy
  `theme.css` too, and could then drop `@hozo/ui`. Is that `hozo add theme`,
  or out of scope?
- **A copied component and the Verification Matrix.** The matrix covers the
  primitive, which the copy still uses. Should `square` say when a copy has
  removed a class the matrix relies on (a focus ring, say), or is that the
  project's to own?

## History

- Draft (2026-11-14): first version. Configuration in `package.json` or
  `hozo.json`, both accepted; origin recorded in each copied file, not in the
  config; edited copies are diffed, never merged.
