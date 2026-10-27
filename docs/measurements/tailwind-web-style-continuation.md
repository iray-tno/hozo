# Web import discovery before final stylesheet publication

After #1332, the completed finite batch can emit scalar winners together, but
an actual Vite transform cannot wait for the final graph: the bundler discovers
that graph by reading its emitted JavaScript. Waiting for every transform from
inside a transform would deadlock. Updating source files at `buildEnd` also does
not retroactively update CSS Vite already processed or parsed JavaScript.

## Boundary

`PreparedWebModule.preview()` borrows the actual owned post-parse IR for ordinary
Web output. It does not consume the module, clone its AST/IR, install a context
or parse the source again. Final `emit(context)` is still one-shot; preview
after emission/disposal fails. This capability is **Web-only**: Native scalar
ordering can change its generated JSX/style arrays.

`prepareLowerModuleStyles` in compiler/lower uses that same primitive handle
after the actual Canvas rewrite. It returns the initial full-module structure
for import discovery and an owned final continuation. Both calls reuse normal
namespace/import/diagnostic finalization. Preview does not publish speculative
semantic observer events; the final pipeline observes them once.

The continuation snapshots the initial code, companion path/name and client
boundary. Final CSS may differ, but any structural difference throws
`TAILWIND_WEB_STRUCTURE_CHANGED` and releases ownership. It cannot silently
replace code the bundler already parsed. This is a checked bounded capability,
not a theorem about all future compiler output.

Ordinary/ready transform callers do not preview. No adapter, stylesheet-loading
mechanism or default winner changes in this layer. An adapter must still own the
authoritative final module graph, revisions, cached transforms and late CSS
delivery before activating these outputs. No post-hoc JavaScript patching or
unsupported cached-module hook is assumed.

## Evidence

CPU1/Idle, serial, Windows Node25/debug. Rust workspace **1,070 passed**, one
existing ignored timing probe; fmt, all-target Clippy warnings-denied and fresh
addon. Compiler **358 passed +one existing privilege skip**, Tailwind **135
passed**. Five new full-pipeline tests cover:

- actual post-Canvas input, one primitive prepare and one borrowed preview, no
  ordinary second primitive parse; final shared-batch CSS changes while JS does not;
- roots, secondary slots, nested Text, mixed StyleX/Tailwind and captured JS guards;
- one final semantic observer event instead of duplicate speculative edits;
- deliberately changed final JSX rejects and consumes/disposes the continuation;
- preview failure, abandoned handles, repeated disposal and no-semantic modules.

The Rust regression checks the actual style Vec address before/after repeated
preview, final output and disposal. This is evidence against cloning that IR
allocation, not a full allocator/heap profile. The normally regenerated Native
text fixture changes two source receipts only, not component bodies/text ABI.

## Cost, not a free staging operation

Three fresh Node25/debug processes, nine alternating samples xthree runs per
route. Both routes include post-Canvas full-module preparation/primitive parsing
and final emission using the same preprepared final context; context/JS Tailwind
setup is excluded. The control uses `prepareLowerModule(...).emit(context)`;
the continuation additionally previews and checks the final structure.
Median microseconds per group:

| Modules | Retained control, three processes | With preview, three processes |
| --- | --- | --- |
| 1 | 281.6 / 295.7 / 289.8 | 379.8 / 364.2 / 399.7 |
| 8 | 2,244.6 / 2,313.4 / 2,201.0 | 2,880.0 / 2,870.4 / 2,897.0 |
| 64 | 15,449.9 / 15,252.3 / 15,428.9 | 20,555.2 / 20,258.5 / 20,018.8 |

This adds about **68–110us** to the one-module fixture and **4.6–5.1ms** at 64
modules. Relative slowdown exceeds the review threshold and is recorded, not
claimed free. All samples remain, including **1.567ms** one-module and
**22.589ms** 64-module continuation maxima. The probe emits each module before
the next; it is not a whole-graph retention/peak-memory or device measurement.
Raw logs and samples: `artifacts/tailwind-order/web-style-continuation`.

Next is real Vite final-graph ownership and publication, then a supported
late-stylesheet delivery route and coordinated adapter graduation. No new
conformance percentage, default cascade, fresh browser/device/AT result, Hermes
timing, whole-project memory or production bundle claim is made here.
