# RFC 011: One `hozo` command

- **Status**: Draft
- **Authors**: iray-tno
- **Tracking issue**: Not assigned
- **Target packages**: new `@hozo/cli`; `@hozo/migration-audit`, `@hozo/compiler`, `@hozo/navigation`
- **Baseline**: main `6a8bccd7` (2026-11-12)

## 1. Summary

Hozo ships three command-line tools from three packages, each found only by
reading that package's README:

| Today | Package |
| --- | --- |
| `hozo-migration-audit` | `@hozo/migration-audit` |
| `hozo-manifest` | `@hozo/compiler` |
| `hozo-links` | `@hozo/navigation` |

Most of Hozo's users are agents, and agents work from a terminal and from
tool results, not from an editor. This RFC puts every command behind one
`hozo` binary with one set of conventions, and adds the read-only commands a
project needs from first look to everyday CI. Commands that create or edit a
project (`init`, `add`, `npm create hozo`) are reserved here and specified in
later RFCs (§7).

## 2. Commands

| Command | Alias | Does | Status |
| --- | --- | --- | --- |
| `hozo dry-fit` | `migration-audit` | Before adoption: lowers a checkout without installing anything and reports what Hozo would do. `--fix` proposes the import moves | moves from `hozo-migration-audit` |
| `hozo square` | `doctor` | After adoption: checks setup, then code. `--compare` / `--fail-on` for CI | new; code half reuses the audit engine |
| `hozo explain <CODE>` | | Explains a diagnostic: when it fires, why, how to fix, with its conformance case | new |
| `hozo show <file>` | | Prints what a file compiles to for `--web` or `--native`, with each class list's route and dropped classes | new |
| `hozo manifest` | | Builds a package's `hozo.manifest.json` | moves from `hozo-manifest` |
| `hozo links` | | Verifies navigation links | moves from `hozo-links` |

The two headline names are a pair from joinery: a **dry fit** assembles the
pieces without glue to see whether they fit; **checking for square** confirms
the assembled piece has not gone out of true. The other names stay plain.

## 3. Conventions every command follows

1. **One public name.** Documentation, `--help` and diagnostic messages use
   the canonical name only. An alias is accepted and listed once in `--help`
   (`alias: doctor`); it appears nowhere else.
2. **Non-interactive by default.** Every prompt has a flag. A missing answer
   in a non-TTY is an error naming the flag, not a hang.
3. **Machine output.** `--format json` on every command, each with its own
   versioned `schemaVersion`. `dry-fit` keeps the audit's schema 3 unchanged;
   renaming a command does not change its output.
4. **One write contract** for every command that edits files (today
   `dry-fit --fix`; later `init` and `add`): dry run printing a unified diff by
   default; `--write` to apply; refuse untracked or uncommitted files, or a
   non-Git checkout, unless `--force`. Running it twice changes nothing the
   second time. A file the command cannot edit safely (a config whose export
   is computed, say) is not edited: the command prints the exact lines to add
   and exits `2`. This is the contract `migration-audit --fix` already has;
   it moves to `@hozo/cli`, it is not rewritten.
5. **Exit codes**: `0` passed, `1` findings at or above `--fail-on`, `2` usage
   or environment error, including a change the command could not make. Same
   on every command. The split is the one a CI step branches on: `1` means
   fix the code, `2` means fix the invocation or the install. Today's audit
   exits `1` for both, so a typo in a flag reads as failing code. Finer
   reasons are not more exit codes: each error carries a string code on
   stderr and in the JSON (`{"error": {"code": "unknown-option", …}}`), which
   `explain` can look up.
6. **Never fail silently.** A check that cannot run says why and what it
   skipped, and the rest of the report still prints.

## 4. Packaging

- **`@hozo/cli`** owns the `hozo` binary and nothing else: argument routing,
  `--help`, aliases, exit codes and the write contract helper. Each command
  is imported lazily from the package that owns its logic, so `hozo explain`
  does not load the compiler addon.
- Command logic stays where it is. `@hozo/migration-audit` keeps exporting
  `runCli`; `dry-fit` and the code half of `square` call it in two modes.
- `@hozo/cli` joins the lockstep release group automatically (`fixed: [["@hozo/*"]]`).
- **Old binaries** keep working for one minor release and print one
  deprecation line to stderr naming the new command. Their stdout and JSON
  stay byte-identical.
- Renaming the `@hozo/migration-audit` *package* is out of scope; the command
  name is what users type.

