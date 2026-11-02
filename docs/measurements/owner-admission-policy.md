# Owner admission: ordinary fallback is a pre-output decision

Strict source-graph assessment remains useful evidence, but it cannot become an
ordinary build default if an unsupported input makes an otherwise valid app
unbuildable. Admission must distinguish an expected scope limitation from an
invalid snapshot or a compiler/plugin bug.

`ViteOwnerPreflightUnavailable` identifies only unresolved requests, unsupported
physical/module formats and bounded dependency-source budgets during capture.
It is not inferred from an error-message prefix. Before that refusal is exposed,
all previously observed source bytes, package boundaries, importer identities,
metadata and manifest observations are revalidated. An unsupported later edge
cannot mask an earlier source/manifest race.

Input invalidation, malformed manifests, unexpected parser/backend/plugin errors
and late graph participants keep their ordinary fatal errors. Once prepared
code/CSS has been published, changing route is forbidden: fail/rebuild instead
of mixing ordinary and prepared namespaces. This first layer only types the
preflight distinction; it neither adds fallback nor changes `hozo()` defaults.

## Internal build admission policy

The existing internal source-observed entry accepts `ordinary-fallback` as an
explicit preflight policy; its default remains strict. A typed refusal selects
the ordinary compiler/cache/CSS path before package contributions or dependency
caller admission. A warning and module metadata identify that route, rather
than disguising it as a successful capture. The emitted code/CSS is compared
byte-for-byte with ordinary `hozo()` on an actual Vite raw-import fixture.

The refusal retains its observed-input guard and watches through publication.
Warm transform checks do no IO; watcher retirement/build replacement fences
pending async output. Final build/output boundaries revalidate observed bytes,
metadata/manifests/identities and the configured source set. There is no catch
around lowering or late graph verification, so those failures cannot switch an
already emitted namespace. Normal `hozo()` options/defaults remain unchanged.

## Rebuild and publication evidence

The same configured plugin is exercised through ordinary fallback, captured
output and ordinary fallback again. Each build replaces code, companion CSS,
package inventory and route metadata; the former prepared namespace is absent
after returning to ordinary output. Source/manifest edits at `generateBundle`
fail publication even on fallback. A retired guard cannot recover when original
bytes are restored. A plugin-generated late participating dependency fails the
captured build rather than changing routes after code has been emitted.

## Root collection budgets

The 512-file/512-request static owner-analysis limit is unchanged. A configured
root file-count or aggregate edge-count refusal can now choose ordinary output
before dependency resolution. The ordinary project scan/content scope is not
truncated to fit that owner limit. Before adopting fallback, all configured
root bytes are protected by a separate bounded no-parser guard (4096 files,
4 MiB per file, 32 MiB total). If that guard cannot be established, the build
fails; no unchecked ordinary snapshot is published. Root source-set membership
is also rechecked at publication.

The direct strict collector refuses too many roots before reading them. Its
refusal does not claim those files were inspected. Admission adds the whole-root
guard, including unimported files, before any ordinary output. Malformed source,
native parser errors and root byte-size failures still remain fatal, not
message-matched fallback cases. A 514-file actual Vite fixture verifies ordinary
output/inventory and fatal late edits to an unimported source.
