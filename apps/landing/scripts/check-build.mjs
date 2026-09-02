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

const html = readFileSync(path.join('dist', 'index.html'), 'utf8')

/** Hozo's compiled class names, matched by shape rather than spelled. */
const GENERATED_CLASS = /\bhozo-[a-z0-9]+-r\d+-\d+\b/

const stylesheets = readdirSync(path.join('dist', '_astro'))
  .filter((name) => name.endsWith('.css'))
  .map((name) => readFileSync(path.join('dist', '_astro', name), 'utf8'))
  .join('\n')

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

for (const [ok, message] of checks) {
  if (!ok) throw new Error(message)
}

console.log(`Astro static-subset check passed (${checks.length} assertions, 0 scripts)`)
