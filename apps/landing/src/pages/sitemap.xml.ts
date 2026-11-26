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
import type { APIRoute } from 'astro'
import { lastModified } from '../../scripts/page-lastmod.mjs'

// Each page with the source file it is built from, relative to the package
// (the working directory of `astro build`).
const pages = Object.keys(import.meta.glob('./*.astro')).map((file) => {
  const name = file.replace(/^\.\//, '').replace(/\.astro$/, '')
  return { page: name === 'index' ? '' : `${name}/`, source: `src/pages/${name}.astro` }
})

export const GET: APIRoute = async ({ site }) => {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '')
  // Starlight's ids are the file paths: `docs/index` is `/docs/`.
  const docs = (await getCollection('docs')).map((entry) => ({
    page: `${entry.id.replace(/(^|\/)index$/, '')}/`.replace(/^\/$/, ''),
    source: entry.filePath,
  }))
  const all = [...pages, ...docs]
  // Each page's source's last commit. Empty in a shallow clone, and then
  // every `<lastmod>` is left out (see page-lastmod.mjs for why).
  const dates: Map<string, string> = lastModified(
    all.flatMap(({ source }) => (source ? [source] : [])),
  )
  const urls = all
    .sort((a, b) => (a.page < b.page ? -1 : a.page > b.page ? 1 : 0))
    .map(({ page, source }) => {
      const loc = new URL(`${base}/${page}`, site).href
      const date = source ? dates.get(source) : undefined
      return `  <url><loc>${loc}</loc>${date ? `<lastmod>${date}</lastmod>` : ''}</url>`
    })
    .join('\n')
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`,
    { headers: { 'Content-Type': 'application/xml; charset=utf-8' } },
  )
}
