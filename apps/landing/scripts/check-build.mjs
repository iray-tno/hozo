// Hozo's static subset, rendered by Astro with no island.
//
// The interesting claim is not that it renders -- React renders anything
// server-side -- but that the page ships *no JavaScript for it*. Astro only
// hydrates a component carrying a `client:` directive, so a component built
// from primitives that need nothing at run time can be used on a static
// page for free. Interactive components need a client boundary, and an
// island is what that costs. The homepage now explicitly includes one
// visible-only 3D island; the separate MDX probe remains entirely static.
//
// Checked here rather than assumed, because the failure is silent in the
// direction that matters: adding one interactive primitive would still
// build, still render, and quietly start shipping React.

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { CODE_SNIPPETS } from '../src/lib/code-snippets.ts'
import { uiNativeStatusChecks } from './ui-native-status-checks.mjs'

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
  [
    mdx.includes('const staticCode = true') &&
      mdx.includes('const wrappedCode = true') &&
      mdx.includes('Build-time code'),
    'the static code probe did not render its code lines and wrapped figure',
  ],
  [html.includes('id="try-hozo"'), 'the home page has no showcase entry section'],
  // @hozo/ui, server-rendered by Hozo: a real <button> and <input>, and a
  // link to each component page that exists.
  [
    /id="ui-components"[\s\S]*<input [^>]*placeholder="you@example.com"[\s\S]*<button [^>]*>Subscribe<\/button>/.test(
      html,
    ),
    'the @hozo/ui section did not render its components',
  ],
  ...['button', 'input', 'card', 'dialog'].map((slug) => [
    html.includes(`href="/hozo/docs/components/${slug}/"`) &&
      existsSync(path.join(dist, 'docs', 'components', slug, 'index.html')),
    `the @hozo/ui section does not link to a built ${slug} page`,
  ]),
  [
    html.includes('href="#main-content"') && html.includes('id="main-content" tabindex="-1"'),
    'the keyboard skip link has no focusable destination',
  ],
  [
    !html.includes('/releases/latest/download/'),
    'the page advertises unverified latest-release files',
  ],
  // The primitives became plain HTML with compiled class names.
  [GENERATED_CLASS.test(html), 'no Hozo-generated class reached the page'],
  [/<section class="[^"]*hozo-/.test(html), 'Section did not lower to <section>'],
  [/<h2 class="[^"]*hozo-/.test(html), 'Heading level={2} did not lower to <h2>'],
  [/<ol|<ul/.test(html), 'List did not lower to a list element'],
  [/<a [^>]*href="https:\/\/github\.com\/iray-tno\/hozo"/.test(html), 'Link did not lower to <a>'],
  // Not "`@hozo/core` is absent from the page": this page is *about*
  // Hozo, so the name is in its copy and in its code samples. The claim
  // that matters is the static MDX probe and the exact interactive-island
  // boundary below, not whether the name occurs anywhere in the page.

  // The companion stylesheet was bundled, and with real declarations --
  // a class in the markup that matches no rule is a style that silently
  // never applies.
  [GENERATED_CLASS.test(stylesheets), 'no Hozo-generated CSS in the build output'],
  [/padding:\s*32px/.test(stylesheets), 'the compiled padding is missing'],

  // And the point of the exercise. Astro emits its React client entry as
  // an unreferenced chunk once the integration is registered, so the
  // question is what the *page* loads, not what the directory contains.
  [(html.match(/<astro-island\b/g) ?? []).length === 1, 'expected only the Kumimono island'],
  [/component-url="[^"]*Kumimono\./.test(html), 'the interactive island is not Kumimono'],
  [/client="visible"/.test(html), 'the 3D island must hydrate only when visible'],
  [!/<astro-island/.test(mdx) && !/<script/.test(mdx), 'the static MDX probe shipped JavaScript'],
  [mdx.includes('>Migration.tsx</figcaption>'), 'the opted-in MDX fence has no named figure'],
  [
    mdx.includes('>Plain &lt;fallback&gt; &amp; metadata</figcaption>'),
    'the nested fallback fence lost its literal metadata',
  ],
  [
    (mdx.match(/<ins\b/g) ?? []).length === 2 &&
      (mdx.match(/<del\b/g) ?? []).length === 1 &&
      (mdx.match(/<mark\b/g) ?? []).length === 1,
    'MDX fence line marks did not reach semantic elements',
  ],
  [mdx.includes('&lt;/script&gt;&lt;script&gt;'), 'MDX source was not preserved as escaped text'],
  [!mdx.includes('class="expressive-code"'), 'the opted-in fence reached the default highlighter'],
  [
    readFileSync(
      path.join(dist, 'docs', 'getting-started', 'astro', 'index.html'),
      'utf8',
    ).includes('data-hozo-docs-code='),
    'ordinary documentation fences did not reach the shared CodeBlock renderer',
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
// The API counters are deliberately not described as a pixel/device pass.
// Keep that distinction and the path to the executable evidence visible.
for (const text of [
  'SVG filter elements',
  `${snapshot.svgFilterWeb.covered} / ${snapshot.svgFilterWeb.total} Web`,
  `${snapshot.svgFilterNative.covered} / ${snapshot.svgFilterNative.total} Native`,
  'not prop parity, pixel equivalence or device rendering',
  'packages/tailwind-conformance/src/svg-filters.test.ts',
]) {
  checks.push([conformance.includes(text), `SVG filter report is missing: ${text}`])
}

checks.push(
  [conformance.includes('measured against the originals'), 'conformance page did not render title'],
  // The figures the old page hard-coded, and got wrong: they come from the
  // snapshot now, so the page can no longer say what the snapshot does not.
  [!conformance.includes('100%'), 'conformance page wrote a percentage it did not compute'],
  [
    conformance.includes(
      `${snapshot.a11yContracts.primitives - snapshot.a11yContracts.uncontracted} of ${snapshot.a11yContracts.primitives} primitives`,
    ),
    'conformance page missing how many primitives have a contract',
  ],
  [
    conformance.includes(`${snapshot.diagnostics.fires} / ${snapshot.diagnostics.declared}`),
    'conformance page missing the diagnostics that fire',
  ],
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
// readers, and is the one that must *not* be indexed. `docs/` is read all
// the way down: its pages are Starlight's, with DocsHead added, and each one
// is a page a search result can land on.
function pagesUnder(directory) {
  return readdirSync(path.join(dist, directory), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((entry) => {
      const page = `${directory}${entry.name}/`
      const here = existsSync(path.join(dist, page, 'index.html')) ? [page] : []
      return page.startsWith('docs/') ? [...here, ...pagesUnder(page)] : here
    })
}
const sitePages = ['', ...pagesUnder('').filter((page) => page !== 'mdx-example/')]
const docsPages = sitePages.filter((page) => page.startsWith('docs/'))
checks.push([docsPages.length >= 70, `only ${docsPages.length} docs pages were found in the build`])

// The domain, package reference, and migration case-study pages in /docs:
// each one renders its heading/content and ships no client island.
for (const [docPath, expectedText] of [
  ['guides/tailwind', 'loadProjectTheme'],
  ['guides/stylex', '505/522'],
  ['graphics-and-media/svg', 'FeGaussianBlur'],
  ['graphics-and-media/canvas', 'Canvas.TriangleMesh'],
  ['graphics-and-media/three', '@hozo/three/webgpu'],
  ['graphics-and-media/media', 'useWebVTTCaptions'],
  ['graphics-and-media/webview', 'react-native-webview'],
  ['reference/primitives', 'primitives, each compiled through both backends'],
  ['reference/patterns-and-form', 'CalendarDate'],
  ['reference/behaviors', 'FloatingPositioner'],
  ['reference/navigation', 'createExpoRouterNavigationPrimitives'],
  ['reference/typography-and-fonts', 'createFontAvailability'],
  ['reference/native', 'moveAccessibilityFocus'],
  ['reference/rn-compat', 'TouchableWithoutFeedback'],
  ['migration/migration-audit', 'reactNativeImportDecisions'],
  ['migration/bluesky-case-study', 'bluesky-social/social-app'],
]) {
  const file = path.join(dist, 'docs', ...docPath.split('/'), 'index.html')
  const pageHtml = existsSync(file) ? readFileSync(file, 'utf8') : ''
  checks.push(
    [
      pageHtml.includes(expectedText),
      `docs/${docPath}: missing expected content (${expectedText})`,
    ],
    [!/<astro-island/.test(pageHtml), `docs/${docPath}: shipped an unexpected island`],
  )
}

// The docs overview renders the README's component, compiled by this
// build, and says it ships no JavaScript for it. Both are checked: the
// preview is a lowered <section> with generated classes, and the page has
// no island. (The printed output's class names differ from the preview's:
// the hash is of the file's path, and the printed copy is compiled from
// the source alone.)
{
  const overview = readFileSync(path.join(dist, 'docs', 'index.html'), 'utf8')
  const stage = overview.match(/class="hozo-example-stage[^"]*">([\s\S]*?)<\/div>/)?.[1] ?? ''
  checks.push(
    [
      /<section class="hozo-view hozo-[a-z0-9]+-r\d+-\d+" aria-label="Welcome">/.test(stage),
      'docs overview: the example did not render as a lowered, named <section>',
    ],
    [/<h2 class="hozo-/.test(stage), 'docs overview: the example heading did not lower to <h2>'],
    [!/<astro-island/.test(overview), 'docs overview: the example shipped an island'],
  )
}
// The styles guide shows the conditional tier: one chip active, two not.
// The class that carries the condition is on exactly one of the three, so
// the preview really rendered both branches of the compiled `cx`.
{
  const guide = readFileSync(path.join(dist, 'docs', 'guides', 'styles', 'index.html'), 'utf8')
  const stage = guide.match(/class="hozo-example-stage[^"]*">([\s\S]*?)<figcaption/)?.[1] ?? ''
  const chips = [...stage.matchAll(/<div class="(hozo-view hozo-[^"]*)"/g)].map(([, c]) => c)
  const conditional = chips.filter((c) => /hozo-cond-/.test(c))
  checks.push(
    [chips.length === 3, `docs styles: expected 3 lowered chips, found ${chips.length}`],
    [
      conditional.length === 1,
      `docs styles: expected the condition class on 1 chip, found ${conditional.length}`,
    ],
    [!/<astro-island/.test(guide), 'docs styles: the example shipped an island'],
  )
}
// The component pages are the opposite case: @hozo/ui previews a reader can
// press and type into, so each is one island that hydrates when visible.
// It is also server-rendered, so the component is in the HTML before any
// script runs -- the element each one lowers to is checked inside it.
for (const [page, element] of [
  ['button', /<button [^>]*type="button"[^>]*>Accent<\/button>/],
  ['input', /<label for="[^"]+"[^>]*>Email/],
  ['card', /<h3 class="[^"]*">Weekly report<\/h3>/],
  ['dialog', /<dialog\b/],
  ['checkbox', /<button [^>]*role="checkbox" aria-checked="mixed"/],
  ['switch', /<button [^>]*role="switch" aria-checked="true"/],
  ['radio-group', /<div role="radiogroup" aria-label="Shipping"/],
  ['segmented-control', /<div role="radiogroup" aria-label="Range" aria-orientation="horizontal"/],
  ['slider', /<div role="slider" aria-label="Volume"/],
  ['text-area', /<textarea [^>]*maxLength="160"/],
  ['native-select', /<select\b/],
  ['badge', /<span aria-hidden="true">99\+<\/span>/],
  ['alert', /Your session expires in two minutes\./],
  ['avatar', /<span role="img" aria-label="Ada Lovelace, online"/],
  ['skeleton', /<div [^>]*aria-hidden="true"[^>]*data-hozo-skeleton=""/],
  ['tabs', /<div role="tablist" aria-label="Product"/],
  ['accordion', /<h3[^>]*><button [^>]*aria-expanded="true"/],
  ['popover', /<button [^>]*aria-haspopup="dialog" aria-expanded="false"[^>]*>Shipping<\/button>/],
  ['menu', /<button [^>]*aria-haspopup="menu" aria-expanded="false"[^>]*>Actions<\/button>/],
  // A drawer and a sheet are closed until pressed, so only the opener is there.
  ['drawer', /<button [^>]*>Open navigation<\/button>/],
  ['bottom-sheet', /<button [^>]*>Filters<\/button>/],
  ['tooltip', /<button [^>]*>Save<\/button>/],
  ['listbox', /<div role="listbox" aria-label="Languages"[^>]*aria-multiselectable="true"/],
  ['combobox', /<input [^>]*role="combobox" aria-label="Country"/],
  ['tree', /<div role="tree" aria-label="Repository"/],
  ['calendar', /<table role="grid"/],
  ['date-picker', /<button [^>]*aria-haspopup="dialog"[^>]*>.*Pick a day/],
  ['date-range-picker', /<button [^>]*aria-haspopup="dialog"[^>]*>.*Pick your dates/],
  ['date-time-picker', /<button [^>]*aria-haspopup="dialog"[^>]*>.*Pick a moment/],
  ['time-picker', /role="spinbutton"[^>]*aria-label="Hour" aria-valuenow="9"/],
  // One tab stop: the first item 0, the rest -1 (a Button that dropped the
  // roving tabIndex left every item in the tab order).
  [
    'toolbar',
    /<div role="toolbar" aria-label="Formatting"[^>]*><button [^>]*tabindex="0"[^>]*>Bold<\/button><button [^>]*tabindex="-1"/,
  ],
  ['pagination', /<nav [^>]*aria-label="Pagination"/],
  ['stepper', /Step 2 of 4: Address, current/],
  ['color-picker', /role="radiogroup"[^>]*aria-label="Presets"/],
  ['command-palette', /<button [^>]*>Open the command palette<\/button>/],
  ['file-dropzone', /<button [^>]*aria-label="Upload a photo"/],
  ['otp-input', /autoComplete="one-time-code"/],
  ['form', /<form [^>]*aria-label="Newsletter"/],
  ['stack', />centred<\/span>/],
]) {
  const html = readFileSync(path.join(dist, 'docs', 'components', page, 'index.html'), 'utf8')
  const islands = html.match(/<astro-island\b[\s\S]*?<\/astro-island>/g) ?? []
  checks.push(
    [islands.length === 1, `docs components/${page}: expected 1 island, found ${islands.length}`],
    [/client="visible"/.test(islands[0] ?? ''), `docs components/${page}: not hydrated on visible`],
    [
      element.test(islands[0] ?? ''),
      `docs components/${page}: the preview was not server-rendered`,
    ],
  )
}
// The React Native line under each preview, from the compiler's verdict
// (#1165). The bottom sheet's grabber is a `before:` box React Native cannot
// draw; the button's look has nothing Web-only but a transition.
{
  const line = (page) =>
    /<div class="hozo-ui-native[^"]*" data-native-missing="(\d+)" data-native-unapplied="(\d+)">([\s\S]*?)<\/div>/.exec(
      readFileSync(path.join(dist, 'docs', 'components', page, 'index.html'), 'utf8'),
    )
  const sheet = line('bottom-sheet')
  const button = line('button')
  const status = JSON.parse(
    readFileSync(new URL('../src/data/ui-native-status.json', import.meta.url), 'utf8'),
  )
  for (const [page, expected] of Object.entries(status)) {
    checks.push(
      ...uiNativeStatusChecks(
        readFileSync(path.join(dist, 'docs', 'components', page, 'index.html'), 'utf8'),
        expected,
        page,
      ),
    )
  }
  checks.push(
    [button?.[2] === '0', 'docs components/button: a class prop is listed as unapplied'],
    [Number(sheet?.[1]) > 0, 'docs components/bottom-sheet: no React Native line listing classes'],
    [
      /before:block/.test(sheet?.[3] ?? ''),
      'docs components/bottom-sheet: the grabber is not listed',
    ],
    [
      button?.[1] === '0',
      'docs components/button: the React Native line is missing or lists classes',
    ],
  )
}
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

// #704. The product's name in the one <h1>, hidden only visually; the
// breadcrumb in the footer and as structured data; and the crawler and
// Search Console tags in the head of every indexed page.
const h1 = html.match(/<h1\b[\s\S]*?<\/h1>/)?.[0] ?? ''
checks.push(
  [(html.match(/<h1\b/g) ?? []).length === 1, 'the index page does not have exactly one <h1>'],
  [/>Hozo — </.test(h1), 'the <h1> does not name Hozo'],
  [/"@type":"BreadcrumbList"/.test(html), 'the index page carries no BreadcrumbList'],
  [
    (() => {
      // Structured data names the page by the URL its canonical tag uses.
      const canonical = html.match(/<link rel="canonical" href="([^"]+)"/)?.[1]
      return (
        canonical !== undefined &&
        html.includes(`"url":"${canonical}"`) &&
        html.includes(`"name":"Hozo","item":"${canonical}"`)
      )
    })(),
    "the index page's JSON-LD names a different URL from its canonical tag",
  ],
  [
    /<nav [^>]*aria-label="Breadcrumb"[\s\S]*?href="https:\/\/iray-tno\.github\.io\/"/.test(html),
    'the footer breadcrumb does not link to iray-tno.github.io',
  ],
)
for (const page of sitePages) {
  const document = readFileSync(path.join(dist, page, 'index.html'), 'utf8')
  const label = page === '' ? 'index' : page
  checks.push(
    [
      /<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1"/.test(
        document,
      ),
      `${label}: no robots directive for previews and snippets`,
    ],
    [
      /<meta name="google-site-verification" content="Bi3E2hIYlL4dUq-rWPnj6Qklwt7RR4_kLA4KZCpN3xI"/.test(
        document,
      ),
      `${label}: no Search Console verification tag`,
    ],
  )
}

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
  const install =
    [...html.matchAll(/<figure\b[^>]*>[\s\S]*?<\/figure>/g)]
      .map(([markup]) => markup)
      .find((markup) => markup.includes('>Install Hozo</figcaption>')) ?? ''
  const installCode = samplesIn(
    install.replaceAll('<span style="display:flex;min-width:100%">', '\n'),
  )[0]?.slice(1)
  checks.push([
    installCode === 'pnpm add @hozo/core\npnpm add -D @hozo/vite @hozo/compiler',
    'the quick install mixes runtime and development dependencies',
  ])

  // Every code block on the page: none may show a typed "\n".
  for (const sample of samplesIn(html)) {
    checks.push([
      !sample.includes('\\n'),
      `code sample ${labelOf(sample)} shows a literal "\\n" instead of a line break`,
    ])
  }

  // CodeLines renders each logical line as a flex row, without adding a
  // newline text node. Count those rows as well as the older plain snippets.
  // The integration snippets further down are
  // two or three lines by design and are not held to this.
  const start = html.indexOf('id="code-showcase"')
  const showcase = start === -1 ? '' : html.slice(start, html.indexOf('</section>', start))
  const samples = samplesIn(showcase.replaceAll('<span style="display:flex;min-width:100%">', '\n'))
  checks.push([samples.length === 3, `expected 3 side-by-side samples, found ${samples.length}`])
  for (const sample of samples) {
    checks.push([
      sample.trim().split('\n').length >= 8,
      `side-by-side sample ${labelOf(sample)} is not broken into lines`,
    ])
  }

  // Compare rendered text, so neither JSX escaping nor the page compiler can
  // quietly change an example while the highlighter's unit tests still pass.
  for (const [name, snippet] of Object.entries(CODE_SNIPPETS)) {
    const page =
      name === 'philosophy' ? html : readFileSync(path.join(dist, name, 'index.html'), 'utf8')
    const figure =
      [...page.matchAll(/<figure\b[^>]*>[\s\S]*?<\/figure>/g)]
        .map(([markup]) => markup)
        .find((markup) => markup.includes(`>${snippet.title}</figcaption>`)) ?? ''
    const rendered = samplesIn(
      figure.replaceAll('<span style="display:flex;min-width:100%">', '\n'),
    )[0]
    checks.push(
      [Boolean(figure), `${name}: the named code figure is missing`],
      [rendered?.slice(1) === snippet.code, `${name}: the built example differs from its source`],
      [
        !/<button\b|tabindex=|<astro-island\b/.test(figure),
        `${name}: the static example became interactive`,
      ],
      [
        (page.match(/<astro-island\b/g) ?? []).length === 1,
        `${name}: expected only its existing demo island`,
      ],
    )
  }
  for (const [route, titles, islands] of [
    ['tailwind', ['Chip.tsx', 'Web', 'iOS and Android'], 2],
    ['stylex', ['Source', 'Web', 'iOS and Android'], 1],
    ['svg', ['SVG filter source'], 1],
  ]) {
    const page = readFileSync(path.join(dist, route, 'index.html'), 'utf8')
    checks.push([
      (page.match(/<astro-island\b/g) ?? []).length === islands,
      `${route}: unexpected island count for live listings`,
    ])
    for (const title of titles)
      checks.push([
        page.includes(`>${title}</figcaption>`),
        `${route}: missing named code figure ${title}`,
      ])
  }
}

for (const [ok, message] of checks) {
  if (!ok) throw new Error(message)
}

console.log(
  `Astro static-subset check passed (${checks.length} assertions, one 3D island; static probe has no scripts)`,
)
