// The site's pages, for search engines.
//
// Read off the `.astro` pages and the docs collection rather than listed, so
// a page added later is in the sitemap without anyone remembering it. The
// MDX probe is a `.mdx` file and a build check rather than a page for
// readers, so it is not.
//
// There is no `robots.txt` to point at this: GitHub Pages serves the project
// site under `/hozo/`, and crawlers only read `/robots.txt` at the host root,
// which this repository does not control. Submit this URL to a search
// console directly.

import { getCollection } from 'astro:content'
import { existsSync } from 'node:fs'
import type { APIRoute } from 'astro'
import { lastModified } from '../../scripts/page-lastmod.mjs'

// Files that are a page's content although they are not its source: the
// numbers these pages print come from the conformance snapshot, which changes
// far more often than the pages do. A component or layout shared across the
// site does not belong here, since it would redate every page and leave
// `<lastmod>` saying nothing (see page-lastmod.mjs).
const snapshot = '../../packages/tailwind-conformance/snapshot.json'
const content: Record<string, string[]> = {
  conformance: [snapshot, 'src/components/conformance/ConformancePage.tsx'],
  stylex: [snapshot],
  svg: [snapshot],
  tailwind: [snapshot],
}

// A renamed page or a moved file would otherwise drop out of the dates
// without a word, and the page would quietly stop being redated.
for (const [name, files] of Object.entries(content)) {
  for (const file of [`src/pages/${name}.astro`, ...files]) {
    if (!existsSync(file)) throw new Error(`sitemap: ${name} lists ${file}, which does not exist`)
  }
}

// Each page with the files it is built from, relative to the package (the
// working directory of `astro build`).
const pages = Object.keys(import.meta.glob('./*.astro')).map((file) => {
  const name = file.replace(/^\.\//, '').replace(/\.astro$/, '')
  return {
    page: name === 'index' ? '' : `${name}/`,
    sources: [`src/pages/${name}.astro`, ...(content[name] ?? [])],
  }
})

export const GET: APIRoute = async ({ site }) => {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '')
  // Starlight's ids are the file paths: `docs/index` is `/docs/`.
  const docs = (await getCollection('docs')).map((entry) => ({
    page: `${entry.id.replace(/(^|\/)index$/, '')}/`.replace(/^\/$/, ''),
    sources: entry.filePath ? [entry.filePath] : [],
  }))
  const all = [...pages, ...docs]
  // Each file's last commit. Empty in a shallow clone, and then every
  // `<lastmod>` is left out (see page-lastmod.mjs for why).
  const dates: Map<string, string> = lastModified([...new Set(all.flatMap((p) => p.sources))])
  // A page changed when the newest of its files did. The dates carry
  // different offsets, so they are compared as instants, not as text.
  const newest = (sources: string[]) =>
    sources
      .map((source) => dates.get(source))
      .filter((date): date is string => date !== undefined)
      .reduce<string | undefined>(
        (best, date) => (best === undefined || Date.parse(date) > Date.parse(best) ? date : best),
        undefined,
      )
  const urls = all
    .sort((a, b) => (a.page < b.page ? -1 : a.page > b.page ? 1 : 0))
    .map(({ page, sources }) => {
      const loc = new URL(`${base}/${page}`, site).href
      const date = newest(sources)
      return `  <url><loc>${loc}</loc>${date ? `<lastmod>${date}</lastmod>` : ''}</url>`
    })
    .join('\n')
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`,
    { headers: { 'Content-Type': 'application/xml; charset=utf-8' } },
  )
}
