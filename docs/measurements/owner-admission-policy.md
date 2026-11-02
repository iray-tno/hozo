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
