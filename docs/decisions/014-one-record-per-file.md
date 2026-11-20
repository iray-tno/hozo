# 14. What one file tells the build about itself is one record, read once

**Status:** decided
**Date:** 2026-11-20
**Issue:** #1307

## Why

The Rust core compiles one file at a time (#656). What a file needs to know
about the files it imports reaches it through separate channels, and each new
channel has brought its own pass over every project file:

| Fact | Producer, per file | Stored | Read again by |
| --- | --- | --- | --- |
| Class candidates | `CandidateCache.scanFile` | `candidates.json`, by mtime | — |
| StyleX summary | `summarizeStylexModule` | `stylex-modules.json`, by mtime and content hash | — |
| Ordering names | `scanTailwindOrderCandidates` | nowhere | Metro, Vite and Next each read every file again at startup |
| Class helpers | `classHelperCandidates`, `summarizeClassHelpers` | an in-process map | Metro at startup, Vite per transform |
| Project text forwarding | `inspectStaticModuleImports`, `summarizeTextForwarding` | nowhere | Metro at startup |

`scanProject` (`packages/compiler/src/project.ts`) reads each file once for the
first two. The ordering seed (`packages/metro/src/project.ts:176`,
`packages/vite/src/index.ts`, `packages/next/src/index.ts`),
`projectClassHelpers` and `projectTextForwarding` (`project.ts`) each read it
again. Each of these runs its own Rust parse.

Measured on `examples/native-showcase` (100 files, warm caches), Hozo's startup
is about 0.5 s. About 300 ms of that is these extra passes; the Tailwind work
itself is about 60 ms (#1307). Nobody waits long on it. The cost that matters is
the next fact: project text forwarding (3abf3491) was the fifth channel, with
its own storage and its own invalidation, and nothing pointed it anywhere else.

## The decision

**One record per file, produced in one read, stored once.**

- **What it holds.** Every fact the build derives from one file's source alone:
  - its candidate facts, as `CandidateCache.exportFile` writes them, replayed
    with `importFile`;
  - its ordering names;
  - its static import specifiers;
  - the class helpers it imports, and the ones it exports;
  - its text-forwarding summary (components and re-exports);
  - its StyleX summary.
- **How it is keyed.** By absolute path, current while the file's mtime is
  unchanged, with the content hash deciding whether a consumer's answer could
  have changed (as `StylexModuleCache` does today).
- **Where it lives.** One file under `node_modules/.hozo`, with a schema
  version. A record of an older schema is recomputed, not migrated.
- **Who produces it.** One function, given a path and its source. It applies
  the cheap guards the passes apply today, such as skipping the StyleX parse
  when the source never mentions StyleX.
- **Who reads it.** Every channel is derived from records, never from source:
  - the candidate set;
  - the ordering seed;
  - class helpers (the importer's record, then the target's);
  - project text forwarding (the importer's imports, then each target's
    summary, re-exports followed through records);
  - the StyleX graph.

  A file a channel needs that is not in the walk, such as a helper outside
  `content`, gets a record the same way, on demand.

**A new cross-file fact is a new field on this record.** It gets the record's
keying and invalidation, and adds no pass and no store.

**The package manifest is the record's shipped form.** A package's manifest
holds the same facts, computed once for its published entry by the same
producers: `textForwarding` from `summarizeTextForwarding`, `candidates` from
`CandidateCache`. What differs is the lifetime, and the difference is real. A
manifest is immutable and needs no invalidation, which is the property Metro
needs, because it cannot re-transform a caller when a dependency changes. A
record changes on every edit. So the two keep their own files. A fact added to
the record that a caller of a package would also need is added to the manifest
in the same change.

## What does not change

- What any channel produces. Every derived answer is the one today's pass gives
  for the same sources, which is what each step's tests hold.
- When a running bundler sees a change. Metro still needs a restart for an
  edited helper or forwarding component; Vite still watches what it read.
- The Tailwind snapshot. It is configuration, not a fact about a file.

## Rejected

- **Folding project facts into the manifest file.** That would give the manifest
  invalidation, or give project facts none. Either loses what one of them is
  for.
- **A Rust-owned store for everything, now.** `CandidateCache` already owns its
  facts natively, and its export and import calls let the record carry them
  without moving it. One Rust call that returns every fact from one parse is a
  later step, taken only if measured worth it (#1307's plan, step 3).
- **Keeping a channel per fact.** That is how five came about.

## Evidence

- `packages/compiler/src/project.ts`: `scanProject` (one read, two facts),
  `projectClassHelpers`, `projectTextForwarding`, `helperExports`.
- `packages/compiler/src/stylex-project.ts`: `StylexModuleCache`, the keying
  this record adopts.
- `packages/compiler/src/index.ts`: `CandidateCache.exportFile` and
  `importFile`.
- #1307's comments: the channel table on `1b655da6`, and the startup timings
  with their correction.

## Reopen when

- A fact needs more than one file's source to compute. It belongs to a channel
  derived from records, not to the record.
- The record's store is itself the slow part of a startup.