## 5. Command notes

### `dry-fit`

Today's `migration-audit`, unchanged: Web/Native lowering of an uninstalled
checkout, the report, `--compare`, `--fail-on`, `--fix` / `--write` / `--force`.
`square` becomes the documented home of `--compare` / `--fail-on` for projects
that use Hozo; `dry-fit` keeps them for compatibility.

### `square`

- **Setup** (fast, compiles nothing):
  - `@hozo/*` versions in lockstep;
  - `react-native` and Expo within the peer floor;
  - the bundler adapter installed (`withHozo`, the Vite/Next plugin, plugin
    order);
  - the CSS entry imports Tailwind and, when `@hozo/ui` is present, its theme;
  - `metro.json` and manifests not stale (restart needed);
  - every source file that imports `@hozo/*` lies under a root the candidate
    scan reads, and every Hozo dependency is scanned. The finding names each
    file outside the scan roots.
- **Code**: the audit engine in project mode.
- A fatal setup finding (compiler cannot load, no adapter) skips the code
  half with a stated reason and still prints the setup half.
- On a project with no Hozo dependency, `square` says so and points to `dry-fit`.
- `square --setup` runs only the first half.

### `explain` and `show`

`explain` reads diagnostic metadata shipped with `@hozo/compiler` and the case
that #1548 already requires for every declared diagnostic: when it fires,
why, a failing example and its fix. Offline; no browser.

`show` compiles one file with the project's real theme and options and prints
the output, plus, per class list: its route (compiled, owner callback,
component-resolved, runtime), and each class dropped or refused with its
diagnostic code. It is the terminal stand-in for an editor inspector.

## 6. Plan

Each step is releasable on its own and changes no existing output.

| Step | Work | Exit |
| --- | --- | --- |
| 1 | `@hozo/cli` with routing, help, aliases, exit codes. `hozo dry-fit` / `migration-audit` call `runCli`; `hozo manifest`, `hozo links` call their packages. Old binaries print the deprecation line | Old and new commands produce byte-identical stdout and JSON on the audit fixtures; docs and `llms.txt` use the new names |
| 2 | `hozo square`: setup half, then the code half in project mode; `--setup`; the no-Hozo hint | Each setup check has a failing fixture; a broken install still prints setup findings |
| 3 | `hozo explain`: diagnostic metadata generated from the compiler's codes and #1548's cases | Every `DiagnosticCode` has an entry; CI fails on a new code without one |
| 4 | `hozo show` | Matches the REPL's output for the same source and theme |
| 5 | Remove the old binaries | One minor release after step 1 |

Steps 2–4 can proceed in parallel once step 1 lands.

## 7. Reserved for later RFCs

These names are reserved in `@hozo/cli` now, so no other command takes them.
Each changes a project, so each follows the write contract (§3.4), and each
needs its own RFC.

- **`hozo init`**: adds Hozo to an existing project: detects the framework
  and package manager, installs `@hozo/*` at one version, edits the configs
  each getting-started guide describes, and finishes with `square`. It is
  deferred because editing six frameworks' configs safely is larger than
  everything in §6 together. Until then, the getting-started guides and
  `square`'s setup findings tell a project what to add.
- **`hozo add <component>`**: copies an `@hozo/ui` component into the
  project as source, shadcn/ui style, so the project owns and edits it. The
  RFC for it decides what is copied (the component, its variants, its
  dependencies within `@hozo/ui`), how a copied component is updated later,
  and how the compiler treats it as project code rather than a dependency.
- **`npm create hozo`** (package `create-hozo`): a new project from the
  upstream creator followed by `init`; it depends on `init`.
- **`hozo mcp`**: the commands above as MCP tools. Deferred because
  `--format json` and the exit codes already let an agent run every command
  from a shell; it is reconsidered if a client needs MCP specifically.

## 8. Open questions

- Whether `--fix` belongs to `dry-fit` long-term, or moves to `init` once
  `init` consumes the `dry-fit` report.
- Whether `square`'s JSON embeds the audit's schema 3 as its `code` section
  or defines its own.
- Whether to rename the `@hozo/migration-audit` package after the command
  rename has settled.

## History

- Draft (2026-11-05): first version.
- Draft (2026-11-12): `init`, `npm create hozo` and `mcp` moved to later RFCs;
  `add` reserved for `@hozo/ui` as source; a change a command could not make
  exits `2`, and finer reasons are string codes in the JSON; the
  candidate-scan check stated as a file-to-root comparison.
