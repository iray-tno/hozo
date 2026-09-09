// Hozo's static subset, rendered by Astro with no island.
//
// The interesting claim is not that it renders -- React renders anything
// server-side -- but that the page ships *no JavaScript for it*. Astro only
// hydrates a component carrying a `client:` directive, so a component built
// from primitives that need nothing at run time can be used on a static
// page for free. Eleven of Hozo's seventeen are in that set; the other six
// each need a client boundary, and an island is what that costs.
//
// Checked here rather than assumed, because the failure is silent in the
// direction that matters: adding one interactive primitive would still
// build, still render, and quietly start shipping React.

import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

// Which build to read, because there is more than one.
//
// `build` and `test` both run `astro build`, and turbo starts them
// together: `test` depends on `^build`, its dependencies' builds, not its
// own. Sharing `dist` had them writing and deleting each other's files
// mid-build, which surfaced as Astro crashing inside its own prerender
// step -- twice, with two different messages, neither naming the cause
// (#322).
const dist = process.argv[2] ?? 'dist'

const html = readFileSync(path.join(dist, 'index.html'), 'utf8')
const mdx = readFileSync(path.join(dist, 'mdx-example', 'index.html'), 'utf8')

/** Hozo's compiled class names, matched by shape rather than spelled. */
const GENERATED_CLASS = /\bhozo-[a-z0-9]+-r\d+-\d+\b/

/**
 * Every rule the page carries, from a file or from the document.
 *
 * The `<style>` half is not belt and braces. Astro inlines a stylesheet
 * under its size threshold, so whether this page's CSS is a file at all
 * depends on how much CSS the rest of the site happens to have -- adding
 * one page moved it from `dist/_astro/index.*.css` into the HTML, and a
 * check that only read the directory then reported that Hozo had emitted
 * no CSS.
 */
const stylesheets = [
  ...readdirSync(path.join(dist, '_astro'))
    .filter((name) => name.endsWith('.css'))
    .map((name) => readFileSync(path.join(dist, '_astro', name), 'utf8')),
  ...[...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((match) => match[1]),
].join('\n')

const checks = [
  // The primitives became plain HTML with compiled class names.
  [GENERATED_CLASS.test(html), 'no Hozo-generated class reached the page'],
  [/<section class="[^"]*hozo-/.test(html), 'Section did not lower to <section>'],
  [/<h2 class="[^"]*hozo-/.test(html), 'Heading level={2} did not lower to <h2>'],
  [/<ol|<ul/.test(html), 'List did not lower to a list element'],
  [/<a href="https:\/\/github.com\/iray-tno\/hozo"/.test(html), 'Link did not lower to <a>'],
  // Not "`@hozo/core` is absent from the page": this page is *about*
  // Hozo, so the name is in its copy and in its code samples. The claim
  // that matters is the one below -- a page with no script cannot have
  // imported anything.

  // The companion stylesheet was bundled, and with real declarations --
  // a class in the markup that matches no rule is a style that silently
  // never applies.
  [GENERATED_CLASS.test(stylesheets), 'no Hozo-generated CSS in the build output'],
  [/padding:\s*32px/.test(stylesheets), 'the compiled padding is missing'],

  // And the point of the exercise. Astro emits its React client entry as
  // an unreferenced chunk once the integration is registered, so the
  // question is what the *page* loads, not what the directory contains.
  [!/<astro-island/.test(html), 'something hydrated: an island reached the page'],
  [
    !/<script(?![^>]*type="application\/ld\+json")/.test(html),
    'the page shipped JavaScript for a component that needs none',
  ],
]

// The same component reached from MDX rather than from `.astro`, which
// is a different path through Astro and worth its own assertions -- and
// the page carries two of them: a component imported from a `.tsx`, and a
// primitive written inline in the Markdown.
//
// The inline one is #137, and it is why these assertions matter more than
// the rest of this file. `@astrojs/mdx` exposes no `jsx: true`, so Hozo is
// handed `_jsx()` calls rather than JSX, and for as long as that was true
// the inline primitive rendered with its class names passing through
// uncompiled. It *looked* right here, because this app also runs Tailwind
// over the same tree and Tailwind generated `.p-4` for it -- a Hozo-only
// project lost the styling entirely, with nothing reported at build or at
// run time. So the check is that the class is a *generated* one, which
// Tailwind cannot produce and only lowering can.
//
// Both are found by the text they contain rather than by position, so
// editing the prose around them cannot quietly disarm the check -- and by
// the text rather than by a marker attribute, because an *uncompiled*
// primitive renders through `@hozo/core`'s real component, which drops a
// prop it does not model. Anchoring on one would have made "did not
// lower" and "is not on the page" the same failure.
const inline = /<div class="([^"]*)"[^>]*><span class="([^"]*)">inline in Astro MDX</.exec(mdx)
checks.push(
  [GENERATED_CLASS.test(mdx), 'the imported component did not lower on the MDX page'],
  [/<section class="[^"]*hozo-/.test(mdx), 'Section did not lower on the MDX page'],
  [Boolean(inline), 'the inline primitive is not on the MDX page at all'],
  [
    Boolean(inline) && GENERATED_CLASS.test(inline[1]),
    'the inline primitive did not lower: its className passed through uncompiled (#137)',
  ],
  [
    Boolean(inline) && GENERATED_CLASS.test(inline[2]),
    'the primitive nested inside the inline one did not lower (#137)',
  ],
  [!/<astro-island/.test(mdx), 'the MDX page hydrated something'],
  [
    !/<script(?![^>]*type="application\/ld\+json")/.test(mdx),
    'the MDX page shipped JavaScript for a component that needs none',
  ],
)

// The automated conformance matrix page, generated directly from snapshot.json.
// It must render the live figures and also ship no client scripts or islands.
const conformance = readFileSync(path.join(dist, 'conformance', 'index.html'), 'utf8')
const snapshot = JSON.parse(
  readFileSync(path.join('..', '..', 'packages', 'tailwind-conformance', 'snapshot.json'), 'utf8'),
)

checks.push(
  [conformance.includes('Cross-Platform'), 'conformance page did not render title'],
  [conformance.includes(snapshot.versions.tailwind), 'conformance page missing tailwind version'],
  [conformance.includes(snapshot.versions.reactNative), 'conformance page missing RN version'],
  [
    conformance.includes(snapshot.catalogue.match.toLocaleString()),
    'conformance page missing catalogue count',
  ],
  [!/<astro-island/.test(conformance), 'conformance page hydrated an island unexpectedly'],
  [
    !/<script(?![^>]*type="application\/ld\+json")/.test(conformance),
    'conformance page shipped JavaScript for static data',
  ],
)

for (const [ok, message] of checks) {
  if (!ok) throw new Error(message)
}

console.log(`Astro static-subset check passed (${checks.length} assertions, 0 scripts)`)
