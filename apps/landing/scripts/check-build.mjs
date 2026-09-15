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

import { existsSync, readdirSync, readFileSync } from 'node:fs'
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
  [/<a [^>]*href="https:\/\/github\.com\/iray-tno\/hozo"/.test(html), 'Link did not lower to <a>'],
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
    !/<script(?![^>]*(?:type="application\/ld\+json"|data-analytics))/.test(html),
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
    !/<script(?![^>]*(?:type="application\/ld\+json"|data-analytics))/.test(mdx),
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
    !/<script(?![^>]*(?:type="application\/ld\+json"|data-analytics))/.test(conformance),
    'conformance page shipped JavaScript for static data',
  ],
)

// What a search engine or a link preview reads. The pages are found in the
// build rather than named here, so a page added without `SiteHead` fails
// instead of being skipped. The MDX probe is a test fixture, not a page for
// readers, and is the one that must *not* be indexed.
const sitePages = [
  '',
  ...readdirSync(dist, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name !== 'mdx-example')
    .filter((entry) => existsSync(path.join(dist, entry.name, 'index.html')))
    .map((entry) => `${entry.name}/`),
]
for (const page of sitePages) {
  const head = readFileSync(path.join(dist, page, 'index.html'), 'utf8')
  const label = page === '' ? 'index' : page
  checks.push(
    [/<meta name="description" content="[^"]+"/.test(head), `${label}: no description`],
    [
      new RegExp(`<link rel="canonical" href="https://[^"]+/${page}"`).test(head),
      `${label}: no absolute canonical URL for this page`,
    ],
    [/<meta property="og:title" content="[^"]+"/.test(head), `${label}: no og:title`],
    [/<meta property="og:description" content="[^"]+"/.test(head), `${label}: no og:description`],
    [
      /<meta name="twitter:card" content="summary_large_image"/.test(head),
      `${label}: no large-image twitter card`,
    ],
    [
      /<meta property="og:image" content="https:\/\/[^"]+\/og-image\.png"/.test(head),
      `${label}: no absolute og:image`,
    ],
  )
}

// The card the head points at has to be in the build, and be the size the
// head claims: a 404 or a wrongly sized image is dropped by every preview.
{
  const card = readFileSync(path.join(dist, 'og-image.png'))
  const isPng = card.subarray(1, 4).toString('ascii') === 'PNG'
  checks.push(
    [isPng, 'og-image.png is not a PNG'],
    [
      isPng && card.readUInt32BE(16) === 1200 && card.readUInt32BE(20) === 630,
      `og-image.png is not 1200x630`,
    ],
  )
}
// The site's measurement: Google Analytics and Microsoft Clarity, and
// nothing else under the mark the no-JavaScript assertions above exempt.
// Exactly three tags per page -- the gtag loader, its config, Clarity's
// loader -- each naming only its own origin or ID. The MDX probe is a
// fixture, not a page anyone visits, and carries none.
const ANALYTICS_TAG = /<script\b[^>]*\bdata-analytics\b[^>]*>([\s\S]*?)<\/script>/g
const allowedAnalytics = (tag) =>
  /src="https:\/\/www\.googletagmanager\.com\/gtag\/js\?id=G-5B728NQBSP"/.test(tag) ||
  /gtag\('config',"G-5B728NQBSP"\)/.test(tag) ||
  /https:\/\/www\.clarity\.ms\/tag\/"\+i[\s\S]*"yihnef0iol"/.test(tag)
for (const page of sitePages) {
  const document = readFileSync(path.join(dist, page, 'index.html'), 'utf8')
  const tags = [...document.matchAll(ANALYTICS_TAG)].map((match) => match[0])
  const label = page === '' ? 'index' : page
  checks.push(
    [tags.length === 3, `${label}: expected 3 analytics tags, found ${tags.length}`],
    [tags.every(allowedAnalytics), `${label}: an analytics-marked script is not GA or Clarity`],
  )
}
checks.push([!/data-analytics/.test(mdx), 'the MDX probe page carries analytics'])

checks.push(
  [/"@type":"SoftwareSourceCode"/.test(html), 'the index page carries no JSON-LD'],
  [/<meta name="robots" content="noindex"/.test(mdx), 'the MDX probe page is indexable'],
)

const sitemap = readFileSync(path.join(dist, 'sitemap.xml'), 'utf8')
const llms = readFileSync(path.join(dist, 'llms.txt'), 'utf8')
checks.push(
  [
    (sitemap.match(/<loc>/g) ?? []).length === sitePages.length,
    `the sitemap lists ${(sitemap.match(/<loc>/g) ?? []).length} URLs for ${sitePages.length} pages`,
  ],
  [!sitemap.includes('mdx-example'), 'the sitemap lists the MDX probe'],
  [llms.startsWith('# Hozo\n'), 'llms.txt does not start with its title'],
  [
    /- \[@hozo\/core\]\(https:\/\/www\.npmjs\.com\/package\/@hozo\/core\): \S/.test(llms),
    'llms.txt does not describe @hozo/core',
  ],
  [!llms.includes('@hozo/test-reporter'), 'llms.txt lists a private package'],
)

// The index page's code samples. They are written as JSX, where a `\n`
// typed into text is two characters rather than a line break -- only a
// `{'\n'}` expression is one. All three samples used the typed form at
// their line ends, so the page showed a literal "\n" and ran every line
// together, and nothing here looked at the text.
{
  const decode = (text) =>
    text
      .replace(/<[^>]+>/g, '')
      .replaceAll('&lt;', '<')
      .replaceAll('&gt;', '>')
      .replaceAll('&quot;', '"')
      .replaceAll('&#x27;', "'")
      .replaceAll('&amp;', '&')
  const samplesIn = (markup) =>
    [...markup.matchAll(/<pre\b[^>]*>([\s\S]*?)<\/pre>/g)].map((match) => decode(match[1]))
  const labelOf = (sample) => JSON.stringify(sample.trim().split('\n')[0].slice(0, 40))

  // Every code block on the page: none may show a typed "\n".
  for (const sample of samplesIn(html)) {
    checks.push([
      !sample.includes('\\n'),
      `code sample ${labelOf(sample)} shows a literal "\\n" instead of a line break`,
    ])
  }

  // The side-by-side section's three samples are whole components, so each
  // has to be broken into lines. The integration snippets further down are
  // two or three lines by design and are not held to this.
  const start = html.indexOf('id="code-showcase"')
  const showcase = start === -1 ? '' : html.slice(start, html.indexOf('</section>', start))
  const samples = samplesIn(showcase)
  checks.push([samples.length === 3, `expected 3 side-by-side samples, found ${samples.length}`])
  for (const sample of samples) {
    checks.push([
      sample.trim().split('\n').length >= 8,
      `side-by-side sample ${labelOf(sample)} is not broken into lines`,
    ])
  }
}

for (const [ok, message] of checks) {
  if (!ok) throw new Error(message)
}

console.log(`Astro static-subset check passed (${checks.length} assertions, 0 scripts)`)
